import {z} from "zod";

import {taskGeometryContextSchema} from "./taskGeometryDiffSchema";
import {taskGeometrySchema} from "./taskGeometrySchema";

const finiteNumber = z.number().finite();
const nonNegative = finiteNumber.nonnegative();
const nonNegativeInteger = z.number().int().nonnegative();
const positiveInteger = z.number().int().positive();
const nonEmptyString = z.string().min(1);
const ratio = finiteNumber.min(0).max(1);

export const planStatusSchema = z.enum([
  "COMPLETE",
  "PARTIAL_SAFE_FALLBACK",
  "FAILED"
]);

export const changeTypeSchema = z.enum([
  "baseline_flown",
  "baseline_locked",
  "baseline_reused",
  "dynamic_modified",
  "dynamic_new",
  "dynamic_cancelled"
]);

export const localPointSchema = z.object({
  xM: finiteNumber,
  yM: finiteNumber,
  zM: finiteNumber
}).strict();

const missionSummarySchema = z.object({
  missionId: nonEmptyString,
  caseId: nonEmptyString
}).strict();

const activePlanSummarySchema = z.object({
  planId: nonEmptyString,
  planStatus: planStatusSchema,
  planVersion: positiveInteger,
  sourcePlanVersion: positiveInteger,
  missionTimeSec: nonNegative
}).strict();

const coordinateReferenceSchema = z.object({
  frame: nonEmptyString,
  horizontalUnit: nonEmptyString,
  verticalUnit: nonEmptyString,
  mapCrs: z.string().nullable()
}).strict();

const missionViewTaskSchema = z.object({
  taskId: nonEmptyString,
  taskType: nonEmptyString,
  status: nonEmptyString,
  priority: nonNegativeInteger,
  geometry: taskGeometrySchema.nullable(),
  geometryContext: taskGeometryContextSchema
    .nullable()
    .optional()
    .transform(value => value ?? null),
  minimumCoverageRatio: ratio
}).strict();

const missionViewResourceSchema = z.object({
  resourceId: nonEmptyString,
  platformClass: z.enum([
    "SMALL_UAV",
    "CARRIER_UAV",
    "RELEASED_PLATFORM",
    "UNKNOWN"
  ]),
  carrierResourceId: nonEmptyString.nullable(),
  capabilities: z.array(nonEmptyString),
  operationalState: nonEmptyString,
  position: localPointSchema,
  headingDeg: finiteNumber.min(0).max(360),
  remainingFuelKg: nonNegative
}).strict();

const missionViewWorkUnitSchema = z.object({
  workUnitId: nonEmptyString,
  taskId: nonEmptyString,
  status: nonEmptyString,
  assignedResourceId: nonEmptyString.nullable(),
  geometry: taskGeometrySchema.nullable()
}).strict();

const missionViewAssignmentSchema = z.object({
  assignmentId: nonEmptyString,
  resourceId: nonEmptyString,
  taskId: nonEmptyString.nullable(),
  workUnitIds: z.array(nonEmptyString),
  plannedLaunchTimeSec: nonNegative,
  plannedFinishTimeSec: nonNegative.nullable()
}).strict().refine(
  assignment => assignment.plannedFinishTimeSec === null ||
    assignment.plannedFinishTimeSec >= assignment.plannedLaunchTimeSec,
  {
    path: ["plannedFinishTimeSec"],
    message: "assignment finish time must not precede launch time"
  }
);

const mapPointSchema = z.tuple([
  finiteNumber,
  finiteNumber,
  finiteNumber.nullable()
]);

const missionViewSegmentSchema = z.object({
  segmentId: nonEmptyString,
  segmentType: nonEmptyString,
  phase: nonEmptyString,
  localPath: z.array(localPointSchema).min(1),
  mapPath: z.array(mapPointSchema),
  startTimeSec: nonNegative,
  finishTimeSec: nonNegative,
  changeType: changeTypeSchema,
  taskId: nonEmptyString.nullable(),
  workUnitId: nonEmptyString.nullable()
}).strict().refine(
  segment => segment.finishTimeSec >= segment.startTimeSec,
  {
    path: ["finishTimeSec"],
    message: "segment finish time must not precede start time"
  }
);

const missionViewTrajectorySchema = z.object({
  trajectoryId: nonEmptyString,
  resourceId: nonEmptyString,
  segments: z.array(missionViewSegmentSchema)
}).strict();

const missionViewEventSchema = z.object({
  eventId: nonEmptyString,
  eventType: nonEmptyString,
  eventTimeSec: nonNegative,
  status: nonEmptyString,
  affectedObjectId: nonEmptyString
}).strict();

const planDiffEntrySchema = z.object({
  elementType: nonEmptyString,
  elementId: nonEmptyString,
  changeType: nonEmptyString,
  beforeHash: z.string().nullable(),
  afterHash: z.string().nullable(),
  triggerEventIds: z.array(nonEmptyString)
}).strict();

const planDiffSchema = z.object({
  sourcePlanVersion: positiveInteger,
  planVersion: positiveInteger,
  entries: z.array(planDiffEntrySchema)
}).strict();

export const rankingMetricsSchema = z.object({
  highPriorityCompletionRatio: ratio,
  totalCompletionRatio: ratio,
  retainedPlanRatio: ratio,
  newActiveResourceCount: nonNegativeInteger,
  totalFinishTimeSec: nonNegative,
  totalFuelKg: nonNegative
}).strict();

const validationCheckSchema = z.object({
  name: nonEmptyString,
  passed: z.boolean(),
  code: z.string().nullable(),
  message: z.string().nullable(),
  affectedObjectIds: z.array(nonEmptyString)
}).strict();

const planValidationReportSchema = z.object({
  passed: z.boolean(),
  checks: z.array(validationCheckSchema),
  failureCodes: z.array(nonEmptyString)
}).strict();

const alternativeSummarySchema = z.object({
  candidateId: nonEmptyString,
  level: nonEmptyString,
  selected: z.boolean(),
  metrics: rankingMetricsSchema
}).strict();

const timeChainNodeSchema = z.object({
  nodeId: nonEmptyString,
  nodeType: nonEmptyString,
  resourceId: nonEmptyString.nullable(),
  taskId: nonEmptyString.nullable(),
  startTimeSec: nonNegative,
  finishTimeSec: nonNegative,
  predecessorNodeIds: z.array(nonEmptyString)
}).strict().refine(
  node => node.finishTimeSec >= node.startTimeSec,
  {
    path: ["finishTimeSec"],
    message: "time-chain finish time must not precede start time"
  }
);

const viewProvenanceSchema = z.object({
  eventBatchId: nonEmptyString,
  snapshotId: nonEmptyString,
  sourceHashes: z.record(z.string())
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

const failureItemSchema = z.object({
  code: nonEmptyString,
  stage: nonEmptyString,
  message: nonEmptyString,
  affectedObjectIds: z.array(nonEmptyString),
  recoverable: z.boolean(),
  details: z.record(z.unknown())
}).strict();

export const failureReportSchema = z.object({
  attemptId: nonEmptyString,
  sourcePlanVersion: positiveInteger,
  failures: z.array(failureItemSchema).min(1)
}).strict();

export type MissionViewV1 = z.infer<typeof missionViewV1Schema>;
export type FailureReport = z.infer<typeof failureReportSchema>;
export type ChangeType = z.infer<typeof changeTypeSchema>;
export type LocalPoint = z.infer<typeof localPointSchema>;
