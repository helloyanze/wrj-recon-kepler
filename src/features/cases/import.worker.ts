import {unzipSync} from "fflate";
import {
  ZIP_LIMITS,
  convertExtractedAlgorithmPackage,
  inspectZipArchive,
  throwIfAborted,
  validateExtractedEntries,
  validateZipArchiveLimits,
  type ImportPackageResult,
  type ImportProgress,
  type ImportWorkerRequest,
  type ImportWorkerResponse,
  type ZipLimits
} from "./importPackage";

export interface ParseAlgorithmZipOptions {
  signal?: AbortSignal;
  onProgress?: (progress: ImportProgress) => void;
  limits?: ZipLimits;
  now?: () => Date;
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
  const extractedRecord = unzipSync(bytes);
  throwIfAborted(options.signal);
  options.onProgress?.({stage: "unzip", percent: 35});

  options.onProgress?.({stage: "validate", percent: 45});
  const extractedEntries = Object.entries(extractedRecord).map(
    ([path, entryBytes]) => ({path, bytes: entryBytes})
  );
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
