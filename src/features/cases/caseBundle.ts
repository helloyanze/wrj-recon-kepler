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
