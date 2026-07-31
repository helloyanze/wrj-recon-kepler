import {createHash} from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rmdir,
  unlink,
  writeFile
} from "node:fs/promises";
import {
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep
} from "node:path";
import {pathToFileURL} from "node:url";

import {
  caseBundleSchema
} from "../src/features/cases/caseBundle";
import {
  caseCatalogSchema
} from "../src/features/cases/catalogSchema";
import {
  dynamicSceneCatalogSchema,
  sceneConfigSchema,
  sceneProvenanceSchema
} from "../src/features/dynamic-replanning/dynamicSceneSchema";
import {
  failureReportSchema,
  missionViewV1Schema
} from "../src/features/dynamic-replanning/missionViewSchema";

export interface PrepareTask2Options {
  inputRoot: string;
  baselineRoot: string;
  outputRoot: string;
}

interface OutputEntry {
  absolutePath: string;
  relativePath: string;
  kind: "file" | "directory" | "link";
}

const SCENE_FILES = [
  "scene.json",
  "mission_view.v1.json",
  "dynamic_events.json"
] as const;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toForwardSlashes(value: string): string {
  return value.split(sep).join("/");
}

function isInside(parent: string, candidate: string): boolean {
  const path = relative(parent, candidate);
  return path !== "" && !path.startsWith(`..${sep}`) && path !== ".." &&
    !isAbsolute(path);
}

function assertSafeRoot(path: string, label: string): void {
  const parsed = resolve(path);
  if (parsed === resolve(parsed, sep)) {
    throw new Error(`${label} must not be a filesystem root`);
  }
}

function assertSafeRelativePath(path: string, label: string): void {
  const normalized = path.replaceAll("\\", "/");
  if (
    normalized.startsWith("/") ||
    normalized.split("/").some(part => part === "" || part === "." || part === "..")
  ) {
    throw new Error(`${label} contains an unsafe path: ${path}`);
  }
}

async function validateRoots(
  inputRoot: string,
  baselineRoot: string,
  outputRoot: string
): Promise<void> {
  assertSafeRoot(inputRoot, "inputRoot");
  assertSafeRoot(baselineRoot, "baselineRoot");
  assertSafeRoot(outputRoot, "outputRoot");
  for (const [label, path] of [
    ["inputRoot", inputRoot],
    ["baselineRoot", baselineRoot]
  ] as const) {
    const stats = await lstat(path);
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new Error(`${label} must be a real directory: ${path}`);
    }
  }
  if (
    inputRoot === outputRoot ||
    isInside(inputRoot, outputRoot) ||
    isInside(outputRoot, inputRoot)
  ) {
    throw new Error("inputRoot and outputRoot must not overlap");
  }
  if (
    baselineRoot === outputRoot ||
    isInside(baselineRoot, outputRoot) ||
    isInside(outputRoot, baselineRoot)
  ) {
    throw new Error("baselineRoot and outputRoot must not overlap");
  }
}

function normalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, child]) => [key, normalizeJson(child)])
    );
  }
  return value;
}

