import {useState} from "react";
import {cleanup, fireEvent, render, screen, within} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";
import {
  LayerSidebar,
  type LayerSidebarProps,
  type LayerViewModel
} from "../src/components/workspace/LayerSidebar";
import {
  DetailDrawer,
  type DrawerContent
} from "../src/components/workspace/DetailDrawer";
import type {CaseSummary} from "../src/data/caseSchema";

afterEach(cleanup);

const layerNames = [
  "真实公开地理点",
  "真实地理对象",
  "模拟任务区域",
  "模拟侦察条带",
  "模拟规划航迹",
  "模拟 Trip"
] as const;

const layerIds = [
  "layer-1",
  "layer-2",
  "layer-3",
  "wrj-strips-layer",
  "wrj-routes-layer",
  "wrj-trip-layer"
] as const;

function makeLayers(): LayerViewModel[] {
  return layerNames.map((label, index) => ({
    id: layerIds[index],
    label,
    visible: index !== 1,
    definition: {
      mode: index >= 3 ? "uav" : "single",
      capabilities: index === 0
        ? ["radius", "filled"]
        : index === 3 || index === 4
          ? ["thickness"]
          : index === 5
            ? ["thickness", "trailLength"]
            : []
    },
    appearance: {
      color: "#123456",
      opacity: 0.7,
      radius: 8,
      thickness: 3,
      trailLength: 120,
      filled: true,
      stroked: false,
      iconSize: index === 5 ? 32 : undefined,
      uavColors: {
        "UAV-01": "#ff0000",
        "UAV-02": "#00ff00",
        "UAV-03": "#0000ff"
      }
    }
  }));
}

const roster: LayerSidebarProps["uavs"] = [
  {uavId: "UAV-01", callsign: "WRJ01", color: "#ff0000"},
  {uavId: "UAV-02", callsign: "WRJ02", color: "#00ff00"},
  {uavId: "UAV-03", callsign: "WRJ03", color: "#0000ff"}
];

function makeSidebarProps(): LayerSidebarProps {
  return {
    collapsed: false,
    layers: makeLayers(),
    uavs: roster,
    selectedUavId: null,
    onCollapsedChange: vi.fn(),
    onVisibilityChange: vi.fn(),
    onLayerChange: vi.fn(),
    onRestoreDefaults: vi.fn(),
    onSelectUav: vi.fn()
  };
}

const summary: CaseSummary = {
  schemaVersion: "1.0",
  caseId: "riyue-3d",
  name: "日月湾三维多无人机静态侦察",
  description: "测试摘要",
  status: "FEASIBLE",
  demoMock: true,
  location: "海南万宁日月湾",
  metrics: {
    uavCount: 3,
    stripCount: 12,
    coverageRatio: 0.98,
    missionMakespanSec: 3720,
    totalDistanceKm: 63.23,
    totalFuelKg: null
  },
  uavs: [
    {
      uavId: "UAV-01",
      callsign: "WRJ01",
      stripRange: "1-4",
      distanceKm: 20.12,
      durationMin: 61.5,
      coverageAltitudeM: 110,
      transitAltitudeM: 125,
      maxAltitudeM: 139.5,
      status: "VALID"
    },
    {
      uavId: "UAV-02",
      callsign: "WRJ02",
      stripRange: "5-8",
      distanceKm: 21.34,
      durationMin: 60.2,
      coverageAltitudeM: 115,
      transitAltitudeM: 130,
      maxAltitudeM: 142,
      status: "VALID"
    },
    {
      uavId: "UAV-03",
      callsign: "WRJ03",
      stripRange: "9-12",
      distanceKm: 21.77,
      durationMin: 62,
      coverageAltitudeM: 120,
      transitAltitudeM: 135,
      maxAltitudeM: 145,
      status: "VALID"
    }
  ],
  notice: "底图和公共地理对象来自真实地图数据；任务区域、条带和无人机航迹为模拟规划数据；本演示不构成真实飞行计划或空域信息。"
};

