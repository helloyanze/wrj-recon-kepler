import type {ReactNode} from "react";

export interface LayerPanelHeaderProps {
  title: string;
  disabled?: boolean;
  onCollapse(): void;
  onRestoreDefaults?(): void;
}

export function LayerPanelHeader({
  title,
  disabled = false,
  onCollapse,
  onRestoreDefaults
}: LayerPanelHeaderProps) {
  return (
    <header className="layer-panel-header">
      <h2>{title}</h2>
      <div>
        {onRestoreDefaults === undefined ? null : (
          <button
            type="button"
            title="恢复默认设置"
            disabled={disabled}
            aria-label="恢复全部图层默认设置"
            onClick={onRestoreDefaults}
          >
            <span aria-hidden="true">↺</span>
          </button>
        )}
        <button
          type="button"
          title="收起图层"
          aria-label="收起图层"
          onClick={onCollapse}
        >
          <span aria-hidden="true">&lt;</span>
        </button>
      </div>
    </header>
  );
}

export interface LayerLegendSwatchProps {
  background: string;
  testId?: string;
}

export function LayerLegendSwatch({
  background,
  testId
}: LayerLegendSwatchProps) {
  return (
    <span
      aria-hidden="true"
      className="layer-legend-swatch"
      data-testid={testId}
      style={{background}}
    />
  );
}

export interface LayerControlRowProps {
  label: string;
  visible: boolean;
  expanded: boolean;
  disabled?: boolean;
  legend: ReactNode;
  trailing?: ReactNode;
  color?: string;
  opacity?: number;
  width?: number;
  children?: ReactNode;
  testId?: string;
  onVisibleChange(visible: boolean): void;
  onExpandedChange(expanded: boolean): void;
  onColorChange?(color: string): void;
  onOpacityChange?(opacity: number): void;
  onWidthChange?(width: number): void;
}

function numberValue(input: HTMLInputElement): number | null {
  const value = input.valueAsNumber;
  return Number.isFinite(value) ? value : null;
}

export function LayerControlRow({
  label,
  visible,
  expanded,
  disabled = false,
  legend,
  trailing,
  color,
  opacity,
  width,
  children,
  testId,
  onVisibleChange,
  onExpandedChange,
  onColorChange,
  onOpacityChange,
  onWidthChange
}: LayerControlRowProps) {
  return (
    <li className="layer-control-row">
      <div
        data-testid={testId}
        onClick={() => onExpandedChange(!expanded)}
      >
        {legend}
        <button
          type="button"
          aria-label={`编辑 ${label}`}
          aria-expanded={expanded}
          disabled={disabled}
          onClick={event => {
            event.stopPropagation();
            onExpandedChange(!expanded);
          }}
        >
          {label}
        </button>
        {trailing === undefined ? null : (
          <span className="layer-control-trailing">{trailing}</span>
        )}
        <button
          type="button"
          disabled={disabled}
          aria-label={`${visible ? "隐藏" : "显示"} ${label}`}
          aria-pressed={visible}
          onClick={event => {
            event.stopPropagation();
            onVisibleChange(!visible);
          }}
        >
          <span aria-hidden="true">{visible ? "◉" : "○"}</span>
        </button>
      </div>
      {expanded ? (
        <div className="layer-control-editor">
          {color === undefined || onColorChange === undefined ? null : (
            <label>
              {label} 颜色
              <input
                aria-label={`${label} 颜色`}
                type="color"
                value={color}
                disabled={disabled}
                onChange={event => onColorChange(event.currentTarget.value)}
              />
            </label>
          )}
          {opacity === undefined || onOpacityChange === undefined ? null : (
            <label>
              不透明度
              <input
                aria-label={`${label} 不透明度`}
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={opacity}
                disabled={disabled}
                onChange={event => {
                  const value = numberValue(event.currentTarget);
                  if (value !== null) onOpacityChange(value);
                }}
              />
            </label>
          )}
          {width === undefined || onWidthChange === undefined ? null : (
            <label>
              线宽
              <span className="layer-range-input">
                <input
                  aria-label={`${label} 线宽`}
                  type="range"
                  min="0.5"
                  max="20"
                  step="0.5"
                  value={width}
                  disabled={disabled}
                  onChange={event => {
                    const value = numberValue(event.currentTarget);
                    if (value !== null) onWidthChange(value);
                  }}
                />
                <output aria-label={`${label} 线宽值`}>{width} px</output>
              </span>
            </label>
          )}
          {children}
        </div>
      ) : null}
    </li>
  );
}
