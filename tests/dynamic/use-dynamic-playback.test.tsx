import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {act, renderHook} from "@testing-library/react";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

import {caseBundleSchema} from "../../src/features/cases/caseBundle";
import {buildDynamicScene} from "../../src/features/dynamic-replanning/buildDynamicScene";
import {decisionTraceV1Schema} from "../../src/features/dynamic-replanning/decisionTraceSchema";
import {
  sceneConfigSchema,
  sceneProvenanceSchema
} from "../../src/features/dynamic-replanning/dynamicSceneSchema";
import {missionViewV1Schema} from "../../src/features/dynamic-replanning/missionViewSchema";
import {useDynamicPlayback} from "../../src/hooks/useDynamicPlayback";
import {
  decisionTraceFixture,
  missionViewFixture,
  sceneConfigFixture,
  sceneProvenanceFixture
} from "../fixtures/task2MissionViewFixture";

const baseline = caseBundleSchema.parse(JSON.parse(readFileSync(resolve(
  "public/data/integration-cases/R01-BASELINE-01/bundle.json"
), "utf8")));

function buildScene(sceneId = "resource-lost") {
  return buildDynamicScene({
    config: sceneConfigSchema.parse({...sceneConfigFixture, sceneId}),
    baseline,
    view: missionViewV1Schema.parse(missionViewFixture),
    decisionTrace: decisionTraceV1Schema.parse(decisionTraceFixture),
    failureReport: null,
    provenance: sceneProvenanceSchema.parse(sceneProvenanceFixture)
  });
}

describe("useDynamicPlayback", () => {
  let nextFrameId: number;
  let frames: Map<number, FrameRequestCallback>;

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
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        nextFrameId += 1;
        frames.set(nextFrameId, callback);
        return nextFrameId;
      })
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => {
      frames.delete(id);
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("schedules frames only while playing and ignores a resume timestamp", () => {
    const {result} = renderHook(() => useDynamicPlayback(buildScene()));
    expect(frames.size).toBe(0);

    act(() => result.current.play());
    expect(frames.size).toBe(1);
    act(() => runNextFrame(1_000));
    act(() => runNextFrame(2_000));
    expect(result.current.missionTimeSec).toBe(86);

    act(() => result.current.pause());
    expect(frames.size).toBe(0);
    act(() => result.current.play());
    act(() => runNextFrame(50_000));
    expect(result.current.missionTimeSec).toBe(86);
  });

  it("resets to READY when the scene changes", () => {
    const {result, rerender} = renderHook(
      ({scene}) => useDynamicPlayback(scene),
      {initialProps: {scene: buildScene()}}
    );
    act(() => result.current.play());
    act(() => runNextFrame(1_000));
    act(() => runNextFrame(3_000));
    expect(result.current.phase).toBe("BASELINE_RUNNING");

    rerender({scene: buildScene("low-fuel-return")});
    expect(result.current).toMatchObject({
      phase: "READY",
      playing: false,
      automaticCamera: true
    });
    expect(frames.size).toBe(0);
  });
});
