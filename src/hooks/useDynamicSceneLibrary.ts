import {useCallback, useEffect, useRef, useState} from "react";

import type {
  DynamicSceneCatalogEntry,
  LoadedDynamicScenePackage
} from "../features/dynamic-replanning/dynamicSceneSchema";
import {
  type DynamicFetch,
  loadDynamicScene,
  loadDynamicSceneCatalog
} from "../features/dynamic-replanning/loadDynamicScene";

export interface DynamicSceneListEntry extends DynamicSceneCatalogEntry {
  disabled: boolean;
  error: string | null;
}

export interface DynamicSceneLibrary {
  status: "loading" | "ready" | "error";
  entries: DynamicSceneListEntry[];
  selectedSceneId: string | null;
  scenePackage: LoadedDynamicScenePackage | null;
  error: string | null;
  select(sceneId: string): void;
  retry(): void;
}

export interface UseDynamicSceneLibraryOptions {
  dataBase?: string;
  fetcher?: DynamicFetch;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useDynamicSceneLibrary({
  dataBase = "/data",
  fetcher = fetch
}: UseDynamicSceneLibraryOptions = {}): DynamicSceneLibrary {
  const [status, setStatus] =
    useState<DynamicSceneLibrary["status"]>("loading");
  const [entries, setEntries] = useState<DynamicSceneListEntry[]>([]);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [scenePackage, setScenePackage] =
    useState<LoadedDynamicScenePackage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const generationRef = useRef(0);
  const entriesRef = useRef<DynamicSceneListEntry[]>([]);
  const packagesRef = useRef(
    new Map<string, LoadedDynamicScenePackage>()
  );

  useEffect(() => {
    const generation = ++generationRef.current;
    const controller = new AbortController();
    setStatus("loading");
    setError(null);

    void loadDynamicSceneCatalog(
      dataBase,
      fetcher,
      controller.signal
    ).then(async (catalog) => {
      const results = await Promise.all(catalog.scenes.map(async (entry) => {
        try {
          const loaded = await loadDynamicScene(
            dataBase,
            entry,
            fetcher,
            controller.signal
          );
          return {entry, loaded, error: null};
        } catch (caught) {
          return {entry, loaded: null, error: errorMessage(caught)};
        }
      }));
      if (controller.signal.aborted || generationRef.current !== generation) {
        return;
      }

      const nextPackages = new Map<string, LoadedDynamicScenePackage>();
      const nextEntries = results.map(({entry, loaded, error: sceneError}) => {
        if (loaded !== null) nextPackages.set(entry.sceneId, loaded);
        return {
          ...entry,
          disabled: loaded === null,
          error: sceneError
        };
      });
      entriesRef.current = nextEntries;
      packagesRef.current = nextPackages;
      setEntries(nextEntries);

      const defaultEntry = nextEntries.find(item =>
        item.sceneId === catalog.defaultSceneId && !item.disabled
      ) ?? nextEntries.find(item => !item.disabled);
      if (defaultEntry === undefined) {
        setStatus("error");
        setError("所有 Task 2 场景均加载失败");
        setSelectedSceneId(null);
        return;
      }
      setSelectedSceneId(defaultEntry.sceneId);
      setScenePackage(nextPackages.get(defaultEntry.sceneId) ?? null);
      setStatus("ready");
    }).catch((caught: unknown) => {
      if (controller.signal.aborted || generationRef.current !== generation) {
        return;
      }
      setStatus("error");
      setError(errorMessage(caught));
    });

    return () => {
      controller.abort();
      if (generationRef.current === generation) generationRef.current += 1;
    };
  }, [dataBase, fetcher, revision]);

  const select = useCallback((sceneId: string) => {
    const entry = entriesRef.current.find(item => item.sceneId === sceneId);
    const nextPackage = packagesRef.current.get(sceneId);
    if (entry === undefined || entry.disabled || nextPackage === undefined) {
      return;
    }
    setSelectedSceneId(sceneId);
    setScenePackage(nextPackage);
    setStatus("ready");
    setError(null);
  }, []);

  const retry = useCallback(() => {
    setRevision(value => value + 1);
  }, []);

  return {
    status,
    entries,
    selectedSceneId,
    scenePackage,
    error,
    select,
    retry
  };
}
