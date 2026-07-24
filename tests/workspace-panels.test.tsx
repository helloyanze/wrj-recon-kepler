import {useState} from "react";
import {cleanup, fireEvent, render, screen} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";
import {
  DetailDrawer,
  type DrawerContent
} from "../src/components/workspace/DetailDrawer";
import type {CaseSummary} from "../src/data/caseSchema";

afterEach(cleanup);

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
    }
  ],
  notice: "算法任务数据仅用于内部演示。"
};

describe("DetailDrawer", () => {
  it("renders overview metrics and provenance and closes", () => {
    const onClose = vi.fn();
    render(
      <DetailDrawer
        summary={summary}
        content={{type: "overview"}}
        attribution="© OpenStreetMap contributors"
        onClose={onClose}
      />
    );

    expect(screen.getByRole("dialog", {name: "任务概览"})).toBeInTheDocument();
    for (const text of [
      "方案状态",
      "可行",
      "无人机数量",
      "3",
      "条带数量",
      "12",
      "覆盖率",
      "98%",
      "并行完成时间",
      "62.0 min",
      "总航程",
      "63.23 km"
    ]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(screen.getByText(summary.notice)).toBeInTheDocument();
    expect(screen.getByText("© OpenStreetMap contributors")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", {name: "关闭详情"}));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders every UAV field and renders nothing for null content", () => {
    const {rerender} = render(
      <DetailDrawer
        summary={summary}
        content={{type: "uav", uavId: "UAV-01"}}
        attribution="地图署名"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole("dialog", {name: "UAV-01 任务详情"})).toBeInTheDocument();
    for (const text of [
      "UAV-01",
      "WRJ01",
      "1-4",
      "20.12 km",
      "61.5 min",
      "110 m",
      "125 m",
      "139.5 m",
      "已校验"
    ]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }

    rerender(
      <DetailDrawer
        summary={summary}
        content={null}
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

  it("moves focus into the drawer, closes with Escape, and restores focus", () => {
    function DrawerHarness() {
      const [content, setContent] = useState<DrawerContent>(null);
      return (
        <>
          <button type="button" onClick={() => setContent({type: "overview"})}>
            打开任务概览
          </button>
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
