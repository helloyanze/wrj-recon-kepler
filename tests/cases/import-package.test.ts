// @vitest-environment node

import {strToU8, zipSync} from "fflate";
import {describe, expect, it} from "vitest";
import {
  ZIP_LIMITS,
  normalizeZipEntryPath,
  validateZipArchiveLimits,
  type ImportPackageResult,
  type ImportProgress,
  type ImportWorkerResponse,
  type ZipEntryMetadata,
  type ZipLimits
} from "../../src/features/cases/importPackage";
import {
  createImportWorkerMessageHandler,
  parseAlgorithmZipPackage,
  type AlgorithmZipParser
} from "../../src/features/cases/import.worker";
import {missionPlanFixture} from "../fixtures/missionPlanFixture";

const FIXED_IMPORT_TIME = "2026-07-24T08:00:00.000Z";

function jsonBytes(value: unknown): Uint8Array {
  return strToU8(JSON.stringify(value));
}

function makeZip(
  entries: Record<string, Uint8Array>,
  level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 = 6
): Uint8Array {
  return zipSync(Object.fromEntries(
    Object.entries(entries).map(([path, bytes]) => [
      path,
      [bytes, {level}]
    ])
  ));
}

function makeMissionZip(
  path = "CASE-0001/20260724T080000/mission_plan.json",
  missionPlan: unknown = missionPlanFixture,
  extras: Record<string, Uint8Array> = {}
): Uint8Array {
  return makeZip({
    [path]: jsonBytes(missionPlan),
    ...extras
  });
}

async function parse(
  bytes: Uint8Array,
  fileName = "algorithm-output.zip"
): Promise<ImportPackageResult> {
  return parseAlgorithmZipPackage(bytes, fileName, {
    now: () => new Date(FIXED_IMPORT_TIME)
  });
}

function addSecondSortieWithOverlap(
  overlapSec: number
): typeof missionPlanFixture {
  const plan = structuredClone(missionPlanFixture);
  const strip = structuredClone(
    plan.assignmentPlan.stripPlanSnapshot.strips[0]
  );
  strip.stripId = "ST-0002";
  strip.index = 1;
  strip.start.yM += 300;
  strip.end.yM += 300;
  strip.coveragePolygon.forEach(point => {
    point.yM += 300;
  });
  plan.assignmentPlan.stripPlanSnapshot.strips.push(strip);
  plan.assignmentPlan.stripPlanSnapshot.stripCount = 2;

  const assignment = structuredClone(plan.assignmentPlan.assignments[0]);
  assignment.assignmentId = "ASG-0001-002";
  assignment.stripStartIndex = 1;
  assignment.stripEndIndex = 1;
  assignment.stripIds = ["ST-0002"];
  assignment.plannedLaunchTimeSec = 52 - overlapSec;
  assignment.batchIndex = 1;
  assignment.routeEstimateId = "RTE-0002";
  plan.assignmentPlan.assignments.push(assignment);

  const trajectory = structuredClone(plan.trajectories[0]);
  trajectory.trajectoryId = "TRJ-0002";
  trajectory.assignmentId = assignment.assignmentId;
  trajectory.segments.forEach((segment, index) => {
    segment.segmentId = `SEG-0002-${index + 1}`;
    segment.geometry.coordinates.forEach(coordinate => {
      coordinate[1] += 300;
    });
    segment.startPoint.yM += 300;
    segment.endPoint.yM += 300;
    if (segment.stripId !== null) {
      segment.stripId = "ST-0002";
    }
  });
  plan.trajectories.push(trajectory);
  plan.missionMakespanSec =
    assignment.plannedLaunchTimeSec + trajectory.totalDurationSec;
  plan.totalDistanceM += trajectory.totalDistanceM;
  if (plan.totalFuelKg !== null && trajectory.totalFuelKg !== null) {
    plan.totalFuelKg += trajectory.totalFuelKg;
  }
  return plan;
}

