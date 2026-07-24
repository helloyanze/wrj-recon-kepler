import {createHash} from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rmdir,
  unlink,
  writeFile
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  parse,
  relative,
  resolve,
  sep
} from "node:path";
import {fileURLToPath} from "node:url";
import {
  CASE_CATALOG_VERSION,
  caseCatalogSchema,
  type CaseCatalogEntry,
  type CaseCatalogV1
} from "../src/features/cases/catalogSchema";
import {
  type CaseBundleV2
} from "../src/features/cases/caseBundle";
import {convertMissionPlan} from "../src/features/cases/convertMissionPlan";
import {
  parseMissionPlan
} from "../src/features/cases/missionPlanSchema";

const DEFAULT_CASE_ID = "R10-LONG-TRANSIT-01";
const DEFAULT_IMPORTED_AT = "1970-01-01T00:00:00.000Z";
const SKIPPED_DIRECTORY_NAMES = new Set([
  "$recycle.bin",
  "intermediate",
  "node_modules",
  "system volume information"
]);

export interface SelectedRun {
  caseId: string;
  planId: string;
  runId: string;
  sourcePath: string;
  missionPath: string;
  bundle: CaseBundleV2;
}

export interface DiscoveryResult {
  selectedRuns: Map<string, SelectedRun>;
  diagnostics: string[];
}

export interface PrepareAlgorithmCasesOptions {
  inputRoot: string;
  outputRoot: string;
  defaultCaseId?: string;
  check?: boolean;
}

export interface PrepareAlgorithmCasesResult {
  catalog: CaseCatalogV1;
  diagnostics: string[];
  files: string[];
}

export interface CliOptions {
  inputRoot: string;
  outputRoot: string;
  defaultCaseId: string;
  check: boolean;
}

interface OutputEntry {
  absolutePath: string;
  relativePath: string;
  kind: "directory" | "file" | "link";
}

export async function discoverValidRuns(
  inputRoot: string
): Promise<DiscoveryResult> {
  const absoluteInputRoot = resolve(inputRoot);
  await assertInputRoot(absoluteInputRoot);
  const missionPaths = await findMissionPlans(absoluteInputRoot);
  const diagnostics: string[] = [];
  const selectedRuns = new Map<string, SelectedRun>();

  for (const missionPath of missionPaths) {
    const sourcePath = toForwardSlashes(
      relative(absoluteInputRoot, missionPath)
    );
    try {
      const missionBytes = await readFile(missionPath);
      let missionValue: unknown;
      try {
        missionValue = JSON.parse(missionBytes.toString("utf8"));
      } catch (error) {
        throw new Error(`invalid JSON: ${errorMessage(error)}`);
      }

      const missionPlan = parseMissionPlan(
        adaptAlgorithmMissionPlan(missionValue),
        sourcePath
      );
      assertSafeCaseId(missionPlan.caseId);
      const runId = basename(dirname(missionPath));
      const regionProfile = await readOptionalRegionProfile(
        dirname(missionPath),
        sourcePath,
        diagnostics
      );
      const importedAt = importedAtForRun(runId, sourcePath, diagnostics);
      const sha256 = createHash("sha256").update(missionBytes).digest("hex");
      const bundle = convertMissionPlan({
        missionPlan,
        regionProfile,
        sourceName: sourcePath,
        sourceRun: runId,
        importedAt,
        sha256
      });
      const candidate: SelectedRun = {
        caseId: missionPlan.caseId,
        planId: missionPlan.planId,
        runId,
        sourcePath,
        missionPath,
        bundle
      };
      const current = selectedRuns.get(candidate.caseId);
      if (current === undefined || isPreferredRun(candidate, current)) {
        selectedRuns.set(candidate.caseId, candidate);
      }
    } catch (error) {
      diagnostics.push(`[skip] ${sourcePath}: ${errorMessage(error)}`);
    }
  }

  return {
    selectedRuns: new Map(
      [...selectedRuns.entries()].sort(([left], [right]) =>
        compareStrings(left, right)
      )
    ),
    diagnostics
  };
}

