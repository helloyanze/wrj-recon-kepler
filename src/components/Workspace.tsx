import {mapStyleChange, updateMap, wrapTo} from "@kepler.gl/actions";
import type {ComponentType} from "react";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {useDispatch, useSelector, useStore} from "react-redux";
import type {AppDispatch, RootState} from "../app/store";
import type {ResolvedBasemap} from "../basemap/basemapConfig";
import type {CaseSummary} from "../data/caseSchema";
import {loadCase} from "../data/loadCase";
import {
  controlledLayerViewModelsFromLayers,
  selectControlledLayerViewModels,
  type ControlledLayerViewModel,
  type LayerAdvancedCapability
} from "../features/layers/layerControls";
import {
  createLayerAdvancedAction,
  createLayerOpacityAction,
  createLayerVisibilityAction,
  createSingleLayerColorAction,
  createUavPaletteAction
} from "../features/layers/keplerLayerActions";
import {
  clearLayerPreferences,
  loadLayerPreferences,
  saveLayerPreferences,
  type LayerPreference,
  type LayerPreferencesV1
} from "../features/layers/layerPreferences";
import {DEFAULT_MAP_STATE, UAV_COLORS, WRJ_MAP_ID} from "../kepler/constants";
import {loadKeplerCase} from "../kepler/loadKeplerCase";
import {
  DetailDrawer,
  type DrawerContent
} from "./workspace/DetailDrawer";
import {
  LayerSidebar,
  type LayerAppearance,
  type LayerViewModel,
  type UavId
} from "./workspace/LayerSidebar";
import {WrjKeplerMap, type WrjKeplerMapProps} from "./WrjKeplerMap";

type CaseLoader = typeof loadCase;
type KeplerLoader = typeof loadKeplerCase;
type LoadStatus = "loading" | "ready" | "error";

export interface WorkspaceProps {
  basemap: ResolvedBasemap;
  debugMode: boolean;
  dataBase: string;
  caseLoader?: CaseLoader;
  keplerLoader?: KeplerLoader;
  MapView?: ComponentType<WrjKeplerMapProps>;
}

const SINGLE_COLOR_FALLBACKS: Record<string, string> = {
  "wrj-pois-layer": "#E8F7FF",
  "wrj-context-layer": "#C5D3E0",
  "wrj-region-layer": "#35C5FF"
};

const ADVANCED_CAPABILITIES: readonly LayerAdvancedCapability[] = [
  "radius",
  "thickness",
  "trailLength",
  "filled",
  "stroked"
];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function toLayerViewModel(layer: ControlledLayerViewModel): LayerViewModel {
  const palette = layer.uavPalette ?? [
    UAV_COLORS["UAV-01"],
    UAV_COLORS["UAV-02"],
    UAV_COLORS["UAV-03"]
  ];
  const {radius, thickness, trailLength, filled, stroked} = layer.advancedValues;

  return {
    id: layer.id,
    label: layer.label,
    visible: layer.isVisible,
    definition: {
      mode: layer.colorMode,
      capabilities: layer.advancedCapabilities
    },
    appearance: {
      color: layer.singleColor ?? SINGLE_COLOR_FALLBACKS[layer.id] ?? "#35C5FF",
      opacity: layer.opacity,
      uavColors: {
        "UAV-01": palette[0],
        "UAV-02": palette[1],
        "UAV-03": palette[2]
      },
      radius: typeof radius === "number" ? radius : undefined,
      thickness: typeof thickness === "number" ? thickness : undefined,
      trailLength: typeof trailLength === "number" ? trailLength : undefined,
      filled: typeof filled === "boolean" ? filled : undefined,
      stroked: typeof stroked === "boolean" ? stroked : undefined
    }
  };
}

function preferenceFromModel(layer: ControlledLayerViewModel): LayerPreference {
  const preference: LayerPreference = {
    visible: layer.isVisible,
    opacity: layer.opacity
  };

  if (layer.singleColor) preference.color = layer.singleColor;
  if (layer.uavPalette) {
    preference.uavColors = {
      "UAV-01": layer.uavPalette[0],
      "UAV-02": layer.uavPalette[1],
      "UAV-03": layer.uavPalette[2]
    };
  }
  for (const capability of ADVANCED_CAPABILITIES) {
    const value = layer.advancedValues[capability];
    if (value !== undefined) Object.assign(preference, {[capability]: value});
  }
  return preference;
}

function preferencesFromState(state: RootState): LayerPreferencesV1 {
  const layers: LayerPreferencesV1["layers"] = {};
  for (const model of selectControlledLayerViewModels(state)) {
    if (model.available) layers[model.id] = preferenceFromModel(model);
  }
  return {version: 1, caseId: "riyue-3d", layers};
}

function cloneModels(models: ControlledLayerViewModel[]): ControlledLayerViewModel[] {
  return models.map((model) => ({
    ...model,
    uavPalette: model.uavPalette ? [...model.uavPalette] : undefined,
    advancedValues: {...model.advancedValues}
  }));
}