function metadata(
  path: string,
  uncompressedBytes: number,
  compressedBytes = uncompressedBytes
): ZipEntryMetadata {
  return {
    path,
    normalizedPath: path,
    compressedBytes,
    uncompressedBytes,
    directory: false,
    unixMode: 0
  };
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function changeDeclaredUncompressedSize(
  source: Uint8Array,
  replacement: number
): Uint8Array {
  const bytes = source.slice();
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength
  );
  let localChanged = false;
  let centralChanged = false;
  for (let offset = 0; offset <= bytes.byteLength - 4; offset += 1) {
    const signature = view.getUint32(offset, true);
    if (signature === 0x04034b50 && !localChanged) {
      view.setUint32(
        offset + 22,
        replacement,
        true
      );
      localChanged = true;
    } else if (signature === 0x02014b50 && !centralChanged) {
      view.setUint32(
        offset + 24,
        replacement,
        true
      );
      centralChanged = true;
    }
  }
  expect(localChanged).toBe(true);
  expect(centralChanged).toBe(true);
  return bytes;
}

describe("algorithm ZIP package parsing", () => {
  it("exports the exact archive limits", () => {
    expect(ZIP_LIMITS).toEqual({
      compressedBytes: 100 * 1024 * 1024,
      uncompressedBytes: 250 * 1024 * 1024,
      fileCount: 2_000,
      singleFileBytes: 50 * 1024 * 1024
    });
  });

  it("converts one nested mission plan and returns its complete preview", async () => {
    const bytes = makeMissionZip();
    const result = await parse(bytes);

    expect(result.preview).toEqual({
      caseId: "CASE-0001",
      uavCount: 1,
      sortieCount: 1,
      batchCount: 1,
      stripCount: 1,
      durationSec: 52,
      warnings: []
    });
    expect(result.bundle.provenance).toMatchObject({
      sourceName:
        "algorithm-output.zip#CASE-0001/20260724T080000/mission_plan.json",
      sourceRun: "20260724T080000",
      importedAt: FIXED_IMPORT_TIME
    });
    const expectedDigest = await globalThis.crypto.subtle.digest(
      "SHA-256",
      bytes
    );
    expect(result.bundle.provenance.sha256).toBe(
      [...new Uint8Array(expectedDigest)]
        .map(value => value.toString(16).padStart(2, "0"))
        .join("")
    );
  });

  it("uses the actual ZIP filename as sourceRun for a root mission plan", async () => {
    const result = await parse(
      makeMissionZip("mission_plan.json"),
      "operator-run.zip"
    );

    expect(result.bundle.provenance).toMatchObject({
      sourceName: "operator-run.zip#mission_plan.json",
      sourceRun: "operator-run.zip",
      importedAt: FIXED_IMPORT_TIME
    });
  });

  it("accepts the four optional run files and passes the region profile to conversion", async () => {
    const prefix = "CASE-0001/20260724T080000";
    const result = await parse(makeMissionZip(
      `${prefix}/mission_plan.json`,
      missionPlanFixture,
      {
        [`${prefix}/score_report.json`]: jsonBytes({score: 98}),
        [`${prefix}/validation_report.json`]: jsonBytes({valid: true}),
        [`${prefix}/trajectories.geojson`]: jsonBytes({
          type: "FeatureCollection",
          features: []
        }),
        [`${prefix}/intermediate/region_profile.json`]: jsonBytes({
          geometryWkt:
            "POLYGON ((0 0, 600 0, 600 400, 0 400, 0 0))"
        }),
        "__MACOSX/._mission_plan.json": strToU8("ignored"),
        [`${prefix}/.DS_Store`]: strToU8("ignored")
      }
    ));

    expect(result.bundle.region.source).toBe("REGION_PROFILE");
  });

  it("recursively discovers optional metadata by basename at unrelated depths", async () => {
    const result = await parse(makeMissionZip(
      "wrapper/case/run/mission_plan.json",
      missionPlanFixture,
      {
        "reports/archive/score_report.json": jsonBytes({score: 98}),
        "validation/deep/validation_report.json": jsonBytes({valid: true}),
        "geometry/export/trajectories.geojson": jsonBytes({
          type: "FeatureCollection",
          features: []
        }),
        "profiles/v2/region_profile.json": jsonBytes({
          geometryWkt:
            "POLYGON ((0 0, 600 0, 600 400, 0 400, 0 0))"
        })
      }
    ));

    expect(result.bundle.region.source).toBe("REGION_PROFILE");
  });

  it.each([
    "score_report.json",
    "validation_report.json",
    "trajectories.geojson"
  ])("reads a recursively discovered %s instead of silently ignoring it", async fileName => {
    await expect(parse(makeMissionZip(
      "run/mission_plan.json",
      missionPlanFixture,
      {
        [`metadata/deep/${fileName}`]: strToU8("{ invalid")
      }
    ))).rejects.toThrow(
      new RegExp(`metadata/deep/${fileName.replace(".", "\\.")}.*invalid JSON`, "i")
    );
  });

  it.each([
    "score_report.json",
    "validation_report.json",
    "trajectories.geojson",
    "region_profile.json"
  ])("rejects ambiguous recursive %s matches and lists sorted paths", async fileName => {
    await expect(parse(makeMissionZip(
      "run/mission_plan.json",
      missionPlanFixture,
      {
        [`z-last/${fileName}`]: jsonBytes({}),
        [`a-first/deep/${fileName}`]: jsonBytes({})
      }
    ))).rejects.toThrow(
      new RegExp(
        `ambiguous.*${fileName.replace(".", "\\.")}.*` +
        `a-first/deep/${fileName.replace(".", "\\.")}.*` +
        `z-last/${fileName.replace(".", "\\.")}`,
        "i"
      )
    );
  });

  it("requires exactly one non-OS mission_plan.json", async () => {
    await expect(parse(makeZip({
      "run/score_report.json": jsonBytes({})
    }))).rejects.toThrow(/exactly one.*mission_plan\.json/i);

    await expect(parse(makeZip({
      "run-a/mission_plan.json": jsonBytes(missionPlanFixture),
      "run-b/mission_plan.json": jsonBytes(missionPlanFixture)
    }))).rejects.toThrow(/exactly one.*mission_plan\.json/i);
  });

  it("normalizes backslashes but rejects unsafe and ambiguous paths", () => {
    expect(normalizeZipEntryPath("case\\run\\mission_plan.json"))
      .toBe("case/run/mission_plan.json");

    for (const path of [
      "../mission_plan.json",
      "run/../mission_plan.json",
      "run/./mission_plan.json",
      "/run/mission_plan.json",
      "\\\\server\\share\\mission_plan.json",
      "C:\\run\\mission_plan.json",
      "C:run/mission_plan.json",
      "run/\0mission_plan.json",
      "run//mission_plan.json"
    ]) {
      expect(
        () => normalizeZipEntryPath(path),
        `expected ${JSON.stringify(path)} to be rejected`
      ).toThrow(/unsafe|path|traversal|absolute|drive|NUL/i);
    }
  });

  it("rejects traversal and duplicate normalized paths before extraction", async () => {
    await expect(parse(makeZip({
      "../mission_plan.json": jsonBytes(missionPlanFixture)
    }))).rejects.toThrow(/unsafe|traversal/i);

    await expect(parse(makeZip({
      "run/mission_plan.json": jsonBytes(missionPlanFixture),
      "run\\mission_plan.json": jsonBytes(missionPlanFixture)
    }))).rejects.toThrow(/duplicate.*run\/mission_plan\.json/i);
  });

  it("rejects symlink-like central-directory entries", async () => {
    const bytes = makeMissionZip();
    const view = new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength
    );
    let centralOffset = -1;
    for (let index = 0; index <= bytes.byteLength - 4; index += 1) {
      if (view.getUint32(index, true) === 0x02014b50) {
        centralOffset = index;
        break;
      }
    }
    expect(centralOffset).toBeGreaterThanOrEqual(0);
    view.setUint32(
      centralOffset + 38,
      (0o120777 << 16) >>> 0,
      true
    );

    await expect(parse(bytes)).rejects.toThrow(/symbolic link|symlink/i);
  });

  it("validates synthetic metadata limits without allocating large buffers", () => {
    const smallLimits: ZipLimits = {
      compressedBytes: 100,
      uncompressedBytes: 250,
      fileCount: 2,
      singleFileBytes: 50
    };
    expect(() => validateZipArchiveLimits(
      101,
      [metadata("mission_plan.json", 1)],
      smallLimits
    )).toThrow(/compressed.*100/i);
    expect(() => validateZipArchiveLimits(
      1,
      [
        metadata("a", 1),
        metadata("b", 1),
        metadata("mission_plan.json", 1)
      ],
      smallLimits
    )).toThrow(/file count.*2/i);
    expect(() => validateZipArchiveLimits(
      1,
      [metadata("mission_plan.json", 51)],
      smallLimits
    )).toThrow(/single.*50|mission_plan.*50/i);
    expect(() => validateZipArchiveLimits(
      1,
      [
        metadata("mission_plan.json", 50),
        metadata("other.json", 201)
      ],
      {...smallLimits, singleFileBytes: 250}
    )).toThrow(/uncompressed.*250/i);
  });

  it("checks every limit before attempting mission JSON conversion", async () => {
    const invalidJsonZip = makeZip({
      "run/mission_plan.json": strToU8("{ definitely invalid")
    }, 0);

    await expect(parseAlgorithmZipPackage(
      invalidJsonZip,
      "too-big.zip",
      {
        limits: {
          ...ZIP_LIMITS,
          compressedBytes: invalidJsonZip.byteLength - 1
        }
      }
    )).rejects.toThrow(/compressed/i);
    await expect(parseAlgorithmZipPackage(
      invalidJsonZip,
      "too-many.zip",
      {limits: {...ZIP_LIMITS, fileCount: 0}}
    )).rejects.toThrow(/file count/i);
    await expect(parseAlgorithmZipPackage(
      invalidJsonZip,
      "single-too-big.zip",
      {limits: {...ZIP_LIMITS, singleFileBytes: 1}}
    )).rejects.toThrow(/single|mission_plan/i);
    await expect(parseAlgorithmZipPackage(
      invalidJsonZip,
      "total-too-big.zip",
      {
        limits: {
          ...ZIP_LIMITS,
          uncompressedBytes: 1,
          singleFileBytes: ZIP_LIMITS.singleFileBytes
        }
      }
    )).rejects.toThrow(/uncompressed/i);
  });

  it("rejects tampered central and local declared sizes before JSON conversion", async () => {
    const tampered = changeDeclaredUncompressedSize(
      makeMissionZip(),
      jsonBytes(missionPlanFixture).byteLength + 1
    );

    await expect(parse(tampered)).rejects.toThrow(
      /ZIP entry size mismatch.*mission_plan\.json.*declared.*extracted/i
    );
  });

  it("counts actual streamed output when forged headers claim a small file", async () => {
    const largeMissionPlan = {
      ...missionPlanFixture,
      padding: "x".repeat(32 * 1024)
    };
    const tampered = changeDeclaredUncompressedSize(
      makeMissionZip(
        "run/mission_plan.json",
        largeMissionPlan
      ),
      16
    );

    await expect(parseAlgorithmZipPackage(
      tampered,
      "forged-small-size.zip",
      {
        limits: {
          ...ZIP_LIMITS,
          singleFileBytes: 1_024,
          uncompressedBytes: 2_048
        }
      }
    )).rejects.toThrow(
      /actual uncompressed.*mission_plan\.json.*single.*1024|single.*1024.*actual/i
    );
  });

  it("stops when actual streamed files exceed the total output limit", async () => {
    const tampered = changeDeclaredUncompressedSize(makeZip({
      "run/mission_plan.json": jsonBytes(missionPlanFixture),
      "run/padding.bin": new Uint8Array(1_000)
    }, 0), 16);

    await expect(parseAlgorithmZipPackage(
      tampered,
      "forged-total-size.zip",
      {
        limits: {
          ...ZIP_LIMITS,
          singleFileBytes: 3_000,
          uncompressedBytes: 2_500
        }
      }
    )).rejects.toThrow(
      /actual uncompressed total.*2500.*padding\.bin/i
    );
  });

  it("throws a genuine AbortError before conversion", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(parseAlgorithmZipPackage(
      makeMissionZip(),
      "cancelled.zip",
      {signal: controller.signal}
    )).rejects.toMatchObject({
      name: "AbortError"
    });
  });

  it("warns and preserves an overlap up to one second for uploaded plans", async () => {
    const result = await parse(
      makeMissionZip(
        "R06/run/mission_plan.json",
        addSecondSortieWithOverlap(0.5)
      )
    );

    expect(result.bundle.sorties.map(sortie =>
      sortie.plannedLaunchTimeSec
    )).toEqual([0, 51.5]);
    expect(result.preview.warnings).toEqual([
      expect.stringMatching(/UAV_SCHEDULE_OVERLAP:.*0\.5.*preserved/i)
    ]);
  });

  it("still rejects uploaded plans overlapping by more than one second", async () => {
    await expect(parse(makeMissionZip(
      "R06/run/mission_plan.json",
      addSecondSortieWithOverlap(1.1)
    ))).rejects.toThrow(/overlap/i);
  });

  it("reports unzip, validate, and convert progress in order", async () => {
    const progress: ImportProgress[] = [];
    await parseAlgorithmZipPackage(makeMissionZip(), "progress.zip", {
      now: () => new Date(FIXED_IMPORT_TIME),
      onProgress: update => progress.push(update)
    });

    expect([...new Set(progress.map(update => update.stage))]).toEqual([
      "unzip",
      "validate",
      "convert"
    ]);
    expect(progress.every(update =>
      update.percent >= 0 && update.percent <= 100
    )).toBe(true);
  });
});