function canonicalJson(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(normalizeJson(value))}\n`, "utf8");
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function readJson(path: string, label: string): Promise<{
  bytes: Buffer;
  value: unknown;
}> {
  const stats = await lstat(path);
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error(`${label} must be a real file`);
  }
  const bytes = await readFile(path);
  try {
    return {bytes, value: JSON.parse(bytes.toString("utf8"))};
  } catch (error) {
    throw new Error(`${label}: invalid JSON: ${errorMessage(error)}`);
  }
}

async function buildExpectedFiles(
  options: PrepareTask2Options
): Promise<Map<string, Buffer>> {
  const inputRoot = resolve(options.inputRoot);
  const baselineRoot = resolve(options.baselineRoot);
  const outputRoot = resolve(options.outputRoot);
  await validateRoots(inputRoot, baselineRoot, outputRoot);

  const upstreamCatalogFile = await readJson(
    resolve(inputRoot, "catalog.json"),
    "catalog.json"
  );
  const upstreamCatalog = dynamicSceneCatalogSchema.parse(
    upstreamCatalogFile.value
  );
  const baselineCatalogFile = await readJson(
    resolve(baselineRoot, "catalog.json"),
    "integration-cases/catalog.json"
  );
  const baselineCatalog = caseCatalogSchema.parse(baselineCatalogFile.value);
  const expected = new Map<string, Buffer>();
  const packagedEntries = [];

  for (const entry of upstreamCatalog.scenes) {
    assertSafeRelativePath(entry.baseUrl, `${entry.sceneId}.baseUrl`);
    if (entry.baseUrl !== entry.sceneId) {
      throw new Error(
        `${entry.sceneId}: upstream baseUrl must equal the sceneId`
      );
    }
    const sceneRoot = resolve(inputRoot, entry.baseUrl);
    if (!isInside(inputRoot, sceneRoot)) {
      throw new Error(`${entry.sceneId}: scene root escapes inputRoot`);
    }
    const sceneStats = await lstat(sceneRoot);
    if (sceneStats.isSymbolicLink() || !sceneStats.isDirectory()) {
      throw new Error(`${entry.sceneId}: scene root must be a real directory`);
    }

    const provenanceFile = await readJson(
      resolve(sceneRoot, "provenance.json"),
      `${entry.sceneId}/provenance.json`
    );
    const provenance = sceneProvenanceSchema.parse(provenanceFile.value);
    const parsedFiles = new Map<string, {
      bytes: Buffer;
      value: unknown;
    }>();
    for (const name of SCENE_FILES) {
      const file = await readJson(
        resolve(sceneRoot, name),
        `${entry.sceneId}/${name}`
      );
      const expectedHash = provenance.upstreamSha256[name];
      if (expectedHash === undefined || sha256(file.bytes) !== expectedHash) {
        throw new Error(`${entry.sceneId}/${name}: upstream hash mismatch`);
      }
      parsedFiles.set(name, file);
    }

    let failureFile: {bytes: Buffer; value: unknown} | null = null;
    if (entry.failureReportUrl !== null) {
      assertSafeRelativePath(
        entry.failureReportUrl,
        `${entry.sceneId}.failureReportUrl`
      );
      failureFile = await readJson(
        resolve(sceneRoot, entry.failureReportUrl),
        `${entry.sceneId}/${entry.failureReportUrl}`
      );
      const expectedHash =
        provenance.upstreamSha256[entry.failureReportUrl];
      if (
        expectedHash === undefined ||
        sha256(failureFile.bytes) !== expectedHash
      ) {
        throw new Error(
          `${entry.sceneId}/${entry.failureReportUrl}: upstream hash mismatch`
        );
      }
    }

    const config = sceneConfigSchema.parse(
      parsedFiles.get("scene.json")?.value
    );
    const view = missionViewV1Schema.parse(
      parsedFiles.get("mission_view.v1.json")?.value
    );
    const failureReport = failureFile === null
      ? null
      : failureReportSchema.parse(failureFile.value);
    if (
      config.sceneId !== entry.sceneId ||
      config.resultStatus !== entry.resultStatus ||
      view.activePlan.planStatus !== entry.resultStatus
    ) {
      throw new Error(`${entry.sceneId}: status or sceneId mismatch`);
    }
    if (
      (entry.resultStatus === "PARTIAL_SAFE_FALLBACK") !==
      (failureReport !== null)
    ) {
      throw new Error(`${entry.sceneId}: failure report/status mismatch`);
    }

    const baselineEntry = baselineCatalog.cases.find(
      candidate => candidate.caseId === config.baselineCaseId
    );
    if (baselineEntry === undefined) {
      throw new Error(
        `${entry.sceneId}: baseline case ${config.baselineCaseId} not found`
      );
    }
    assertSafeRelativePath(
      encodeURIComponent(baselineEntry.caseId),
      `${entry.sceneId}.baselineCaseId`
    );
    const baselineFile = await readJson(
      resolve(
        baselineRoot,
        encodeURIComponent(baselineEntry.caseId),
        "bundle.json"
      ),
      `${entry.sceneId}/baseline.bundle.json`
    );
    const baseline = caseBundleSchema.parse(baselineFile.value);
    if (baseline.case.caseId !== config.baselineCaseId) {
      throw new Error(`${entry.sceneId}: baseline bundle caseId mismatch`);
    }

    const scenePrefix = entry.sceneId;
    const packagedHashes: Record<string, string> = {};
    for (const name of SCENE_FILES) {
      const bytes = canonicalJson(parsedFiles.get(name)?.value);
      expected.set(`${scenePrefix}/${name}`, bytes);
      packagedHashes[name] = sha256(bytes);
    }
    const baselineBytes = canonicalJson(baseline);
    expected.set(`${scenePrefix}/baseline.bundle.json`, baselineBytes);
    packagedHashes["baseline.bundle.json"] = sha256(baselineBytes);
    if (failureFile !== null && entry.failureReportUrl !== null) {
      const failureBytes = canonicalJson(failureReport);
      expected.set(
        `${scenePrefix}/${entry.failureReportUrl}`,
        failureBytes
      );
      packagedHashes[entry.failureReportUrl] = sha256(failureBytes);
    }
    const packagedProvenance = {
      ...provenance,
      packagedSha256: packagedHashes
    };
    expected.set(
      `${scenePrefix}/provenance.json`,
      canonicalJson(packagedProvenance)
    );
    packagedEntries.push({
      ...entry,
      baseUrl: `task2/scenes/${entry.sceneId}`
    });
  }

  expected.set("catalog.json", canonicalJson({
    version: 1,
    defaultSceneId: upstreamCatalog.defaultSceneId,
    scenes: packagedEntries
  }));
  return expected;
}

async function listOutputEntries(
  root: string,
  current = root
): Promise<OutputEntry[]> {
  let names: string[];
  try {
    names = await readdir(current);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" && current === root) return [];
    throw error;
  }
  const entries: OutputEntry[] = [];
  for (const name of names.sort((left, right) =>
    left.localeCompare(right, "en")
  )) {
    const absolutePath = resolve(current, name);
    if (!isInside(root, absolutePath)) {
      throw new Error(`output entry escapes outputRoot: ${absolutePath}`);
    }
    const stats = await lstat(absolutePath);
    const relativePath = toForwardSlashes(relative(root, absolutePath));
    if (stats.isSymbolicLink()) {
      entries.push({absolutePath, relativePath, kind: "link"});
    } else if (stats.isDirectory()) {
      entries.push({absolutePath, relativePath, kind: "directory"});
      entries.push(...await listOutputEntries(root, absolutePath));
    } else if (stats.isFile()) {
      entries.push({absolutePath, relativePath, kind: "file"});
    }
  }
  return entries;
}

async function compareOutput(
  outputRoot: string,
  expected: Map<string, Buffer>
): Promise<string[]> {
  const entries = await listOutputEntries(outputRoot);
  const files = new Map(
    entries
      .filter(entry => entry.kind === "file")
      .map(entry => [entry.relativePath, entry])
  );
  const diagnostics: string[] = [];
  for (const entry of entries) {
    if (entry.kind === "link") {
      diagnostics.push(`symlink: ${entry.relativePath}`);
    }
  }
  for (const [relativePath, bytes] of expected) {
    const actual = files.get(relativePath);
    if (actual === undefined) {
      diagnostics.push(`missing: ${relativePath}`);
    } else if (!(await readFile(actual.absolutePath)).equals(bytes)) {
      diagnostics.push(`changed: ${relativePath}`);
    }
  }
  for (const entry of files.values()) {
    if (!expected.has(entry.relativePath)) {
      diagnostics.push(`extra: ${entry.relativePath}`);
    }
  }
  return diagnostics.sort((left, right) => left.localeCompare(right, "en"));
}

export async function checkTask2Scenes(
  options: PrepareTask2Options
): Promise<void> {
  const outputRoot = resolve(options.outputRoot);
  const expected = await buildExpectedFiles(options);
  const diagnostics = await compareOutput(outputRoot, expected);
  if (diagnostics.length > 0) {
    throw new Error(`Task 2 scene check failed:\n${diagnostics.join("\n")}`);
  }
}

export async function prepareTask2Scenes(
  options: PrepareTask2Options
): Promise<void> {
  const outputRoot = resolve(options.outputRoot);
  const expected = await buildExpectedFiles(options);
  const existing = await listOutputEntries(outputRoot);
  if (existing.some(entry => entry.kind === "link")) {
    throw new Error("outputRoot contains symlinks");
  }
  await mkdir(outputRoot, {recursive: true});

  for (const [relativePath, bytes] of expected) {
    const destination = resolve(outputRoot, relativePath);
    if (!isInside(outputRoot, destination)) {
      throw new Error(`output path escapes outputRoot: ${relativePath}`);
    }
    await mkdir(dirname(destination), {recursive: true});
    await writeFile(destination, bytes);
  }

  const expectedFiles = new Set(expected.keys());
  for (const entry of existing
    .filter(item => item.kind === "file" && !expectedFiles.has(item.relativePath))) {
    await unlink(entry.absolutePath);
  }
  for (const entry of existing
    .filter(item => item.kind === "directory")
    .sort((left, right) => right.relativePath.length - left.relativePath.length)) {
    try {
      await rmdir(entry.absolutePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOTEMPTY") throw error;
    }
  }
}

interface CliOptions extends PrepareTask2Options {
  check: boolean;
}

function parseCli(argv: string[]): CliOptions {
  let inputRoot: string | null = null;
  let baselineRoot = resolve("public/data/integration-cases");
  let outputRoot = resolve("public/data/task2/scenes");
  let check = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") {
      check = true;
    } else if (argument === "--input") {
      inputRoot = argv[++index] ?? null;
    } else if (argument === "--baseline-root") {
      baselineRoot = argv[++index] ?? "";
    } else if (argument === "--output") {
      outputRoot = argv[++index] ?? "";
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (inputRoot === null || inputRoot.trim() === "") {
    throw new Error("--input is required");
  }
  return {inputRoot, baselineRoot, outputRoot, check};
}

async function main(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  if (options.check) {
    await checkTask2Scenes(options);
    console.log("Task 2 scene assets are current.");
  } else {
    await prepareTask2Scenes(options);
    console.log(`Prepared Task 2 scene assets in ${resolve(options.outputRoot)}`);
  }
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(resolve(invokedPath)).href
) {
  void main().catch((error: unknown) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
