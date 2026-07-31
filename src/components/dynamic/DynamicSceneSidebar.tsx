import type {
  DynamicScene
} from "../../features/dynamic-replanning/buildDynamicScene";
import type {
  DynamicPlaybackPhase
} from "../../features/dynamic-replanning/dynamicPlayback";

const PHASES: ReadonlyArray<readonly [DynamicPlaybackPhase, string]> = [
  ["READY", "等待播放"],
  ["BASELINE_RUNNING", "原计划执行"],
  ["EVENT_ALERT", "事件告警"],
  ["IMPACT_REVEAL", "影响范围"],
  ["REPLAN_EXPLAINER", "重规划说明"],
  ["PLAN_TRANSITION", "方案切换"],
  ["ACTIVE_PLAN_RUNNING", "新方案执行"],
  ["RESULT_HOLD", "结果保持"]
];

export interface DynamicSceneSidebarProps {
  scene: DynamicScene;
  phase: DynamicPlaybackPhase;
  onSelectResource?(resourceId: string): void;
  onSelectTask?(taskId: string): void;
}

export function DynamicSceneSidebar({
  scene,
  phase,
  onSelectResource,
  onSelectTask
}: DynamicSceneSidebarProps) {
  return (
    <aside className="task2-sidebar" aria-label="动态场景说明">
      <header>
        <h1>{scene.config.displayName}</h1>
        <p>{scene.config.summary}</p>
      </header>
      <ol aria-label="动态演示阶段">
        {PHASES.map(([id, label]) => (
          <li key={id} aria-current={phase === id ? "step" : undefined}>
            <span aria-hidden="true">{phase === id ? "▶" : "○"}</span>
            {label}
          </li>
        ))}
      </ol>
      <section>
        <h2>资源</h2>
        <ul>
          {scene.view.resources.map(resource => (
            <li key={resource.resourceId}>
              <button
                type="button"
                onClick={() => onSelectResource?.(resource.resourceId)}
              >
                <span aria-hidden="true">▲</span>
                {resource.resourceId} · {resource.operationalState}
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2>任务</h2>
        <ul>
          {scene.view.tasks.map(task => (
            <li key={task.taskId}>
              <button
                type="button"
                onClick={() => onSelectTask?.(task.taskId)}
              >
                <span aria-hidden="true">▧</span>
                {task.taskId} · {task.status}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
