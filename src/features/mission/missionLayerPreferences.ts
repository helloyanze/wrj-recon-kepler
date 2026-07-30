export type MissionLayerId = "region" | "strips" | "scanned" | "routes" | "trips";
export type LayerUavColorId = "routes" | "trips" | "markers" | "scanned";
export type VerticalScale = 1 | 2 | 4;

export interface MissionLayerPreference {
  visible: boolean;
  opacity: number;
  width?: number;
  trailLengthSec?: number;
  filled?: boolean;
  stroked?: boolean;
}

export interface MissionStripIdentity {
  stripId: string;
  uavId: string;
}

export interface MissionLayerPreferencesV3 {
  version: 3;
  caseId: string;
  planId: string;
  stripColors: Record<string, string>;
  layerUavColors: Record<LayerUavColorId, Record<string, string>>;
  markerSize: number;
  layers: Record<MissionLayerId, MissionLayerPreference>;
}

const STORAGE_PREFIX_V3 = "wrj-mission-layer-preferences:v3";
const STORAGE_PREFIX_V2 = "wrj-mission-layer-preferences:v2";
const HEX_COLOR = /^#[0-9A-F]{6}$/i;
const UAV_PALETTE = [
  "#35C5FF",
  "#FFB44D",
  "#4ED6A0",
  "#B985FF",
  "#FF6B7A",
  "#4DDBD1"
] as const;
const UAV_COLOR_LAYER_IDS: readonly LayerUavColorId[] = [
  "routes",
  "trips",
  "markers",
  "scanned"
];

const DEFAULT_LAYERS: Readonly<Record<MissionLayerId, MissionLayerPreference>> = {
  region: {visible: true, opacity: 0.18, filled: true, stroked: true},
  strips: {visible: true, opacity: 0.75, width: 2},
  scanned: {visible: true, opacity: 0.35},
  routes: {visible: true, opacity: 0.55, width: 2},
  trips: {visible: true, opacity: 0.95, width: 4, trailLengthSec: 240}
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => (
    left < right ? -1 : left > right ? 1 : 0
  ));
}

