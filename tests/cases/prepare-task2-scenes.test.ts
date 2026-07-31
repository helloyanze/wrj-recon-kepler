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
  missionViewFixture,
  sceneConfigFixture,
  scenePackageFixture
} from "../fixtures/task2MissionViewFixture";

const roots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "wrj-task2-scenes-"));
  roots.push(root);
  return root;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function writeUpstream(inputRoot: string): void {
  const sceneRoot = join(inputRoot, "resource-lost");
  mkdirSync(sceneRoot, {recursive: true});
  const files = new Map<string, string>([
    ["scene.json", JSON.stringify(sceneConfigFixture)],
    ["mission_view.v1.json", JSON.stringify(missionViewFixture)],
    ["decision_trace.v1.json", JSON.stringify(decisionTraceFixture)],
    ["dynamic_events.json", JSON.stringify({
      batchId: "B-DEMO-LOST",
      missionId: "MIS-R01-BASELINE-01",
      sourcePlanVersion: 1,
      snapshotId: "SNAP-PENDING",
      missionTimeSec: 100,
      events: []
    })]
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
  mkdirSync(inputRoot, {recursive: true});
  writeFileSync(join(inputRoot, "catalog.json"), JSON.stringify({
    version: 2,
    defaultSceneId: "resource-lost",
    scenes: [{
      ...scenePackageFixture,
      baseUrl: "resource-lost"
    }]
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
    expect(JSON.parse(readFileSync(
      resolve(outputRoot, "catalog.json"),
      "utf8"
    )).defaultSceneId).toBe("resource-lost");
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
});
