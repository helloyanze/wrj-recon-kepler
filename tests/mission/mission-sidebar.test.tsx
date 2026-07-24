import {cleanup, fireEvent, render, screen, within} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";
import {
  LayerSidebar,
  type LayerSidebarProps
} from "../../src/components/workspace/LayerSidebar";
import type {CaseBundleV2, NormalizedSortie} from "../../src/features/cases/caseBundle";
import {
  createDefaultMissionLayerPreferences
} from "../../src/features/mission/missionLayerPreferences";
import type {LiveSortieState} from "../../src/features/mission/missionInterpolation";

afterEach(cleanup);

function sortie(
  assignmentId: string,
  uavId: string,
  batchIndex: number,
  launch: number
): NormalizedSortie {
  return {
    trajectoryId: `trajectory-${assignmentId}`,
    assignmentId,
    uavId,
    batchIndex,
    plannedLaunchTimeSec: launch,
    stripIds: [`strip-${assignmentId}`],
    totalDistanceM: 100,
    totalDurationSec: 50,
    totalFuelKg: 1,
    segments: [],
    trip: []
  };
}

function live(sortieValue: NormalizedSortie, status: LiveSortieState["status"]): LiveSortieState {
  return {
    assignmentId: sortieValue.assignmentId,
    uavId: sortieValue.uavId,
    batchIndex: sortieValue.batchIndex,
    status,
    position: null,
    localPosition: null,
    headingDeg: null,
    segmentType: null,
    stripId: null,
    altitudeM: 0,
    speedMps: 0
  };
}

const sorties = [
  sortie("A-01", "UAV-07", 0, 0),
  sortie("A-02", "UAV-08", 0, 0),
  sortie("A-03", "UAV-07", 1, 1_206.801),
  sortie("A-04", "UAV-08", 1, 1_206.801),
  sortie("A-05", "UAV-07", 2, 2_415.788)
];

const bundle = {
  case: {caseId: "R10", planId: "PLAN-10", displayName: "R10"},
  sorties
} as CaseBundleV2;

function makeProps(): LayerSidebarProps {
  return {
    bundle,
    preferences: createDefaultMissionLayerPreferences(
      "R10",
      "PLAN-10",
      ["UAV-07", "UAV-08"]
    ),
    liveSorties: [
      live(sorties[0], "completed"),
      live(sorties[1], "landed"),
      live(sorties[2], "flying"),
      live(sorties[3], "waiting"),
      live(sorties[4], "waiting")
    ],
    loading: false,
    collapsed: false,
    selectedUavId: null,
    selectedSortieId: null,
    onCollapsedChange: vi.fn(),
    onLayerChange: vi.fn(),
    onUavColorChange: vi.fn(),
    onMarkerSizeChange: vi.fn(),
    onRestoreDefaults: vi.fn(),
    onSelectUav: vi.fn(),
    onSelectSortie: vi.fn()
  };
}

describe("dynamic mission LayerSidebar", () => {
  it("renders exactly four algorithm layers in fixed order and no legacy geographic layers", () => {
    render(<LayerSidebar {...makeProps()} />);

    const labels = within(screen.getByRole("list", {name: "图层列表"}))
      .getAllByRole("listitem")
      .map(item => within(item).getByRole("button", {name: /^编辑 /}).textContent);
    expect(labels).toEqual(["算法任务区", "侦察条带", "静态规划航迹", "动态飞行尾迹"]);
    expect(screen.queryByText("真实 POI")).not.toBeInTheDocument();
    expect(screen.queryByText("真实上下文")).not.toBeInTheDocument();
  });

  it("groups five sorties under two dynamic UAV ids and orders children by launch time", () => {
    render(<LayerSidebar {...makeProps()} />);

    const roster = screen.getByRole("list", {name: "无人机任务"});
    expect(within(roster).getAllByTestId(/^uav-group-/)).toHaveLength(2);
    expect(within(roster).getByText("UAV-07")).toBeInTheDocument();
    expect(within(roster).getByText("UAV-08")).toBeInTheDocument();

    const group = screen.getByTestId("uav-group-UAV-07");
    expect(within(group).getAllByRole("button", {name: /^架次 /})
      .map(button => button.textContent))
      .toEqual([
        expect.stringContaining("A-01"),
        expect.stringContaining("A-03"),
        expect.stringContaining("A-05")
      ]);
    expect(within(group).getAllByText("飞行中")).toHaveLength(2);
    expect(screen.getAllByText("已降落")).toHaveLength(2);
    expect(screen.getAllByText("待起飞").length).toBeGreaterThan(0);
    expect(screen.getByText("已完成")).toBeInTheDocument();
  });

  it("emits visibility, width, trail, marker and shared UAV color updates", () => {
    const props = makeProps();
    render(<LayerSidebar {...props} />);

    fireEvent.click(screen.getByRole("button", {name: "隐藏 静态规划航迹"}));
    expect(props.onLayerChange).toHaveBeenCalledWith("routes", {visible: false});

    fireEvent.change(screen.getByLabelText("静态规划航迹 线宽"), {
      target: {value: "6.5"}
    });
    expect(props.onLayerChange).toHaveBeenCalledWith("routes", {width: 6.5});

    fireEvent.change(screen.getByLabelText("静态规划航迹 UAV-07 颜色"), {
      target: {value: "#abcdef"}
    });
    expect(props.onUavColorChange).toHaveBeenCalledWith("UAV-07", "#abcdef");

    fireEvent.click(screen.getByRole("button", {name: "编辑 动态飞行尾迹"}));
    fireEvent.click(screen.getByRole("button", {name: "展开 动态飞行尾迹 高级设置"}));
    fireEvent.change(screen.getByLabelText("动态飞行尾迹 轨迹长度"), {
      target: {value: "360"}
    });
    expect(props.onLayerChange).toHaveBeenCalledWith("trips", {trailLengthSec: 360});
    fireEvent.change(screen.getByLabelText("动态飞行尾迹 无人机图标大小"), {
      target: {value: "44"}
    });
    expect(props.onMarkerSizeChange).toHaveBeenCalledWith(44);
  });

  it("opens dynamic UAV and sortie details and disables editing while loading", () => {
    const props = makeProps();
    const {rerender} = render(<LayerSidebar {...props} />);

    fireEvent.click(screen.getByRole("button", {name: "无人机 UAV-07 飞行中"}));
    expect(props.onSelectUav).toHaveBeenCalledWith("UAV-07");
    fireEvent.click(screen.getByRole("button", {name: /架次 A-03/}));
    expect(props.onSelectSortie).toHaveBeenCalledWith("A-03");

    rerender(<LayerSidebar {...props} loading />);
    expect(screen.getByRole("button", {name: "隐藏 静态规划航迹"})).toBeDisabled();
    expect(screen.getByLabelText("静态规划航迹 线宽")).toBeDisabled();
  });
});
