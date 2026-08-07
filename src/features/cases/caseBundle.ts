import {z} from "zod";

export const CASE_BUNDLE_VERSION = 2 as const;

export type LocalPoint = readonly [xM: number, yM: number, zM: number];
export type MapPoint = readonly [longitude: number, latitude: number, altitudeM: number];
export type TimedMapPoint = readonly [
  longitude: number,
  latitude: number,
  altitudeM: number,
  missionTimeSec: number
];

export type SegmentType =
  | "TAKEOFF"
  | "CLIMB"
  | "ENTRY"
  | "TRANSITION"
  | "COVERAGE_LINE"
  | "TURN"
  | "RETURN"
  | "DESCENT"
  | "LANDING";

export interface NormalizedAssignment {
  assignmentId: string;
  uavId: string;
  baseId: string;
  flightCandidateId: string;
  stripIds: string[];
  stripStartIndex: number;
  stripEndIndex: number;
  batchIndex: number;
  plannedLaunchTimeSec: number;
}

export interface TimedSegment {
  segmentId: string;
  segmentType: SegmentType;
  stripId: string | null;
  startTimeSec: number;
  endTimeSec: number;
  heightM: number;
  speedMps: number;
  distanceM: number;
  fuelConsumptionKg: number;
  localPath: LocalPoint[];
  mapPath: MapPoint[];
  timedPath: TimedMapPoint[];
}

export interface NormalizedSortie {
  trajectoryId: string;
  assignmentId: string;
  uavId: string;
  batchIndex: number;
  plannedLaunchTimeSec: number;
  stripIds: string[];
  totalDistanceM: number;
  totalDurationSec: number;
  totalFuelKg: number;
  segments: TimedSegment[];
  trip: TimedMapPoint[];
}

export interface DisplayTransform {
  anchorLongitude: number;
  anchorLatitude: number;
  sourceCenterXM: number;
  sourceCenterYM: number;
  xAxis: "EAST";
  yAxis: "NORTH";
}

export interface CaseBundleV2 {
  version: typeof CASE_BUNDLE_VERSION;
  case: {
    caseId: string;
    planId: string;
    displayName: string;
  };
  assignments: NormalizedAssignment[];
  sorties: NormalizedSortie[];
  strips: Array<{
    stripId: string;
    index: number;
    uavId: string;
    assignmentId: string;
    line: MapPoint[];
    polygon: MapPoint[];
  }>;
  region: {
    source: "REGION_PROFILE" | "DERIVED_FROM_STRIPS";
    polygon: MapPoint[];
  };
  metrics: {
    uavCount: number;
    sortieCount: number;
    batchCount: number;
    stripCount: number;
    coverageRatio: number;
    missionMakespanSec: number;
    totalDistanceM: number;
    totalFuelKg: number;
  };
  validation: {
    valid: boolean;
    warnings: string[];
    failureCodes: string[];
  };
  displayTransform: DisplayTransform;
  provenance: {
    sourceName: string;
    sourceRun: string;
    importedAt: string;
    sha256: string;
  };
}

const finiteNumber = z.number().finite();
const nonNegativeFiniteNumber = finiteNumber.nonnegative();
const nonNegativeInteger = z.number().int().nonnegative();
const nonEmptyString = z.string().min(1);

const localPointSchema = z.tuple([
  finiteNumber,
  finiteNumber,
  finiteNumber
]);

const mapPointSchema = z.tuple([
  finiteNumber.min(-180).max(180),
  finiteNumber.min(-90).max(90),
  finiteNumber
]);

const timedMapPointSchema = z.tuple([
  finiteNumber.min(-180).max(180),
  finiteNumber.min(-90).max(90),
  finiteNumber,
  nonNegativeFiniteNumber
]);

const segmentTypeSchema = z.enum([
  "TAKEOFF",
  "CLIMB",
  "ENTRY",
  "TRANSITION",
  "COVERAGE_LINE",
  "TURN",
  "RETURN",
  "DESCENT",
  "LANDING"
]);

const assignmentSchema = z
  .object({
    assignmentId: nonEmptyString,
    uavId: nonEmptyString,
    baseId: nonEmptyString,
    flightCandidateId: nonEmptyString,
    stripIds: z.array(nonEmptyString).min(1),
    stripStartIndex: nonNegativeInteger,
    stripEndIndex: nonNegativeInteger,
    batchIndex: nonNegativeInteger,
    plannedLaunchTimeSec: nonNegativeFiniteNumber
  })
  .strict();

