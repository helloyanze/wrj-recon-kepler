import {cleanup, fireEvent, render, screen} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";
import {MissionTimeline} from "../../src/components/workspace/MissionTimeline";
import type {NormalizedSortie} from "../../src/features/cases/caseBundle";
import type {LiveSortieState} from "../../src/features/mission/missionInterpolation";

afterEach(cleanup);

function sortie(
  assignmentId: string,
  uavId: string,
  batchIndex: number,
  plannedLaunchTimeSec: number
): NormalizedSortie {
  return {
    trajectoryId: `trajectory-${assignmentId}`,
    assignmentId,
    uavId,
    batchIndex,
    plannedLaunchTimeSec,
    stripIds: [`strip-${assignmentId}`],
    totalDistanceM: 1_000,
    totalDurationSec: 100,
    totalFuelKg: 1,
    segments: [],
    trip: []
  };
}

function live(
  assignmentId: string,
  uavId: string,
  batchIndex: number,
  status: LiveSortieState["status"]
): LiveSortieState {
  return {
    assignmentId,
    uavId,
    batchIndex,
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
] as const;

function renderTimeline(overrides: Partial<React.ComponentProps<typeof MissionTimeline>> = {}) {
  const props: React.ComponentProps<typeof MissionTimeline> = {
    missionTimeSec: 1_206.801,
    makespanSec: 3_598.185,
    playing: false,
    rate: 30,
    sorties,
    liveSorties: [
      live("A-01", "UAV-07", 0, "completed"),
      live("A-02", "UAV-08", 0, "completed"),
      live("A-03", "UAV-07", 1, "flying"),
      live("A-04", "UAV-08", 1, "flying"),
      live("A-05", "UAV-07", 2, "waiting")
    ],
    onToggle: vi.fn(),
    onSeek: vi.fn(),
    onRateChange: vi.fn(),
    ...overrides
  };
  render(<MissionTimeline {...props} />);
  return props;
}

describe("MissionTimeline", () => {
  it("renders the controlled time, exact raw seconds, active count and launch batch", () => {
    renderTimeline();

    expect(screen.getByRole("region", {name: "任务时间轴"})).toBeInTheDocument();
    expect(screen.getByText("00:20:06")).toBeInTheDocument();
    expect(screen.getByLabelText("当前任务时间原始秒")).toHaveTextContent("1206.801");
    expect(screen.getByText("当前批次 2")).toBeInTheDocument();
    expect(screen.getByText("飞行中 2")).toBeInTheDocument();
    expect(screen.getByRole("slider", {name: "任务进度"})).toHaveAttribute("step", "0.001");
  });

  it("uses launch-time boundaries to derive the current batch", () => {
    const {rerender} = render(
      <MissionTimeline
        missionTimeSec={1_206.8}
        makespanSec={3_598.185}
        playing={false}
        rate={1}
        sorties={sorties}
        liveSorties={[]}
        onToggle={vi.fn()}
        onSeek={vi.fn()}
        onRateChange={vi.fn()}
      />
    );
    expect(screen.getByText("当前批次 1")).toBeInTheDocument();

    rerender(
      <MissionTimeline
        missionTimeSec={1_206.801}
        makespanSec={3_598.185}
        playing={false}
        rate={1}
        sorties={sorties}
        liveSorties={[]}
        onToggle={vi.fn()}
        onSeek={vi.fn()}
        onRateChange={vi.fn()}
      />
    );
    expect(screen.getByText("当前批次 2")).toBeInTheDocument();

    rerender(
      <MissionTimeline
        missionTimeSec={2_415.788}
        makespanSec={3_598.185}
        playing={false}
        rate={1}
        sorties={sorties}
        liveSorties={[]}
        onToggle={vi.fn()}
        onSeek={vi.fn()}
        onRateChange={vi.fn()}
      />
    );
    expect(screen.getByText("当前批次 3")).toBeInTheDocument();
  });

  it("reports play, seek and all supported playback rates through controlled callbacks", () => {
    const props = renderTimeline();

    fireEvent.click(screen.getByRole("button", {name: "播放任务"}));
    expect(props.onToggle).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByRole("slider", {name: "任务进度"}), {
      target: {value: "2415.788"}
    });
    expect(props.onSeek).toHaveBeenCalledWith(2_415.788);

    for (const rate of [1, 10, 30, 60] as const) {
      fireEvent.click(screen.getByRole("button", {name: `${rate} 倍速`}));
      expect(props.onRateChange).toHaveBeenCalledWith(rate);
    }
  });

  it("exposes a pause label while playing and disables controls while unavailable", () => {
    const {rerender} = render(
      <MissionTimeline
        missionTimeSec={5}
        makespanSec={10}
        playing
        rate={1}
        sorties={sorties}
        liveSorties={[]}
        onToggle={vi.fn()}
        onSeek={vi.fn()}
        onRateChange={vi.fn()}
      />
    );
    expect(screen.getByRole("button", {name: "暂停任务"})).toBeInTheDocument();

    rerender(
      <MissionTimeline
        missionTimeSec={0}
        makespanSec={0}
        playing={false}
        rate={1}
        sorties={[]}
        liveSorties={[]}
        disabled
        onToggle={vi.fn()}
        onSeek={vi.fn()}
        onRateChange={vi.fn()}
      />
    );
    expect(screen.getByRole("button", {name: "播放任务"})).toBeDisabled();
    expect(screen.getByRole("slider", {name: "任务进度"})).toBeDisabled();
  });
});
