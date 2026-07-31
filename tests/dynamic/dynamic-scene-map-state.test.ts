import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

import {caseBundleSchema} from "../../src/features/cases/caseBundle";
import {
  buildDynamicScene
} from "../../src/features/dynamic-replanning/buildDynamicScene";
import {
  decisionTraceV1Schema
} from "../../src/features/dynamic-replanning/decisionTraceSchema";
import {
  dynamicSceneMapState
} from "../../src/features/dynamic-replanning/dynamicSceneMapState";
import {
  sceneConfigSchema,
  sceneProvenanceSchema
} from "../../src/features/dynamic-replanning/dynamicSceneSchema";
import {
  missionViewV1Schema
} from "../../src/features/dynamic-replanning/missionViewSchema";

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

describe("dynamicSceneMapState", () => {
  it("centres the initial camera on the visible task geometry", () => {
    const root = "public/data/task2/scenes/resource-lost";
    const scene = buildDynamicScene({
      config: sceneConfigSchema.parse(readJson(`${root}/scene.json`)),
      baseline: caseBundleSchema.parse(
        readJson(`${root}/baseline.bundle.json`)
      ),
      view: missionViewV1Schema.parse(
        readJson(`${root}/mission_view.v1.json`)
      ),
      decisionTrace: decisionTraceV1Schema.parse(
        readJson(`${root}/decision_trace.v1.json`)
      ),
      failureReport: null,
      provenance: sceneProvenanceSchema.parse(
        readJson(`${root}/provenance.json`)
      )
    });
    const state = dynamicSceneMapState(scene);
    const visibleTaskPoints = scene.taskPolygons
      .filter(task => task.changeType !== "dynamic_new")
      .flatMap(task => task.polygon);
    const longitudes = visibleTaskPoints.map(point => point[0]);
    const latitudes = visibleTaskPoints.map(point => point[1]);

    expect(state.longitude).toBeCloseTo(
      (Math.min(...longitudes) + Math.max(...longitudes)) / 2
    );
    expect(state.latitude).toBeCloseTo(
      (Math.min(...latitudes) + Math.max(...latitudes)) / 2
    );
    expect(state.zoom).toBeGreaterThanOrEqual(4);
    expect(state.zoom).toBeLessThanOrEqual(14);
  });
});
