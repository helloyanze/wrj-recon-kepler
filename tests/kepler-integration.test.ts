// @vitest-environment node
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {addDataToMap, registerEntry, updateMap, wrapTo} from "@kepler.gl/actions";
import {createAppStore} from "../src/app/store";
import {caseManifestSchema, caseSummarySchema} from "../src/data/caseSchema";
import type {CaseBundle, LoadedCaseDataset} from "../src/data/loadCase";
import {extractFlightPaths, type UavFlightId} from "../src/features/flight/flightPaths";
import {createUavDeckLayers} from "../src/features/flight/uavDeckLayers";
import {
  createLayerAdvancedAction,
  createLayerOpacityAction,
  createLayerVisibilityAction,
  createSingleLayerColorAction,
  createUavPaletteAction
} from "../src/features/layers/keplerLayerActions";
import {loadKeplerCase, preserveRuntimeMapStyles} from "../src/kepler/loadKeplerCase";

const DEFAULT_MAPLIBRE_STYLE_URL =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const MAPBOX_SATELLITE_STYLE_URL =
  "https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v11?pluginName=Keplergl&access_token=null";
const ALLOWED_MAP_STYLE_URLS = new Set([
  DEFAULT_MAPLIBRE_STYLE_URL,
  MAPBOX_SATELLITE_STYLE_URL
]);
const mapStyleFetch = vi.fn();

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(path), "utf8")) as unknown;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readOfflineKeplerConfig(): Record<string, unknown> {
  const saved = readJson("public/config/wrj-kepler-config.json");
  if (!saved || typeof saved !== "object" || !("config" in saved)) {
    throw new Error("测试 Kepler 配置无效");
  }
  const config = saved.config;
  if (!isObjectRecord(config)) throw new Error("测试地图配置无效");
  if (!isObjectRecord(config.mapStyle)) {
    throw new Error("测试 Kepler mapStyle 配置无效");
  }
  const mapStyle = {...config.mapStyle};
  delete mapStyle.mapStyles;
  return {...saved, config: {...config, mapStyle}};
}

function loadBundleFromDisk(): CaseBundle {
  const manifest = caseManifestSchema.parse(
    readJson("public/data/riyue-3d/case-manifest.json")
  );
  const summary = caseSummarySchema.parse(
    readJson("public/data/riyue-3d/simulated/summary.json")
  );
  const datasets: LoadedCaseDataset[] = manifest.datasets.map((dataset) =>
    dataset.file.endsWith(".csv")
      ? {
          ...dataset,
          format: "csv",
          raw: readFileSync(resolve(`public${dataset.file}`), "utf8")
        }
      : {...dataset, format: "geojson", raw: readJson(`public${dataset.file}`)}
  );
  return {
    manifest,
    summary,
    // Base-map style loading is browser-only; exclude it from this offline reducer test.
    keplerConfig: readOfflineKeplerConfig(),
    datasets
  };
}

