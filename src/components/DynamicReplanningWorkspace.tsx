import {updateMap, wrapTo} from "@kepler.gl/actions";
import type {ComponentType, ReactNode} from "react";
import {useEffect, useMemo, useState} from "react";
import {useDispatch} from "react-redux";

import type {AppDispatch} from "../app/store";
import type {ResolvedBasemap} from "../basemap/basemapConfig";
import {
  buildDynamicScene,
  type DynamicScene
} from "../features/dynamic-replanning/buildDynamicScene";
import type {
  DynamicOverlayOptions
} from "../features/dynamic-replanning/dynamicDeckLayers";
import type {
  LoadedDynamicScenePackage
} from "../features/dynamic-replanning/dynamicSceneSchema";
import type {
  VerticalScale
} from "../features/mission/missionLayerPreferences";
import {
  useDynamicPlayback
} from "../hooks/useDynamicPlayback";
import {
  useDynamicSceneLibrary,
  type UseDynamicSceneLibraryOptions
} from "../hooks/useDynamicSceneLibrary";
import {WRJ_MAP_ID} from "../kepler/constants";
import {
  DynamicDetailDrawer,
  type DynamicDrawerContent
} from "./dynamic/DynamicDetailDrawer";
import {DynamicLegend} from "./dynamic/DynamicLegend";
import {DynamicSceneSidebar} from "./dynamic/DynamicSceneSidebar";
import {DynamicStatusBanner} from "./dynamic/DynamicStatusBanner";
import {DynamicTimeline} from "./dynamic/DynamicTimeline";
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
      <strong>Task 2 场景数据加载失败</strong>
      <p>{shortError(message)}</p>
      {debugMode ? <pre>{message}</pre> : null}
      <button type="button" onClick={onRetry}>重新加载</button>
      <p>可切回任务一继续使用静态规划。</p>
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
  const [drawerContent, setDrawerContent] =
    useState<DynamicDrawerContent>(null);

  useEffect(() => {
    setDrawerContent(null);
    setVerticalScale(1);
  }, [scene.config.sceneId]);

  useEffect(() => {
    if (!playback.automaticCamera) return;
    if (playback.phase === "EVENT_ALERT") {
      dispatch(wrapTo(WRJ_MAP_ID, updateMap({
        longitude: scene.eventPosition[0],
        latitude: scene.eventPosition[1],
        zoom: 12,
        transitionDuration: 650
      })));
    } else if (playback.phase === "RESULT_HOLD") {
      dispatch(wrapTo(WRJ_MAP_ID, updateMap({
        longitude: scene.baseline.displayTransform.anchorLongitude,
        latitude: scene.baseline.displayTransform.anchorLatitude,
        zoom: 10,
        transitionDuration: 800
      })));
    }
  }, [
    dispatch,
    playback.automaticCamera,
    playback.phase,
    scene
  ]);

  const overlay = useMemo<DynamicOverlayOptions>(() => ({
    scene,
    playback,
    verticalScale,
    onSelectResource: resourceId =>
      setDrawerContent({type: "resource", resourceId}),
    onSelectTask: taskId =>
      setDrawerContent({type: "task", taskId}),
    onSelectSegment: segmentId =>
      setDrawerContent({type: "segment", segmentId})
  }), [playback, scene, verticalScale]);

  return (
    <main className="workspace task2-workspace">
      <header className="topbar task2-topbar">
        {modeSwitch}
        <div className="brand">
          <span>WRJ</span><strong>动态重规划演示</strong>
        </div>
        <label className="case-selector">
          <span className="sr-only">选择动态场景</span>
          <select
            aria-label="选择动态场景"
            value={selectedSceneId}
            onChange={event => onSelectScene(event.currentTarget.value)}
          >
            {entries.map(entry => (
              <option
                key={entry.sceneId}
                value={entry.sceneId}
                disabled={entry.disabled}
              >
                {entry.displayName}
                {entry.disabled ? "（不可用）" : ""}
              </option>
            ))}
          </select>
        </label>
        <DynamicStatusBanner status={scene.view.activePlan.planStatus} />
        <div className="height-controls" role="group" aria-label="高度比例">
          {([1, 2, 4] as const).map(scale => (
            <button
              key={scale}
              type="button"
              aria-pressed={verticalScale === scale}
              onClick={() => setVerticalScale(scale)}
            >
              {scale}×
            </button>
          ))}
        </div>
      </header>
      <section className="task2-workspace__body">
        <DynamicSceneSidebar
          scene={scene}
          phase={playback.phase}
          onSelectResource={resourceId =>
            setDrawerContent({type: "resource", resourceId})
          }
          onSelectTask={taskId =>
            setDrawerContent({type: "task", taskId})
          }
        />
        <section
          className="map-panel task2-map-panel"
          onPointerDownCapture={playback.disableAutomaticCamera}
        >
          <MapView
            basemap={basemap}
            dynamicOverlay={overlay}
            verticalScale={verticalScale}
          />
          <DynamicLegend />
          <DynamicTimeline
            missionTimeSec={playback.missionTimeSec}
            makespanSec={scene.makespanSec}
            eventTimeSec={scene.eventTimeSec}
            planCommitTimeSec={scene.planCommitTimeSec}
            playing={playback.playing}
            rate={playback.rate}
            onToggle={playback.toggle}
            onSeek={playback.seek}
            onRateChange={playback.setRate}
            onRestart={playback.restart}
          />
          <DynamicDetailDrawer
            scene={scene}
            content={drawerContent}
            onClose={() => setDrawerContent(null)}
          />
        </section>
      </section>
    </main>
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
            正在加载 Task 2 场景…
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
