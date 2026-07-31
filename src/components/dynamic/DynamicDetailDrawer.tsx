import {useEffect, useRef} from "react";

import type {
  DynamicScene
} from "../../features/dynamic-replanning/buildDynamicScene";

export type DynamicDrawerContent =
  | {type: "resource"; resourceId: string}
  | {type: "task"; taskId: string}
  | {type: "segment"; segmentId: string}
  | null;

export interface DynamicDetailDrawerProps {
  scene: DynamicScene;
  content: DynamicDrawerContent;
  onClose(): void;
}

function FieldList({
  label,
  fields
}: {
  label: string;
  fields: ReadonlyArray<readonly [string, string]>;
}) {
  return (
    <dl aria-label={label}>
      {fields.map(([name, value]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DynamicDetailDrawer({
  scene,
  content,
  onClose
}: DynamicDetailDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const resource = content?.type === "resource"
    ? scene.resourcesById.get(content.resourceId)
    : undefined;
  const task = content?.type === "task"
    ? scene.tasksById.get(content.taskId)
    : undefined;
  const segment = content?.type === "segment"
    ? scene.activePaths.find(item => item.segmentId === content.segmentId)
    : undefined;
  const shouldRender = content !== null && (
    resource !== undefined ||
    task !== undefined ||
    segment !== undefined
  );

  useEffect(() => {
    if (!shouldRender) return;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    closeButtonRef.current?.focus();
    return () => {
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [shouldRender]);

  if (!shouldRender || content === null) return null;

  const title = resource !== undefined
    ? `${resource.resourceId} 资源详情`
    : task !== undefined
      ? `${task.taskId} 任务详情`
      : `${segment?.segmentId ?? ""} 航段详情`;
  const fields: ReadonlyArray<readonly [string, string]> =
    resource !== undefined
      ? [
          ["资源编号", resource.resourceId],
          ["平台类型", resource.platformClass],
          ["运行状态", resource.operationalState],
          ["剩余燃油", `${resource.remainingFuelKg.toFixed(2)} kg`],
          ["航向", `${resource.headingDeg.toFixed(1)}°`]
        ]
      : task !== undefined
        ? [
            ["任务编号", task.taskId],
            ["任务类型", task.taskType],
            ["任务状态", task.status],
            ["优先级", String(task.priority)],
            ["最低覆盖率", `${(task.minimumCoverageRatio * 100).toFixed(1)}%`]
          ]
        : segment === undefined
          ? []
          : [
              ["航段编号", segment.segmentId],
              ["航段类型", segment.segmentType],
              ["资源编号", segment.resourceId],
              ["任务编号", segment.taskId ?? "无"],
              ["变化类型", segment.changeType],
              [
                "计划时段",
                `${segment.startTimeSec.toFixed(1)}–` +
                `${segment.finishTimeSec.toFixed(1)} s`
              ]
            ];

  return (
    <aside
      className="task2-detail-drawer"
      role="dialog"
      aria-modal="false"
      aria-labelledby="task2-detail-title"
      onKeyDown={event => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header>
        <h2 id="task2-detail-title">{title}</h2>
        <button
          ref={closeButtonRef}
          type="button"
          aria-label="关闭动态详情"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <FieldList label={title} fields={fields} />
      <footer>
        <p>数据来自 mission_view.v1，可通过场景溯源文件复核。</p>
      </footer>
    </aside>
  );
}