export async function prepareAlgorithmCases(
  options: PrepareAlgorithmCasesOptions
): Promise<PrepareAlgorithmCasesResult> {
  const inputRoot = resolveRequiredPath(options.inputRoot, "inputRoot");
  const outputRoot = resolveRequiredPath(options.outputRoot, "outputRoot");
  await validateRoots(inputRoot, outputRoot);

  const discovery = await discoverValidRuns(inputRoot);
  if (discovery.selectedRuns.size === 0) {
    const details =
      discovery.diagnostics.length === 0
        ? ""
        : `\n${discovery.diagnostics.join("\n")}`;
    throw new Error(`No valid algorithm cases were discovered.${details}`);
  }

  const defaultCaseId = options.defaultCaseId ?? DEFAULT_CASE_ID;
  if (!discovery.selectedRuns.has(defaultCaseId)) {
    throw new Error(
      `Default case ${defaultCaseId} was not found among valid cases: ` +
      [...discovery.selectedRuns.keys()].join(", ")
    );
  }

  const expectedFiles = buildExpectedFiles(
    discovery.selectedRuns,
    defaultCaseId
  );
  const catalog = caseCatalogSchema.parse(
    JSON.parse(expectedFiles.get("catalog.json") ?? "")
  );

  if (options.check === true) {
    await checkOutputTree(outputRoot, expectedFiles);
  } else {
    await writeOutputTree(outputRoot, expectedFiles);
  }

  return {
    catalog,
    diagnostics: discovery.diagnostics,
    files: [...expectedFiles.keys()]
  };
}

export function parseCliArgs(args: readonly string[]): CliOptions {
  const options: CliOptions = {
    inputRoot: "data/integration-validation",
    outputRoot: "public/data/integration-cases",
    defaultCaseId: DEFAULT_CASE_ID,
    check: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--check") {
      options.check = true;
      continue;
    }
    if (
      argument !== "--input-root" &&
      argument !== "--output-root" &&
      argument !== "--default-case"
    ) {
      throw new Error(`Unknown argument: ${argument}`);
    }

    const value = args[index + 1];
    if (value === undefined) {
      throw new Error(`Missing value for ${argument}`);
    }
    if (argument === "--input-root") {
      options.inputRoot = value;
    } else if (argument === "--output-root") {
      options.outputRoot = value;
    } else if (argument === "--default-case") {
      options.defaultCaseId = value;
    }
    index += 1;
  }

  return options;
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseCliArgs(args);
  const result = await prepareAlgorithmCases(options);
  const action = options.check ? "Checked" : "Prepared";
  console.log(
    `${action} ${result.catalog.cases.length} algorithm cases ` +
    `(${result.files.length} files), default ${result.catalog.defaultCaseId}; ` +
    `${result.diagnostics.length} diagnostics.`
  );
}

async function findMissionPlans(inputRoot: string): Promise<string[]> {
  const missionPaths: string[] = [];

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, {withFileTypes: true});
    entries.sort((left, right) => compareStrings(left.name, right.name));

    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        continue;
      }
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (isSkippedDirectory(entry.name)) {
          continue;
        }
        await visit(entryPath);
      } else if (entry.isFile() && entry.name === "mission_plan.json") {
        missionPaths.push(entryPath);
      }
    }
  }

  await visit(inputRoot);
  missionPaths.sort((left, right) => compareStrings(left, right));
  return missionPaths;
}

function isSkippedDirectory(name: string): boolean {
  return (
    name.startsWith(".") ||
    SKIPPED_DIRECTORY_NAMES.has(name.toLowerCase())
  );
}

async function readOptionalRegionProfile(
  runDirectory: string,
  sourcePath: string,
  diagnostics: string[]
): Promise<unknown | undefined> {
  const intermediatePath = join(runDirectory, "intermediate");
  const intermediateStat = await lstatIfExists(intermediatePath);
  if (intermediateStat === undefined) {
    return undefined;
  }
  if (intermediateStat.isSymbolicLink() || !intermediateStat.isDirectory()) {
    diagnostics.push(
      `[fallback] ${sourcePath}: intermediate is not a safe directory; ` +
      "region_profile.json ignored"
    );
    return undefined;
  }

  const profilePath = join(intermediatePath, "region_profile.json");
  const profileStat = await lstatIfExists(profilePath);
  if (profileStat === undefined) {
    return undefined;
  }
  if (profileStat.isSymbolicLink() || !profileStat.isFile()) {
    diagnostics.push(
      `[fallback] ${sourcePath}: intermediate/region_profile.json is not a ` +
      "regular file and was ignored"
    );
    return undefined;
  }

  try {
    return JSON.parse(await readFile(profilePath, "utf8"));
  } catch (error) {
    diagnostics.push(
      `[fallback] ${sourcePath}: intermediate/region_profile.json has invalid ` +
      `JSON (${errorMessage(error)}); strip-derived region used`
    );
    return undefined;
  }
}

