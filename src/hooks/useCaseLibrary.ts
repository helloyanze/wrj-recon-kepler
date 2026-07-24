import {useCallback, useEffect, useRef, useState} from "react";
import {
  openCaseRepository,
  type CaseRepository,
  type ImportedCaseEntry
} from "../features/cases/caseRepository";
import {
  loadBuiltInCase,
  loadCaseCatalog
} from "../features/cases/loadCaseCatalog";
import type {
  CaseCatalogEntry,
  CaseCatalogV1
} from "../features/cases/catalogSchema";
import {
  caseBundleSchema,
  type CaseBundleV2
} from "../features/cases/caseBundle";

export type CaseLibrarySource = "built-in" | "imported";

export interface CaseLibraryEntry {
  key: string;
  source: CaseLibrarySource;
  caseId: string;
  planId: string;
  displayName: string;
  metrics: CaseCatalogEntry["metrics"] | ImportedCaseEntry["metrics"];
  warnings: string[];
  catalogEntry?: CaseCatalogEntry;
  importedEntry?: ImportedCaseEntry;
}

export interface CaseLibraryState {
  entries: CaseLibraryEntry[];
  selectedKey: string | null;
  bundle: CaseBundleV2 | null;
  status: "loading" | "ready" | "error";
  error: string | null;
  persistentImports: boolean;
  select(key: string): void;
  refreshImports(): Promise<void>;
  deleteImported(key: string): Promise<void>;
  retry(): void;
}

export interface CaseLibraryDependencies {
  loadCaseCatalog: typeof loadCaseCatalog;
  loadBuiltInCase: typeof loadBuiltInCase;
  openCaseRepository: typeof openCaseRepository;
}

export interface UseCaseLibraryOptions {
  dataBase?: string;
  dependencies?: CaseLibraryDependencies;
}

interface BootstrapResult {
  catalog: CaseCatalogV1;
  repository: CaseRepository;
  imported: ImportedCaseEntry[];
}

const DEFAULT_DEPENDENCIES: CaseLibraryDependencies = {
  loadCaseCatalog,
  loadBuiltInCase,
  openCaseRepository
};

const bootstrapCache = new WeakMap<
  CaseLibraryDependencies,
  Map<string, Promise<BootstrapResult>>
>();
const builtInLoadCache = new WeakMap<
  CaseLibraryDependencies,
  Map<string, Promise<CaseBundleV2>>
>();

function entryKey(
  caseId: string,
  planId: string,
  source: CaseLibrarySource
): string {
  return `${caseId}:${planId}:${source}`;
}

function builtInEntry(entry: CaseCatalogEntry): CaseLibraryEntry {
  return {
    key: entryKey(entry.caseId, entry.planId, "built-in"),
    source: "built-in",
    caseId: entry.caseId,
    planId: entry.planId,
    displayName: entry.displayName,
    metrics: entry.metrics,
    warnings: [...entry.warnings],
    catalogEntry: entry
  };
}

function importedLibraryEntry(entry: ImportedCaseEntry): CaseLibraryEntry {
  return {
    key: entryKey(entry.caseId, entry.planId, "imported"),
    source: "imported",
    caseId: entry.caseId,
    planId: entry.planId,
    displayName: entry.displayName,
    metrics: entry.metrics,
    warnings: [...entry.warnings],
    importedEntry: entry
  };
}

