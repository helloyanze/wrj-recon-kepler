import type {MapPoint, TimedMapPoint} from "../cases/caseBundle";
import {localToMapPoint} from "../cases/displayTransform";
import type {
  DynamicScene,
  DynamicTimedPath
} from "./buildDynamicScene";
import type {DynamicPlaybackState} from "./dynamicPlayback";
import {isPlanPublished} from "./decisionPresentation";

export interface DynamicResourceState {
  resourceId: string;
  operationalState: string;
  position: MapPoint | null;
  headingDeg: number | null;
  segmentId: string | null;
  frozen: boolean;
}

interface InterpolatedPoint {
  position: MapPoint;
  lowerPointIndex: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function interpolateDynamicPath(
  points: readonly TimedMapPoint[],
  missionTimeSec: number
): InterpolatedPoint | null {
  if (points.length === 0) return null;
  if (points.length === 1) {
    return {
      position: [points[0][0], points[0][1], points[0][2]],
      lowerPointIndex: 0
    };
  }

  let lower = 0;
  let upper = points.length;
  while (lower < upper) {
    const middle = lower + Math.floor((upper - lower) / 2);
    if (points[middle][3] <= missionTimeSec) {
      lower = middle + 1;
    } else {
      upper = middle;
    }
  }
  const lowerIndex = clamp(lower - 1, 0, points.length - 2);
  const upperIndex = lowerIndex + 1;
  const start = points[lowerIndex];
  const finish = points[upperIndex];
  const duration = finish[3] - start[3];
  const ratio = duration <= 0
    ? 0
    : clamp((missionTimeSec - start[3]) / duration, 0, 1);
  return {
    position: [
      start[0] + (finish[0] - start[0]) * ratio,
      start[1] + (finish[1] - start[1]) * ratio,
      start[2] + (finish[2] - start[2]) * ratio
    ],
    lowerPointIndex: lowerIndex
  };
}

function headingAt(
  points: readonly TimedMapPoint[],
  pointIndex: number
): number | null {
  const legHeading = (index: number): number | null => {
    const from = points[index];
    const to = points[index + 1];
    if (
      from === undefined ||
      to === undefined ||
      (from[0] === to[0] && from[1] === to[1])
    ) {
      return null;
    }
    const east = to[0] - from[0];
    const north = to[1] - from[1];
    return (Math.atan2(east, north) * 180 / Math.PI + 360) % 360;
  };
  for (let index = pointIndex; index < points.length - 1; index += 1) {
    const heading = legHeading(index);
    if (heading !== null) return heading;
  }
  for (let index = pointIndex - 1; index >= 0; index -= 1) {
    const heading = legHeading(index);
    if (heading !== null) return heading;
  }
  return null;
}

function pathAt(
  paths: readonly DynamicTimedPath[],
  resourceId: string,
  missionTimeSec: number
): DynamicTimedPath | null {
  const resourcePaths = paths
    .filter(path => path.resourceId === resourceId)
    .sort((left, right) => left.startTimeSec - right.startTimeSec);
  const containing = resourcePaths.find(path =>
    path.startTimeSec <= missionTimeSec &&
    missionTimeSec <= path.finishTimeSec
  );
  if (containing !== undefined) return containing;
  const completed = resourcePaths.filter(
    path => path.finishTimeSec < missionTimeSec
  );
  return completed.at(-1) ?? resourcePaths[0] ?? null;
}

function stateOnPath(
  path: DynamicTimedPath,
  missionTimeSec: number
): Pick<DynamicResourceState, "position" | "headingDeg" | "segmentId"> {
  const point = interpolateDynamicPath(path.timedPath, missionTimeSec);
  return {
    position: point?.position ?? null,
    headingDeg: point === null
      ? null
      : headingAt(path.timedPath, point.lowerPointIndex),
    segmentId: path.segmentId
  };
}

function fallbackPosition(
  scene: DynamicScene,
  resourceId: string
): MapPoint | null {
  const resource = scene.resourcesById.get(resourceId);
  if (resource === undefined) return null;
  return localToMapPoint(
    [resource.position.xM, resource.position.yM, resource.position.zM],
    scene.baseline.displayTransform
  );
}

export function selectDynamicResourceStates(
  scene: DynamicScene,
  playback: DynamicPlaybackState
): DynamicResourceState[] {
  const beforeEvent = playback.missionTimeSec < scene.eventTimeSec;
  const published = isPlanPublished(playback);
  const paths = published ? scene.activePaths : scene.baselinePaths;
  const lostResourceId = scene.primaryEvent.eventType === "RESOURCE_LOST"
    ? scene.primaryEvent.affectedObjectId
    : null;

  return scene.view.resources.map(resource => {
    if (
      lostResourceId === resource.resourceId &&
      playback.missionTimeSec >= scene.eventTimeSec
    ) {
      const eventPath = pathAt(
        scene.baselinePaths,
        resource.resourceId,
        scene.eventTimeSec
      );
      const eventState = eventPath === null
        ? null
        : stateOnPath(eventPath, scene.eventTimeSec);
      return {
        resourceId: resource.resourceId,
        operationalState: "LOST",
        position: eventState?.position ?? scene.eventPosition,
        headingDeg: eventState?.headingDeg ?? resource.headingDeg,
        segmentId: eventState?.segmentId ?? null,
        frozen: true
      };
    }

    const path = pathAt(paths, resource.resourceId, playback.missionTimeSec);
    const interpolated = path === null
      ? {
          position: fallbackPosition(scene, resource.resourceId),
          headingDeg: resource.headingDeg,
          segmentId: null
        }
      : stateOnPath(path, playback.missionTimeSec);
    return {
      resourceId: resource.resourceId,
      operationalState: published
        ? resource.operationalState
        : (
            !beforeEvent &&
            scene.primaryEvent.affectedObjectId === resource.resourceId &&
            scene.primaryEvent.eventType === "RESOURCE_LOW_FUEL"
          )
          ? "DEGRADED"
          : path === null ? "AVAILABLE" : "EXECUTING",
      ...interpolated,
      frozen: false
    };
  });
}
