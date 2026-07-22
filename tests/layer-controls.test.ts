import {
  ActionTypes,
  getActionForwardAddress
} from "@kepler.gl/actions";
import {Layer, LayerClasses} from "@kepler.gl/layers";
import {describe, expect, it} from "vitest";
import type {RootState} from "../src/app/store";
import {
  CONTROLLED_LAYER_DEFINITIONS,
  hexToRgb,
  rgbToHex,
  selectControlledLayerViewModels
} from "../src/features/layers/layerControls";
import {
  createLayerAdvancedAction,
  createLayerOpacityAction,
  createLayerVisibilityAction,
  createSingleLayerColorAction,
  createUavPaletteAction
} from "../src/features/layers/keplerLayerActions";
import {WRJ_MAP_ID} from "../src/kepler/constants";

function createGeoJsonLayer(
  id: string,
  options: {
    visible?: boolean;
    opacity?: number;
    strokeOpacity?: number;
    color?: [number, number, number];
    colors?: string[];
    colorScale?: "ordinal" | "quantile";
  } = {}
): Layer {
  const layer = new LayerClasses.geojson({id, dataId: `${id}-data`});

  return layer.updateLayerConfig<typeof layer.config>({
    isVisible: options.visible ?? true,
    color: options.color ?? [53, 197, 255],
    colorScale: options.colorScale ?? layer.config.colorScale,
    visConfig: {
      ...layer.config.visConfig,
      opacity: options.opacity ?? 0.55,
      strokeOpacity: options.strokeOpacity ?? 0.65,
      colorRange: {
        ...layer.config.visConfig.colorRange,
        colors: options.colors ?? ["#35C5FF", "#FFB44D", "#4ED6A0"]
      },
      strokeColorRange: {
        ...layer.config.visConfig.strokeColorRange,
        colors: options.colors ?? ["#35C5FF", "#FFB44D", "#4ED6A0"]
      }
    }
  });
}

function createRootState(layers: Layer[]): RootState {
  return {
    keplerGl: {
      [WRJ_MAP_ID]: {
        visState: {layers}
      }
    }
  } as unknown as RootState;
}

describe("controlled layer definitions", () => {
  it("keeps the six fixed layers in the requested UI order", () => {
    expect(CONTROLLED_LAYER_DEFINITIONS.map(({id}) => id)).toEqual([
      "wrj-pois-layer",
      "wrj-context-layer",
      "wrj-region-layer",
      "wrj-strips-layer",
      "wrj-routes-layer",
      "wrj-trip-layer"
    ]);
  });

  it("describes color modes and only the supported advanced controls", () => {
    expect(
      CONTROLLED_LAYER_DEFINITIONS.map(({id, colorMode, advancedCapabilities}) => ({
        id,
        colorMode,
        advancedCapabilities
      }))
    ).toEqual([
      {id: "wrj-pois-layer", colorMode: "single", advancedCapabilities: ["radius"]},
      {
        id: "wrj-context-layer",
        colorMode: "single",
        advancedCapabilities: ["thickness", "radius"]
      },
      {
        id: "wrj-region-layer",
        colorMode: "single",
        advancedCapabilities: ["filled", "stroked"]
      },
      {id: "wrj-strips-layer", colorMode: "uav", advancedCapabilities: ["thickness"]},
      {id: "wrj-routes-layer", colorMode: "uav", advancedCapabilities: ["thickness"]},
      {
        id: "wrj-trip-layer",
        colorMode: "uav",
        advancedCapabilities: ["thickness", "trailLength"]
      }
    ]);
  });
});

