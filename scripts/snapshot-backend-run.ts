// 从后端输出目录快照一次算法运行到受控输入目录（data/integration-validation）。
//
// 设计原则：后端源路径绝不写死在仓库代码里。
//   - --backend-output 为必填参数（或环境变量 WRJ_BACKEND_OUTPUT），无默认值；
//   - 本文件内没有任何对后端磁盘位置的字面量引用；
//   - 快照只是复制输入，不负责生成 bundle/catalog（那由 data:prepare-algorithm 完成）。
//
// 用法见 --help。

import {
  copyFile,
  lstat,
  mkdir,
  readdir,
  readFile
} from "node:fs/promises";
import {dirname, join, relative, resolve, sep} from "node:path";
import {fileURLToPath} from "node:url";

const DEFAULT_INPUT_ROOT = "data/integration-validation";
const BACKEND_OUTPUT_ENV = "WRJ_BACKEND_OUTPUT";
// 与受控目录里已有快照一致：跳过 logs/ 与各类点文件/临时目录。
const SKIPPED_DIRECTORY_NAMES = new Set(["logs"]);

interface SnapshotOptions {
  backendOutputRoot: string | undefined;
  caseId: string | undefined;
  runId: string | undefined;
  inputRoot: string;
  dryRun: boolean;
  help: boolean;
}

interface PlannedFile {
  source: string;
  target: string;
}

export function parseCliArgs(args: readonly string[]): SnapshotOptions {
  const options: SnapshotOptions = {
    backendOutputRoot: process.env[BACKEND_OUTPUT_ENV]?.trim() || undefined,
    caseId: undefined,
    runId: undefined,
    inputRoot: DEFAULT_INPUT_ROOT,
    dryRun: false,
    help: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") {
      options.help = true;
      continue;
    }
    if (argument === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (
      argument !== "--backend-output" &&
      argument !== "--case-id" &&
      argument !== "--run-id" &&
      argument !== "--input-root"
    ) {
      throw new Error(`Unknown argument: ${argument}`);
    }

    const value = args[index + 1];
    if (value === undefined) {
      throw new Error(`Missing value for ${argument}`);
    }
    if (argument === "--backend-output") {
      options.backendOutputRoot = value;
    } else if (argument === "--case-id") {
      options.caseId = value;
    } else if (argument === "--run-id") {
      options.runId = value;
    } else if (argument === "--input-root") {
      options.inputRoot = value;
    }
    index += 1;
  }

  return options;
}

function usage(): string {
  return [
    "Snapshot a backend algorithm run into the controlled input directory.",
    "",
    "Usage:",
    "  vite-node --script scripts/snapshot-backend-run.ts \\",
    "    --backend-output <BACKEND_OUTPUT_ROOT> --case-id <CASE_ID> [--run-id <RUN_ID>]",
    "",
    "Options:",
    "  --backend-output <root>  Backend output root that contains <case-id>/<run-id>/",
    "                           mission_plan.json. Required unless the WRJ_BACKEND_OUTPUT",
    "                           environment variable is set. No default is read from the repo.",
    "  --case-id <id>           Backend case directory to snapshot, e.g. R01-BASELINE-01.",
    "                           Required.",
    "  --run-id <run>           Specific run to snapshot. Defaults to the latest run under",
    "                           <backend-output>/<case-id> that contains a mission_plan.json.",
    "  --input-root <dir>       Controlled input root to copy into.",
    "                           Default: " + DEFAULT_INPUT_ROOT,
    "  --dry-run                Print what would be copied without writing anything.",
    "  --help                   Show this help.",
    "",
    "Copies the selected backend run into <input-root>/<case-id>/<run-id>/, skipping logs/ and",
    "dotfile entries, mirroring the committed snapshot layout. The backend path is never read",
    "from repository files."
  ].join("\n");
}

async function isDirectoryNotLink(path: string): Promise<boolean> {
  try {
    const stat = await lstat(path);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      return false;
    }
    throw error;
  }
}

