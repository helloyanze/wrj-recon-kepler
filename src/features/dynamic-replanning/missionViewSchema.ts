import {z} from "zod";

const finiteNumber = z.number().finite();
const nonNegative = finiteNumber.nonnegative();
const nonNegativeInteger = z.number().int().nonnegative();
const positiveInteger = z.number().int().positive();
const nonEmptyString = z.string().min(1);

export const planStatusSchema = z.enum([
  "COMPLETE",
  "PARTIAL_SAFE_FALLBACK",
  "FAILED"
]);

export const changeTypeSchema = z.enum([
  "baseline_locked",
  "baseline_reused",
  "dynamic_modified",
  "dynamic_new",
  "dynamic_cancelled"
]);

export const segmentTypeSchema = z.enum([
  "TAKEOFF",
  "CLIMB",
  "ENTRY",
  "COVERAGE_LINE",
  "TURN",
  "RETURN",
  "DESCENT",
  "LANDING",
  "HOLD"
]);

export const localPointSchema = z.tuple([
  finiteNumber,
  finiteNumber,
  finiteNumber
]);

const polygonCoordinateSchema = z.union([
  z.tuple([finiteNumber, finiteNumber]),
  localPointSchema
]);

const polygonGeometrySchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(
    z.array(polygonCoordinateSchema).min(4)
      .refine(
        (ring) => JSON.stringify(ring[0]) === JSON.stringify(ring.at(-1)),
        "polygon exterior ring must be closed"
      )
  ).min(1)
}).strict();

const missionSummarySchema = z.object({
  missionId: nonEmptyString,
  caseId: nonEmptyString,
  sourcePlanId: nonEmptyString,
  sourcePlanVersion: positiveInteger,
  snapshotId: nonEmptyString,
  snapshotKind: z.enum(["SIMULATED", "RUNTIME"]),
  snapshotTimeSec: nonNegative
}).strict();

const activePlanSummarySchema = z.object({
  planId: nonEmptyString,
  planVersion: positiveInteger,
  parentPlanVersion: positiveInteger,
  planStatus: planStatusSchema,
  committedAtMissionTimeSec: nonNegative
}).strict();

const coordinateReferenceSchema = z.object({
  localFrame: z.literal("TASK1_PLANAR_METERS"),
  mapCrs: nonEmptyString.nullable(),
  horizontalUnit: z.literal("m"),
  verticalUnit: z.literal("m"),
  xAxis: z.literal("EAST"),
  yAxis: z.literal("NORTH")
}).strict();

const missionViewTaskSchema = z.object({
  taskId: nonEmptyString,
  taskType: nonEmptyString,
  geometry: polygonGeometrySchema,
  minimumCoverageRatio: finiteNumber.min(0).max(1),
  executionState: z.enum([
    "PLANNED",
    "EXECUTING",
    "COMPLETE",
    "UNRESOLVED"
  ]),
  assignedResourceIds: z.array(nonEmptyString),
  changeType: changeTypeSchema
}).strict();

const missionViewResourceSchema = z.object({
  resourceId: nonEmptyString,
  model: nonEmptyString,
  baseId: nonEmptyString,
  operationalState: z.enum([
    "READY",
    "ACTIVE",
    "LOW_FUEL",
    "LOST",
    "RETURNING",
    "RETURNED"
  ]),
  position: localPointSchema,
  initialFuelKg: nonNegative,
  remainingFuelKg: nonNegative,
  currentTaskId: nonEmptyString.nullable(),
  currentTrajectoryId: nonEmptyString.nullable(),
  transferable: z.boolean(),
  returnedToBase: z.boolean()
}).strict();

const missionViewWorkUnitSchema = z.object({
  workUnitId: nonEmptyString,
  taskId: nonEmptyString,
  localPath: z.array(localPointSchema).min(2),
  assignedResourceId: nonEmptyString.nullable(),
  executionState: z.enum([
    "COMPLETE",
    "LOCKED",
    "PLANNED",
    "UNRESOLVED",
    "CANCELLED"
  ]),
  changeType: changeTypeSchema
}).strict();

const missionViewAssignmentSchema = z.object({
  assignmentId: nonEmptyString,
  taskId: nonEmptyString,
  resourceId: nonEmptyString,
  workUnitIds: z.array(nonEmptyString),
  startTimeSec: nonNegative,
  finishTimeSec: nonNegative,
  changeType: changeTypeSchema
}).strict().refine(
  (assignment) => assignment.finishTimeSec >= assignment.startTimeSec,
  {
    path: ["finishTimeSec"],
    message: "assignment finish time must not precede start time"
  }
);