describe("layer colors", () => {
  it("converts #RRGGBB colors to Kepler RGB tuples and back", () => {
    expect(hexToRgb("#35c5ff")).toEqual([53, 197, 255]);
    expect(rgbToHex([255, 180, 77])).toBe("#FFB44D");
  });

  it("rejects malformed colors instead of silently changing Kepler config", () => {
    expect(() => hexToRgb("35C5FF")).toThrow(/#RRGGBB/);
    expect(() => rgbToHex([256, 0, 0])).toThrow(/0.*255/);
  });
});

describe("controlled layer selector", () => {
  it("returns stable unavailable view models when the map instance is not ready", () => {
    const state = {keplerGl: {}} as RootState;
    const models = selectControlledLayerViewModels(state);

    expect(models).toHaveLength(6);
    expect(models.every(({available}) => !available)).toBe(true);
  });

  it("reads current Kepler state and ignores layers outside the fixed definition set", () => {
    const poi = createGeoJsonLayer("wrj-pois-layer", {
      visible: false,
      opacity: 0.88,
      color: [232, 247, 255]
    });
    const unknown = createGeoJsonLayer("user-uploaded-layer");
    const models = selectControlledLayerViewModels(createRootState([unknown, poi]));

    expect(models).toHaveLength(6);
    expect(models.map(({id}) => id)).not.toContain("user-uploaded-layer");
    expect(models[0]).toMatchObject({
      id: "wrj-pois-layer",
      available: true,
      isVisible: false,
      opacity: 0.88,
      singleColor: "#E8F7FF"
    });
    expect(models[1]).toMatchObject({id: "wrj-context-layer", available: false});
  });
});

describe("wrapped Kepler layer actions", () => {
  const layerId = "wrj-strips-layer";
  const layer = createGeoJsonLayer(layerId, {colorScale: "ordinal"});
  const state = createRootState([layer]);

  it("addresses visibility changes only to wrj-map", () => {
    const action = createLayerVisibilityAction(state, layerId, false);

    expect(action).not.toBeNull();
    expect(action?.type).toBe(ActionTypes.LAYER_TOGGLE_VISIBILITY);
    expect(action?.meta._addr_).toBe(getActionForwardAddress(WRJ_MAP_ID));
    expect(action?.payload).toMatchObject({
      layerId,
      isVisible: false,
      meta: {_id_: WRJ_MAP_ID}
    });
  });

  it("maps the single opacity control to fill and stroke opacity when available", () => {
    const action = createLayerOpacityAction(state, layerId, 0.42);

    expect(action?.payload).toMatchObject({
      type: ActionTypes.LAYER_VIS_CONFIG_CHANGE,
      newVisConfig: {opacity: 0.42, strokeOpacity: 0.42}
    });
  });

  it("updates a single-color layer fill and stroke without dropping its current config", () => {
    const poi = createGeoJsonLayer("wrj-pois-layer", {color: [232, 247, 255]});
    const action = createSingleLayerColorAction(
      createRootState([poi]),
      "wrj-pois-layer",
      "#123ABC"
    );

    expect(action?.payload).toMatchObject({
      type: ActionTypes.LAYER_CONFIG_CHANGE,
      oldLayer: poi,
      newConfig: {
        color: [18, 58, 188],
        visConfig: {
          strokeColor: [18, 58, 188],
          colorRange: {colors: ["#123ABC"]},
          strokeColorRange: {colors: ["#123ABC"]}
        }
      }
    });
  });

  it("updates the UAV palette through a visual-channel action without changing the ordinal channel", () => {
    const colors = ["#102030", "#405060", "#708090"] as const;
    const action = createUavPaletteAction(state, layerId, colors);

    expect(action?.payload.type).toBe(ActionTypes.LAYER_VISUAL_CHANNEL_CHANGE);
    expect(action?.payload).toMatchObject({
      oldLayer: layer,
      channel: "color",
      newConfig: {},
      newVisConfig: {
        colorRange: {colors: [...colors]},
        strokeColorRange: {colors: [...colors]}
      }
    });
    expect(layer.config.colorScale).toBe("ordinal");
  });

  it("maps supported advanced controls into visConfig actions", () => {
    const action = createLayerAdvancedAction(state, layerId, "thickness", 3.25);

    expect(action?.payload).toMatchObject({
      type: ActionTypes.LAYER_VIS_CONFIG_CHANGE,
      oldLayer: layer,
      newVisConfig: {thickness: 3.25}
    });
  });

  it("returns null for missing, unknown, or unsupported layers instead of throwing", () => {
    expect(createLayerVisibilityAction(state, "missing-layer", true)).toBeNull();
    expect(createLayerOpacityAction(state, "user-uploaded-layer", 0.5)).toBeNull();
    expect(createLayerAdvancedAction(state, layerId, "trailLength", 500)).toBeNull();
  });
});
