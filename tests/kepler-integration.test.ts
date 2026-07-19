// @vitest-environment node
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe, expect, it} from "vitest";
import {addDataToMap, registerEntry, updateMap, wrapTo} from "@kepler.gl/actions";
import {createAppStore} from "../src/app/store";
import {caseManifestSchema, caseSummarySchema} from "../src/data/caseSchema";
import type {CaseBundle, LoadedCaseDataset} from "../src/data/loadCase";
import {loadKeplerCase} from "../src/kepler/loadKeplerCase";

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(path), "utf8")) as unknown;
}

function readOfflineKeplerConfig(): Record<string, unknown> {
  const saved = readJson("public/config/wrj-kepler-config.json");
  if (!saved || typeof saved !== "object" || !("config" in saved)) {
    throw new Error("测试 Kepler 配置无效");
  }
  const config = saved.config;
  if (!config || typeof config !== "object") throw new Error("测试地图配置无效");
  const entries = Object.entries(config).filter(([key]) => key !== "mapStyle");
  return {...saved, config: Object.fromEntries(entries)};
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

describe("Kepler P0 integration", () => {
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

    const savedConfig = readJson("public/config/wrj-kepler-config.json") as {
      config: {visState: {interactionConfig: {tooltip: {fieldsToShow: Record<string, Array<{name: string}>>}}}}
    };
    for (const [datasetId, tooltipFields] of Object.entries(
      savedConfig.config.visState.interactionConfig.tooltip.fieldsToShow
    )) {
      const actualFields = new Set(
        mapState.visState.datasets[datasetId].fields.map(({name}) => name)
      );
      for (const {name} of tooltipFields) expect(actualFields.has(name)).toBe(true);
    }
  });
});
