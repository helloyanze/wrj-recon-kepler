import {Unzip, UnzipInflate} from "fflate";
import {
  ZIP_LIMITS,
  convertExtractedAlgorithmPackage,
  inspectZipArchive,
  normalizeZipEntryPath,
  throwIfAborted,
  validateExtractedEntries,
  validateZipArchiveLimits,
  type ImportPackageResult,
  type ImportProgress,
  type ImportWorkerRequest,
  type ImportWorkerResponse,
  type ExtractedZipEntry,
  type ZipLimits
} from "./importPackage";

const DEFAULT_ARCHIVE_CHUNK_BYTES = 16 * 1024;
const MAX_ARCHIVE_CHUNK_BYTES = 64 * 1024;
const DEFAULT_YIELD_EVERY_CHUNKS = 8;

export interface ParseAlgorithmZipOptions {
  signal?: AbortSignal;
  onProgress?: (progress: ImportProgress) => void;
  limits?: ZipLimits;
  now?: () => Date;
  archiveChunkBytes?: number;
  yieldEveryChunks?: number;
  yieldControl?: () => Promise<void>;
}

export type AlgorithmZipParser = (
  bytes: Uint8Array,
  fileName: string,
  options?: ParseAlgorithmZipOptions
) => Promise<ImportPackageResult>;

type PostWorkerResponse = (response: ImportWorkerResponse) => void;

export async function parseAlgorithmZipPackage(
  bytes: Uint8Array,
  fileName: string,
  options: ParseAlgorithmZipOptions = {}
): Promise<ImportPackageResult> {
  const limits = options.limits ?? ZIP_LIMITS;
  throwIfAborted(options.signal);
  assertFileName(fileName);
  options.onProgress?.({stage: "unzip", percent: 0});

  if (bytes.byteLength > limits.compressedBytes) {
    validateZipArchiveLimits(bytes.byteLength, [], limits);
  }
  const metadata = inspectZipArchive(bytes);
  validateZipArchiveLimits(bytes.byteLength, metadata, limits);
  throwIfAborted(options.signal);

  const archiveHash = await sha256(bytes);
  throwIfAborted(options.signal);
  const extractedEntries = await extractZipStreaming(bytes, {
    limits,
    signal: options.signal,
    archiveChunkBytes:
      options.archiveChunkBytes ?? DEFAULT_ARCHIVE_CHUNK_BYTES,
    yieldEveryChunks:
      options.yieldEveryChunks ?? DEFAULT_YIELD_EVERY_CHUNKS,
    yieldControl: options.yieldControl ?? yieldToEventLoop
  });
  throwIfAborted(options.signal);
  options.onProgress?.({stage: "unzip", percent: 35});

  options.onProgress?.({stage: "validate", percent: 45});
  validateExtractedEntries(metadata, extractedEntries, limits);
  throwIfAborted(options.signal);
  options.onProgress?.({stage: "validate", percent: 65});

  const importedAt = (options.now ?? (() => new Date()))().toISOString();
  options.onProgress?.({stage: "convert", percent: 75});
  const result = convertExtractedAlgorithmPackage(extractedEntries, {
    fileName,
    importedAt,
    sha256: archiveHash,
    signal: options.signal
  });
  throwIfAborted(options.signal);
  options.onProgress?.({stage: "convert", percent: 100});
  return result;
}

interface StreamingExtractionOptions {
  limits: ZipLimits;
  signal?: AbortSignal;
  archiveChunkBytes: number;
  yieldEveryChunks: number;
  yieldControl: () => Promise<void>;
}

interface PendingFile {
  path: string;
  chunks: Uint8Array[];
  byteLength: number;
}

