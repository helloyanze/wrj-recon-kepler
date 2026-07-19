import {z} from "zod";

export const FIXED_DATASET_IDS = [
  "wrj-real-pois",
  "wrj-real-context",
  "wrj-simulated-region",
  "wrj-simulated-strips",
  "wrj-simulated-planned-routes",
  "wrj-simulated-trips"
] as const;

const realDatasetIds = new Set(["wrj-real-pois", "wrj-real-context"]);

const datasetSchema = z
  .object({
    id: z.enum(FIXED_DATASET_IDS),
    file: z.string().min(1),
    dataNature: z.enum(["REAL_PUBLIC_GEODATA", "SIMULATED_MISSION_DATA"])
  })
  .superRefine((dataset, context) => {
    const expected = realDatasetIds.has(dataset.id)
      ? "REAL_PUBLIC_GEODATA"
      : "SIMULATED_MISSION_DATA";
    if (dataset.dataNature !== expected) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dataNature"],
        message: `${dataset.id} 的数据性质必须为 ${expected}`
      });
    }
  });

export const caseManifestSchema = z
  .object({
    caseId: z.literal("riyue-3d"),
    name: z.string().min(1),
    coordinateReference: z.literal("EPSG:4326"),
    basemap: z.object({
      provider: z.literal("Mapbox"),
      style: z.enum(["satellite", "light"]),
      dataNature: z.literal("REAL_BASEMAP")
    }),
    summaryFile: z.string().min(1),
    keplerConfigFile: z.string().min(1),
    datasets: z.array(datasetSchema)
  })
  .superRefine((manifest, context) => {
    const ids = new Set(manifest.datasets.map(({id}) => id));
    if (
      manifest.datasets.length !== FIXED_DATASET_IDS.length ||
      FIXED_DATASET_IDS.some((id) => !ids.has(id))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["datasets"],
        message: "算例必须包含 6 个固定 Dataset"
      });
    }
  });

const uavIdSchema = z.enum(["UAV-01", "UAV-02", "UAV-03"]);

const uavSummarySchema = z.object({
  uavId: uavIdSchema,
  callsign: z.string().min(1),
  stripRange: z.string().regex(/^\d+-\d+$/),
  distanceKm: z.number().nonnegative(),
  durationMin: z.number().positive(),
  coverageAltitudeM: z.number().positive(),
  transitAltitudeM: z.number().positive(),
  maxAltitudeM: z.number().positive(),
  status: z.literal("VALID")
});

export const caseSummarySchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    caseId: z.literal("riyue-3d"),
    name: z.string().min(1),
    description: z.string().min(1),
    status: z.literal("FEASIBLE"),
    demoMock: z.literal(true),
    location: z.string().min(1),
    metrics: z.object({
      uavCount: z.literal(3),
      stripCount: z.literal(12),
      coverageRatio: z.number().min(0).max(1),
      missionMakespanSec: z.number().positive(),
      totalDistanceKm: z.number().positive(),
      totalFuelKg: z.null()
    }),
    uavs: z.array(uavSummarySchema).length(3),
    notice: z.string().min(20)
  })
  .superRefine((summary, context) => {
    const ids = new Set(summary.uavs.map(({uavId}) => uavId));
    if (ids.size !== 3) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["uavs"],
        message: "摘要必须包含三架不同的 UAV"
      });
    }
  });

export type CaseManifest = z.infer<typeof caseManifestSchema>;
export type CaseSummary = z.infer<typeof caseSummarySchema>;
export type CaseDataset = z.infer<typeof datasetSchema>;
export type UavSummary = z.infer<typeof uavSummarySchema>;

export interface RealGeographicFeatureProperties {
  dataNature: "REAL_PUBLIC_GEODATA";
  sourceName: "OpenStreetMap";
  sourceType: "node" | "way" | "relation";
  sourceId: string;
  sourceRef: string;
  retrievedAt: string;
  name: string | null;
  category: string;
  geometryOrigin: "original" | "center-derived";
  osmTags: Record<string, string>;
  verifiedForDemo: boolean;
  verificationNote: string | null;
}

export interface SimulatedMissionProperties {
  dataNature: "SIMULATED_MISSION_DATA";
  sourceName: "WRJ Demo Generator";
  caseId: "riyue-3d";
  generatedAt: string;
  realLocationContext: true;
  operationalUseAllowed: false;
  simulationNote: string;
}
