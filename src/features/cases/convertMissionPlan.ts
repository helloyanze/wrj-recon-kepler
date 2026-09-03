import {
  CASE_BUNDLE_VERSION,
  type CaseBundleV2,
  type LocalPoint,
  type NormalizedAssignment,
  type NormalizedSortie
} from "./caseBundle";
import {
  createDisplayTransform,
  localToMapPoint
} from "./displayTransform";
import {
  parseMissionPlan,
  type MissionPlan
} from "./missionPlanSchema";
import {
  buildTrajectoryTimeline,
  buildTripPath
} from "./trajectoryTimeline";

export interface ConvertMissionPlanInput {
  missionPlan: unknown;
  regionProfile?: unknown | null;
  sourceName: string;
  sourceRun: string;
  importedAt: string;
  sha256: string;
  uavScheduleOverlapPolicy?: UavScheduleOverlapPolicy;
}

export interface UavScheduleOverlapPolicy {
  mode: "WARN_WITHIN_TOLERANCE";
  maxOverlapSec: number;
}

export const ALGORITHM_IMPORT_UAV_SCHEDULE_OVERLAP_POLICY = {
  mode: "WARN_WITHIN_TOLERANCE",
  // Task 1's authoritative feasible plans may retain substantial overlap when
  // a UAV is reused across batches; preserve the source timing and surface it
  // as a warning instead of dropping the whole case during import.
  maxOverlapSec: 60
} as const satisfies UavScheduleOverlapPolicy;

export const ZIP_IMPORT_UAV_SCHEDULE_OVERLAP_POLICY = {
  mode: "WARN_WITHIN_TOLERANCE",
  maxOverlapSec: 1
} as const satisfies UavScheduleOverlapPolicy;

type MissionAssignment =
  MissionPlan["assignmentPlan"]["assignments"][number];
type MissionStrip =
  MissionPlan["assignmentPlan"]["stripPlanSnapshot"]["strips"][number];
type MissionTrajectory = MissionPlan["trajectories"][number];
type PlanarPoint = readonly [xM: number, yM: number];

interface RegionGeometry {
  source: CaseBundleV2["region"]["source"];
  localPolygon: LocalPoint[];
}

const MAKESPAN_TOLERANCE_SEC = 1e-3;
const OVERLAP_TOLERANCE_SEC = 1e-6;
const MAX_REGION_WKT_CHARACTERS = 100_000;
const MAX_REGION_WKT_VERTICES = 2_000;
const MAX_STRIP_COVERAGE_VERTICES = 2_000;

