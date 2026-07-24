import type {CaseBundleV2} from "./caseBundle";
import {
  ALGORITHM_IMPORT_UAV_SCHEDULE_OVERLAP_POLICY,
  convertMissionPlan
} from "./convertMissionPlan";

export const ZIP_LIMITS = {
  compressedBytes: 100 * 1024 * 1024,
  uncompressedBytes: 250 * 1024 * 1024,
  fileCount: 2_000,
  singleFileBytes: 50 * 1024 * 1024
} as const;

export interface ZipLimits {
  compressedBytes: number;
  uncompressedBytes: number;
  fileCount: number;
  singleFileBytes: number;
}

export interface ZipEntryMetadata {
  path: string;
  normalizedPath: string;
  compressedBytes: number;
  uncompressedBytes: number;
  directory: boolean;
  unixMode: number;
}

export interface ExtractedZipEntry {
  path: string;
  bytes: Uint8Array;
}

export type ImportProgressStage = "unzip" | "validate" | "convert";

export interface ImportProgress {
  stage: ImportProgressStage;
  percent: number;
}

export interface ImportPreview {
  caseId: string;
  uavCount: number;
  sortieCount: number;
  batchCount: number;
  stripCount: number;
  durationSec: number;
  warnings: string[];
}

export interface ImportPackageResult {
  bundle: CaseBundleV2;
  preview: ImportPreview;
}

export type ImportWorkerRequest =
  | {
      type: "parse";
      requestId: string;
      fileName: string;
      bytes: ArrayBuffer;
    }
  | {type: "cancel"; requestId: string};

export type ImportWorkerResponse =
  | {
      type: "progress";
      requestId: string;
      stage: ImportProgressStage;
      percent: number;
    }
  | {
      type: "success";
      requestId: string;
      bundle: CaseBundleV2;
      preview: ImportPreview;
    }
  | {type: "failure"; requestId: string; message: string};

export interface ConvertExtractedPackageOptions {
  fileName: string;
  importedAt: string;
  sha256: string;
  signal?: AbortSignal;
}

const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const END_OF_CENTRAL_DIRECTORY_BYTES = 22;
const MAX_ZIP_COMMENT_BYTES = 0xffff;
const UNIX_FILE_TYPE_MASK = 0o170000;
const UNIX_SYMBOLIC_LINK_TYPE = 0o120000;

const OPTIONAL_SIBLING_FILES = [
  "score_report.json",
  "validation_report.json",
  "trajectories.geojson"
] as const;

export function normalizeZipEntryPath(path: string): string {
  if (path.includes("\0")) {
    throw new Error(`Unsafe ZIP path contains NUL: ${JSON.stringify(path)}`);
  }
  const normalizedSeparators = path.replaceAll("\\", "/");
  if (
    normalizedSeparators.startsWith("/") ||
    /^[A-Za-z]:(?:\/|$)/u.test(normalizedSeparators)
  ) {
    throw new Error(`Unsafe absolute or drive ZIP path: ${path}`);
  }

  const withoutTrailingSlash = normalizedSeparators.endsWith("/")
    ? normalizedSeparators.slice(0, -1)
    : normalizedSeparators;
  const parts = withoutTrailingSlash.split("/");
  if (
    withoutTrailingSlash.length === 0 ||
    parts.some(part => part.length === 0 || part === "." || part === "..")
  ) {
    throw new Error(`Unsafe ZIP traversal or ambiguous path: ${path}`);
  }
  return parts.join("/");
}

