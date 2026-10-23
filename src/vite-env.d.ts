/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WRJ_LOCAL_LIGHT_STYLE_URL?: string;
  readonly VITE_MAPBOX_TOKEN?: string;
  readonly VITE_WRJ_KEPLER_DEBUG?: string;
  readonly VITE_WRJ_DATA_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
