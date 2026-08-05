import {z} from "zod";

import {taskGeometrySchema} from "./taskGeometrySchema";

const id = z.string().min(1);
const nonNegative = z.number().finite().nonnegative();
const emptyPayloadSchema = z.object({
  kind: z.literal("EMPTY")
}).strict();

const payloadSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("GEOMETRY_CHANGED"),
    geometry: taskGeometrySchema
  }).strict(),
  z.object({
    kind: z.literal("PRIORITY_CHANGED"),
    priority: z.number().int().nonnegative()
  }).strict(),
  z.object({
    kind: z.literal("EARLIEST_START_CHANGED"),
    earliestStartTimeSec: nonNegative
  }).strict(),
  z.object({
    kind: z.literal("LATEST_FINISH_CHANGED"),
    latestFinishTimeSec: nonNegative
  }).strict(),
  z.object({
    kind: z.literal("DEADLINE_TYPE_CHANGED"),
    deadlineType: id
  }).strict(),
  z.object({
    kind: z.literal("DEPENDENCY_CHANGED"),
    predecessorTaskIds: z.array(id),
    successorTaskIds: z.array(id)
  }).strict(),
  z.object({
    kind: z.literal("RESOURCE_LOW_FUEL"),
    remainingFuelKg: nonNegative.nullable()
  }).strict(),
  z.object({
    kind: z.literal("RESOURCE_DEGRADED"),
    unavailableCapabilities: z.array(id)
  }).strict(),
  z.object({
    kind: z.literal("RESOURCE_DELAYED"),
    availableAfterTimeSec: nonNegative
  }).strict(),
  z.object({
    kind: z.literal("RESOURCE_TIME_CONFLICT"),
    conflictStartTimeSec: nonNegative,
    conflictFinishTimeSec: nonNegative
  }).strict(),
  z.object({
    kind: z.literal("NEW_TASK"),
    task: z.object({
      taskId: id,
      taskType: id,
      status: id,
      priority: z.number().int().nonnegative(),
      geometry: taskGeometrySchema,
      minimumCoverageRatio: z.number().min(0).max(1),
      earliestStartTimeSec: nonNegative.nullable(),
      latestFinishTimeSec: nonNegative.nullable(),
      predecessorTaskIds: z.array(id),
      successorTaskIds: z.array(id),
      metadata: z.record(z.unknown())
    }).passthrough()
  }).strict(),
  emptyPayloadSchema
]);

export const dynamicEventBatchSchema = z.object({
  batchId: id,
  missionId: id,
  sourcePlanVersion: z.number().int().positive(),
  snapshotId: id,
  missionTimeSec: nonNegative,
  events: z.array(z.object({
    eventId: id,
    eventType: id,
    eventTimeSec: nonNegative,
    affectedObjectId: id,
    priority: z.number().int().nonnegative(),
    payload: payloadSchema,
    status: id,
    idempotencyKey: z.string().nullable(),
    normalizedPayloadHash: z.string().nullable()
  }).strict())
}).strict();

export type DynamicEventBatch = z.infer<typeof dynamicEventBatchSchema>;
export type DynamicEvent = DynamicEventBatch["events"][number];