function importedAtForRun(
  runId: string,
  sourcePath: string,
  diagnostics: string[]
): string {
  const match =
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(runId);
  if (match !== null) {
    const values = match.slice(1).map(Number);
    const timestamp = Date.UTC(
      values[0],
      values[1] - 1,
      values[2],
      values[3],
      values[4],
      values[5]
    );
    const date = new Date(timestamp);
    if (
      Number.isFinite(timestamp) &&
      date.getUTCFullYear() === values[0] &&
      date.getUTCMonth() === values[1] - 1 &&
      date.getUTCDate() === values[2] &&
      date.getUTCHours() === values[3] &&
      date.getUTCMinutes() === values[4] &&
      date.getUTCSeconds() === values[5]
    ) {
      return date.toISOString();
    }
  }

  diagnostics.push(
    `[fallback] ${sourcePath}: runId ${runId} is not a valid ` +
    `YYYYMMDDTHHMMSS timestamp; deterministic epoch used`
  );
  return DEFAULT_IMPORTED_AT;
}

function isPreferredRun(candidate: SelectedRun, current: SelectedRun): boolean {
  const runComparison = compareStrings(candidate.runId, current.runId);
  return (
    runComparison > 0 ||
    (runComparison === 0 &&
      compareStrings(candidate.sourcePath, current.sourcePath) < 0)
  );
}

function assertSafeCaseId(caseId: string): void {
  if (
    caseId === "." ||
    caseId === ".." ||
    /[\\/]/u.test(caseId) ||
    [...caseId].some(character => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 0x1f || codePoint === 0x7f;
    })
  ) {
    throw new Error(
      `caseId ${JSON.stringify(caseId)} contains a path separator, control ` +
      "character, or traversal segment"
    );
  }

  if (caseId.endsWith(".") || caseId.endsWith(" ")) {
    throw new Error(
      `caseId ${JSON.stringify(caseId)} must be Windows-safe and cannot end ` +
      "with a trailing dot or trailing space"
    );
  }

  const encodedCaseId = encodeCaseDirectory(caseId);
  const windowsStem = encodedCaseId.split(".", 1)[0].toLowerCase();
  if (
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/u.test(windowsStem)
  ) {
    throw new Error(
      `caseId ${JSON.stringify(caseId)} maps to Windows reserved directory ` +
      encodedCaseId
    );
  }
  if (/[<>:"/\\|?*]/u.test(encodedCaseId)) {
    throw new Error(
      `caseId ${JSON.stringify(caseId)} does not map to a Windows-safe ` +
      "directory name"
    );
  }
}

function encodeCaseDirectory(caseId: string): string {
  try {
    return encodeURIComponent(caseId);
  } catch (error) {
    throw new Error(
      `caseId ${JSON.stringify(caseId)} cannot be safely URL-encoded: ` +
      errorMessage(error)
    );
  }
}

function adaptAlgorithmMissionPlan(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  if (typeof value.finalScore === "number") {
    value.finalScore = {total: value.finalScore};
  }

  const assignmentPlan = value.assignmentPlan;
  if (!isRecord(assignmentPlan)) {
    return value;
  }
  const snapshot = assignmentPlan.stripPlanSnapshot;
  if (!isRecord(snapshot)) {
    return value;
  }

  if (Array.isArray(snapshot.compatibleFlightCandidates)) {
    snapshot.compatibleFlightCandidates =
      snapshot.compatibleFlightCandidates.map(candidate => {
        if (
          isRecord(candidate) &&
          typeof candidate.candidateId === "string"
        ) {
          return candidate.candidateId;
        }
        return candidate;
      });
  }

  if (Array.isArray(snapshot.strips)) {
    for (const strip of snapshot.strips) {
      if (!isRecord(strip) || !isRecord(strip.coveragePolygon)) {
        continue;
      }
      const polygon = strip.coveragePolygon;
      if (
        polygon.type !== "Polygon" ||
        !Array.isArray(polygon.coordinates) ||
        !Array.isArray(polygon.coordinates[0])
      ) {
        continue;
      }
      const points = polygon.coordinates[0].map(coordinate => {
        if (
          !Array.isArray(coordinate) ||
          typeof coordinate[0] !== "number" ||
          typeof coordinate[1] !== "number"
        ) {
          return coordinate;
        }
        return {xM: coordinate[0], yM: coordinate[1]};
      });
      strip.coveragePolygon = points;
    }
  }

  return value;
}

