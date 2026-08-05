import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {cleanup, fireEvent, render, screen} from "@testing-library/react";
import {useState} from "react";
import {afterEach, describe, expect, it, vi} from "vitest";

import {DynamicLayerSidebar} from "../../src/components/dynamic/DynamicLayerSidebar";
import {
  DynamicStatusBanner
} from "../../src/components/dynamic/DynamicStatusBanner";
import {
  DynamicTimeline,
  type DynamicTimelineProps
} from "../../src/components/dynamic/DynamicTimeline";
import {caseBundleSchema} from "../../src/features/cases/caseBundle";
import {buildDynamicScene} from "../../src/features/dynamic-replanning/buildDynamicScene";
import {decisionTraceV1Schema} from "../../src/features/dynamic-replanning/decisionTraceSchema";
import {createDefaultDynamicLayerPreferences} from "../../src/features/dynamic-replanning/dynamicLayerPreferences";
import {
  sceneConfigSchema,
  sceneProvenanceSchema
} from "../../src/features/dynamic-replanning/dynamicSceneSchema";
import {missionViewV1Schema} from "../../src/features/dynamic-replanning/missionViewSchema";
import type {DynamicPlaybackState} from "../../src/features/dynamic-replanning/dynamicPlayback";
import {
  decisionTraceFixture,
  missionViewFixture,
  sceneConfigFixture,
  sceneProvenanceFixture
} from "../fixtures/task2MissionViewFixture";

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

const baseline = caseBundleSchema.parse(JSON.parse(readFileSync(resolve(
  "public/data/integration-cases/R01-BASELINE-01/bundle.json"
), "utf8")));
const scene = buildDynamicScene({
  config: sceneConfigSchema.parse(sceneConfigFixture),
  baseline,
  view: missionViewV1Schema.parse(missionViewFixture),
  decisionTrace: decisionTraceV1Schema.parse(decisionTraceFixture),
  failureReport: null,
  provenance: sceneProvenanceSchema.parse(sceneProvenanceFixture)
});
const playback: DynamicPlaybackState = {
  phase: "READY",
  missionTimeSec: 85,
  presentationElapsedMs: 0,
  playing: false,
  rate: 1,
  automaticCamera: true
};

function SidebarHarness({resourceIds}: {resourceIds: readonly string[]}) {
  const [preferences, setPreferences] = useState(() =>
    createDefaultDynamicLayerPreferences(scene.config.sceneId, resourceIds)
  );
  return (
    <DynamicLayerSidebar
      scene={scene}
      playback={playback}
      preferences={preferences}
      onChange={setPreferences}
      onRestoreDefaults={vi.fn()}
      onCollapse={vi.fn()}
    />
  );
}

function renderSidebar(resourceIds = [...scene.resourcesById.keys()]) {
  return render(<SidebarHarness resourceIds={resourceIds} />);
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

  it("renders compact Chinese layer rows with one editor open", () => {
    renderSidebar();

    expect(screen.getByRole("heading", {name: "图层与航迹"}))
      .toBeInTheDocument();
    expect(screen.queryByRole("heading", {name: "资源"}))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("heading", {name: "任务"}))
      .not.toBeInTheDocument();
    expect(screen.queryByText("颜色方式")).not.toBeInTheDocument();

    [
      "任务区域",
      "原计划航迹",
      "当前方案航迹",
      "受影响对象",
      "无人机位置",
      "事件位置"
    ].forEach(label => expect(screen.getByRole("button", {
      name: `编辑 ${label}`
    })).toBeInTheDocument());
    expect(screen.getAllByRole("button", {name: /^编辑 /u}).map(button =>
      button.getAttribute("aria-label")
    )).toEqual([
      "编辑 任务区域",
      "编辑 原计划航迹",
      "编辑 当前方案航迹",
      "编辑 受影响对象",
      "编辑 无人机位置",
      "编辑 事件位置"
    ]);

    const taskAreas = screen.getByRole("button", {name: "编辑 任务区域"});
    const activeRoutes = screen.getByRole("button", {
      name: "编辑 当前方案航迹"
    });
    fireEvent.click(taskAreas);
    expect(taskAreas).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(activeRoutes);
    expect(taskAreas).toHaveAttribute("aria-expanded", "false");
    expect(activeRoutes).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(activeRoutes);
    expect(activeRoutes).toHaveAttribute("aria-expanded", "false");
  });

  it("shows only present change types with Chinese labels", () => {
    renderSidebar();
    fireEvent.click(screen.getByRole("button", {
      name: "编辑 当前方案航迹"
    }));

    expect(screen.getByText("原计划")).toBeInTheDocument();
    expect(screen.getByText("调整航段")).toBeInTheDocument();
    expect(screen.queryByText("新增航段")).not.toBeInTheDocument();
    expect(screen.queryByText("dynamic_modified")).not.toBeInTheDocument();
  });

  it("localizes UAV names while retaining raw identifiers for audit", () => {
    renderSidebar(["UAV-01", "UAV-09", "CUSTOM"]);
    fireEvent.click(screen.getByRole("button", {
      name: "编辑 当前方案航迹"
    }));
    fireEvent.click(screen.getByRole("button", {name: "按无人机"}));

    expect(screen.getByText("1号无人机")).toHaveAttribute("title", "UAV-01");
    expect(screen.getByText("9号无人机")).toHaveAttribute("title", "UAV-09");
    expect(screen.getByText("CUSTOM")).toHaveAttribute("title", "CUSTOM");
  });
});
