import {z} from "zod";

import {taskGeometrySchema} from "./taskGeometrySchema";

const id = z.string().min(1);
const nonNegative = z.number().finite().nonnegative();

export const overlayGeometrySchema = z.object({
  type: z.enum(["Polygon", "MultiPolygon"]),
  coordinates: z.array(z.unknown()).min(1)
}).strict();

export const taskGeometryContextSchema = z.object({
  originalGeometry: taskGeometrySchema.nullable(),
  currentGeometry: taskGeometrySchema.nullable(),
  relation: z.enum([
    "unchanged",
    "expanded",
    "reduced",
    "replaced",
    "new",
    "unknown"
  ]),
  spatialRelation: z.enum(["disjoint", "overlap"]),
  overlappingTaskIds: z.array(id),
  extensionGeometry: overlayGeometrySchema.nullable(),
  originalAreaM2: nonNegative.nullable(),
  currentAreaM2: nonNegative.nullable(),
  extensionAreaM2: nonNegative,
  extensionRatio: nonNegative
}).strict();

export const taskGeometryDiffV1Schema = z.object({
  schemaVersion: z.literal("task_geometry_diff.v1"),
  missionId: id,
  sourcePlanVersion: z.number().int().positive(),
  planVersion: z.number().int().positive(),
  methodVersion: z.literal("shapely-difference-v1"),
  entries: z.array(taskGeometryContextSchema.extend({
    taskId: id,
    originalGeometryHash: z.string().nullable(),
    currentGeometryHash: z.string().nullable()
  }).strict())
}).strict();

export type TaskGeometryContext = z.infer<typeof taskGeometryContextSchema>;
export type TaskGeometryDiffV1 = z.infer<typeof taskGeometryDiffV1Schema>;
