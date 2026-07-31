import {z} from "zod";

import {rankingMetricsSchema} from "./missionViewSchema";

const nonEmptyString = z.string().min(1);
const nonNegative = z.number().finite().nonnegative();
const positiveInteger = z.number().int().positive();

export const decisionStageIds = [
  "EVENT_INGESTION",
  "SNAPSHOT_AND_IMPACT",
  "RESOURCE_ASSESSMENT",
  "CANDIDATE_GENERATION",
  "PLANNING_AND_VALIDATION",
  "RANKING_AND_SELECTION",
  "PLAN_PUBLICATION"
] as const;

const decisionValidationCheckSchema = z.object({
  checkId: nonEmptyString,
  name: nonEmptyString,
  passed: z.boolean(),
  code: nonEmptyString.nullable(),
  affectedObjectIds: z.array(nonEmptyString)
}).strict();

const candidateAllocationSchema = z.object({
  taskId: nonEmptyString,
  resourceIds: z.array(nonEmptyString).min(1),
  workUnitIds: z.array(nonEmptyString)
}).strict();

const decisionCandidateSchema = z.object({
  candidateId: nonEmptyString,
  level: z.enum([
    "L1_MINIMAL_ADJUSTMENT",
    "L2_SINGLE_REPLACEMENT",
    "L3_STANDBY_LAUNCH",
    "L4_MULTI_RESOURCE",
    "L5_PREEMPTION"
  ]),
  lifecycle: z.enum([
    "generated",
    "rejected",
    "valid",
    "selected",
    "fallback"
  ]),
  affectedTaskIds: z.array(nonEmptyString),
  affectedResourceIds: z.array(nonEmptyString),
  allocations: z.array(candidateAllocationSchema),
  metrics: rankingMetricsSchema.nullable(),
  validationChecks: z.array(decisionValidationCheckSchema),
  rejectionCodes: z.array(nonEmptyString),
  failureCodes: z.array(nonEmptyString),
  rank: positiveInteger.nullable(),
  selected: z.boolean()
}).strict();

const decisionStageSchema = z.object({
  stageId: z.enum(decisionStageIds),
  status: z.enum(["COMPLETED", "FAILED", "SAFE_FALLBACK"]),
  actualDurationMs: nonNegative,
  affectedEventIds: z.array(nonEmptyString),
  affectedObjectIds: z.array(nonEmptyString),
  facts: z.array(z.object({
    code: nonEmptyString,
    value: z.unknown(),
    unit: nonEmptyString.nullable(),
    objectIds: z.array(nonEmptyString)
  }).strict()),
  candidateIds: z.array(nonEmptyString),
  validationCheckIds: z.array(nonEmptyString),
  failureCodes: z.array(nonEmptyString),
  artifactRefs: z.array(z.object({
    artifactType: nonEmptyString,
    path: nonEmptyString
  }).strict())
}).strict();

export const decisionTraceV1Schema = z.object({
  schemaVersion: z.literal("decision_trace.v1"),
  attemptId: nonEmptyString,
  missionId: nonEmptyString,
  eventBatchId: nonEmptyString,
  sourcePlanVersion: positiveInteger,
  resultStatus: z.enum(["COMPLETE", "PARTIAL_SAFE_FALLBACK"]),
  selectedCandidateId: nonEmptyString.nullable(),
  stages: z.array(decisionStageSchema).length(decisionStageIds.length),
  candidates: z.array(decisionCandidateSchema),
  selection: z.object({
    orderedCandidateIds: z.array(nonEmptyString),
    selectedCandidateId: nonEmptyString.nullable(),
    reasonCodes: z.array(nonEmptyString)
  }).strict(),
  publication: z.object({
    planId: nonEmptyString.nullable(),
    planVersion: positiveInteger.nullable(),
    planStatus: z.enum([
      "COMPLETE",
      "PARTIAL_SAFE_FALLBACK",
      "FAILED"
    ]).nullable(),
    sourcePlanVersion: positiveInteger,
    planDiffRefs: z.array(z.object({
      elementType: nonEmptyString,
      elementId: nonEmptyString,
      changeType: nonEmptyString
    }).strict()),
    failureReportPath: nonEmptyString.nullable()
  }).strict()
}).strict().superRefine((trace, context) => {
  trace.stages.forEach((stage, index) => {
    if (stage.stageId !== decisionStageIds[index]) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["stages", index, "stageId"],
        message: "decision stages are not in the required stable order"
      });
    }
  });
  const candidateIds = new Set(trace.candidates.map(item => item.candidateId));
  const references = new Set([
    ...trace.stages.flatMap(stage => stage.candidateIds),
    ...trace.selection.orderedCandidateIds
  ]);
  if (trace.selection.selectedCandidateId !== null) {
    references.add(trace.selection.selectedCandidateId);
  }
  for (const reference of references) {
    if (!candidateIds.has(reference)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["candidates"],
        message: `unknown candidate reference ${reference}`
      });
    }
  }
  if (trace.selectedCandidateId !== trace.selection.selectedCandidateId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["selection", "selectedCandidateId"],
      message: "selected candidate identity is inconsistent"
    });
  }
});

export type DecisionTraceV1 = z.infer<typeof decisionTraceV1Schema>;
export type DecisionCandidate =
  DecisionTraceV1["candidates"][number];
export type DecisionStage = DecisionTraceV1["stages"][number];
