import {IconLayer, PathLayer, PolygonLayer} from "@deck.gl/layers";

import type {TimedMapPoint} from "../cases/caseBundle";
import type {VerticalScale} from "../mission/missionLayerPreferences";
import type {
  DynamicPathChangeType,
  DynamicScene,
  DynamicTaskPolygon,
  DynamicTimedPath
} from "./buildDynamicScene";
import {
  selectDynamicResourceStates,
  type DynamicResourceState
} from "./dynamicInterpolation";
import type {DynamicPlaybackState} from "./dynamicPlayback";

type DeckColor = [number, number, number, number];
type DeckPoint = [number, number, number];

export const CHANGE_COLORS = {
  baseline: [128, 140, 151, 150],
  baseline_locked: [77, 87, 97, 255],
  baseline_reused: [38, 199, 218, 255],
  dynamic_modified: [255, 166, 48, 255],
  dynamic_new: [57, 217, 138, 255],
  dynamic_cancelled: [238, 82, 83, 255]
} as const satisfies Record<string, DeckColor>;

export interface DynamicOverlayOptions {
  scene: DynamicScene;
  playback: DynamicPlaybackState;
  verticalScale: VerticalScale;
  onSelectResource?: (resourceId: string) => void;
  onSelectTask?: (taskId: string) => void;
  onSelectSegment?: (segmentId: string) => void;
}

interface RenderedPath extends DynamicTimedPath {
  renderedPath: DeckPoint[];
}

interface EventHalo {
  position: DeckPoint;
}

interface ResourceMarker extends DynamicResourceState {
  position: DeckPoint;
}

const UAV_ICON = {
  url: "/assets/uav-triangle-mask.svg",
  width: 64,
  height: 64,
  anchorY: 32,
  mask: true
} as const;

const HALO_ICON = {
  url: "data:image/svg+xml," + encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'>" +
    "<circle cx='32' cy='32' r='25' fill='none' " +
    "stroke='white' stroke-width='5'/></svg>"
  ),
  width: 64,
  height: 64,
  anchorX: 32,
  anchorY: 32
} as const;

function colorFor(
  changeType: DynamicPathChangeType
): DeckColor {
  if (changeType === "baseline_flown") return [...CHANGE_COLORS.baseline];
  return [...CHANGE_COLORS[changeType]];
}

function scalePoint(
  point: readonly [number, number, number, ...unknown[]],
  verticalScale: VerticalScale
): DeckPoint {
  return [point[0], point[1], point[2] * verticalScale];
}

function transitionProgress(
  playback: DynamicPlaybackState,
  scene: DynamicScene
): number {
  if (playback.phase === "PLAN_TRANSITION") {
    const duration = scene.config.playback.planTransitionMs;
    return duration <= 0
      ? 1
      : Math.min(1, playback.presentationElapsedMs / duration);
  }
  return playback.phase === "ACTIVE_PLAN_RUNNING" ||
    playback.phase === "RESULT_HOLD"
    ? 1
    : 0;
}

function clippedPath(
  timedPath: readonly TimedMapPoint[],
  progress: number,
  verticalScale: VerticalScale
): DeckPoint[] {
  if (timedPath.length === 0 || progress <= 0) return [];
  if (progress >= 1) {
    return timedPath.map(point => scalePoint(point, verticalScale));
  }
  const lastIndex = Math.max(
    1,
    Math.ceil((timedPath.length - 1) * progress)
  );
  return timedPath
    .slice(0, lastIndex + 1)
    .map(point => scalePoint(point, verticalScale));
}

function activePathData(
  scene: DynamicScene,
  playback: DynamicPlaybackState,
  verticalScale: VerticalScale
): RenderedPath[] {
  const progress = transitionProgress(playback, scene);
  const paths = [
    ...scene.activePaths,
    ...scene.baselinePaths.filter(
      path => path.changeType === "dynamic_cancelled"
    )
  ];
  return paths.map(path => ({
    ...path,
    renderedPath: clippedPath(
      path.timedPath,
      path.changeType === "dynamic_new" ? progress : Math.max(progress, 1),
      verticalScale
    )
  }));
}

