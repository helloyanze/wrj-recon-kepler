import {cleanup, fireEvent, render, screen} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";

import {
  LayerControlRow,
  LayerLegendSwatch,
  LayerPanelHeader
} from "../../src/components/workspace/LayerControlPrimitives";

afterEach(cleanup);

describe("layer control primitives", () => {
  it("renders the panel title and forwards header actions", () => {
    const onCollapse = vi.fn();
    const onRestoreDefaults = vi.fn();
    render(
      <LayerPanelHeader
        title="图层与航迹"
        onCollapse={onCollapse}
        onRestoreDefaults={onRestoreDefaults}
      />
    );

    expect(screen.getByRole("heading", {name: "图层与航迹"}))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "恢复全部图层默认设置"}));
    fireEvent.click(screen.getByRole("button", {name: "收起图层"}));
    expect(onRestoreDefaults).toHaveBeenCalledOnce();
    expect(onCollapse).toHaveBeenCalledOnce();
  });

  it("forwards row visibility, expansion, color, width and opacity", () => {
    const onExpandedChange = vi.fn();
    const onVisibleChange = vi.fn();
    const onColorChange = vi.fn();
    const onWidthChange = vi.fn();
    const onOpacityChange = vi.fn();
    render(
      <ul>
        <LayerControlRow
          label="当前方案航迹"
          visible
          expanded
          trailing="3 条"
          legend={(
            <LayerLegendSwatch
              background="#39D98A"
              testId="active-route-swatch"
            />
          )}
          color="#39D98A"
          opacity={0.8}
          width={4}
          onExpandedChange={onExpandedChange}
          onVisibleChange={onVisibleChange}
          onColorChange={onColorChange}
          onOpacityChange={onOpacityChange}
          onWidthChange={onWidthChange}
        />
      </ul>
    );

    expect(screen.getByTestId("active-route-swatch")).toHaveStyle({
      background: "#39D98A"
    });
    expect(screen.getByText("3 条")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "隐藏 当前方案航迹"}));
    fireEvent.click(screen.getByRole("button", {name: "编辑 当前方案航迹"}));
    fireEvent.change(screen.getByLabelText("当前方案航迹 颜色"), {
      target: {value: "#112233"}
    });
    fireEvent.change(screen.getByLabelText("当前方案航迹 线宽"), {
      target: {value: "6.5"}
    });
    fireEvent.change(screen.getByLabelText("当前方案航迹 不透明度"), {
      target: {value: "0.6"}
    });

    expect(onVisibleChange).toHaveBeenCalledWith(false);
    expect(onExpandedChange).toHaveBeenCalledWith(false);
    expect(onColorChange).toHaveBeenCalledWith("#112233");
    expect(onWidthChange).toHaveBeenCalledWith(6.5);
    expect(onOpacityChange).toHaveBeenCalledWith(0.6);
  });
});
