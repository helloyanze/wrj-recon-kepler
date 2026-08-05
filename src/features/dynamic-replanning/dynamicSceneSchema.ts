import {z} from "zod";

import type {CaseBundleV2} from "../cases/caseBundle";
import {
  type DecisionTraceV1,
  decisionTraceV1Schema
} from "./decisionTraceSchema";
import {
  type FailureReport,
  failureReportSchema,
  type MissionViewV1,
  missionViewV1Schema
} from "./missionViewSchema";

const nonEmptyString = z.string().min(1);
const nonNegative = z.number().finite().nonnegative();
const nonNegativeInteger = z.number().int().nonnegative();
const positiveInteger = z.number().int().positive();
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/iu);

export const dynamicSceneCategories = [
  "foundation",
  "task_change",
  "event_governance",
  "comprehensive"
] as const;

export const dynamicSceneDataNatures = [
  "SIMULATED_PIPELINE_RESULT"
] as const;

export const sceneConfigSchema = z.object({
  schemaVersion: z.literal("task2-demo-scene.v2"),
  sceneId: nonEmptyString,
  displayName: nonEmptyString,
  summary: nonEmptyString,
  baselineCaseId: nonEmptyString,
  resultStatus: z.enum(["COMPLETE", "PARTIAL_SAFE_FALLBACK"]),
  playback: z.object({
    baselineLeadInSec: nonNegative,
    eventAlertMs: nonNegativeInteger,
    impactRevealMs: nonNegativeInteger,
    replanExplainerMs: nonNegativeInteger,
    planTransitionMs: nonNegativeInteger,
    resultHoldMs: nonNegativeInteger
  }).strict(),
  camera: z.object({
    eventTargetKind: z.enum(["RESOURCE", "TASK"]),
    eventTargetId: nonEmptyString,
    overviewPaddingPx: nonNegativeInteger
  }).strict()
}).strict();

const scenePackageBaseSchema = z.object({
  sceneId: nonEmptyString,
  displayName: nonEmptyString,
  summary: nonEmptyString,
  baseUrl: nonEmptyString,
  resultStatus: z.enum(["COMPLETE", "PARTIAL_SAFE_FALLBACK"]),
  failureReportUrl: nonEmptyString.nullable()
}).strict();

type RawScenePackage = z.infer<typeof scenePackageBaseSchema>;

function refineScenePackage(
  entry: RawScenePackage,
  context: z.RefinementCtx
): void {
  if (
    entry.resultStatus === "PARTIAL_SAFE_FALLBACK" &&
    entry.failureReportUrl === null
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["failureReportUrl"],
      message: "partial safe fallback requires failure_report.json"
    });
  }
  if (
    entry.resultStatus === "COMPLETE" &&
    entry.failureReportUrl !== null
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["failureReportUrl"],
      message: "complete scene must not reference a failure report"
    });
  }
}

export const scenePackageSchema = scenePackageBaseSchema.superRefine(
  refineScenePackage
);

export const scenePackageV3Schema = scenePackageBaseSchema.extend({
  category: z.enum(dynamicSceneCategories),
  dataNature: z.enum(dynamicSceneDataNatures),
  featured: z.boolean()
}).strict().superRefine(refineScenePackage);

interface RawCatalogShape {
  defaultSceneId: string;
  scenes: Array<{sceneId: string}>;
}

function refineCatalog(
  catalog: RawCatalogShape,
  context: z.RefinementCtx
): void {
  const ids = new Set<string>();
  catalog.scenes.forEach((scene, index) => {
    if (ids.has(scene.sceneId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scenes", index, "sceneId"],
        message: `duplicate sceneId ${scene.sceneId}`
      });
    }
    ids.add(scene.sceneId);
  });
  if (!ids.has(catalog.defaultSceneId)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["defaultSceneId"],
      message: "defaultSceneId must reference a catalog scene"
    });
  }
}

export const dynamicSceneCatalogSchema = z.object({
  version: z.literal(2),
  defaultSceneId: nonEmptyString,
  scenes: z.array(scenePackageSchema).min(1)
}).strict().superRefine(refineCatalog);

export const dynamicSceneCatalogV3Schema = z.object({
  version: z.literal(3),
  defaultSceneId: nonEmptyString,
  scenes: z.array(scenePackageV3Schema).min(1)
}).strict().superRefine(refineCatalog);

export const rawDynamicSceneCatalogSchema = z.union([
  dynamicSceneCatalogSchema,
  dynamicSceneCatalogV3Schema
]);

export type DynamicSceneCatalog = z.infer<
  typeof dynamicSceneCatalogV3Schema
>;

export function parseDynamicSceneCatalog(
  value: unknown
): DynamicSceneCatalog {
  const catalog = rawDynamicSceneCatalogSchema.parse(value);
  if (catalog.version === 3) return catalog;
  return {
    version: 3,
    defaultSceneId: catalog.defaultSceneId,
    scenes: catalog.scenes.map(scene => ({
      ...scene,
      category: "foundation",
      dataNature: "SIMULATED_PIPELINE_RESULT",
      featured: false
    }))
  };
}

const hashRecordSchema = z.record(sha256Schema);

export const sceneProvenanceSchema = z.object({
  schemaVersion: z.literal("task2-demo-provenance.v1"),
  task2Commit: nonEmptyString,
  generationCommand: nonEmptyString,
  generatedAt: z.string().datetime({offset: true}),
  snapshotSource: z.enum(["SIMULATED", "RUNTIME"]),
  baselinePlanVersion: positiveInteger,
  upstreamSha256: hashRecordSchema,
  packagedSha256: hashRecordSchema
}).strict();

export const upstreamScenePackageSchema = z.object({
  config: sceneConfigSchema,
  view: missionViewV1Schema,
  decisionTrace: decisionTraceV1Schema,
  failureReport: failureReportSchema.nullable(),
  provenance: sceneProvenanceSchema
}).strict();

export type DynamicSceneCatalogEntry =
  DynamicSceneCatalog["scenes"][number];
export type SceneConfig = z.infer<typeof sceneConfigSchema>;
export type SceneProvenance = z.infer<typeof sceneProvenanceSchema>;
export type ScenePackageDescriptor = DynamicSceneCatalogEntry;

export interface LoadedDynamicScenePackage {
  config: SceneConfig;
  baseline: CaseBundleV2;
  view: MissionViewV1;
  decisionTrace: DecisionTraceV1;
  failureReport: FailureReport | null;
  provenance: SceneProvenance;
}