export function inspectZipArchive(bytes: Uint8Array): ZipEntryMetadata[] {
  if (bytes.byteLength < END_OF_CENTRAL_DIRECTORY_BYTES) {
    throw new Error("Invalid ZIP: end-of-central-directory record is missing");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(view);
  const diskNumber = view.getUint16(eocdOffset + 4, true);
  const centralDirectoryDisk = view.getUint16(eocdOffset + 6, true);
  const diskEntryCount = view.getUint16(eocdOffset + 8, true);
  const totalEntryCount = view.getUint16(eocdOffset + 10, true);
  const centralDirectoryBytes = view.getUint32(eocdOffset + 12, true);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
  const commentBytes = view.getUint16(eocdOffset + 20, true);

  if (
    eocdOffset + END_OF_CENTRAL_DIRECTORY_BYTES + commentBytes !==
    bytes.byteLength
  ) {
    throw new Error("Invalid ZIP: trailing bytes or truncated comment");
  }
  if (
    diskNumber !== 0 ||
    centralDirectoryDisk !== 0 ||
    diskEntryCount !== totalEntryCount
  ) {
    throw new Error("Unsupported multi-disk ZIP archive");
  }
  if (
    totalEntryCount === 0xffff ||
    centralDirectoryBytes === 0xffffffff ||
    centralDirectoryOffset === 0xffffffff
  ) {
    throw new Error("ZIP64 archives are not supported");
  }
  if (
    centralDirectoryOffset + centralDirectoryBytes > eocdOffset ||
    centralDirectoryOffset > bytes.byteLength
  ) {
    throw new Error("Invalid ZIP central-directory bounds");
  }

  const decoder = new TextDecoder("utf-8", {fatal: true});
  const entries: ZipEntryMetadata[] = [];
  const normalizedPaths = new Set<string>();
  let offset = centralDirectoryOffset;
  const centralDirectoryEnd =
    centralDirectoryOffset + centralDirectoryBytes;

  for (let index = 0; index < totalEntryCount; index += 1) {
    if (
      offset + 46 > centralDirectoryEnd ||
      view.getUint32(offset, true) !== CENTRAL_DIRECTORY_SIGNATURE
    ) {
      throw new Error(`Invalid ZIP central-directory entry ${index}`);
    }
    const flags = view.getUint16(offset + 8, true);
    if ((flags & 0x1) !== 0) {
      throw new Error("Encrypted ZIP entries are not supported");
    }
    const compressedBytes = view.getUint32(offset + 20, true);
    const uncompressedBytes = view.getUint32(offset + 24, true);
    const fileNameBytes = view.getUint16(offset + 28, true);
    const extraBytes = view.getUint16(offset + 30, true);
    const entryCommentBytes = view.getUint16(offset + 32, true);
    const diskStart = view.getUint16(offset + 34, true);
    const externalAttributes = view.getUint32(offset + 38, true);
    if (
      compressedBytes === 0xffffffff ||
      uncompressedBytes === 0xffffffff ||
      diskStart === 0xffff
    ) {
      throw new Error("ZIP64 entries are not supported");
    }
    if (diskStart !== 0) {
      throw new Error("Unsupported multi-disk ZIP entry");
    }
    const entryEnd =
      offset + 46 + fileNameBytes + extraBytes + entryCommentBytes;
    if (entryEnd > centralDirectoryEnd) {
      throw new Error(`Invalid ZIP central-directory entry ${index} bounds`);
    }

    const rawPath = decoder.decode(
      bytes.subarray(offset + 46, offset + 46 + fileNameBytes)
    );
    const normalizedPath = normalizeZipEntryPath(rawPath);
    if (normalizedPaths.has(normalizedPath)) {
      throw new Error(`Duplicate normalized ZIP path: ${normalizedPath}`);
    }
    normalizedPaths.add(normalizedPath);

    const unixMode = externalAttributes >>> 16;
    if ((unixMode & UNIX_FILE_TYPE_MASK) === UNIX_SYMBOLIC_LINK_TYPE) {
      throw new Error(
        `ZIP symbolic link entries are not allowed: ${normalizedPath}`
      );
    }
    const directory =
      rawPath.replaceAll("\\", "/").endsWith("/") ||
      (unixMode & UNIX_FILE_TYPE_MASK) === 0o040000 ||
      (externalAttributes & 0x10) !== 0;
    entries.push({
      path: rawPath,
      normalizedPath,
      compressedBytes,
      uncompressedBytes,
      directory,
      unixMode
    });
    offset = entryEnd;
  }

  if (offset !== centralDirectoryEnd) {
    throw new Error("Invalid ZIP central-directory size");
  }
  return entries;
}

export function validateZipArchiveLimits(
  compressedArchiveBytes: number,
  entries: readonly ZipEntryMetadata[],
  limits: ZipLimits = ZIP_LIMITS
): void {
  validateLimitSet(limits);
  validateByteCount(compressedArchiveBytes, "ZIP compressed size");
  if (compressedArchiveBytes > limits.compressedBytes) {
    throw new Error(
      `ZIP compressed size ${compressedArchiveBytes} exceeds ` +
      `${limits.compressedBytes} bytes`
    );
  }
  if (entries.length > limits.fileCount) {
    throw new Error(
      `ZIP file count ${entries.length} exceeds ${limits.fileCount}`
    );
  }

  let totalUncompressedBytes = 0;
  for (const entry of entries) {
    validateByteCount(
      entry.uncompressedBytes,
      `ZIP entry ${entry.normalizedPath} uncompressed size`
    );
    validateByteCount(
      entry.compressedBytes,
      `ZIP entry ${entry.normalizedPath} compressed size`
    );
    if (entry.uncompressedBytes > limits.singleFileBytes) {
      throw new Error(
        `ZIP single file ${entry.normalizedPath} is ` +
        `${entry.uncompressedBytes} bytes and exceeds ` +
        `${limits.singleFileBytes}`
      );
    }
    totalUncompressedBytes += entry.uncompressedBytes;
    if (
      !Number.isSafeInteger(totalUncompressedBytes) ||
      totalUncompressedBytes > limits.uncompressedBytes
    ) {
      throw new Error(
        `ZIP uncompressed size exceeds ${limits.uncompressedBytes} bytes`
      );
    }
  }
}

export function validateExtractedEntries(
  metadataEntries: readonly ZipEntryMetadata[],
  extractedEntries: readonly ExtractedZipEntry[],
  limits: ZipLimits = ZIP_LIMITS
): void {
  const extractedByPath = new Map<string, ExtractedZipEntry>();
  for (const entry of extractedEntries) {
    const normalizedPath = normalizeZipEntryPath(entry.path);
    if (extractedByPath.has(normalizedPath)) {
      throw new Error(`Duplicate extracted ZIP path: ${normalizedPath}`);
    }
    extractedByPath.set(normalizedPath, {
      path: normalizedPath,
      bytes: entry.bytes
    });
  }

  for (const metadataEntry of metadataEntries) {
    if (metadataEntry.directory) {
      continue;
    }
    const extracted = extractedByPath.get(metadataEntry.normalizedPath);
    if (extracted === undefined) {
      throw new Error(
        `ZIP entry was not extracted: ${metadataEntry.normalizedPath}`
      );
    }
    if (extracted.bytes.byteLength !== metadataEntry.uncompressedBytes) {
      throw new Error(
        `ZIP entry size mismatch for ${metadataEntry.normalizedPath}: ` +
        `declared ${metadataEntry.uncompressedBytes}, extracted ` +
        `${extracted.bytes.byteLength}`
      );
    }
  }

  const actualMetadata = extractedEntries.map(entry => ({
    path: entry.path,
    normalizedPath: normalizeZipEntryPath(entry.path),
    compressedBytes: 0,
    uncompressedBytes: entry.bytes.byteLength,
    directory: false,
    unixMode: 0
  }));
  validateZipArchiveLimits(0, actualMetadata, {
    ...limits,
    compressedBytes: Math.max(0, limits.compressedBytes)
  });
}

export function convertExtractedAlgorithmPackage(
  extractedEntries: readonly ExtractedZipEntry[],
  options: ConvertExtractedPackageOptions
): ImportPackageResult {
  throwIfAborted(options.signal);
  const entries = new Map<string, Uint8Array>();
  for (const entry of extractedEntries) {
    const normalizedPath = normalizeZipEntryPath(entry.path);
    if (isIgnoredOsPath(normalizedPath)) {
      continue;
    }
    if (entries.has(normalizedPath)) {
      throw new Error(`Duplicate normalized ZIP path: ${normalizedPath}`);
    }
    entries.set(normalizedPath, entry.bytes);
  }

  const missionPaths = [...entries.keys()].filter(
    path => basename(path) === "mission_plan.json"
  );
  if (missionPaths.length !== 1) {
    throw new Error(
      `ZIP must contain exactly one mission_plan.json; found ` +
      `${missionPaths.length}`
    );
  }
  const missionPath = missionPaths[0];
  const runDirectory = dirname(missionPath);
  const optionalPaths = [
    ...OPTIONAL_SIBLING_FILES.map(fileName =>
      joinArchivePath(runDirectory, fileName)
    ),
    joinArchivePath(
      runDirectory,
      "intermediate/region_profile.json"
    )
  ];

  const missionPlan = parseJsonEntry(entries, missionPath);
  for (const optionalPath of optionalPaths.slice(0, -1)) {
    if (entries.has(optionalPath)) {
      parseJsonEntry(entries, optionalPath);
    }
  }
  const regionProfilePath = optionalPaths[optionalPaths.length - 1];
  const regionProfile = entries.has(regionProfilePath)
    ? parseJsonEntry(entries, regionProfilePath)
    : undefined;
  throwIfAborted(options.signal);

  const sourceRun =
    runDirectory.length === 0
      ? options.fileName
      : basename(runDirectory);
  const bundle = convertMissionPlan({
    missionPlan: adaptAlgorithmMissionPlan(missionPlan),
    regionProfile,
    sourceName: `${options.fileName}#${missionPath}`,
    sourceRun,
    importedAt: options.importedAt,
    sha256: options.sha256,
    uavScheduleOverlapPolicy:
      ALGORITHM_IMPORT_UAV_SCHEDULE_OVERLAP_POLICY
  });
  throwIfAborted(options.signal);

  return {
    bundle,
    preview: {
      caseId: bundle.case.caseId,
      uavCount: bundle.metrics.uavCount,
      sortieCount: bundle.metrics.sortieCount,
      batchCount: bundle.metrics.batchCount,
      stripCount: bundle.metrics.stripCount,
      durationSec: bundle.metrics.missionMakespanSec,
      warnings: [...bundle.validation.warnings]
    }
  };
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) {
    throw new DOMException("Algorithm case import was cancelled", "AbortError");
  }
}