describe("LayerSidebar", () => {
  it("is controlled by collapsed and preserves the supplied six-layer order", () => {
    const props = makeSidebarProps();
    const {rerender} = render(<LayerSidebar {...props} />);

    const sidebar = screen.getByRole("complementary", {name: "图层"});
    expect(sidebar).toHaveStyle({width: "300px"});
    expect(screen.getByRole("heading", {name: "图层"})).toBeInTheDocument();
    expect(within(screen.getByRole("list", {name: "图层列表"}))
      .getAllByRole("listitem")
      .map((item) => within(item).getByRole("button", {name: /^编辑 /}).textContent))
      .toEqual(layerNames);

    fireEvent.click(screen.getByRole("button", {name: "收起图层"}));
    expect(props.onCollapsedChange).toHaveBeenCalledWith(true);
    expect(sidebar).toHaveStyle({width: "300px"});

    rerender(<LayerSidebar {...props} collapsed />);
    expect(sidebar).toHaveAttribute("data-collapsed", "true");
    expect(sidebar).toHaveStyle({width: "44px"});
    expect(screen.queryByRole("heading", {name: "图层"})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "展开图层"}));
    expect(props.onCollapsedChange).toHaveBeenCalledWith(false);
  });

  it("opens an inline editor from the layer row while visibility remains independent", () => {
    const props = makeSidebarProps();
    render(<LayerSidebar {...props} />);

    const visibility = screen.getByRole("button", {name: "隐藏 真实公开地理点"});
    expect(visibility).not.toBeEmptyDOMElement();
    fireEvent.click(visibility);
    expect(props.onVisibilityChange).toHaveBeenCalledWith("layer-1", false);
    expect(screen.queryByLabelText("真实公开地理点 颜色")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("layer-row-layer-1"));
    const color = screen.getByLabelText("真实公开地理点 颜色");
    const opacity = screen.getByLabelText("真实公开地理点 不透明度");
    expect(color).toHaveValue("#123456");
    expect(opacity).toHaveValue("0.7");
    expect(screen.queryByLabelText("真实公开地理点 半径")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "展开 真实公开地理点 高级设置"}));
    expect(screen.getByLabelText("真实公开地理点 半径")).toBeInTheDocument();
    expect(screen.getByLabelText("真实公开地理点 填充")).toBeChecked();
    expect(screen.queryByLabelText("真实公开地理点 线宽")).not.toBeInTheDocument();

    fireEvent.change(color, {target: {value: "#abcdef"}});
    fireEvent.change(opacity, {target: {value: "0.4"}});
    fireEvent.change(screen.getByLabelText("真实公开地理点 半径"), {target: {value: "12"}});
    fireEvent.click(screen.getByLabelText("真实公开地理点 填充"));
    expect(props.onLayerChange).toHaveBeenNthCalledWith(1, "layer-1", {color: "#abcdef"});
    expect(props.onLayerChange).toHaveBeenNthCalledWith(2, "layer-1", {opacity: 0.4});
    expect(props.onLayerChange).toHaveBeenNthCalledWith(3, "layer-1", {radius: 12});
    expect(props.onLayerChange).toHaveBeenNthCalledWith(4, "layer-1", {filled: false});

    fireEvent.click(screen.getByRole("button", {name: "编辑 真实公开地理点"}));
    expect(screen.queryByLabelText("真实公开地理点 颜色")).not.toBeInTheDocument();
  });

  it("renders per-UAV colors and only the advanced controls declared by capabilities", () => {
    const props = makeSidebarProps();
    render(<LayerSidebar {...props} />);

    expect(screen.getByLabelText("模拟规划航迹 UAV-01 颜色")).toHaveValue("#ff0000");
    expect(screen.getByLabelText("模拟规划航迹 UAV-02 颜色")).toHaveValue("#00ff00");
    expect(screen.getByLabelText("模拟规划航迹 UAV-03 颜色")).toHaveValue("#0000ff");
    expect(screen.getByLabelText("模拟规划航迹 线宽")).toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "展开 模拟规划航迹 高级设置"}))
      .not.toBeInTheDocument();
    expect(screen.queryByLabelText("模拟规划航迹 半径")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("模拟规划航迹 UAV-02 颜色"), {
      target: {value: "#fedcba"}
    });
    expect(props.onLayerChange).toHaveBeenCalledWith("wrj-routes-layer", {
      uavColors: {
        "UAV-01": "#ff0000",
        "UAV-02": "#fedcba",
        "UAV-03": "#0000ff"
      }
    });

    fireEvent.click(screen.getByRole("button", {name: "恢复全部图层默认设置"}));
    expect(props.onRestoreDefaults).toHaveBeenCalledTimes(1);
  });

  it("shows a base line-width range for strips, routes, and Trip", () => {
    const props = makeSidebarProps();
    render(<LayerSidebar {...props} />);

    const routeWidth = screen.getByLabelText("模拟规划航迹 线宽");
    expect(routeWidth).toHaveAttribute("type", "range");
    expect(routeWidth).toHaveAttribute("min", "0.5");
    expect(routeWidth).toHaveAttribute("max", "20");
    expect(routeWidth).toHaveAttribute("step", "0.5");
    expect(screen.getByLabelText("模拟规划航迹 线宽值")).toHaveTextContent("3 px");

    fireEvent.change(routeWidth, {target: {value: "6.5"}});
    expect(props.onLayerChange).toHaveBeenCalledWith("wrj-routes-layer", {thickness: 6.5});

    fireEvent.click(screen.getByRole("button", {name: "编辑 模拟侦察条带"}));
    expect(screen.getByLabelText("模拟侦察条带 线宽")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", {name: "编辑 模拟 Trip"}));
    expect(screen.getByLabelText("模拟 Trip 线宽")).toBeInTheDocument();
    expect(screen.queryByLabelText("模拟 Trip 轨迹长度")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "展开 模拟 Trip 高级设置"}));
    expect(screen.getByLabelText("模拟 Trip 轨迹长度")).toBeInTheDocument();
  });

  it("offers a runtime-tintable marker size control only for the Trip layer", () => {
    const props = makeSidebarProps();
    render(<LayerSidebar {...props} />);

    expect(screen.queryByLabelText("模拟 Trip 无人机图标大小")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "编辑 模拟 Trip"}));
    fireEvent.click(screen.getByRole("button", {name: "展开 模拟 Trip 高级设置"}));

    const iconSize = screen.getByLabelText("模拟 Trip 无人机图标大小");
    expect(iconSize).toHaveAttribute("type", "range");
    expect(iconSize).toHaveAttribute("min", "16");
    expect(iconSize).toHaveAttribute("max", "64");
    expect(iconSize).toHaveAttribute("step", "1");
    expect(iconSize).toHaveValue("32");

    fireEvent.change(iconSize, {target: {value: "48"}});
    expect(props.onLayerChange).toHaveBeenCalledWith("wrj-trip-layer", {iconSize: 48});
    expect(screen.getAllByLabelText(/无人机图标大小/)).toHaveLength(1);
  });

  it("keeps the UAV roster at the bottom and reports selection", () => {
    const props = makeSidebarProps();
    render(<LayerSidebar {...props} selectedUavId="UAV-02" />);

    const rosterElement = screen.getByRole("list", {name: "无人机编队"});
    expect(within(rosterElement).getAllByText("已规划")).toHaveLength(3);
    expect(within(rosterElement).getByText("UAV-02 / WRJ02")).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "UAV-02 WRJ02 已规划"})).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByTestId("uav-color-UAV-02")).toHaveStyle({backgroundColor: "#00ff00"});
    expect(screen.getByTestId("uav-color-UAV-02")).toHaveStyle({
      display: "inline-block",
      width: "10px",
      height: "10px",
      borderRadius: "50%"
    });
    fireEvent.click(screen.getByRole("button", {name: "UAV-03 WRJ03 已规划"}));
    expect(props.onSelectUav).toHaveBeenCalledWith("UAV-03");
  });

  it("opens the routes layer when layers become ready and falls back to the first layer", () => {
    const props = makeSidebarProps();
    const {rerender, unmount} = render(<LayerSidebar {...props} layers={[]} />);

    expect(screen.queryByLabelText("模拟规划航迹 UAV-01 颜色")).not.toBeInTheDocument();
    rerender(<LayerSidebar {...props} layers={props.layers} />);
    expect(screen.getByLabelText("模拟规划航迹 UAV-01 颜色")).toBeInTheDocument();

    unmount();
    const withoutRoutes = props.layers.filter(({id}) => id !== "wrj-routes-layer");
    render(<LayerSidebar {...props} layers={withoutRoutes} />);
    expect(screen.getByLabelText("真实公开地理点 颜色")).toBeInTheDocument();
  });

  it("adopts the routes default after partial loading and recovers when an expanded layer disappears", () => {
    const props = makeSidebarProps();
    const firstOnly = props.layers.slice(0, 1);
    const {rerender} = render(<LayerSidebar {...props} layers={firstOnly} />);

    expect(screen.getByLabelText("真实公开地理点 颜色")).toBeInTheDocument();
    rerender(<LayerSidebar {...props} layers={props.layers} />);
    expect(screen.getByLabelText("模拟规划航迹 UAV-01 颜色")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", {name: "编辑 真实公开地理点"}));
    expect(screen.getByLabelText("真实公开地理点 颜色")).toBeInTheDocument();
    rerender(<LayerSidebar {...props} layers={props.layers.slice(1)} />);
    expect(screen.getByLabelText("模拟规划航迹 UAV-01 颜色")).toBeInTheDocument();
  });

  it("does not emit empty, negative, or non-finite advanced numbers", () => {
    const props = makeSidebarProps();
    render(<LayerSidebar {...props} />);
    fireEvent.click(screen.getByRole("button", {name: "编辑 真实公开地理点"}));
    fireEvent.click(screen.getByRole("button", {name: "展开 真实公开地理点 高级设置"}));
    const radius = screen.getByLabelText("真实公开地理点 半径");
    const callback = props.onLayerChange as ReturnType<typeof vi.fn>;
    callback.mockClear();

    fireEvent.change(radius, {target: {value: ""}});
    fireEvent.change(radius, {target: {value: "-1"}});
    fireEvent.change(radius, {target: {value: "Infinity"}});
    expect(callback).not.toHaveBeenCalled();

    fireEvent.change(radius, {target: {value: "12.5"}});
    expect(callback).toHaveBeenCalledWith("layer-1", {radius: 12.5});
  });

  it("uses the live layer colors as its legend swatch", () => {
    const props = makeSidebarProps();
    const {rerender} = render(<LayerSidebar {...props} />);

    expect(screen.getByTestId("layer-legend-layer-1"))
      .toHaveStyle({background: "#123456"});
    expect(screen.getByTestId("layer-legend-wrj-routes-layer").getAttribute("style"))
      .toContain("linear-gradient");

    const updatedLayers = props.layers.map((layer) => layer.id === "layer-1"
      ? {...layer, appearance: {...layer.appearance, color: "#abcdef"}}
      : layer);
    rerender(<LayerSidebar {...props} layers={updatedLayers} />);
    expect(screen.getByTestId("layer-legend-layer-1"))
      .toHaveStyle({background: "#abcdef"});
  });
});

