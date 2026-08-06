import {updateMap, wrapTo} from "@kepler.gl/actions";
import type {ComponentType, ReactNode} from "react";
import {useCallback, useEffect, useMemo, useState} from "react";
import {useDispatch} from "react-redux";

import type {AppDispatch} from "../app/store";
import type {ResolvedBasemap} from "../basemap/basemapConfig";
import {
  buildDynamicScene,
  type DynamicScene
} from "../features/dynamic-replanning/buildDynamicScene";
import {
  cameraTransitionDuration
} from "../features/dynamic-replanning/cameraMotion";
import {
  automaticDecisionStageIndex,
  isPlanPublished
} from "../features/dynamic-replanning/decisionPresentation";
import {
  CATEGORY_LABELS,
  DATA_NATURE_LABELS
} from "../features/dynamic-replanning/decisionLabels";
import type {
  DynamicOverlayOptions
} from "../features/dynamic-replanning/dynamicDeckLayers";
import {
  clearDynamicLayerPreferences,
  createDefaultDynamicLayerPreferences,
  loadDynamicLayerPreferences,
  saveDynamicLayerPreferences,
  type DynamicLayerPreferencesV1
} from "../features/dynamic-replanning/dynamicLayerPreferences";
import {
  dynamicSceneMapState
} from "../features/dynamic-replanning/dynamicSceneMapState";
import {
  dynamicSceneCategories,
  type LoadedDynamicScenePackage
} from "../features/dynamic-replanning/dynamicSceneSchema";
import type {
  VerticalScale
} from "../features/mission/missionLayerPreferences";
import {useDynamicPlayback} from "../hooks/useDynamicPlayback";
import {
  useDynamicSceneLibrary,
  type UseDynamicSceneLibraryOptions
} from "../hooks/useDynamicSceneLibrary";
import {WRJ_MAP_ID} from "../kepler/constants";
import {DecisionProcessPanel} from "./dynamic/DecisionProcessPanel";
import {
  DynamicDetailDrawer,
  type DynamicDrawerContent
} from "./dynamic/DynamicDetailDrawer";
import {DynamicLayerSidebar} from "./dynamic/DynamicLayerSidebar";
import {DynamicStatusBanner} from "./dynamic/DynamicStatusBanner";
import {DynamicTimeline} from "./dynamic/DynamicTimeline";
import {MissionWorkbenchShell} from "./workspace/MissionWorkbenchShell";
import {WrjKeplerMap, type WrjKeplerMapProps} from "./WrjKeplerMap";

export interface DynamicReplanningWorkspaceProps {
  basemap: ResolvedBasemap;
  debugMode: boolean;
  dataBase: string;
  dependencies?: Pick<UseDynamicSceneLibraryOptions, "fetcher">;
  modeSwitch?: ReactNode;
  MapView?: ComponentType<WrjKeplerMapProps>;
}

interface SceneBuildResult {
  scene: DynamicScene | null;
  error: Error | null;
}

function buildSceneResult(
  scenePackage: LoadedDynamicScenePackage | null
): SceneBuildResult {
  if (scenePackage === null) return {scene: null, error: null};
  try {
    return {scene: buildDynamicScene(scenePackage), error: null};
  } catch (caught) {
    return {
      scene: null,
      error: caught instanceof Error ? caught : new Error(String(caught))
    };
  }
}

function shortError(error: string): string {
  const firstLine = error.split(/\r?\n/u)[0];
  return firstLine.length <= 180
    ? firstLine
    : `${firstLine.slice(0, 177)}…`;
}

function DynamicDataError({
  message,
  debugMode,
  onRetry
}: {
  message: string;
  debugMode: boolean;
  onRetry(): void;
}) {
  return (
    <section className="task2-data-error" role="alert">
      <strong>任务二场景数据加载失败</strong>
      <p>{shortError(message)}</p>
      {debugMode ? <pre>{message}</pre> : null}
      <button type="button" onClick={onRetry}>重新加载</button>
      <p>可以切回任务一继续使用静态规划工作台。</p>
    </section>
  );
}

