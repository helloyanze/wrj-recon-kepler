import {IconLayer, PathLayer, PolygonLayer} from "@deck.gl/layers";

import type {TimedMapPoint} from "../cases/caseBundle";
import type {VerticalScale} from "../mission/missionLayerPreferences";
import type {
  DynamicPathChangeType,
  DynamicScene,
  DynamicTaskPolygon,
  DynamicTimedPath,
  DynamicWorkPath
} from "./buildDynamicScene";
import type {
  DynamicLayerPreferencesV1
} from "./dynamicLayerPreferences";
import {
  createDefaultDynamicLayerPreferences
} from "./dynamicLayerPreferences";
import {isPlanPublished} from "./decisionPresentation";
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
  preferences?: DynamicLayerPreferencesV1;
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

function hexColor(value: string, alpha = 255): DeckColor {
  const normalized = value.replace(/^#/u, "");
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
    alpha
  ];
}

function colorFor(
  changeType: DynamicPathChangeType,
  preferences: DynamicLayerPreferencesV1,
  resourceId?: string
): DeckColor {
  if (
    preferences.colorMode === "resource" &&
    resourceId !== undefined &&
    preferences.resourceColors[resourceId] !== undefined
  ) {
    return hexColor(preferences.resourceColors[resourceId]);
  }
  const id = changeType === "baseline_flown" ? "baseline" : changeType;
  return hexColor(
    preferences.changeColors[id] ??
    preferences.changeColors.baseline
  );
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
  const lengths = [0];
  for (let index = 1; index < timedPath.length; index += 1) {
    lengths.push(lengths[index - 1] + Math.hypot(
      timedPath[index][0] - timedPath[index - 1][0],
      timedPath[index][1] - timedPath[index - 1][1],
      timedPath[index][2] - timedPath[index - 1][2]
    ));
  }
  const target = (lengths.at(-1) ?? 0) * progress;
  const result: DeckPoint[] = [scalePoint(timedPath[0], verticalScale)];
  for (let index = 1; index < timedPath.length; index += 1) {
    if (lengths[index] <= target) {
      result.push(scalePoint(timedPath[index], verticalScale));
      continue;
    }
    const previousLength = lengths[index - 1];
    const legLength = lengths[index] - previousLength;
    const ratio = legLength <= 0
      ? 0
      : (target - previousLength) / legLength;
    const from = timedPath[index - 1];
    const to = timedPath[index];
    result.push(scalePoint([
      from[0] + (to[0] - from[0]) * ratio,
      from[1] + (to[1] - from[1]) * ratio,
      from[2] + (to[2] - from[2]) * ratio
    ], verticalScale));
    break;
  }
  return result;
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
  preferences = createDefaultDynamicLayerPreferences(
    scene.config.sceneId,
    [...scene.resourcesById.keys()]
  ),
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
  const published = isPlanPublished(playback);
  const taskAreas = scene.taskPolygons
    .filter(task => published || task.changeType !== "dynamic_new")
    .map(task => published
      ? task
      : {...task, changeType: "baseline_reused" as const});
  const workPaths = published ? scene.workPaths : [];

  return [
    new PolygonLayer<DynamicTaskPolygon>({
      id: "wrj-task2-task-polygons",
      data: taskAreas,
      visible: preferences.layers.taskAreas.visible,
      pickable: true,
      filled: true,
      stroked: true,
      opacity: preferences.layers.taskAreas.opacity,
      getPolygon: task => task.polygon.map(
        point => scalePoint(point, verticalScale)
      ),
      getFillColor: task => colorFor(task.changeType, preferences),
      getLineColor: task => colorFor(task.changeType, preferences),
      lineWidthMinPixels: 1,
      ...selectable(onSelectTask, task => task.taskId)
    }),
    new PathLayer<DynamicTimedPath>({
      id: "wrj-task2-baseline-paths",
      data: scene.baselinePaths.filter(
        path => path.finishTimeSec >= scene.eventTimeSec
      ),
      visible: preferences.layers.baselineRoutes.visible,
      pickable: true,
      widthUnits: "pixels",
      getWidth: preferences.layers.baselineRoutes.width ?? 2,
      getPath: path => path.timedPath.map(
        point => scalePoint(point, verticalScale)
      ),
      getColor: path => colorFor("baseline", preferences, path.resourceId),
      opacity: preferences.layers.baselineRoutes.opacity *
        (playback.phase === "RESULT_HOLD" ? 0.3 : 1),
      ...selectable(onSelectSegment, path => path.segmentId)
    }),
    new PathLayer<RenderedPath>({
      id: "wrj-task2-active-paths",
      data: activePathData(scene, playback, verticalScale),
      visible: progress > 0 && preferences.layers.activeRoutes.visible,
      pickable: true,
      widthUnits: "pixels",
      getWidth: path => (
        preferences.layers.activeRoutes.width ?? 4
      ) + (path.changeType === "dynamic_modified" ? 1 : 0),
      getPath: path => path.renderedPath,
      getColor: path => {
        const color = colorFor(
          path.changeType,
          preferences,
          path.resourceId
        );
        return path.changeType === "dynamic_cancelled"
          ? [color[0], color[1], color[2], Math.round(255 * (1 - progress))]
          : [color[0], color[1], color[2], Math.round(color[3] * progress)];
      },
      opacity: preferences.layers.activeRoutes.opacity,
      ...selectable(onSelectSegment, path => path.segmentId)
    }),
    new PathLayer<DynamicWorkPath>({
      id: "wrj-task2-work-unit-paths",
      data: workPaths,
      visible: preferences.layers.workUnits.visible,
      pickable: true,
      widthUnits: "pixels",
      getWidth: preferences.layers.workUnits.width ?? 2,
      getPath: work => work.path.map(
        point => scalePoint(point, verticalScale)
      ),
      getColor: work => colorFor(work.changeType, preferences),
      opacity: preferences.layers.workUnits.opacity,
      ...selectable(onSelectTask, work => work.taskId)
    }),
    new IconLayer<EventHalo>({
      id: "wrj-task2-event-halo",
      data: [{position: scalePoint(scene.eventPosition, verticalScale)}],
      visible: eventHaloVisible && preferences.layers.event.visible,
      pickable: false,
      billboard: true,
      sizeUnits: "pixels",
      getPosition: item => item.position,
      getColor: hexColor(
        preferences.changeColors.dynamic_modified,
        Math.round(255 * preferences.layers.event.opacity)
      ),
      getSize: 68 + Math.sin(playback.presentationElapsedMs / 160) * 10,
      getIcon: () => HALO_ICON
    }),
    new IconLayer<ResourceMarker>({
      id: "wrj-task2-resource-markers",
      data: resources,
      visible: preferences.layers.resources.visible,
      pickable: true,
      billboard: false,
      sizeUnits: "pixels",
      getPosition: resource => resource.position,
      getAngle: resource => -(resource.headingDeg ?? 0),
      getColor: resource => (
        preferences.colorMode === "resource"
          ? hexColor(
              preferences.resourceColors[resource.resourceId] ??
              preferences.changeColors.dynamic_new
            )
          : colorFor(
              resource.frozen ? "dynamic_cancelled" : "dynamic_new",
              preferences
            )
      ),
      getSize: preferences.markerSize,
      opacity: preferences.layers.resources.opacity,
      getIcon: () => UAV_ICON,
      ...selectable(onSelectResource, resource => resource.resourceId)
    })
  ];
}
