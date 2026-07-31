export type TaskMode = "STATIC" | "DYNAMIC";

export interface TaskModeSwitchProps {
  mode: TaskMode;
  onChange(mode: TaskMode): void;
}

export function TaskModeSwitch({
  mode,
  onChange
}: TaskModeSwitchProps) {
  return (
    <div className="task-mode-switch" aria-label="任务模式">
      <button
        type="button"
        aria-pressed={mode === "STATIC"}
        onClick={() => onChange("STATIC")}
      >
        任务一 静态规划
      </button>
      <button
        type="button"
        aria-pressed={mode === "DYNAMIC"}
        onClick={() => onChange("DYNAMIC")}
      >
        任务二 动态重规划
      </button>
    </div>
  );
}