export function convertMissionPlan(
  input: ConvertMissionPlanInput
): CaseBundleV2 {
  const plan = parseMissionPlan(
    input.missionPlan,
    `${input.sourceName}/mission_plan.json`
  );
  const assignmentsById = indexAssignments(plan.assignmentPlan.assignments);
  const trajectoriesByAssignmentId = indexTrajectories(
    plan.trajectories,
    assignmentsById
  );
  requireOneTrajectoryPerAssignment(
    plan.assignmentPlan.assignments,
    trajectoriesByAssignmentId
  );

  const snapshot = plan.assignmentPlan.stripPlanSnapshot;
  validateAssignmentFlightCandidates(
    plan.assignmentPlan.assignments,
    snapshot.flightCandidateId,
    snapshot.compatibleFlightCandidates
  );
  const stripsById = indexStrips(snapshot.strips);
  if (snapshot.stripCount !== snapshot.strips.length) {
    throw new Error(
      `assignmentPlan.stripPlanSnapshot.stripCount ${snapshot.stripCount} does not match ` +
      `the normalized strip count ${snapshot.strips.length}`
    );
  }
  validateStripCoveragePolygons(snapshot.strips);
  const ownersByStripId = validateStripOwnership(
    plan.assignmentPlan.assignments,
    snapshot.strips,
    stripsById
  );
  validateTrajectoryStripReferences(plan.trajectories, assignmentsById, stripsById);

  const sortedAssignments = [...plan.assignmentPlan.assignments].sort(
    compareAssignments
  );
  const normalizedAssignments = sortedAssignments.map(normalizeAssignment);
  const regionGeometry = chooseRegionGeometry(input.regionProfile, snapshot.strips);
  const displayTransform = createDisplayTransform(
    collectDisplayPoints(plan, regionGeometry)
  );

  const fuelWarnings: string[] = [];
  const sorties = buildSorties(
    sortedAssignments,
    trajectoriesByAssignmentId,
    displayTransform,
    plan.missionMakespanSec,
    fuelWarnings
  );
  const scheduleWarnings: string[] = [];
  validatePhysicalUavSchedule(
    sorties,
    input.uavScheduleOverlapPolicy,
    scheduleWarnings
  );

  const sortedStrips = [...snapshot.strips].sort(compareStrips);
  const strips = sortedStrips.map(strip => {
    const owner = ownersByStripId.get(strip.stripId);
    if (owner === undefined) {
      throw new Error(`Strip ${strip.stripId} has no assignment owner`);
    }
    return {
      stripId: strip.stripId,
      index: strip.index,
      uavId: owner.uavId,
      assignmentId: owner.assignmentId,
      line: [
        localToMapPoint([strip.start.xM, strip.start.yM, 0], displayTransform),
        localToMapPoint([strip.end.xM, strip.end.yM, 0], displayTransform)
      ],
      polygon: strip.coveragePolygon.map(point =>
        localToMapPoint([point.xM, point.yM, 0], displayTransform)
      )
    };
  });

  const uavCount = new Set(
    normalizedAssignments.map(assignment => assignment.uavId)
  ).size;
  const stripCount = strips.length;
  const distinctBatchCount = new Set(
    normalizedAssignments.map(assignment => assignment.batchIndex)
  ).size;
  validateOptionalCount(
    plan.assignmentPlan.usedUavCount,
    "assignmentPlan.usedUavCount",
    uavCount,
    "normalized UAV count"
  );
  validateOptionalCount(
    plan.assignmentPlan.stripCount,
    "assignmentPlan.stripCount",
    stripCount,
    "normalized strip count"
  );
  const authoritativeBatchCount = validateOptionalCount(
    plan.assignmentPlan.batchCount,
    "assignmentPlan.batchCount",
    distinctBatchCount,
    "distinct normalized batch count"
  );

  const totalFuelKg =
    plan.totalFuelKg ??
    sorties.reduce((sum, sortie) => sum + sortie.totalFuelKg, 0);
  if (plan.totalFuelKg === null) {
    fuelWarnings.push(
      "FUEL_DERIVED_PLAN: totalFuelKg derived from normalized sortie fuel"
    );
  }

  return {
    version: CASE_BUNDLE_VERSION,
    case: {
      caseId: plan.caseId,
      planId: plan.planId,
      displayName: plan.caseId
    },
    assignments: normalizedAssignments,
    sorties,
    strips,
    region: {
      source: regionGeometry.source,
      polygon: regionGeometry.localPolygon.map(point =>
        localToMapPoint(point, displayTransform)
      )
    },
    metrics: {
      uavCount,
      sortieCount: sorties.length,
      batchCount: authoritativeBatchCount ?? distinctBatchCount,
      stripCount,
      coverageRatio: plan.coverageRatio,
      missionMakespanSec: plan.missionMakespanSec,
      totalDistanceM: plan.totalDistanceM,
      totalFuelKg
    },
    validation: {
      valid: plan.validationReport.valid ?? true,
      warnings: [
        ...stringValues(plan.validationReport.warnings),
        ...stringValues(snapshot.generationWarnings),
        ...scheduleWarnings,
        ...fuelWarnings
      ],
      failureCodes: uniqueStrings([
        ...stringValues(plan.failureCodes),
        ...stringValues(plan.validationReport.failureCodes)
      ])
    },
    displayTransform,
    provenance: {
      sourceName: input.sourceName,
      sourceRun: input.sourceRun,
      importedAt: input.importedAt,
      sha256: input.sha256
    }
  };
}

function indexAssignments(
  assignments: readonly MissionAssignment[]
): Map<string, MissionAssignment> {
  const result = new Map<string, MissionAssignment>();
  for (const assignment of assignments) {
    if (result.has(assignment.assignmentId)) {
      throw new Error(
        `Assignment ${assignment.assignmentId} has a duplicate assignmentId`
      );
    }
    result.set(assignment.assignmentId, assignment);
  }
  return result;
}

