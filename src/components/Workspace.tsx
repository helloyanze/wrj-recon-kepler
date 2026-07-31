import {useCallback, useState} from "react";

import type {
  UseDynamicSceneLibraryOptions
} from "../hooks/useDynamicSceneLibrary";
import {
  DynamicReplanningWorkspace
} from "./DynamicReplanningWorkspace";
import {
  StaticPlanningWorkspace,
  type StaticPlanningWorkspaceProps
} from "./StaticPlanningWorkspace";
import {
  TaskModeSwitch,
  type TaskMode
} from "./dynamic/TaskModeSwitch";

export interface WorkspaceProps extends StaticPlanningWorkspaceProps {
  dynamicDependencies?: Pick<UseDynamicSceneLibraryOptions, "fetcher">;
}

export function Workspace(props: WorkspaceProps) {
  const [mode, setMode] = useState<TaskMode>(() => {
    try {
      return new URLSearchParams(globalThis.location?.search)
        .get("task") === "2"
        ? "DYNAMIC"
        : "STATIC";
    } catch {
      return "STATIC";
    }
  });
  const changeMode = useCallback((next: TaskMode) => {
    setMode(next);
    try {
      const url = new URL(globalThis.location.href);
      if (next === "DYNAMIC") url.searchParams.set("task", "2");
      else url.searchParams.delete("task");
      globalThis.history.replaceState(null, "", url);
    } catch {
      // URL synchronization is optional in embedded/test environments.
    }
  }, []);
  const modeSwitch = <TaskModeSwitch mode={mode} onChange={changeMode} />;

  return mode === "STATIC"
    ? <StaticPlanningWorkspace {...props} modeSwitch={modeSwitch} />
    : (
        <DynamicReplanningWorkspace
          basemap={props.basemap}
          debugMode={props.debugMode}
          dataBase={props.dataBase}
          dependencies={props.dynamicDependencies}
          MapView={props.MapView}
          modeSwitch={modeSwitch}
        />
      );
}

export type {TaskMode};
