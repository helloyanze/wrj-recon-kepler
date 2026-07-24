export const PLAYBACK_RATES = [1, 10, 30, 60] as const;

export type PlaybackRate = (typeof PLAYBACK_RATES)[number];

export interface MissionClockState {
  missionTimeSec: number;
  makespanSec: number;
  playing: boolean;
  rate: PlaybackRate;
}

function requireNonNegativeFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} 必须为非负有限数值`);
  }
}

function requireClockState(state: MissionClockState): void {
  requireNonNegativeFinite(state.makespanSec, "makespanSec");
  requireNonNegativeFinite(state.missionTimeSec, "missionTimeSec");
  if (state.missionTimeSec > state.makespanSec) {
    throw new RangeError("missionTimeSec 不能超过 makespanSec");
  }
  if (!PLAYBACK_RATES.includes(state.rate)) {
    throw new RangeError("rate 必须为 1、10、30 或 60");
  }
}

export function createMissionClock(makespanSec: number): MissionClockState {
  requireNonNegativeFinite(makespanSec, "makespanSec");
  return {
    missionTimeSec: 0,
    makespanSec,
    playing: false,
    rate: 1
  };
}

export function advanceMissionClock(
  state: MissionClockState,
  elapsedMs: number
): MissionClockState {
  requireClockState(state);
  requireNonNegativeFinite(elapsedMs, "elapsedMs");
  if (!state.playing) return state;
  if (state.missionTimeSec >= state.makespanSec) {
    return {...state, playing: false};
  }
  if (elapsedMs === 0) return state;

  const missionTimeSec = Math.min(
    state.makespanSec,
    state.missionTimeSec + elapsedMs / 1_000 * state.rate
  );
  return {
    ...state,
    missionTimeSec,
    playing: missionTimeSec < state.makespanSec
  };
}

export function pauseMissionClock(state: MissionClockState): MissionClockState {
  requireClockState(state);
  return state.playing ? {...state, playing: false} : state;
}

export function playMissionClock(state: MissionClockState): MissionClockState {
  requireClockState(state);
  if (state.makespanSec === 0) {
    return state.playing ? {...state, playing: false} : state;
  }
  return {
    ...state,
    missionTimeSec: state.missionTimeSec >= state.makespanSec ? 0 : state.missionTimeSec,
    playing: true
  };
}

export function toggleMissionClock(state: MissionClockState): MissionClockState {
  return state.playing ? pauseMissionClock(state) : playMissionClock(state);
}

export function seekMissionClock(
  state: MissionClockState,
  missionTimeSec: number
): MissionClockState {
  requireClockState(state);
  requireNonNegativeFinite(missionTimeSec, "missionTimeSec");
  const nextTimeSec = Math.min(state.makespanSec, missionTimeSec);
  return {
    ...state,
    missionTimeSec: nextTimeSec,
    playing: state.playing && nextTimeSec < state.makespanSec
  };
}

export function setMissionClockRate(
  state: MissionClockState,
  rate: PlaybackRate
): MissionClockState {
  requireClockState(state);
  if (!PLAYBACK_RATES.includes(rate)) {
    throw new RangeError("rate 必须为 1、10、30 或 60");
  }
  return state.rate === rate ? state : {...state, rate};
}

export function restartMissionClock(state: MissionClockState): MissionClockState {
  requireClockState(state);
  return {
    ...state,
    missionTimeSec: 0,
    playing: state.makespanSec > 0
  };
}
