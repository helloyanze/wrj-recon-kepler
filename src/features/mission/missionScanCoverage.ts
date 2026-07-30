import type {
  CaseBundleV2,
  LocalPoint,
  MapPoint
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
  const result: ScannedCoverageDatum[] = [];

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
      if (
        segment.endTimeSec <= segment.startTimeSec
        || missionTimeSec >= segment.endTimeSec
      ) {
        result.push({...datum, polygon: strip.polygon});
        continue;
      }

      const start = segment.localPath[0];
      const end = segment.localPath.at(-1);
      if (start === undefined || end === undefined) continue;
      const directionX = end[0] - start[0];
      const directionY = end[1] - start[1];
      const directionLengthSquared =
        directionX * directionX + directionY * directionY;
      if (directionLengthSquared <= GEOMETRY_EPSILON) continue;

      const progress = Math.max(
        0,
        Math.min(
          1,
          (missionTimeSec - segment.startTimeSec)
            / (segment.endTimeSec - segment.startTimeSec)
        )
      );
      const currentX = start[0] + directionX * progress;
      const currentY = start[1] + directionY * progress;
      const threshold =
        (currentX - start[0]) * directionX
        + (currentY - start[1]) * directionY;
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
      result.push({...datum, polygon});
    }
  }

  return result;
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