export function Workspace({
  basemap,
  debugMode,
  dataBase,
  caseLoader = loadCase,
  keplerLoader = loadKeplerCase,
  MapView = WrjKeplerMap
}: WorkspaceProps) {
  const dispatch = useDispatch<AppDispatch>();
  const store = useStore<RootState>();
  const keplerLayers = useSelector(
    (state: RootState) => state.keplerGl[WRJ_MAP_ID]?.visState.layers
  );
  const controlledModels = useMemo(
    () => controlledLayerViewModelsFromLayers(keplerLayers ?? []),
    [keplerLayers]
  );
  const sidebarLayers = useMemo(
    () => controlledModels.map(toLayerViewModel),
    [controlledModels]
  );

  const [status, setStatus] = useState<LoadStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<CaseSummary | null>(null);
  const [drawerContent, setDrawerContent] = useState<DrawerContent>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [styleType, setStyleType] = useState<"satellite" | "light">("satellite");
  const loadedCaseRef = useRef<string | null>(null);
  const injectionRef = useRef<{key: string; promise: Promise<void>} | null>(null);
  const generationRef = useRef(0);
  const defaultLayersRef = useRef<ControlledLayerViewModel[] | null>(null);
  const preferencesAppliedRef = useRef<string | null>(null);
  const injectionKey = `riyue-3d|${dataBase}|${debugMode}|${attempt}`;

  const resetView = useCallback(() => {
    dispatch(wrapTo(WRJ_MAP_ID, updateMap(DEFAULT_MAP_STATE)));
  }, [dispatch]);

  const changeStyle = useCallback(
    (style: "satellite" | "light") => {
      setStyleType(style);
      dispatch(wrapTo(WRJ_MAP_ID, mapStyleChange(style)));
    },
    [dispatch]
  );

  const persistCurrentLayers = useCallback(() => {
    saveLayerPreferences(preferencesFromState(store.getState()));
  }, [store]);

  const dispatchAppearance = useCallback((layerId: string, changes: Partial<LayerAppearance>) => {
    if (changes.color !== undefined) {
      const action = createSingleLayerColorAction(store.getState(), layerId, changes.color);
      if (action) dispatch(action);
    }
    if (changes.opacity !== undefined) {
      const action = createLayerOpacityAction(store.getState(), layerId, changes.opacity);
      if (action) dispatch(action);
    }
    if (changes.uavColors) {
      const currentPalette = selectControlledLayerViewModels(store.getState())
        .find(({id}) => id === layerId)?.uavPalette;
      const palette = [
        changes.uavColors["UAV-01"] ?? currentPalette?.[0] ?? UAV_COLORS["UAV-01"],
        changes.uavColors["UAV-02"] ?? currentPalette?.[1] ?? UAV_COLORS["UAV-02"],
        changes.uavColors["UAV-03"] ?? currentPalette?.[2] ?? UAV_COLORS["UAV-03"]
      ] as const;
      const action = createUavPaletteAction(store.getState(), layerId, palette);
      if (action) dispatch(action);
    }
    for (const capability of ADVANCED_CAPABILITIES) {
      const value = changes[capability];
      if (value === undefined) continue;
      const action = createLayerAdvancedAction(store.getState(), layerId, capability, value);
      if (action) dispatch(action);
    }
  }, [dispatch, store]);

  const restoreModel = useCallback((model: ControlledLayerViewModel) => {
    const visibility = createLayerVisibilityAction(store.getState(), model.id, model.isVisible);
    if (visibility) dispatch(visibility);
    dispatchAppearance(model.id, toLayerViewModel(model).appearance);
  }, [dispatch, dispatchAppearance, store]);

  const restoreAllDefaults = useCallback(() => {
    const defaults = defaultLayersRef.current;
    if (!defaults) return;
    clearLayerPreferences();
    defaults.forEach(restoreModel);
  }, [restoreModel]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerContent(null);
      const target = event.target;
      const isEditing = target instanceof HTMLElement && (
        target.isContentEditable ||
        target.matches("input, textarea, select")
      );
      if (!isEditing && event.key.toLowerCase() === "r") resetView();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [resetView]);

  useEffect(() => {
    const controller = new AbortController();
    const generation = ++generationRef.current;
    setStatus("loading");
    setError(null);
    setSummary(null);
    setDrawerContent(null);
    preferencesAppliedRef.current = null;
    defaultLayersRef.current = null;

    const run = async () => {
      try {
        const bundle = await caseLoader("riyue-3d", dataBase, controller.signal);
        if (controller.signal.aborted || generationRef.current !== generation) return;
        if (loadedCaseRef.current !== injectionKey) {
          let injection = injectionRef.current;
          if (!injection || injection.key !== injectionKey) {
            const previousInjection = injection?.promise ?? Promise.resolve();
            injection = {
              key: injectionKey,
              promise: previousInjection
                .catch(() => undefined)
                .then(() => keplerLoader(dispatch, bundle, debugMode))
            };
            injectionRef.current = injection;
          }
          await injection.promise;
          loadedCaseRef.current = injectionKey;
          if (injectionRef.current === injection) injectionRef.current = null;
        }
        if (controller.signal.aborted || generationRef.current !== generation) return;
        setSummary(bundle.summary);
        setStatus("ready");
      } catch (caught) {
        if (
          controller.signal.aborted ||
          generationRef.current !== generation ||
          isAbortError(caught)
        ) return;
        setError(errorMessage(caught));
        setStatus("error");
      }
    };
    void run();
    return () => {
      controller.abort();
      if (generationRef.current === generation) generationRef.current += 1;
    };
  }, [caseLoader, dataBase, debugMode, dispatch, injectionKey, keplerLoader]);

  useEffect(() => {
    if (
      status !== "ready" ||
      preferencesAppliedRef.current === injectionKey ||
      !controlledModels.every(({available}) => available)
    ) return;

    defaultLayersRef.current = cloneModels(controlledModels);
    preferencesAppliedRef.current = injectionKey;
    const preferences = loadLayerPreferences();
    for (const [layerId, preference] of Object.entries(preferences.layers)) {
      if (!preference) continue;
      if (preference.visible !== undefined) {
        const action = createLayerVisibilityAction(store.getState(), layerId, preference.visible);
        if (action) dispatch(action);
      }
      dispatchAppearance(layerId, preference);
    }
  }, [controlledModels, dispatch, dispatchAppearance, injectionKey, status, store]);

  const retry = () => setAttempt((value) => value + 1);
  const attribution = basemap.attributionByStyle[styleType];
  const selectedUavId = drawerContent?.type === "uav" ? drawerContent.uavId as UavId : null;
  const uavs = summary?.uavs.map((uav) => ({
    uavId: uav.uavId,
    callsign: uav.callsign,
    color: UAV_COLORS[uav.uavId]
  })) ?? [];

  return (
    <main className="workspace">
      <header className="topbar">
        <div className="brand"><span>WRJ</span><strong>静态侦察规划</strong></div>
        <div className="case-name"><small>当前算例</small><b>日月湾三维多无人机静态侦察</b></div>
        <span className={`solution-status ${status}`}><i />{status === "ready" ? "方案可行" : status === "error" ? "方案异常" : "方案加载中"}</span>
        {debugMode ? <span className="debug-badge">调试模式</span> : null}
        <div className="top-actions">
          <button type="button" className={styleType === "satellite" ? "active" : ""} onClick={() => changeStyle("satellite")} disabled={status !== "ready"}>{basemap.primaryLabel}</button>
          <button type="button" className={styleType === "light" ? "active" : ""} onClick={() => changeStyle("light")} disabled={status !== "ready"}>{basemap.secondaryLabel}</button>
          <button type="button" onClick={resetView}>重置三维视角</button>
          <button type="button" onClick={() => setDrawerContent({type: "overview"})} disabled={!summary}>任务概览</button>
        </div>
      </header>

      <section className={`workspace-body ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        <div className={`sidebar-shell ${status}`} aria-busy={status === "loading"}>
          <LayerSidebar
            collapsed={sidebarCollapsed}
            layers={sidebarLayers}
            uavs={uavs}
            selectedUavId={selectedUavId}
            onCollapsedChange={setSidebarCollapsed}
            onVisibilityChange={(layerId, visible) => {
              const action = createLayerVisibilityAction(store.getState(), layerId, visible);
              if (action) dispatch(action);
              persistCurrentLayers();
            }}
            onLayerChange={(layerId, changes) => {
              dispatchAppearance(layerId, changes);
              persistCurrentLayers();
            }}
            onRestoreDefaults={restoreAllDefaults}
            onSelectUav={(uavId) => setDrawerContent({type: "uav", uavId})}
          />
          {status !== "ready" ? <div className="sidebar-state" aria-label={status === "loading" ? "图层数据加载中" : "图层数据不可用"} /> : null}
        </div>

        <section className="map-panel">
          <MapView basemap={basemap} />
          {status === "loading" ? <div className="state-overlay"><span className="spinner" />正在加载算例数据…</div> : null}
          {status === "error" ? (
            <div className="state-overlay error-state">
              <strong>算例加载失败</strong>
              <p>{error}</p>
              <button type="button" onClick={retry}>重新加载</button>
            </div>
          ) : null}
          <div className="map-tag"><b>真实地理环境</b><span>模拟任务数据 · 不可用于真实飞行</span></div>
          {summary ? (
            <DetailDrawer
              summary={summary}
              content={drawerContent}
              attribution={attribution}
              onClose={() => setDrawerContent(null)}
            />
          ) : null}
        </section>
      </section>
    </main>
  );
}