function indexTrajectories(
  trajectories: readonly MissionTrajectory[],
  assignmentsById: ReadonlyMap<string, MissionAssignment>
): Map<string, MissionTrajectory[]> {
  const result = new Map<string, MissionTrajectory[]>();
  const trajectoryIds = new Set<string>();

  for (const trajectory of trajectories) {
    if (trajectoryIds.has(trajectory.trajectoryId)) {
      throw new Error(
        `Trajectory ${trajectory.trajectoryId} has a duplicate trajectoryId`
      );
    }
    trajectoryIds.add(trajectory.trajectoryId);

    const assignment = assignmentsById.get(trajectory.assignmentId);
    if (assignment === undefined) {
      throw new Error(
        `Trajectory ${trajectory.trajectoryId} references assignment ` +
        `${trajectory.assignmentId}, but that assignment does not exist`
      );
    }
    if (trajectory.uavId !== assignment.uavId) {
      throw new Error(
        `Trajectory ${trajectory.trajectoryId} uses UAV ${trajectory.uavId}, but ` +
        `assignment ${assignment.assignmentId} uses UAV ${assignment.uavId}`
      );
    }
    if (trajectory.valid !== true) {
      throw new Error(
        `Trajectory ${trajectory.trajectoryId} valid must be true; received ` +
        describeValue(trajectory.valid)
      );
    }
    for (const segment of trajectory.segments) {
      if (segment.valid !== true) {
        throw new Error(
          `Trajectory ${trajectory.trajectoryId} segment ${segment.segmentId} ` +
          `valid must be true; received ${describeValue(segment.valid)}`
        );
      }
    }

    const matches = result.get(trajectory.assignmentId) ?? [];
    matches.push(trajectory);
    result.set(trajectory.assignmentId, matches);
  }
  return result;
}

function requireOneTrajectoryPerAssignment(
  assignments: readonly MissionAssignment[],
  trajectoriesByAssignmentId: ReadonlyMap<string, readonly MissionTrajectory[]>
): void {
  for (const assignment of assignments) {
    const trajectories =
      trajectoriesByAssignmentId.get(assignment.assignmentId) ?? [];
    if (trajectories.length === 0) {
      throw new Error(
        `Assignment ${assignment.assignmentId} is missing its trajectory`
      );
    }
    if (trajectories.length > 1) {
      throw new Error(
        `Assignment ${assignment.assignmentId} has more than one trajectory: ` +
        trajectories.map(trajectory => trajectory.trajectoryId).join(", ")
      );
    }
  }
}

function indexStrips(
  strips: readonly MissionStrip[]
): Map<string, MissionStrip> {
  const result = new Map<string, MissionStrip>();
  const indexes = new Map<number, string>();
  for (const strip of strips) {
    if (result.has(strip.stripId)) {
      throw new Error(`Strip ${strip.stripId} has a duplicate stripId`);
    }
    const existingId = indexes.get(strip.index);
    if (existingId !== undefined) {
      throw new Error(
        `Strip ${strip.stripId} duplicates index ${strip.index} already used by ` +
        `strip ${existingId}`
      );
    }
    result.set(strip.stripId, strip);
    indexes.set(strip.index, strip.stripId);
  }
  return result;
}

function validateAssignmentFlightCandidates(
  assignments: readonly MissionAssignment[],
  selectedFlightCandidateId: string,
  compatibleFlightCandidates: readonly string[]
): void {
  const allowedFlightCandidateIds = new Set([
    selectedFlightCandidateId,
    ...compatibleFlightCandidates
  ]);
  for (const assignment of assignments) {
    if (!allowedFlightCandidateIds.has(assignment.flightCandidateId)) {
      throw new Error(
        `Assignment ${assignment.assignmentId} flight candidate ` +
        `${assignment.flightCandidateId} is neither the selected snapshot ` +
        `candidate ${selectedFlightCandidateId} nor a compatible flight candidate`
      );
    }
  }
}

function validateStripCoveragePolygons(
  strips: readonly MissionStrip[]
): void {
  for (const strip of strips) {
    if (
      strip.coveragePolygon.length >
      MAX_STRIP_COVERAGE_VERTICES
    ) {
      throw new Error(
        `Strip ${strip.stripId} coveragePolygon ${MAX_STRIP_COVERAGE_VERTICES}-` +
        `vertex limit exceeded by ${strip.coveragePolygon.length} vertices`
      );
    }
    const polygon = removeClosingPoint(
      strip.coveragePolygon.map(
        point => [point.xM, point.yM] as PlanarPoint
      )
    );
    if (uniquePlanarPoints(polygon).length < 3) {
      throw new Error(
        `Strip ${strip.stripId} coveragePolygon must contain at least 3 ` +
        "unique vertices"
      );
    }
    const area = signedArea(polygon);
    if (!Number.isFinite(area) || area === 0) {
      throw new Error(
        `Strip ${strip.stripId} coveragePolygon must have finite non-zero ` +
        "area; its vertices are collinear or unusable"
      );
    }
    if (!isSimpleRing(polygon)) {
      throw new Error(
        `Strip ${strip.stripId} coveragePolygon must be a simple ring ` +
        "without self-intersections or overlaps"
      );
    }
  }
}

