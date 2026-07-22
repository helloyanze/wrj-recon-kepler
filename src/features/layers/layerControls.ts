import type {RGBColor} from "@kepler.gl/types";
import type {RootState} from "../../app/store";
import {WRJ_MAP_ID} from "../../kepler/constants";

export type ControlledKeplerLayer =
  RootState["keplerGl"][typeof WRJ_MAP_ID]["visState"]["layers"][number];

export type LayerColorMode = "single" | "uav";

export type LayerAdvancedCapability =
  | "filled"
  | "stroked"
  | "radius"
  | "thickness"
  | "trailLength";

export interface LayerControlDefinition {
  id: string;
  label: string;
  dataNature: "real" | "simulated";
  colorMode: LayerColorMode;
  advancedCapabilities: readonly LayerAdvancedCapability[];
}

export const CONTROLLED_LAYER_DEFINITIONS = [
  {
    id: "wrj-pois-layer",
    label: "真实 POI",
    dataNature: "real",
    colorMode: "single",
    advancedCapabilities: ["radius"]
  },
  {
    id: "wrj-context-layer",
    label: "真实上下文",
    dataNature: "real",
    colorMode: "single",
    advancedCapabilities: ["thickness", "radius"]
  },
  {
    id: "wrj-region-layer",
    label: "模拟任务区域",
    dataNature: "simulated",
    colorMode: "single",
    advancedCapabilities: ["filled", "stroked"]
  },
  {
    id: "wrj-strips-layer",
    label: "模拟侦察条带",
    dataNature: "simulated",
    colorMode: "uav",
    advancedCapabilities: ["thickness"]
  },
  {
    id: "wrj-routes-layer",
    label: "模拟规划航迹",
    dataNature: "simulated",
    colorMode: "uav",
    advancedCapabilities: ["thickness"]
  },
  {
    id: "wrj-trip-layer",
    label: "模拟 Trip",
    dataNature: "simulated",
    colorMode: "uav",
    advancedCapabilities: ["thickness", "trailLength"]
  }
] as const satisfies readonly LayerControlDefinition[];

export type ControlledLayerId = (typeof CONTROLLED_LAYER_DEFINITIONS)[number]["id"];

type AdvancedValue = number | boolean;

export interface ControlledLayerViewModel extends LayerControlDefinition {
  id: ControlledLayerId;
  available: boolean;
  isVisible: boolean;
  opacity: number;
  singleColor?: string;
  uavPalette?: readonly [string, string, string];
  advancedValues: Partial<Record<LayerAdvancedCapability, AdvancedValue>>;
}

const HEX_COLOR_PATTERN = /^#([0-9a-f]{6})$/i;

export function hexToRgb(hex: string): RGBColor {
  const match = HEX_COLOR_PATTERN.exec(hex);
  if (!match) {
    throw new TypeError(`Expected a #RRGGBB color, received "${hex}".`);
  }

  const value = match[1];
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16)
  ];
}

export function rgbToHex(rgb: RGBColor): string {
  if (rgb.some((component) => !Number.isInteger(component) || component < 0 || component > 255)) {
    throw new RangeError("RGB components must be integers between 0 and 255.");
  }

  return `#${rgb.map((component) => component.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

export function getLayerControlDefinition(
  id: string
): (typeof CONTROLLED_LAYER_DEFINITIONS)[number] | undefined {
  return CONTROLLED_LAYER_DEFINITIONS.find((definition) => definition.id === id);
}

export function isControlledLayerId(id: string): id is ControlledLayerId {
  return Boolean(getLayerControlDefinition(id));
}

export function getControlledKeplerLayer(
  state: RootState,
  id: string
): ControlledKeplerLayer | undefined {
  if (!isControlledLayerId(id)) {
    return undefined;
  }

  return state.keplerGl[WRJ_MAP_ID]?.visState.layers.find((layer) => layer.id === id);
}

function readFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readRgbColor(value: unknown): RGBColor | undefined {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every(
      (component) =>
        typeof component === "number" &&
        Number.isInteger(component) &&
        component >= 0 &&
        component <= 255
    )
  ) {
    return undefined;
  }

  return [value[0], value[1], value[2]];
}

function readPalette(value: unknown): readonly [string, string, string] | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const colors = (value as Record<string, unknown>).colors;
  if (
    !Array.isArray(colors) ||
    colors.length < 3 ||
    !colors.slice(0, 3).every((color) => typeof color === "string" && HEX_COLOR_PATTERN.test(color))
  ) {
    return undefined;
  }

  return [colors[0].toUpperCase(), colors[1].toUpperCase(), colors[2].toUpperCase()];
}

function readAdvancedValues(
  layer: ControlledKeplerLayer,
  capabilities: readonly LayerAdvancedCapability[]
): Partial<Record<LayerAdvancedCapability, AdvancedValue>> {
  const values: Partial<Record<LayerAdvancedCapability, AdvancedValue>> = {};

  capabilities.forEach((capability) => {
    const value: unknown = layer.config.visConfig[capability];
    if (typeof value === "number" && Number.isFinite(value)) {
      values[capability] = value;
    } else if (typeof value === "boolean") {
      values[capability] = value;
    }
  });

  return values;
}

export function controlledLayerViewModelsFromLayers(
  layers: readonly ControlledKeplerLayer[]
): ControlledLayerViewModel[] {
  return CONTROLLED_LAYER_DEFINITIONS.map((definition) => {
    const layer = layers.find(({id}) => id === definition.id);
    if (!layer) {
      return {
        ...definition,
        available: false,
        isVisible: false,
        opacity: 0,
        advancedValues: {}
      };
    }

    const base = {
      ...definition,
      available: true,
      isVisible: layer.config.isVisible,
      opacity: readFiniteNumber(layer.config.visConfig.opacity, 1),
      advancedValues: readAdvancedValues(layer, definition.advancedCapabilities)
    };

    if (definition.colorMode === "uav") {
      return {
        ...base,
        uavPalette: readPalette(layer.config.visConfig.colorRange)
      };
    }

    const color = readRgbColor(layer.config.color);
    return {
      ...base,
      singleColor: color ? rgbToHex(color) : undefined
    };
  });
}

export function selectControlledLayerViewModels(state: RootState): ControlledLayerViewModel[] {
  return controlledLayerViewModelsFromLayers(
    state.keplerGl[WRJ_MAP_ID]?.visState.layers ?? []
  );
}
