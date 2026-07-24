export type MissionLayerId = "region" | "strips" | "routes" | "trips";
export type VerticalScale = 1 | 2 | 4;

export interface MissionLayerPreference {
  visible: boolean;
  opacity: number;
  width?: number;
  trailLengthSec?: number;
  filled?: boolean;
  stroked?: boolean;
}

export interface MissionLayerPreferencesV2 {
  version: 2;
  caseId: string;
  planId: string;
  uavColors: Record<string, string>;
  markerSize: number;
  layers: Record<MissionLayerId, MissionLayerPreference>;
}

const STORAGE_PREFIX = "wrj-mission-layer-preferences:v2";
const HEX_COLOR = /^#[0-9A-F]{6}$/i;
const UAV_PALETTE = [
  "#35C5FF",
  "#FFB44D",
  "#4ED6A0",
  "#B985FF",
  "#FF6B7A",
  "#4DDBD1"
] as const;

const DEFAULT_LAYERS: Readonly<Record<MissionLayerId, MissionLayerPreference>> = {
  region: {visible: true, opacity: 0.18, filled: true, stroked: true},
  strips: {visible: true, opacity: 0.75, width: 2},
  routes: {visible: true, opacity: 0.55, width: 2},
  trips: {visible: true, opacity: 0.95, width: 4, trailLengthSec: 240}
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sortedUniqueUavIds(uavIds: readonly string[]): string[] {
  return [...new Set(uavIds)].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
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
  const chroma = (1 - Math.abs(2 * normalizedLightness - 1)) * normalizedSaturation;
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
    .map((channel) => Math.round((channel + offset) * 255).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function defaultUavColor(uavId: string, sortedIndex: number): string {
  return UAV_PALETTE[sortedIndex] ?? hslToHex(hashString(uavId) % 360, 72, 58);
}

function createDefaultUavColors(uavIds: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    sortedUniqueUavIds(uavIds).map((uavId, index) => [uavId, defaultUavColor(uavId, index)])
  );
}

function cloneDefaultLayers(): Record<MissionLayerId, MissionLayerPreference> {
  return {
    region: {...DEFAULT_LAYERS.region},
    strips: {...DEFAULT_LAYERS.strips},
    routes: {...DEFAULT_LAYERS.routes},
    trips: {...DEFAULT_LAYERS.trips}
  };
}

export function createDefaultMissionLayerPreferences(
  caseId: string,
  planId: string,
  uavIds: readonly string[]
): MissionLayerPreferencesV2 {
  return {
    version: 2,
    caseId,
    planId,
    uavColors: createDefaultUavColors(uavIds),
    markerSize: 30,
    layers: cloneDefaultLayers()
  };
}

function clampNumber(value: unknown, minimum: number, maximum: number, fallback: number): number {
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
  } else {
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

function sanitizePreferences(
  value: unknown,
  caseId: string,
  planId: string,
  uavIds: readonly string[]
): MissionLayerPreferencesV2 {
  const defaults = createDefaultMissionLayerPreferences(caseId, planId, uavIds);
  if (
    !isRecord(value)
    || value.version !== 2
    || value.caseId !== caseId
    || value.planId !== planId
    || !isRecord(value.uavColors)
    || !isRecord(value.layers)
  ) {
    return defaults;
  }

  const storedUavColors = value.uavColors;
  const uavColors = Object.fromEntries(
    Object.keys(defaults.uavColors).map((uavId) => {
      const storedColor = storedUavColors[uavId];
      return [
        uavId,
        typeof storedColor === "string" && HEX_COLOR.test(storedColor)
          ? storedColor.toUpperCase()
          : defaults.uavColors[uavId]
      ];
    })
  );

  return {
    ...defaults,
    uavColors,
    markerSize: clampNumber(value.markerSize, 16, 64, defaults.markerSize),
    layers: {
      region: sanitizeLayer(value.layers.region, "region", defaults.layers.region),
      strips: sanitizeLayer(value.layers.strips, "strips", defaults.layers.strips),
      routes: sanitizeLayer(value.layers.routes, "routes", defaults.layers.routes),
      trips: sanitizeLayer(value.layers.trips, "trips", defaults.layers.trips)
    }
  };
}

function storageKey(caseId: string, planId: string): string {
  return `${STORAGE_PREFIX}:${caseId}:${planId}`;
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
  uavIds: readonly string[]
): MissionLayerPreferencesV2 {
  try {
    const serialized = storage()?.getItem(storageKey(caseId, planId));
    if (serialized === undefined || serialized === null) {
      return createDefaultMissionLayerPreferences(caseId, planId, uavIds);
    }
    return sanitizePreferences(JSON.parse(serialized), caseId, planId, uavIds);
  } catch {
    return createDefaultMissionLayerPreferences(caseId, planId, uavIds);
  }
}

export function saveMissionLayerPreferences(preferences: MissionLayerPreferencesV2): void {
  try {
    const uavIds = isRecord(preferences.uavColors) ? Object.keys(preferences.uavColors) : [];
    const sanitized = sanitizePreferences(preferences, preferences.caseId, preferences.planId, uavIds);
    storage()?.setItem(storageKey(sanitized.caseId, sanitized.planId), JSON.stringify(sanitized));
  } catch {
    // Browser persistence is best-effort when storage is unavailable or full.
  }
}

export function clearMissionLayerPreferences(caseId: string, planId: string): void {
  try {
    storage()?.removeItem(storageKey(caseId, planId));
  } catch {
    // Browser persistence is best-effort when storage is unavailable.
  }
}
