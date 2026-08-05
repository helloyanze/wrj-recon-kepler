import {describe, expect, it} from "vitest";

import {
  dynamicSceneCatalogSchema,
  parseDynamicSceneCatalog,
  sceneConfigSchema,
  scenePackageSchema,
  sceneProvenanceSchema
} from "../../src/features/dynamic-replanning/dynamicSceneSchema";
import {decisionTraceV1Schema} from "../../src/features/dynamic-replanning/decisionTraceSchema";
import {dynamicEventBatchSchema} from "../../src/features/dynamic-replanning/dynamicEventSchema";
import {missionViewV1Schema} from "../../src/features/dynamic-replanning/missionViewSchema";
import {taskGeometryDiffV1Schema} from "../../src/features/dynamic-replanning/taskGeometryDiffSchema";
import {
  decisionTraceFixture,
  dynamicEventsFixture,
  missionViewFixture,
  sceneConfigFixture,
  scenePackageFixture,
  sceneProvenanceFixture,
  taskGeometryDiffFixture
} from "../fixtures/task2MissionViewFixture";

const v2Catalog = {
  version: 2,
  defaultSceneId: "resource-lost",
  scenes: [scenePackageFixture]
};

const v3Catalog = {
  version: 3,
  defaultSceneId: "resource-lost",
  scenes: [{
    ...scenePackageFixture,
    category: "comprehensive",
    dataNature: "SIMULATED_PIPELINE_RESULT",
    featured: true
  }]
};

describe("dynamic scene package schemas", () => {
  it("accepts scene configuration and provenance", () => {
    expect(sceneConfigSchema.parse(sceneConfigFixture).sceneId)
      .toBe("resource-lost");
    expect(sceneProvenanceSchema.parse(sceneProvenanceFixture).snapshotSource)
      .toBe("SIMULATED");
  });

  it("requires a failure report for a partial scene reference", () => {
    expect(() => scenePackageSchema.parse({
      ...scenePackageFixture,
      resultStatus: "PARTIAL_SAFE_FALLBACK",
      failureReportUrl: null
    })).toThrow();
  });

  it("rejects a failure report reference for a complete scene", () => {
    expect(() => scenePackageSchema.parse({
      ...scenePackageFixture,
      failureReportUrl: "failure_report.json"
    })).toThrow();
  });

  it("requires the default scene to exist and scene ids to be unique", () => {
    expect(dynamicSceneCatalogSchema.parse(v2Catalog).scenes).toHaveLength(1);
    for (const catalog of [v2Catalog, v3Catalog]) {
      expect(() => parseDynamicSceneCatalog({
        ...catalog,
        defaultSceneId: "missing"
      })).toThrow();
      expect(() => parseDynamicSceneCatalog({
        ...catalog,
        scenes: [catalog.scenes[0], catalog.scenes[0]]
      })).toThrow();
    }
  });

  it("accepts structured candidate facts", () => {
    const trace = decisionTraceV1Schema.parse(decisionTraceFixture);

    expect(trace.candidates[0].facts[0]).toMatchObject({
      code: "ALLOCATED_TASK_COUNT",
      value: 1,
      unit: "COUNT"
    });
  });

  it("parses event-specific payloads", () => {
    const batch = dynamicEventBatchSchema.parse(dynamicEventsFixture);

    expect(batch.events[0].payload.kind).toBe("RESOURCE_LOW_FUEL");
  });

  it("parses task geometry evolution and overlap separately", () => {
    const document = taskGeometryDiffV1Schema.parse(taskGeometryDiffFixture);

    expect(document.entries[0].relation).toBe("expanded");
    expect(document.entries[1].spatialRelation).toBe("overlap");
    expect(document.entries[1].relation).not.toBe("expanded");
  });

  it("keeps old mission views readable without geometryContext", () => {
    const oldTask = {...missionViewFixture.tasks[0]};
    delete (oldTask as {geometryContext?: unknown}).geometryContext;
    const parsed = missionViewV1Schema.parse({
      ...missionViewFixture,
      tasks: [oldTask]
    });

    expect(parsed.tasks[0].geometryContext).toBeNull();
  });

  it("normalizes v2 and v3 catalogs to presentation metadata", () => {
    expect(parseDynamicSceneCatalog(v3Catalog).scenes[0]).toMatchObject({
      category: "comprehensive",
      dataNature: "SIMULATED_PIPELINE_RESULT",
      featured: true
    });
    expect(parseDynamicSceneCatalog(v2Catalog).scenes[0]).toMatchObject({
      category: "foundation",
      dataNature: "SIMULATED_PIPELINE_RESULT",
      featured: false
    });
  });

  it("enforces failure-report consistency for both catalog versions", () => {
    for (const catalog of [v2Catalog, v3Catalog]) {
      expect(() => parseDynamicSceneCatalog({
        ...catalog,
        scenes: [{
          ...catalog.scenes[0],
          resultStatus: "PARTIAL_SAFE_FALLBACK",
          failureReportUrl: null
        }]
      })).toThrow();
      expect(() => parseDynamicSceneCatalog({
        ...catalog,
        scenes: [{
          ...catalog.scenes[0],
          failureReportUrl: "failure_report.json"
        }]
      })).toThrow();
    }
  });
});
