import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it, vi} from "vitest";

import {caseBundleSchema} from "../../src/features/cases/caseBundle";
import {buildDynamicScene} from "../../src/features/dynamic-replanning/buildDynamicScene";
import {
  CHANGE_COLORS,
  createDynamicDeckLayers
} from "../../src/features/dynamic-replanning/dynamicDeckLayers";
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
  failureReport: null,
  provenance: sceneProvenanceSchema.parse(sceneProvenanceFixture)
});

function optionsFor(phase: DynamicPlaybackPhase) {
  const playback: DynamicPlaybackState = {
    phase,
    missionTimeSec: scene.eventTimeSec,
    presentationElapsedMs: 1_200,
    playing: false,
    rate: 1,
    automaticCamera: true
  };
  return {scene, playback, verticalScale: 1 as const};
}

describe("dynamic Deck layers", () => {
  it("uses stable layer ids and change-type colors", () => {
    const layers = createDynamicDeckLayers(optionsFor("PLAN_TRANSITION"));
    expect(layers.map(layer => layer.id)).toEqual([
      "wrj-task2-task-polygons",
      "wrj-task2-baseline-paths",
      "wrj-task2-active-paths",
      "wrj-task2-event-halo",
      "wrj-task2-resource-markers"
    ]);
    const active = layers.find(
      layer => layer.id === "wrj-task2-active-paths"
    );
    const getColor = (active as unknown as {
      props: {
        getColor(value: {changeType: "dynamic_new"}): number[];
      };
    }).props.getColor;
    expect(getColor({changeType: "dynamic_new"}))
      .toEqual([57, 217, 138, 255]);
    expect(CHANGE_COLORS.dynamic_cancelled)
      .toEqual([238, 82, 83, 255]);
  });

  it("shows the event halo only during alert and impact", () => {
    expect(createDynamicDeckLayers(optionsFor("EVENT_ALERT"))[3].props.visible)
      .toBe(true);
    expect(createDynamicDeckLayers(
      optionsFor("ACTIVE_PLAN_RUNNING")
    )[3].props.visible).toBe(false);
  });

  it("routes marker selection through the resource callback", () => {
    const onSelectResource = vi.fn();
    const markers = createDynamicDeckLayers({
      ...optionsFor("ACTIVE_PLAN_RUNNING"),
      onSelectResource
    })[4];
    const onClick = markers.props.onClick as (
      info: {object: {resourceId: string}}
    ) => void;
    onClick({object: {resourceId: "UAV-01"}});
    expect(onSelectResource).toHaveBeenCalledWith("UAV-01");
  });
});
