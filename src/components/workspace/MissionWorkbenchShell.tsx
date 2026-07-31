import type {ReactNode} from "react";

interface MissionWorkbenchFrameProps {
  className?: string;
  children: ReactNode;
}

interface MissionWorkbenchSlotsProps {
  className?: string;
  modeSwitch?: ReactNode;
  title: string;
  sourceSelector?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  sidebar: ReactNode;
  sidebarClassName?: string;
  sidebarCollapsed?: boolean;
  map: ReactNode;
  mapOverlays?: ReactNode;
  timeline: ReactNode;
  rightPanel?: ReactNode;
  dialogs?: ReactNode;
  children?: never;
}

export type MissionWorkbenchShellProps =
  | MissionWorkbenchFrameProps
  | MissionWorkbenchSlotsProps;

export function MissionWorkbenchShell(
  props: MissionWorkbenchShellProps
) {
  if ("children" in props && props.children !== undefined) {
    return (
      <main
        className={`workspace mission-workbench ${props.className ?? ""}`.trim()}
      >
        {props.children}
      </main>
    );
  }
  const {
    className = "",
  modeSwitch,
  title,
  sourceSelector,
  status,
  actions,
  sidebar,
  sidebarClassName = "",
  sidebarCollapsed = false,
  map,
  mapOverlays,
  timeline,
  rightPanel,
    dialogs
  } = props as MissionWorkbenchSlotsProps;
  return (
    <main className={`workspace mission-workbench ${className}`.trim()}>
      <header className="topbar mission-workbench__topbar">
        {modeSwitch}
        <div className="brand">
          <span>WRJ</span>
          <strong>{title}</strong>
        </div>
        {sourceSelector}
        {status}
        {actions === undefined
          ? null
          : <div className="top-actions">{actions}</div>}
      </header>
      <section
        className={[
          "workspace-body",
          "mission-workbench__body",
          sidebarCollapsed ? "sidebar-collapsed" : "",
          rightPanel === undefined ? "" : "has-right-panel"
        ].filter(Boolean).join(" ")}
      >
        <div className={`sidebar-shell ${sidebarClassName}`.trim()}>
          {sidebar}
        </div>
        <section className="map-panel mission-workbench__map">
          {map}
          {mapOverlays}
          {timeline}
        </section>
        {rightPanel === undefined ? null : (
          <aside
            className="mission-workbench__decision-panel"
            aria-label="决策过程"
          >
            {rightPanel}
          </aside>
        )}
      </section>
      {dialogs}
    </main>
  );
}
