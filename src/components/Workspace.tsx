import {mapStyleChange, updateMap, wrapTo} from "@kepler.gl/actions";
import type {ComponentType} from "react";
import {useCallback, useEffect, useMemo, useState} from "react";
import {useDispatch} from "react-redux";
import type {AppDispatch} from "../app/store";
import type {ResolvedBasemap} from "../basemap/basemapConfig";
import {
  caseMapState
} from "../features/mission/caseMapState";
import {selectSortieStates} from "../features/mission/missionInterpolation";
import {
  clearMissionLayerPreferences,
  createDefaultMissionLayerPreferences,
  loadMissionLayerPreferences,
  saveMissionLayerPreferences,
  type MissionLayerId,
  type MissionLayerPreferencesV2
} from "../features/mission/missionLayerPreferences";
import {
  useCaseLibrary,
  type CaseLibraryDependencies
} from "../hooks/useCaseLibrary";
import {useMissionClock} from "../hooks/useMissionClock";
import {WRJ_MAP_ID} from "../kepler/constants";
import {
  DetailDrawer,
  type DrawerContent
} from "./workspace/DetailDrawer";
import {LayerSidebar} from "./workspace/LayerSidebar";
import {MissionTimeline} from "./workspace/MissionTimeline";
import {WrjKeplerMap, type WrjKeplerMapProps} from "./WrjKeplerMap";

export interface WorkspaceProps {
  basemap: ResolvedBasemap;
  debugMode: boolean;
  dataBase: string;
  caseLibraryDependencies?: CaseLibraryDependencies;
  MapView?: ComponentType<WrjKeplerMapProps>;
}

const COORDINATE_NOTICE =
  "算法数据采用 LOCAL_CARTESIAN_M；当前地图位置为日月湾视觉锚定，不代表真实地理定位。";