function validateStripOwnership(
  assignments: readonly MissionAssignment[],
  strips: readonly MissionStrip[],
  stripsById: ReadonlyMap<string, MissionStrip>
): Map<string, MissionAssignment> {
  const owners = new Map<string, MissionAssignment>();

  for (const assignment of assignments) {
    if (
      !Number.isInteger(assignment.stripStartIndex) ||
      !Number.isInteger(assignment.stripEndIndex)
    ) {
      throw new Error(
        `Assignment ${assignment.assignmentId} strip index range ` +
        `[${assignment.stripStartIndex}, ${assignment.stripEndIndex}] must use integers`
      );
    }
    if (assignment.stripIds.length === 0) {
      throw new Error(
        `Assignment ${assignment.assignmentId} has no stripIds for range ` +
        `[${assignment.stripStartIndex}, ${assignment.stripEndIndex}]`
      );
    }

    const visitedIndices: number[] = [];
    assignment.stripIds.forEach(stripId => {
      const strip = stripsById.get(stripId);
      if (strip === undefined) {
        throw new Error(
          `Assignment ${assignment.assignmentId} references unknown strip ${stripId}`
        );
      }
      visitedIndices.push(strip.index);

      const existingOwner = owners.get(stripId);
      if (existingOwner !== undefined) {
        throw new Error(
          `Strip ${stripId} has duplicate owners ${existingOwner.assignmentId} ` +
          `and ${assignment.assignmentId}`
        );
      }
      owners.set(stripId, assignment);
    });

    const minVisitedIndex = Math.min(...visitedIndices);
    const maxVisitedIndex = Math.max(...visitedIndices);
    if (assignment.stripStartIndex !== minVisitedIndex) {
      throw new Error(
        `Assignment ${assignment.assignmentId} strip range ` +
        `[${assignment.stripStartIndex}, ${assignment.stripEndIndex}] does not ` +
        `match its visited strips [${minVisitedIndex}, ${maxVisitedIndex}]`
      );
    }
    if (assignment.stripEndIndex !== maxVisitedIndex) {
      throw new Error(
        `Assignment ${assignment.assignmentId} strip range ` +
        `[${assignment.stripStartIndex}, ${assignment.stripEndIndex}] does not ` +
        `match its visited strips [${minVisitedIndex}, ${maxVisitedIndex}]`
      );
    }
    for (const visitedIndex of visitedIndices) {
      if (
        visitedIndex < assignment.stripStartIndex ||
        visitedIndex > assignment.stripEndIndex
      ) {
        throw new Error(
          `Assignment ${assignment.assignmentId} strip index ${visitedIndex} ` +
          `falls outside declared range ` +
          `[${assignment.stripStartIndex}, ${assignment.stripEndIndex}]`
        );
      }
    }
  }

  for (const strip of strips) {
    if (!owners.has(strip.stripId)) {
      throw new Error(`Strip ${strip.stripId} has no assignment owner`);
    }
  }
  return owners;
}

function validateTrajectoryStripReferences(
  trajectories: readonly MissionTrajectory[],
  assignmentsById: ReadonlyMap<string, MissionAssignment>,
  stripsById: ReadonlyMap<string, MissionStrip>
): void {
  for (const trajectory of trajectories) {
    const assignment = assignmentsById.get(trajectory.assignmentId);
    if (assignment === undefined) {
      continue;
    }
    const assignedStripIds = new Set(assignment.stripIds);
    for (const segment of trajectory.segments) {
      if (segment.stripId === null) {
        continue;
      }
      if (!stripsById.has(segment.stripId)) {
        throw new Error(
          `Trajectory ${trajectory.trajectoryId} segment ${segment.segmentId} ` +
          `references unknown strip ${segment.stripId}`
        );
      }
      if (!assignedStripIds.has(segment.stripId)) {
        throw new Error(
          `Trajectory ${trajectory.trajectoryId} segment ${segment.segmentId} ` +
          `references strip ${segment.stripId}, which is not owned by assignment ` +
          `${assignment.assignmentId}`
        );
      }
    }
  }
}

