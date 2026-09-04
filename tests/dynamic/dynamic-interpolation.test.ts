import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

import {caseBundleSchema} from "../../src/features/cases/caseBundle";
import {buildDynamicScene} from "../../src/features/dynamic-replanning/buildDynamicScene";
import {decisionTraceV1Schema} from "../../src/features/dynamic-replanning/decisionTraceSchema";
import {
  selectDynamicResourceStates
} from "../../src/features/dynamic-replanning/dynamicInterpolation";
import type {
  DynamicPlaybackState
} from "../../src/features/dynamic-replanning/dynamicPlayback";
import {
  sceneConfigSchema,
  sceneProvenanceSchema
} from "../../src/features/dynamic-replanning/dynamicSceneSchema";
import {missionViewV1Schema} from "../../src/features/dynamic-replanning/missionViewSchema";
import {
  decisionTraceFixture,
  dynamicEventsFixture,
  missionViewFixture,
  sceneConfigFixture,
  sceneProvenanceFixture,
  taskGeometryDiffFixture
} from "../fixtures/task2MissionViewFixture";

// 该回归用基线被固定在旧 legacy ASG-0019 快照（R01-BASELINE-01 的
// PLAN-001 / 20260903T155426 产物），与可被后端刷新覆盖的 catalog bundle
// 解耦：catalog 里 R01-BASELINE-01 已切换为 v2（PLAN-V2-001）后，此场景的
// 基线航迹插值（t=110 → 2900 m / 140.097°）仍保持稳定。
const baseline = caseBundleSchema.parse(JSON.parse(readFileSync(resolve(
  "tests/fixtures/baselines/r01-baseline-asg0019.bundle.json"
), "utf8")));
const scene = buildDynamicScene({
  config: sceneConfigSchema.parse(sceneConfigFixture),
  baseline,
  view: missionViewV1Schema.parse(missionViewFixture),
  dynamicEvents: dynamicEventsFixture,
  geometryDiff: taskGeometryDiffFixture,
  decisionTrace: decisionTraceV1Schema.parse(decisionTraceFixture),
  failureReport: null,
  provenance: sceneProvenanceSchema.parse(sceneProvenanceFixture)
});

function playbackAt(missionTimeSec: number): DynamicPlaybackState {
  return {
    phase: "ACTIVE_PLAN_RUNNING",
    missionTimeSec,
    presentationElapsedMs: 0,
    playing: false,
    rate: 1,
    automaticCamera: true
  };
}

describe("dynamic resource interpolation", () => {
  it("freezes a lost resource at the event point", () => {
    const states = selectDynamicResourceStates(scene, playbackAt(500));
    expect(states.find(item =>
      item.resourceId === scene.primaryEvent.affectedObjectId
    )).toMatchObject({operationalState: "LOST", frozen: true});
  });

  it("interpolates an active Task 2 path and heading", () => {
    const [state] = selectDynamicResourceStates(scene, playbackAt(110));
    expect(state.position).not.toBeNull();
    expect(state.position?.[2]).toBe(2_900);
    expect(state.headingDeg).toBeCloseTo(140.097, 3);
  });
});
