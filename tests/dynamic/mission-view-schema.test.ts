import {describe, expect, it} from "vitest";

import {
  failureReportSchema,
  missionViewV1Schema
} from "../../src/features/dynamic-replanning/missionViewSchema";
import {
  failureReportFixture,
  missionViewFixture
} from "../fixtures/task2MissionViewFixture";

describe("missionViewV1Schema", () => {
  it("accepts the complete camelCase mission_view.v1 contract", () => {
    expect(missionViewV1Schema.parse(missionViewFixture).schemaVersion)
      .toBe("mission_view.v1");
  });

  it("rejects unknown fields and invalid plan states", () => {
    expect(() => missionViewV1Schema.parse({
      ...missionViewFixture,
      unexpected: true
    })).toThrow();
    expect(() => missionViewV1Schema.parse({
      ...missionViewFixture,
      activePlan: {
        ...missionViewFixture.activePlan,
        planStatus: "OK"
      }
    })).toThrow();
  });

  it("rejects a segment whose finish precedes its start", () => {
    const trajectory = missionViewFixture.trajectories[0];
    const segment = trajectory.segments[0];
    expect(() => missionViewV1Schema.parse({
      ...missionViewFixture,
      trajectories: [{
        ...trajectory,
        segments: [{
          ...segment,
          finishTimeSec: segment.startTimeSec - 1
        }]
      }]
    })).toThrow(/finish/i);
  });

  it("accepts the explicit safe-fallback report contract", () => {
    expect(failureReportSchema.parse(failureReportFixture).safeActions)
      .toEqual(["RETURN_TO_BASE"]);
  });
});