function buildExpectedFiles(
  selectedRuns: ReadonlyMap<string, SelectedRun>,
  defaultCaseId: string
): Map<string, string> {
  const sortedRuns = [...selectedRuns.values()].sort((left, right) =>
    compareStrings(left.caseId, right.caseId)
  );
  const encodedDirectories = new Map<string, string>();
  const encodedByCaseId = new Map<string, string>();
  for (const selected of sortedRuns) {
    const encodedCaseId = encodeCaseDirectory(selected.caseId);
    const collisionKey = encodedCaseId.normalize("NFC").toLowerCase();
    const existingCaseId = encodedDirectories.get(collisionKey);
    if (
      existingCaseId !== undefined &&
      existingCaseId !== selected.caseId
    ) {
      throw new Error(
        `Case output directory collision between ${existingCaseId} and ` +
        `${selected.caseId} under Windows filesystem semantics`
      );
    }
    encodedDirectories.set(collisionKey, selected.caseId);
    encodedByCaseId.set(selected.caseId, encodedCaseId);
  }

  const entries: CaseCatalogEntry[] = sortedRuns
    .map(selected => {
      const encodedCaseId = encodedByCaseId.get(selected.caseId);
      if (encodedCaseId === undefined) {
        throw new Error(
          `Internal error: encoded case directory missing for ${selected.caseId}`
        );
      }
      const bundleUrl =
        `/data/integration-cases/${encodedCaseId}/bundle.json`;
      return {
        caseId: selected.caseId,
        planId: selected.planId,
        displayName: selected.bundle.case.displayName,
        runId: selected.runId,
        bundleUrl,
        sourcePath: selected.sourcePath,
        metrics: {
          uavCount: selected.bundle.metrics.uavCount,
          sortieCount: selected.bundle.metrics.sortieCount,
          batchCount: selected.bundle.metrics.batchCount,
          stripCount: selected.bundle.metrics.stripCount,
          missionMakespanSec: selected.bundle.metrics.missionMakespanSec
        },
        warnings: [...selected.bundle.validation.warnings]
      };
    });
  const catalog = caseCatalogSchema.parse({
    version: CASE_CATALOG_VERSION,
    defaultCaseId,
    cases: entries
  });
  const files = new Map<string, string>();
  files.set("catalog.json", serializeJson(catalog));
  for (const entry of entries) {
    const selected = selectedRuns.get(entry.caseId);
    if (selected === undefined) {
      throw new Error(`Internal error: selected case ${entry.caseId} missing`);
    }
    files.set(
      `${encodedByCaseId.get(entry.caseId) ?? encodeCaseDirectory(entry.caseId)}/bundle.json`,
      serializeJson(selected.bundle)
    );
  }
  return files;
}

