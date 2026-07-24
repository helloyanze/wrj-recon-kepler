import type {
  DisplayTransform,
  LocalPoint,
  MapPoint,
  TimedMapPoint,
  TimedSegment
} from "./caseBundle";
import {localToMapPoint} from "./displayTransform";
import type {MissionPlan} from "./missionPlanSchema";

export type MissionTrajectory = MissionPlan["trajectories"][number];
export type MissionAssignment =
  MissionPlan["assignmentPlan"]["assignments"][number];

type MissionSegment = MissionTrajectory["segments"][number];

export function buildTrajectoryTimeline(
  trajectory: MissionTrajectory,
  assignment: MissionAssignment,
  transform: DisplayTransform
): TimedSegment[] {
  const result: TimedSegment[] = [];
  let segmentStartTimeSec = assignment.plannedLaunchTimeSec;

  for (const segment of trajectory.segments) {
    const timedSegment = withSegmentContext(segment.segmentId, () => {
      validateFinite(segmentStartTimeSec, "start time");
      validateFinite(segment.durationSec, "duration");
      if (segment.durationSec < 0) {
        throw new Error("duration must not be negative");
      }

      const segmentEndTimeSec = segmentStartTimeSec + segment.durationSec;
      validateFinite(segmentEndTimeSec, "end time");
      if (segmentEndTimeSec < segmentStartTimeSec) {
        throw new Error("end time must not precede start time");
      }

      const localPath = buildLocalPath(segment);
      const mapPath = localPath.map(point => localToMapPoint(point, transform));
      const timedPath = buildTimedPath(
        localPath,
        mapPath,
        segmentStartTimeSec,
        segmentEndTimeSec
      );

      return {
        segmentId: segment.segmentId,
        segmentType: segment.segmentType,
        stripId: segment.stripId,
        startTimeSec: segmentStartTimeSec,
        endTimeSec: segmentEndTimeSec,
        heightM: segment.heightM,
        speedMps: segment.speedMps,
        distanceM: segment.distanceM,
        fuelConsumptionKg: segment.fuelConsumptionKg ?? 0,
        localPath,
        mapPath,
        timedPath
      };
    });

    result.push(timedSegment);
    segmentStartTimeSec = timedSegment.endTimeSec;
  }

  return result;
}

export function buildTripPath(
  segments: readonly TimedSegment[]
): TimedMapPoint[] {
  const trip: TimedMapPoint[] = [];

  segments.forEach(segment => {
    segment.timedPath.forEach((point, pointIndex) => {
      const previous = trip.at(-1);
      if (
        pointIndex === 0 &&
        previous !== undefined &&
        timedPointsEqual(previous, point)
      ) {
        return;
      }
      trip.push([point[0], point[1], point[2], point[3]]);
    });
  });

  return trip;
}

function buildLocalPath(segment: MissionSegment): LocalPoint[] {
  const coordinates = segment.geometry.coordinates;
  if (coordinates.length === 0) {
    throw new Error("geometry must contain at least one vertex");
  }

  coordinates.forEach((coordinate, index) => {
    validateFinite(coordinate[0], `geometry vertex ${index} X`);
    validateFinite(coordinate[1], `geometry vertex ${index} Y`);
  });
  validateFinite(segment.startPoint.zM, "start altitude");
  validateFinite(segment.endPoint.zM, "end altitude");

  if (coordinates.length === 1) {
    const [xM, yM] = coordinates[0];
    const start: LocalPoint = [xM, yM, segment.startPoint.zM];
    if (segment.durationSec === 0) {
      return [start];
    }
    return [start, [xM, yM, segment.endPoint.zM]];
  }

  const cumulativeHorizontalDistances = cumulativeDistances(
    coordinates,
    (from, to) => Math.hypot(to[0] - from[0], to[1] - from[1]),
    "horizontal distance"
  );
  const totalHorizontalDistance = cumulativeHorizontalDistances.at(-1) ?? 0;
  const finalIndex = coordinates.length - 1;
  const altitudeDifference = segment.endPoint.zM - segment.startPoint.zM;

  return coordinates.map(([xM, yM], index) => {
    let zM: number;
    if (index === 0) {
      zM = segment.startPoint.zM;
    } else if (index === finalIndex) {
      zM = segment.endPoint.zM;
    } else {
      const ratio =
        totalHorizontalDistance === 0
          ? index / finalIndex
          : cumulativeHorizontalDistances[index] / totalHorizontalDistance;
      zM = segment.startPoint.zM + altitudeDifference * ratio;
    }
    validateFinite(zM, `derived local path altitude at vertex ${index}`);
    return [xM, yM, zM];
  });
}

function buildTimedPath(
  localPath: readonly LocalPoint[],
  mapPath: readonly MapPoint[],
  startTimeSec: number,
  endTimeSec: number
): TimedMapPoint[] {
  if (localPath.length === 1) {
    const [longitude, latitude, altitudeM] = mapPath[0];
    return [[longitude, latitude, altitudeM, startTimeSec]];
  }

  const cumulative3dDistances = cumulativeDistances(
    localPath,
    (from, to) =>
      Math.hypot(
        to[0] - from[0],
        to[1] - from[1],
        to[2] - from[2]
      ),
    "3D distance"
  );
  const total3dDistance = cumulative3dDistances.at(-1) ?? 0;
  const finalIndex = localPath.length - 1;
  const durationSec = endTimeSec - startTimeSec;
  let previousTimeSec = startTimeSec;

  return mapPath.map(([longitude, latitude, altitudeM], index) => {
    let missionTimeSec: number;
    if (index === 0) {
      missionTimeSec = startTimeSec;
    } else if (index === finalIndex) {
      missionTimeSec = endTimeSec;
    } else {
      const ratio =
        total3dDistance === 0
          ? index / finalIndex
          : cumulative3dDistances[index] / total3dDistance;
      missionTimeSec = startTimeSec + durationSec * ratio;
    }

    validateFinite(missionTimeSec, `derived time at vertex ${index}`);
    if (missionTimeSec < previousTimeSec) {
      throw new Error(`derived time at vertex ${index} is decreasing`);
    }
    previousTimeSec = missionTimeSec;
    return [longitude, latitude, altitudeM, missionTimeSec];
  });
}

function cumulativeDistances<T>(
  points: readonly T[],
  distanceBetween: (from: T, to: T) => number,
  label: string
): number[] {
  const cumulative = [0];

  for (let index = 1; index < points.length; index += 1) {
    const legDistance = distanceBetween(points[index - 1], points[index]);
    validateFinite(legDistance, `derived ${label} at leg ${index - 1}`);
    if (legDistance < 0) {
      throw new Error(`derived ${label} at leg ${index - 1} is negative`);
    }

    const accumulatedDistance = cumulative[index - 1] + legDistance;
    validateFinite(
      accumulatedDistance,
      `accumulated ${label} at vertex ${index}`
    );
    if (accumulatedDistance < cumulative[index - 1]) {
      throw new Error(`accumulated ${label} at vertex ${index} is decreasing`);
    }
    cumulative.push(accumulatedDistance);
  }

  return cumulative;
}

function timedPointsEqual(
  left: TimedMapPoint,
  right: TimedMapPoint
): boolean {
  return (
    left[0] === right[0] &&
    left[1] === right[1] &&
    left[2] === right[2] &&
    left[3] === right[3]
  );
}

function validateFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite`);
  }
}

function withSegmentContext<T>(
  segmentId: string,
  operation: () => T
): T {
  try {
    return operation();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Segment ${segmentId}: ${message}`, {cause: error});
  }
}
