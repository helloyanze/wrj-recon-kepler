import {mapStyleChange, updateMap, wrapTo} from "@kepler.gl/actions";
import type {ComponentType} from "react";
import {useCallback, useEffect, useMemo, useState} from "react";
import {useDispatch} from "react-redux";
import type {AppDispatch} from "../app/store";
import type {ResolvedBasemap} from "../basemap/basemapConfig";
import type {CaseSummary, UavSummary} from "../data/caseSchema";
import type {CaseBundleV2} from "../features/cases/caseBundle";
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
import {
  LayerSidebar,
  type LayerAppearance,
  type LayerViewModel,
  type UavId
} from "./workspace/LayerSidebar";
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

const LAYER_METADATA: ReadonlyArray<{
  id: string;
  missionId: MissionLayerId;
  label: string;
  mode: "single" | "uav";
  capabilities: LayerViewModel["definition"]["capabilities"];
}> = [
  {
    id: "wrj-region-layer",
    missionId: "region",
    label: "算法任务区",
    mode: "single",
    capabilities: ["filled", "stroked"]
  },
  {
    id: "wrj-strips-layer",
    missionId: "strips",
    label: "侦察条带",
    mode: "uav",
    capabilities: ["thickness"]
  },
  {
    id: "wrj-routes-layer",
    missionId: "routes",
    label: "静态规划航迹",
    mode: "uav",
    capabilities: ["thickness"]
  },
  {
    id: "wrj-trip-layer",
    missionId: "trips",
    label: "动态飞行尾迹",
    mode: "uav",
    capabilities: ["thickness", "trailLength"]
  }
];

function toLegacySummary(bundle: CaseBundleV2): CaseSummary {
  const uavIds = [...new Set(bundle.assignments.map(({uavId}) => uavId))];
  const uavs = uavIds.map((uavId) => {
    const sorties = bundle.sorties.filter(sortie => sortie.uavId === uavId);
    const segments = sorties.flatMap(sortie => sortie.segments);
    const stripIds = [...new Set(sorties.flatMap(sortie => sortie.stripIds))];
    const altitude = (types?: ReadonlySet<string>) => Math.max(
      0,
      ...segments
        .filter(segment => types === undefined || types.has(segment.segmentType))
        .map(segment => segment.heightM)
    );
    return {
      uavId: uavId as UavSummary["uavId"],
      callsign: uavId,
      stripRange: stripIds.length > 0
        ? `${stripIds[0]} – ${stripIds.at(-1)}`
        : "—",
      distanceKm: sorties.reduce((sum, sortie) => sum + sortie.totalDistanceM, 0) / 1_000,
      durationMin: sorties.reduce((sum, sortie) => sum + sortie.totalDurationSec, 0) / 60,
      coverageAltitudeM: altitude(new Set(["COVERAGE_LINE", "TURN"])),
      transitAltitudeM: altitude(new Set(["ENTRY", "RETURN"])),
      maxAltitudeM: altitude(),
      status: "VALID"
    };
  });

  return {
    schemaVersion: "1.0",
    caseId: bundle.case.caseId,
    name: bundle.case.displayName,
    description: "算法输出任务规划",
    status: bundle.validation.valid ? "FEASIBLE" : "WARNING",
    demoMock: false,
    location: "日月湾视觉锚定位置",
    metrics: {
      uavCount: bundle.metrics.uavCount,
      stripCount: bundle.metrics.stripCount,
      coverageRatio: bundle.metrics.coverageRatio,
      missionMakespanSec: bundle.metrics.missionMakespanSec,
      totalDistanceKm: bundle.metrics.totalDistanceM / 1_000,
      totalFuelKg: bundle.metrics.totalFuelKg
    },
    uavs,
    notice: COORDINATE_NOTICE
  } as unknown as CaseSummary;
}

function sidebarModels(
  preferences: MissionLayerPreferencesV2 | null
): LayerViewModel[] {
  if (preferences === null) return [];
  return LAYER_METADATA.map(metadata => {
    const layer = preferences.layers[metadata.missionId];
    return {
      id: metadata.id,
      label: metadata.label,
      visible: layer.visible,
      definition: {
        mode: metadata.mode,
        capabilities: metadata.capabilities
      },
      appearance: {
        color: "#35C5FF",
        opacity: layer.opacity,
        iconSize: metadata.missionId === "trips"
          ? preferences.markerSize
          : undefined,
        thickness: layer.width,
        trailLength: layer.trailLengthSec,
        filled: layer.filled,
        stroked: layer.stroked,
        uavColors: preferences.uavColors as LayerAppearance["uavColors"]
      }
    };
  });
}

function missionLayerId(layerId: string): MissionLayerId | undefined {
  return LAYER_METADATA.find(metadata => metadata.id === layerId)?.missionId;
}

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
  const summary = useMemo(
    () => bundle === null ? null : toLegacySummary(bundle),
    [bundle]
  );
  const layers = useMemo(() => sidebarModels(preferences), [preferences]);
  const uavs = useMemo(() => uavIds.map(uavId => ({
    uavId: uavId as UavId,
    callsign: uavId,
    color: preferences?.uavColors[uavId] ?? "#FFFFFF"
  })), [preferences, uavIds]);

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
    layerId: string,
    changes: Partial<LayerAppearance>
  ) => {
    const id = missionLayerId(layerId);
    if (id === undefined) return;
    updatePreferences(current => {
      const layer = current.layers[id];
      const nextLayer = {
        ...layer,
        opacity: changes.opacity ?? layer.opacity,
        width: changes.thickness ?? layer.width,
        trailLengthSec: changes.trailLength ?? layer.trailLengthSec,
        filled: changes.filled ?? layer.filled,
        stroked: changes.stroked ?? layer.stroked
      };
      return {
        ...current,
        markerSize: changes.iconSize ?? current.markerSize,
        uavColors: changes.uavColors === undefined
          ? current.uavColors
          : {...current.uavColors, ...changes.uavColors},
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
    ? drawerContent.uavId as UavId
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
            disabled={summary === null}
          >
            任务概览
          </button>
        </div>
      </header>

      <section className={`workspace-body ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        <div className={`sidebar-shell ${caseLibrary.status}`} aria-busy={!ready}>
          <LayerSidebar
            collapsed={sidebarCollapsed}
            layers={layers}
            uavs={uavs}
            selectedUavId={selectedUavId}
            onCollapsedChange={setSidebarCollapsed}
            onVisibilityChange={(layerId, visible) => {
              const id = missionLayerId(layerId);
              if (id === undefined) return;
              updatePreferences(current => ({
                ...current,
                layers: {
                  ...current.layers,
                  [id]: {...current.layers[id], visible}
                }
              }));
            }}
            onLayerChange={changeLayer}
            onRestoreDefaults={restoreDefaults}
            onSelectUav={uavId => setDrawerContent({type: "uav", uavId})}
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
              const sortie = liveSorties.find(item => item.assignmentId === assignmentId);
              if (sortie !== undefined) {
                setDrawerContent({
                  type: "uav",
                  uavId: sortie.uavId as UavSummary["uavId"]
                });
              }
            }}
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
          {summary !== null ? (
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
