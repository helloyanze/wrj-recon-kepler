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
  polygon: MapPoint[];
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
  events: MissionViewV1["eventTimeline"];
  primaryEvent: MissionViewV1["eventTimeline"][number];
  eventTimeSec: number;
  planCommitTimeSec: number;
  makespanSec: number;
  baselinePaths: DynamicTimedPath[];
  activePaths: DynamicTimedPath[];
  taskPolygons: DynamicTaskPolygon[];
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
  return view.planDiff.entries.find(entry =>
    entry.elementType === elementType && entry.elementId === elementId
  )?.changeType ?? "baseline_reused";
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
  const {baseline, config, failureReport, provenance, view} = loaded;
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
  const {baseline, config, failureReport, view} = loaded;
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
      changeType: "baseline" as const,
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
      changeType: segment.changeType,
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
  const taskPolygons = view.tasks
    .map(task => ({
      taskId: task.taskId,
      status: task.status,
      changeType: changeFor(view, "TASK", task.taskId),
      polygon: taskPolygon(task, baseline.displayTransform)
    }))
    .filter(task => task.polygon.length > 0);
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

  return {
    config,
    baseline,
    view,
    events: view.eventTimeline,
    primaryEvent,
    eventTimeSec: primaryEvent.eventTimeSec,
    planCommitTimeSec: view.activePlan.missionTimeSec,
    makespanSec: view.metrics.totalFinishTimeSec,
    baselinePaths,
    activePaths,
    taskPolygons,
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
