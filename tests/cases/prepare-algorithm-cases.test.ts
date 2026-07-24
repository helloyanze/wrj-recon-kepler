import {execFile} from "node:child_process";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile
} from "node:fs/promises";
import {tmpdir} from "node:os";
import {dirname, join, parse, relative} from "node:path";
import {promisify} from "node:util";
import {afterEach, describe, expect, it} from "vitest";
import {
  discoverValidRuns,
  parseCliArgs,
  prepareAlgorithmCases
} from "../../scripts/prepare-algorithm-cases";
import {
  CASE_CATALOG_VERSION,
  caseCatalogSchema,
  type CaseCatalogV1
} from "../../src/features/cases/catalogSchema";
import {missionPlanFixture} from "../fixtures/missionPlanFixture";

type TestPlan = typeof missionPlanFixture;

const tempDirectories: string[] = [];
const execFileAsync = promisify(execFile);

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(path =>
      rm(path, {recursive: true, force: true})
    )
  );
});

async function makeWorkspace() {
  const root = await mkdtemp(join(tmpdir(), "algorithm-cases-"));
  tempDirectories.push(root);
  const inputRoot = join(root, "input");
  const outputRoot = join(root, "output");
  await mkdir(inputRoot, {recursive: true});
  return {root, inputRoot, outputRoot};
}

function makePlan(caseId: string, planId = `PLAN-${caseId}`): TestPlan {
  const plan = structuredClone(missionPlanFixture);
  plan.caseId = caseId;
  plan.planId = planId;
  return plan;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), {recursive: true});
  await writeFile(path, `${JSON.stringify(value)}\n`, "utf8");
}

async function writePlan(
  inputRoot: string,
  caseDirectory: string,
  runId: string,
  plan: unknown
): Promise<string> {
  const path = join(inputRoot, caseDirectory, runId, "mission_plan.json");
  await writeJson(path, plan);
  return path;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function snapshotFiles(root: string): Promise<Map<string, string>> {
  const result = new Map<string, string>();

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, {withFileTypes: true});
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else {
        result.set(
          relative(root, path).replaceAll("\\", "/"),
          await readFile(path, "utf8")
        );
      }
    }
  }

  await visit(root);
  return result;
}

function catalogFixture(): CaseCatalogV1 {
  return {
    version: 1,
    defaultCaseId: "CASE-A",
    cases: [
      {
        caseId: "CASE-A",
        planId: "PLAN-A",
        displayName: "CASE-A",
        runId: "20260721T192032",
        bundleUrl: "/data/integration-cases/CASE-A/bundle.json",
        sourcePath: "case-a/20260721T192032/mission_plan.json",
        metrics: {
          uavCount: 1,
          sortieCount: 1,
          batchCount: 1,
          stripCount: 1,
          missionMakespanSec: 52
        },
        warnings: []
      }
    ]
  };
}

describe("catalogSchema", () => {
  it("defines a strict version-1 catalog with stable entry fields", () => {
    expect(CASE_CATALOG_VERSION).toBe(1);
    expect(caseCatalogSchema.parse(catalogFixture())).toEqual(catalogFixture());

    expect(() =>
      caseCatalogSchema.parse({
        ...catalogFixture(),
        unexpected: true
      })
    ).toThrow();
    expect(() =>
      caseCatalogSchema.parse({
        ...catalogFixture(),
        cases: [
          {
            ...catalogFixture().cases[0],
            bundleUrl: "/data/integration-cases/OTHER/bundle.json"
          }
        ]
      })
    ).toThrow(/bundleUrl.*encoded caseId|encoded caseId.*bundleUrl/i);
  });

  it("rejects duplicate case IDs, duplicate bundle URLs, and a missing default", () => {
    const duplicateCase = structuredClone(catalogFixture());
    duplicateCase.cases.push({
      ...structuredClone(duplicateCase.cases[0]),
      bundleUrl: "/data/integration-cases/other/bundle.json"
    });
    expect(() => caseCatalogSchema.parse(duplicateCase)).toThrow(
      /duplicate caseId/i
    );

    const duplicateUrl = structuredClone(catalogFixture());
    duplicateUrl.cases.push({
      ...structuredClone(duplicateUrl.cases[0]),
      caseId: "CASE-B"
    });
    expect(() => caseCatalogSchema.parse(duplicateUrl)).toThrow(
      /duplicate bundleUrl/i
    );

    expect(() =>
      caseCatalogSchema.parse({
        ...catalogFixture(),
        defaultCaseId: "CASE-MISSING"
      })
    ).toThrow(/defaultCaseId.*CASE-MISSING/i);
  });
});

