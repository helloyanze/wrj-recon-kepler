import {addDataToMap, resetMapConfig, wrapTo} from "@kepler.gl/actions";
import KeplerGlSchema from "@kepler.gl/schemas";
import type {Dispatch} from "redux";
import type {CaseBundle} from "../data/loadCase";
import {WRJ_MAP_ID} from "./constants";
import {buildKeplerDatasets} from "./datasets";

function isSavedConfig(value: Record<string, unknown>): value is {
  version: unknown;
  config: unknown;
} {
  return "version" in value && "config" in value;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function preserveRuntimeMapStyles<T>(parsedConfig: T): T;
export function preserveRuntimeMapStyles(parsedConfig: unknown): unknown {
  if (!isObjectRecord(parsedConfig) || !isObjectRecord(parsedConfig.mapStyle)) return parsedConfig;

  const mapStyle = {...parsedConfig.mapStyle};
  delete mapStyle.mapStyles;
  return {...parsedConfig, mapStyle};
}

export function loadKeplerCase(
  dispatch: Dispatch,
  bundle: CaseBundle,
  debugMode: boolean
): Promise<void> {
  if (!isSavedConfig(bundle.keplerConfig)) {
    throw new Error("Kepler 固定配置缺少 version 或 config");
  }
  const parsedConfig = KeplerGlSchema.parseSavedConfig(bundle.keplerConfig);
  if (!parsedConfig) throw new Error("Kepler 固定配置无法由 3.2.6 schema 解析");

  dispatch(wrapTo(WRJ_MAP_ID, resetMapConfig()));
  const pending = dispatch(
    wrapTo(
      WRJ_MAP_ID,
      addDataToMap({
        datasets: buildKeplerDatasets(bundle.datasets),
        options: {
          centerMap: false,
          readOnly: !debugMode,
          keepExistingConfig: false,
          autoCreateLayers: false
        },
        config: preserveRuntimeMapStyles(parsedConfig)
      })
    )
  );
  return Promise.resolve(pending).then(() => undefined);
}
