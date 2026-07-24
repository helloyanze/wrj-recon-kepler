import {cleanup, fireEvent, render, screen} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";
import {
  DetailDrawer,
  type DetailDrawerProps
} from "../../src/components/workspace/DetailDrawer";
import type {CaseBundleV2} from "../../src/features/cases/caseBundle";
import {
  selectSortieStates,
  type LiveSortieState
} from "../../src/features/mission/missionInterpolation";

afterEach(cleanup);

const NOTICE =
  "算法数据采用 LOCAL_CARTESIAN_M；当前地图位置为日月湾视觉锚定，不代表真实地理定位。";

const bundle = {
  version: 2,
  case: {
    caseId: "R10-LONG-TRANSIT-01",
    planId: "plan-r10",
    displayName: "R10 长航程算例"
  },
  assignments: [
    {
      assignmentId: "ASG-01",
      uavId: "UAV-01",
      baseId: "BASE-01",
      flightCandidateId: "FC-01",
      stripIds: ["STRIP-01", "STRIP-02"],
      stripStartIndex: 0,
      stripEndIndex: 1,
      batchIndex: 0,
      plannedLaunchTimeSec: 10
    },
    {
      assignmentId: "ASG-02",
      uavId: "UAV-01",
      baseId: "BASE-01",
      flightCandidateId: "FC-02",
      stripIds: ["STRIP-03"],
      stripStartIndex: 2,
      stripEndIndex: 2,
      batchIndex: 1,
      plannedLaunchTimeSec: 100
    }
  ],
  sorties: [
    {
      trajectoryId: "TRAJ-01",
      assignmentId: "ASG-01",
      uavId: "UAV-01",
      batchIndex: 0,
      plannedLaunchTimeSec: 10,
      stripIds: ["STRIP-01", "STRIP-02"],
      totalDistanceM: 12_345,
      totalDurationSec: 90,
      totalFuelKg: 4.25,
      segments: [
        {
          segmentId: "SEG-CLIMB",
          segmentType: "CLIMB",
          stripId: null,
          startTimeSec: 10,
          endTimeSec: 20,
          heightM: 1_500,
          speedMps: 72.5,
          distanceM: 500,
          fuelConsumptionKg: 0.25,
          localPath: [[100, 200, 300], [110, 220, 1_500]],
          mapPath: [[110.2, 18.6, 300], [110.21, 18.61, 1_500]],
          timedPath: [
            [110.2, 18.6, 300, 10],
            [110.21, 18.61, 1_500, 20]
          ]
        }
      ],
      trip: [
        [110.2, 18.6, 300, 10],
        [110.21, 18.61, 1_500, 20]
      ]
    },
    {
      trajectoryId: "TRAJ-02",
      assignmentId: "ASG-02",
      uavId: "UAV-01",
      batchIndex: 1,
      plannedLaunchTimeSec: 100,
      stripIds: ["STRIP-03"],
      totalDistanceM: 7_655,
      totalDurationSec: 60,
      totalFuelKg: 1.75,
      segments: [
        {
          segmentId: "SEG-ENTRY",
          segmentType: "ENTRY",
          stripId: null,
          startTimeSec: 100,
          endTimeSec: 160,
          heightM: 1_000,
          speedMps: 50,
          distanceM: 7_655,
          fuelConsumptionKg: 1.75,
          localPath: [[0, 0, 1_000], [1_000, 0, 1_000]],
          mapPath: [[110.2, 18.6, 1_000], [110.21, 18.6, 1_000]],
          timedPath: [
            [110.2, 18.6, 1_000, 100],
            [110.21, 18.6, 1_000, 160]
          ]
        }
      ],
      trip: [
        [110.2, 18.6, 1_000, 100],
        [110.21, 18.6, 1_000, 160]
      ]
    }
  ],
  strips: [],
  region: {source: "DERIVED_FROM_STRIPS", polygon: []},
  metrics: {
    uavCount: 1,
    sortieCount: 2,
    batchCount: 2,
    stripCount: 3,
    coverageRatio: 0.987,
    missionMakespanSec: 160,
    totalDistanceM: 20_000,
    totalFuelKg: 6
  },
  validation: {
    valid: false,
    warnings: ["存在一条边界接近限制"],
    failureCodes: ["FUEL_MARGIN_LOW"]
  },
  displayTransform: {
    anchorLongitude: 110.235,
    anchorLatitude: 18.625,
    sourceCenterXM: 0,
    sourceCenterYM: 0,
    xAxis: "EAST",
    yAxis: "NORTH"
  },
  provenance: {
    sourceName: "mission_plan.json",
    sourceRun: "20260721T192032",
    importedAt: "2026-07-21T19:20:32.000Z",
    sha256: "a".repeat(64)
  }
} as CaseBundleV2;