function compareAssignments(
  left: MissionAssignment,
  right: MissionAssignment
): number {
  return (
    left.plannedLaunchTimeSec - right.plannedLaunchTimeSec ||
    left.batchIndex - right.batchIndex ||
    compareStrings(left.assignmentId, right.assignmentId)
  );
}

function compareStrips(left: MissionStrip, right: MissionStrip): number {
  return left.index - right.index || compareStrings(left.stripId, right.stripId);
}

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function normalizeAssignment(
  assignment: MissionAssignment
): NormalizedAssignment {
  return {
    assignmentId: assignment.assignmentId,
    uavId: assignment.uavId,
    baseId: assignment.baseId,
    flightCandidateId: assignment.flightCandidateId,
    stripIds: [...assignment.stripIds],
    stripStartIndex: assignment.stripStartIndex,
    stripEndIndex: assignment.stripEndIndex,
    batchIndex: assignment.batchIndex,
    plannedLaunchTimeSec: assignment.plannedLaunchTimeSec
  };
}

function chooseRegionGeometry(
  regionProfile: unknown | null | undefined,
  strips: readonly MissionStrip[]
): RegionGeometry {
  const profilePolygon = parseRegionProfilePolygon(regionProfile);
  if (profilePolygon !== null) {
    return {
      source: "REGION_PROFILE",
      localPolygon: closePolygon(profilePolygon)
    };
  }

  const coveragePoints: PlanarPoint[] = strips.flatMap(strip =>
    strip.coveragePolygon.map(
      point => [point.xM, point.yM] as PlanarPoint
    )
  );
  const hull = convexHull(coveragePoints);
  if (hull.length < 3) {
    const stripIds = strips.map(strip => strip.stripId).join(", ");
    throw new Error(
      `Region fallback from strip coverage (${stripIds}) has fewer than 3 ` +
      "unique non-collinear points, so a convex hull cannot be built"
    );
  }
  return {
    source: "DERIVED_FROM_STRIPS",
    localPolygon: closePolygon(hull)
  };
}

function parseRegionProfilePolygon(
  regionProfile: unknown | null | undefined
): PlanarPoint[] | null {
  if (
    typeof regionProfile !== "object" ||
    regionProfile === null ||
    !("geometryWkt" in regionProfile) ||
    typeof regionProfile.geometryWkt !== "string"
  ) {
    return null;
  }
  if (regionProfile.geometryWkt.length > MAX_REGION_WKT_CHARACTERS) {
    return null;
  }

  const trimmedWkt = regionProfile.geometryWkt.trim();
  const prefixMatch = /^polygon\s*\(\(/i.exec(trimmedWkt);
  if (prefixMatch === null || !trimmedWkt.endsWith("))")) {
    return null;
  }

  const body = trimmedWkt.slice(prefixMatch[0].length, -2);
  if (body.includes("(") || body.includes(")")) {
    return null;
  }
  const tokens = body.split(",");
  if (tokens.length > MAX_REGION_WKT_VERTICES) {
    return null;
  }
  const points: PlanarPoint[] = [];
  for (const token of tokens) {
    const coordinates = token.trim().split(/\s+/);
    if (coordinates.length !== 2) {
      return null;
    }
    const xM = Number(coordinates[0]);
    const yM = Number(coordinates[1]);
    if (!Number.isFinite(xM) || !Number.isFinite(yM)) {
      return null;
    }
    points.push([xM, yM]);
  }

  const openPoints = removeClosingPoint(points);
  const uniquePoints = uniquePlanarPoints(openPoints);
  const area = signedArea(openPoints);
  if (
    uniquePoints.length < 3 ||
    !Number.isFinite(area) ||
    area === 0 ||
    !isSimpleRing(openPoints)
  ) {
    return null;
  }
  return openPoints.map(([xM, yM]) => [xM, yM]);
}

function removeClosingPoint(points: readonly PlanarPoint[]): PlanarPoint[] {
  const result = points.map(([xM, yM]) => [xM, yM] as PlanarPoint);
  if (
    result.length > 1 &&
    pointsEqual(result[0], result[result.length - 1])
  ) {
    result.pop();
  }
  return result;
}

function signedArea(points: readonly PlanarPoint[]): number {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    twiceArea += current[0] * next[1] - next[0] * current[1];
  }
  return twiceArea / 2;
}

function isSimpleRing(points: readonly PlanarPoint[]): boolean {
  for (let index = 0; index < points.length; index += 1) {
    if (pointsEqual(points[index], points[(index + 1) % points.length])) {
      return false;
    }
  }

  for (let leftIndex = 0; leftIndex < points.length; leftIndex += 1) {
    const leftStart = points[leftIndex];
    const leftEnd = points[(leftIndex + 1) % points.length];
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < points.length;
      rightIndex += 1
    ) {
      const adjacent =
        rightIndex === leftIndex + 1 ||
        (leftIndex === 0 && rightIndex === points.length - 1);
      if (adjacent) {
        continue;
      }
      const rightStart = points[rightIndex];
      const rightEnd = points[(rightIndex + 1) % points.length];
      if (segmentsIntersect(leftStart, leftEnd, rightStart, rightEnd)) {
        return false;
      }
    }
  }
  return true;
}

