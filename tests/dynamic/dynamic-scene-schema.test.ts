import {describe, expect, it} from "vitest";

import {
  dynamicSceneCatalogSchema,
  sceneConfigSchema,
  scenePackageSchema,
  sceneProvenanceSchema
} from "../../src/features/dynamic-replanning/dynamicSceneSchema";
import {
  sceneConfigFixture,
  scenePackageFixture,
  sceneProvenanceFixture
} from "../fixtures/task2MissionViewFixture";

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
    const catalog = {
      version: 2,
      defaultSceneId: "resource-lost",
      scenes: [scenePackageFixture]
    };
    expect(dynamicSceneCatalogSchema.parse(catalog).scenes).toHaveLength(1);
    expect(() => dynamicSceneCatalogSchema.parse({
      ...catalog,
      defaultSceneId: "missing"
    })).toThrow();
    expect(() => dynamicSceneCatalogSchema.parse({
      ...catalog,
      scenes: [scenePackageFixture, scenePackageFixture]
    })).toThrow();
  });
});
