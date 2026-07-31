import {z} from "zod";

import type {CaseBundleV2} from "../cases/caseBundle";
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

export const sceneConfigSchema = z.object({
  schemaVersion: z.literal("task2-demo-scene.v1"),
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

export const scenePackageSchema = z.object({
  sceneId: nonEmptyString,
  displayName: nonEmptyString,
  summary: nonEmptyString,
  baseUrl: nonEmptyString,
  resultStatus: z.enum(["COMPLETE", "PARTIAL_SAFE_FALLBACK"]),
  failureReportUrl: nonEmptyString.nullable()
}).strict().superRefine((entry, context) => {
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
});

export const dynamicSceneCatalogSchema = z.object({
  version: z.literal(1),
  defaultSceneId: nonEmptyString,
  scenes: z.array(scenePackageSchema).min(1)
}).strict().superRefine((catalog, context) => {
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
});

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
  failureReport: failureReportSchema.nullable(),
  provenance: sceneProvenanceSchema
}).strict();

export type DynamicSceneCatalog = z.infer<
  typeof dynamicSceneCatalogSchema
>;
export type DynamicSceneCatalogEntry =
  DynamicSceneCatalog["scenes"][number];
export type SceneConfig = z.infer<typeof sceneConfigSchema>;
export type SceneProvenance = z.infer<typeof sceneProvenanceSchema>;
export type ScenePackageDescriptor = z.infer<typeof scenePackageSchema>;

export interface LoadedDynamicScenePackage {
  config: SceneConfig;
  baseline: CaseBundleV2;
  view: MissionViewV1;
  failureReport: FailureReport | null;
  provenance: SceneProvenance;
}
