import {createHash} from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";

import {afterEach, describe, expect, it} from "vitest";

import {
  checkTask2Scenes,
  prepareTask2Scenes
} from "../../scripts/prepare-task2-scenes";
import {
  decisionTraceFixture,
  dynamicEventsFixture,
  missionViewFixture,
  sceneConfigFixture,
  scenePackageFixture,
  taskGeometryDiffFixture
} from "../fixtures/task2MissionViewFixture";

const roots: string[] = [];

const upstreamScenes = [
  ["resource-lost", "foundation", false],
  ["low-fuel-return", "foundation", false],
  ["new-area-task", "foundation", false],
  ["hard-deadline-fallback", "foundation", false],
  ["task-cancelled", "task_change", false],
  ["task-priority-raised", "task_change", false],
  ["task-dependency-changed", "task_change", false],
  ["event-conflict-resolution", "event_governance", false],
  ["comprehensive-multi-event", "comprehensive", true]
] as const;

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "wrj-task2-scenes-"));
  roots.push(root);
  return root;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function writeUpstream(inputRoot: string): void {
  mkdirSync(inputRoot, {recursive: true});
  const catalogScenes = upstreamScenes.map(
    ([sceneId, category, featured]) => {
      const displayName = `场景 ${sceneId}`;
      const summary = `${displayName} 摘要`;
      const sceneRoot = join(inputRoot, sceneId);
      mkdirSync(sceneRoot, {recursive: true});
      const files = new Map<string, string>([
        ["scene.json", JSON.stringify({
          ...sceneConfigFixture,
          sceneId,
          displayName,
          summary
        })],
        ["mission_view.v1.json", JSON.stringify(missionViewFixture)],
        ["decision_trace.v1.json", JSON.stringify(decisionTraceFixture)],
        ["dynamic_events.json", JSON.stringify(dynamicEventsFixture)],
        ["task_geometry_diff.v1.json", JSON.stringify(taskGeometryDiffFixture)]
      ]);
      const hashes = Object.fromEntries(
        [...files].map(([name, value]) => [name, hash(value)])
      );
      for (const [name, value] of files) {
        writeFileSync(join(sceneRoot, name), value, "utf8");
      }
      writeFileSync(join(sceneRoot, "provenance.json"), JSON.stringify({
        schemaVersion: "task2-demo-provenance.v1",
        task2Commit: "abc1234",
        generationCommand: "task2-replan export-demo-scenes",
        generatedAt: "2026-07-30T00:00:00Z",
        snapshotSource: "SIMULATED",
        baselinePlanVersion: 1,
        upstreamSha256: hashes,
        packagedSha256: hashes
      }), "utf8");
      return {
        ...scenePackageFixture,
        sceneId,
        displayName,
        summary,
        baseUrl: sceneId,
        category,
        dataNature: "SIMULATED_PIPELINE_RESULT",
        featured
      };
    }
  );
  writeFileSync(join(inputRoot, "catalog.json"), JSON.stringify({
    version: 3,
    defaultSceneId: "resource-lost",
    scenes: catalogScenes
  }), "utf8");
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, {recursive: true, force: true});
  }
});

describe("prepareTask2Scenes", () => {
  it("packages exported views with the matching Task 1 baseline", async () => {
    const root = temporaryRoot();
    const inputRoot = join(root, "input");
    const outputRoot = join(root, "output");
    writeUpstream(inputRoot);

    await prepareTask2Scenes({
      inputRoot,
      baselineRoot: resolve("public/data/integration-cases"),
      outputRoot
    });

    const sceneRoot = resolve(outputRoot, "resource-lost");
    expect(JSON.parse(readFileSync(
      resolve(sceneRoot, "baseline.bundle.json"),
      "utf8"
    )).case.caseId).toBe("R01-BASELINE-01");
    const outputCatalog = JSON.parse(readFileSync(
      resolve(outputRoot, "catalog.json"),
      "utf8"
    ));
    expect(outputCatalog.version).toBe(3);
    expect(outputCatalog.defaultSceneId).toBe("resource-lost");
    expect(outputCatalog.scenes).toHaveLength(9);
    expect(outputCatalog.scenes.find(
      (scene: {sceneId: string}) =>
        scene.sceneId === "comprehensive-multi-event"
    )).toMatchObject({
      category: "comprehensive",
      dataNature: "SIMULATED_PIPELINE_RESULT",
      featured: true
    });
    expect(JSON.parse(readFileSync(
      resolve(sceneRoot, "provenance.json"),
      "utf8"
    )).packagedSha256["baseline.bundle.json"]).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("check mode reports changed and extra files without writing", async () => {
    const root = temporaryRoot();
    const inputRoot = join(root, "input");
    const outputRoot = join(root, "output");
    writeUpstream(inputRoot);
    const options = {
      inputRoot,
      baselineRoot: resolve("public/data/integration-cases"),
      outputRoot
    };
    await prepareTask2Scenes(options);
    const changed = resolve(
      outputRoot,
      "resource-lost/mission_view.v1.json"
    );
    writeFileSync(changed, "tampered", "utf8");
    writeFileSync(resolve(outputRoot, "extra.json"), "extra", "utf8");

    await expect(checkTask2Scenes(options)).rejects.toThrow(
      /changed: resource-lost\/mission_view\.v1\.json/u
    );
    expect(readFileSync(changed, "utf8")).toBe("tampered");
    expect(readFileSync(resolve(outputRoot, "extra.json"), "utf8"))
      .toBe("extra");
  });

  it("rejects incomplete v3 presentation metadata", async () => {
    const root = temporaryRoot();
    const inputRoot = join(root, "input");
    writeUpstream(inputRoot);
    const catalogPath = join(inputRoot, "catalog.json");
    const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as {
      scenes: Array<Record<string, unknown>>;
    };
    delete catalog.scenes[0].featured;
    writeFileSync(catalogPath, JSON.stringify(catalog), "utf8");

    await expect(prepareTask2Scenes({
      inputRoot,
      baselineRoot: resolve("public/data/integration-cases"),
      outputRoot: join(root, "output")
    })).rejects.toThrow();
  });
});
