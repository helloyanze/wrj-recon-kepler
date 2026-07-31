import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {act, renderHook, waitFor} from "@testing-library/react";
import {describe, expect, it} from "vitest";

import {
  sha256Hex,
  type DynamicFetch
} from "../../src/features/dynamic-replanning/loadDynamicScene";
import {useDynamicSceneLibrary} from "../../src/hooks/useDynamicSceneLibrary";
import {
  decisionTraceFixture,
  missionViewFixture,
  sceneConfigFixture,
  scenePackageFixture
} from "../fixtures/task2MissionViewFixture";

const baselineText = readFileSync(resolve(
  "public/data/integration-cases/R01-BASELINE-01/bundle.json"
), "utf8");

async function packageFiles(sceneId: string): Promise<Map<string, string>> {
  const config = {
    ...sceneConfigFixture,
    sceneId,
    displayName: sceneId
  };
  const files = new Map<string, string>([
    ["scene.json", JSON.stringify(config)],
    ["baseline.bundle.json", baselineText],
    ["mission_view.v1.json", JSON.stringify(missionViewFixture)],
    ["decision_trace.v1.json", JSON.stringify(decisionTraceFixture)]
  ]);
  const hashes: Record<string, string> = {};
  for (const [name, value] of files) {
    hashes[name] = await sha256Hex(new TextEncoder().encode(value));
  }
  files.set("provenance.json", JSON.stringify({
    schemaVersion: "task2-demo-provenance.v1",
    task2Commit: "abc1234",
    generationCommand: "task2-replan export-demo-scenes",
    generatedAt: "2026-07-30T00:00:00Z",
    snapshotSource: "SIMULATED",
    baselinePlanVersion: 1,
    upstreamSha256: {
      "scene.json": hashes["scene.json"],
      "mission_view.v1.json": hashes["mission_view.v1.json"],
      "decision_trace.v1.json": hashes["decision_trace.v1.json"]
    },
    packagedSha256: hashes
  }));
  return files;
}

describe("useDynamicSceneLibrary", () => {
  it("isolates one broken scene while keeping the catalog usable", async () => {
    const valid = await packageFiles("resource-lost");
    const catalog = {
      version: 2,
      defaultSceneId: "resource-lost",
      scenes: [
        scenePackageFixture,
        {
          ...scenePackageFixture,
          sceneId: "broken",
          displayName: "broken",
          baseUrl: "task2/scenes/broken"
        }
      ]
    };
    const fetcher: DynamicFetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/catalog.json")) {
        return new Response(JSON.stringify(catalog), {status: 200});
      }
      if (url.includes("/broken/")) {
        return new Response("broken", {status: 500});
      }
      const name = url.slice(url.lastIndexOf("/") + 1);
      const value = valid.get(name);
      return value === undefined
        ? new Response("missing", {status: 404})
        : new Response(value, {status: 200});
    };

    const {result} = renderHook(() => useDynamicSceneLibrary({
      dataBase: "/data",
      fetcher
    }));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.scenePackage?.config.sceneId).toBe("resource-lost");
    expect(result.current.entries.find(item => item.sceneId === "broken")?.disabled)
      .toBe(true);
  });

  it("switches between verified packages and exposes stable controls", async () => {
    const first = await packageFiles("resource-lost");
    const second = await packageFiles("low-fuel-return");
    const catalog = {
      version: 2,
      defaultSceneId: "resource-lost",
      scenes: [
        scenePackageFixture,
        {
          ...scenePackageFixture,
          sceneId: "low-fuel-return",
          displayName: "低油量返航",
          baseUrl: "task2/scenes/low-fuel-return"
        }
      ]
    };
    const fetcher: DynamicFetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/catalog.json")) {
        return new Response(JSON.stringify(catalog), {status: 200});
      }
      const files = url.includes("/low-fuel-return/") ? second : first;
      const name = url.slice(url.lastIndexOf("/") + 1);
      return new Response(files.get(name) ?? "missing", {
        status: files.has(name) ? 200 : 404
      });
    };
    const {result} = renderHook(() => useDynamicSceneLibrary({
      dataBase: "/data",
      fetcher
    }));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    const select = result.current.select;
    const retry = result.current.retry;
    act(() => result.current.select("low-fuel-return"));
    await waitFor(() => expect(result.current.selectedSceneId)
      .toBe("low-fuel-return"));
    expect(result.current.scenePackage?.config.sceneId).toBe("low-fuel-return");
    expect(result.current.select).toBe(select);
    expect(result.current.retry).toBe(retry);
  });
});
