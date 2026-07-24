import {createElement, StrictMode, type PropsWithChildren} from "react";
import {act, renderHook} from "@testing-library/react";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {
  advanceMissionClock,
  createMissionClock,
  pauseMissionClock,
  playMissionClock,
  restartMissionClock,
  seekMissionClock,
  setMissionClockRate,
  toggleMissionClock
} from "../../src/features/mission/missionClock";
import {useMissionClock} from "../../src/hooks/useMissionClock";

describe("mission clock", () => {
  it("advances by real delta multiplied by playback rate", () => {
    const state = {...createMissionClock(3_598.185), playing: true, rate: 30 as const};

    expect(advanceMissionClock(state, 1_000).missionTimeSec).toBe(30);
  });

  it("clamps at makespan and stops", () => {
    const state = {
      ...createMissionClock(100),
      missionTimeSec: 99,
      playing: true,
      rate: 10 as const
    };

    expect(advanceMissionClock(state, 1_000)).toMatchObject({
      missionTimeSec: 100,
      playing: false
    });
  });

  it("repairs a playing state that is already at the endpoint", () => {
    const state = {
      ...createMissionClock(100),
      missionTimeSec: 100,
      playing: true
    };

    expect(advanceMissionClock(state, 0)).toMatchObject({
      missionTimeSec: 100,
      playing: false
    });
  });

  it("does not advance while paused", () => {
    const state = seekMissionClock(createMissionClock(100), 25);

    expect(advanceMissionClock(state, 1_000)).toBe(state);
  });

  it("supports exact seeking and clamps only to the mission bounds", () => {
    const state = createMissionClock(3_598.185);

    expect(seekMissionClock(state, 1_206.801).missionTimeSec).toBe(1_206.801);
    expect(seekMissionClock(state, 4_000).missionTimeSec).toBe(3_598.185);
  });

  it("plays, pauses, toggles and replays from the end", () => {
    const atEnd = seekMissionClock(createMissionClock(100), 100);
    const replaying = playMissionClock(atEnd);

    expect(replaying).toMatchObject({missionTimeSec: 0, playing: true});
    expect(pauseMissionClock(replaying).playing).toBe(false);
    expect(toggleMissionClock(pauseMissionClock(replaying)).playing).toBe(true);
    expect(toggleMissionClock(replaying).playing).toBe(false);
  });

  it("sets only supported playback rates and restarts from zero", () => {
    for (const rate of [1, 10, 30, 60] as const) {
      expect(setMissionClockRate(createMissionClock(100), rate).rate).toBe(rate);
    }

    expect(restartMissionClock(seekMissionClock(createMissionClock(100), 42))).toMatchObject({
      missionTimeSec: 0,
      playing: true
    });
  });

  it("rejects non-finite or negative clock values", () => {
    expect(() => createMissionClock(-1)).toThrow(RangeError);
    expect(() => createMissionClock(Number.NaN)).toThrow(RangeError);
    expect(() => advanceMissionClock(createMissionClock(100), -1)).toThrow(RangeError);
    expect(() => advanceMissionClock(createMissionClock(100), Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => seekMissionClock(createMissionClock(100), -1)).toThrow(RangeError);
    expect(() => seekMissionClock(createMissionClock(100), Number.NaN)).toThrow(RangeError);
  });

  it("keeps a zero-length mission stopped", () => {
    const state = createMissionClock(0);

    expect(playMissionClock(state)).toMatchObject({missionTimeSec: 0, playing: false});
    expect(restartMissionClock(state)).toMatchObject({missionTimeSec: 0, playing: false});
  });
});

describe("useMissionClock", () => {
  let nextFrameId: number;
  let frames: Map<number, FrameRequestCallback>;

  const StrictWrapper = ({children}: PropsWithChildren) =>
    createElement(StrictMode, undefined, children);

  function runNextFrame(timestamp: number): void {
    const pending = [...frames.entries()];
    expect(pending).toHaveLength(1);
    const [id, callback] = pending[0];
    frames.delete(id);
    callback(timestamp);
  }

  beforeEach(() => {
    nextFrameId = 0;
    frames = new Map();
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      nextFrameId += 1;
      frames.set(nextFrameId, callback);
      return nextFrameId;
    }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => {
      frames.delete(id);
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses one animation-frame loop and ignores the first timestamp", () => {
    const {result} = renderHook(
      () => useMissionClock("R10:PLAN-10", 100),
      {wrapper: StrictWrapper}
    );

    expect(frames.size).toBe(1);
    act(() => result.current.setRate(10));
    act(() => runNextFrame(500_000));
    expect(result.current.missionTimeSec).toBe(0);
    expect(frames.size).toBe(1);

    act(() => runNextFrame(501_000));
    expect(result.current.missionTimeSec).toBe(10);
    expect(frames.size).toBe(1);
  });

  it("cancels frames while paused and resumes without a stale delta", () => {
    const {result} = renderHook(() => useMissionClock("R10", 100));

    act(() => runNextFrame(1_000));
    act(() => runNextFrame(2_000));
    expect(result.current.missionTimeSec).toBe(1);

    act(() => result.current.pause());
    expect(frames.size).toBe(0);
    act(() => result.current.play());
    expect(frames.size).toBe(1);
    act(() => runNextFrame(50_000));
    expect(result.current.missionTimeSec).toBe(1);
  });

  it("resets to zero, auto-plays and replaces the frame loop when caseKey changes", () => {
    const {result, rerender} = renderHook(
      ({caseKey, makespanSec}) => useMissionClock(caseKey, makespanSec),
      {
        initialProps: {caseKey: "R10", makespanSec: 100},
        wrapper: StrictWrapper
      }
    );

    act(() => runNextFrame(0));
    act(() => runNextFrame(5_000));
    expect(result.current.missionTimeSec).toBe(5);

    rerender({caseKey: "R11", makespanSec: 20});
    expect(result.current).toMatchObject({
      missionTimeSec: 0,
      makespanSec: 20,
      playing: true
    });
    expect(frames.size).toBe(1);
    act(() => runNextFrame(1_000_000));
    expect(result.current.missionTimeSec).toBe(0);
  });

  it("stops its frame loop at the endpoint and can replay from zero", () => {
    const {result} = renderHook(() => useMissionClock("R10", 2));

    act(() => runNextFrame(1_000));
    act(() => runNextFrame(4_000));
    expect(result.current).toMatchObject({missionTimeSec: 2, playing: false});
    expect(frames.size).toBe(0);

    act(() => result.current.play());
    expect(result.current).toMatchObject({missionTimeSec: 0, playing: true});
    expect(frames.size).toBe(1);
  });

  it("cancels the active frame when unmounted", () => {
    const {unmount} = renderHook(() => useMissionClock("R10", 100));
    expect(frames.size).toBe(1);

    unmount();

    expect(frames.size).toBe(0);
  });
});
