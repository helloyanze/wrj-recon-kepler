import type {
  CaseBundleV2,
  LocalPoint,
  MapPoint,
  TimedMapPoint
} from "../cases/caseBundle";
import {
  localToMapPoint,
  mapToLocalPoint
} from "../cases/displayTransform";

export interface ScannedCoverageDatum {
  assignmentId: string;
  stripId: string;
  uavId: string;
  polygon: MapPoint[];
}

const GEOMETRY_EPSILON = 1e-9;

export function selectScannedCoverage(
  bundle: CaseBundleV2,
  missionTimeSec: number
): ScannedCoverageDatum[] {
  if (!Number.isFinite(missionTimeSec)) {
    throw new Error("missionTimeSec must be finite");
  }

  const stripsById = new Map(
    bundle.strips.map(strip => [strip.stripId, strip])
  );
  const coverageByKey = new Map<string, ScannedCoverageDatum>();
  const completedKeys = new Set<string>();

  for (const sortie of bundle.sorties) {
    for (const segment of sortie.segments) {
      if (
        segment.segmentType !== "COVERAGE_LINE"
        || segment.stripId === null
        || missionTimeSec < segment.startTimeSec
      ) {
        continue;
      }

      const strip = stripsById.get(segment.stripId);
      if (strip === undefined || strip.polygon.length < 4) continue;

      const datum = {
        assignmentId: sortie.assignmentId,
        stripId: strip.stripId,
        uavId: sortie.uavId
      };
      const start = segment.localPath[0];
      const end = segment.localPath.at(-1);
      if (start === undefined || end === undefined) continue;
      const directionX = end[0] - start[0];
      const directionY = end[1] - start[1];
      const directionLengthSquared =
        directionX * directionX + directionY * directionY;
      if (directionLengthSquared <= GEOMETRY_EPSILON) continue;

      const coverageKey = `${sortie.assignmentId}\u0000${strip.stripId}`;
      if (
        segment.endTimeSec <= segment.startTimeSec
        || missionTimeSec >= segment.endTimeSec
      ) {
        coverageByKey.set(coverageKey, {...datum, polygon: strip.polygon});
        completedKeys.add(coverageKey);
        continue;
      }
      if (completedKeys.has(coverageKey)) continue;

      const current = interpolateLocalPosition(
        segment.localPath,
        segment.timedPath,
        missionTimeSec,
        segment.startTimeSec,
        segment.endTimeSec
      );
      const threshold = Math.max(0, Math.min(
        directionLengthSquared,
        (current[0] - start[0]) * directionX
          + (current[1] - start[1]) * directionY
      ));
      const localPolygon = openPolygon(strip.polygon).map(point =>
        mapToLocalPoint(point, bundle.displayTransform)
      );
      const clipped = clipByProgressPlane(
        localPolygon,
        start,
        directionX,
        directionY,
        threshold
      );
      if (clipped.length < 3) continue;

      const polygon = clipped.map(([xM, yM]) =>
        localToMapPoint([xM, yM, 0], bundle.displayTransform)
      );
      polygon.push(polygon[0]);
      coverageByKey.set(coverageKey, {...datum, polygon});
    }
  }

  return [...coverageByKey.values()];
}

function interpolateLocalPosition(
  localPath: readonly LocalPoint[],
  timedPath: readonly TimedMapPoint[],
  missionTimeSec: number,
  startTimeSec: number,
  endTimeSec: number
): LocalPoint {
  if (localPath.length === timedPath.length && localPath.length >= 2) {
    if (missionTimeSec <= timedPath[0][3]) return localPath[0];
    for (let index = 1; index < timedPath.length; index += 1) {
      const previousTime = timedPath[index - 1][3];
      const currentTime = timedPath[index][3];
      if (missionTimeSec > currentTime) continue;
      if (currentTime <= previousTime) return localPath[index];
      return interpolateLocalPoints(
        localPath[index - 1],
        localPath[index],
        (missionTimeSec - previousTime) / (currentTime - previousTime)
      );
    }
    return localPath.at(-1) as LocalPoint;
  }

  const progress = endTimeSec <= startTimeSec
    ? 1
    : (missionTimeSec - startTimeSec) / (endTimeSec - startTimeSec);
  return interpolateLocalPoints(
    localPath[0],
    localPath.at(-1) as LocalPoint,
    progress
  );
}

function interpolateLocalPoints(
  start: LocalPoint,
  end: LocalPoint,
  progress: number
): LocalPoint {
  const clampedProgress = Math.max(0, Math.min(1, progress));
  return [
    start[0] + (end[0] - start[0]) * clampedProgress,
    start[1] + (end[1] - start[1]) * clampedProgress,
    start[2] + (end[2] - start[2]) * clampedProgress
  ];
}

function openPolygon(polygon: readonly MapPoint[]): readonly MapPoint[] {
  if (polygon.length < 2) return polygon;
  const first = polygon[0];
  const last = polygon.at(-1);
  return last !== undefined && sameHorizontalPoint(first, last)
    ? polygon.slice(0, -1)
    : polygon;
}

function sameHorizontalPoint(left: MapPoint, right: MapPoint): boolean {
  return Math.abs(left[0] - right[0]) <= GEOMETRY_EPSILON
    && Math.abs(left[1] - right[1]) <= GEOMETRY_EPSILON;
}

function clipByProgressPlane(
  polygon: readonly LocalPoint[],
  start: LocalPoint,
  directionX: number,
  directionY: number,
  threshold: number
): LocalPoint[] {
  const result: LocalPoint[] = [];
  if (polygon.length === 0) return result;

  let previous = polygon.at(-1) as LocalPoint;
  let previousDistance = planeDistance(
    previous,
    start,
    directionX,
    directionY,
    threshold
  );

  for (const current of polygon) {
    const currentDistance = planeDistance(
      current,
      start,
      directionX,
      directionY,
      threshold
    );
    const previousInside = previousDistance <= GEOMETRY_EPSILON;
    const currentInside = currentDistance <= GEOMETRY_EPSILON;

    if (previousInside !== currentInside) {
      const ratio = previousDistance / (previousDistance - currentDistance);
      result.push([
        previous[0] + (current[0] - previous[0]) * ratio,
        previous[1] + (current[1] - previous[1]) * ratio,
        0
      ]);
    }
    if (currentInside) {
      result.push([current[0], current[1], 0]);
    }

    previous = current;
    previousDistance = currentDistance;
  }

  return result;
}

function planeDistance(
  point: LocalPoint,
  start: LocalPoint,
  directionX: number,
  directionY: number,
  threshold: number
): number {
  return (point[0] - start[0]) * directionX
    + (point[1] - start[1]) * directionY
    - threshold;
}