function segmentsIntersect(
  leftStart: PlanarPoint,
  leftEnd: PlanarPoint,
  rightStart: PlanarPoint,
  rightEnd: PlanarPoint
): boolean {
  const leftStartSide = orientation(leftStart, leftEnd, rightStart);
  const leftEndSide = orientation(leftStart, leftEnd, rightEnd);
  const rightStartSide = orientation(rightStart, rightEnd, leftStart);
  const rightEndSide = orientation(rightStart, rightEnd, leftEnd);
  if (
    leftStartSide === null ||
    leftEndSide === null ||
    rightStartSide === null ||
    rightEndSide === null
  ) {
    return true;
  }

  if (
    leftStartSide !== leftEndSide &&
    rightStartSide !== rightEndSide &&
    leftStartSide !== 0 &&
    leftEndSide !== 0 &&
    rightStartSide !== 0 &&
    rightEndSide !== 0
  ) {
    return true;
  }
  return (
    (leftStartSide === 0 && onSegment(leftStart, rightStart, leftEnd)) ||
    (leftEndSide === 0 && onSegment(leftStart, rightEnd, leftEnd)) ||
    (rightStartSide === 0 && onSegment(rightStart, leftStart, rightEnd)) ||
    (rightEndSide === 0 && onSegment(rightStart, leftEnd, rightEnd))
  );
}

function orientation(
  start: PlanarPoint,
  end: PlanarPoint,
  point: PlanarPoint
): -1 | 0 | 1 | null {
  const segmentDeltaX = end[0] - start[0];
  const segmentDeltaY = end[1] - start[1];
  const pointDeltaX = point[0] - start[0];
  const pointDeltaY = point[1] - start[1];
  const coordinateScale = Math.max(
    1,
    Math.abs(segmentDeltaX),
    Math.abs(segmentDeltaY),
    Math.abs(pointDeltaX),
    Math.abs(pointDeltaY)
  );
  const firstProduct = segmentDeltaX * pointDeltaY;
  const secondProduct = segmentDeltaY * pointDeltaX;
  const determinant = firstProduct - secondProduct;
  const tolerance =
    Number.EPSILON * 16 * coordinateScale * coordinateScale;
  if (!Number.isFinite(determinant) || !Number.isFinite(tolerance)) {
    return null;
  }
  if (Math.abs(determinant) <= tolerance) {
    return 0;
  }
  return determinant < 0 ? -1 : 1;
}

function onSegment(
  start: PlanarPoint,
  point: PlanarPoint,
  end: PlanarPoint
): boolean {
  const scale = Math.max(
    1,
    Math.abs(end[0] - start[0]),
    Math.abs(end[1] - start[1]),
    Math.abs(point[0] - start[0]),
    Math.abs(point[1] - start[1]),
    Math.abs(point[0] - end[0]),
    Math.abs(point[1] - end[1])
  );
  const tolerance = Number.EPSILON * 16 * scale;
  return (
    point[0] >= Math.min(start[0], end[0]) - tolerance &&
    point[0] <= Math.max(start[0], end[0]) + tolerance &&
    point[1] >= Math.min(start[1], end[1]) - tolerance &&
    point[1] <= Math.max(start[1], end[1]) + tolerance
  );
}

