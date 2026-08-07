import {z} from "zod";

const finiteNumber = z.number().finite();

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

const planarPointSchema = z
  .object({
    xM: finiteNumber,
    yM: finiteNumber
  })
  .passthrough();

const localPointSchema = z
  .object({
    xM: finiteNumber,
    yM: finiteNumber,
    zM: finiteNumber
  })
  .passthrough();

const lineStringGeometrySchema = z
  .object({
    type: z.literal("LineString"),
    coordinates: z.array(
      z.union([
        z.tuple([finiteNumber, finiteNumber]),
        z.tuple([finiteNumber, finiteNumber, finiteNumber])
      ])
    ).min(1)
  })
  .passthrough();

const segmentSchema = z
  .object({
    segmentId: z.string().min(1),
    segmentType: segmentTypeSchema,
    geometry: lineStringGeometrySchema,
    startPoint: localPointSchema,
    endPoint: localPointSchema,
    distanceM: finiteNumber,
    heightM: finiteNumber,
    speedMps: finiteNumber,
    durationSec: finiteNumber,
    fuelConsumptionKg: finiteNumber.nullable(),
    turnRadiusM: finiteNumber.nullable(),
    stripId: z.string().min(1).nullable(),
    valid: z.boolean()
  })
  .passthrough();

const trajectorySchema = z
  .object({
    trajectoryId: z.string().min(1),
    assignmentId: z.string().min(1),
    uavId: z.string().min(1),
    segments: z.array(segmentSchema),
    totalDistanceM: finiteNumber,
    totalDurationSec: finiteNumber,
    totalFuelKg: finiteNumber.nullable(),
    valid: z.boolean(),
    failureCodes: z.array(z.string())
  })
  .passthrough();

const assignmentSchema = z
  .object({
    assignmentId: z.string().min(1),
    uavId: z.string().min(1),
    baseId: z.string().min(1),
    flightCandidateId: z.string().min(1),
    stripStartIndex: finiteNumber,
    stripEndIndex: finiteNumber,
    stripIds: z.array(z.string().min(1)),
    entryVariant: z.string().min(1),
    plannedLaunchTimeSec: finiteNumber,
    batchIndex: finiteNumber,
    routeEstimateId: z.string().min(1),
    coverageRouteId: z.string().min(1).nullable()
  })
  .passthrough();

const stripSchema = z
  .object({
    stripId: z.string().min(1),
    index: finiteNumber,
    start: planarPointSchema,
    end: planarPointSchema,
    lengthM: finiteNumber,
    scanAngleDeg: finiteNumber,
    coveragePolygon: z.array(planarPointSchema)
  })
  .passthrough();

const stripPlanSnapshotSchema = z
  .object({
    stripPlanId: z.string().min(1),
    flightCandidateId: z.string().min(1),
    regionId: z.string().min(1),
    scanAngleDeg: finiteNumber,
    swathWidthM: finiteNumber,
    stripSpacingM: finiteNumber,
    stripCount: finiteNumber,
    strips: z
      .array(stripSchema)
      .min(1, "assignmentPlan.stripPlanSnapshot.strips 不能为空"),
    estimatedCoverageRatio: finiteNumber,
    generationWarnings: z.array(z.string()),
    compatibleFlightCandidates: z.array(z.string().min(1))
  })
  .passthrough();

const assignmentPlanSchema = z
  .object({
    assignments: z.array(assignmentSchema).min(1, "assignmentPlan.assignments 不能为空"),
    stripPlanSnapshot: stripPlanSnapshotSchema
  })
  .passthrough();

const validationReportSchema = z
  .object({
    valid: z.boolean().optional(),
    warnings: z.array(z.string()).optional(),
    failureCodes: z.array(z.string()).optional()
  })
  .passthrough();

const finalScoreSchema = z.object({}).passthrough();

export const missionPlanSchema = z
  .object({
    planId: z.string().min(1),
    caseId: z.string().min(1),
    assignmentPlan: assignmentPlanSchema,
    trajectories: z.array(trajectorySchema).min(1, "trajectories 不能为空"),
    coverageRatio: finiteNumber,
    missionMakespanSec: finiteNumber,
    totalDistanceM: finiteNumber,
    totalFuelKg: finiteNumber.nullable(),
    validationReport: validationReportSchema,
    finalScore: finalScoreSchema,
    feasible: z.boolean(),
    failureCodes: z.array(z.string())
  })
  .passthrough()
  .superRefine((plan, context) => {
    if (plan.feasible !== true) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["feasible"],
        message: "feasible 必须为 true"
      });
    }
    if (plan.validationReport.valid === false) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["validationReport", "valid"],
        message: "validationReport.valid 不能为 false"
      });
    }
  });

export type MissionPlan = z.infer<typeof missionPlanSchema>;

export function normalizeMissionPlanInput(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const normalized: Record<string, unknown> = {...value};
  if (typeof normalized.finalScore === "number") {
    normalized.finalScore = {total: normalized.finalScore};
  }

  const assignmentPlan = normalized.assignmentPlan;
  if (!isRecord(assignmentPlan)) {
    return normalized;
  }
  const normalizedAssignmentPlan: Record<string, unknown> = {...assignmentPlan};
  normalized.assignmentPlan = normalizedAssignmentPlan;

  const snapshot = assignmentPlan.stripPlanSnapshot;
  if (!isRecord(snapshot)) {
    return normalized;
  }
  const normalizedSnapshot: Record<string, unknown> = {...snapshot};
  normalizedAssignmentPlan.stripPlanSnapshot = normalizedSnapshot;

  if (Array.isArray(snapshot.compatibleFlightCandidates)) {
    normalizedSnapshot.compatibleFlightCandidates =
      snapshot.compatibleFlightCandidates.map(candidate => {
        if (isRecord(candidate) && typeof candidate.candidateId === "string") {
          return candidate.candidateId;
        }
        return candidate;
      });
  }

  if (Array.isArray(snapshot.strips)) {
    normalizedSnapshot.strips = snapshot.strips.map(strip => {
      if (!isRecord(strip) || !isRecord(strip.coveragePolygon)) {
        return strip;
      }
      const polygon = strip.coveragePolygon;
      if (
        polygon.type !== "Polygon" ||
        !Array.isArray(polygon.coordinates) ||
        !Array.isArray(polygon.coordinates[0])
      ) {
        return strip;
      }
      return {
        ...strip,
        coveragePolygon: polygon.coordinates[0].map(coordinate => {
          if (
            !Array.isArray(coordinate) ||
            typeof coordinate[0] !== "number" ||
            typeof coordinate[1] !== "number"
          ) {
            return coordinate;
          }
          return {xM: coordinate[0], yM: coordinate[1]};
        })
      };
    });
  }

  return normalized;
}

export function parseMissionPlan(value: unknown, source: string): MissionPlan {
  const result = missionPlanSchema.safeParse(normalizeMissionPlanInput(value));
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.length > 0 ? issue.path.join(".") : "<root>"}: ${issue.message}`)
      .join("; ");
    throw new Error(`${source} 算法计划校验失败: ${details}`);
  }
  return result.data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
