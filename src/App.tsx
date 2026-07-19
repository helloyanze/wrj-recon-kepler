import {TokenMissingPage} from "./components/TokenMissingPage";
import {Workspace} from "./components/Workspace";

export interface AppProps {
  mapboxToken?: string;
  debugMode?: boolean;
  dataBase?: string;
}

export default function App({
  mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN?.trim() ?? "",
  debugMode = import.meta.env.VITE_WRJ_KEPLER_DEBUG === "true",
  dataBase = import.meta.env.VITE_WRJ_DATA_BASE?.trim() || "/data"
}: AppProps) {
  if (!mapboxToken) return <TokenMissingPage />;
  return <Workspace mapboxToken={mapboxToken} debugMode={debugMode} dataBase={dataBase} />;
}
