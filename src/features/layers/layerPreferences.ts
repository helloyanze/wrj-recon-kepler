import {getLayerControlDefinition, type LayerAdvancedCapability} from "./layerControls";

const STORAGE_KEY = "wrj-layer-preferences:v1:riyue-3d";
const CASE_ID = "riyue-3d" as const;

const LAYER_IDS = [
  "wrj-pois-layer",
  "wrj-context-layer",
  "wrj-region-layer",
  "wrj-strips-layer",
  "wrj-routes-layer",
  "wrj-trip-layer"
] as const;

const UAV_IDS = ["UAV-01", "UAV-02", "UAV-03"] as const;

type LayerId = (typeof LAYER_IDS)[number];
type UavId = (typeof UAV_IDS)[number];

export interface LayerPreference {
  visible?: boolean;
  opacity?: number;
  iconSize?: number;
  color?: string;
  uavColors?: Partial<Record<UavId, string>>;
  radius?: number;
  thickness?: number;
  trailLength?: number;
  filled?: boolean;
  stroked?: boolean;
}

export interface LayerPreferencesV1 {
  version: 1;
  caseId: typeof CASE_ID;
  layers: Partial<Record<LayerId, LayerPreference>>;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const ADVANCED_LIMITS: Readonly<Record<"radius" | "thickness" | "trailLength", number>> = {
  radius: 100,
  thickness: 50,
  trailLength: 3600
};

function isBoundedFiniteNumber(value: unknown, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= maximum;
}

function sanitizeUavColors(value: unknown): LayerPreference["uavColors"] {
  if (!isRecord(value)) return undefined;

  const result: Partial<Record<UavId, string>> = {};
  for (const uavId of UAV_IDS) {
    const color = value[uavId];
    if (typeof color === "string" && HEX_COLOR.test(color)) result[uavId] = color;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function sanitizeLayerPreference(value: unknown, layerId: LayerId): LayerPreference | undefined {
  if (!isRecord(value)) return undefined;
  const definition = getLayerControlDefinition(layerId);
  if (!definition) return undefined;
  const capabilities = new Set<LayerAdvancedCapability>(definition.advancedCapabilities);
  const supports = (capability: LayerAdvancedCapability) => capabilities.has(capability);

  const result: LayerPreference = {};
  if (typeof value.visible === "boolean") result.visible = value.visible;
  if (typeof value.opacity === "number" && Number.isFinite(value.opacity) && value.opacity >= 0 && value.opacity <= 1) {
    result.opacity = value.opacity;
  }
  if (
    definition.colorMode === "single" &&
    typeof value.color === "string" &&
    HEX_COLOR.test(value.color)
  ) result.color = value.color;

  const uavColors = sanitizeUavColors(value.uavColors);
  if (definition.colorMode === "uav" && uavColors) result.uavColors = uavColors;

  if (
    layerId === "wrj-trip-layer" &&
    typeof value.iconSize === "number" &&
    Number.isInteger(value.iconSize) &&
    value.iconSize >= 16 &&
    value.iconSize <= 64
  ) result.iconSize = value.iconSize;

  if (supports("radius") && isBoundedFiniteNumber(value.radius, ADVANCED_LIMITS.radius)) {
    result.radius = value.radius;
  }
  if (supports("thickness") && isBoundedFiniteNumber(value.thickness, ADVANCED_LIMITS.thickness)) {
    result.thickness = value.thickness;
  }
  if (supports("trailLength") && isBoundedFiniteNumber(value.trailLength, ADVANCED_LIMITS.trailLength)) {
    result.trailLength = value.trailLength;
  }
  if (supports("filled") && typeof value.filled === "boolean") result.filled = value.filled;
  if (supports("stroked") && typeof value.stroked === "boolean") result.stroked = value.stroked;

  return Object.keys(result).length > 0 ? result : undefined;
}

function sanitizePreferences(value: unknown, requireVersion: boolean): LayerPreferencesV1 {
  if (
    !isRecord(value) ||
    (requireVersion && (value.version !== 1 || value.caseId !== CASE_ID)) ||
    !isRecord(value.layers)
  ) {
    return {version: 1, caseId: CASE_ID, layers: {}};
  }

  const layers: LayerPreferencesV1["layers"] = {};
  for (const layerId of LAYER_IDS) {
    const preference = sanitizeLayerPreference(value.layers[layerId], layerId);
    if (preference) layers[layerId] = preference;
  }

  return {version: 1, caseId: CASE_ID, layers};
}

function storage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function loadLayerPreferences(): LayerPreferencesV1 {
  try {
    const serialized = storage()?.getItem(STORAGE_KEY);
    if (serialized === null || serialized === undefined) {
      return {version: 1, caseId: CASE_ID, layers: {}};
    }
    return sanitizePreferences(JSON.parse(serialized), true);
  } catch {
    return {version: 1, caseId: CASE_ID, layers: {}};
  }
}

export function saveLayerPreferences(preferences: LayerPreferencesV1): void {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(sanitizePreferences(preferences, false)));
  } catch {
    // Persistence is best-effort when storage is blocked or full.
  }
}

export function clearLayerPreferences(): void {
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    // Persistence is best-effort when storage is blocked.
  }
}
