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
    stripIds: z.array(nonEmptyString),
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
    stripIds: z.array(nonEmptyString),
    totalDistanceM: nonNegativeFiniteNumber,
    totalDurationSec: nonNegativeFiniteNumber,
    totalFuelKg: nonNegativeFiniteNumber,
    segments: z.array(timedSegmentSchema),
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
    assignments: z.array(assignmentSchema),
    sorties: z.array(sortieSchema),
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
    ),
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
  .strict();
