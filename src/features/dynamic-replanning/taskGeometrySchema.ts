import {z} from "zod";

const finiteNumber = z.number().finite();
const geometryPointSchema = z.union([
  z.tuple([finiteNumber, finiteNumber]),
  z.tuple([finiteNumber, finiteNumber, finiteNumber])
]);

const polygonGeometrySchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(
    z.array(geometryPointSchema).min(4).refine(
      ring => JSON.stringify(ring[0]) === JSON.stringify(ring.at(-1)),
      "polygon exterior ring must be closed"
    )
  ).min(1)
}).strict();

const lineStringGeometrySchema = z.object({
  type: z.literal("LineString"),
  coordinates: z.array(geometryPointSchema).min(1)
}).strict();

export const taskGeometrySchema = z.discriminatedUnion("type", [
  polygonGeometrySchema,
  lineStringGeometrySchema
]);

export type TaskGeometry = z.infer<typeof taskGeometrySchema>;
