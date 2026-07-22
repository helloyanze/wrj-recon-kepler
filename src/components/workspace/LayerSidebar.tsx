import {useEffect, useRef, useState} from "react";
import type {UavSummary} from "../../data/caseSchema";

export type UavId = UavSummary["uavId"];

export type LayerCapability =
  | "radius"
  | "thickness"
  | "trailLength"
  | "filled"
  | "stroked";

export interface LayerDefinition {
  mode: "single" | "uav";
  capabilities: readonly LayerCapability[];
}

export interface LayerAppearance {
  color: string;
  opacity: number;
  iconSize?: number;
  radius?: number;
  thickness?: number;
  trailLength?: number;
  filled?: boolean;
  stroked?: boolean;
  uavColors?: Partial<Record<UavId, string>>;
}

export interface LayerViewModel {
  id: string;
  label: string;
  visible: boolean;
  definition: LayerDefinition;
  appearance: LayerAppearance;
}

export interface UavRosterItem {
  uavId: UavId;
  callsign: string;
  color: string;
}

export interface LayerSidebarProps {
  collapsed: boolean;
  layers: readonly LayerViewModel[];
  uavs: readonly UavRosterItem[];
  selectedUavId?: UavId | null;
  onCollapsedChange: (collapsed: boolean) => void;
  onVisibilityChange: (layerId: string, visible: boolean) => void;
  onLayerChange: (layerId: string, changes: Partial<LayerAppearance>) => void;
  onRestoreDefaults: () => void;
  onSelectUav: (uavId: UavId) => void;
}

const UAV_IDS: readonly UavId[] = ["UAV-01", "UAV-02", "UAV-03"];

function numericValue(value: string): number {
  return Number(value);
}

