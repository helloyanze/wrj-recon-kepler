import {useEffect, useState} from "react";
import {
  resolveBasemap,
  type BasemapEnvironment,
  type ResolvedBasemap
} from "./basemap/basemapConfig";
import {BasemapSetupPage} from "./components/BasemapSetupPage";
import {Workspace} from "./components/Workspace";

export interface AppProps {
  debugMode?: boolean;
  dataBase?: string;
  basemapEnvironment?: BasemapEnvironment;
  basemapLoader?: typeof resolveBasemap;
}

const DEFAULT_BASEMAP_ENVIRONMENT: BasemapEnvironment = {
  mode: import.meta.env.VITE_WRJ_BASEMAP_MODE?.trim() || "auto",
  mapboxToken: import.meta.env.VITE_MAPBOX_TOKEN?.trim(),
  localStyleUrl: import.meta.env.VITE_WRJ_LOCAL_STYLE_URL?.trim(),
  localTileUrl: import.meta.env.VITE_WRJ_LOCAL_TILE_URL?.trim(),
  localAttribution: import.meta.env.VITE_WRJ_LOCAL_ATTRIBUTION?.trim()
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export default function App({
  debugMode = import.meta.env.VITE_WRJ_KEPLER_DEBUG === "true",
  dataBase = import.meta.env.VITE_WRJ_DATA_BASE?.trim() || "/data",
  basemapEnvironment = DEFAULT_BASEMAP_ENVIRONMENT,
  basemapLoader = resolveBasemap
}: AppProps) {
  const [resolvedBasemap, setResolvedBasemap] = useState<ResolvedBasemap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setResolvedBasemap(null);
    setError(null);

    const load = async () => {
      try {
        const resolved = await basemapLoader(basemapEnvironment, controller.signal);
        if (cancelled || controller.signal.aborted) return;
        setResolvedBasemap(resolved);
      } catch (caught) {
        if (cancelled || controller.signal.aborted || isAbortError(caught)) return;
        setError(errorMessage(caught));
      }
    };
    void load();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [attempt, basemapEnvironment, basemapLoader]);

  if (error) return <BasemapSetupPage error={error} onRetry={() => setAttempt((value) => value + 1)} />;
  if (!resolvedBasemap) return <BasemapSetupPage />;
  return <Workspace mapboxToken={resolvedBasemap.mapboxToken} debugMode={debugMode} dataBase={dataBase} />;
}
