import {useCallback, useEffect, useRef, useState} from "react";
import {
  openCaseRepository,
  type CaseRepository
} from "../features/cases/caseRepository";
import type {CaseBundleV2} from "../features/cases/caseBundle";
import type {
  ImportPreview,
  ImportProgress,
  ImportWorkerRequest,
  ImportWorkerResponse
} from "../features/cases/importPackage";

export interface ImportWorkerClient {
  onmessage: ((event: MessageEvent<ImportWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: ImportWorkerRequest, transfer?: Transferable[]): void;
  terminate(): void;
}

export interface CaseImportDependencies {
  createWorker(): ImportWorkerClient;
  openCaseRepository(): Promise<CaseRepository>;
}

export type CaseImportStatus =
  | "idle"
  | "reading"
  | "processing"
  | "preview"
  | "saving"
  | "saved"
  | "error";

export interface CaseImportPreview {
  sourceName: string;
  details: ImportPreview;
  bundle: CaseBundleV2;
}

export interface CaseImportState {
  status: CaseImportStatus;
  progress: ImportProgress | null;
  preview: CaseImportPreview | null;
  duplicate: boolean;
  persistent: boolean | null;
  error: string | null;
  chooseFile(file: File): Promise<void>;
  confirm(overwrite?: boolean): Promise<string>;
  cancel(): void;
  reset(): void;
}

export interface UseCaseImportOptions {
  dependencies?: CaseImportDependencies;
}

const DEFAULT_DEPENDENCIES: CaseImportDependencies = {
  createWorker: () => new Worker(
    new URL("../features/cases/import.worker.ts", import.meta.url),
    {type: "module"}
  ),
  openCaseRepository
};

let nextRequestNumber = 0;

function createRequestId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  nextRequestNumber += 1;
  return `case-import-${Date.now()}-${nextRequestNumber}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function importedCaseKey(bundle: CaseBundleV2): string {
  return `${bundle.case.caseId}:${bundle.case.planId}:imported`;
}

export function useCaseImport({
  dependencies = DEFAULT_DEPENDENCIES
}: UseCaseImportOptions = {}): CaseImportState {
  const [status, setStatus] = useState<CaseImportStatus>("idle");
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [preview, setPreview] = useState<CaseImportPreview | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [persistent, setPersistent] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<ImportWorkerClient | null>(null);
  const repositoryPromiseRef = useRef<Promise<CaseRepository> | null>(null);
  const activeRequestIdRef = useRef<string | null>(null);
  const sourceNameRef = useRef("");
  const mountedRef = useRef(true);

  if (repositoryPromiseRef.current === null) {
    repositoryPromiseRef.current = dependencies.openCaseRepository();
  }

  useEffect(() => {
    mountedRef.current = true;
    const worker = dependencies.createWorker();
    workerRef.current = worker;

    void repositoryPromiseRef.current?.then(
      repository => {
        if (mountedRef.current) setPersistent(repository.persistent);
      },
      caught => {
        if (!mountedRef.current) return;
        setStatus("error");
        setError(`本地算例库初始化失败：${errorMessage(caught)}`);
      }
    );

    worker.onmessage = event => {
      const response = event.data;
      if (activeRequestIdRef.current !== response.requestId) return;

      if (response.type === "progress") {
        setStatus("processing");
        setProgress({stage: response.stage, percent: response.percent});
        return;
      }
      if (response.type === "failure") {
        activeRequestIdRef.current = null;
        setStatus("error");
        setError(response.message);
        return;
      }

      const sourceName = sourceNameRef.current;
      void repositoryPromiseRef.current?.then(
        async repository => {
          const existing = await repository.get(
            response.bundle.case.caseId,
            response.bundle.case.planId
          );
          if (
            !mountedRef.current ||
            activeRequestIdRef.current !== response.requestId
          ) {
            return;
          }
          activeRequestIdRef.current = null;
          setDuplicate(existing !== undefined);
          setPreview({
            sourceName,
            details: response.preview,
            bundle: response.bundle
          });
          setProgress(null);
          setError(null);
          setStatus("preview");
        },
        caught => {
          if (
            !mountedRef.current ||
            activeRequestIdRef.current !== response.requestId
          ) {
            return;
          }
          activeRequestIdRef.current = null;
          setStatus("error");
          setError(`检查重复算例失败：${errorMessage(caught)}`);
        }
      );
    };
    worker.onerror = event => {
      if (activeRequestIdRef.current === null) return;
      activeRequestIdRef.current = null;
      setStatus("error");
      setError(event.message || "算例解析 Worker 运行失败");
    };

    return () => {
      mountedRef.current = false;
      worker.terminate();
      workerRef.current = null;
    };
  }, [dependencies]);

  const cancel = useCallback(() => {
    const requestId = activeRequestIdRef.current;
    if (requestId !== null) {
      workerRef.current?.postMessage({type: "cancel", requestId});
    }
    activeRequestIdRef.current = null;
    setStatus("idle");
    setProgress(null);
    setPreview(null);
    setDuplicate(false);
    setError(null);
  }, []);

  const chooseFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setStatus("error");
      setError("请选择 .zip 格式的算法算例文件");
      setPreview(null);
      return;
    }

    const previousRequestId = activeRequestIdRef.current;
    if (previousRequestId !== null) {
      workerRef.current?.postMessage({
        type: "cancel",
        requestId: previousRequestId
      });
    }
    const requestId = createRequestId();
    activeRequestIdRef.current = requestId;
    sourceNameRef.current = file.name;
    setStatus("reading");
    setProgress({stage: "unzip", percent: 0});
    setPreview(null);
    setDuplicate(false);
    setError(null);

    try {
      const bytes = await file.arrayBuffer();
      if (activeRequestIdRef.current !== requestId) return;
      const request: ImportWorkerRequest = {
        type: "parse",
        requestId,
        fileName: file.name,
        bytes
      };
      workerRef.current?.postMessage(request, [bytes]);
      setStatus("processing");
    } catch (caught) {
      if (activeRequestIdRef.current !== requestId) return;
      activeRequestIdRef.current = null;
      setStatus("error");
      setError(`读取 ${file.name} 失败：${errorMessage(caught)}`);
    }
  }, []);

  const confirm = useCallback(async (overwrite = false): Promise<string> => {
    if (preview === null) {
      throw new Error("请先选择并完成算例转换");
    }
    if (duplicate && !overwrite) {
      throw new Error(
        `算例 ${preview.bundle.case.caseId} / ` +
        `${preview.bundle.case.planId} 已存在，请确认覆盖`
      );
    }

    setStatus("saving");
    setError(null);
    try {
      const repository = await repositoryPromiseRef.current;
      if (repository === null) throw new Error("本地算例库尚未就绪");
      await repository.save(preview.bundle, {overwrite});
      const key = importedCaseKey(preview.bundle);
      setStatus("saved");
      return key;
    } catch (caught) {
      setStatus("error");
      setError(`保存算例失败：${errorMessage(caught)}`);
      throw caught;
    }
  }, [duplicate, preview]);

  const reset = useCallback(() => {
    cancel();
  }, [cancel]);

  return {
    status,
    progress,
    preview,
    duplicate,
    persistent,
    error,
    chooseFile,
    confirm,
    cancel,
    reset
  };
}
