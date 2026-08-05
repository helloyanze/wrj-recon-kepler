import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {cleanup, fireEvent, render, screen} from "@testing-library/react";
import type {ComponentType, ReactNode} from "react";
import {Provider} from "react-redux";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

import {createAppStore} from "../../src/app/store";
import type {ResolvedBasemap} from "../../src/basemap/basemapConfig";
import {
  DynamicReplanningWorkspace
} from "../../src/components/DynamicReplanningWorkspace";
import {Workspace} from "../../src/components/Workspace";
import type {
  WrjKeplerMapProps
} from "../../src/components/WrjKeplerMap";
import type {
  DynamicPlaybackController
} from "../../src/hooks/useDynamicPlayback";
import type {
  DynamicSceneLibrary
} from "../../src/hooks/useDynamicSceneLibrary";
import {
  caseBundleSchema
} from "../../src/features/cases/caseBundle";
import {
  sceneConfigSchema,
  sceneProvenanceSchema,
  type LoadedDynamicScenePackage
} from "../../src/features/dynamic-replanning/dynamicSceneSchema";
import {
  cameraTransitionDuration
} from "../../src/features/dynamic-replanning/cameraMotion";
import {decisionTraceV1Schema} from "../../src/features/dynamic-replanning/decisionTraceSchema";
import {missionViewV1Schema} from "../../src/features/dynamic-replanning/missionViewSchema";
import {
  decisionTraceFixture,
  missionViewFixture,
  sceneConfigFixture,
  sceneProvenanceFixture
} from "../fixtures/task2MissionViewFixture";

const runtime = vi.hoisted(() => ({
  library: null as DynamicSceneLibrary | null,
  playback: null as DynamicPlaybackController | null
}));

vi.mock("../../src/hooks/useDynamicSceneLibrary", () => ({
  useDynamicSceneLibrary: () => {
    if (runtime.library === null) throw new Error("missing library fixture");
    return runtime.library;
  }
}));

vi.mock("../../src/hooks/useDynamicPlayback", () => ({
  useDynamicPlayback: () => {
    if (runtime.playback === null) throw new Error("missing playback fixture");
    return runtime.playback;
  }
}));

vi.mock("../../src/components/StaticPlanningWorkspace", () => ({
  StaticPlanningWorkspace: ({modeSwitch}: {modeSwitch?: ReactNode}) => (
    <main>
      {modeSwitch}
      <h1>静态侦察规划</h1>
    </main>
  )
}));

vi.mock("../../src/components/WrjKeplerMap", () => ({
  WrjKeplerMap: () => <div data-testid="default-dynamic-map" />
}));

const baseline = caseBundleSchema.parse(JSON.parse(readFileSync(resolve(
  "public/data/integration-cases/R01-BASELINE-01/bundle.json"
), "utf8")));
const scenePackage: LoadedDynamicScenePackage = {
  config: sceneConfigSchema.parse(sceneConfigFixture),
  baseline,
  view: missionViewV1Schema.parse(missionViewFixture),
  decisionTrace: decisionTraceV1Schema.parse(decisionTraceFixture),
  failureReport: null,
  provenance: sceneProvenanceSchema.parse(sceneProvenanceFixture)
};
const basemap: ResolvedBasemap = {
  provider: "public",
  mapboxToken: "",
  mapStyles: [],
  mapStylesReplaceDefault: true,
  primaryLabel: "卫星地图",
  secondaryLabel: "简洁地图",
  statusLabel: "公共底图",
  attributionByStyle: {
    satellite: "地图来源",
    light: "地图来源"
  }
};
const MapView: ComponentType<WrjKeplerMapProps> = props => (
  <div
    data-testid="dynamic-map"
    data-has-overlay={String(props.dynamicOverlay !== null)}
  />
);

function renderWithStore(node: ReactNode) {
  return render(
    <Provider store={createAppStore(false)}>{node}</Provider>
  );
}

