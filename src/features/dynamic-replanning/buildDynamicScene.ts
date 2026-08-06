import type {
  DecisionTraceV1
} from "./decisionTraceSchema";
import type {
  DynamicEvent
} from "./dynamicEventSchema";
import type {
  TaskGeometryDiffV1,
  TaskGeometryContext
} from "./taskGeometryDiffSchema";
import type {
  DisplayTransform,
  LocalPoint as BaselineLocalPoint,
  MapPoint,
  TimedMapPoint
} from "../cases/caseBundle";
import {localToMapPoint} from "../cases/displayTransform";
import {
  buildDynamicMetricCards,
  type DynamicMetricCard
} from "./dynamicMetrics";
import type {
  LoadedDynamicScenePackage,
  SceneConfig
} from "./dynamicSceneSchema";
import type {
  ChangeType,
  FailureReport,
  LocalPoint,
  MissionViewV1
} from "./missionViewSchema";

export type DynamicPathChangeType = ChangeType | "baseline";

export interface DynamicTimedPath {
  segmentId: string;
  trajectoryId: string;
  resourceId: string;
  taskId: string | null;
  workUnitId: string | null;
  segmentType: string;
  changeType: DynamicPathChangeType;
  startTimeSec: number;
  finishTimeSec: number;
  timedPath: TimedMapPoint[];
}

export interface DynamicTaskPolygon {
  taskId: string;
  status: MissionViewV1["tasks"][number]["status"];
  changeType: ChangeType;
  relation: TaskGeometryContext["relation"];
  spatialRelation: TaskGeometryContext["spatialRelation"];
  overlappingTaskIds: string[];
  originalPolygon: MapPoint[] | null;
  currentPolygon: MapPoint[];
  polygon: MapPoint[];
}

export interface DynamicTaskExtension {
  extensionId: string;
  taskId: string;
  polygon: MapPoint[][];
  extensionAreaM2: number;
  extensionRatio: number;
}

export interface DynamicWorkPath {
  workUnitId: string;
  taskId: string;
  assignedResourceId: string | null;
  status: MissionViewV1["workUnits"][number]["status"];
  changeType: ChangeType;
  path: MapPoint[];
}

export interface DynamicScene {
  config: SceneConfig;
  baseline: LoadedDynamicScenePackage["baseline"];
  view: MissionViewV1;
  decisionTrace: DecisionTraceV1;
  rawEvents: DynamicEvent[];
  geometryDiff: TaskGeometryDiffV1 | null;
  events: MissionViewV1["eventTimeline"];
  primaryEvent: MissionViewV1["eventTimeline"][number];
  eventTimeSec: number;
  planCommitTimeSec: number;
  makespanSec: number;
  baselinePaths: DynamicTimedPath[];
  activePaths: DynamicTimedPath[];
  taskPolygons: DynamicTaskPolygon[];
  taskExtensions: DynamicTaskExtension[];
  workPaths: DynamicWorkPath[];
  eventPosition: MapPoint;
  metricCards: DynamicMetricCard[];
  failureReport: FailureReport | null;
  resourcesById: ReadonlyMap<
    string,
    MissionViewV1["resources"][number]
  >;
  tasksById: ReadonlyMap<string, MissionViewV1["tasks"][number]>;
  workUnitsById: ReadonlyMap<
    string,
    MissionViewV1["workUnits"][number]
  >;
}

function localPointTuple(point: LocalPoint): BaselineLocalPoint {
  return [point.xM, point.yM, point.zM];
}

export function buildTimedPath(
  localPath: readonly BaselineLocalPoint[],
  transform: DisplayTransform,
  startTimeSec: number,
  finishTimeSec: number
): TimedMapPoint[] {
  if (localPath.length === 0) throw new Error("localPath must not be empty");
  if (!Number.isFinite(startTimeSec) || !Number.isFinite(finishTimeSec)) {
    throw new RangeError("segment times must be finite");
  }
  if (finishTimeSec < startTimeSec) {
    throw new RangeError("finishTimeSec must not precede startTimeSec");
  }
  const cumulative = [0];
  for (let index = 1; index < localPath.length; index += 1) {
    const previous = localPath[index - 1];
    const current = localPath[index];
    cumulative.push(cumulative[index - 1] + Math.hypot(
      current[0] - previous[0],
      current[1] - previous[1],
      current[2] - previous[2]
    ));
  }
  const total = cumulative.at(-1) ?? 0;
  return localPath.map((point, index) => {
    const ratio = total > 0
      ? cumulative[index] / total
      : localPath.length === 1 ? 0 : index / (localPath.length - 1);
    const [longitude, latitude, altitudeM] = localToMapPoint(
      point,
      transform
    );
    return [
      longitude,
      latitude,
      altitudeM,
      startTimeSec + (finishTimeSec - startTimeSec) * ratio
    ];
  });
}

