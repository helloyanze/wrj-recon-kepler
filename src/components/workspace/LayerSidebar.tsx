import {useMemo, useState} from "react";
import type {CaseBundleV2, NormalizedSortie} from "../../features/cases/caseBundle";
import type {
  LayerUavColorId,
  MissionLayerId,
  MissionLayerPreference,
  MissionLayerPreferencesV3
} from "../../features/mission/missionLayerPreferences";
import type {
  LiveSortieState,
  SortieStatus
} from "../../features/mission/missionInterpolation";
import {
  LayerControlRow,
  LayerLegendSwatch,
  LayerPanelHeader
} from "./LayerControlPrimitives";

export type UavId = string;

export interface LayerSidebarProps {
  bundle: CaseBundleV2 | null;
  preferences: MissionLayerPreferencesV3 | null;
  liveSorties: readonly LiveSortieState[];
  loading: boolean;
  collapsed: boolean;
  selectedUavId?: string | null;
  selectedSortieId?: string | null;
  onCollapsedChange: (collapsed: boolean) => void;
  onLayerChange: (
    layerId: MissionLayerId,
    changes: Partial<MissionLayerPreference>
  ) => void;
  onStripColorChange: (stripId: string, color: string) => void;
  onLayerUavColorChange: (
    layerId: LayerUavColorId,
    uavId: string,
    color: string
  ) => void;
  onMarkerSizeChange: (size: number) => void;
  onRestoreDefaults: () => void;
  onSelectUav: (uavId: string) => void;
  onSelectSortie: (assignmentId: string) => void;
}

interface LayerDefinition {
  id: MissionLayerId;
  label: string;
  mode: "single" | "strip" | "uav";
  colorLayer?: LayerUavColorId;
}

const LAYERS: readonly LayerDefinition[] = [
  {id: "region", label: "算法任务区", mode: "single"},
  {id: "strips", label: "侦察条带", mode: "strip"},
  {id: "scanned", label: "已扫描区域", mode: "uav", colorLayer: "scanned"},
  {id: "routes", label: "静态规划航迹", mode: "uav", colorLayer: "routes"},
  {id: "trips", label: "动态飞行尾迹", mode: "uav", colorLayer: "trips"}
];

const STATUS_LABELS: Readonly<Record<SortieStatus, string>> = {
  waiting: "待起飞",
  flying: "飞行中",
  landed: "已降落",
  completed: "已完成"
};

const STATUS_PRIORITY: Readonly<Record<SortieStatus, number>> = {
  completed: 0,
  waiting: 1,
  landed: 2,
  flying: 3
};

function numberValue(input: HTMLInputElement): number | null {
  const value = input.valueAsNumber;
  return Number.isFinite(value) ? value : null;
}

function liveStatus(
  liveByAssignment: ReadonlyMap<string, LiveSortieState>,
  assignmentId: string
): SortieStatus {
  return liveByAssignment.get(assignmentId)?.status ?? "waiting";
}

function aggregateStatus(
  sorties: readonly NormalizedSortie[],
  liveByAssignment: ReadonlyMap<string, LiveSortieState>
): SortieStatus {
  return sorties.reduce<SortieStatus>((result, sortie) => {
    const status = liveStatus(liveByAssignment, sortie.assignmentId);
    return STATUS_PRIORITY[status] > STATUS_PRIORITY[result] ? status : result;
  }, "completed");
}

function layerLegendBackground(
  definition: LayerDefinition,
  preferences: MissionLayerPreferencesV3
): string {
  const colors = definition.mode === "strip"
    ? Object.values(preferences.stripColors)
    : definition.colorLayer === undefined
      ? ["#35C5FF"]
      : Object.values(preferences.layerUavColors[definition.colorLayer]);
  const background = colors.length <= 1
    ? colors[0] ?? "#35C5FF"
    : `linear-gradient(180deg, ${colors.join(", ")})`;
  return background;
}