function findEndOfCentralDirectory(view: DataView): number {
  const earliestOffset = Math.max(
    0,
    view.byteLength -
      END_OF_CENTRAL_DIRECTORY_BYTES -
      MAX_ZIP_COMMENT_BYTES
  );
  for (
    let offset = view.byteLength - END_OF_CENTRAL_DIRECTORY_BYTES;
    offset >= earliestOffset;
    offset -= 1
  ) {
    if (
      view.getUint32(offset, true) === END_OF_CENTRAL_DIRECTORY_SIGNATURE &&
      offset + END_OF_CENTRAL_DIRECTORY_BYTES <= view.byteLength &&
      offset +
        END_OF_CENTRAL_DIRECTORY_BYTES +
        view.getUint16(offset + 20, true) ===
        view.byteLength
    ) {
      return offset;
    }
  }
  throw new Error("Invalid ZIP: end-of-central-directory record is missing");
}

function validateLimitSet(limits: ZipLimits): void {
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`ZIP limit ${name} must be a non-negative safe integer`);
    }
  }
}

function validateByteCount(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
}

function isIgnoredOsPath(path: string): boolean {
  const parts = path.split("/");
  const fileName = parts[parts.length - 1].toLowerCase();
  return (
    parts.some(part => part === "__MACOSX") ||
    fileName === ".ds_store" ||
    fileName === "thumbs.db" ||
    fileName === "desktop.ini" ||
    fileName.startsWith("._")
  );
}

function basename(path: string): string {
  const separator = path.lastIndexOf("/");
  return separator < 0 ? path : path.slice(separator + 1);
}

function dirname(path: string): string {
  const separator = path.lastIndexOf("/");
  return separator < 0 ? "" : path.slice(0, separator);
}

function joinArchivePath(directory: string, relativePath: string): string {
  return directory.length === 0
    ? relativePath
    : `${directory}/${relativePath}`;
}

function parseJsonEntry(
  entries: ReadonlyMap<string, Uint8Array>,
  path: string
): unknown {
  const bytes = entries.get(path);
  if (bytes === undefined) {
    throw new Error(`ZIP entry is missing: ${path}`);
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", {fatal: true}).decode(bytes);
  } catch (error) {
    throw new Error(`${path} is not valid UTF-8: ${errorMessage(error)}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${path} has invalid JSON: ${errorMessage(error)}`);
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
      strip.coveragePolygon = polygon.coordinates[0].map(coordinate => {
        if (
          !Array.isArray(coordinate) ||
          typeof coordinate[0] !== "number" ||
          typeof coordinate[1] !== "number"
        ) {
          return coordinate;
        }
        return {xM: coordinate[0], yM: coordinate[1]};
      });
    }
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
