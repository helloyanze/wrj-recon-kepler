import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

import type {DynamicSceneCatalogEntry} from "../../src/features/dynamic-replanning/dynamicSceneSchema";
import {
  loadDynamicScene,
  sha256Hex,
  type DynamicFetch
} from "../../src/features/dynamic-replanning/loadDynamicScene";
import {
  decisionTraceFixture,
  missionViewFixture,
  sceneConfigFixture,
  scenePackageFixture
} from "../fixtures/task2MissionViewFixture";

const baseline = JSON.parse(readFileSync(resolve(
  "public/data/integration-cases/R01-BASELINE-01/bundle.json"
), "utf8")) as unknown;

const catalogEntry: DynamicSceneCatalogEntry = {
  ...scenePackageFixture
};

async function sceneFiles(
  view: unknown = missionViewFixture
): Promise<Map<string, string>> {
  const files = new Map<string, string>([
    ["scene.json", JSON.stringify(sceneConfigFixture)],
    ["baseline.bundle.json", JSON.stringify(baseline)],
    ["mission_view.v1.json", JSON.stringify(view)],
    ["decision_trace.v1.json", JSON.stringify(decisionTraceFixture)]
  ]);
  const packagedSha256: Record<string, string> = {};
  for (const [name, value] of files) {
    packagedSha256[name] = await sha256Hex(new TextEncoder().encode(value));
  }
  files.set("provenance.json", JSON.stringify({
    schemaVersion: "task2-demo-provenance.v1",
    task2Commit: "abc1234",
    generationCommand: "task2-replan export-demo-scenes",
    generatedAt: "2026-07-30T00:00:00Z",
    snapshotSource: "SIMULATED",
    baselinePlanVersion: 1,
    upstreamSha256: {
      "scene.json": packagedSha256["scene.json"],
      "mission_view.v1.json": packagedSha256["mission_view.v1.json"],
      "decision_trace.v1.json":
        packagedSha256["decision_trace.v1.json"]
    },
    packagedSha256
  }));
  return files;
}

function fakeFetch(files: Map<string, string>): DynamicFetch {
  return async (input) => {
    const url = String(input);
    const name = url.slice(url.lastIndexOf("/") + 1);
    const value = files.get(name);
    return value === undefined
      ? new Response("missing", {status: 404})
      : new Response(value, {
          status: 200,
          headers: {"content-type": "application/json"}
        });
  };
}

describe("loadDynamicScene", () => {
  it("hashes bytes returned by Response.arrayBuffer in jsdom", async () => {
    const responseBytes = new Uint8Array(
      await new Response("abc").arrayBuffer()
    );

    await expect(sha256Hex(responseBytes)).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("loads and validates one complete scene", async () => {
    const result = await loadDynamicScene(
      "/data",
      catalogEntry,
      fakeFetch(await sceneFiles())
    );
    expect(result.config.sceneId).toBe("resource-lost");
    expect(result.view.activePlan.planStatus).toBe("COMPLETE");
    expect(result.failureReport).toBeNull();
    expect(result.baseline.case.caseId).toBe("R01-BASELINE-01");
  });

  it("rejects a changed mission view hash", async () => {
    const files = await sceneFiles();
    files.set("mission_view.v1.json", JSON.stringify({
      ...missionViewFixture,
      tasks: []
    }));
    await expect(loadDynamicScene(
      "/data",
      catalogEntry,
      fakeFetch(files)
    )).rejects.toThrow("mission_view.v1.json hash mismatch");
  });

  it("reports the failing file for malformed JSON", async () => {
    const files = await sceneFiles();
    const malformed = "{";
    files.set("scene.json", malformed);
    const provenance = JSON.parse(files.get("provenance.json") ?? "{}") as {
      packagedSha256: Record<string, string>;
    };
    provenance.packagedSha256["scene.json"] = await sha256Hex(
      new TextEncoder().encode(malformed)
    );
    files.set("provenance.json", JSON.stringify(provenance));

    await expect(loadDynamicScene(
      "/data",
      catalogEntry,
      fakeFetch(files)
    )).rejects.toThrow("scene.json");
  });
});