function uniqueIndex<T>(
  values: readonly T[],
  id: (value: T) => string,
  label: string
): Map<string, T> {
  const result = new Map<string, T>();
  values.forEach(value => {
    const key = id(value);
    if (result.has(key)) throw new Error(`duplicate ${label} ${key}`);
    result.set(key, value);
  });
  return result;
}

function assertReference(
  index: ReadonlyMap<string, unknown>,
  id: string,
  label: string
): void {
  if (!index.has(id)) throw new Error(`${label} references unknown ${id}`);
}

function geometryPath(
  geometry: MissionViewV1["tasks"][number]["geometry"],
  transform: DisplayTransform
): MapPoint[] {
  if (geometry === null) return [];
  const coordinates = geometry.type === "Polygon"
    ? geometry.coordinates[0]
    : geometry.coordinates;
  return coordinates.map(point => localToMapPoint(
    [point[0], point[1], point.length === 3 ? point[2] : 0],
    transform
  ));
}

function taskPolygon(
  task: MissionViewV1["tasks"][number],
  transform: DisplayTransform
): MapPoint[] {
  if (task.geometry?.type !== "Polygon") return [];
  return geometryPath(task.geometry, transform);
}

function mapOverlayPoint(point: unknown, transform: DisplayTransform): MapPoint {
  if (!Array.isArray(point) || point.length < 2) {
    throw new Error("geometry diff contains an invalid coordinate");
  }
  const values = point as unknown[];
  if (typeof values[0] !== "number" || typeof values[1] !== "number") {
    throw new Error("geometry diff contains a non-numeric coordinate");
  }
  const altitude = values.length >= 3 && typeof values[2] === "number"
    ? values[2]
    : 0;
  return localToMapPoint([values[0], values[1], altitude], transform);
}

function mapOverlayPolygons(
  geometry: {type: "Polygon" | "MultiPolygon"; coordinates: unknown[]},
  transform: DisplayTransform
): MapPoint[][][] {
  const polygonCoordinates = geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.coordinates;
  return polygonCoordinates.map((polygon, polygonIndex) => {
    if (!Array.isArray(polygon)) {
      throw new Error(`geometry diff polygon ${polygonIndex} is invalid`);
    }
    return polygon.map((ring, ringIndex) => {
      if (!Array.isArray(ring)) {
        throw new Error(
          `geometry diff polygon ${polygonIndex} ring ${ringIndex} is invalid`
        );
      }
      return ring.map(point => mapOverlayPoint(point, transform));
    });
  });
}

function eventPosition(
  config: SceneConfig,
  tasksById: ReadonlyMap<string, MissionViewV1["tasks"][number]>,
  resourcesById: ReadonlyMap<
    string,
    MissionViewV1["resources"][number]
  >,
  transform: DisplayTransform
): MapPoint {
  if (config.camera.eventTargetKind === "RESOURCE") {
    const resource = resourcesById.get(config.camera.eventTargetId);
    if (resource === undefined) {
      throw new Error(
        `camera references unknown resource ${config.camera.eventTargetId}`
      );
    }
    return localToMapPoint(localPointTuple(resource.position), transform);
  }
  const task = tasksById.get(config.camera.eventTargetId);
  if (task === undefined) {
    throw new Error(`camera references unknown task ${config.camera.eventTargetId}`);
  }
  const polygon = taskPolygon(task, transform);
  if (polygon.length === 0) {
    throw new Error(`camera task ${task.taskId} has no polygon geometry`);
  }
  const points = polygon.slice(0, -1);
  const count = Math.max(1, points.length);
  return [
    points.reduce((sum, point) => sum + point[0], 0) / count,
    points.reduce((sum, point) => sum + point[1], 0) / count,
    points.reduce((sum, point) => sum + point[2], 0) / count
  ];
}

function eventTargetKind(eventType: string): "RESOURCE" | "TASK" {
  return eventType.startsWith("RESOURCE_") ? "RESOURCE" : "TASK";
}

