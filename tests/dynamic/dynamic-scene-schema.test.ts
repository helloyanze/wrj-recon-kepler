import {describe, expect, it} from "vitest";

import {
  dynamicSceneCatalogSchema,
  parseDynamicSceneCatalog,
  sceneConfigSchema,
  scenePackageSchema,
  sceneProvenanceSchema
} from "../../src/features/dynamic-replanning/dynamicSceneSchema";
import {decisionTraceV1Schema} from "../../src/features/dynamic-replanning/decisionTraceSchema";
import {
  decisionTraceFixture,
  sceneConfigFixture,
  scenePackageFixture,
  sceneProvenanceFixture
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