beforeEach(() => {
  mapStyleFetch.mockReset();
  mapStyleFetch.mockImplementation((input: RequestInfo | URL) => {
    if (!ALLOWED_MAP_STYLE_URLS.has(String(input))) {
      return Promise.resolve(new Response("unexpected map style URL", {status: 404}));
    }
    return Promise.resolve(
      new Response(JSON.stringify({version: 8, sources: {}, layers: []}), {status: 200})
    );
  });
  vi.stubGlobal(
    "fetch",
    mapStyleFetch
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Kepler P0 integration", () => {
  it("keeps native layer controls hidden normally and available in debug mode", () => {
    const normalStore = createAppStore(false);
    const debugStore = createAppStore(true);

    normalStore.dispatch(registerEntry({id: "wrj-map", mint: true}));
    debugStore.dispatch(registerEntry({id: "wrj-map", mint: true}));

    expect(normalStore.getState().keplerGl["wrj-map"].uiState.mapControls).toMatchObject({
      visibleLayers: {show: false},
      mapLegend: {show: false}
    });
    expect(debugStore.getState().keplerGl["wrj-map"].uiState.mapControls).toMatchObject({
      visibleLayers: {show: true},
      mapLegend: {show: true}
    });
  });

  it("removes only saved map styles before configuring the live map", () => {
    const config = {
      mapStyle: {
        styleType: "satellite",
        visibleLayerGroups: {water: true},
        mapStyles: {},
        topLevel: "preserved"
      },
      mapState: {latitude: 18.625, longitude: 110.235},
      visState: {layers: [{id: "wrj-region-layer"}]}
    };

    const preserved = preserveRuntimeMapStyles(config);

    expect(preserved).toEqual({
      mapStyle: {
        styleType: "satellite",
        visibleLayerGroups: {water: true},
        topLevel: "preserved"
      },
      mapState: {latitude: 18.625, longitude: 110.235},
      visState: {layers: [{id: "wrj-region-layer"}]}
    });
    expect(preserved).not.toBe(config);
    expect(preserved.mapStyle).not.toBe(config.mapStyle);
  });

  it("returns configs without a map-style object unchanged", () => {
    const config = {mapStyle: null, mapState: {latitude: 18.625}};

    expect(preserveRuntimeMapStyles(config)).toBe(config);
  });

  it("routes a minimal dataset to a registered map instance", async () => {
    const store = createAppStore(false);
    store.dispatch(registerEntry({id: "wrj-map", mint: true}));
    const action = addDataToMap({
      datasets: {
        info: {id: "diagnostic", label: "Diagnostic"},
        data: {
          fields: [
            {name: "longitude", type: "real"},
            {name: "latitude", type: "real"}
          ],
          rows: [[110.2, 18.62]]
        }
      },
      options: {autoCreateLayers: true}
    });
    const wrapped = wrapTo("wrj-map", action);
    expect(wrapped.meta._addr_).toBe("@@KG_WRJ-MAP");
    expect(wrapped.payload.type).toBe(action.type);
    await Promise.resolve(store.dispatch(wrapped));
    store.dispatch(registerEntry({id: "other-map", mint: true}));

    expect(Object.keys(store.getState().keplerGl["wrj-map"].visState.datasets)).toEqual([
      "diagnostic"
    ]);
    expect(Object.keys(store.getState().keplerGl["other-map"].visState.datasets)).toEqual([]);
  });

  it("applies wrapped view actions only to the addressed live instance", () => {
    const store = createAppStore(false);
    store.dispatch(registerEntry({id: "wrj-map", mint: true}));
    store.dispatch(registerEntry({id: "other-map", mint: true}));

    store.dispatch(wrapTo("wrj-map", updateMap({zoom: 9.25})));

    expect(store.getState().keplerGl["wrj-map"].mapState.zoom).toBe(9.25);
    expect(store.getState().keplerGl["other-map"].mapState.zoom).not.toBe(9.25);
  });

  it("loads six fixed datasets and configured layers into wrj-map", async () => {
    const store = createAppStore(false);
    store.dispatch(registerEntry({id: "wrj-map", mint: true}));
    await loadKeplerCase(store.dispatch, loadBundleFromDisk(), false);

    await expect.poll(() =>
      Object.keys(store.getState().keplerGl["wrj-map"].visState.datasets).length
    ).toBe(6);

    const mapState = store.getState().keplerGl["wrj-map"];
    expect(Object.keys(mapState.visState.datasets).sort()).toEqual(
      [
        "wrj-real-context",
        "wrj-real-pois",
        "wrj-simulated-planned-routes",
        "wrj-simulated-region",
        "wrj-simulated-strips",
        "wrj-simulated-trips"
      ].sort()
    );
    expect(
      mapState.visState.datasets["wrj-simulated-trips"].fields.map(({name, type}) => ({
        name,
        type
      }))
    ).toContainEqual({name: "_geojson", type: "geojson"});
    expect(mapState.visState.layers.map((layer) => layer.id)).toEqual([
      "wrj-region-layer",
      "wrj-context-layer",
      "wrj-pois-layer",
      "wrj-strips-layer",
      "wrj-routes-layer",
      "wrj-trip-layer"
    ]);
    expect(mapState.mapState).toMatchObject({
      latitude: 18.625,
      longitude: 110.235,
      pitch: 52,
      bearing: -18
    });
    expect(mapState.mapStyle.styleType).toBe("satellite");
    expect(mapStyleFetch.mock.calls.map(([url]) => String(url))).toEqual([
      DEFAULT_MAPLIBRE_STYLE_URL,
      MAPBOX_SATELLITE_STYLE_URL
    ]);

    const savedConfig = readJson("public/config/wrj-kepler-config.json") as {
      config: {
        mapStyle: {styleType: string; mapStyles: Record<string, unknown>};
        visState: {interactionConfig: {tooltip: {fieldsToShow: Record<string, Array<{name: string}>>}}};
      }
    };
    expect(savedConfig.config.mapStyle.styleType).toBe("satellite");
    expect(savedConfig.config.mapStyle.mapStyles).toEqual({});
    for (const [datasetId, tooltipFields] of Object.entries(
      savedConfig.config.visState.interactionConfig.tooltip.fieldsToShow
    )) {
      const actualFields = new Set(
        mapState.visState.datasets[datasetId].fields.map(({name}) => name)
      );
      for (const {name} of tooltipFields) expect(actualFields.has(name)).toBe(true);
    }

    const animationTime = mapState.visState.animationConfig.currentTime;
    const actions = [
      createLayerVisibilityAction(store.getState(), "wrj-pois-layer", false),
      createLayerOpacityAction(store.getState(), "wrj-routes-layer", 0.41),
      createSingleLayerColorAction(store.getState(), "wrj-region-layer", "#123ABC"),
      createUavPaletteAction(store.getState(), "wrj-trip-layer", [
        "#102030",
        "#405060",
        "#708090"
      ]),
      createLayerAdvancedAction(store.getState(), "wrj-trip-layer", "trailLength", 900)
    ];
    for (const action of actions) {
      expect(action).not.toBeNull();
      if (action) store.dispatch(action);
    }

    const updatedLayers = store.getState().keplerGl["wrj-map"].visState.layers;
    const updated = (id: string) => updatedLayers.find((layer) => layer.id === id)!;
    expect(updated("wrj-pois-layer").config.isVisible).toBe(false);
    expect(updated("wrj-routes-layer").config.visConfig).toMatchObject({
      opacity: 0.41,
      strokeOpacity: 0.41
    });
    expect(updated("wrj-region-layer").config).toMatchObject({
      color: [18, 58, 188],
      visConfig: {strokeColor: [18, 58, 188]}
    });
    expect(updated("wrj-trip-layer").config.visConfig.colorRange.colors).toEqual([
      "#102030",
      "#405060",
      "#708090"
    ]);
    expect(updated("wrj-trip-layer").config.visConfig.trailLength).toBe(900);
    expect(updated("wrj-trip-layer").config.colorScale).toBe("ordinal");
    expect(updated("wrj-trip-layer").config.colorField?.name).toBe("uav_id");
    expect(store.getState().keplerGl["wrj-map"].visState.animationConfig.currentTime)
      .toBe(animationTime);
  });

  it("keeps reducer Trip styling synchronized with the three real UAV markers", async () => {
    const store = createAppStore(false);
    store.dispatch(registerEntry({id: "wrj-map", mint: true}));
    const bundle = loadBundleFromDisk();
    await loadKeplerCase(store.dispatch, bundle, false);

    const tripDataset = bundle.datasets.find(({id}) => id === "wrj-simulated-trips");
    expect(tripDataset?.format).toBe("csv");
    if (!tripDataset || tripDataset.format !== "csv") {
      throw new Error("测试 Trip CSV 数据集缺失");
    }
    const paths = extractFlightPaths(tripDataset.raw);
    expect(paths.map(({uavId}) => uavId)).toEqual(["UAV-01", "UAV-02", "UAV-03"]);

    const currentMapState = store.getState().keplerGl["wrj-map"];
    const currentTime = currentMapState.visState.animationConfig.currentTime;
    const currentTrip = currentMapState.visState.layers.find(
      ({id}) => id === "wrj-trip-layer"
    )!;
    const [currentMarkerLayer] = createUavDeckLayers({
      paths,
      time: currentTime,
      visible: currentTrip.config.isVisible,
      palette: currentTrip.config.visConfig.colorRange.colors
    });
    const currentMarkers = currentMarkerLayer.props.data as ReadonlyArray<{uavId: UavFlightId}>;
    expect(currentMarkers.map(({uavId}) => uavId)).toEqual(["UAV-01", "UAV-02", "UAV-03"]);

    const paletteAction = createUavPaletteAction(store.getState(), "wrj-trip-layer", [
      "#102030",
      "#405060",
      "#708090"
    ]);
    expect(paletteAction).not.toBeNull();
    if (paletteAction) store.dispatch(paletteAction);

    const recoloredTrip = store.getState().keplerGl["wrj-map"].visState.layers.find(
      ({id}) => id === "wrj-trip-layer"
    )!;
    const [recoloredMarkerLayer] = createUavDeckLayers({
      paths,
      time: currentTime,
      visible: recoloredTrip.config.isVisible,
      palette: recoloredTrip.config.visConfig.colorRange.colors
    });
    const recoloredMarkers = recoloredMarkerLayer.props.data as ReadonlyArray<{
      uavId: UavFlightId;
      color: readonly [number, number, number, number];
    }>;
    expect(recoloredMarkers.map(({uavId, color}) => [uavId, color])).toEqual([
      ["UAV-01", [16, 32, 48, 255]],
      ["UAV-02", [64, 80, 96, 255]],
      ["UAV-03", [112, 128, 144, 255]]
    ]);

    const hideAction = createLayerVisibilityAction(
      store.getState(),
      "wrj-trip-layer",
      false
    );
    expect(hideAction).not.toBeNull();
    if (hideAction) store.dispatch(hideAction);
    const hiddenTrip = store.getState().keplerGl["wrj-map"].visState.layers.find(
      ({id}) => id === "wrj-trip-layer"
    )!;
    expect(createUavDeckLayers({
      paths,
      time: currentTime,
      visible: hiddenTrip.config.isVisible,
      palette: hiddenTrip.config.visConfig.colorRange.colors
    })).toEqual([]);
    expect(store.getState().keplerGl["wrj-map"].visState.animationConfig.currentTime)
      .toBe(currentTime);
  });
});
