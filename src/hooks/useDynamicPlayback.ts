import {useCallback, useEffect, useRef, useState} from "react";

import type {DynamicScene} from "../features/dynamic-replanning/buildDynamicScene";
import {
  advanceDynamicPlayback,
  createDynamicPlayback,
  disableAutomaticCamera,
  pauseDynamicPlayback,
  playDynamicPlayback,
  restartDynamicPlayback,
  seekDynamicPlayback,
  setDynamicPlaybackRate,
  toggleDynamicPlayback,
  type DynamicPlaybackState,
  type PlaybackRate
} from "../features/dynamic-replanning/dynamicPlayback";

export interface DynamicPlaybackController extends DynamicPlaybackState {
  play(): void;
  pause(): void;
  toggle(): void;
  seek(timeSec: number): void;
  setRate(rate: PlaybackRate): void;
  restart(): void;
  disableAutomaticCamera(): void;
}

export function useDynamicPlayback(
  scene: DynamicScene
): DynamicPlaybackController {
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const [playback, setPlayback] = useState(
    () => createDynamicPlayback(scene)
  );
  const frameIdRef = useRef<number>();
  const previousTimestampRef = useRef<number>();
  const sceneId = scene.config.sceneId;

  useEffect(() => {
    previousTimestampRef.current = undefined;
    setPlayback(createDynamicPlayback(sceneRef.current));
  }, [sceneId]);

  useEffect(() => {
    previousTimestampRef.current = undefined;
    if (!playback.playing) return;

    const onFrame = (timestamp: number): void => {
      const previousTimestamp = previousTimestampRef.current;
      previousTimestampRef.current = timestamp;
      if (previousTimestamp !== undefined) {
        setPlayback(current => advanceDynamicPlayback(
          current,
          timestamp - previousTimestamp,
          sceneRef.current
        ));
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
  }, [sceneId, playback.playing]);

  const play = useCallback(
    () => setPlayback(playDynamicPlayback),
    []
  );
  const pause = useCallback(
    () => setPlayback(pauseDynamicPlayback),
    []
  );
  const toggle = useCallback(
    () => setPlayback(toggleDynamicPlayback),
    []
  );
  const seek = useCallback(
    (timeSec: number) => setPlayback(current =>
      seekDynamicPlayback(current, timeSec, sceneRef.current)
    ),
    []
  );
  const setRate = useCallback(
    (rate: PlaybackRate) => setPlayback(current =>
      setDynamicPlaybackRate(current, rate)
    ),
    []
  );
  const restart = useCallback(
    () => setPlayback(current =>
      restartDynamicPlayback(current, sceneRef.current)
    ),
    []
  );
  const disableCamera = useCallback(
    () => setPlayback(disableAutomaticCamera),
    []
  );

  return {
    ...playback,
    play,
    pause,
    toggle,
    seek,
    setRate,
    restart,
    disableAutomaticCamera: disableCamera
  };
}