function nonNegativeValue(input: HTMLInputElement): number | undefined {
  const value = input.valueAsNumber;
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function defaultExpandedLayerId(layers: readonly LayerViewModel[]): string | null {
  return layers.find(({id}) => id === "wrj-routes-layer")?.id ?? layers[0]?.id ?? null;
}

function AdvancedControls({
  layer,
  onChange
}: {
  layer: LayerViewModel;
  onChange: (changes: Partial<LayerAppearance>) => void;
}) {
  const {appearance, definition, label} = layer;
  const has = (capability: LayerCapability) => definition.capabilities.includes(capability);
  const hasIconSize = layer.id === "wrj-trip-layer";

  if (definition.capabilities.length === 0 && !hasIconSize) return null;

  return (
    <fieldset>
      <legend>高级</legend>
      {has("radius") ? (
        <label>
          半径
          <input
            aria-label={`${label} 半径`}
            type="number"
            min="0"
            value={appearance.radius ?? 0}
            onChange={(event) => {
              const value = nonNegativeValue(event.currentTarget);
              if (value !== undefined) onChange({radius: value});
            }}
          />
        </label>
      ) : null}
      {has("thickness") ? (
        <label>
          线宽
          <input
            aria-label={`${label} 线宽`}
            type="number"
            min="0"
            value={appearance.thickness ?? 0}
            onChange={(event) => {
              const value = nonNegativeValue(event.currentTarget);
              if (value !== undefined) onChange({thickness: value});
            }}
          />
        </label>
      ) : null}
      {has("trailLength") ? (
        <label>
          轨迹长度
          <input
            aria-label={`${label} 轨迹长度`}
            type="number"
            min="0"
            value={appearance.trailLength ?? 0}
            onChange={(event) => {
              const value = nonNegativeValue(event.currentTarget);
              if (value !== undefined) onChange({trailLength: value});
            }}
          />
        </label>
      ) : null}
      {hasIconSize ? (
        <label>
          无人机图标大小
          <input
            aria-label={`${label} 无人机图标大小`}
            type="range"
            min="16"
            max="64"
            step="1"
            value={appearance.iconSize ?? 32}
            onChange={(event) => onChange({iconSize: numericValue(event.currentTarget.value)})}
          />
        </label>
      ) : null}
      {has("filled") ? (
        <label>
          <input
            aria-label={`${label} 填充`}
            type="checkbox"
            checked={appearance.filled ?? false}
            onChange={(event) => onChange({filled: event.currentTarget.checked})}
          />
          填充
        </label>
      ) : null}
      {has("stroked") ? (
        <label>
          <input
            aria-label={`${label} 描边`}
            type="checkbox"
            checked={appearance.stroked ?? false}
            onChange={(event) => onChange({stroked: event.currentTarget.checked})}
          />
          描边
        </label>
      ) : null}
    </fieldset>
  );
}

function legendBackground(layer: LayerViewModel): string {
  if (layer.definition.mode === "single") return layer.appearance.color;
  const colors = UAV_IDS.map((uavId) => layer.appearance.uavColors?.[uavId] ?? "#596978");
  return `linear-gradient(180deg, ${colors[0]} 0 33.33%, ${colors[1]} 33.33% 66.66%, ${colors[2]} 66.66% 100%)`;
}

function LayerEditor({
  layer,
  onChange
}: {
  layer: LayerViewModel;
  onChange: (changes: Partial<LayerAppearance>) => void;
}) {
  const {appearance, definition, label} = layer;
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const hasAdvancedControls = definition.capabilities.length > 0 || layer.id === "wrj-trip-layer";

  return (
    <section aria-label={`${label} 设置`}>
      <fieldset>
        <legend>基础</legend>
        {definition.mode === "uav" ? UAV_IDS.map((uavId) => (
          <label key={uavId}>
            {uavId} 颜色
            <input
              aria-label={`${label} ${uavId} 颜色`}
              type="color"
              value={appearance.uavColors?.[uavId] ?? "#000000"}
              onChange={(event) => onChange({
                uavColors: {
                  ...appearance.uavColors,
                  [uavId]: event.currentTarget.value
                }
              })}
            />
          </label>
        )) : (
          <label>
            颜色
            <input
              aria-label={`${label} 颜色`}
              type="color"
              value={appearance.color}
              onChange={(event) => onChange({color: event.currentTarget.value})}
            />
          </label>
        )}
        <label>
          不透明度
          <input
            aria-label={`${label} 不透明度`}
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={appearance.opacity}
            onChange={(event) => onChange({opacity: numericValue(event.currentTarget.value)})}
          />
        </label>
      </fieldset>
      {hasAdvancedControls ? (
        <div className="layer-advanced">
          <button
            type="button"
            aria-expanded={advancedOpen}
            aria-label={`${advancedOpen ? "收起" : "展开"} ${label} 高级设置`}
            onClick={() => setAdvancedOpen((open) => !open)}
          >
            <span>高级设置</span>
            <span aria-hidden="true">{advancedOpen ? "⌃" : "⌄"}</span>
          </button>
          {advancedOpen ? <AdvancedControls layer={layer} onChange={onChange} /> : null}
        </div>
      ) : null}
    </section>
  );
}

export function UavRoster({
  uavs,
  selectedUavId,
  onSelect
}: {
  uavs: readonly UavRosterItem[];
  selectedUavId?: UavId | null;
  onSelect: (uavId: UavId) => void;
}) {
  return (
    <section aria-label="无人机编队" style={{marginTop: "auto"}}>
      <ul aria-label="无人机编队">
        {uavs.map((uav) => (
          <li key={uav.uavId}>
            <button
              type="button"
              aria-label={`${uav.uavId} ${uav.callsign} 已规划`}
              aria-pressed={selectedUavId === uav.uavId}
              onClick={() => onSelect(uav.uavId)}
            >
              <i
                aria-hidden="true"
                data-testid={`uav-color-${uav.uavId}`}
                style={{
                  backgroundColor: uav.color,
                  borderRadius: "50%",
                  display: "inline-block",
                  height: 10,
                  width: 10
                }}
              />
              <span>{uav.uavId} / {uav.callsign}</span>
              <span>已规划</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function LayerSidebar({
  collapsed,
  layers,
  uavs,
  selectedUavId,
  onCollapsedChange,
  onVisibilityChange,
  onLayerChange,
  onRestoreDefaults,
  onSelectUav
}: LayerSidebarProps) {
  const userSelectedExpansion = useRef(false);
  const [expandedLayerId, setExpandedLayerId] = useState<string | null>(() => (
    defaultExpandedLayerId(layers)
  ));

  useEffect(() => {
    setExpandedLayerId((current) => {
      if (layers.length === 0) {
        userSelectedExpansion.current = false;
        return null;
      }
      const currentExists = current !== null && layers.some(({id}) => id === current);
      if (!currentExists) {
        userSelectedExpansion.current = false;
        return defaultExpandedLayerId(layers);
      }
      const preferred = defaultExpandedLayerId(layers);
      return !userSelectedExpansion.current && preferred !== null ? preferred : current;
    });
  }, [layers]);

  const toggleExpandedLayer = (layerId: string) => {
    userSelectedExpansion.current = true;
    setExpandedLayerId((current) => current === layerId ? null : layerId);
  };

  if (collapsed) {
    return (
      <aside
        aria-label="图层"
        data-collapsed="true"
        style={{width: 44}}
      >
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
      data-collapsed="false"
      style={{display: "flex", flexDirection: "column", width: 300}}
    >
      <header>
        <h2>图层</h2>
        <div>
          <button
            type="button"
            aria-label="恢复全部图层默认设置"
            onClick={onRestoreDefaults}
          >
            ↺
          </button>
          <button
            type="button"
            aria-label="收起图层"
            onClick={() => onCollapsedChange(true)}
          >
            &lt;
          </button>
        </div>
      </header>
      <ul aria-label="图层列表">
        {layers.map((layer) => {
          const expanded = expandedLayerId === layer.id;
          return (
            <li key={layer.id}>
              <div
                data-testid={`layer-row-${layer.id}`}
                onClick={() => toggleExpandedLayer(layer.id)}
              >
                <span
                  aria-hidden="true"
                  className="layer-legend-swatch"
                  data-testid={`layer-legend-${layer.id}`}
                  style={{background: legendBackground(layer)}}
                />
                <button
                  type="button"
                  aria-label={`编辑 ${layer.label}`}
                  aria-expanded={expanded}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleExpandedLayer(layer.id);
                  }}
                >
                  {layer.label}
                </button>
                <button
                  type="button"
                  aria-label={`${layer.visible ? "隐藏" : "显示"} ${layer.label}`}
                  aria-pressed={layer.visible}
                  onClick={(event) => {
                    event.stopPropagation();
                    onVisibilityChange(layer.id, !layer.visible);
                  }}
                >
                  <span aria-hidden="true">{layer.visible ? "◉" : "○"}</span>
                </button>
              </div>
              {expanded ? (
                <LayerEditor
                  layer={layer}
                  onChange={(changes) => onLayerChange(layer.id, changes)}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      <UavRoster uavs={uavs} selectedUavId={selectedUavId} onSelect={onSelectUav} />
    </aside>
  );
}
