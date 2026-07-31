import type {MapPoint} from "../cases/caseBundle";
import {
  mapStateForPoints,
  type CaseMapState
} from "../mission/caseMapState";
import type {DynamicScene} from "./buildDynamicScene";

export function dynamicSceneMapState(scene: DynamicScene): CaseMapState {
  const baselineTasks = scene.taskPolygons.filter(
    task => task.changeType !== "dynamic_new"
  );
  const taskPolygons = baselineTasks.length > 0
    ? baselineTasks
    : scene.taskPolygons;
  const points: MapPoint[] = [
    ...taskPolygons.flatMap(task => task.polygon),
    ...scene.workPaths
      .filter(work => work.changeType !== "dynamic_new")
      .flatMap(work => work.path)
  ];
  return mapStateForPoints(points, [
    scene.baseline.displayTransform.anchorLongitude,
    scene.baseline.displayTransform.anchorLatitude
  ]);
}