function serializeJson(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

async function checkOutputTree(
  outputRoot: string,
  expectedFiles: ReadonlyMap<string, string>
): Promise<void> {
  const rootStat = await lstatIfExists(outputRoot);
  if (rootStat === undefined) {
    throwOutputDifferences([...expectedFiles.keys()], [], []);
  }
  assertSafeOutputRootStat(outputRoot, rootStat);

  const actualEntries = await collectOutputEntries(outputRoot);
  const entriesByPath = new Map(
    actualEntries.map(entry => [entry.relativePath, entry])
  );
  const expectedDirectories = expectedDirectoryPaths(expectedFiles.keys());
  const missing: string[] = [];
  const changed: string[] = [];
  const extra: string[] = [];

  for (const [relativePath, expectedText] of expectedFiles) {
    const actual = entriesByPath.get(relativePath);
    if (actual === undefined) {
      missing.push(relativePath);
    } else if (
      actual.kind !== "file" ||
      await readFile(actual.absolutePath, "utf8") !== expectedText
    ) {
      changed.push(relativePath);
    }
  }

  for (const entry of actualEntries) {
    if (
      entry.kind === "directory" &&
      !expectedDirectories.has(entry.relativePath)
    ) {
      extra.push(`${entry.relativePath}/`);
    } else if (
      entry.kind !== "directory" &&
      !expectedFiles.has(entry.relativePath)
    ) {
      extra.push(entry.relativePath);
    }
  }
  extra.sort(compareStrings);

  if (missing.length > 0 || changed.length > 0 || extra.length > 0) {
    throwOutputDifferences(missing, changed, extra);
  }
}

function throwOutputDifferences(
  missing: readonly string[],
  changed: readonly string[],
  extra: readonly string[]
): never {
  const details: string[] = [];
  if (missing.length > 0) {
    details.push(`missing: ${missing.join(", ")}`);
  }
  if (changed.length > 0) {
    details.push(`changed: ${changed.join(", ")}`);
  }
  if (extra.length > 0) {
    details.push(`extra: ${extra.join(", ")}`);
  }
  throw new Error(`Algorithm case output check failed:\n${details.join("\n")}`);
}

async function writeOutputTree(
  outputRoot: string,
  expectedFiles: ReadonlyMap<string, string>
): Promise<void> {
  await ensureSafeOutputDirectory(outputRoot);

  for (const [relativePath, contents] of expectedFiles) {
    await writeContainedFile(outputRoot, relativePath, contents);
  }

  const entries = await collectOutputEntries(outputRoot);
  const expectedDirectories = expectedDirectoryPaths(expectedFiles.keys());
  for (const entry of entries) {
    assertContained(outputRoot, entry.absolutePath);
    if (
      entry.kind !== "directory" &&
      !expectedFiles.has(entry.relativePath)
    ) {
      await unlink(entry.absolutePath);
    } else if (
      entry.kind === "directory" &&
      !expectedDirectories.has(entry.relativePath)
    ) {
      await rmdir(entry.absolutePath);
    }
  }
}

async function ensureSafeOutputDirectory(outputRoot: string): Promise<void> {
  await assertNoSymlinkComponents(outputRoot);
  await mkdir(outputRoot, {recursive: true});
  const stat = await lstat(outputRoot);
  assertSafeOutputRootStat(outputRoot, stat);
}

async function writeContainedFile(
  outputRoot: string,
  relativePath: string,
  contents: string
): Promise<void> {
  const parts = validateRelativeOutputPath(relativePath);
  let parent = outputRoot;
  for (const part of parts.slice(0, -1)) {
    parent = join(parent, part);
    assertContained(outputRoot, parent);
    const stat = await lstatIfExists(parent);
    if (stat === undefined) {
      await mkdir(parent);
    } else if (!stat.isDirectory() || stat.isSymbolicLink()) {
      await removeEntryTree(outputRoot, parent);
      await mkdir(parent);
    }
  }

  const target = join(outputRoot, ...parts);
  assertContained(outputRoot, target);
  const targetStat = await lstatIfExists(target);
  if (
    targetStat !== undefined &&
    (!targetStat.isFile() || targetStat.isSymbolicLink())
  ) {
    await removeEntryTree(outputRoot, target);
  }
  await writeFile(target, contents, "utf8");
}

async function removeEntryTree(
  outputRoot: string,
  target: string
): Promise<void> {
  assertContained(outputRoot, target);
  const stat = await lstatIfExists(target);
  if (stat === undefined) {
    return;
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    await unlink(target);
    return;
  }

  const entries = await readdir(target, {withFileTypes: true});
  entries.sort((left, right) => compareStrings(left.name, right.name));
  for (const entry of entries) {
    await removeEntryTree(outputRoot, join(target, entry.name));
  }
  await rmdir(target);
}

async function collectOutputEntries(
  outputRoot: string
): Promise<OutputEntry[]> {
  const result: OutputEntry[] = [];

  async function visit(directory: string): Promise<void> {
    assertContainedOrRoot(outputRoot, directory);
    const entries = await readdir(directory, {withFileTypes: true});
    entries.sort((left, right) => compareStrings(left.name, right.name));
    for (const entry of entries) {
      const absolutePath = join(directory, entry.name);
      assertContained(outputRoot, absolutePath);
      const stat = await lstat(absolutePath);
      const relativePath = toForwardSlashes(
        relative(outputRoot, absolutePath)
      );
      if (stat.isSymbolicLink()) {
        result.push({absolutePath, relativePath, kind: "link"});
      } else if (stat.isDirectory()) {
        await visit(absolutePath);
        result.push({absolutePath, relativePath, kind: "directory"});
      } else {
        result.push({absolutePath, relativePath, kind: "file"});
      }
    }
  }

  await visit(outputRoot);
  return result;
}

function expectedDirectoryPaths(
  filePaths: Iterable<string>
): Set<string> {
  const directories = new Set<string>();
  for (const filePath of filePaths) {
    const parts = validateRelativeOutputPath(filePath);
    for (let length = 1; length < parts.length; length += 1) {
      directories.add(parts.slice(0, length).join("/"));
    }
  }
  return directories;
}

function validateRelativeOutputPath(relativePath: string): string[] {
  if (
    relativePath.length === 0 ||
    isAbsolute(relativePath) ||
    relativePath.includes("\\")
  ) {
    throw new Error(`Unsafe output path: ${relativePath}`);
  }
  const parts = relativePath.split("/");
  if (parts.some(part => part.length === 0 || part === "." || part === "..")) {
    throw new Error(`Unsafe output path: ${relativePath}`);
  }
  return parts;
}

async function validateRoots(
  inputRoot: string,
  outputRoot: string
): Promise<void> {
  if (outputRoot === parse(outputRoot).root) {
    throw new Error(`outputRoot must not be a filesystem root: ${outputRoot}`);
  }
  await assertInputRoot(inputRoot);
  const outputStat = await lstatIfExists(outputRoot);
  if (outputStat !== undefined) {
    assertSafeOutputRootStat(outputRoot, outputStat);
  }
  const physicalInputRoot = await realpath(inputRoot);
  const physicalOutputRoot = await resolvePhysicalDestination(outputRoot);
  if (
    pathContains(inputRoot, outputRoot) ||
    pathContains(outputRoot, inputRoot) ||
    pathContains(physicalInputRoot, physicalOutputRoot) ||
    pathContains(physicalOutputRoot, physicalInputRoot)
  ) {
    throw new Error(
      `outputRoot must not overlap inputRoot after resolving physical paths ` +
      `(${physicalOutputRoot}, ${physicalInputRoot})`
    );
  }
  await assertNoSymlinkComponents(outputRoot);
}

async function assertInputRoot(inputRoot: string): Promise<void> {
  const stat = await lstatIfExists(inputRoot);
  if (
    stat === undefined ||
    stat.isSymbolicLink() ||
    !stat.isDirectory()
  ) {
    throw new Error(
      `inputRoot must be an existing non-symbolic-link directory: ${inputRoot}`
    );
  }
}

async function resolvePhysicalDestination(target: string): Promise<string> {
  const missingSegments: string[] = [];
  let existingAncestor = target;
  while (await lstatIfExists(existingAncestor) === undefined) {
    const parent = dirname(existingAncestor);
    if (parent === existingAncestor) {
      throw new Error(
        `Could not resolve an existing outputRoot ancestor for ${target}`
      );
    }
    missingSegments.unshift(basename(existingAncestor));
    existingAncestor = parent;
  }
  return resolve(await realpath(existingAncestor), ...missingSegments);
}

function assertSafeOutputRootStat(
  outputRoot: string,
  stat: Awaited<ReturnType<typeof lstat>>
): void {
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(
      `outputRoot must be a non-symbolic-link directory: ${outputRoot}`
    );
  }
}