export function Workspace({
  basemap,
  debugMode,
  dataBase,
  caseLibraryDependencies,
  MapView = WrjKeplerMap
}: WorkspaceProps) {
  const dispatch = useDispatch<AppDispatch>();
  const caseLibrary = useCaseLibrary({
    dataBase,
    dependencies: caseLibraryDependencies
  });
  const bundle = caseLibrary.bundle;
  const caseKey = bundle === null
    ? "no-case"
    : `${bundle.case.caseId}:${bundle.case.planId}`;
  const clock = useMissionClock(
    caseKey,
    bundle?.metrics.missionMakespanSec ?? 0
  );
  const [preferences, setPreferences] =
    useState<MissionLayerPreferencesV2 | null>(null);
  const [drawerContent, setDrawerContent] = useState<DrawerContent>(null);
  const [selectedSortieId, setSelectedSortieId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [styleType, setStyleType] = useState<"satellite" | "light">("satellite");

  const uavIds = useMemo(
    () => bundle === null
      ? []
      : [...new Set(bundle.assignments.map(({uavId}) => uavId))],
    [bundle]
  );
  const liveSorties = useMemo(
    () => bundle === null
      ? []
      : selectSortieStates(bundle.sorties, clock.missionTimeSec),
    [bundle, clock.missionTimeSec]
  );
  useEffect(() => {
    if (bundle === null) {
      setPreferences(null);
      return;
    }
    setPreferences(loadMissionLayerPreferences(
      bundle.case.caseId,
      bundle.case.planId,
      uavIds
    ));
    setDrawerContent(null);
    setSelectedSortieId(null);
  }, [bundle, uavIds]);

  const resetView = useCallback(() => {
    if (bundle === null) return;
    dispatch(wrapTo(WRJ_MAP_ID, updateMap(caseMapState(bundle))));
  }, [bundle, dispatch]);

  const changeStyle = useCallback((style: "satellite" | "light") => {
    setStyleType(style);
    dispatch(wrapTo(WRJ_MAP_ID, mapStyleChange(style)));
  }, [dispatch]);

  const updatePreferences = useCallback((
    updater: (current: MissionLayerPreferencesV2) => MissionLayerPreferencesV2
  ) => {
    setPreferences(current => {
      if (current === null) return current;
      const next = updater(current);
      saveMissionLayerPreferences(next);
      return next;
    });
  }, []);

  const changeLayer = useCallback((
    id: MissionLayerId,
    changes: Partial<MissionLayerPreferencesV2["layers"][MissionLayerId]>
  ) => {
    updatePreferences(current => {
      const layer = current.layers[id];
      const nextLayer = {
        ...layer,
        opacity: changes.opacity ?? layer.opacity,
        visible: changes.visible ?? layer.visible,
        width: changes.width ?? layer.width,
        trailLengthSec: changes.trailLengthSec ?? layer.trailLengthSec,
        filled: changes.filled ?? layer.filled,
        stroked: changes.stroked ?? layer.stroked
      };
      return {
        ...current,
        layers: {...current.layers, [id]: nextLayer}
      };
    });
  }, [updatePreferences]);

  const restoreDefaults = useCallback(() => {
    if (bundle === null) return;
    clearMissionLayerPreferences(bundle.case.caseId, bundle.case.planId);
    setPreferences(createDefaultMissionLayerPreferences(
      bundle.case.caseId,
      bundle.case.planId,
      uavIds
    ));
  }, [bundle, uavIds]);

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

  const selectedUavId = drawerContent?.type === "uav"
    ? drawerContent.uavId
    : null;
  const attribution = basemap.attributionByStyle[styleType];
  const ready = caseLibrary.status === "ready" && bundle !== null;

  return (
    <main className="workspace">
      <header className="topbar">
        <div className="brand"><span>WRJ</span><strong>静态侦察规划</strong></div>
        <div className="case-name">
          <small>当前算例</small>
          <b>{bundle?.case.displayName ?? "正在读取算法算例"}</b>
        </div>
        <label>
          <span className="sr-only">选择算例</span>
          <select
            aria-label="选择算例"
            value={caseLibrary.selectedKey ?? ""}
            disabled={caseLibrary.entries.length === 0}
            onChange={event => caseLibrary.select(event.currentTarget.value)}
          >
            {caseLibrary.entries.map(entry => (
              <option key={entry.key} value={entry.key}>
                {entry.displayName}{entry.source === "imported" ? "（本地）" : ""}
              </option>
            ))}
          </select>
        </label>
        <span className={`solution-status ${caseLibrary.status}`}>
          <i />
          {ready ? "方案可行" : caseLibrary.status === "error" ? "方案异常" : "方案加载中"}
        </span>
        {debugMode ? <span className="debug-badge">调试模式</span> : null}
        <div className="top-actions">
          <button
            type="button"
            className={styleType === "satellite" ? "active" : ""}
            onClick={() => changeStyle("satellite")}
            disabled={!ready}
          >
            {basemap.primaryLabel}
          </button>
          <button
            type="button"
            className={styleType === "light" ? "active" : ""}
            onClick={() => changeStyle("light")}
            disabled={!ready}
          >
            {basemap.secondaryLabel}
          </button>
          <button type="button" onClick={resetView} disabled={bundle === null}>
            重置三维视角
          </button>
          <button
            type="button"
            onClick={() => setDrawerContent({type: "overview"})}
            disabled={bundle === null}
          >
            任务概览
          </button>
        </div>
      </header>

      <section className={`workspace-body ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        <div className={`sidebar-shell ${caseLibrary.status}`} aria-busy={!ready}>
          <LayerSidebar
            bundle={bundle}
            preferences={preferences}
            liveSorties={liveSorties}
            loading={!ready}
            collapsed={sidebarCollapsed}
            selectedUavId={selectedUavId}
            selectedSortieId={selectedSortieId}
            onCollapsedChange={setSidebarCollapsed}
            onLayerChange={changeLayer}
            onUavColorChange={(uavId, color) => {
              updatePreferences(current => ({
                ...current,
                uavColors: {...current.uavColors, [uavId]: color}
              }));
            }}
            onMarkerSizeChange={markerSize => {
              updatePreferences(current => ({...current, markerSize}));
            }}
            onRestoreDefaults={restoreDefaults}
            onSelectUav={uavId => {
              setSelectedSortieId(null);
              setDrawerContent({
                type: "uav",
                uavId
              });
            }}
            onSelectSortie={assignmentId => {
              setSelectedSortieId(assignmentId);
              setDrawerContent({type: "sortie", assignmentId});
            }}
          />
          {!ready ? (
            <div
              className="sidebar-state"
              aria-label={caseLibrary.status === "loading"
                ? "图层数据加载中"
                : "图层数据不可用"}
            />
          ) : null}
        </div>

        <section className="map-panel">
          <MapView
            basemap={basemap}
            bundle={bundle}
            missionTimeSec={clock.missionTimeSec}
            verticalScale={1}
            preferences={preferences}
            onSelectSortie={assignmentId => {
              setSelectedSortieId(assignmentId);
              setDrawerContent({type: "sortie", assignmentId});
            }}
          />
          <MissionTimeline
            missionTimeSec={clock.missionTimeSec}
            makespanSec={clock.makespanSec}
            playing={clock.playing}
            rate={clock.rate}
            sorties={bundle?.sorties ?? []}
            liveSorties={liveSorties}
            disabled={!ready}
            onToggle={clock.toggle}
            onSeek={clock.seek}
            onRateChange={clock.setRate}
          />
          {caseLibrary.status === "loading" && bundle === null ? (
            <div className="state-overlay">
              <span className="spinner" />正在加载算例数据…
            </div>
          ) : null}
          {caseLibrary.status === "error" ? (
            <div className="state-overlay error-state">
              <strong>算例加载失败</strong>
              <p>{caseLibrary.error}</p>
              <button type="button" onClick={caseLibrary.retry}>重新加载</button>
            </div>
          ) : null}
          <div className="map-tag">
            <span>{COORDINATE_NOTICE}</span>
          </div>
          {bundle !== null ? (
            <DetailDrawer
              bundle={bundle}
              liveSorties={liveSorties}
              missionTime={clock.missionTimeSec}
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