describe("DetailDrawer", () => {
  it("renders all overview metrics and provenance and closes", () => {
    const onClose = vi.fn();
    const content: DrawerContent = {type: "overview"};
    render(
      <DetailDrawer
        summary={summary}
        content={content}
        attribution="© OpenStreetMap contributors"
        onClose={onClose}
      />
    );

    expect(screen.getByRole("dialog", {name: "任务概览"})).toBeInTheDocument();
    for (const text of ["方案状态", "可行", "无人机数量", "3", "条带数量", "12", "覆盖率", "98%", "并行完成时间", "62.0 min", "总航程", "63.23 km"]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(screen.getByText("海南万宁日月湾")).toBeInTheDocument();
    expect(screen.getByText(/真实底图与公开地理对象；模拟任务区、条带、航迹、高度及时序/)).toBeInTheDocument();
    expect(screen.getByText(/曲线爬升、海上盘旋、覆盖侦察、水滴掉头与曲线返航/)).toBeInTheDocument();
    expect(screen.getByText(summary.notice)).toBeInTheDocument();
    expect(screen.getByText("© OpenStreetMap contributors")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", {name: "关闭详情"}));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders every UAV field and renders nothing for null content", () => {
    const hiddenContent: DrawerContent = null;
    const {rerender} = render(
      <DetailDrawer
        summary={summary}
        content={{type: "uav", uavId: "UAV-01"}}
        attribution="地图署名"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole("dialog", {name: "UAV-01 任务详情"})).toBeInTheDocument();
    for (const text of ["UAV-01", "WRJ01", "1-4", "20.12 km", "61.5 min", "110 m", "125 m", "139.5 m", "已校验"]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(screen.getByText(summary.notice)).toBeInTheDocument();
    expect(screen.getByText("地图署名")).toBeInTheDocument();

    rerender(
      <DetailDrawer
        summary={summary}
        content={hiddenContent}
        attribution="地图署名"
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("safely renders nothing for an unknown UAV id", () => {
    render(
      <DetailDrawer
        summary={summary}
        content={{type: "uav", uavId: "UAV-99"} as unknown as DrawerContent}
        attribution="地图署名"
        onClose={vi.fn()}
      />
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("moves focus into the drawer, closes with Escape, and restores the trigger focus", () => {
    function DrawerHarness() {
      const [content, setContent] = useState<DrawerContent>(null);
      return (
        <>
          <button type="button" onClick={() => setContent({type: "overview"})}>打开任务概览</button>
          <DetailDrawer
            summary={summary}
            content={content}
            attribution="地图署名"
            onClose={() => setContent(null)}
          />
        </>
      );
    }

    render(<DrawerHarness />);
    const trigger = screen.getByRole("button", {name: "打开任务概览"});
    trigger.focus();
    fireEvent.click(trigger);

    const close = screen.getByRole("button", {name: "关闭详情"});
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, {key: "Escape"});
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