const timedSegmentSchema = z
  .object({
    segmentId: nonEmptyString,
    segmentType: segmentTypeSchema,
    stripId: nonEmptyString.nullable(),
    startTimeSec: nonNegativeFiniteNumber,
    endTimeSec: nonNegativeFiniteNumber,
    heightM: nonNegativeFiniteNumber,
    speedMps: nonNegativeFiniteNumber,
    distanceM: nonNegativeFiniteNumber,
    fuelConsumptionKg: nonNegativeFiniteNumber,
    localPath: z.array(localPointSchema).min(1),
    mapPath: z.array(mapPointSchema).min(1),
    timedPath: z.array(timedMapPointSchema).min(1)
  })
  .strict();

const sortieSchema = z
  .object({
    trajectoryId: nonEmptyString,
    assignmentId: nonEmptyString,
    uavId: nonEmptyString,
    batchIndex: nonNegativeInteger,
    plannedLaunchTimeSec: nonNegativeFiniteNumber,
    stripIds: z.array(nonEmptyString).min(1),
    totalDistanceM: nonNegativeFiniteNumber,
    totalDurationSec: nonNegativeFiniteNumber,
    totalFuelKg: nonNegativeFiniteNumber,
    segments: z.array(timedSegmentSchema).min(1),
    trip: z.array(timedMapPointSchema).min(1)
  })
  .strict();

