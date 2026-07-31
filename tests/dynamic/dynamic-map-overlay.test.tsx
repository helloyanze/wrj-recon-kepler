// @vitest-environment node
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

import {
  createMissionOverlayLayers
} from "../../src/components/kepler/UavMapContainer";
import {caseBundleSchema} from "../../src/features/cases/caseBundle";
import {buildDynamicScene} from "../../src/features/dynamic-replanning/buildDynamicScene";
import {decisionTraceV1Schema} from "../../src/features/dynamic-replanning/decisionTraceSchema";
import type {
  DynamicPlaybackState
} from "../../src/features/dynamic-replanning/dynamicPlayback";
import {
  sceneConfigSchema,
  sceneProvenanceSchema
} from "../../src/features/dynamic-replanning/dynamicSceneSchema";
import {missionViewV1Schema} from "../../src/features/dynamic-replanning/missionViewSchema";
import {
  createDefaultMissionLayerPreferences
} from "../../src/features/mission/missionLayerPreferences";
import {
  decisionTraceFixture,
  missionViewFixture,
  sceneConfigFixture,
  sceneProvenanceFixture
} from "../fixtures/task2MissionViewFixture";

const baseline = caseBundleSchema.parse(JSON.parse(readFileSync(resolve(
  "public/data/integration-cases/R01-BASELINE-01/bundle.json"
), "utf8")));
const scene = buildDynamicScene({
  config: sceneConfigSchema.parse(sceneConfigFixture),
  baseline,
  view: missionViewV1Schema.parse(missionViewFixture),
  decisionTrace: decisionTraceV1Schema.parse(decisionTraceFixture),
  failureReport: null,
  provenance: sceneProvenanceSchema.parse(sceneProvenanceFixture)
});
const playback: DynamicPlaybackState = {
  phase: "ACTIVE_PLAN_RUNNING",
  missionTimeSec: 110,
  presentationElapsedMs: 0,
  playing: false,
  rate: 1,
  automaticCamera: true
};
const preferences = createDefaultMissionLayerPreferences(
  baseline.case.caseId,
  baseline.case.planId,
  baseline.assignments.map(assignment => assignment.uavId),
  baseline.strips
);

describe("dynamic map overlay", () => {
  it("uses dynamic layers when a Task 2 overlay is present", () => {
    const layers = createMissionOverlayLayers({
      bundle: null,
      missionTimeSec: 0,
      verticalScale: 1,
      preferences: null,
      dynamic: {scene, playback, verticalScale: 1}
    });
    expect(layers.some(
      layer => layer.id === "wrj-task2-active-paths"
    )).toBe(true);
    expect(layers.some(
      layer => layer.id === "wrj-algorithm-routes"
    )).toBe(false);
  });

  it("preserves the existing Task 1 overlay behavior", () => {
    const layers = createMissionOverlayLayers({
      bundle: baseline,
      missionTimeSec: 0,
      verticalScale: 1,
      preferences,
      dynamic: null
    });
    expect(layers.some(
      layer => layer.id === "wrj-algorithm-routes"
    )).toBe(true);
  });

  it("rejects simultaneous static and dynamic overlays", () => {
    expect(() => createMissionOverlayLayers({
      bundle: baseline,
      missionTimeSec: 0,
      verticalScale: 1,
      preferences,
      dynamic: {scene, playback, verticalScale: 1}
    })).toThrow(/both static and dynamic/u);
  });
});