function ReadyDynamicWorkspace({
  scene,
  entries,
  selectedSceneId,
  onSelectScene,
  basemap,
  modeSwitch,
  MapView
}: {
  scene: DynamicScene;
  entries: ReturnType<typeof useDynamicSceneLibrary>["entries"];
  selectedSceneId: string;
  onSelectScene(sceneId: string): void;
  basemap: ResolvedBasemap;
  modeSwitch?: ReactNode;
  MapView: ComponentType<WrjKeplerMapProps>;
}) {
  const dispatch = useDispatch<AppDispatch>();
  const playback = useDynamicPlayback(scene);
  const [verticalScale, setVerticalScale] = useState<VerticalScale>(1);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [drawerContent, setDrawerContent] =
    useState<DynamicDrawerContent>(null);
  const [manualStageIndex, setManualStageIndex] =
    useState<number | null>(null);
  const [layerPreferences, setLayerPreferences] =
    useState<DynamicLayerPreferencesV1>(() =>
      loadDynamicLayerPreferences(
        scene.config.sceneId,
        [...scene.resourcesById.keys()],
        [...scene.tasksById.keys()]
      )
    );

  const resetView = useCallback(() => {
    dispatch(wrapTo(
      WRJ_MAP_ID,
      updateMap(dynamicSceneMapState(scene))
    ));
  }, [dispatch, scene]);

  useEffect(() => {
    setDrawerContent(null);
    setVerticalScale(1);
    setManualStageIndex(null);
    setLayerPreferences(loadDynamicLayerPreferences(
      scene.config.sceneId,
      [...scene.resourcesById.keys()],
      [...scene.tasksById.keys()]
    ));
    resetView();
  }, [resetView, scene.config.sceneId, scene.resourcesById, scene.tasksById]);

  useEffect(() => {
    if (!playback.automaticCamera) return;
    if (playback.phase === "EVENT_ALERT") {
      dispatch(wrapTo(WRJ_MAP_ID, updateMap({
        longitude: scene.eventPosition[0],
        latitude: scene.eventPosition[1],
        zoom: 12,
        transitionDuration: cameraTransitionDuration(650)
      })));
    } else if (playback.phase === "RESULT_HOLD") {
      dispatch(wrapTo(WRJ_MAP_ID, updateMap({
        longitude: scene.baseline.displayTransform.anchorLongitude,
        latitude: scene.baseline.displayTransform.anchorLatitude,
        zoom: 10,
        transitionDuration: cameraTransitionDuration(800)
      })));
    }
  }, [
    dispatch,
    playback.automaticCamera,
    playback.phase,
    scene
  ]);

  const updateLayerPreferences = useCallback((
    next: DynamicLayerPreferencesV1
  ) => {
    setLayerPreferences(next);
    saveDynamicLayerPreferences(next);
  }, []);
  const restoreLayerDefaults = useCallback(() => {
    clearDynamicLayerPreferences(scene.config.sceneId);
    setLayerPreferences(createDefaultDynamicLayerPreferences(
      scene.config.sceneId,
      [...scene.resourcesById.keys()],
      [...scene.tasksById.keys()]
    ));
  }, [scene]);

  const overlay = useMemo<DynamicOverlayOptions>(() => ({
    scene,
    playback,
    verticalScale,
    preferences: layerPreferences,
    onSelectResource: resourceId =>
      setDrawerContent({type: "resource", resourceId}),
    onSelectTask: taskId =>
      setDrawerContent({type: "task", taskId}),
    onSelectSegment: segmentId =>
      setDrawerContent({type: "segment", segmentId})
  }), [layerPreferences, playback, scene, verticalScale]);
  const groupedEntries = useMemo(() => dynamicSceneCategories.map(category => ({
    category,
    entries: entries.filter(entry => entry.category === category)
  })).filter(group => group.entries.length > 0), [entries]);
  const selectedEntry = entries.find(entry => entry.sceneId === selectedSceneId)
    ?? entries[0];
  const unavailableEntries = entries.filter(entry => entry.disabled && entry.error);
  const sceneErrorDescriptionId = unavailableEntries.length === 0
    ? undefined
    : "task2-scene-errors";

  const automaticStageIndex = automaticDecisionStageIndex(playback, scene);
  const stageIndex = manualStageIndex ?? automaticStageIndex;
  const selectStage = useCallback((index: number) => {
    playback.pause();
    setManualStageIndex(index);
  }, [playback]);
  const pauseDecision = useCallback(() => {
    playback.pause();
    if (automaticStageIndex !== null) {
      setManualStageIndex(automaticStageIndex);
    }
  }, [automaticStageIndex, playback]);
  const togglePlayback = useCallback(() => {
    if (playback.playing) {
      pauseDecision();
    } else {
      setManualStageIndex(null);
      playback.play();
    }
  }, [pauseDecision, playback]);
  const published = isPlanPublished(playback);

  return (
    <MissionWorkbenchShell
      className="task2-workspace"
      modeSwitch={modeSwitch}
      title="动态重规划演示"
      sourceSelector={(
        <div className="task2-scene-selector">
          <label className="case-selector">
            <span className="sr-only">选择动态场景</span>
            <select
              aria-label="选择动态场景"
              aria-describedby={sceneErrorDescriptionId}
              value={selectedSceneId}
              onChange={event => onSelectScene(event.currentTarget.value)}
            >
              {groupedEntries.map(group => (
                <optgroup
                  key={group.category}
                  label={CATEGORY_LABELS[group.category]}
                >
                  {group.entries.map(entry => (
                    <option
                      key={entry.sceneId}
                      value={entry.sceneId}
                      disabled={entry.disabled}
                    >
                      {entry.displayName}
                      {entry.featured ? "（贯穿案例）" : ""}
                      {entry.disabled ? "（不可用）" : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <span className="task2-data-nature">
            {DATA_NATURE_LABELS[selectedEntry.dataNature]}
          </span>
          {sceneErrorDescriptionId === undefined ? null : (
            <span
              id={sceneErrorDescriptionId}
              className="sr-only"
              role="status"
            >
              {unavailableEntries.map(entry =>
                `${entry.displayName}：${entry.error}`
              ).join("；")}
            </span>
          )}
        </div>
      )}
      status={published ? (
        <DynamicStatusBanner status={scene.view.activePlan.planStatus} />
      ) : (
        <section className="task2-status" role="status">
          <strong>决策处理中</strong>
          <span>任务时间冻结，正在形成方案</span>
        </section>
      )}
      actions={(
        <>
          <div className="height-controls" role="group" aria-label="高度比例">
            {([1, 2, 4] as const).map(scale => (
              <button
                key={scale}
                type="button"
                aria-pressed={verticalScale === scale}
                className={verticalScale === scale ? "active" : ""}
                onClick={() => setVerticalScale(scale)}
              >
                {scale}×
              </button>
            ))}
          </div>
          <button type="button" onClick={resetView}>重置三维视角</button>
        </>
      )}
      sidebarClassName="ready"
      sidebarCollapsed={sidebarCollapsed}
      sidebar={(
        sidebarCollapsed ? (
          <aside
            className="task2-layer-sidebar-collapsed"
            aria-label="图层"
            data-collapsed="true"
          >
            <button
              type="button"
              aria-label="展开图层"
              onClick={() => setSidebarCollapsed(false)}
            >
              &gt;
            </button>
          </aside>
        ) : (
          <DynamicLayerSidebar
            scene={scene}
            playback={playback}
            preferences={layerPreferences}
            onChange={updateLayerPreferences}
            onRestoreDefaults={restoreLayerDefaults}
            onCollapse={() => setSidebarCollapsed(true)}
          />
        )
      )}
      map={(
        <MapView
          basemap={basemap}
          dynamicOverlay={overlay}
          verticalScale={verticalScale}
          onMapInteraction={playback.disableAutomaticCamera}
          onMapReady={resetView}
        />
      )}
      mapOverlays={(
        <DynamicDetailDrawer
          scene={scene}
          content={drawerContent}
          onClose={() => setDrawerContent(null)}
        />
      )}
      timeline={(
        <DynamicTimeline
          missionTimeSec={playback.missionTimeSec}
          makespanSec={scene.makespanSec}
          eventTimeSec={scene.eventTimeSec}
          planCommitTimeSec={scene.planCommitTimeSec}
          playing={playback.playing}
          rate={playback.rate}
          onToggle={togglePlayback}
          onSeek={value => {
            setManualStageIndex(null);
            playback.seek(value);
          }}
          onRateChange={playback.setRate}
          onRestart={() => {
            setManualStageIndex(null);
            playback.restart();
          }}
        />
      )}
      rightPanel={(
        <DecisionProcessPanel
          scene={scene}
          stageIndex={stageIndex}
          manual={manualStageIndex !== null}
          playing={playback.playing}
          onSelectStage={selectStage}
          onPrevious={() => selectStage(Math.max(0, (stageIndex ?? 0) - 1))}
          onNext={() => selectStage(Math.min(
            scene.decisionTrace.stages.length - 1,
            (stageIndex ?? 0) + 1
          ))}
          onPause={pauseDecision}
          onResumeAutomatic={() => {
            setManualStageIndex(null);
            playback.play();
          }}
        />
      )}
    />
  );
}

export function DynamicReplanningWorkspace({
  basemap,
  debugMode,
  dataBase,
  dependencies,
  modeSwitch,
  MapView = WrjKeplerMap
}: DynamicReplanningWorkspaceProps) {
  const library = useDynamicSceneLibrary({
    dataBase,
    fetcher: dependencies?.fetcher
  });
  const built = useMemo(
    () => buildSceneResult(library.scenePackage),
    [library.scenePackage]
  );
  const error = built.error?.message ?? library.error;

  if (
    library.status !== "ready" ||
    built.scene === null ||
    library.selectedSceneId === null
  ) {
    return (
      <main className="workspace task2-workspace">
        <header className="topbar task2-topbar">
          {modeSwitch}
          <div className="brand">
            <span>WRJ</span><strong>动态重规划演示</strong>
          </div>
        </header>
        {error === null ? (
          <section className="task2-loading" role="status">
            正在加载任务二场景…
          </section>
        ) : (
          <DynamicDataError
            message={error}
            debugMode={debugMode}
            onRetry={library.retry}
          />
        )}
      </main>
    );
  }

  return (
    <ReadyDynamicWorkspace
      scene={built.scene}
      entries={library.entries}
      selectedSceneId={library.selectedSceneId}
      onSelectScene={library.select}
      basemap={basemap}
      modeSwitch={modeSwitch}
      MapView={MapView}
    />
  );
}
