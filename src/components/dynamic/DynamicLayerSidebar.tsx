import {useMemo, useState} from "react";

import type {
  DynamicPathChangeType,
  DynamicScene
} from "../../features/dynamic-replanning/buildDynamicScene";
import {
  type DynamicLayerId,
  type DynamicLayerPreferencesV1
} from "../../features/dynamic-replanning/dynamicLayerPreferences";
import type {
  DynamicPlaybackState
} from "../../features/dynamic-replanning/dynamicPlayback";
import {
  LayerControlRow,
  LayerLegendSwatch,
  LayerPanelHeader
} from "../workspace/LayerControlPrimitives";

const LAYERS: ReadonlyArray<readonly [DynamicLayerId, string]> = [
  ["taskAreas", "任务区域"],
  ["baselineRoutes", "原计划航迹"],
  ["activeRoutes", "当前方案航迹"],
  ["workUnits", "受影响对象"],
  ["resources", "无人机位置"],
  ["event", "事件位置"]
];

const CHANGE_TYPE_ORDER = [
  "baseline",
  "baseline_flown",
  "baseline_locked",
  "baseline_reused",
  "dynamic_modified",
  "dynamic_new",
  "dynamic_cancelled"
] as const satisfies readonly DynamicPathChangeType[];

const CHANGE_TYPE_LABELS: Readonly<Record<DynamicPathChangeType, string>> = {
  baseline: "原计划",
  baseline_flown: "已执行航段",
  baseline_locked: "锁定航段",
  baseline_reused: "沿用航段",
  dynamic_modified: "调整航段",
  dynamic_new: "新增航段",
  dynamic_cancelled: "取消航段"
};

export interface DynamicLayerSidebarProps {
  scene: DynamicScene;
  playback: DynamicPlaybackState;
  preferences: DynamicLayerPreferencesV1;
  onChange(next: DynamicLayerPreferencesV1): void;
  onRestoreDefaults(): void;
  onCollapse(): void;
}

function resourceLabel(resourceId: string): string {
  const match = /^UAV-(\d+)$/iu.exec(resourceId);
  if (match === null) return resourceId;
  const number = match[1].replace(/^0+(?=\d)/u, "");
  return `${number}号无人机`;
}

function gradient(colors: readonly string[], fallback: string): string {
  if (colors.length === 0) return fallback;
  if (colors.length === 1) return colors[0];
  return `linear-gradient(180deg, ${colors.join(", ")})`;
}

export function DynamicLayerSidebar({
  scene,
  preferences,
  onChange,
  onRestoreDefaults,
  onCollapse
}: DynamicLayerSidebarProps) {
  const [expandedLayerId, setExpandedLayerId] =
    useState<DynamicLayerId | null>(null);
  const presentChangeTypes = useMemo(() => {
    const present = new Set([
      ...scene.baselinePaths,
      ...scene.activePaths
    ].map(path => path.changeType));
    return CHANGE_TYPE_ORDER.filter(changeType => present.has(changeType));
  }, [scene.activePaths, scene.baselinePaths]);

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
  const changeColor = (id: string, color: string) => onChange({
    ...preferences,
    changeColors: {
      ...preferences.changeColors,
      [id]: color.toUpperCase()
    }
  });
  const changeResourceColor = (id: string, color: string) => onChange({
    ...preferences,
    resourceColors: {
      ...preferences.resourceColors,
      [id]: color.toUpperCase()
    }
  });
  const routeLegend = preferences.colorMode === "change"
    ? gradient(
        presentChangeTypes.map(id => preferences.changeColors[id]),
        preferences.changeColors.baseline
      )
    : gradient(
        Object.values(preferences.resourceColors),
        preferences.changeColors.baseline
      );

  return (
    <aside
      className="task2-layer-sidebar"
      aria-label="图层"
      data-collapsed="false"
    >
      <LayerPanelHeader
        title="图层与航迹"
        onRestoreDefaults={onRestoreDefaults}
        onCollapse={onCollapse}
      />
      <ul aria-label="图层列表">
        {LAYERS.map(([id, label]) => {
          const layer = preferences.layers[id];
          const expanded = expandedLayerId === id;
          const hasWidth = id === "baselineRoutes" ||
            id === "activeRoutes" || id === "workUnits";
          const legend = id === "activeRoutes"
            ? routeLegend
            : id === "baselineRoutes"
              ? preferences.changeColors.baseline
              : id === "resources"
                ? gradient(
                    Object.values(preferences.resourceColors),
                    preferences.changeColors.dynamic_new
                  )
                : preferences.changeColors.dynamic_modified;
          return (
            <LayerControlRow
              key={id}
              label={label}
              visible={layer.visible}
              expanded={expanded}
              legend={<LayerLegendSwatch background={legend} />}
              opacity={layer.opacity}
              width={hasWidth ? layer.width ?? 2 : undefined}
              onExpandedChange={next => setExpandedLayerId(next ? id : null)}
              onVisibleChange={visible => changeLayer(id, {visible})}
              onOpacityChange={opacity => changeLayer(id, {opacity})}
              onWidthChange={hasWidth
                ? width => changeLayer(id, {width})
                : undefined}
            >
              {id !== "activeRoutes" ? null : (
                <fieldset className="task2-route-colors">
                  <legend className="sr-only">当前方案航迹颜色</legend>
                  <div
                    className="task2-color-mode"
                    role="group"
                    aria-label="航迹颜色方式"
                  >
                    <button
                      type="button"
                      aria-pressed={preferences.colorMode === "change"}
                      onClick={() => onChange({
                        ...preferences,
                        colorMode: "change"
                      })}
                    >
                      按变化类型
                    </button>
                    <button
                      type="button"
                      aria-pressed={preferences.colorMode === "resource"}
                      onClick={() => onChange({
                        ...preferences,
                        colorMode: "resource"
                      })}
                    >
                      按无人机
                    </button>
                  </div>
                  <div className="task2-route-palette">
                    {preferences.colorMode === "change"
                      ? presentChangeTypes.map(id => (
                          <label key={id}>
                            <span>{CHANGE_TYPE_LABELS[id]}</span>
                            <input
                              aria-label={`${CHANGE_TYPE_LABELS[id]} 颜色`}
                              type="color"
                              value={preferences.changeColors[id]}
                              onChange={event => changeColor(
                                id,
                                event.currentTarget.value
                              )}
                            />
                          </label>
                        ))
                      : Object.entries(preferences.resourceColors)
                          .map(([id, color]) => (
                            <label key={id}>
                              <span title={id}>{resourceLabel(id)}</span>
                              <input
                                aria-label={`${resourceLabel(id)} 颜色`}
                                title={id}
                                type="color"
                                value={color}
                                onChange={event => changeResourceColor(
                                  id,
                                  event.currentTarget.value
                                )}
                              />
                            </label>
                          ))}
                  </div>
                </fieldset>
              )}
            </LayerControlRow>
          );
        })}
      </ul>
    </aside>
  );
}
