import {describe, expect, it} from "vitest";

import type {CaseBundleV2} from "../../src/features/cases/caseBundle";
import {buildDynamicMetricCards} from "../../src/features/dynamic-replanning/dynamicMetrics";
import type {MissionViewV1} from "../../src/features/dynamic-replanning/missionViewSchema";
import {missionViewFixture} from "../fixtures/task2MissionViewFixture";

const baselineMetrics: CaseBundleV2["metrics"] = {
  uavCount: 2,
  sortieCount: 2,
  batchCount: 1,
  stripCount: 15,
  coverageRatio: 0.99,
  missionMakespanSec: 100,
  totalDistanceM: 1_000,
  totalFuelKg: 10
};

describe("buildDynamicMetricCards", () => {
  it("compares only semantically matching time and fuel values", () => {
    const metrics: MissionViewV1["metrics"] = {
      ...missionViewFixture.metrics,
      totalFinishTimeSec: 120,
      totalFuelKg: 12,
      totalCompletionRatio: 0.8,
      retainedPlanRatio: 0.6,
      newActiveResourceCount: 1
    };
    const cards = buildDynamicMetricCards(metrics, baselineMetrics);

    expect(cards.find(item => item.id === "finish-time"))
      .toMatchObject({baselineValue: 100, delta: 20});
    expect(cards.find(item => item.id === "fuel"))
      .toMatchObject({baselineValue: 10, delta: 2});
    expect(cards.find(item => item.id === "completion"))
      .toMatchObject({value: 80, baselineValue: null, delta: null});
    expect(cards.find(item => item.id === "retained"))
      .toMatchObject({value: 60, baselineValue: null, delta: null});
  });

  it("never compares Task 1 coverage ratio to Task 2 completion", () => {
    const cards = buildDynamicMetricCards(
      missionViewFixture.metrics,
      {...baselineMetrics, coverageRatio: 0.123}
    );
    expect(cards.find(item => item.id === "completion")?.baselineValue)
      .toBeNull();
  });
});
