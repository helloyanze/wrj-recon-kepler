import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

import {caseBundleSchema} from "../../src/features/cases/caseBundle";
import {buildDynamicScene} from "../../src/features/dynamic-replanning/buildDynamicScene";
import {decisionTraceV1Schema} from "../../src/features/dynamic-replanning/decisionTraceSchema";
import {
  advanceDynamicPlayback,
  createDynamicPlayback,
  disableAutomaticCamera,
  playDynamicPlayback,
  restartDynamicPlayback,
  seekDynamicPlayback
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

describe("dynamic playback", () => {
  it("freezes mission time while presentation phases advance", () => {
    let state = createDynamicPlayback(scene);
    state = playDynamicPlayback(state);
    state = advanceDynamicPlayback(state, 15_000, scene);
    expect(state.phase).toBe("EVENT_ALERT");
    expect(state.missionTimeSec).toBe(scene.eventTimeSec);
    state = advanceDynamicPlayback(
      state,
      scene.config.playback.eventAlertMs,
      scene
    );
    expect(state.phase).toBe("IMPACT_REVEAL");
    expect(state.missionTimeSec).toBe(scene.eventTimeSec);
  });

  it("carries overflow through presentation phase boundaries", () => {
    let state = playDynamicPlayback(createDynamicPlayback(scene));
    const elapsed = 15_000 +
      scene.config.playback.eventAlertMs +
      scene.config.playback.impactRevealMs +
      100;
    state = advanceDynamicPlayback(state, elapsed, scene);
    expect(state).toMatchObject({
      phase: "REPLAN_EXPLAINER",
      missionTimeSec: scene.eventTimeSec,
      presentationElapsedMs: 100
    });
  });

  it("seek reconstructs baseline or active state without replaying alerts", () => {
    expect(seekDynamicPlayback(
      createDynamicPlayback(scene),
      50,
      scene
    ).phase).toBe("BASELINE_RUNNING");
    expect(seekDynamicPlayback(
      createDynamicPlayback(scene),
      500,
      scene
    ).phase).toBe("ACTIVE_PLAN_RUNNING");
  });

  it("restart restores READY and automatic camera", () => {
    const restarted = restartDynamicPlayback(
      disableAutomaticCamera(createDynamicPlayback(scene)),
      scene
    );
    expect(restarted.phase).toBe("READY");
    expect(restarted.automaticCamera).toBe(true);
  });
});