describe("discoverValidRuns", () => {
  it("selects the lexicographically newest valid feasible run for each parsed case", async () => {
    const {inputRoot} = await makeWorkspace();
    await writePlan(
      inputRoot,
      "case-a",
      "20260720T192032",
      makePlan("CASE-A", "PLAN-OLD")
    );
    const infeasible = makePlan("CASE-A", "PLAN-INFEASIBLE");
    infeasible.feasible = false;
    await writePlan(inputRoot, "case-a", "20260721T192032", infeasible);

    const first = await discoverValidRuns(inputRoot);
    expect(first.selectedRuns.get("CASE-A")).toMatchObject({
      runId: "20260720T192032",
      caseId: "CASE-A"
    });
    expect(first.diagnostics.join("\n")).toMatch(
      /20260721T192032.*feasible/i
    );

    await writePlan(
      inputRoot,
      "case-a",
      "20260722T192032",
      makePlan("CASE-A", "PLAN-NEWEST")
    );
    const second = await discoverValidRuns(inputRoot);
    expect(second.selectedRuns.get("CASE-A")).toMatchObject({
      runId: "20260722T192032",
      planId: "PLAN-NEWEST"
    });
  });

  it("ignores intermediate, hidden, and linked directory trees", async () => {
    const {root, inputRoot} = await makeWorkspace();
    await writePlan(
      inputRoot,
      "case-a",
      "20260721T192032",
      makePlan("CASE-A")
    );
    await writeJson(
      join(
        inputRoot,
        "case-a",
        "20260722T192032",
        "intermediate",
        "mission_plan.json"
      ),
      makePlan("INTERMEDIATE-CASE")
    );
    await writePlan(
      inputRoot,
      ".hidden",
      "20260723T192032",
      makePlan("HIDDEN-CASE")
    );

    const outsideRoot = join(root, "outside");
    await writePlan(
      outsideRoot,
      "external",
      "20260724T192032",
      makePlan("LINKED-CASE")
    );
    await symlink(outsideRoot, join(inputRoot, "linked-outside"), "junction");

    const {selectedRuns} = await discoverValidRuns(inputRoot);
    expect([...selectedRuns.keys()]).toEqual(["CASE-A"]);
  });

  it("skips malformed, schema-invalid, infeasible, and unsafe candidates with diagnostics", async () => {
    const {inputRoot} = await makeWorkspace();
    await writePlan(
      inputRoot,
      "good",
      "20260721T192032",
      makePlan("GOOD-CASE")
    );
    const malformedPath = join(
      inputRoot,
      "bad-json",
      "20260721T192032",
      "mission_plan.json"
    );
    await mkdir(dirname(malformedPath), {recursive: true});
    await writeFile(malformedPath, "{broken", "utf8");

    const invalid = makePlan("INVALID-CASE");
    Reflect.deleteProperty(invalid, "trajectories");
    await writePlan(inputRoot, "invalid", "20260721T192032", invalid);

    const infeasible = makePlan("INFEASIBLE-CASE");
    infeasible.feasible = false;
    await writePlan(inputRoot, "infeasible", "20260721T192032", infeasible);
    await writePlan(
      inputRoot,
      "unsafe",
      "20260721T192032",
      makePlan("../UNSAFE")
    );

    const result = await discoverValidRuns(inputRoot);
    expect([...result.selectedRuns.keys()]).toEqual(["GOOD-CASE"]);
    expect(result.diagnostics.join("\n")).toMatch(/bad-json.*JSON/i);
    expect(result.diagnostics.join("\n")).toMatch(/invalid.*trajectories/i);
    expect(result.diagnostics.join("\n")).toMatch(/infeasible.*feasible/i);
    expect(result.diagnostics.join("\n")).toMatch(/unsafe.*caseId/i);
  });

  it("adapts the raw algorithm object's polygon, candidate, and score shapes", async () => {
    const {inputRoot} = await makeWorkspace();
    const plan = makePlan("RAW-SHAPE-CASE");
    const snapshot = plan.assignmentPlan.stripPlanSnapshot;
    const polygon = snapshot.strips[0].coveragePolygon;
    Object.assign(snapshot.strips[0], {
      coveragePolygon: {
        type: "Polygon",
        coordinates: [
          polygon.map(point => [point.xM, point.yM])
        ]
      }
    });
    Object.assign(snapshot, {
      compatibleFlightCandidates: [
        {
          candidateId: snapshot.flightCandidateId,
          uavId: "UAV-04"
        }
      ]
    });
    Object.assign(plan, {finalScore: 98.5});
    await writePlan(inputRoot, "raw-shape", "20260721T192032", plan);

    const result = await discoverValidRuns(inputRoot);

    expect(result.selectedRuns.get("RAW-SHAPE-CASE")).toMatchObject({
      runId: "20260721T192032",
      planId: "PLAN-RAW-SHAPE-CASE"
    });
    expect(result.diagnostics).toEqual([]);
  });

  it("rejects Windows reserved, trailing-dot/space, and invalid case directories", async () => {
    const {inputRoot} = await makeWorkspace();
    await writePlan(
      inputRoot,
      "safe",
      "20260721T192032",
      makePlan("SAFE-CASE")
    );
    const unsafeCaseIds = ["CON", "con.txt", "CASE.", "CASE ", "CASE*"];
    await Promise.all(
      unsafeCaseIds.map((caseId, index) =>
        writePlan(
          inputRoot,
          `unsafe-${index}`,
          "20260721T192032",
          makePlan(caseId)
        )
      )
    );

    const result = await discoverValidRuns(inputRoot);

    expect([...result.selectedRuns.keys()]).toEqual(["SAFE-CASE"]);
    expect(result.diagnostics).toHaveLength(unsafeCaseIds.length);
    expect(result.diagnostics.join("\n")).toMatch(
      /Windows-safe|reserved|trailing dot|trailing space/i
    );
  });
});

