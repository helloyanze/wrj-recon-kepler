import {z} from "zod";

export const CASE_CATALOG_VERSION = 1 as const;

const nonNegativeInteger = z.number().int().nonnegative();
const nonNegativeFiniteNumber = z.number().finite().nonnegative();

export const caseCatalogEntrySchema = z
  .object({
    caseId: z.string().min(1),
    planId: z.string().min(1),
    displayName: z.string().min(1),
    runId: z.string().min(1),
    bundleUrl: z.string().startsWith("/data/integration-cases/"),
    sourcePath: z
      .string()
      .min(1)
      .refine(
        value =>
          !value.startsWith("/") &&
          !value.includes("\\") &&
          !value.split("/").includes(".."),
        "sourcePath must be a relative forward-slash path"
      ),
    metrics: z
      .object({
        uavCount: nonNegativeInteger,
        sortieCount: nonNegativeInteger,
        batchCount: nonNegativeInteger,
        stripCount: nonNegativeInteger,
        missionMakespanSec: nonNegativeFiniteNumber
      })
      .strict(),
    warnings: z.array(z.string())
  })
  .strict()
  .superRefine((entry, context) => {
    let expectedBundleUrl: string | undefined;
    try {
      expectedBundleUrl =
        `/data/integration-cases/${encodeURIComponent(entry.caseId)}/bundle.json`;
    } catch {
      // The mismatch issue below also covers case IDs with invalid surrogates.
    }
    if (entry.bundleUrl !== expectedBundleUrl) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bundleUrl"],
        message: "bundleUrl must match the encoded caseId bundle path"
      });
    }
  });

export const caseCatalogSchema = z
  .object({
    version: z.literal(CASE_CATALOG_VERSION),
    defaultCaseId: z.string().min(1),
    cases: z.array(caseCatalogEntrySchema)
  })
  .strict()
  .superRefine((catalog, context) => {
    const caseIds = new Set<string>();
    const bundleUrls = new Set<string>();

    catalog.cases.forEach((entry, index) => {
      if (caseIds.has(entry.caseId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["cases", index, "caseId"],
          message: `duplicate caseId: ${entry.caseId}`
        });
      }
      caseIds.add(entry.caseId);

      if (bundleUrls.has(entry.bundleUrl)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["cases", index, "bundleUrl"],
          message: `duplicate bundleUrl: ${entry.bundleUrl}`
        });
      }
      bundleUrls.add(entry.bundleUrl);
    });

    if (!caseIds.has(catalog.defaultCaseId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["defaultCaseId"],
        message:
          `defaultCaseId ${catalog.defaultCaseId} does not reference a catalog case`
      });
    }
  });

export type CaseCatalogEntry = z.infer<typeof caseCatalogEntrySchema>;
export type CaseCatalogV1 = z.infer<typeof caseCatalogSchema>;