function convexHull(points: readonly PlanarPoint[]): PlanarPoint[] {
  const unique = uniquePlanarPoints(points).sort((left, right) =>
    left[0] - right[0] || left[1] - right[1]
  );
  if (unique.length < 3) {
    return unique;
  }

  const lower: PlanarPoint[] = [];
  for (const point of unique) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0
    ) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper: PlanarPoint[] = [];
  for (let index = unique.length - 1; index >= 0; index -= 1) {
    const point = unique[index];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0
    ) {
      upper.pop();
    }
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  return [...lower, ...upper].map(([xM, yM]) => [xM, yM]);
}

function uniquePlanarPoints(
  points: readonly PlanarPoint[]
): PlanarPoint[] {
  const seen = new Set<string>();
  const result: PlanarPoint[] = [];
  for (const [xM, yM] of points) {
    const key = `${xM}\u0000${yM}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push([xM, yM]);
    }
  }
  return result;
}

function cross(
  origin: PlanarPoint,
  left: PlanarPoint,
  right: PlanarPoint
): number {
  return (
    (left[0] - origin[0]) * (right[1] - origin[1]) -
    (left[1] - origin[1]) * (right[0] - origin[0])
  );
}

function pointsEqual(left: PlanarPoint, right: PlanarPoint): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

function closePolygon(points: readonly PlanarPoint[]): LocalPoint[] {
  const result: LocalPoint[] = points.map(([xM, yM]) => [xM, yM, 0]);
  if (
    result.length > 0 &&
    (result.length === 1 ||
      result[0][0] !== result[result.length - 1][0] ||
      result[0][1] !== result[result.length - 1][1])
  ) {
    result.push([result[0][0], result[0][1], 0]);
  }
  return result;
}

function collectDisplayPoints(
  plan: MissionPlan,
  regionGeometry: RegionGeometry
): LocalPoint[] {
  const points: LocalPoint[] = [];
  for (const trajectory of plan.trajectories) {
    for (const segment of trajectory.segments) {
      points.push([
        segment.startPoint.xM,
        segment.startPoint.yM,
        segment.startPoint.zM
      ]);
      points.push([
        segment.endPoint.xM,
        segment.endPoint.yM,
        segment.endPoint.zM
      ]);
      segment.geometry.coordinates.forEach(([xM, yM, zM]) => {
        points.push([xM, yM, zM ?? 0]);
      });
    }
  }
  for (const strip of plan.assignmentPlan.stripPlanSnapshot.strips) {
    points.push([strip.start.xM, strip.start.yM, 0]);
    points.push([strip.end.xM, strip.end.yM, 0]);
    strip.coveragePolygon.forEach(point => {
      points.push([point.xM, point.yM, 0]);
    });
  }
  regionGeometry.localPolygon.forEach(([xM, yM, zM]) => {
    points.push([xM, yM, zM]);
  });
  return points;
}

function buildSorties(
  assignments: readonly MissionAssignment[],
  trajectoriesByAssignmentId: ReadonlyMap<
    string,
    readonly MissionTrajectory[]
  >,
  displayTransform: CaseBundleV2["displayTransform"],
  missionMakespanSec: number,
  fuelWarnings: string[]
): NormalizedSortie[] {
  return assignments.map(assignment => {
    const trajectory =
      trajectoriesByAssignmentId.get(assignment.assignmentId)?.[0];
    if (trajectory === undefined) {
      throw new Error(
        `Assignment ${assignment.assignmentId} is missing its trajectory`
      );
    }
    if (trajectory.segments.length === 0) {
      throw new Error(
        `Trajectory ${trajectory.trajectoryId} for assignment ` +
        `${assignment.assignmentId} has no segments`
      );
    }

    let segments;
    try {
      segments = buildTrajectoryTimeline(
        trajectory,
        assignment,
        displayTransform
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Trajectory ${trajectory.trajectoryId} for assignment ` +
        `${assignment.assignmentId}: ${message}`,
        {cause: error}
      );
    }

    trajectory.segments.forEach(segment => {
      if (segment.fuelConsumptionKg === null) {
        fuelWarnings.push(
          `FUEL_DERIVED_SEGMENT: trajectory ${trajectory.trajectoryId} ` +
          `segment ${segment.segmentId} fuelConsumptionKg normalized from null to 0`
        );
      }
    });
    const totalFuelKg =
      trajectory.totalFuelKg ??
      segments.reduce(
        (sum, segment) => sum + segment.fuelConsumptionKg,
        0
      );
    if (trajectory.totalFuelKg === null) {
      fuelWarnings.push(
        `FUEL_DERIVED_SORTIE: trajectory ${trajectory.trajectoryId} ` +
        "totalFuelKg derived from normalized segment fuel"
      );
    }

    const finalEndTimeSec = segments[segments.length - 1].endTimeSec;
    if (
      finalEndTimeSec - missionMakespanSec >
      MAKESPAN_TOLERANCE_SEC
    ) {
      throw new Error(
        `Assignment ${assignment.assignmentId} trajectory ` +
        `${trajectory.trajectoryId} normalized end ${finalEndTimeSec} exceeds ` +
        `missionMakespanSec ${missionMakespanSec} by more than ` +
        `${MAKESPAN_TOLERANCE_SEC}`
      );
    }

    return {
      trajectoryId: trajectory.trajectoryId,
      assignmentId: assignment.assignmentId,
      uavId: assignment.uavId,
      batchIndex: assignment.batchIndex,
      plannedLaunchTimeSec: assignment.plannedLaunchTimeSec,
      stripIds: [...assignment.stripIds],
      totalDistanceM: trajectory.totalDistanceM,
      totalDurationSec: trajectory.totalDurationSec,
      totalFuelKg,
      segments,
      trip: buildTripPath(segments)
    };
  });
}