describe("prepareAlgorithmCases", () => {
  it("writes sorted catalogs and safely encoded bundles with deterministic provenance", async () => {
    const {inputRoot, outputRoot} = await makeWorkspace();
    await writePlan(
      inputRoot,
      "z-folder",
      "20260721T192032",
      makePlan("CASE-A", "PLAN-A")
    );
    await writePlan(
      inputRoot,
      "a-folder",
      "20260722T010203",
      makePlan("CASE #2", "PLAN-2")
    );

    const result = await prepareAlgorithmCases({
      inputRoot,
      outputRoot,
      defaultCaseId: "CASE-A"
    });

    expect(result.catalog.cases.map(entry => entry.caseId)).toEqual([
      "CASE #2",
      "CASE-A"
    ]);
    expect(result.catalog.cases[0]).toMatchObject({
      caseId: "CASE #2",
      planId: "PLAN-2",
      displayName: "CASE #2",
      runId: "20260722T010203",
      bundleUrl: "/data/integration-cases/CASE%20%232/bundle.json",
      sourcePath: "a-folder/20260722T010203/mission_plan.json",
      metrics: {
        uavCount: 1,
        sortieCount: 1,
        batchCount: 1,
        stripCount: 1,
        missionMakespanSec: 52
      },
      warnings: []
    });
    expect(caseCatalogSchema.parse(result.catalog)).toEqual(result.catalog);

    const bundle = await readJson(
      join(outputRoot, "CASE %232", "bundle.json")
    ) as {
      provenance: {
        sourceName: string;
        sourceRun: string;
        importedAt: string;
        sha256: string;
      };
    };
    expect(bundle.provenance).toEqual({
      sourceName: "a-folder/20260722T010203/mission_plan.json",
      sourceRun: "20260722T010203",
      importedAt: "2026-07-22T01:02:03.000Z",
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/)
    });

    const catalogText = await readFile(join(outputRoot, "catalog.json"), "utf8");
    expect(catalogText.endsWith("\n")).toBe(true);
    expect(catalogText.slice(0, -1)).not.toContain("\n");
  });

  it("resolves encoded bundle URLs to Vite static disk directories", async () => {
    const {inputRoot, outputRoot} = await makeWorkspace();
    await writePlan(
      inputRoot,
      "space",
      "20260721T192032",
      makePlan("CASE SPACE")
    );
    await writePlan(
      inputRoot,
      "unicode",
      "20260721T192033",
      makePlan("中文#?100%")
    );

    const result = await prepareAlgorithmCases({
      inputRoot,
      outputRoot,
      defaultCaseId: "CASE SPACE"
    });
    expect(result.catalog.cases.map(entry => entry.caseId)).toEqual([
      "CASE SPACE",
      "中文#?100%"
    ]);

    for (const entry of result.catalog.cases) {
      const pathname = new URL(
        entry.bundleUrl,
        "http://vite-static.test"
      ).pathname;
      const decodedPathname = decodeURI(pathname);
      const staticPrefix = "/data/integration-cases/";
      expect(decodedPathname).toBe(
        `${staticPrefix}${decodeURI(encodeURIComponent(entry.caseId))}/bundle.json`
      );
      expect(decodedPathname.startsWith(staticPrefix)).toBe(true);
      const relativeStaticPath = decodedPathname.slice(staticPrefix.length);
      const bundle = await readJson(
        join(outputRoot, ...relativeStaticPath.split("/"))
      ) as {case: {caseId: string}};

      expect(bundle.case.caseId).toBe(entry.caseId);
    }
  });

  it("uses R10-LONG-TRANSIT-01 by default and requires an existing default", async () => {
    const {inputRoot, outputRoot} = await makeWorkspace();
    await writePlan(
      inputRoot,
      "default",
      "20260721T192032",
      makePlan("R10-LONG-TRANSIT-01")
    );
    await writePlan(
      inputRoot,
      "other",
      "20260721T192032",
      makePlan("OTHER-CASE")
    );

    const result = await prepareAlgorithmCases({inputRoot, outputRoot});
    expect(result.catalog.defaultCaseId).toBe("R10-LONG-TRANSIT-01");

    const isolated = await makeWorkspace();
    await writePlan(
      isolated.inputRoot,
      "only",
      "20260721T192032",
      makePlan("ONLY-CASE")
    );
    await expect(
      prepareAlgorithmCases({
        inputRoot: isolated.inputRoot,
        outputRoot: isolated.outputRoot
      })
    ).rejects.toThrow(
      /default case.*R10-LONG-TRANSIT-01.*not found/i
    );
    await expect(
      prepareAlgorithmCases({
        inputRoot: isolated.inputRoot,
        outputRoot: isolated.outputRoot,
        defaultCaseId: "ONLY-CASE"
      })
    ).resolves.toMatchObject({
      catalog: {defaultCaseId: "ONLY-CASE"}
    });
  });

  it("throws when no valid cases exist", async () => {
    const {inputRoot, outputRoot} = await makeWorkspace();
    const invalid = makePlan("INVALID");
    invalid.feasible = false;
    await writePlan(inputRoot, "invalid", "20260721T192032", invalid);

    await expect(
      prepareAlgorithmCases({
        inputRoot,
        outputRoot,
        defaultCaseId: "INVALID"
      })
    ).rejects.toThrow(/no valid algorithm cases/i);
  });

  it("passes valid optional region JSON and falls back on invalid optional JSON", async () => {
    const {inputRoot, outputRoot} = await makeWorkspace();
    const validPath = await writePlan(
      inputRoot,
      "profile",
      "20260721T192032",
      makePlan("PROFILE-CASE")
    );
    await writeJson(
      join(dirname(validPath), "intermediate", "region_profile.json"),
      {geometryWkt: "POLYGON((0 0,900 0,900 800,0 800))"}
    );
    const invalidPath = await writePlan(
      inputRoot,
      "fallback",
      "20260722T192032",
      makePlan("FALLBACK-CASE")
    );
    const invalidProfile = join(
      dirname(invalidPath),
      "intermediate",
      "region_profile.json"
    );
    await mkdir(dirname(invalidProfile), {recursive: true});
    await writeFile(invalidProfile, "{invalid", "utf8");

    const result = await prepareAlgorithmCases({
      inputRoot,
      outputRoot,
      defaultCaseId: "PROFILE-CASE"
    });
    const profileBundle = await readJson(
      join(outputRoot, "PROFILE-CASE", "bundle.json")
    ) as {region: {source: string}};
    const fallbackBundle = await readJson(
      join(outputRoot, "FALLBACK-CASE", "bundle.json")
    ) as {region: {source: string}};

    expect(profileBundle.region.source).toBe("REGION_PROFILE");
    expect(fallbackBundle.region.source).toBe("DERIVED_FROM_STRIPS");
    expect(result.diagnostics.join("\n")).toMatch(
      /FALLBACK-CASE|fallback.*region_profile\.json.*JSON/i
    );
  });

  it("uses an epoch timestamp and diagnostic for a non-timestamp run ID", async () => {
    const {inputRoot, outputRoot} = await makeWorkspace();
    await writePlan(inputRoot, "case", "latest", makePlan("CASE-EPOCH"));

    const result = await prepareAlgorithmCases({
      inputRoot,
      outputRoot,
      defaultCaseId: "CASE-EPOCH"
    });
    const bundle = await readJson(
      join(outputRoot, "CASE-EPOCH", "bundle.json")
    ) as {provenance: {importedAt: string}};

    expect(bundle.provenance.importedAt).toBe("1970-01-01T00:00:00.000Z");
    expect(result.diagnostics.join("\n")).toMatch(
      /runId.*latest.*timestamp|latest.*deterministic epoch/i
    );
  });

  it("produces byte-identical files across repeated writes", async () => {
    const {inputRoot, outputRoot} = await makeWorkspace();
    await writePlan(
      inputRoot,
      "case",
      "20260721T192032",
      makePlan("CASE-A")
    );

    await prepareAlgorithmCases({
      inputRoot,
      outputRoot,
      defaultCaseId: "CASE-A"
    });
    const first = await snapshotFiles(outputRoot);
    await prepareAlgorithmCases({
      inputRoot,
      outputRoot,
      defaultCaseId: "CASE-A"
    });
    const second = await snapshotFiles(outputRoot);

    expect(second).toEqual(first);
  });

  it("check mode reports missing, changed, and extra files without writing", async () => {
    const {inputRoot, outputRoot} = await makeWorkspace();
    await writePlan(
      inputRoot,
      "case",
      "20260721T192032",
      makePlan("CASE-A")
    );

    await expect(
      prepareAlgorithmCases({
        inputRoot,
        outputRoot,
        defaultCaseId: "CASE-A",
        check: true
      })
    ).rejects.toThrow(/missing:.*catalog\.json.*bundle\.json/is);
    await expect(lstat(outputRoot)).rejects.toThrow();

    await prepareAlgorithmCases({
      inputRoot,
      outputRoot,
      defaultCaseId: "CASE-A"
    });
    await writeFile(join(outputRoot, "catalog.json"), "{\"changed\":true}\n");
    await writeFile(join(outputRoot, "stale.txt"), "do not change in check mode");
    const before = await snapshotFiles(outputRoot);

    await expect(
      prepareAlgorithmCases({
        inputRoot,
        outputRoot,
        defaultCaseId: "CASE-A",
        check: true
      })
    ).rejects.toThrow(/changed:.*catalog\.json.*extra:.*stale\.txt/is);
    expect(await snapshotFiles(outputRoot)).toEqual(before);
  });

  it("normal writes remove only contained stale paths and never follow stale links", async () => {
    const {root, inputRoot, outputRoot} = await makeWorkspace();
    await writePlan(
      inputRoot,
      "case",
      "20260721T192032",
      makePlan("CASE-A")
    );
    await prepareAlgorithmCases({
      inputRoot,
      outputRoot,
      defaultCaseId: "CASE-A"
    });

    await writeJson(join(outputRoot, "stale", "nested", "old.json"), {
      stale: true
    });
    const outside = join(root, "outside-output");
    await writeFile(join(root, "outside-marker.txt"), "outside");
    await mkdir(outside, {recursive: true});
    await writeFile(join(outside, "keep.txt"), "keep");
    await symlink(outside, join(outputRoot, "stale-link"), "junction");

    await prepareAlgorithmCases({
      inputRoot,
      outputRoot,
      defaultCaseId: "CASE-A"
    });

    await expect(lstat(join(outputRoot, "stale"))).rejects.toThrow();
    await expect(lstat(join(outputRoot, "stale-link"))).rejects.toThrow();
    expect(await readFile(join(outside, "keep.txt"), "utf8")).toBe("keep");
    expect(await readFile(join(root, "outside-marker.txt"), "utf8")).toBe(
      "outside"
    );
  });

  it("rejects output roots that overlap input or resolve to a filesystem root", async () => {
    const {inputRoot} = await makeWorkspace();
    await writePlan(
      inputRoot,
      "case",
      "20260721T192032",
      makePlan("CASE-A")
    );

    await expect(
      prepareAlgorithmCases({
        inputRoot,
        outputRoot: inputRoot,
        defaultCaseId: "CASE-A"
      })
    ).rejects.toThrow(/outputRoot.*inputRoot|must not overlap/i);
    await expect(
      prepareAlgorithmCases({
        inputRoot,
        outputRoot: parse(inputRoot).root,
        defaultCaseId: "CASE-A"
      })
    ).rejects.toThrow(/outputRoot.*filesystem root/i);
  });

  it("rejects an input root reached through a linked parent alias", async () => {
    const {root} = await makeWorkspace();
    const realParent = join(root, "real-parent");
    const realInput = join(realParent, "input");
    await mkdir(realInput, {recursive: true});
    await writePlan(
      realInput,
      "case",
      "20260721T192032",
      makePlan("CASE-A")
    );
    const aliasParent = join(root, "alias-parent");
    await symlink(realParent, aliasParent, "junction");

    await expect(
      prepareAlgorithmCases({
        inputRoot: join(aliasParent, "input"),
        outputRoot: join(realInput, "generated-inside-raw"),
        defaultCaseId: "CASE-A"
      })
    ).rejects.toThrow(/overlap.*physical|physical.*overlap/i);
    await expect(
      lstat(join(realInput, "generated-inside-raw"))
    ).rejects.toThrow();
  });

  it("canonicalizes an output parent link before overlap validation", async () => {
    const {root} = await makeWorkspace();
    const realParent = join(root, "real-parent");
    const realInput = join(realParent, "input");
    await mkdir(realInput, {recursive: true});
    await writePlan(
      realInput,
      "case",
      "20260721T192032",
      makePlan("CASE-A")
    );
    const aliasParent = join(root, "alias-parent");
    await symlink(realParent, aliasParent, "junction");

    await expect(
      prepareAlgorithmCases({
        inputRoot: realInput,
        outputRoot: join(aliasParent, "input", "generated-inside-raw"),
        defaultCaseId: "CASE-A"
      })
    ).rejects.toThrow(/overlap.*physical|physical.*overlap/i);
    await expect(
      lstat(join(realInput, "generated-inside-raw"))
    ).rejects.toThrow();
  });

  it("rejects distinct case IDs that collide as Windows output directories", async () => {
    const {inputRoot, outputRoot} = await makeWorkspace();
    await writePlan(
      inputRoot,
      "upper",
      "20260721T192032",
      makePlan("CASE-A")
    );
    await writePlan(
      inputRoot,
      "lower",
      "20260721T192032",
      makePlan("case-a")
    );

    await expect(
      prepareAlgorithmCases({
        inputRoot,
        outputRoot,
        defaultCaseId: "CASE-A"
      })
    ).rejects.toThrow(/output directory collision.*CASE-A.*case-a/i);
    await expect(lstat(outputRoot)).rejects.toThrow();
  });

  it("prevalidates every output segment length before writing any file", async () => {
    const {inputRoot, outputRoot} = await makeWorkspace();
    await writePlan(
      inputRoot,
      "safe",
      "20260721T192032",
      makePlan("SAFE-CASE")
    );
    await writePlan(
      inputRoot,
      "long",
      "20260721T192032",
      makePlan("A".repeat(256))
    );
    await mkdir(outputRoot, {recursive: true});
    await writeFile(join(outputRoot, "sentinel.txt"), "unchanged", "utf8");

    await expect(
      prepareAlgorithmCases({
        inputRoot,
        outputRoot,
        defaultCaseId: "SAFE-CASE"
      })
    ).rejects.toThrow(/output path segment.*255|segment.*too long/i);
    expect(await readFile(join(outputRoot, "sentinel.txt"), "utf8")).toBe(
      "unchanged"
    );
    await expect(lstat(join(outputRoot, "catalog.json"))).rejects.toThrow();
  });
});

