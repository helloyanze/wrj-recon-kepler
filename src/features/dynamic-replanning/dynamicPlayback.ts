import {
  PLAYBACK_RATES,
  type PlaybackRate
} from "../mission/missionClock";
import type {DynamicScene} from "./buildDynamicScene";

export type DynamicPlaybackPhase =
  | "READY"
  | "BASELINE_RUNNING"
  | "EVENT_ALERT"
  | "IMPACT_REVEAL"
  | "REPLAN_EXPLAINER"
  | "PLAN_TRANSITION"
  | "ACTIVE_PLAN_RUNNING"
  | "RESULT_HOLD";

export interface DynamicPlaybackState {
  phase: DynamicPlaybackPhase;
  missionTimeSec: number;
  presentationElapsedMs: number;
  playing: boolean;
  rate: PlaybackRate;
  automaticCamera: boolean;
}

function requireElapsed(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative finite number`);
  }
}

function requireRate(rate: PlaybackRate): void {
  if (!PLAYBACK_RATES.includes(rate)) {
    throw new RangeError(`unsupported playback rate ${rate}`);
  }
}

function readyMissionTime(scene: DynamicScene): number {
  return Math.max(
    0,
    scene.eventTimeSec - scene.config.playback.baselineLeadInSec
  );
}

export function createDynamicPlayback(
  scene: DynamicScene
): DynamicPlaybackState {
  return {
    phase: "READY",
    missionTimeSec: readyMissionTime(scene),
    presentationElapsedMs: 0,
    playing: false,
    rate: 1,
    automaticCamera: true
  };
}

export function playDynamicPlayback(
  state: DynamicPlaybackState
): DynamicPlaybackState {
  if (state.playing) return state;
  return {
    ...state,
    phase: state.phase === "READY" ? "BASELINE_RUNNING" : state.phase,
    playing: true
  };
}

export function pauseDynamicPlayback(
  state: DynamicPlaybackState
): DynamicPlaybackState {
  return state.playing ? {...state, playing: false} : state;
}

export function toggleDynamicPlayback(
  state: DynamicPlaybackState
): DynamicPlaybackState {
  return state.playing
    ? pauseDynamicPlayback(state)
    : playDynamicPlayback(state);
}

function nextPresentationPhase(
  phase: DynamicPlaybackPhase
): DynamicPlaybackPhase {
  switch (phase) {
    case "EVENT_ALERT":
      return "IMPACT_REVEAL";
    case "IMPACT_REVEAL":
      return "REPLAN_EXPLAINER";
    case "REPLAN_EXPLAINER":
      return "PLAN_TRANSITION";
    case "PLAN_TRANSITION":
      return "ACTIVE_PLAN_RUNNING";
    default:
      return phase;
  }
}

function presentationDuration(
  phase: DynamicPlaybackPhase,
  scene: DynamicScene
): number | null {
  switch (phase) {
    case "EVENT_ALERT":
      return scene.config.playback.eventAlertMs;
    case "IMPACT_REVEAL":
      return scene.config.playback.impactRevealMs;
    case "REPLAN_EXPLAINER":
      return scene.config.playback.replanExplainerMs;
    case "PLAN_TRANSITION":
      return scene.config.playback.planTransitionMs;
    case "RESULT_HOLD":
      return scene.config.playback.resultHoldMs;
    default:
      return null;
  }
}

export function advanceDynamicPlayback(
  state: DynamicPlaybackState,
  elapsedMs: number,
  scene: DynamicScene
): DynamicPlaybackState {
  requireElapsed(elapsedMs, "elapsedMs");
  requireRate(state.rate);
  if (!state.playing || elapsedMs === 0) return state;

  let next = state;
  let remainingMs = elapsedMs;
  while (remainingMs >= 0 && next.playing) {
    if (next.phase === "READY") {
      next = {...next, phase: "BASELINE_RUNNING"};
      continue;
    }
    if (next.phase === "BASELINE_RUNNING") {
      const remainingMissionSec = Math.max(
        0,
        scene.eventTimeSec - next.missionTimeSec
      );
      const wallMsToEvent = remainingMissionSec * 1_000 / next.rate;
      if (remainingMs < wallMsToEvent) {
        return {
          ...next,
          missionTimeSec: next.missionTimeSec +
            remainingMs / 1_000 * next.rate
        };
      }
      remainingMs -= wallMsToEvent;
      next = {
        ...next,
        phase: "EVENT_ALERT",
        missionTimeSec: scene.eventTimeSec,
        presentationElapsedMs: 0
      };
      if (remainingMs === 0) return next;
      continue;
    }
    if (
      next.phase === "EVENT_ALERT" ||
      next.phase === "IMPACT_REVEAL" ||
      next.phase === "REPLAN_EXPLAINER" ||
      next.phase === "PLAN_TRANSITION"
    ) {
      const duration = presentationDuration(next.phase, scene) ?? 0;
      const phaseRemaining = Math.max(
        0,
        duration - next.presentationElapsedMs
      );
      if (remainingMs < phaseRemaining) {
        return {
          ...next,
          presentationElapsedMs:
            next.presentationElapsedMs + remainingMs
        };
      }
      remainingMs -= phaseRemaining;
      next = {
        ...next,
        phase: nextPresentationPhase(next.phase),
        presentationElapsedMs: 0
      };
      if (remainingMs === 0) return next;
      continue;
    }
    if (next.phase === "ACTIVE_PLAN_RUNNING") {
      const remainingMissionSec = Math.max(
        0,
        scene.makespanSec - next.missionTimeSec
      );
      const wallMsToFinish = remainingMissionSec * 1_000 / next.rate;
      if (remainingMs < wallMsToFinish) {
        return {
          ...next,
          missionTimeSec: next.missionTimeSec +
            remainingMs / 1_000 * next.rate
        };
      }
      remainingMs -= wallMsToFinish;
      next = {
        ...next,
        phase: "RESULT_HOLD",
        missionTimeSec: scene.makespanSec,
        presentationElapsedMs: 0
      };
      if (remainingMs === 0) return next;
      continue;
    }
    if (next.phase === "RESULT_HOLD") {
      const duration = presentationDuration(next.phase, scene) ?? 0;
      const phaseRemaining = Math.max(
        0,
        duration - next.presentationElapsedMs
      );
      if (remainingMs < phaseRemaining) {
        return {
          ...next,
          presentationElapsedMs:
            next.presentationElapsedMs + remainingMs
        };
      }
      return {
        ...next,
        presentationElapsedMs: duration,
        playing: false
      };
    }
  }
  return next;
}

export function seekDynamicPlayback(
  state: DynamicPlaybackState,
  missionTimeSec: number,
  scene: DynamicScene
): DynamicPlaybackState {
  requireElapsed(missionTimeSec, "missionTimeSec");
  const nextTime = Math.min(scene.makespanSec, missionTimeSec);
  const phase: DynamicPlaybackPhase = nextTime < scene.eventTimeSec
    ? "BASELINE_RUNNING"
    : nextTime < scene.makespanSec
      ? "ACTIVE_PLAN_RUNNING"
      : "RESULT_HOLD";
  return {
    ...state,
    phase,
    missionTimeSec: nextTime,
    presentationElapsedMs: 0,
    playing: state.playing && nextTime < scene.makespanSec
  };
}

export function setDynamicPlaybackRate(
  state: DynamicPlaybackState,
  rate: PlaybackRate
): DynamicPlaybackState {
  requireRate(rate);
  return state.rate === rate ? state : {...state, rate};
}

export function restartDynamicPlayback(
  state: DynamicPlaybackState,
  scene: DynamicScene
): DynamicPlaybackState {
  return {
    ...createDynamicPlayback(scene),
    rate: state.rate
  };
}

export function disableAutomaticCamera(
  state: DynamicPlaybackState
): DynamicPlaybackState {
  return state.automaticCamera
    ? {...state, automaticCamera: false}
    : state;
}

export type {PlaybackRate};
