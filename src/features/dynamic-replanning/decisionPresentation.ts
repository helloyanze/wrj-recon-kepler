import type {DynamicScene} from "./buildDynamicScene";
import type {
  DynamicPlaybackState
} from "./dynamicPlayback";

export function automaticDecisionStageIndex(
  playback: DynamicPlaybackState,
  scene: DynamicScene
): number | null {
  const progress = (duration: number): number => duration <= 0
    ? 1
    : Math.min(1, playback.presentationElapsedMs / duration);
  switch (playback.phase) {
    case "EVENT_ALERT":
      return 0;
    case "IMPACT_REVEAL":
      return progress(scene.config.playback.impactRevealMs) < 0.5 ? 1 : 2;
    case "REPLAN_EXPLAINER": {
      const value = progress(scene.config.playback.replanExplainerMs);
      return value < 1 / 3 ? 3 : value < 2 / 3 ? 4 : 5;
    }
    case "PLAN_TRANSITION":
    case "ACTIVE_PLAN_RUNNING":
    case "RESULT_HOLD":
      return 6;
    default:
      return null;
  }
}

export function isPlanPublished(
  playback: DynamicPlaybackState
): boolean {
  return playback.phase === "PLAN_TRANSITION" ||
    playback.phase === "ACTIVE_PLAN_RUNNING" ||
    playback.phase === "RESULT_HOLD";
}
