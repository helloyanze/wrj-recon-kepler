import {readFile} from "node:fs/promises";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

import {caseBundleSchema} from "../../src/features/cases/caseBundle";
import {buildDynamicScene} from "../../src/features/dynamic-replanning/buildDynamicScene";
import {decisionTraceV1Schema} from "../../src/features/dynamic-replanning/decisionTraceSchema";
import {
  dynamicSceneCatalogSchema,
  sceneConfigSchema,
  sceneProvenanceSchema,
  type DynamicSceneCatalogEntry,
  type LoadedDynamicScenePackage
} from "../../src/features/dynamic-replanning/dynamicSceneSchema";
import {
  sha256Hex
} from "../../src/features/dynamic-replanning/loadDynamicScene";
import {
  failureReportSchema,
  missionViewV1Schema
} from "../../src/features/dynamic-replanning/missionViewSchema";

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function loadDynamicSceneFromDisk(
  entry: DynamicSceneCatalogEntry
): Promise<LoadedDynamicScenePackage> {
  const root = resolve("public/data", entry.baseUrl);
  const provenance = sceneProvenanceSchema.parse(
    await readJson(resolve(root, "provenance.json"))
  );
  const names = [
    "scene.json",
    "baseline.bundle.json",
    "mission_view.v1.json",
    "decision_trace.v1.json",
    ...(entry.failureReportUrl === null ? [] : [entry.failureReportUrl])
  ];
  const values = new Map<string, unknown>();
  for (const name of names) {
    const path = resolve(root, name);
    const bytes = await readFile(path);
    expect(await sha256Hex(bytes), `${entry.sceneId}/${name}`)
      .toBe(provenance.packagedSha256[name]);
    values.set(name, JSON.parse(bytes.toString("utf8")) as unknown);
  }
  return {
    config: sceneConfigSchema.parse(values.get("scene.json")),
    baseline: caseBundleSchema.parse(values.get("baseline.bundle.json")),
    view: missionViewV1Schema.parse(values.get("mission_view.v1.json")),
    decisionTrace: decisionTraceV1Schema.parse(
      values.get("decision_trace.v1.json")
    ),
    failureReport: entry.failureReportUrl === null
      ? null
      : failureReportSchema.parse(values.get(entry.failureReportUrl)),
    provenance
  };
}

describe("committed Task 2 scenes", () => {
  it("loads all four committed Task 2 scenes offline", async () => {
    const catalog = dynamicSceneCatalogSchema.parse(await readJson(
      resolve("public/data/task2/scenes/catalog.json")
    ));
    expect(catalog.scenes.map(item => item.sceneId)).toEqual([
      "resource-lost",
      "low-fuel-return",
      "new-area-task",
      "hard-deadline-fallback"
    ]);
    for (const entry of catalog.scenes) {
      const loaded = await loadDynamicSceneFromDisk(entry);
      const scene = buildDynamicScene(loaded);
      expect(scene.eventTimeSec).toBeGreaterThan(0);
    }
  });
});
