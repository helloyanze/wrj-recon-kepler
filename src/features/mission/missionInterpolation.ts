import type {
  LocalPoint,
  NormalizedSortie,
  SegmentType,
  TimedSegment
} from "../cases/caseBundle";

export type SortieStatus = "waiting" | "flying" | "landed" | "completed";

export interface LiveSortieState {
  assignmentId: string;
  uavId: string;
  batchIndex: number;
  status: SortieStatus;
  position: readonly [number, number, number] | null;
  localPosition: LocalPoint | null;
  headingDeg: number | null;
  segmentType: SegmentType | null;
  stripId: string | null;
  altitudeM: number;
  speedMps: number;
}

const LANDED_DURATION_SEC = 3;

interface PathInterpolation {
  position: readonly [number, number, number];
  localPosition: LocalPoint | null;
  lowerPointIndex: number;
}

interface HorizontalLeg {
  from: LocalPoint;
  to: LocalPoint;
}

export function selectSortieStates(
  sorties: readonly NormalizedSortie[],
  missionTimeSec: number
): LiveSortieState[] {
  if (!Number.isFinite(missionTimeSec)) {
    throw new RangeError("missionTimeSec must be finite");
  }

  return sorties.map(sortie => selectSortieState(sortie, missionTimeSec));
}

function selectSortieState(
  sortie: NormalizedSortie,
  missionTimeSec: number
): LiveSortieState {
  const firstSegment = sortie.segments[0];
  const lastSegment = sortie.segments.at(-1);
  const startTimeSec =
    firstSegment?.startTimeSec ?? sortie.plannedLaunchTimeSec;
  const endTimeSec =
    lastSegment?.endTimeSec ??
    sortie.plannedLaunchTimeSec + sortie.totalDurationSec;

  if (missionTimeSec < startTimeSec) {
    return inactiveState(sortie, "waiting");
  }

  if (missionTimeSec >= endTimeSec) {
    if (missionTimeSec < endTimeSec + LANDED_DURATION_SEC) {
      return landedState(sortie, lastSegment);
    }
    return inactiveState(sortie, "completed");
  }

  const segmentIndex = findSegmentIndex(sortie.segments, missionTimeSec);
  if (segmentIndex < 0) {
    return telemetryUnavailableState(sortie);
  }

  const segment = sortie.segments[segmentIndex];
  const interpolation = interpolateSegment(segment, missionTimeSec);
  if (interpolation === null) {
    return telemetryUnavailableState(sortie, segment);
  }

  return {
    assignmentId: sortie.assignmentId,
    uavId: sortie.uavId,
    batchIndex: sortie.batchIndex,
    status: "flying",
    position: interpolation.position,
    localPosition: interpolation.localPosition,
    headingDeg: findHeading(
      sortie.segments,
      segmentIndex,
      interpolation.lowerPointIndex
    ),
    segmentType: segment.segmentType,
    stripId: segment.stripId,
    altitudeM: interpolation.position[2],
    speedMps: segment.speedMps
  };
}

function inactiveState(
  sortie: NormalizedSortie,
  status: "waiting" | "completed"
): LiveSortieState {
  return {
    assignmentId: sortie.assignmentId,
    uavId: sortie.uavId,
    batchIndex: sortie.batchIndex,
    status,
    position: null,
    localPosition: null,
    headingDeg: null,
    segmentType: null,
    stripId: null,
    altitudeM: 0,
    speedMps: 0
  };
}

function telemetryUnavailableState(
  sortie: NormalizedSortie,
  segment?: TimedSegment
): LiveSortieState {
  return {
    assignmentId: sortie.assignmentId,
    uavId: sortie.uavId,
    batchIndex: sortie.batchIndex,
    status: "flying",
    position: null,
    localPosition: null,
    headingDeg: null,
    segmentType: segment?.segmentType ?? null,
    stripId: segment?.stripId ?? null,
    altitudeM: 0,
    speedMps: segment?.speedMps ?? 0
  };
}

function landedState(
  sortie: NormalizedSortie,
  lastSegment: TimedSegment | undefined
): LiveSortieState {
  const lastTimedPoint = lastSegment?.timedPath.at(-1);
  const lastLocalPoint = lastSegment?.localPath.at(-1);
  const position = lastTimedPoint === undefined
    ? null
    : [lastTimedPoint[0], lastTimedPoint[1], lastTimedPoint[2]] as const;

  return {
    assignmentId: sortie.assignmentId,
    uavId: sortie.uavId,
    batchIndex: sortie.batchIndex,
    status: "landed",
    position,
    localPosition: lastLocalPoint === undefined
      ? null
      : [lastLocalPoint[0], lastLocalPoint[1], lastLocalPoint[2]],
    headingDeg: findLastHeading(sortie.segments),
    segmentType: lastSegment?.segmentType ?? null,
    stripId: lastSegment?.stripId ?? null,
    altitudeM: position?.[2] ?? 0,
    speedMps: 0
  };
}