async function extractZipStreaming(
  bytes: Uint8Array,
  options: StreamingExtractionOptions
): Promise<ExtractedZipEntry[]> {
  assertPositiveInteger(
    options.archiveChunkBytes,
    "archiveChunkBytes",
    MAX_ARCHIVE_CHUNK_BYTES
  );
  assertPositiveInteger(options.yieldEveryChunks, "yieldEveryChunks");

  const state: {
    fatalError?: Error;
    totalActualBytes: number;
    discoveredFileCount: number;
  } = {
    totalActualBytes: 0,
    discoveredFileCount: 0
  };
  const extractedEntries: ExtractedZipEntry[] = [];
  const normalizedPaths = new Set<string>();
  const activeFiles = new Set<{terminate(): void}>();

  const fail = (error: Error): void => {
    if (state.fatalError === undefined) {
      state.fatalError = error;
      for (const file of activeFiles) {
        file.terminate();
      }
    }
  };

  const unzip = new Unzip(file => {
    if (state.fatalError !== undefined) {
      file.terminate();
      return;
    }

    let normalizedPath: string;
    try {
      normalizedPath = normalizeZipEntryPath(file.name);
    } catch (error) {
      fail(asError(error));
      file.terminate();
      return;
    }
    state.discoveredFileCount += 1;
    if (state.discoveredFileCount > options.limits.fileCount) {
      fail(new Error(
        `ZIP actual file count exceeds ${options.limits.fileCount}`
      ));
      file.terminate();
      return;
    }
    if (normalizedPaths.has(normalizedPath)) {
      fail(new Error(
        `Duplicate normalized extracted ZIP path: ${normalizedPath}`
      ));
      file.terminate();
      return;
    }
    normalizedPaths.add(normalizedPath);

    const pending: PendingFile = {
      path: file.name,
      chunks: [],
      byteLength: 0
    };
    activeFiles.add(file);
    file.ondata = (error, data, final) => {
      if (state.fatalError !== undefined) {
        return;
      }
      if (error !== null) {
        fail(new Error(
          `ZIP streaming extraction failed for ${normalizedPath}: ` +
          error.message
        ));
        return;
      }

      const nextFileBytes = pending.byteLength + data.byteLength;
      const nextTotalBytes =
        state.totalActualBytes + data.byteLength;
      if (
        !Number.isSafeInteger(nextFileBytes) ||
        nextFileBytes > options.limits.singleFileBytes
      ) {
        fail(new Error(
          `ZIP actual uncompressed output for ${normalizedPath} exceeds ` +
          `the single-file limit ${options.limits.singleFileBytes} bytes`
        ));
        return;
      }
      if (
        !Number.isSafeInteger(nextTotalBytes) ||
        nextTotalBytes > options.limits.uncompressedBytes
      ) {
        fail(new Error(
          `ZIP actual uncompressed total exceeds ` +
          `${options.limits.uncompressedBytes} bytes while extracting ` +
          normalizedPath
        ));
        return;
      }

      pending.byteLength = nextFileBytes;
      state.totalActualBytes = nextTotalBytes;
      if (data.byteLength > 0) {
        pending.chunks.push(data.slice());
      }
      if (final) {
        activeFiles.delete(file);
        extractedEntries.push({
          path: pending.path,
          bytes: concatenateChunks(
            pending.chunks,
            pending.byteLength
          )
        });
      }
    };
    try {
      file.start();
    } catch (error) {
      fail(new Error(
        `ZIP streaming extraction could not start ${normalizedPath}: ` +
        errorMessage(error)
      ));
    }
  });
  unzip.register(UnzipInflate);

  const chunkCount = Math.ceil(
    bytes.byteLength / options.archiveChunkBytes
  );
  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
    throwIfAborted(options.signal);
    const start = chunkIndex * options.archiveChunkBytes;
    const end = Math.min(
      bytes.byteLength,
      start + options.archiveChunkBytes
    );
    try {
      unzip.push(
        bytes.subarray(start, end),
        chunkIndex === chunkCount - 1
      );
    } catch (error) {
      fail(new Error(
        `ZIP streaming extraction failed: ${errorMessage(error)}`
      ));
    }
    if (state.fatalError !== undefined) {
      throw state.fatalError;
    }
    throwIfAborted(options.signal);

    if (
      chunkIndex < chunkCount - 1 &&
      (chunkIndex + 1) % options.yieldEveryChunks === 0
    ) {
      await options.yieldControl();
      if (options.signal?.aborted === true) {
        for (const file of activeFiles) {
          file.terminate();
        }
      }
      throwIfAborted(options.signal);
    }
  }

  if (state.fatalError !== undefined) {
    throw state.fatalError;
  }
  if (activeFiles.size > 0) {
    for (const file of activeFiles) {
      file.terminate();
    }
    throw new Error("ZIP streaming extraction ended before all files completed");
  }
  return extractedEntries;
}

