import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

import {caseBundleSchema} from "../../src/features/cases/caseBundle";
import {localToMapPoint} from "../../src/features/cases/displayTransform";
import {
  buildDynamicScene,
  buildTimedPath
} from "../../src/features/dynamic-replanning/buildDynamicScene";
import {decisionTraceV1Schema} from "../../src/features/dynamic-replanning/decisionTraceSchema";
import {
  type LoadedDynamicScenePackage,
  sceneConfigSchema,
  sceneProvenanceSchema
} from "../../src/features/dynamic-replanning/dynamicSceneSchema";
import {
  failureReportSchema,
  missionViewV1Schema
} from "../../src/features/dynamic-replanning/missionViewSchema";
import {
  decisionTraceFixture,
  failureReportFixture,
  missionViewFixture,
  sceneConfigFixture,
  sceneProvenanceFixture
} from "../fixtures/task2MissionViewFixture";

const baseline = caseBundleSchema.parse(JSON.parse(readFileSync(resolve(
  "public/data/integration-cases/R01-BASELINE-01/bundle.json"
), "utf8")));

function loadedPackage(
  view: unknown = missionViewFixture
): LoadedDynamicScenePackage {
  return {
    config: sceneConfigSchema.parse(sceneConfigFixture),
    baseline,
    view: missionViewV1Schema.parse(view),
    decisionTrace: decisionTraceV1Schema.parse(decisionTraceFixture),
    failureReport: null,
    provenance: sceneProvenanceSchema.parse(sceneProvenanceFixture)
  };
}

describe("buildDynamicScene", () => {
  it("projects local Task 2 points through the baseline display transform", () => {
    const scene = buildDynamicScene(loadedPackage());
    const first = scene.activePaths[0].timedPath[0];
    const point =
      missionViewFixture.trajectories[0].segments[0].localPath[0];
    expect(first.slice(0, 3)).toEqual(localToMapPoint(
      [point.xM, point.yM, point.zM],
      baseline.displayTransform
    ));
  });

  it("distributes point time by cumulative local distance", () => {
    expect(buildTimedPath(
      [[0, 0, 10], [3, 0, 10], [3, 4, 10]],
      baseline.displayTransform,
      10,
      24
    ).map(point => point[3])).toEqual([10, 16, 24]);
  });

  it("ignores mapPath when the Task 2 view has no map CRS", () => {
    const trajectory = missionViewFixture.trajectories[0];
    const segment = trajectory.segments[0];
    const scene = buildDynamicScene(loadedPackage({
      ...missionViewFixture,
      trajectories: [{
        ...trajectory,
        segments: [{
          ...segment,
          mapPath: [[-1, -1, -1], [-2, -2, -2]]
        }]
      }]
    }));
    expect(scene.activePaths[0].timedPath[0].slice(0, 3))
      .not.toEqual([-1, -1, -1]);
  });

  it("rejects mismatched cases and broken references", () => {
    expect(() => buildDynamicScene(loadedPackage({
      ...missionViewFixture,
      mission: {...missionViewFixture.mission, caseId: "OTHER"}
    }))).toThrow("baseline caseId does not match mission view caseId");

    const trajectory = missionViewFixture.trajectories[0];
    const segment = trajectory.segments[0];
    expect(() => buildDynamicScene(loadedPackage({
      ...missionViewFixture,
      trajectories: [{
        ...trajectory,
        segments: [{...segment, taskId: "UNKNOWN"}]
      }]
    }))).toThrow(/task references unknown UNKNOWN/u);
  });

  it("requires a safe-fallback report when status is partial", () => {
    const partialView = {
      ...missionViewFixture,
      activePlan: {
        ...missionViewFixture.activePlan,
        planStatus: "PARTIAL_SAFE_FALLBACK"
      }
    };
    const value = loadedPackage(partialView);
    value.config = sceneConfigSchema.parse({
      ...sceneConfigFixture,
      resultStatus: "PARTIAL_SAFE_FALLBACK"
    });
    value.decisionTrace = decisionTraceV1Schema.parse({
      ...decisionTraceFixture,
      attemptId: failureReportFixture.attemptId,
      resultStatus: "PARTIAL_SAFE_FALLBACK",
      publication: {
        ...decisionTraceFixture.publication,
        planStatus: "PARTIAL_SAFE_FALLBACK",
        failureReportPath: "failure_report.json"
      }
    });
    expect(() => buildDynamicScene(value)).toThrow(/failure report/u);

    value.failureReport = failureReportSchema.parse(failureReportFixture);
    expect(buildDynamicScene(value).failureReport).not.toBeNull();
  });
});