function findSegmentIndex(
  segments: readonly TimedSegment[],
  missionTimeSec: number
): number {
  if (segments.length === 0) return -1;

  let lower = 0;
  let upper = segments.length;
  while (lower < upper) {
    const middle = lower + Math.floor((upper - lower) / 2);
    if (segments[middle].startTimeSec <= missionTimeSec) {
      lower = middle + 1;
    } else {
      upper = middle;
    }
  }

  const index = lower - 1;
  if (
    index < 0 ||
    missionTimeSec < segments[index].startTimeSec ||
    missionTimeSec >= segments[index].endTimeSec
  ) {
    return -1;
  }
  return index;
}

function interpolateSegment(
  segment: TimedSegment,
  missionTimeSec: number
): PathInterpolation | null {
  const points = segment.timedPath;
  if (points.length === 0) return null;
  if (points.length === 1) {
    const point = points[0];
    return {
      position: [point[0], point[1], point[2]],
      localPosition: copyLocalPoint(segment.localPath[0]),
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

  const lowerPointIndex = Math.max(0, Math.min(points.length - 2, lower - 1));
  const upperPointIndex = lowerPointIndex + 1;
  const start = points[lowerPointIndex];
  const end = points[upperPointIndex];
  const durationSec = end[3] - start[3];
  const ratio = durationSec <= 0
    ? 0
    : clamp((missionTimeSec - start[3]) / durationSec, 0, 1);

  const localStart = segment.localPath[lowerPointIndex];
  const localEnd = segment.localPath[upperPointIndex];

  return {
    position: [
      interpolate(start[0], end[0], ratio),
      interpolate(start[1], end[1], ratio),
      interpolate(start[2], end[2], ratio)
    ],
    localPosition:
      localStart === undefined || localEnd === undefined
        ? null
        : [
            interpolate(localStart[0], localEnd[0], ratio),
            interpolate(localStart[1], localEnd[1], ratio),
            interpolate(localStart[2], localEnd[2], ratio)
          ],
    lowerPointIndex
  };
}

function findHeading(
  segments: readonly TimedSegment[],
  segmentIndex: number,
  pointIndex: number
): number | null {
  const current = horizontalLeg(
    segments[segmentIndex],
    pointIndex
  );
  if (current !== null) return headingFor(current);

  for (let index = pointIndex - 1; index >= 0; index -= 1) {
    const leg = horizontalLeg(segments[segmentIndex], index);
    if (leg !== null) return headingFor(leg);
  }
  for (let index = segmentIndex - 1; index >= 0; index -= 1) {
    const leg = lastHorizontalLeg(segments[index]);
    if (leg !== null) return headingFor(leg);
  }

  const currentSegment = segments[segmentIndex];
  for (
    let index = pointIndex + 1;
    index < currentSegment.localPath.length - 1;
    index += 1
  ) {
    const leg = horizontalLeg(currentSegment, index);
    if (leg !== null) return headingFor(leg);
  }
  for (let index = segmentIndex + 1; index < segments.length; index += 1) {
    const leg = firstHorizontalLeg(segments[index]);
    if (leg !== null) return headingFor(leg);
  }

  return null;
}

function findLastHeading(
  segments: readonly TimedSegment[]
): number | null {
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const leg = lastHorizontalLeg(segments[index]);
    if (leg !== null) return headingFor(leg);
  }
  return null;
}

function firstHorizontalLeg(segment: TimedSegment): HorizontalLeg | null {
  for (let index = 0; index < segment.localPath.length - 1; index += 1) {
    const leg = horizontalLeg(segment, index);
    if (leg !== null) return leg;
  }
  return null;
}

function lastHorizontalLeg(segment: TimedSegment): HorizontalLeg | null {
  for (
    let index = segment.localPath.length - 2;
    index >= 0;
    index -= 1
  ) {
    const leg = horizontalLeg(segment, index);
    if (leg !== null) return leg;
  }
  return null;
}

function horizontalLeg(
  segment: TimedSegment,
  pointIndex: number
): HorizontalLeg | null {
  const from = segment.localPath[pointIndex];
  const to = segment.localPath[pointIndex + 1];
  if (
    from === undefined ||
    to === undefined ||
    (from[0] === to[0] && from[1] === to[1])
  ) {
    return null;
  }
  return {from, to};
}

function headingFor({from, to}: HorizontalLeg): number {
  const eastDelta = to[0] - from[0];
  const northDelta = to[1] - from[1];
  return (Math.atan2(eastDelta, northDelta) * 180 / Math.PI + 360) % 360;
}

function copyLocalPoint(point: LocalPoint | undefined): LocalPoint | null {
  return point === undefined ? null : [point[0], point[1], point[2]];
}

function interpolate(start: number, end: number, ratio: number): number {
  return start + (end - start) * ratio;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
