import {
  createDefaultUavColors,
  type MissionLayerPreference
} from "../mission/missionLayerPreferences";

export type DynamicLayerId =
  | "taskAreas"
  | "workUnits"
  | "baselineRoutes"
  | "activeRoutes"
  | "resources"
  | "event";
export type DynamicColorMode = "change" | "resource";

export interface DynamicLayerPreferencesV1 {
  version: 1;
  sceneId: string;
  colorMode: DynamicColorMode;
  layers: Record<DynamicLayerId, MissionLayerPreference>;
  changeColors: Record<string, string>;
  resourceColors: Record<string, string>;
  markerSize: number;
}

const STORAGE_PREFIX = "wrj-dynamic-layer-preferences:v1";
const HEX_COLOR = /^#[0-9A-F]{6}$/iu;

export const DEFAULT_CHANGE_COLORS = {
  baseline: "#808C97",
  baseline_locked: "#4D5761",
  baseline_reused: "#26C7DA",
  dynamic_modified: "#FFA630",
  dynamic_new: "#39D98A",
  dynamic_cancelled: "#EE5253"
} as const;

export function createDefaultDynamicLayerPreferences(
  sceneId: string,
  resourceIds: readonly string[]
): DynamicLayerPreferencesV1 {
  return {
    version: 1,
    sceneId,
    colorMode: "change",
    layers: {
      taskAreas: {visible: true, opacity: 0.2, filled: true, stroked: true},
      workUnits: {visible: true, opacity: 0.75, width: 2},
      baselineRoutes: {visible: true, opacity: 0.55, width: 2},
      activeRoutes: {visible: true, opacity: 0.95, width: 4},
      resources: {visible: true, opacity: 1},
      event: {visible: true, opacity: 0.9}
    },
    changeColors: {...DEFAULT_CHANGE_COLORS},
    resourceColors: createDefaultUavColors(resourceIds),
    markerSize: 30
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clamp(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

export function loadDynamicLayerPreferences(
  sceneId: string,
  resourceIds: readonly string[]
): DynamicLayerPreferencesV1 {
  const defaults = createDefaultDynamicLayerPreferences(sceneId, resourceIds);
  try {
    const value = JSON.parse(
      globalThis.localStorage?.getItem(`${STORAGE_PREFIX}:${sceneId}`) ?? "null"
    ) as unknown;
    if (
      !isRecord(value) ||
      value.version !== 1 ||
      value.sceneId !== sceneId ||
      !isRecord(value.layers) ||
      !isRecord(value.changeColors) ||
      !isRecord(value.resourceColors)
    ) {
      return defaults;
    }
    const layers = Object.fromEntries(
      Object.entries(defaults.layers).map(([id, fallback]) => {
        const stored = isRecord(value.layers)
          ? value.layers[id]
          : undefined;
        return [id, {
          ...fallback,
          ...(isRecord(stored) ? {
            visible: typeof stored.visible === "boolean"
              ? stored.visible
              : fallback.visible,
            opacity: clamp(stored.opacity, 0, 1, fallback.opacity),
            width: fallback.width === undefined
              ? undefined
              : clamp(stored.width, 0.5, 20, fallback.width)
          } : {})
        }];
      })
    ) as DynamicLayerPreferencesV1["layers"];
    const colors = (
      stored: Record<string, unknown>,
      fallback: Record<string, string>
    ) => Object.fromEntries(Object.entries(fallback).map(([id, color]) => [
      id,
      typeof stored[id] === "string" && HEX_COLOR.test(stored[id])
        ? stored[id].toUpperCase()
        : color
    ]));
    return {
      ...defaults,
      colorMode: value.colorMode === "resource" ? "resource" : "change",
      layers,
      changeColors: colors(value.changeColors, defaults.changeColors),
      resourceColors: colors(
        value.resourceColors,
        defaults.resourceColors
      ),
      markerSize: clamp(value.markerSize, 16, 64, defaults.markerSize)
    };
  } catch {
    return defaults;
  }
}

export function saveDynamicLayerPreferences(
  preferences: DynamicLayerPreferencesV1
): void {
  try {
    globalThis.localStorage?.setItem(
      `${STORAGE_PREFIX}:${preferences.sceneId}`,
      JSON.stringify(preferences)
    );
  } catch {
    // Browser persistence is best effort.
  }
}

export function clearDynamicLayerPreferences(sceneId: string): void {
  try {
    globalThis.localStorage?.removeItem(`${STORAGE_PREFIX}:${sceneId}`);
  } catch {
    // Browser persistence is best effort.
  }
}