async function isRegularFileNotLink(path: string): Promise<boolean> {
  try {
    const stat = await lstat(path);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      return false;
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

function assertSingleSegment(value: string, label: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length === 0 ||
    trimmed === "." ||
    trimmed === ".." ||
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    trimmed.includes(sep)
  ) {
    throw new Error(`${label} must be a single path segment: ${value}`);
  }
  return trimmed;
}

async function resolveRequiredDirectory(
  value: string,
  label: string
): Promise<string> {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${label} must be an explicit non-empty path`);
  }
  const absolute = resolve(trimmed);
  if (!(await isDirectoryNotLink(absolute))) {
    throw new Error(
      `${label} must be an existing non-symbolic-link directory: ${absolute}`
    );
  }
  return absolute;
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

function isSkippedEntry(name: string): boolean {
  return (
    name.startsWith(".") ||
    SKIPPED_DIRECTORY_NAMES.has(name.toLowerCase())
  );
}

/** 列出 run 目录下应被快照的源文件（跳过 logs/、点文件与符号链接）。 */
async function listRunFiles(
  runRoot: string
): Promise<string[]> {
  const files: string[] = [];

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, {withFileTypes: true});
    entries.sort((left, right) => compareStrings(left.name, right.name));
    for (const entry of entries) {
      if (isSkippedEntry(entry.name)) {
        continue;
      }
      const entryPath = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  }

  await visit(runRoot);
  return files;
}

/** 选择要快照的 run：--run-id 指定，否则取含 mission_plan.json 的最新 run。 */
async function selectRun(
  backendCaseRoot: string,
  requestedRunId: string | undefined
): Promise<string> {
  const entries = await readdir(backendCaseRoot, {withFileTypes: true});
  const runDirectories: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || isSkippedEntry(entry.name)) {
      continue;
    }
    const missionPath = join(backendCaseRoot, entry.name, "mission_plan.json");
    if (await isRegularFileNotLink(missionPath)) {
      runDirectories.push(entry.name);
    }
  }
  runDirectories.sort(compareStrings);

  if (requestedRunId !== undefined) {
    const normalized = assertSingleSegment(requestedRunId, "runId");
    if (!runDirectories.includes(normalized)) {
      const available = runDirectories.length === 0
        ? "(none found)"
        : runDirectories.join(", ");
      throw new Error(
        `Run ${normalized} has no mission_plan.json under ${backendCaseRoot}; ` +
        `available runs: ${available}`
      );
    }
    return normalized;
  }

  if (runDirectories.length === 0) {
    throw new Error(
      `No run with a mission_plan.json was found under ${backendCaseRoot}`
    );
  }
  const latest = runDirectories[runDirectories.length - 1];
  console.log(`Selected latest run: ${latest}`);
  return latest;
}

async function verifyMissionPlan(missionPath: string): Promise<void> {
  let raw: string;
  try {
    raw = await readFile(missionPath, "utf8");
  } catch (error) {
    throw new Error(`Failed to read ${missionPath}: ${errorMessage(error)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Refusing to snapshot run with invalid mission_plan.json (${errorMessage(error)}): ` +
      missionPath
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      `Refusing to snapshot run whose mission_plan.json is not a JSON object: ${missionPath}`
    );
  }
}

export async function snapshotBackendRun(
  options: SnapshotOptions
): Promise<{files: string[]; destinationRoot: string}> {
  const backendOutputRoot = options.backendOutputRoot;
  if (backendOutputRoot === undefined) {
    throw new Error(
      `--backend-output is required (or set ${BACKEND_OUTPUT_ENV}); no default is hardcoded. ` +
      "Run with --help for usage."
    );
  }
  const caseId = options.caseId;
  if (caseId === undefined) {
    throw new Error(
      "--case-id is required; run with --help for usage."
    );
  }
  const normalizedCaseId = assertSingleSegment(caseId, "caseId");

  const absoluteBackendRoot = await resolveRequiredDirectory(
    backendOutputRoot,
    "backend-output"
  );
  const inputRoot = await resolveRequiredDirectory(options.inputRoot, "input-root");

  const backendCaseRoot = join(absoluteBackendRoot, normalizedCaseId);
  if (!(await isDirectoryNotLink(backendCaseRoot))) {
    throw new Error(
      `Backend case directory does not exist: ${backendCaseRoot}`
    );
  }

  const runId = await selectRun(backendCaseRoot, options.runId);
  const normalizedRunId = assertSingleSegment(runId, "runId");

  const sourceRunRoot = join(backendCaseRoot, normalizedRunId);
  await verifyMissionPlan(join(sourceRunRoot, "mission_plan.json"));

  const destinationRoot = resolve(inputRoot, normalizedCaseId, normalizedRunId);
  // 防止把快照写回后端输出自身。
  const overlapGuard = `${absoluteBackendRoot}${sep}`;
  if (destinationRoot.startsWith(overlapGuard)) {
    throw new Error(
      `Refusing to snapshot into the backend output tree itself: ${destinationRoot}`
    );
  }

  const sourceFiles = await listRunFiles(sourceRunRoot);
  const planned: PlannedFile[] = sourceFiles.map(source => ({
    source,
    target: join(
      destinationRoot,
      relative(sourceRunRoot, source)
    )
  }));

  if (options.dryRun) {
    for (const file of planned) {
      console.log(`would copy ${relative(sourceRunRoot, file.source)} -> ${file.target}`);
    }
  } else {
    for (const file of planned) {
      await mkdir(dirname(file.target), {recursive: true});
      await copyFile(file.source, file.target);
    }
  }

  return {files: planned.map(file => file.target), destinationRoot};
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseCliArgs(args);
  if (options.help) {
    console.log(usage());
    return;
  }

  const result = await snapshotBackendRun(options);
  const action = options.dryRun ? "Would copy" : "Copied";
  console.log(
    `${action} ${result.files.length} file(s) into ${result.destinationRoot}.`
  );
  console.log(
    "Next: review any [skip] diagnostics from `npm run data:prepare-algorithm`."
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