function groupStripsByUav(
  strips: readonly CaseBundleV2["strips"][number][]
): Array<[string, CaseBundleV2["strips"]]> {
  const groups = new Map<string, CaseBundleV2["strips"]>();
  for (const strip of strips) {
    const group = groups.get(strip.uavId) ?? [];
    group.push(strip);
    groups.set(strip.uavId, group);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([uavId, group]) => [
      uavId,
      [...group].sort((left, right) => (
        left.index - right.index || left.stripId.localeCompare(right.stripId)
      ))
    ]);
}

function LayerEditor({
  definition,
  preference,
  preferences,
  bundle,
  disabled,
  onLayerChange,
  onStripColorChange,
  onLayerUavColorChange,
  onMarkerSizeChange
}: {
  definition: LayerDefinition;
  preference: MissionLayerPreference;
  preferences: MissionLayerPreferencesV3;
  bundle: CaseBundleV2 | null;
  disabled: boolean;
  onLayerChange: LayerSidebarProps["onLayerChange"];
  onStripColorChange: LayerSidebarProps["onStripColorChange"];
  onLayerUavColorChange: LayerSidebarProps["onLayerUavColorChange"];
  onMarkerSizeChange: LayerSidebarProps["onMarkerSizeChange"];
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const isRegion = definition.id === "region";
  const isTrip = definition.id === "trips";

  return (
    <section aria-label={`${definition.label} 设置`}>
      {definition.mode === "single" ? null : (
        <fieldset disabled={disabled}>
          <legend>基础</legend>
          {definition.mode === "strip" ? (
            <div style={{maxHeight: 220, overflowY: "auto"}}>
              {groupStripsByUav(bundle?.strips ?? []).map(([uavId, strips]) => (
                <section key={uavId} aria-label={`${uavId} 侦察条带颜色`}>
                  <strong>{uavId}</strong>
                  {strips.map(strip => (
                    <label key={strip.stripId}>
                      {strip.stripId} 颜色
                      <input
                        aria-label={`${definition.label} ${strip.stripId} 颜色`}
                        type="color"
                        value={preferences.stripColors[strip.stripId] ?? "#FFFFFF"}
                        onChange={event => onStripColorChange(
                          strip.stripId,
                          event.currentTarget.value
                        )}
                      />
                    </label>
                  ))}
                </section>
              ))}
            </div>
          ) : null}
          {definition.mode === "uav" && definition.colorLayer !== undefined
            ? Object.entries(
                preferences.layerUavColors[definition.colorLayer]
              ).map(([uavId, color]) => (
                <label key={uavId}>
                  {uavId} 颜色
                  <input
                    aria-label={`${definition.label} ${uavId} 颜色`}
                    type="color"
                    value={color}
                    onChange={event => onLayerUavColorChange(
                      definition.colorLayer!,
                      uavId,
                      event.currentTarget.value
                    )}
                  />
                </label>
              ))
            : null}
        </fieldset>
      )}

      {isRegion || isTrip ? (
        <div className="layer-advanced">
          <button
            type="button"
            disabled={disabled}
            aria-expanded={advancedOpen}
            aria-label={`${advancedOpen ? "收起" : "展开"} ${definition.label} 高级设置`}
            onClick={() => setAdvancedOpen(open => !open)}
          >
            <span>高级设置</span>
            <span aria-hidden="true">{advancedOpen ? "⌃" : "⌄"}</span>
          </button>
          {advancedOpen ? (
            <fieldset disabled={disabled}>
              <legend>高级</legend>
              {isRegion ? (
                <>
                  <label>
                    <input
                      aria-label={`${definition.label} 填充`}
                      type="checkbox"
                      checked={preference.filled ?? true}
                      onChange={event => onLayerChange(definition.id, {
                        filled: event.currentTarget.checked
                      })}
                    />
                    填充
                  </label>
                  <label>
                    <input
                      aria-label={`${definition.label} 描边`}
                      type="checkbox"
                      checked={preference.stroked ?? true}
                      onChange={event => onLayerChange(definition.id, {
                        stroked: event.currentTarget.checked
                      })}
                    />
                    描边
                  </label>
                </>
              ) : null}
              {isTrip ? (
                <>
                  <label>
                    轨迹长度
                    <input
                      aria-label={`${definition.label} 轨迹长度`}
                      type="number"
                      min="0"
                      max="3600"
                      step="1"
                      value={preference.trailLengthSec ?? 240}
                      onChange={event => {
                        const value = numberValue(event.currentTarget);
                        if (value !== null && value >= 0) {
                          onLayerChange(definition.id, {trailLengthSec: value});
                        }
                      }}
                    />
                  </label>
                  <label>
                    无人机图标大小
                    <input
                      aria-label={`${definition.label} 无人机图标大小`}
                      type="range"
                      min="16"
                      max="64"
                      step="1"
                      value={preferences.markerSize}
                      onChange={event => {
                        const value = numberValue(event.currentTarget);
                        if (value !== null) onMarkerSizeChange(value);
                      }}
                    />
                  </label>
                  {Object.entries(preferences.layerUavColors.markers)
                    .map(([uavId, color]) => (
                      <label key={uavId}>
                        {uavId} 图标颜色
                        <input
                          aria-label={`无人机图标 ${uavId} 颜色`}
                          type="color"
                          value={color}
                          onChange={event => onLayerUavColorChange(
                            "markers",
                            uavId,
                            event.currentTarget.value
                          )}
                        />
                      </label>
                    ))}
                </>
              ) : null}
            </fieldset>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function UavMissionRoster({
  bundle,
  preferences,
  liveSorties,
  selectedUavId,
  selectedSortieId,
  disabled,
  onSelectUav,
  onSelectSortie
}: Pick<
  LayerSidebarProps,
  | "bundle"
  | "preferences"
  | "liveSorties"
  | "selectedUavId"
  | "selectedSortieId"
  | "onSelectUav"
  | "onSelectSortie"
> & {disabled: boolean}) {
  const liveByAssignment = useMemo(
    () => new Map(liveSorties.map(item => [item.assignmentId, item])),
    [liveSorties]
  );
  const groups = useMemo(() => {
    const grouped = new Map<string, NormalizedSortie[]>();
    for (const sortie of bundle?.sorties ?? []) {
      const current = grouped.get(sortie.uavId) ?? [];
      current.push(sortie);
      grouped.set(sortie.uavId, current);
    }
    return [...grouped.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([uavId, items]) => ({
        uavId,
        sorties: items.sort((left, right) => (
          left.plannedLaunchTimeSec - right.plannedLaunchTimeSec
          || left.assignmentId.localeCompare(right.assignmentId)
        ))
      }));
  }, [bundle]);

  return (
    <section aria-label="无人机任务" style={{marginTop: "auto"}}>
      <ul aria-label="无人机任务">
        {groups.map(group => {
          const status = aggregateStatus(group.sorties, liveByAssignment);
          return (
            <li key={group.uavId} data-testid={`uav-group-${group.uavId}`}>
              <button
                type="button"
                disabled={disabled}
                aria-label={`无人机 ${group.uavId} ${STATUS_LABELS[status]}`}
                aria-pressed={selectedUavId === group.uavId}
                onClick={() => onSelectUav(group.uavId)}
              >
                <i
                  aria-hidden="true"
                  data-testid={`uav-color-${group.uavId}`}
                  style={{
                    backgroundColor:
                      preferences?.layerUavColors.markers[group.uavId]
                      ?? "#FFFFFF",
                    borderRadius: "50%",
                    display: "inline-block",
                    height: 10,
                    width: 10
                  }}
                />
                <span>{group.uavId}</span>
                <span>{STATUS_LABELS[status]}</span>
              </button>
              <ul aria-label={`${group.uavId} 架次`}>
                {group.sorties.map(sortie => {
                  const sortieStatus = liveStatus(liveByAssignment, sortie.assignmentId);
                  return (
                    <li key={sortie.assignmentId}>
                      <button
                        type="button"
                        disabled={disabled}
                        aria-label={`架次 ${sortie.assignmentId} ${STATUS_LABELS[sortieStatus]}`}
                        aria-pressed={selectedSortieId === sortie.assignmentId}
                        onClick={() => onSelectSortie(sortie.assignmentId)}
                      >
                        <span>{sortie.assignmentId}</span>
                        <span>{STATUS_LABELS[sortieStatus]}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function LayerSidebar({
  bundle,
  preferences,
  liveSorties,
  loading,
  collapsed,
  selectedUavId,
  selectedSortieId,
  onCollapsedChange,
  onLayerChange,
  onStripColorChange,
  onLayerUavColorChange,
  onMarkerSizeChange,
  onRestoreDefaults,
  onSelectUav,
  onSelectSortie
}: LayerSidebarProps) {
  const [expandedLayerId, setExpandedLayerId] = useState<MissionLayerId>("routes");
  const disabled = loading || preferences === null;

  if (collapsed) {
    return (
      <aside aria-label="图层" data-collapsed="true" style={{width: 44}}>
        <button
          type="button"
          aria-label="展开图层"
          onClick={() => onCollapsedChange(false)}
        >
          &gt;
        </button>
      </aside>
    );
  }

  return (
    <aside
      aria-label="图层"
      aria-busy={loading}
      data-collapsed="false"
      style={{display: "flex", flexDirection: "column", width: 300}}
    >
      <LayerPanelHeader
        title="图层"
        disabled={disabled}
        onRestoreDefaults={onRestoreDefaults}
        onCollapse={() => onCollapsedChange(true)}
      />
      <ul aria-label="图层列表">
        {LAYERS.map(definition => {
          const preference = preferences?.layers[definition.id];
          const expanded = expandedLayerId === definition.id;
          const hasWidth = definition.id !== "region" &&
            definition.id !== "scanned";
          return (
            <LayerControlRow
              key={definition.id}
              label={definition.label}
              visible={preference?.visible ?? false}
              expanded={expanded}
              disabled={disabled}
              testId={`layer-row-${definition.id}`}
              legend={(
                <LayerLegendSwatch
                  background={preferences === null
                    ? "#35C5FF"
                    : layerLegendBackground(definition, preferences)}
                  testId={`layer-legend-${definition.id}`}
                />
              )}
              opacity={preference?.opacity}
              width={preference !== undefined && hasWidth
                ? preference.width ?? 2
                : undefined}
              onExpandedChange={() => setExpandedLayerId(definition.id)}
              onVisibleChange={visible => {
                if (preference !== undefined) {
                  onLayerChange(definition.id, {visible});
                }
              }}
              onOpacityChange={opacity =>
                onLayerChange(definition.id, {opacity})}
              onWidthChange={hasWidth
                ? width => onLayerChange(definition.id, {width})
                : undefined}
            >
              {preference !== undefined && preferences !== null ? (
                <LayerEditor
                  definition={definition}
                  preference={preference}
                  preferences={preferences}
                  bundle={bundle}
                  disabled={disabled}
                  onLayerChange={onLayerChange}
                  onStripColorChange={onStripColorChange}
                  onLayerUavColorChange={onLayerUavColorChange}
                  onMarkerSizeChange={onMarkerSizeChange}
                />
              ) : null}
            </LayerControlRow>
          );
        })}
      </ul>
      <UavMissionRoster
        bundle={bundle}
        preferences={preferences}
        liveSorties={liveSorties}
        selectedUavId={selectedUavId}
        selectedSortieId={selectedSortieId}
        disabled={disabled}
        onSelectUav={onSelectUav}
        onSelectSortie={onSelectSortie}
      />
    </aside>
  );
}