export const caseBundleSchema: z.ZodType<CaseBundleV2> = z
  .object({
    version: z.literal(CASE_BUNDLE_VERSION),
    case: z
      .object({
        caseId: nonEmptyString,
        planId: nonEmptyString,
        displayName: nonEmptyString
      })
      .strict(),
    assignments: z.array(assignmentSchema).min(1),
    sorties: z.array(sortieSchema).min(1),
    strips: z.array(
      z
        .object({
          stripId: nonEmptyString,
          index: nonNegativeInteger,
          uavId: nonEmptyString,
          assignmentId: nonEmptyString,
          line: z.array(mapPointSchema).min(2),
          polygon: z.array(mapPointSchema).min(4)
        })
        .strict()
    ).min(1),
    region: z
      .object({
        source: z.enum(["REGION_PROFILE", "DERIVED_FROM_STRIPS"]),
        polygon: z.array(mapPointSchema).min(4)
      })
      .strict(),
    metrics: z
      .object({
        uavCount: nonNegativeInteger,
        sortieCount: nonNegativeInteger,
        batchCount: nonNegativeInteger,
        stripCount: nonNegativeInteger,
        coverageRatio: nonNegativeFiniteNumber,
        missionMakespanSec: nonNegativeFiniteNumber,
        totalDistanceM: nonNegativeFiniteNumber,
        totalFuelKg: nonNegativeFiniteNumber
      })
      .strict(),
    validation: z
      .object({
        valid: z.boolean(),
        warnings: z.array(z.string()),
        failureCodes: z.array(z.string())
      })
      .strict(),
    displayTransform: z
      .object({
        anchorLongitude: finiteNumber.min(-180).max(180),
        anchorLatitude: finiteNumber.min(-90).max(90),
        sourceCenterXM: finiteNumber,
        sourceCenterYM: finiteNumber,
        xAxis: z.literal("EAST"),
        yAxis: z.literal("NORTH")
      })
      .strict(),
    provenance: z
      .object({
        sourceName: nonEmptyString,
        sourceRun: nonEmptyString,
        importedAt: z.string().datetime({offset: true}),
        sha256: z.string().regex(/^[a-f0-9]{64}$/i)
      })
      .strict()
  })
  .strict()
  .superRefine((bundle, context) => {
    const addIssue = (
      path: Array<string | number>,
      message: string
    ): void => {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path,
        message
      });
    };
    const sameIdSet = (
      left: readonly string[],
      right: readonly string[]
    ): boolean => {
      if (left.length !== right.length) return false;
      const leftIds = new Set(left);
      const rightIds = new Set(right);
      return leftIds.size === left.length &&
        rightIds.size === right.length &&
        left.every(id => rightIds.has(id));
    };

    const assignmentsById = new Map<
      string,
      CaseBundleV2["assignments"][number]
    >();
    bundle.assignments.forEach((assignment, index) => {
      if (assignmentsById.has(assignment.assignmentId)) {
        addIssue(
          ["assignments", index, "assignmentId"],
          `duplicate assignmentId ${assignment.assignmentId}`
        );
      } else {
        assignmentsById.set(assignment.assignmentId, assignment);
      }
      if (new Set(assignment.stripIds).size !== assignment.stripIds.length) {
        addIssue(
          ["assignments", index, "stripIds"],
          `assignment ${assignment.assignmentId} has duplicate stripIds`
        );
      }
    });

    const stripsById = new Map<
      string,
      CaseBundleV2["strips"][number]
    >();
    bundle.strips.forEach((strip, index) => {
      if (stripsById.has(strip.stripId)) {
        addIssue(
          ["strips", index, "stripId"],
          `duplicate stripId ${strip.stripId}`
        );
      } else {
        stripsById.set(strip.stripId, strip);
      }

      const assignment = assignmentsById.get(strip.assignmentId);
      if (assignment === undefined) {
        addIssue(
          ["strips", index, "assignmentId"],
          `strip ${strip.stripId} references unknown assignment ${strip.assignmentId}`
        );
        return;
      }
      if (strip.uavId !== assignment.uavId) {
        addIssue(
          ["strips", index, "uavId"],
          `strip ${strip.stripId} UAV ${strip.uavId} does not match assignment UAV ${assignment.uavId}`
        );
      }
      if (!assignment.stripIds.includes(strip.stripId)) {
        addIssue(
          ["strips", index, "stripId"],
          `strip ${strip.stripId} is not owned by assignment ${assignment.assignmentId}`
        );
      }
    });

    bundle.assignments.forEach((assignment, assignmentIndex) => {
      assignment.stripIds.forEach((stripId, stripIndex) => {
        const strip = stripsById.get(stripId);
        if (strip === undefined) {
          addIssue(
            ["assignments", assignmentIndex, "stripIds", stripIndex],
            `assignment ${assignment.assignmentId} references unknown strip ${stripId}`
          );
        } else if (
          strip.assignmentId !== assignment.assignmentId ||
          strip.uavId !== assignment.uavId
        ) {
          addIssue(
            ["assignments", assignmentIndex, "stripIds", stripIndex],
            `strip ${stripId} ownership does not match assignment ${assignment.assignmentId}`
          );
        }
      });
    });

    const trajectoryIds = new Set<string>();
    const sortieAssignmentIds = new Set<string>();
    bundle.sorties.forEach((sortie, sortieIndex) => {
      if (trajectoryIds.has(sortie.trajectoryId)) {
        addIssue(
          ["sorties", sortieIndex, "trajectoryId"],
          `duplicate trajectoryId ${sortie.trajectoryId}`
        );
      }
      trajectoryIds.add(sortie.trajectoryId);

      if (sortieAssignmentIds.has(sortie.assignmentId)) {
        addIssue(
          ["sorties", sortieIndex, "assignmentId"],
          `assignment ${sortie.assignmentId} has more than one sortie`
        );
      }
      sortieAssignmentIds.add(sortie.assignmentId);

      const assignment = assignmentsById.get(sortie.assignmentId);
      if (assignment === undefined) {
        addIssue(
          ["sorties", sortieIndex, "assignmentId"],
          `sortie ${sortie.trajectoryId} references unknown assignment ${sortie.assignmentId}`
        );
        return;
      }
      if (sortie.uavId !== assignment.uavId) {
        addIssue(
          ["sorties", sortieIndex, "uavId"],
          `sortie ${sortie.trajectoryId} UAV ${sortie.uavId} does not match assignment UAV ${assignment.uavId}`
        );
      }
      if (!sameIdSet(sortie.stripIds, assignment.stripIds)) {
        addIssue(
          ["sorties", sortieIndex, "stripIds"],
          `sortie ${sortie.trajectoryId} stripIds do not match assignment ${assignment.assignmentId}`
        );
      }
      sortie.segments.forEach((segment, segmentIndex) => {
        if (
          segment.stripId !== null &&
          !assignment.stripIds.includes(segment.stripId)
        ) {
          addIssue(
            ["sorties", sortieIndex, "segments", segmentIndex, "stripId"],
            `segment ${segment.segmentId} references strip ${segment.stripId} outside assignment ${assignment.assignmentId}`
          );
        }
      });
    });

    bundle.assignments.forEach((assignment, index) => {
      if (!sortieAssignmentIds.has(assignment.assignmentId)) {
        addIssue(
          ["assignments", index, "assignmentId"],
          `assignment ${assignment.assignmentId} has no sortie`
        );
      }
    });

    const expectedMetrics = {
      uavCount: new Set(
        bundle.assignments.map(assignment => assignment.uavId)
      ).size,
      sortieCount: bundle.sorties.length,
      batchCount: new Set(
        bundle.assignments.map(assignment => assignment.batchIndex)
      ).size,
      stripCount: bundle.strips.length
    };
    (
      Object.entries(expectedMetrics) as Array<
        [keyof typeof expectedMetrics, number]
      >
    ).forEach(([metric, expected]) => {
      if (bundle.metrics[metric] !== expected) {
        addIssue(
          ["metrics", metric],
          `${metric} must equal ${expected}, received ${bundle.metrics[metric]}`
        );
      }
    });
  });