const missionViewSegmentSchema = z.object({
  segmentId: nonEmptyString,
  taskId: nonEmptyString.nullable(),
  workUnitId: nonEmptyString.nullable(),
  segmentType: segmentTypeSchema,
  startTimeSec: nonNegative,
  finishTimeSec: nonNegative,
  localPath: z.array(localPointSchema).min(1),
  mapPath: z.array(localPointSchema).min(1).nullable(),
  distanceM: nonNegative,
  fuelKg: nonNegative,
  changeType: changeTypeSchema
}).strict().refine(
  (segment) => segment.finishTimeSec >= segment.startTimeSec,
  {
    path: ["finishTimeSec"],
    message: "segment finish time must not precede start time"
  }
);

const missionViewTrajectorySchema = z.object({
  trajectoryId: nonEmptyString,
  resourceId: nonEmptyString,
  assignmentId: nonEmptyString.nullable(),
  segments: z.array(missionViewSegmentSchema).min(1),
  changeType: changeTypeSchema
}).strict();

const missionViewEventSchema = z.object({
  eventId: nonEmptyString,
  eventType: nonEmptyString,
  eventTimeSec: nonNegative,
  affectedObjectKind: z.enum(["RESOURCE", "TASK"]),
  affectedObjectId: nonEmptyString,
  payload: z.record(z.unknown())
}).strict();

const planDiffEntrySchema = z.object({
  objectKind: z.enum(["TASK", "ASSIGNMENT", "SEGMENT", "RESOURCE"]),
  objectId: nonEmptyString,
  changeType: changeTypeSchema,
  reason: nonEmptyString
}).strict();

const planDiffSchema = z.object({
  sourcePlanVersion: positiveInteger,
  targetPlanVersion: positiveInteger,
  entries: z.array(planDiffEntrySchema)
}).strict();

const rankingMetricsSchema = z.object({
  totalFinishTimeSec: nonNegative,
  totalFuelKg: nonNegative,
  totalCompletionRatio: finiteNumber.min(0).max(1),
  retainedWorkRatio: finiteNumber.min(0).max(1),
  newResourceCount: nonNegativeInteger,
  unresolvedWorkUnitCount: nonNegativeInteger
}).strict();

const planValidationReportSchema = z.object({
  valid: z.boolean(),
  safe: z.boolean(),
  warnings: z.array(z.string()),
  failureCodes: z.array(nonEmptyString)
}).strict();

const alternativeSummarySchema = z.object({
  candidateId: nonEmptyString,
  totalCompletionRatio: finiteNumber.min(0).max(1),
  totalFinishTimeSec: nonNegative,
  riskFlags: z.array(nonEmptyString),
  rejectionReason: nonEmptyString.nullable()
}).strict();

const timeChainNodeSchema = z.object({
  nodeId: nonEmptyString,
  nodeType: z.enum(["EVENT", "SNAPSHOT", "REPLAN", "COMMIT"]),
  missionTimeSec: nonNegative,
  wallOffsetMs: nonNegativeInteger,
  label: nonEmptyString
}).strict();

const viewProvenanceSchema = z.object({
  baselineCaseId: nonEmptyString,
  baselinePlanId: nonEmptyString,
  baselinePlanVersion: positiveInteger,
  eventBatchId: nonEmptyString,
  runtimeStateSource: z.enum(["SIMULATED", "RUNTIME"]),
  algorithm: nonEmptyString
}).strict();

export const missionViewV1Schema = z.object({
  schemaVersion: z.literal("mission_view.v1"),
  mission: missionSummarySchema,
  activePlan: activePlanSummarySchema,
  coordinateReference: coordinateReferenceSchema,
  tasks: z.array(missionViewTaskSchema),
  resources: z.array(missionViewResourceSchema),
  workUnits: z.array(missionViewWorkUnitSchema),
  assignments: z.array(missionViewAssignmentSchema),
  trajectories: z.array(missionViewTrajectorySchema),
  eventTimeline: z.array(missionViewEventSchema),
  planDiff: planDiffSchema,
  metrics: rankingMetricsSchema,
  validation: planValidationReportSchema,
  alternativeSummaries: z.array(alternativeSummarySchema),
  timeChains: z.array(timeChainNodeSchema),
  provenance: viewProvenanceSchema
}).strict();

export const failureReportSchema = z.object({
  schemaVersion: z.literal("task2-failure-report.v1"),
  missionId: nonEmptyString,
  eventBatchId: nonEmptyString,
  planStatus: z.enum(["PARTIAL_SAFE_FALLBACK", "FAILED"]),
  failureCodes: z.array(nonEmptyString).min(1),
  unresolvedTaskIds: z.array(nonEmptyString),
  unresolvedWorkUnitIds: z.array(nonEmptyString),
  safeActions: z.array(z.enum([
    "HOLD_CURRENT_PLAN",
    "RETURN_TO_BASE"
  ])),
  message: nonEmptyString
}).strict();

export type MissionViewV1 = z.infer<typeof missionViewV1Schema>;
export type FailureReport = z.infer<typeof failureReportSchema>;
export type ChangeType = z.infer<typeof changeTypeSchema>;
export type LocalPoint = z.infer<typeof localPointSchema>;