function mergedEntries(
  catalog: CaseCatalogV1,
  imported: ImportedCaseEntry[]
): CaseLibraryEntry[] {
  return [
    ...catalog.cases.map(builtInEntry),
    ...imported.map(importedLibraryEntry)
  ];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function getBootstrap(
  dependencies: CaseLibraryDependencies,
  dataBase: string
): Promise<BootstrapResult> {
  let cache = bootstrapCache.get(dependencies);
  if (cache === undefined) {
    cache = new Map();
    bootstrapCache.set(dependencies, cache);
  }
  const existing = cache.get(dataBase);
  if (existing !== undefined) return existing;

  const promise = Promise.all([
    dependencies.loadCaseCatalog(dataBase),
    dependencies.openCaseRepository()
  ])
    .then(async ([catalog, repository]) => ({
      catalog,
      repository,
      imported: await repository.list()
    }))
    .catch((error: unknown) => {
      cache?.delete(dataBase);
      throw error;
    });
  cache.set(dataBase, promise);
  return promise;
}

function getBuiltInBundle(
  dependencies: CaseLibraryDependencies,
  entry: CaseCatalogEntry,
  dataBase: string,
  signal: AbortSignal
): Promise<CaseBundleV2> {
  let cache = builtInLoadCache.get(dependencies);
  if (cache === undefined) {
    cache = new Map();
    builtInLoadCache.set(dependencies, cache);
  }
  const key = `${dataBase}|${entryKey(entry.caseId, entry.planId, "built-in")}`;
  const existing = cache.get(key);
  if (existing !== undefined) return existing;

  const promise = dependencies.loadBuiltInCase(entry, dataBase, signal)
    .catch((error: unknown) => {
      cache?.delete(key);
      throw error;
    });
  cache.set(key, promise);
  return promise;
}

export function useCaseLibrary({
  dataBase = "/data",
  dependencies = DEFAULT_DEPENDENCIES
}: UseCaseLibraryOptions = {}): CaseLibraryState {
  const [entries, setEntries] = useState<CaseLibraryEntry[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [bundle, setBundle] = useState<CaseBundleV2 | null>(null);
  const [status, setStatus] = useState<CaseLibraryState["status"]>("loading");
  const [error, setError] = useState<string | null>(null);
  const [persistentImports, setPersistentImports] = useState(false);
  const [selectionRevision, setSelectionRevision] = useState(0);
  const entriesRef = useRef<CaseLibraryEntry[]>([]);
  const repositoryRef = useRef<CaseRepository | null>(null);
  const catalogRef = useRef<CaseCatalogV1 | null>(null);
  const defaultKeyRef = useRef<string | null>(null);
  const bootstrapGenerationRef = useRef(0);
  const loadGenerationRef = useRef(0);
  const activeControllerRef = useRef<AbortController | null>(null);

  const replaceEntries = useCallback((
    catalog: CaseCatalogV1,
    imported: ImportedCaseEntry[]
  ) => {
    const nextEntries = mergedEntries(catalog, imported);
    entriesRef.current = nextEntries;
    setEntries(nextEntries);
    const defaultEntry = nextEntries.find(candidate =>
      candidate.source === "built-in" &&
      candidate.caseId === catalog.defaultCaseId
    ) ?? nextEntries.find(candidate => candidate.source === "built-in") ?? null;
    defaultKeyRef.current = defaultEntry?.key ?? null;
    return nextEntries;
  }, []);

  useEffect(() => {
    const generation = ++bootstrapGenerationRef.current;
    setStatus("loading");
    setError(null);

    void getBootstrap(dependencies, dataBase).then(
      ({catalog, repository, imported}) => {
        if (bootstrapGenerationRef.current !== generation) return;
        catalogRef.current = catalog;
        repositoryRef.current = repository;
        setPersistentImports(repository.persistent);
        const nextEntries = replaceEntries(catalog, imported);
        const defaultEntry = nextEntries.find(candidate =>
          candidate.source === "built-in" &&
          candidate.caseId === catalog.defaultCaseId
        ) ?? nextEntries.find(candidate => candidate.source === "built-in");
        if (defaultEntry === undefined) {
          setStatus("error");
          setError("没有可用的内置算例");
          return;
        }
        setSelectedKey(defaultEntry.key);
      },
      (caught: unknown) => {
        if (bootstrapGenerationRef.current !== generation) return;
        setStatus("error");
        setError(errorMessage(caught));
      }
    );

    return () => {
      if (bootstrapGenerationRef.current === generation) {
        bootstrapGenerationRef.current += 1;
      }
    };
  }, [dataBase, dependencies, replaceEntries]);

  useEffect(() => {
    if (selectedKey === null) return;
    const entry = entriesRef.current.find(candidate => candidate.key === selectedKey);
    const repository = repositoryRef.current;
    const generation = ++loadGenerationRef.current;
    const controller = new AbortController();
    activeControllerRef.current = controller;
    setStatus("loading");
    setError(null);

    const load = async (): Promise<CaseBundleV2> => {
      if (entry === undefined) throw new Error(`找不到算例：${selectedKey}`);
      if (entry.source === "built-in") {
        if (entry.catalogEntry === undefined) {
          throw new Error(`内置算例缺少 catalog 信息：${selectedKey}`);
        }
        return getBuiltInBundle(
          dependencies,
          entry.catalogEntry,
          dataBase,
          controller.signal
        );
      }
      if (repository === null) throw new Error("本地算例库尚未就绪");
      const importedBundle = await repository.get(entry.caseId, entry.planId);
      if (importedBundle === undefined) {
        throw new Error(`本地算例不存在：${entry.caseId} / ${entry.planId}`);
      }
      return caseBundleSchema.parse(importedBundle);
    };

    void load().then(
      (nextBundle) => {
        if (
          controller.signal.aborted ||
          loadGenerationRef.current !== generation
        ) return;
        setBundle(nextBundle);
        setStatus("ready");
      },
      (caught: unknown) => {
        if (
          controller.signal.aborted ||
          loadGenerationRef.current !== generation ||
          isAbortError(caught)
        ) return;
        setStatus("error");
        setError(errorMessage(caught));
      }
    );

    return () => {
      if (loadGenerationRef.current === generation) {
        loadGenerationRef.current += 1;
      }
    };
  }, [dataBase, dependencies, selectedKey, selectionRevision]);

  const select = useCallback((key: string) => {
    activeControllerRef.current?.abort();
    setSelectedKey(key);
    setSelectionRevision(revision => revision + 1);
  }, []);

  const refreshImports = useCallback(async () => {
    const bootstrap = repositoryRef.current === null || catalogRef.current === null
      ? await getBootstrap(dependencies, dataBase)
      : {
          repository: repositoryRef.current,
          catalog: catalogRef.current
        };
    const imported = await bootstrap.repository.list();
    repositoryRef.current = bootstrap.repository;
    catalogRef.current = bootstrap.catalog;
    setPersistentImports(bootstrap.repository.persistent);
    replaceEntries(bootstrap.catalog, imported);
  }, [dataBase, dependencies, replaceEntries]);

  const deleteImported = useCallback(async (key: string) => {
    const entry = entriesRef.current.find(candidate => candidate.key === key);
    if (entry === undefined || entry.source !== "imported") {
      throw new Error(`不能删除非导入算例：${key}`);
    }
    const repository = repositoryRef.current;
    if (repository === null) throw new Error("本地算例库尚未就绪");

    await repository.remove(entry.caseId, entry.planId);
    await refreshImports();
    if (selectedKey === key) {
      const defaultKey = defaultKeyRef.current;
      if (defaultKey === null) {
        setStatus("error");
        setError("没有可用的内置算例");
      } else {
        select(defaultKey);
      }
    }
  }, [refreshImports, select, selectedKey]);

  const retry = useCallback(() => {
    if (selectedKey === null) {
      setStatus("loading");
      setError(null);
      void getBootstrap(dependencies, dataBase).then(
        ({catalog, repository, imported}) => {
          catalogRef.current = catalog;
          repositoryRef.current = repository;
          setPersistentImports(repository.persistent);
          const nextEntries = replaceEntries(catalog, imported);
          const next = nextEntries.find(item =>
            item.source === "built-in" &&
            item.caseId === catalog.defaultCaseId
          ) ?? nextEntries.find(item => item.source === "built-in");
          if (next !== undefined) select(next.key);
        },
        caught => {
          setStatus("error");
          setError(errorMessage(caught));
        }
      );
      return;
    }
    select(selectedKey);
  }, [dataBase, dependencies, replaceEntries, select, selectedKey]);

  return {
    entries,
    selectedKey,
    bundle,
    status,
    error,
    persistentImports,
    select,
    refreshImports,
    deleteImported,
    retry
  };
}