function changeFor(
  view: MissionViewV1,
  elementType: string,
  elementId: string
): ChangeType {
  const raw = view.planDiff.entries.find(entry =>
    entry.elementType === elementType && entry.elementId === elementId
  )?.changeType;
  switch (raw) {
    case "ADDED":
      return "dynamic_new";
    case "CANCELLED":
    case "REMOVED":
      return "dynamic_cancelled";
    case "REPLACED":
    case "TRIMMED":
    case "MODIFIED":
      return "dynamic_modified";
    case "baseline_flown":
    case "baseline_locked":
    case "baseline_reused":
    case "dynamic_modified":
    case "dynamic_new":
    case "dynamic_cancelled":
      return raw;
    default:
      return "baseline_reused";
  }
}

function assertPackageConsistency(
  loaded: LoadedDynamicScenePackage,
  tasksById: ReadonlyMap<string, MissionViewV1["tasks"][number]>,
  resourcesById: ReadonlyMap<
    string,
    MissionViewV1["resources"][number]
  >,
  workUnitsById: ReadonlyMap<
    string,
    MissionViewV1["workUnits"][number]
  >
): void {
  const {
    baseline,
    config,
    decisionTrace,
    failureReport,
    provenance,
    view
  } = loaded;
  if (baseline.case.caseId !== view.mission.caseId) {
    throw new Error("baseline caseId does not match mission view caseId");
  }
  if (config.baselineCaseId !== baseline.case.caseId) {
    throw new Error("baseline caseId metadata is inconsistent");
  }
  if (
    provenance.baselinePlanVersion !== view.activePlan.sourcePlanVersion ||
    view.planDiff.sourcePlanVersion !== view.activePlan.sourcePlanVersion ||
    view.planDiff.planVersion !== view.activePlan.planVersion
  ) {
    throw new Error("baseline or target plan version metadata is inconsistent");
  }
  const rawEventIds = uniqueIndex(
    loaded.dynamicEvents.events,
    event => event.eventId,
    "dynamic eventId"
  );
  const auditFacts = decisionTrace.stages.flatMap(stage => stage.facts)
    .filter(fact => fact.code === "EVENT_AUDIT_ENTRY");
  const auditByEventId = uniqueIndex(
    auditFacts,
    fact => fact.objectIds[0] ?? "",
    "event audit entry"
  );
  if (auditByEventId.has("")) {
    throw new Error("event audit entry is missing an event ID");
  }
  for (const eventId of rawEventIds.keys()) {
    if (!auditByEventId.has(eventId)) {
      throw new Error(`event audit is missing raw event ${eventId}`);
    }
  }
  for (const eventId of auditByEventId.keys()) {
    if (!rawEventIds.has(eventId)) {
      throw new Error(`event audit references unknown raw event ${eventId}`);
    }
  }
  const ingestionFacts = decisionTrace.stages.find(stage =>
    stage.stageId === "EVENT_INGESTION"
  )?.facts ?? [];
  const numericFact = (code: string): number => {
    const value = ingestionFacts.find(fact => fact.code === code)?.value;
    if (typeof value !== "number" || !Number.isInteger(value)) {
      throw new Error(`event ingestion fact ${code} is missing or invalid`);
    }
    return value;
  };
  const auditStatuses = [...auditByEventId.values()].map(fact => {
    const value = fact.value;
    return typeof value === "object" && value !== null &&
      "status" in value && typeof value.status === "string"
      ? value.status
      : "";
  });
  if (numericFact("RECEIVED_EVENT_COUNT") !== loaded.dynamicEvents.events.length) {
    throw new Error("received event count does not match raw events");
  }
  if (numericFact("EFFECTIVE_EVENT_COUNT") !== auditStatuses.filter(
    status => status === "MERGED"
  ).length) {
    throw new Error("effective event count does not match event audit");
  }
  if (numericFact("DUPLICATE_EVENT_COUNT") !== auditStatuses.filter(
    status => status === "IGNORED_DUPLICATE"
  ).length) {
    throw new Error("duplicate event count does not match event audit");
  }
  if (numericFact("OVERRIDDEN_EVENT_COUNT") !== auditStatuses.filter(
    status => status === "MERGED_INTO_OTHER_EVENT"
  ).length) {
    throw new Error("overridden event count does not match event audit");
  }
  if (
    decisionTrace.resultStatus !== config.resultStatus ||
    decisionTrace.missionId !== view.mission.missionId ||
    decisionTrace.eventBatchId !== view.provenance.eventBatchId ||
    decisionTrace.sourcePlanVersion !== view.activePlan.sourcePlanVersion ||
    decisionTrace.publication.planId !== view.activePlan.planId ||
    decisionTrace.publication.planVersion !== view.activePlan.planVersion ||
    decisionTrace.publication.planStatus !== view.activePlan.planStatus
  ) {
    throw new Error("decision trace identity is inconsistent");
  }
  const viewDiffRefs = new Set(view.planDiff.entries.map(entry =>
    `${entry.elementType}\u0000${entry.elementId}\u0000${entry.changeType}`
  ));
  const traceDiffRefs = new Set(
    decisionTrace.publication.planDiffRefs.map(entry =>
      `${entry.elementType}\u0000${entry.elementId}\u0000${entry.changeType}`
    )
  );
  if (
    viewDiffRefs.size !== traceDiffRefs.size ||
    [...viewDiffRefs].some(reference => !traceDiffRefs.has(reference))
  ) {
    throw new Error("decision trace PlanDiff references are inconsistent");
  }
  if (
    failureReport !== null &&
    (
      decisionTrace.attemptId !== failureReport.attemptId ||
      decisionTrace.publication.failureReportPath !== "failure_report.json"
    )
  ) {
    throw new Error("decision trace failure report reference is inconsistent");
  }
  if (
    config.resultStatus !== view.activePlan.planStatus ||
    (config.resultStatus === "PARTIAL_SAFE_FALLBACK") !==
      (failureReport !== null)
  ) {
    throw new Error("result status and failure report are inconsistent");
  }
  if (
    failureReport !== null &&
    failureReport.sourcePlanVersion !== view.activePlan.sourcePlanVersion
  ) {
    throw new Error("failure report source version is inconsistent");
  }
  if (
    view.coordinateReference.frame !== "LOCAL_ENU" ||
    view.coordinateReference.mapCrs !== null
  ) {
    throw new Error(
      `unsupported Task 2 coordinate reference ` +
      `${view.coordinateReference.frame}/${view.coordinateReference.mapCrs}`
    );
  }

  view.workUnits.forEach(work => {
    assertReference(tasksById, work.taskId, `work unit ${work.workUnitId}`);
    if (work.assignedResourceId !== null) {
      assertReference(
        resourcesById,
        work.assignedResourceId,
        `work unit ${work.workUnitId}`
      );
    }
  });
  view.assignments.forEach(assignment => {
    if (assignment.taskId !== null) {
      assertReference(
        tasksById,
        assignment.taskId,
        `assignment ${assignment.assignmentId}`
      );
    }
    assertReference(
      resourcesById,
      assignment.resourceId,
      `assignment ${assignment.assignmentId}`
    );
    assignment.workUnitIds.forEach(id =>
      assertReference(workUnitsById, id, `assignment ${assignment.assignmentId}`)
    );
  });
  view.trajectories.forEach(trajectory => {
    assertReference(
      resourcesById,
      trajectory.resourceId,
      `trajectory ${trajectory.trajectoryId}`
    );
    trajectory.segments.forEach(segment => {
      if (segment.taskId !== null) {
        assertReference(
          tasksById,
          segment.taskId,
          `segment ${segment.segmentId} task`
        );
      }
      if (segment.workUnitId !== null) {
        assertReference(
          workUnitsById,
          segment.workUnitId,
          `segment ${segment.segmentId} work unit`
        );
      }
    });
  });
  view.eventTimeline.forEach(event => {
    assertReference(
      eventTargetKind(event.eventType) === "RESOURCE"
        ? resourcesById
        : tasksById,
      event.affectedObjectId,
      `event ${event.eventId}`
    );
  });
}

