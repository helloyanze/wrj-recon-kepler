import type {CaseBundleV2} from "../cases/caseBundle";
import type {MissionViewV1} from "./missionViewSchema";

export interface DynamicMetricCard {
  id: "finish-time" | "fuel" | "completion" | "retained" | "new-resources";
  label: string;
  value: number;
  unit: "s" | "kg" | "%" | "架";
  baselineValue: number | null;
  delta: number | null;
}

export function buildDynamicMetricCards(
  metrics: MissionViewV1["metrics"],
  baseline: CaseBundleV2["metrics"]
): DynamicMetricCard[] {
  return [
    {
      id: "finish-time",
      label: "任务完成时间",
      value: metrics.totalFinishTimeSec,
      unit: "s",
      baselineValue: baseline.missionMakespanSec,
      delta: metrics.totalFinishTimeSec - baseline.missionMakespanSec
    },
    {
      id: "fuel",
      label: "总油耗",
      value: metrics.totalFuelKg,
      unit: "kg",
      baselineValue: baseline.totalFuelKg,
      delta: metrics.totalFuelKg - baseline.totalFuelKg
    },
    {
      id: "completion",
      label: "任务完成率",
      value: metrics.totalCompletionRatio * 100,
      unit: "%",
      baselineValue: null,
      delta: null
    },
    {
      id: "retained",
      label: "原计划保留率",
      value: metrics.retainedPlanRatio * 100,
      unit: "%",
      baselineValue: null,
      delta: null
    },
    {
      id: "new-resources",
      label: "新增资源",
      value: metrics.newActiveResourceCount,
      unit: "架",
      baselineValue: null,
      delta: null
    }
  ];
}
