import {readFile} from "node:fs/promises";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

import {caseBundleSchema} from "../../src/features/cases/caseBundle";
import {buildDynamicScene} from "../../src/features/dynamic-replanning/buildDynamicScene";
import {decisionTraceV1Schema} from "../../src/features/dynamic-replanning/decisionTraceSchema";
import {
  parseDynamicSceneCatalog,
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
import {dynamicEventBatchSchema} from "../../src/features/dynamic-replanning/dynamicEventSchema";

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
    "dynamic_events.json",
    "decision_trace.v1.json",
    ...(entry.failureReportUrl === null ? [] : [entry.failureReportUrl])
  ];
  expect(Object.keys(provenance.packagedSha256).sort()).toEqual(
    [...names].sort()
  );
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
    dynamicEvents: dynamicEventBatchSchema.parse(values.get("dynamic_events.json")),
    geometryDiff: null,
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
  it("pins provenance-verified Task 2 JSON to LF checkout bytes", async () => {
    const attributes = await readFile(resolve(".gitattributes"), "utf8");

    expect(attributes.split(/\r?\n/u)).toContain(
      "public/data/task2/scenes/**/*.json text eol=lf"
    );
  });

  it("loads all nine provenance-verified Task 2 scenes offline", async () => {
    const catalogValue = await readJson(
      resolve("public/data/task2/scenes/catalog.json")
    );
    const catalog = parseDynamicSceneCatalog(catalogValue);
    expect((catalogValue as {version: number}).version).toBe(3);
    expect(catalog.scenes.map(item => item.sceneId)).toEqual([
      "resource-lost",
      "low-fuel-return",
      "new-area-task",
      "hard-deadline-fallback",
      "task-cancelled",
      "task-priority-raised",
      "task-dependency-changed",
      "event-conflict-resolution",
      "comprehensive-multi-event"
    ]);
    expect(catalog.scenes.map(item => item.category)).toEqual([
      "foundation",
      "foundation",
      "foundation",
      "foundation",
      "task_change",
      "task_change",
      "task_change",
      "event_governance",
      "comprehensive"
    ]);
    expect(catalog.scenes.every(
      item => item.dataNature === "SIMULATED_PIPELINE_RESULT"
    )).toBe(true);
    expect(catalog.scenes.at(-1)).toMatchObject({
      sceneId: "comprehensive-multi-event",
      category: "comprehensive",
      dataNature: "SIMULATED_PIPELINE_RESULT",
      featured: true
    });
    for (const entry of catalog.scenes) {
      const loaded = await loadDynamicSceneFromDisk(entry);
      const scene = buildDynamicScene(loaded);
      expect(loaded.config).toMatchObject({
        sceneId: entry.sceneId,
        displayName: entry.displayName,
        summary: entry.summary,
        resultStatus: entry.resultStatus
      });
      expect(loaded.view.activePlan.planStatus).toBe(entry.resultStatus);
      expect(entry.failureReportUrl !== null).toBe(
        entry.resultStatus === "PARTIAL_SAFE_FALLBACK"
      );
      expect(loaded.failureReport !== null).toBe(
        entry.resultStatus === "PARTIAL_SAFE_FALLBACK"
      );
      expect(scene.eventTimeSec).toBeGreaterThan(0);
    }
  });
});