export function buildDynamicScene(
  loaded: LoadedDynamicScenePackage
): DynamicScene {
  const {baseline, config, decisionTrace, failureReport, view} = loaded;
  const tasksById = uniqueIndex(view.tasks, item => item.taskId, "taskId");
  const resourcesById = uniqueIndex(
    view.resources,
    item => item.resourceId,
    "resourceId"
  );
  const workUnitsById = uniqueIndex(
    view.workUnits,
    item => item.workUnitId,
    "workUnitId"
  );
  assertPackageConsistency(
    loaded,
    tasksById,
    resourcesById,
    workUnitsById
  );

  if (view.eventTimeline.length === 0) {
    throw new Error("dynamic scene must contain an event");
  }
  const eventTimes = new Set(
    view.eventTimeline.map(event => event.eventTimeSec)
  );
  if (eventTimes.size !== 1) {
    throw new Error("all scene events must share one eventTimeSec");
  }
  const primaryEvent = view.eventTimeline.find(event =>
    eventTargetKind(event.eventType) === config.camera.eventTargetKind &&
    event.affectedObjectId === config.camera.eventTargetId
  );
  if (primaryEvent === undefined) {
    throw new Error("scene camera target does not match an event");
  }

  const workTaskById = new Map(
    view.workUnits.map(work => [work.workUnitId, work.taskId])
  );
  const baselinePaths: DynamicTimedPath[] = baseline.sorties.flatMap(sortie =>
    sortie.segments.map(segment => ({
      segmentId: segment.segmentId,
      trajectoryId: sortie.trajectoryId,
      resourceId: sortie.uavId,
      taskId: segment.stripId === null
        ? null
        : workTaskById.get(segment.stripId) ?? null,
      workUnitId: segment.stripId,
      segmentType: segment.segmentType,
      changeType: changeFor(view, "TRAJECTORY", sortie.trajectoryId) ===
        "dynamic_cancelled"
        ? "dynamic_cancelled" as const
        : "baseline" as const,
      startTimeSec: segment.startTimeSec,
      finishTimeSec: segment.endTimeSec,
      timedPath: [...segment.timedPath]
    }))
  );
  const activePaths: DynamicTimedPath[] = view.trajectories.flatMap(
    trajectory => trajectory.segments.map(segment => ({
      segmentId: segment.segmentId,
      trajectoryId: trajectory.trajectoryId,
      resourceId: trajectory.resourceId,
      taskId: segment.taskId,
      workUnitId: segment.workUnitId,
      segmentType: segment.segmentType,
      changeType: (() => {
        const trajectoryChange = changeFor(
          view,
          "TRAJECTORY",
          trajectory.trajectoryId
        );
        return trajectoryChange === "baseline_reused"
          ? segment.changeType
          : trajectoryChange;
      })(),
      startTimeSec: segment.startTimeSec,
      finishTimeSec: segment.finishTimeSec,
      timedPath: buildTimedPath(
        segment.localPath.map(localPointTuple),
        baseline.displayTransform,
        segment.startTimeSec,
        segment.finishTimeSec
      )
    }))
  );
  const workPaths = view.workUnits
    .map(work => ({
      workUnitId: work.workUnitId,
      taskId: work.taskId,
      assignedResourceId: work.assignedResourceId,
      status: work.status,
      changeType: changeFor(view, "WORK_UNIT", work.workUnitId),
      path: geometryPath(work.geometry, baseline.displayTransform)
    }))
    .filter(work => work.path.length > 0);
  const geometryByTaskId = new Map(
    (loaded.geometryDiff?.entries ?? []).map(entry => [entry.taskId, entry])
  );
  const taskPolygons = view.tasks
    .map(task => {
      const context = geometryByTaskId.get(task.taskId);
      const currentGeometry = context?.currentGeometry ?? task.geometry;
      const currentPolygon = taskPolygon(
        {...task, geometry: currentGeometry},
        baseline.displayTransform
      );
      const originalPolygon = context?.originalGeometry === null ||
        context === undefined
        ? null
        : taskPolygon(
            {...task, geometry: context.originalGeometry},
            baseline.displayTransform
          );
      return {
        taskId: task.taskId,
        status: task.status,
        changeType: changeFor(view, "TASK", task.taskId),
        relation: context?.relation ?? "unknown" as const,
        spatialRelation: context?.spatialRelation ?? "disjoint" as const,
        overlappingTaskIds: context?.overlappingTaskIds ?? [],
        originalPolygon,
        currentPolygon,
        polygon: currentPolygon
      };
    })
    .filter(task => task.currentPolygon.length > 0);
  const taskExtensions = (loaded.geometryDiff?.entries ?? []).flatMap(entry => {
    if (entry.extensionGeometry === null) return [];
    return mapOverlayPolygons(
      entry.extensionGeometry,
      baseline.displayTransform
    ).map((polygon, index) => ({
      extensionId: `${entry.taskId}-extension-${index + 1}`,
      taskId: entry.taskId,
      polygon,
      extensionAreaM2: entry.extensionAreaM2,
      extensionRatio: entry.extensionRatio
    }));
  });

  return {
    config,
    baseline,
    view,
    decisionTrace,
    rawEvents: loaded.dynamicEvents.events,
    geometryDiff: loaded.geometryDiff,
    events: view.eventTimeline,
    primaryEvent,
    eventTimeSec: primaryEvent.eventTimeSec,
    planCommitTimeSec: view.activePlan.missionTimeSec,
    makespanSec: view.metrics.totalFinishTimeSec,
    baselinePaths,
    activePaths,
    taskPolygons,
    taskExtensions,
    workPaths,
    eventPosition: eventPosition(
      config,
      tasksById,
      resourcesById,
      baseline.displayTransform
    ),
    metricCards: buildDynamicMetricCards(view.metrics, baseline.metrics),
    failureReport,
    resourcesById,
    tasksById,
    workUnitsById
  };
}