describe("parseCliArgs", () => {
  it("provides deterministic defaults and parses explicit roots, default, and check", () => {
    expect(parseCliArgs([])).toEqual({
      inputRoot: "data/integration-validation",
      outputRoot: "public/data/integration-cases",
      defaultCaseId: "R10-LONG-TRANSIT-01",
      check: false
    });
    expect(
      parseCliArgs([
        "--input-root",
        "raw",
        "--output-root",
        "generated",
        "--default-case",
        "CASE-A",
        "--check"
      ])
    ).toEqual({
      inputRoot: "raw",
      outputRoot: "generated",
      defaultCaseId: "CASE-A",
      check: true
    });
    expect(() => parseCliArgs(["--unknown"])).toThrow(
      /unknown argument.*--unknown/i
    );
  });

  it("runs through the package CLI while remaining inert when imported", async () => {
    const {inputRoot, outputRoot} = await makeWorkspace();
    await writePlan(
      inputRoot,
      "default",
      "20260721T192032",
      makePlan("R10-LONG-TRANSIT-01")
    );
    const infeasible = makePlan("SKIPPED-INFEASIBLE");
    infeasible.feasible = false;
    await writePlan(
      inputRoot,
      "infeasible",
      "20260721T192032",
      infeasible
    );
    const malformedPath = join(
      inputRoot,
      "malformed",
      "20260721T192032",
      "mission_plan.json"
    );
    await mkdir(dirname(malformedPath), {recursive: true});
    await writeFile(malformedPath, "{broken", "utf8");
    const npmCliPath = process.env.npm_execpath;
    if (npmCliPath === undefined) {
      throw new Error("npm_execpath is required for the package CLI test");
    }

    const {stdout, stderr} = await execFileAsync(
      process.execPath,
      [
        npmCliPath,
        "run",
        "data:prepare-algorithm",
        "--",
        "--input-root",
        inputRoot,
        "--output-root",
        outputRoot
      ],
      {
        cwd: process.cwd(),
        timeout: 30_000,
        windowsHide: true
      }
    );

    expect(stdout).toMatch(/Prepared 1 algorithm cases/);
    expect(stderr.trim().split(/\r?\n/u)).toEqual([
      expect.stringMatching(/^\[skip\].*infeasible.*feasible/i),
      expect.stringMatching(/^\[skip\].*malformed.*invalid JSON/i)
    ]);
    expect(await readJson(join(outputRoot, "catalog.json"))).toMatchObject({
      defaultCaseId: "R10-LONG-TRANSIT-01"
    });
  }, 30_000);
});

