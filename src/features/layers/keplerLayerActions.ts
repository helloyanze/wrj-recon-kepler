import {
  layerConfigChange,
  layerToggleVisibility,
  layerVisConfigChange,
  layerVisualChannelConfigChange,
  wrapTo
} from "@kepler.gl/actions";
import type {ColorRange, LayerVisConfig} from "@kepler.gl/types";
import type {RootState} from "../../app/store";
import {WRJ_MAP_ID} from "../../kepler/constants";
import {
  getControlledKeplerLayer,
  getLayerControlDefinition,
  hexToRgb,
  rgbToHex,
  type ControlledKeplerLayer,
  type LayerAdvancedCapability
} from "./layerControls";

export type UavPalette = readonly [string, string, string];

type LayerAdvancedValue = {
  filled: boolean;
  stroked: boolean;
  radius: number;
  thickness: number;
  trailLength: number;
};

function copyColorRange(
  layer: ControlledKeplerLayer,
  key: "colorRange" | "strokeColorRange",
  colors: string[]
): ColorRange {
  const current: unknown = layer.config.visConfig[key];
  if (typeof current !== "object" || current === null) {
    return {name: "WRJ", type: "custom", category: "Custom", colors};
  }

  const record = current as Record<string, unknown>;
  return {
    ...(typeof record.name === "string" ? {name: record.name} : {}),
    ...(typeof record.type === "string" ? {type: record.type} : {}),
    ...(typeof record.category === "string" ? {category: record.category} : {}),
    ...(typeof record.reversed === "boolean" ? {reversed: record.reversed} : {}),
    colors
  };
}

export function createLayerVisibilityAction(
  state: RootState,
  layerId: string,
  isVisible: boolean
) {
  const layer = getControlledKeplerLayer(state, layerId);
  if (!layer) {
    return null;
  }

  return wrapTo(WRJ_MAP_ID, layerToggleVisibility(layer.id, isVisible));
}

export function createLayerOpacityAction(state: RootState, layerId: string, opacity: number) {
  const layer = getControlledKeplerLayer(state, layerId);
  if (!layer) {
    return null;
  }

  const newVisConfig: Partial<LayerVisConfig> = {opacity};
  if (typeof layer.config.visConfig.strokeOpacity === "number") {
    newVisConfig.strokeOpacity = opacity;
  }

  return wrapTo(WRJ_MAP_ID, layerVisConfigChange(layer, newVisConfig));
}

export function createSingleLayerColorAction(
  state: RootState,
  layerId: string,
  color: string
) {
  const definition = getLayerControlDefinition(layerId);
  const layer = getControlledKeplerLayer(state, layerId);
  if (!definition || definition.colorMode !== "single" || !layer) {
    return null;
  }

  const rgb = hexToRgb(color);
  const normalizedColor = rgbToHex(rgb);
  const colorRange = copyColorRange(layer, "colorRange", [normalizedColor]);
  const strokeColorRange = copyColorRange(layer, "strokeColorRange", [normalizedColor]);

  return wrapTo(
    WRJ_MAP_ID,
    layerConfigChange(layer, {
      color: rgb,
      visConfig: {
        ...layer.config.visConfig,
        strokeColor: rgb,
        colorRange,
        strokeColorRange
      }
    })
  );
}

export function createUavPaletteAction(
  state: RootState,
  layerId: string,
  palette: UavPalette
) {
  const definition = getLayerControlDefinition(layerId);
  const layer = getControlledKeplerLayer(state, layerId);
  if (!definition || definition.colorMode !== "uav" || !layer) {
    return null;
  }

  const colors = palette.map((color) => rgbToHex(hexToRgb(color)));
  const newVisConfig: Partial<LayerVisConfig> = {
    colorRange: copyColorRange(layer, "colorRange", colors)
  };
  if (layer.config.visConfig.strokeColorRange) {
    newVisConfig.strokeColorRange = copyColorRange(layer, "strokeColorRange", colors);
  }

  return wrapTo(
    WRJ_MAP_ID,
    layerVisualChannelConfigChange(layer, {}, "color", newVisConfig)
  );
}

export function createLayerAdvancedAction<Capability extends LayerAdvancedCapability>(
  state: RootState,
  layerId: string,
  capability: Capability,
  value: LayerAdvancedValue[Capability]
) {
  const definition = getLayerControlDefinition(layerId);
  const layer = getControlledKeplerLayer(state, layerId);
  if (
    !definition ||
    !definition.advancedCapabilities.some((supported) => supported === capability) ||
    !layer
  ) {
    return null;
  }

  const newVisConfig: Partial<LayerVisConfig> = {[capability]: value};
  return wrapTo(WRJ_MAP_ID, layerVisConfigChange(layer, newVisConfig));
}