beforeEach(() => {
  runtime.library = {
    status: "ready",
    entries: [{
      sceneId: "resource-lost",
      displayName: "无人机失联",
      summary: "执行中无人机失联，剩余工作转移给可用资源。",
      baseUrl: "task2/scenes/resource-lost",
      resultStatus: "COMPLETE",
      failureReportUrl: null,
      category: "foundation",
      dataNature: "SIMULATED_PIPELINE_RESULT",
      featured: false,
      disabled: false,
      error: null
    }],
    selectedSceneId: "resource-lost",
    scenePackage,
    error: null,
    select: vi.fn(),
    retry: vi.fn()
  };
  runtime.playback = {
    phase: "READY",
    missionTimeSec: 85,
    presentationElapsedMs: 0,
    playing: false,
    rate: 1,
    automaticCamera: true,
    play: vi.fn(),
    pause: vi.fn(),
    toggle: vi.fn(),
    seek: vi.fn(),
    setRate: vi.fn(),
    restart: vi.fn(),
    disableAutomaticCamera: vi.fn()
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("dynamic workspace", () => {
  it("disables fly-camera animation when reduced motion is requested", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    })));

    expect(cameraTransitionDuration(650)).toBe(0);
  });

  it("switches from Task 1 to Task 2 in the same application", () => {
    renderWithStore(
      <Workspace
        basemap={basemap}
        debugMode={false}
        dataBase="/data"
        MapView={MapView}
      />
    );
    expect(screen.getByText("静态侦察规划")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {
      name: "任务二 动态重规划"
    }));
    expect(screen.getByRole("heading", {name: "图层与航迹"}))
      .toBeInTheDocument();
    expect(screen.getByRole("region", {
      name: "动态重规划时间轴"
    })).toBeInTheDocument();
  });

  it("loads a scene paused at READY and replays on demand", () => {
    renderWithStore(
      <DynamicReplanningWorkspace
        basemap={basemap}
        debugMode={false}
        dataBase="/data"
        MapView={MapView}
      />
    );
    expect(screen.getByRole("button", {
      name: "播放动态场景"
    })).toBeEnabled();
    expect(screen.getByText("等待播放")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "重新播放"}));
    expect(runtime.playback?.restart).toHaveBeenCalledOnce();
    expect(screen.getByTestId("dynamic-map"))
      .toHaveAttribute("data-has-overlay", "true");
  });

  it("collapses and restores the Task 2 layer sidebar", () => {
    renderWithStore(
      <DynamicReplanningWorkspace
        basemap={basemap}
        debugMode={false}
        dataBase="/data"
        MapView={MapView}
      />
    );

    expect(screen.queryByRole("region", {name: "动态变化图例"}))
      .not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "收起图层"}));
    expect(screen.queryByRole("heading", {name: "图层与航迹"}))
      .not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "展开图层"}));
    expect(screen.getByRole("heading", {name: "图层与航迹"}))
      .toBeInTheDocument();
  });

  it("preserves layer preferences while the sidebar is collapsed", () => {
    renderWithStore(
      <DynamicReplanningWorkspace
        basemap={basemap}
        debugMode={false}
        dataBase="/data"
        MapView={MapView}
      />
    );

    fireEvent.click(screen.getByRole("button", {
      name: "编辑 当前方案航迹"
    }));
    fireEvent.change(screen.getByRole("slider", {
      name: "当前方案航迹 不透明度"
    }), {target: {value: "0.35"}});
    fireEvent.click(screen.getByRole("button", {name: "收起图层"}));
    fireEvent.click(screen.getByRole("button", {name: "展开图层"}));
    fireEvent.click(screen.getByRole("button", {
      name: "编辑 当前方案航迹"
    }));

    expect(screen.getByRole("slider", {
      name: "当前方案航迹 不透明度"
    })).toHaveValue("0.35");
    expect(screen.getByRole("combobox", {name: "选择动态场景"}))
      .toHaveValue("resource-lost");
  });
});