describe("import worker protocol", () => {
  it("forwards request-scoped progress with stage and percent for concurrent imports", async () => {
    const responses: ImportWorkerResponse[] = [];
    const handle = createImportWorkerMessageHandler(
      response => responses.push(response)
    );
    const firstBytes = makeMissionZip();
    const secondPlan = structuredClone(missionPlanFixture);
    secondPlan.caseId = "CASE-0002";
    secondPlan.planId = "PLAN-0002";
    const secondBytes = makeMissionZip(
      "other/run/mission_plan.json",
      secondPlan
    );

    await Promise.all([
      handle({
        type: "parse",
        requestId: "progress-a",
        fileName: "a.zip",
        bytes: copyToArrayBuffer(firstBytes)
      }),
      handle({
        type: "parse",
        requestId: "progress-b",
        fileName: "b.zip",
        bytes: copyToArrayBuffer(secondBytes)
      })
    ]);

    for (const requestId of ["progress-a", "progress-b"]) {
      const progress = responses.filter(
        (response): response is Extract<
          ImportWorkerResponse,
          {type: "progress"}
        > =>
          response.type === "progress" &&
          response.requestId === requestId
      );
      expect(progress.map(update => update.stage)).toEqual([
        "unzip",
        "unzip",
        "validate",
        "validate",
        "convert",
        "convert"
      ]);
      expect(progress.map(update => update.percent)).toEqual([
        0,
        35,
        45,
        65,
        75,
        100
      ]);
      expect(responses).toContainEqual(expect.objectContaining({
        type: "success",
        requestId
      }));
    }
    expect(responses.filter(response =>
      response.type === "progress" &&
      !["progress-a", "progress-b"].includes(response.requestId)
    )).toHaveLength(0);
  });

  it("never posts success after cancellation and keeps requests isolated", async () => {
    const responses: ImportWorkerResponse[] = [];
    const pending = new Map<
      string,
      {
        resolve: (value: ImportPackageResult) => void;
        signal: AbortSignal | undefined;
      }
    >();
    const parser = (
      _bytes: Uint8Array,
      fileName: string,
      options: {
        signal?: AbortSignal;
        onProgress?: (progress: ImportProgress) => void;
      } = {}
    ) => new Promise<ImportPackageResult>(resolve => {
      options.onProgress?.({stage: "unzip", percent: 10});
      pending.set(fileName, {resolve, signal: options.signal});
    });
    const handle = createImportWorkerMessageHandler(
      response => responses.push(response),
      parser
    );

    const cancelled = handle({
      type: "parse",
      requestId: "request-a",
      fileName: "a.zip",
      bytes: new ArrayBuffer(1)
    });
    const successful = handle({
      type: "parse",
      requestId: "request-b",
      fileName: "b.zip",
      bytes: new ArrayBuffer(1)
    });
    await handle({type: "cancel", requestId: "request-a"});

    const sample = await parse(makeMissionZip());
    expect(pending.get("a.zip")?.signal?.aborted).toBe(true);
    expect(pending.get("b.zip")?.signal?.aborted).toBe(false);
    pending.get("a.zip")?.resolve(sample);
    pending.get("b.zip")?.resolve(sample);
    await Promise.all([cancelled, successful]);

    expect(responses.some(response =>
      response.type === "success" &&
      response.requestId === "request-a"
    )).toBe(false);
    expect(responses).toContainEqual(expect.objectContaining({
      type: "success",
      requestId: "request-b"
    }));
  });

  it("cancels the real streaming parser during multi-chunk extraction", async () => {
    const responses: ImportWorkerResponse[] = [];
    const filler = new Uint8Array(64 * 1024);
    for (let index = 0; index < filler.length; index += 1) {
      filler[index] = (index * 31 + 17) % 251;
    }
    const bytes = makeZip({
      "run/mission_plan.json": jsonBytes(missionPlanFixture),
      "run/payload.bin": filler
    }, 0);
    let yieldCount = 0;
    let responseCountAfterCancel = -1;
    const realParser: AlgorithmZipParser = (
      input,
      fileName,
      options
    ) => parseAlgorithmZipPackage(input, fileName, {
      ...options,
      archiveChunkBytes: 128,
      yieldEveryChunks: 1,
      yieldControl: async () => {
        yieldCount += 1;
        if (yieldCount === 2) {
          await handle({type: "cancel", requestId: "real-cancel"});
          responseCountAfterCancel = responses.length;
        }
      }
    });
    const handle = createImportWorkerMessageHandler(
      response => responses.push(response),
      realParser
    );

    await handle({
      type: "parse",
      requestId: "real-cancel",
      fileName: "real-cancel.zip",
      bytes: copyToArrayBuffer(bytes)
    });

    expect(yieldCount).toBe(2);
    expect(responseCountAfterCancel).toBeGreaterThanOrEqual(1);
    expect(responses).toHaveLength(responseCountAfterCancel);
    expect(responses.some(response =>
      response.requestId === "real-cancel" &&
      (response.type === "success" || response.type === "failure")
    )).toBe(false);
  });

  it("suppresses stale duplicate-request results and returns readable failures", async () => {
    const responses: ImportWorkerResponse[] = [];
    const resolvers: Array<(value: ImportPackageResult) => void> = [];
    const sample = await parse(makeMissionZip());
    const handle = createImportWorkerMessageHandler(
      response => responses.push(response),
      () => new Promise<ImportPackageResult>(resolve => {
        resolvers.push(resolve);
      })
    );

    const stale = handle({
      type: "parse",
      requestId: "same-id",
      fileName: "old.zip",
      bytes: new ArrayBuffer(1)
    });
    const current = handle({
      type: "parse",
      requestId: "same-id",
      fileName: "new.zip",
      bytes: new ArrayBuffer(1)
    });
    resolvers[0](sample);
    resolvers[1](sample);
    await Promise.all([stale, current]);

    expect(responses.filter(response =>
      response.type === "success" && response.requestId === "same-id"
    )).toHaveLength(1);

    const failingResponses: ImportWorkerResponse[] = [];
    const failingHandle = createImportWorkerMessageHandler(
      response => failingResponses.push(response),
      async () => {
        throw new Error("mission_plan.json is malformed");
      }
    );
    await failingHandle({
      type: "parse",
      requestId: "failure-id",
      fileName: "bad.zip",
      bytes: new ArrayBuffer(1)
    });
    expect(failingResponses).toContainEqual({
      type: "failure",
      requestId: "failure-id",
      message: "mission_plan.json is malformed"
    });
  });
});
