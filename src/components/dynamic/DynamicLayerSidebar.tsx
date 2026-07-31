import type {
  DynamicScene
} from "../../features/dynamic-replanning/buildDynamicScene";
import {
  DEFAULT_CHANGE_COLORS,
  type DynamicLayerId,
  type DynamicLayerPreferencesV1
} from "../../features/dynamic-replanning/dynamicLayerPreferences";
import {
  isPlanPublished
} from "../../features/dynamic-replanning/decisionPresentation";
import {
  selectDynamicResourceStates
} from "../../features/dynamic-replanning/dynamicInterpolation";
import type {
  DynamicPlaybackState
} from "../../features/dynamic-replanning/dynamicPlayback";

const LAYERS: ReadonlyArray<readonly [DynamicLayerId, string]> = [
  ["taskAreas", "任务区域"],
  ["workUnits", "工作单元"],
  ["baselineRoutes", "原计划航迹"],
  ["activeRoutes", "动态航迹"],
  ["resources", "无人机位置"],
  ["event", "事件位置"]
];

export interface DynamicLayerSidebarProps {
  scene: DynamicScene;
  playback: DynamicPlaybackState;
  preferences: DynamicLayerPreferencesV1;
  onChange(next: DynamicLayerPreferencesV1): void;
  onRestoreDefaults(): void;
  onSelectResource?(resourceId: string): void;
  onSelectTask?(taskId: string): void;
}

export function DynamicLayerSidebar({
  scene,
  playback,
  preferences,
  onChange,
  onRestoreDefaults,
  onSelectResource,
  onSelectTask
}: DynamicLayerSidebarProps) {
  const published = isPlanPublished(playback);
  const resources = selectDynamicResourceStates(scene, playback);
  const tasks = scene.taskPolygons.filter(
    task => published || task.changeType !== "dynamic_new"
  );
  const changeLayer = (
    id: DynamicLayerId,
    changes: Partial<DynamicLayerPreferencesV1["layers"][DynamicLayerId]>
  ) => onChange({
    ...preferences,
    layers: {
      ...preferences.layers,
      [id]: {...preferences.layers[id], ...changes}
    }
  });
  return (
    <aside className="task2-layer-sidebar" aria-label="图层">
      <header>
        <div>
          <h1>{scene.config.displayName}</h1>
          <p>{scene.config.summary}</p>
        </div>
        <button type="button" onClick={onRestoreDefaults} aria-label="恢复图层默认值">
          ↺
        </button>
      </header>
      <section>
        <h2>图层</h2>
        <ul>
          {LAYERS.map(([id, label]) => {
            const layer = preferences.layers[id];
            return (
              <li key={id}>
                <label>
                  <input
                    type="checkbox"
                    checked={layer.visible}
                    onChange={event => changeLayer(id, {
                      visible: event.currentTarget.checked
                    })}
                  />
                  <span>{label}</span>
                </label>
                <input
                  aria-label={`${label}透明度`}
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={layer.opacity}
                  onChange={event => changeLayer(id, {
                    opacity: Number(event.currentTarget.value)
                  })}
                />
              </li>
            );
          })}
        </ul>
      </section>
      <section>
        <h2>颜色方式</h2>
        <div className="task2-color-mode" role="group" aria-label="航迹颜色方式">
          <button
            type="button"
            aria-pressed={preferences.colorMode === "change"}
            onClick={() => onChange({...preferences, colorMode: "change"})}
          >
            按变化类型
          </button>
          <button
            type="button"
            aria-pressed={preferences.colorMode === "resource"}
            onClick={() => onChange({...preferences, colorMode: "resource"})}
          >
            按无人机
          </button>
        </div>
        <div className="task2-palette">
          {preferences.colorMode === "change"
            ? Object.keys(DEFAULT_CHANGE_COLORS).map(id => (
                <label key={id}>
                  <span>{id}</span>
                  <input
                    type="color"
                    value={preferences.changeColors[id]}
                    onChange={event => onChange({
                      ...preferences,
                      changeColors: {
                        ...preferences.changeColors,
                        [id]: event.currentTarget.value.toUpperCase()
                      }
                    })}
                  />
                </label>
              ))
            : Object.entries(preferences.resourceColors).map(([id, color]) => (
                <label key={id}>
                  <span>{id}</span>
                  <input
                    type="color"
                    value={color}
                    onChange={event => onChange({
                      ...preferences,
                      resourceColors: {
                        ...preferences.resourceColors,
                        [id]: event.currentTarget.value.toUpperCase()
                      }
                    })}
                  />
                </label>
              ))}
        </div>
      </section>
      <section>
        <h2>资源</h2>
        <ul className="task2-object-list">
          {resources.map(resource => (
            <li key={resource.resourceId}>
              <button
                type="button"
                onClick={() => onSelectResource?.(resource.resourceId)}
              >
                {resource.resourceId}
                <span>{resource.operationalState}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2>任务</h2>
        <ul className="task2-object-list">
          {tasks.map(task => (
            <li key={task.taskId}>
              <button type="button" onClick={() => onSelectTask?.(task.taskId)}>
                {task.taskId}
                <span>{published ? task.status : "原计划"}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
