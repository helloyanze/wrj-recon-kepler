import {readFileSync} from "node:fs";
import {join} from "node:path";
import {describe, expect, it} from "vitest";
import {
  caseBundleSchema,
  type CaseBundleV2
} from "../../src/features/cases/caseBundle";
import {
  caseCatalogSchema
} from "../../src/features/cases/catalogSchema";
import {
  selectSortieStates
} from "../../src/features/mission/missionInterpolation";

const DATA_ROOT = join(process.cwd(), "public", "data", "integration-cases");
const R10_CASE_ID = "R10-LONG-TRANSIT-01";

const catalog = caseCatalogSchema.parse(
  JSON.parse(readFileSync(join(DATA_ROOT, "catalog.json"), "utf8"))
);
const bundle: CaseBundleV2 = caseBundleSchema.parse(
  JSON.parse(readFileSync(
    join(DATA_ROOT, R10_CASE_ID, "bundle.json"),
    "utf8"
  ))
);

describe("committed algorithm case catalog", () => {
  it("ships all 16 latest valid cases with R10 selected by default", () => {
    expect(catalog.defaultCaseId).toBe(R10_CASE_ID);
    expect(catalog.cases).toHaveLength(16);
    expect(new Set(catalog.cases.map(({caseId}) => caseId)).size).toBe(16);
    expect(catalog.cases.find(({caseId}) => caseId === R10_CASE_ID)?.runId)
      .toBe("20260903T155330");
  });

  it("keeps the R10 catalog metrics synchronized with its parsed bundle", () => {
    const entry = catalog.cases.find(({caseId}) => caseId === R10_CASE_ID);

    expect(entry).toBeDefined();
    expect(entry?.metrics).toEqual({
      uavCount: bundle.metrics.uavCount,
      sortieCount: bundle.metrics.sortieCount,
      batchCount: bundle.metrics.batchCount,
      stripCount: bundle.metrics.stripCount,
      missionMakespanSec: bundle.metrics.missionMakespanSec
    });
  });
});

describe("committed R10 mission bundle", () => {
  it("parses through the complete CaseBundleV2 runtime contract", () => {
    expect(bundle.case.caseId).toBe(R10_CASE_ID);
    expect(bundle.validation).toMatchObject({
      valid: true,
      failureCodes: []
    });
  });

  it("preserves the authoritative R10 mission metrics", () => {
    expect(bundle.metrics).toMatchObject({
      uavCount: 3,
      sortieCount: 6,
      batchCount: 2,
      stripCount: 20
    });
    expect(bundle.metrics.missionMakespanSec).toBeCloseTo(2_375.629, 3);
  });

  it("preserves exact algorithm launch order and telemetry maxima", () => {
    const launchTimes = [
      ...new Set(bundle.sorties.map(({plannedLaunchTimeSec}) =>
        plannedLaunchTimeSec
      ))
    ].sort((left, right) => left - right);
    const segments = bundle.sorties.flatMap(({segments}) => segments);
    const maximumHeightM = Math.max(
      ...segments.flatMap(({timedPath}) =>
        timedPath.map(([, , altitudeM]) => altitudeM)
      )
    );
    const maximumSpeedMps = Math.max(
      ...segments.map(({speedMps}) => speedMps)
    );

    expect(launchTimes).toHaveLength(2);
    expect(launchTimes[0]).toBe(0);
    expect(launchTimes[1]).toBeCloseTo(1_202.493, 3);
    expect(maximumHeightM).toBeCloseTo(2_800, 6);
    expect(maximumSpeedMps).toBeCloseTo(223.642, 3);
  });

  it("assigns each of the 20 strips to exactly one sortie owner", () => {
    const stripIds = bundle.strips.map(({stripId}) => stripId);

    expect(new Set(stripIds).size).toBe(20);
    for (const strip of bundle.strips) {
      const owners = bundle.sorties.filter(sortie =>
        sortie.assignmentId === strip.assignmentId &&
        sortie.uavId === strip.uavId &&
        sortie.stripIds.includes(strip.stripId)
      );
      expect(owners, strip.stripId).toHaveLength(1);
    }
  });

  it("keeps every sortie within makespan and every timed path monotonic", () => {
    for (const sortie of bundle.sorties) {
      const endTimeSec = sortie.segments.at(-1)?.endTimeSec;
      expect(endTimeSec).toBeDefined();
      expect(endTimeSec as number).toBeLessThanOrEqual(
        bundle.metrics.missionMakespanSec + 1e-3
      );

      for (const segment of sortie.segments) {
        for (let index = 1; index < segment.timedPath.length; index += 1) {
          expect(
            segment.timedPath[index][3],
            `${sortie.assignmentId}/${segment.segmentId}/${index}`
          ).toBeGreaterThanOrEqual(segment.timedPath[index - 1][3]);
        }
      }
    }
  });

  it("drives triangle visibility from the three authoritative batch times", () => {
    const flyingAt = (missionTimeSec: number): number =>
      selectSortieStates(bundle.sorties, missionTimeSec)
        .filter(({status}) => status === "flying")
        .length;

    expect(flyingAt(-1)).toBe(0);
    expect(flyingAt(0)).toBe(3);
    expect(flyingAt(1_202.4)).toBe(0);
    const secondBatchLaunch = bundle.sorties
      .find(({batchIndex}) => batchIndex === 1)?.plannedLaunchTimeSec;
    expect(secondBatchLaunch).toBeDefined();
    expect(flyingAt(secondBatchLaunch as number)).toBe(3);

    const finalSortieEnd = Math.max(
      ...bundle.sorties.map(sortie => sortie.segments.at(-1)?.endTimeSec ?? 0)
    );

    expect(
      selectSortieStates(bundle.sorties, finalSortieEnd)
        .filter(({status}) => status === "landed")
    ).toHaveLength(2);
    expect(
      selectSortieStates(
        bundle.sorties,
        finalSortieEnd + 3
      ).every(({status}) => status === "completed")
    ).toBe(true);
  });
});