function concatenateChunks(
  chunks: readonly Uint8Array[],
  byteLength: number
): Uint8Array {
  const result = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function assertPositiveInteger(
  value: number,
  label: string,
  maximum?: number
): void {
  if (
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    (maximum !== undefined && value > maximum)
  ) {
    const maximumText =
      maximum === undefined ? "" : ` no greater than ${maximum}`;
    throw new Error(`${label} must be a positive safe integer${maximumText}`);
  }
}

function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, 0);
  });
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function createImportWorkerMessageHandler(
  postResponse: PostWorkerResponse,
  parser: AlgorithmZipParser = parseAlgorithmZipPackage
): (request: ImportWorkerRequest) => Promise<void> {
  const activeRequests = new Map<string, AbortController>();

  return async request => {
    if (request.type === "cancel") {
      const active = activeRequests.get(request.requestId);
      active?.abort();
      if (active !== undefined) {
        activeRequests.delete(request.requestId);
      }
      return;
    }

    const previous = activeRequests.get(request.requestId);
    previous?.abort();
    const controller = new AbortController();
    activeRequests.set(request.requestId, controller);

    try {
      const result = await parser(
        new Uint8Array(request.bytes),
        request.fileName,
        {
          signal: controller.signal,
          onProgress: progress => {
            if (
              activeRequests.get(request.requestId) === controller &&
              !controller.signal.aborted
            ) {
              postResponse({
                type: "progress",
                requestId: request.requestId,
                stage: progress.stage,
                percent: progress.percent
              });
            }
          }
        }
      );
      if (
        activeRequests.get(request.requestId) === controller &&
        !controller.signal.aborted
      ) {
        postResponse({
          type: "success",
          requestId: request.requestId,
          bundle: result.bundle,
          preview: result.preview
        });
      }
    } catch (error) {
      if (
        activeRequests.get(request.requestId) === controller &&
        !controller.signal.aborted
      ) {
        postResponse({
          type: "failure",
          requestId: request.requestId,
          message: errorMessage(error)
        });
      }
    } finally {
      if (activeRequests.get(request.requestId) === controller) {
        activeRequests.delete(request.requestId);
      }
    }
  };
}

async function sha256(bytes: Uint8Array): Promise<string> {
  if (globalThis.crypto?.subtle === undefined) {
    throw new Error("Web Crypto SHA-256 is unavailable");
  }
  const digestInput = new Uint8Array(bytes.byteLength);
  digestInput.set(bytes);
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    digestInput
  );
  return [...new Uint8Array(digest)]
    .map(value => value.toString(16).padStart(2, "0"))
    .join("");
}

function assertFileName(fileName: string): void {
  if (fileName.trim().length === 0 || fileName.includes("\0")) {
    throw new Error("ZIP source filename must be non-empty and contain no NUL");
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface ImportWorkerGlobal {
  document?: unknown;
  postMessage?: (response: ImportWorkerResponse) => void;
  onmessage?: (event: MessageEvent<ImportWorkerRequest>) => void;
}

const workerGlobal = globalThis as ImportWorkerGlobal;
if (
  workerGlobal.document === undefined &&
  typeof workerGlobal.postMessage === "function"
) {
  const handleMessage = createImportWorkerMessageHandler(response => {
    workerGlobal.postMessage?.(response);
  });
  workerGlobal.onmessage = event => {
    void handleMessage(event.data);
  };
}