function validatePhysicalUavSchedule(
  sorties: readonly NormalizedSortie[],
  overlapPolicy: UavScheduleOverlapPolicy | undefined,
  warnings: string[]
): void {
  if (
    overlapPolicy !== undefined &&
    (
      overlapPolicy.mode !== "WARN_WITHIN_TOLERANCE" ||
      !Number.isFinite(overlapPolicy.maxOverlapSec) ||
      overlapPolicy.maxOverlapSec < 0
    )
  ) {
    throw new Error(
      "uavScheduleOverlapPolicy.maxOverlapSec must be a finite " +
      "non-negative number"
    );
  }

  const sortiesByUavId = new Map<string, NormalizedSortie[]>();
  for (const sortie of sorties) {
    const uavSorties = sortiesByUavId.get(sortie.uavId) ?? [];
    uavSorties.push(sortie);
    sortiesByUavId.set(sortie.uavId, uavSorties);
  }

  for (const [uavId, uavSorties] of sortiesByUavId) {
    uavSorties.sort((left, right) =>
      left.plannedLaunchTimeSec - right.plannedLaunchTimeSec ||
      left.batchIndex - right.batchIndex ||
      compareStrings(left.assignmentId, right.assignmentId)
    );
    for (let index = 1; index < uavSorties.length; index += 1) {
      const previous = uavSorties[index - 1];
      const next = uavSorties[index];
      const previousEnd =
        previous.segments.at(-1)?.endTimeSec ??
        previous.plannedLaunchTimeSec;
      const overlapSec = previousEnd - next.plannedLaunchTimeSec;
      if (overlapSec > OVERLAP_TOLERANCE_SEC) {
        if (
          overlapPolicy !== undefined &&
          overlapSec <=
            overlapPolicy.maxOverlapSec + OVERLAP_TOLERANCE_SEC
        ) {
          warnings.push(
            `UAV_SCHEDULE_OVERLAP: UAV ${uavId} assignments ` +
            `${previous.assignmentId} and ${next.assignmentId} overlap by ` +
            `${overlapSec} seconds (${previous.assignmentId} ends at ` +
            `${previousEnd}; ${next.assignmentId} starts at ` +
            `${next.plannedLaunchTimeSec}); original plannedLaunchTimeSec ` +
            "and trajectory timing preserved"
          );
          continue;
        }
        throw new Error(
          `UAV ${uavId} assignments ${previous.assignmentId} and ` +
          `${next.assignmentId} overlap: ${previous.assignmentId} ends at ` +
          `${previousEnd}, but ${next.assignmentId} starts at ` +
          `${next.plannedLaunchTimeSec}`
        );
      }
    }
  }
}

function validateOptionalCount(
  value: unknown,
  path: string,
  expected: number,
  expectedLabel: string
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new Error(`${path} must be a finite non-negative integer`);
  }
  if (value !== expected) {
    throw new Error(
      `${path} ${value} does not match ${expectedLabel} ${expected}`
    );
  }
  return value;
}

function stringValues(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function describeValue(value: unknown): string {
  if (value === undefined) {
    return "missing";
  }
  return JSON.stringify(value);
}
