import {cleanup, fireEvent, render, screen} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";

import {
  DynamicStatusBanner
} from "../../src/components/dynamic/DynamicStatusBanner";
import {
  DynamicTimeline,
  type DynamicTimelineProps
} from "../../src/components/dynamic/DynamicTimeline";

afterEach(cleanup);

function timelineProps(): DynamicTimelineProps {
  return {
    missionTimeSec: 0,
    makespanSec: 1_000,
    eventTimeSec: 400,
    planCommitTimeSec: 450,
    playing: false,
    rate: 1,
    onToggle: vi.fn(),
    onSeek: vi.fn(),
    onRateChange: vi.fn()
  };
}

describe("dynamic controls", () => {
  it("labels safe fallback as incomplete but safe", () => {
    render(<DynamicStatusBanner status="PARTIAL_SAFE_FALLBACK" />);
    expect(screen.getByText("安全回退")).toBeInTheDocument();
    expect(screen.getByText("不是完整方案")).toBeInTheDocument();
    expect(screen.queryByText("方案成功")).not.toBeInTheDocument();
  });

  it("shows event and plan-commit markers on the mission timeline", () => {
    render(<DynamicTimeline {...timelineProps()} />);
    expect(screen.getByLabelText("动态事件时刻"))
      .toHaveStyle({left: "40%"});
    expect(screen.getByLabelText("新方案生效时刻"))
      .toBeInTheDocument();
  });

  it("reports all controls through controlled callbacks", () => {
    const props = timelineProps();
    render(<DynamicTimeline {...props} />);
    fireEvent.click(screen.getByRole("button", {name: "播放动态场景"}));
    fireEvent.change(screen.getByRole("slider", {name: "动态任务进度"}), {
      target: {value: "300"}
    });
    fireEvent.change(screen.getByRole("combobox", {name: "播放速度"}), {
      target: {value: "10"}
    });
    expect(props.onToggle).toHaveBeenCalledOnce();
    expect(props.onSeek).toHaveBeenCalledWith(300);
    expect(props.onRateChange).toHaveBeenCalledWith(10);
  });
});
