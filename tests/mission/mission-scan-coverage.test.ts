import {describe, expect, it} from "vitest";
import type {
  CaseBundleV2,
  LocalPoint,
  TimedSegment
} from "../../src/features/cases/caseBundle";
import {
  localToMapPoint,
  mapToLocalPoint
} from "../../src/features/cases/displayTransform";
import {
  selectScannedCoverage
} from "../../src/features/mission/missionScanCoverage";

const displayTransform: CaseBundleV2["displayTransform"] = {
  anchorLongitude: 110.235,
  anchorLatitude: 18.625,
  sourceCenterXM: 0,
  sourceCenterYM: 0,
  xAxis: "EAST",
  yAxis: "NORTH"
};

const map = (point: LocalPoint) => localToMapPoint(point, displayTransform);

function coverageSegment(
  overrides: Partial<TimedSegment> = {}
): TimedSegment {
  return {
    segmentId: "SEG-01",
    segmentType: "COVERAGE_LINE",
    stripId: "ST-01",
    startTimeSec: 10,
    endTimeSec: 20,
    heightM: 100,
    speedMps: 10,
    distanceM: 100,
    fuelConsumptionKg: 1,
    localPath: [[0, 0, 100], [100, 0, 100]],
    mapPath: [map([0, 0, 100]), map([100, 0, 100])],
    timedPath: [
      [...map([0, 0, 100]), 10],
      [...map([100, 0, 100]), 20]
    ],
    ...overrides
  };
}

function makeBundle(segment = coverageSegment()): CaseBundleV2 {
  const stripPolygon = [
    map([-10, -5, 0]),
    map([110, -5, 0]),
    map([110, 5, 0]),
    map([-10, 5, 0]),
    map([-10, -5, 0])
  ];
  return {
    version: 2,
    case: {caseId: "R10", planId: "P10", displayName: "scan"},
    assignments: [{
      assignmentId: "ASG-01",
      uavId: "UAV-01",
      baseId: "BASE-01",
      flightCandidateId: "FPC-01",
      stripIds: ["ST-01"],
      stripStartIndex: 0,
      stripEndIndex: 0,
      batchIndex: 0,
      plannedLaunchTimeSec: 0
    }],
    sorties: [{
      trajectoryId: "TRJ-01",
      assignmentId: "ASG-01",
      uavId: "UAV-01",
      batchIndex: 0,
      plannedLaunchTimeSec: 0,
      stripIds: ["ST-01"],
      totalDistanceM: 100,
      totalDurationSec: 20,
      totalFuelKg: 1,
      segments: [segment],
      trip: segment.timedPath
    }],
    strips: [{
      stripId: "ST-01",
      index: 0,
      uavId: "UAV-01",
      assignmentId: "ASG-01",
      line: [map([0, 0, 0]), map([100, 0, 0])],
      polygon: stripPolygon
    }],
    region: {source: "DERIVED_FROM_STRIPS", polygon: stripPolygon},
    metrics: {
      uavCount: 1,
      sortieCount: 1,
      batchCount: 1,
      stripCount: 1,
      coverageRatio: 1,
      missionMakespanSec: 20,
      totalDistanceM: 100,
      totalFuelKg: 1
    },
    validation: {valid: true, warnings: [], failureCodes: []},
    displayTransform,
    provenance: {
      sourceName: "test",
      sourceRun: "test",
      importedAt: "2026-07-30T00:00:00.000Z",
      sha256: "a".repeat(64)
    }
  };
}

function localXs(bundle: CaseBundleV2, missionTimeSec: number): number[] {
  const coverage = selectScannedCoverage(bundle, missionTimeSec);
  return coverage[0]?.polygon.map(point =>
    mapToLocalPoint(point, displayTransform)[0]
  ) ?? [];
}

describe("selectScannedCoverage", () => {
  it("shows nothing before a coverage line and clips continuously at its start and midpoint", () => {
    const bundle = makeBundle();

    expect(selectScannedCoverage(bundle, 9.999)).toEqual([]);
    expect(Math.max(...localXs(bundle, 10))).toBeCloseTo(0, 6);
    expect(Math.max(...localXs(bundle, 15))).toBeCloseTo(50, 6);
  });

  it("returns the complete strip at the end and keeps it after completion", () => {
    const bundle = makeBundle();

    for (const time of [20, 25]) {
      const coverage = selectScannedCoverage(bundle, time);
      expect(coverage).toHaveLength(1);
      expect(coverage[0]).toMatchObject({
        assignmentId: "ASG-01",
        stripId: "ST-01",
        uavId: "UAV-01",
        polygon: bundle.strips[0].polygon
      });
    }
  });

  it("clips the correct side for a reverse coverage line", () => {
    const segment = coverageSegment({
      localPath: [[100, 0, 100], [0, 0, 100]],
      mapPath: [map([100, 0, 100]), map([0, 0, 100])],
      timedPath: [
        [...map([100, 0, 100]), 10],
        [...map([0, 0, 100]), 20]
      ]
    });
    const xs = localXs(makeBundle(segment), 15);

    expect(Math.min(...xs)).toBeCloseTo(50, 6);
    expect(Math.max(...xs)).toBeCloseTo(110, 6);
  });

  it("treats a zero-duration line as complete at its start", () => {
    const segment = coverageSegment({startTimeSec: 10, endTimeSec: 10});
    const bundle = makeBundle(segment);

    expect(selectScannedCoverage(bundle, 9.999)).toEqual([]);
    expect(selectScannedCoverage(bundle, 10)[0]?.polygon)
      .toEqual(bundle.strips[0].polygon);
  });

  it("skips unknown strips, non-coverage segments and degenerate active paths safely", () => {
    expect(selectScannedCoverage(
      makeBundle(coverageSegment({stripId: "missing"})),
      15
    )).toEqual([]);
    expect(selectScannedCoverage(
      makeBundle(coverageSegment({segmentType: "TURN"})),
      15
    )).toEqual([]);
    const degenerateBundle = makeBundle(coverageSegment({
      localPath: [[0, 0, 100], [0, 0, 100]]
    }));
    expect(selectScannedCoverage(degenerateBundle, 15)).toEqual([]);
    expect(selectScannedCoverage(degenerateBundle, 20)).toEqual([]);
    expect(selectScannedCoverage(degenerateBundle, 25)).toEqual([]);
  });

  it("uses per-vertex timestamps for a non-uniform multi-point path", () => {
    const segment = coverageSegment({
      localPath: [[0, 0, 100], [20, 0, 100], [100, 0, 100]],
      mapPath: [
        map([0, 0, 100]),
        map([20, 0, 100]),
        map([100, 0, 100])
      ],
      timedPath: [
        [...map([0, 0, 100]), 10],
        [...map([20, 0, 100]), 19],
        [...map([100, 0, 100]), 20]
      ]
    });

    expect(Math.max(...localXs(makeBundle(segment), 15)))
      .toBeCloseTo(100 / 9, 6);
  });

  it("deduplicates repeated coverage segments for one assignment and strip", () => {
    const bundle = makeBundle();
    bundle.sorties[0].segments = [
      coverageSegment({segmentId: "SEG-01"}),
      coverageSegment({segmentId: "SEG-02"})
    ];

    expect(selectScannedCoverage(bundle, 25)).toHaveLength(1);
  });

  it("rejects a non-finite mission time", () => {
    expect(() => selectScannedCoverage(makeBundle(), Number.NaN)).toThrow(
      /missionTimeSec/
    );
  });
});
