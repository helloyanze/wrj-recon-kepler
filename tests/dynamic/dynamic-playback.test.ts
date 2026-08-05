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
  pauseDynamicPlayback,
  playDynamicPlayback,
  restartDynamicPlayback,
  seekDynamicPlayback,
  type DynamicPlaybackState
} from "../../src/features/dynamic-replanning/dynamicPlayback";
import {
  parseDynamicSceneCatalog,
  sceneConfigSchema,
  sceneProvenanceSchema
} from "../../src/features/dynamic-replanning/dynamicSceneSchema";
import {
  failureReportSchema,
  missionViewV1Schema
} from "../../src/features/dynamic-replanning/missionViewSchema";
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

const playbackPhases = new Set<DynamicPlaybackState["phase"]>([
  "READY",
  "BASELINE_RUNNING",
  "EVENT_ALERT",
  "IMPACT_REVEAL",
  "REPLAN_EXPLAINER",
  "PLAN_TRANSITION",
  "ACTIVE_PLAN_RUNNING",
  "RESULT_HOLD"
]);

function loadCommittedScenes() {
  const catalog = parseDynamicSceneCatalog(JSON.parse(readFileSync(resolve(
    "public/data/task2/scenes/catalog.json"
  ), "utf8")) as unknown);
  return catalog.scenes.map(entry => {
    const root = resolve("public/data", entry.baseUrl);
    const readJson = (name: string): unknown => JSON.parse(readFileSync(
      resolve(root, name),
      "utf8"
    )) as unknown;
    return {
      sceneId: entry.sceneId,
      scene: buildDynamicScene({
        config: sceneConfigSchema.parse(readJson("scene.json")),
        baseline: caseBundleSchema.parse(readJson("baseline.bundle.json")),
        view: missionViewV1Schema.parse(readJson("mission_view.v1.json")),
        decisionTrace: decisionTraceV1Schema.parse(
          readJson("decision_trace.v1.json")
        ),
        failureReport: entry.failureReportUrl === null
          ? null
          : failureReportSchema.parse(readJson(entry.failureReportUrl)),
        provenance: sceneProvenanceSchema.parse(readJson("provenance.json"))
      })
    };
  });
}

function expectValidPlayback(
  state: DynamicPlaybackState,
  makespanSec: number
) {
  expect(playbackPhases.has(state.phase)).toBe(true);
  expect(Number.isFinite(state.missionTimeSec)).toBe(true);
  expect(state.missionTimeSec).toBeGreaterThanOrEqual(0);
  expect(state.missionTimeSec).toBeLessThanOrEqual(makespanSec);
  expect(state.presentationElapsedMs).toBeGreaterThanOrEqual(0);
}

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

  it("keeps playback controls valid across all nine committed scenes", () => {
    const committedScenes = loadCommittedScenes();
    expect(committedScenes).toHaveLength(9);

    for (const item of committedScenes) {
      let state = createDynamicPlayback(item.scene);
      expectValidPlayback(state, item.scene.makespanSec);

      state = playDynamicPlayback(state);
      state = advanceDynamicPlayback(state, 250, item.scene);
      expectValidPlayback(state, item.scene.makespanSec);

      state = pauseDynamicPlayback(state);
      expect(state.playing, item.sceneId).toBe(false);
      expectValidPlayback(state, item.scene.makespanSec);

      state = seekDynamicPlayback(
        state,
        Math.min(item.scene.eventTimeSec + 1, item.scene.makespanSec),
        item.scene
      );
      expectValidPlayback(state, item.scene.makespanSec);

      state = advanceDynamicPlayback(
        playDynamicPlayback(state),
        100,
        item.scene
      );
      expectValidPlayback(state, item.scene.makespanSec);

      state = restartDynamicPlayback(state, item.scene);
      expect(state.phase, item.sceneId).toBe("READY");
      expectValidPlayback(state, item.scene.makespanSec);
    }
  });
});