describe("generated integration catalog", () => {
  it("keeps the real feasible R06 run with original overlap timing and a warning", async () => {
    const generatedRoot = join(
      process.cwd(),
      "public",
      "data",
      "integration-cases"
    );
    const catalog = await readJson(
      join(generatedRoot, "catalog.json")
    ) as CaseCatalogV1;
    const r06 = catalog.cases.find(
      entry => entry.caseId === "R06-CIRCLE-01"
    );

    expect(catalog.cases).toHaveLength(11);
    expect(r06).toMatchObject({
      runId: "20260721T184200",
      bundleUrl: "/data/integration-cases/R06-CIRCLE-01/bundle.json"
    });

    const bundle = await readJson(
      join(generatedRoot, "R06-CIRCLE-01", "bundle.json")
    ) as {
      sorties: Array<{
        assignmentId: string;
        plannedLaunchTimeSec: number;
        segments: Array<{endTimeSec: number}>;
      }>;
      validation: {warnings: string[]};
    };
    const previous = bundle.sorties.find(
      sortie => sortie.assignmentId === "ASG-0003-002"
    );
    const next = bundle.sorties.find(
      sortie => sortie.assignmentId === "ASG-0003-003"
    );

    expect(previous?.segments.at(-1)?.endTimeSec).toBeCloseTo(
      1986.964730811549,
      9
    );
    expect(next?.plannedLaunchTimeSec).toBeCloseTo(
      1986.414871459004,
      9
    );
    expect(bundle.validation.warnings).toContainEqual(
      expect.stringMatching(
        /UAV_SCHEDULE_OVERLAP:.*ASG-0003-002.*ASG-0003-003.*original.*preserved/i
      )
    );
  });
});