function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const normalizedHue = ((hue % 360) + 360) % 360;
  const normalizedSaturation = saturation / 100;
  const normalizedLightness = lightness / 100;
  const chroma =
    (1 - Math.abs(2 * normalizedLightness - 1)) * normalizedSaturation;
  const sector = normalizedHue / 60;
  const secondary = chroma * (1 - Math.abs(sector % 2 - 1));
  const offset = normalizedLightness - chroma / 2;

  let red = 0;
  let green = 0;
  let blue = 0;
  if (sector < 1) [red, green] = [chroma, secondary];
  else if (sector < 2) [red, green] = [secondary, chroma];
  else if (sector < 3) [green, blue] = [chroma, secondary];
  else if (sector < 4) [green, blue] = [secondary, chroma];
  else if (sector < 5) [red, blue] = [secondary, chroma];
  else [red, blue] = [chroma, secondary];

  return `#${[red, green, blue]
    .map(channel => Math.round((channel + offset) * 255)
      .toString(16)
      .padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function defaultUavColor(uavId: string, sortedIndex: number): string {
  return UAV_PALETTE[sortedIndex]
    ?? hslToHex(hashString(uavId) % 360, 72, 58);
}

function createDefaultUavColors(uavIds: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    sortedUnique(uavIds).map((uavId, index) => [
      uavId,
      defaultUavColor(uavId, index)
    ])
  );
}

function cloneDefaultLayers(): Record<MissionLayerId, MissionLayerPreference> {
  return {
    region: {...DEFAULT_LAYERS.region},
    strips: {...DEFAULT_LAYERS.strips},
    scanned: {...DEFAULT_LAYERS.scanned},
    routes: {...DEFAULT_LAYERS.routes},
    trips: {...DEFAULT_LAYERS.trips}
  };
}

function cloneLayerUavColors(
  colors: Record<string, string>
): Record<LayerUavColorId, Record<string, string>> {
  return {
    routes: {...colors},
    trips: {...colors},
    markers: {...colors},
    scanned: {...colors}
  };
}

function createStripColors(
  strips: readonly MissionStripIdentity[],
  uavColors: Readonly<Record<string, string>>
): Record<string, string> {
  return Object.fromEntries(
    [...strips]
      .filter(strip => uavColors[strip.uavId] !== undefined)
      .sort((left, right) => left.stripId.localeCompare(right.stripId))
      .map(strip => [strip.stripId, uavColors[strip.uavId]])
  );
}

export function createDefaultMissionLayerPreferences(
  caseId: string,
  planId: string,
  uavIds: readonly string[],
  strips: readonly MissionStripIdentity[] = []
): MissionLayerPreferencesV3 {
  const uavColors = createDefaultUavColors(uavIds);
  return {
    version: 3,
    caseId,
    planId,
    stripColors: createStripColors(strips, uavColors),
    layerUavColors: cloneLayerUavColors(uavColors),
    markerSize: 30,
    layers: cloneDefaultLayers()
  };
}

function clampNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

function booleanOrDefault(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function sanitizeLayer(
  value: unknown,
  layerId: MissionLayerId,
  fallback: MissionLayerPreference
): MissionLayerPreference {
  if (!isRecord(value)) return {...fallback};
  const result: MissionLayerPreference = {
    visible: booleanOrDefault(value.visible, fallback.visible),
    opacity: clampNumber(value.opacity, 0, 1, fallback.opacity)
  };

  if (layerId === "region") {
    result.filled = booleanOrDefault(value.filled, fallback.filled ?? true);
    result.stroked = booleanOrDefault(value.stroked, fallback.stroked ?? true);
  } else if (layerId !== "scanned") {
    result.width = clampNumber(value.width, 0.5, 20, fallback.width ?? 2);
  }

  if (layerId === "trips") {
    result.trailLengthSec = clampNumber(
      value.trailLengthSec,
      0,
      3600,
      fallback.trailLengthSec ?? 240
    );
  }
  return result;
}

function sanitizeColorMap(
  value: unknown,
  defaults: Readonly<Record<string, string>>
): Record<string, string> {
  const stored = isRecord(value) ? value : {};
  return Object.fromEntries(
    Object.keys(defaults).map(key => {
      const color = stored[key];
      return [
        key,
        typeof color === "string" && HEX_COLOR.test(color)
          ? color.toUpperCase()
          : defaults[key]
      ];
    })
  );
}

function sanitizeLayers(
  value: unknown,
  defaults: MissionLayerPreferencesV3
): MissionLayerPreferencesV3["layers"] {
  const layers = isRecord(value) ? value : {};
  return {
    region: sanitizeLayer(layers.region, "region", defaults.layers.region),
    strips: sanitizeLayer(layers.strips, "strips", defaults.layers.strips),
    scanned: sanitizeLayer(layers.scanned, "scanned", defaults.layers.scanned),
    routes: sanitizeLayer(layers.routes, "routes", defaults.layers.routes),
    trips: sanitizeLayer(layers.trips, "trips", defaults.layers.trips)
  };
}

function sanitizeV3(
  value: unknown,
  defaults: MissionLayerPreferencesV3
): MissionLayerPreferencesV3 {
  if (
    !isRecord(value)
    || value.version !== 3
    || value.caseId !== defaults.caseId
    || value.planId !== defaults.planId
    || !isRecord(value.stripColors)
    || !isRecord(value.layerUavColors)
    || !isRecord(value.layers)
  ) {
    return defaults;
  }
  const layerUavColors = value.layerUavColors;

  return {
    ...defaults,
    stripColors: sanitizeColorMap(value.stripColors, defaults.stripColors),
    layerUavColors: Object.fromEntries(
      UAV_COLOR_LAYER_IDS.map(layerId => [
        layerId,
        sanitizeColorMap(
          layerUavColors[layerId],
          defaults.layerUavColors[layerId]
        )
      ])
    ) as MissionLayerPreferencesV3["layerUavColors"],
    markerSize: clampNumber(value.markerSize, 16, 64, defaults.markerSize),
    layers: sanitizeLayers(value.layers, defaults)
  };
}

function migrateV2(
  value: unknown,
  defaults: MissionLayerPreferencesV3,
  strips: readonly MissionStripIdentity[]
): MissionLayerPreferencesV3 {
  if (
    !isRecord(value)
    || value.version !== 2
    || value.caseId !== defaults.caseId
    || value.planId !== defaults.planId
    || !isRecord(value.uavColors)
    || !isRecord(value.layers)
  ) {
    return defaults;
  }

  const migratedUavColors = sanitizeColorMap(
    value.uavColors,
    defaults.layerUavColors.routes
  );
  return {
    ...defaults,
    stripColors: createStripColors(strips, migratedUavColors),
    layerUavColors: cloneLayerUavColors(migratedUavColors),
    markerSize: clampNumber(value.markerSize, 16, 64, defaults.markerSize),
    layers: {
      ...sanitizeLayers(value.layers, defaults),
      scanned: {...defaults.layers.scanned}
    }
  };
}

function storageKey(prefix: string, caseId: string, planId: string): string {
  return `${prefix}:${caseId}:${planId}`;
}

function storage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function loadMissionLayerPreferences(
  caseId: string,
  planId: string,
  uavIds: readonly string[],
  strips: readonly MissionStripIdentity[] = []
): MissionLayerPreferencesV3 {
  const defaults = createDefaultMissionLayerPreferences(
    caseId,
    planId,
    uavIds,
    strips
  );
  try {
    const currentStorage = storage();
    const serializedV3 = currentStorage?.getItem(
      storageKey(STORAGE_PREFIX_V3, caseId, planId)
    );
    if (serializedV3 !== undefined && serializedV3 !== null) {
      return sanitizeV3(JSON.parse(serializedV3), defaults);
    }

    const serializedV2 = currentStorage?.getItem(
      storageKey(STORAGE_PREFIX_V2, caseId, planId)
    );
    if (serializedV2 !== undefined && serializedV2 !== null) {
      return migrateV2(JSON.parse(serializedV2), defaults, strips);
    }
    return defaults;
  } catch {
    return defaults;
  }
}

export function saveMissionLayerPreferences(
  preferences: MissionLayerPreferencesV3
): void {
  try {
    storage()?.setItem(
      storageKey(STORAGE_PREFIX_V3, preferences.caseId, preferences.planId),
      JSON.stringify(preferences)
    );
  } catch {
    // Browser persistence is best-effort when storage is unavailable or full.
  }
}

export function clearMissionLayerPreferences(caseId: string, planId: string): void {
  try {
    const currentStorage = storage();
    currentStorage?.removeItem(storageKey(STORAGE_PREFIX_V3, caseId, planId));
    currentStorage?.removeItem(storageKey(STORAGE_PREFIX_V2, caseId, planId));
  } catch {
    // Browser persistence is best-effort when storage is unavailable.
  }
}
