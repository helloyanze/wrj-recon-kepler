import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

import {caseBundleSchema} from "../../src/features/cases/caseBundle";
import {buildDynamicScene} from "../../src/features/dynamic-replanning/buildDynamicScene";
import {
  automaticDecisionStageIndex,
  isPlanPublished
} from "../../src/features/dynamic-replanning/decisionPresentation";
import {decisionTraceV1Schema} from "../../src/features/dynamic-replanning/decisionTraceSchema";
import type {
  DynamicPlaybackPhase,
  DynamicPlaybackState
} from "../../src/features/dynamic-replanning/dynamicPlayback";
import {
  sceneConfigSchema,
  sceneProvenanceSchema
} from "../../src/features/dynamic-replanning/dynamicSceneSchema";
import {missionViewV1Schema} from "../../src/features/dynamic-replanning/missionViewSchema";
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

function playback(
  phase: DynamicPlaybackPhase,
  presentationElapsedMs = 0
): DynamicPlaybackState {
  return {
    phase,
    missionTimeSec: scene.eventTimeSec,
    presentationElapsedMs,
    playing: true,
    rate: 1,
    automaticCamera: true
  };
}

describe("decision presentation", () => {
  it("maps the frozen presentation to all seven backend stages", () => {
    expect(automaticDecisionStageIndex(playback("EVENT_ALERT"), scene)).toBe(0);
    expect(automaticDecisionStageIndex(
      playback("IMPACT_REVEAL", scene.config.playback.impactRevealMs),
      scene
    )).toBe(2);
    expect(automaticDecisionStageIndex(
      playback("REPLAN_EXPLAINER", 0),
      scene
    )).toBe(3);
    expect(automaticDecisionStageIndex(
      playback(
        "REPLAN_EXPLAINER",
        scene.config.playback.replanExplainerMs
      ),
      scene
    )).toBe(5);
    expect(automaticDecisionStageIndex(
      playback("PLAN_TRANSITION"),
      scene
    )).toBe(6);
  });

  it("does not expose publication state before the publication phase", () => {
    expect(isPlanPublished(playback("REPLAN_EXPLAINER"))).toBe(false);
    expect(isPlanPublished(playback("PLAN_TRANSITION"))).toBe(true);
  });
});
