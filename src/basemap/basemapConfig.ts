export type BasemapMode = "auto" | "public" | "local" | "mapbox";
export type BasemapProvider = Exclude<BasemapMode, "auto">;

export interface MapStyleV8 {
  version: 8;
  sources: Record<string, MapStyleSource>;
  layers: MapStyleLayer[];
  [key: string]: unknown;
}

export interface MapStyleSource {
  type?: string;
  tiles?: string[];
  tileSize?: number;
  attribution?: string;
  [key: string]: unknown;
}

export interface MapStyleLayer {
  id: string;
  type: string;
  source?: string;
  [key: string]: unknown;
}

export interface BasemapEnvironment {
  mode?: string;
  mapboxToken?: string;
  localStyleUrl?: string;
  localTileUrl?: string;
  localAttribution?: string;
}

export interface BasemapStyle {
  id: "satellite" | "light";
  style: MapStyleV8;
}

export interface ResolvedBasemap {
  provider: BasemapProvider;
  mapboxToken: string;
  mapStyles?: BasemapStyle[];
  mapStylesReplaceDefault: boolean;
  primaryLabel: string;
  secondaryLabel: string;
  statusLabel: string;
  attribution: string;
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

const OSM_TILES = ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"];
const OSM_ATTRIBUTION = "© OpenStreetMap contributors";
const CARTO_TILES = ["a", "b", "c", "d"].map(
  (subdomain) => `https://${subdomain}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png`
);
const CARTO_ATTRIBUTION = "© OpenStreetMap contributors · © CARTO";

export function createRasterStyle(
  tiles: string[],
  attribution: string,
  tileSize = 256
): MapStyleV8 {
  return {
    version: 8,
    sources: {raster: {type: "raster", tiles, tileSize, attribution}},
    layers: [{id: "raster", type: "raster", source: "raster"}]
  };
}

export async function resolveBasemap(
  environment: BasemapEnvironment,
  signal?: AbortSignal,
  fetcher: Fetcher = fetch
): Promise<ResolvedBasemap> {
  const mode = resolveMode(environment.mode);
  const localStyleUrl = nonEmpty(environment.localStyleUrl);
  const localTileUrl = nonEmpty(environment.localTileUrl);
  const mapboxToken = nonEmpty(environment.mapboxToken);
  const provider = selectProvider(mode, localStyleUrl, localTileUrl, mapboxToken);

  if (provider === "public") return publicBasemap();
  if (provider === "mapbox") return mapboxBasemap(mapboxToken!);
  return localBasemap(localStyleUrl, localTileUrl, environment.localAttribution, signal, fetcher);
}

function resolveMode(mode: BasemapEnvironment["mode"]): BasemapMode {
  if (mode === undefined) return "auto";
  if (mode === "auto" || mode === "public" || mode === "local" || mode === "mapbox") return mode;
  throw configurationError(`mode 必须是 auto、public、local 或 mapbox，当前为 ${String(mode)}`);
}

function selectProvider(
  mode: BasemapMode,
  localStyleUrl: string | undefined,
  localTileUrl: string | undefined,
  mapboxToken: string | undefined
): BasemapProvider {
  if (mode === "public") return "public";
  if (mode === "mapbox") {
    if (!mapboxToken) throw configurationError("缺少 Mapbox Token");
    return "mapbox";
  }
  if (mode === "local") {
    if (!localStyleUrl && !localTileUrl) throw configurationError("缺少本地地图 Style URL 或 XYZ URL");
    return "local";
  }
  if (localStyleUrl || localTileUrl) return "local";
  return mapboxToken ? "mapbox" : "public";
}

function publicBasemap(): ResolvedBasemap {
  return {
    provider: "public",
    mapboxToken: "",
    mapStyles: [
      {id: "satellite", style: createRasterStyle(CARTO_TILES, CARTO_ATTRIBUTION)},
      {id: "light", style: createRasterStyle(OSM_TILES, OSM_ATTRIBUTION)}
    ],
    mapStylesReplaceDefault: true,
    primaryLabel: "公共地图",
    secondaryLabel: "OSM 简洁图",
    statusLabel: "公共底图",
    attribution: CARTO_ATTRIBUTION
  };
}

function mapboxBasemap(mapboxToken: string): ResolvedBasemap {
  return {
    provider: "mapbox",
    mapboxToken,
    mapStylesReplaceDefault: false,
    primaryLabel: "卫星地图",
    secondaryLabel: "简洁地图",
    statusLabel: "Mapbox 已配置",
    attribution: "© Mapbox © OpenStreetMap contributors"
  };
}

async function localBasemap(
  localStyleUrl: string | undefined,
  localTileUrl: string | undefined,
  localAttribution: string | undefined,
  signal: AbortSignal | undefined,
  fetcher: Fetcher
): Promise<ResolvedBasemap> {
  const attribution = nonEmpty(localAttribution) ?? "本地地图数据 · © OpenStreetMap contributors";
  const style = localStyleUrl
    ? await loadStyle(localStyleUrl, signal, fetcher)
    : createRasterStyle(validateXyzUrl(localTileUrl!), attribution);

  return {
    provider: "local",
    mapboxToken: "",
    mapStyles: [
      {id: "satellite", style},
      {id: "light", style: createRasterStyle(OSM_TILES, OSM_ATTRIBUTION)}
    ],
    mapStylesReplaceDefault: true,
    primaryLabel: "本地地图",
    secondaryLabel: "公共备用",
    statusLabel: "本地底图",
    attribution
  };
}

async function loadStyle(url: string, signal: AbortSignal | undefined, fetcher: Fetcher): Promise<MapStyleV8> {
  let response: Response;
  try {
    response = await fetcher(url, {signal});
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw configurationError(`无法加载本地地图样式 ${url}：${errorMessage(error)}`);
  }
  if (!response.ok) throw configurationError(`无法加载本地地图样式 ${url}（HTTP ${response.status}）`);

  let value: unknown;
  try {
    value = await response.json();
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw configurationError(`本地地图样式 JSON 解析失败（${url}）：${errorMessage(error)}`);
  }
  return validateMapStyle(value, url);
}

function validateXyzUrl(url: string): string[] {
  const missing = ["{z}", "{x}", "{y}"].filter((placeholder) => !url.includes(placeholder));
  if (missing.length) throw configurationError(`本地地图 XYZ URL 缺少占位符 ${missing.join("、")}`);
  return [url];
}

function validateMapStyle(value: unknown, url: string): MapStyleV8 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw configurationError(`本地地图样式根对象无效（${url}）`);
  }
  const style = value as Record<string, unknown>;
  if (style.version !== 8) throw configurationError(`本地地图样式 version 必须为 8（${url}）`);
  if (!style.sources || typeof style.sources !== "object" || Array.isArray(style.sources)) {
    throw configurationError(`本地地图样式 sources 必须是对象（${url}）`);
  }
  if (!Array.isArray(style.layers)) throw configurationError(`本地地图样式 layers 必须是数组（${url}）`);
  return value as MapStyleV8;
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function configurationError(message: string): Error {
  return new Error(`底图配置错误：${message}`);
}

function isAbortError(error: unknown): error is Error {
  return error instanceof Error && error.name === "AbortError";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
