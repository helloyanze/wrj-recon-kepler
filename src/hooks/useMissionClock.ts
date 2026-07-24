import {useCallback, useEffect, useRef, useState} from "react";
import {
  advanceMissionClock,
  createMissionClock,
  pauseMissionClock,
  playMissionClock,
  restartMissionClock,
  seekMissionClock,
  setMissionClockRate,
  toggleMissionClock,
  type MissionClockState,
  type PlaybackRate
} from "../features/mission/missionClock";

export interface MissionClockController extends MissionClockState {
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (missionTimeSec: number) => void;
  setRate: (rate: PlaybackRate) => void;
  restart: () => void;
}

function createAutoplayClock(makespanSec: number): MissionClockState {
  return playMissionClock(createMissionClock(makespanSec));
}

export function useMissionClock(caseKey: string, makespanSec: number): MissionClockController {
  const [clock, setClock] = useState(() => createAutoplayClock(makespanSec));
  const frameIdRef = useRef<number>();
  const previousTimestampRef = useRef<number>();

  useEffect(() => {
    previousTimestampRef.current = undefined;
    setClock(createAutoplayClock(makespanSec));
  }, [caseKey, makespanSec]);

  useEffect(() => {
    previousTimestampRef.current = undefined;
    if (!clock.playing) return;

    const onFrame = (timestamp: number) => {
      const previousTimestamp = previousTimestampRef.current;
      previousTimestampRef.current = timestamp;
      if (previousTimestamp !== undefined) {
        setClock((current) => advanceMissionClock(current, timestamp - previousTimestamp));
      }
      frameIdRef.current = requestAnimationFrame(onFrame);
    };

    frameIdRef.current = requestAnimationFrame(onFrame);
    return () => {
      if (frameIdRef.current !== undefined) {
        cancelAnimationFrame(frameIdRef.current);
        frameIdRef.current = undefined;
      }
      previousTimestampRef.current = undefined;
    };
  }, [caseKey, clock.playing]);

  const play = useCallback(() => setClock(playMissionClock), []);
  const pause = useCallback(() => setClock(pauseMissionClock), []);
  const toggle = useCallback(() => setClock(toggleMissionClock), []);
  const seek = useCallback(
    (missionTimeSec: number) => setClock((current) => seekMissionClock(current, missionTimeSec)),
    []
  );
  const setRate = useCallback(
    (rate: PlaybackRate) => setClock((current) => setMissionClockRate(current, rate)),
    []
  );
  const restart = useCallback(() => setClock(restartMissionClock), []);

  return {
    ...clock,
    play,
    pause,
    toggle,
    seek,
    setRate,
    restart
  };
}