function selectable<T>(
  callback: ((id: string) => void) | undefined,
  id: (value: T) => string
): {onClick?: (info: {object?: T | null}) => void} {
  if (callback === undefined) return {};
  return {
    onClick: ({object}) => {
      if (object !== undefined && object !== null) callback(id(object));
    }
  };
}

export function createDynamicDeckLayers({
  scene,
  playback,
  verticalScale,
  onSelectResource,
  onSelectTask,
  onSelectSegment
}: DynamicOverlayOptions) {
  const progress = transitionProgress(playback, scene);
  const resources = selectDynamicResourceStates(scene, playback)
    .filter(
      (resource): resource is ResourceMarker => resource.position !== null
    )
    .map(resource => ({
      ...resource,
      position: scalePoint(resource.position, verticalScale)
    }));
  const eventHaloVisible = playback.phase === "EVENT_ALERT" ||
    playback.phase === "IMPACT_REVEAL";

  return [
    new PolygonLayer<DynamicTaskPolygon>({
      id: "wrj-task2-task-polygons",
      data: scene.taskPolygons,
      pickable: true,
      filled: true,
      stroked: true,
      opacity: 0.2,
      getPolygon: task => task.polygon.map(
        point => scalePoint(point, verticalScale)
      ),
      getFillColor: task => colorFor(task.changeType),
      getLineColor: task => colorFor(task.changeType),
      lineWidthMinPixels: 1,
      ...selectable(onSelectTask, task => task.taskId)
    }),
    new PathLayer<DynamicTimedPath>({
      id: "wrj-task2-baseline-paths",
      data: scene.baselinePaths.filter(
        path => path.finishTimeSec >= scene.eventTimeSec
      ),
      pickable: true,
      widthUnits: "pixels",
      getWidth: 2,
      getPath: path => path.timedPath.map(
        point => scalePoint(point, verticalScale)
      ),
      getColor: () => [...CHANGE_COLORS.baseline],
      opacity: playback.phase === "RESULT_HOLD" ? 0.2 : 0.65,
      ...selectable(onSelectSegment, path => path.segmentId)
    }),
    new PathLayer<RenderedPath>({
      id: "wrj-task2-active-paths",
      data: activePathData(scene, playback, verticalScale),
      visible: progress > 0,
      pickable: true,
      widthUnits: "pixels",
      getWidth: path => path.changeType === "dynamic_modified" ? 5 : 4,
      getPath: path => path.renderedPath,
      getColor: path => {
        const color = colorFor(path.changeType);
        return path.changeType === "dynamic_cancelled"
          ? [color[0], color[1], color[2], Math.round(255 * (1 - progress))]
          : color;
      },
      ...selectable(onSelectSegment, path => path.segmentId)
    }),
    new IconLayer<EventHalo>({
      id: "wrj-task2-event-halo",
      data: [{position: scalePoint(scene.eventPosition, verticalScale)}],
      visible: eventHaloVisible,
      pickable: false,
      billboard: true,
      sizeUnits: "pixels",
      getPosition: item => item.position,
      getColor: [255, 166, 48, 230],
      getSize: 68,
      getIcon: () => HALO_ICON
    }),
    new IconLayer<ResourceMarker>({
      id: "wrj-task2-resource-markers",
      data: resources,
      visible: true,
      pickable: true,
      billboard: false,
      sizeUnits: "pixels",
      getPosition: resource => resource.position,
      getAngle: resource => -(resource.headingDeg ?? 0),
      getColor: resource => resource.frozen
        ? [...CHANGE_COLORS.dynamic_cancelled]
        : [...CHANGE_COLORS.dynamic_new],
      getSize: 30,
      getIcon: () => UAV_ICON,
      ...selectable(onSelectResource, resource => resource.resourceId)
    })
  ];
}