function drawerProps(
  content: DetailDrawerProps["content"],
  missionTime = 15
): DetailDrawerProps {
  return {
    bundle,
    liveSorties: selectSortieStates(bundle.sorties, missionTime),
    missionTime,
    content,
    attribution: "© OpenStreetMap contributors",
    onClose: vi.fn()
  };
}

describe("algorithm mission DetailDrawer", () => {
  it("renders authoritative overview metrics, validation messages, and notice", () => {
    render(<DetailDrawer {...drawerProps({type: "overview"})} />);

    expect(screen.getByRole("dialog", {name: "任务概览"})).toBeInTheDocument();
    expect(screen.getAllByText("2")).toHaveLength(2);
    for (const value of [
      "1", "3", "98.7%", "160.0 s", "20.00 km", "6.00 kg",
      "存在一条边界接近限制", "FUEL_MARGIN_LOW", NOTICE
    ]) {
      expect(screen.getByText(value)).toBeInTheDocument();
    }
  });

  it("aggregates a UAV's normalized sorties and lists its assignments", () => {
    render(<DetailDrawer {...drawerProps({type: "uav", uavId: "UAV-01"})} />);

    expect(screen.getByRole("dialog", {name: "UAV-01 任务详情"})).toBeInTheDocument();
    expect(screen.getByText("ASG-01")).toBeInTheDocument();
    expect(screen.getByText("ASG-02")).toBeInTheDocument();
    expect(screen.getByText("20.00 km")).toBeInTheDocument();
    expect(screen.getByText("6.00 kg")).toBeInTheDocument();
    expect(screen.getByText("飞行中")).toBeInTheDocument();
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
  });

  it("shows live CLIMB telemetry and true local values for a sortie", () => {
    const liveSorties: LiveSortieState[] = [{
      ...selectSortieStates(bundle.sorties, 15)[0],
      localPosition: [105, 210, 900],
      altitudeM: 900,
      speedMps: 72.5,
      segmentType: "CLIMB"
    }];
    const props = {
      ...drawerProps({type: "sortie", assignmentId: "ASG-01"}),
      liveSorties
    };
    const {rerender} = render(<DetailDrawer {...props} />);

    expect(screen.getByRole("dialog", {name: "ASG-01 架次详情"})).toBeInTheDocument();
    for (const value of [
      "ASG-01", "UAV-01", "第 1 批", "10.0 s", "CLIMB",
      "STRIP-01、STRIP-02", "12.35 km", "4.25 kg",
      "X 105.0 m / Y 210.0 m / Z 900.0 m",
      "900.0 m", "72.5 m/s", NOTICE
    ]) {
      expect(screen.getByText(value)).toBeInTheDocument();
    }

    rerender(<DetailDrawer {...props} missionTime={16} />);
    expect(screen.getByText("900.0 m")).toBeInTheDocument();
    expect(screen.getByText("72.5 m/s")).toBeInTheDocument();
  });

  it("invokes close and renders nothing for null content", () => {
    const props = drawerProps({type: "overview"});
    const {rerender} = render(<DetailDrawer {...props} />);
    fireEvent.click(screen.getByRole("button", {name: "关闭详情"}));
    expect(props.onClose).toHaveBeenCalledTimes(1);

    rerender(<DetailDrawer {...props} content={null} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