async function assertNoSymlinkComponents(
  target: string,
  label = "outputRoot"
): Promise<void> {
  const absoluteTarget = resolve(target);
  const root = parse(absoluteTarget).root;
  const remainder = absoluteTarget.slice(root.length);
  const parts = remainder.split(sep).filter(Boolean);
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    const stat = await lstatIfExists(current);
    if (stat === undefined) {
      return;
    }
    if (stat.isSymbolicLink()) {
      throw new Error(`${label} traverses a symbolic link: ${current}`);
    }
  }
}

function pathContains(parent: string, child: string): boolean {
  const childRelative = relative(parent, child);
  return (
    childRelative === "" ||
    (!childRelative.startsWith(`..${sep}`) &&
      childRelative !== ".." &&
      !isAbsolute(childRelative))
  );
}

function assertContained(outputRoot: string, target: string): void {
  if (!pathContains(outputRoot, target) || resolve(target) === outputRoot) {
    throw new Error(
      `Refusing to access path outside outputRoot: ${target}`
    );
  }
}

function assertContainedOrRoot(outputRoot: string, target: string): void {
  if (resolve(target) !== outputRoot) {
    assertContained(outputRoot, target);
  }
}

function resolveRequiredPath(value: string, label: string): string {
  if (value.trim().length === 0) {
    throw new Error(`${label} must be an explicit non-empty path`);
  }
  return resolve(value);
}

async function lstatIfExists(
  path: string
): Promise<Awaited<ReturnType<typeof lstat>> | undefined> {
  try {
    return await lstat(path);
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      return undefined;
    }
    throw error;
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toForwardSlashes(path: string): string {
  return path.replaceAll("\\", "/");
}

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

const directScriptPath =
  process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
if (
  directScriptPath !== undefined &&
  directScriptPath === fileURLToPath(import.meta.url)
) {
  main().catch(error => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
