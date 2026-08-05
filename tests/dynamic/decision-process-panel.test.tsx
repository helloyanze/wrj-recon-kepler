import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {cleanup, fireEvent, render, screen, within} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";

import {DecisionProcessPanel} from "../../src/components/dynamic/DecisionProcessPanel";
import {caseBundleSchema} from "../../src/features/cases/caseBundle";
import {buildDynamicScene} from "../../src/features/dynamic-replanning/buildDynamicScene";
import {decisionTraceV1Schema} from "../../src/features/dynamic-replanning/decisionTraceSchema";
import {
  sceneConfigSchema,
  sceneProvenanceSchema
} from "../../src/features/dynamic-replanning/dynamicSceneSchema";
import {
  failureReportSchema,
  missionViewV1Schema
} from "../../src/features/dynamic-replanning/missionViewSchema";
import {
  decisionTraceFixture,
  missionViewFixture,
  sceneConfigFixture,
  sceneProvenanceFixture
} from "../fixtures/task2MissionViewFixture";

afterEach(cleanup);

const baseline = caseBundleSchema.parse(JSON.parse(readFileSync(resolve(
  "public/data/integration-cases/R01-BASELINE-01/bundle.json"
), "utf8")));
const metrics = {
  highPriorityCompletionRatio: 1,
  totalCompletionRatio: 0.95,
  retainedPlanRatio: 0.7,
  newActiveResourceCount: 1,
  totalFinishTimeSec: 500,
  totalFuelKg: 60
};

function candidate(overrides: Record<string, unknown>) {
  return {
    candidateId: "CAND-BASE",
    level: "L1_MINIMAL_ADJUSTMENT",
    lifecycle: "valid",
    affectedTaskIds: ["TASK-REG-001"],
    affectedResourceIds: ["UAV-01"],
    allocations: [{
      taskId: "TASK-REG-001",
      resourceIds: ["UAV-01"],
      workUnitIds: ["ST-0001"]
    }],
    facts: [],
    metrics,
    validationChecks: [],
    rejectionCodes: [],
    failureCodes: [],
    rank: 2,
    selected: false,
    ...overrides
  };
}

function sceneWith(
  candidates: unknown[],
  selectedCandidateId: string | null,
  resultStatus: "COMPLETE" | "PARTIAL_SAFE_FALLBACK" = "COMPLETE"
) {
  const candidateIds = candidates.map(item =>
    (item as {candidateId: string}).candidateId
  );
  const trace = decisionTraceV1Schema.parse({
    ...decisionTraceFixture,
    resultStatus,
    selectedCandidateId,
    stages: decisionTraceFixture.stages.map((stage, index) => ({
      ...stage,
      status: resultStatus === "PARTIAL_SAFE_FALLBACK" && index >= 4
        ? "SAFE_FALLBACK"
        : "COMPLETED",
      candidateIds: index >= 3 ? candidateIds : [],
      failureCodes: resultStatus === "PARTIAL_SAFE_FALLBACK" && index >= 4
        ? ["E503_PARTIAL_SAFE_FALLBACK"]
        : []
    })),
    candidates,
    selection: {
      orderedCandidateIds: candidateIds,
      selectedCandidateId,
      reasonCodes: resultStatus === "PARTIAL_SAFE_FALLBACK"
        ? ["SAFE_FALLBACK_REQUIRED"]
        : ["LEXICOGRAPHIC_RANKING"]
    },
    publication: {
      ...decisionTraceFixture.publication,
      planStatus: resultStatus,
      failureReportPath: resultStatus === "PARTIAL_SAFE_FALLBACK"
        ? "failure_report.json"
        : null
    }
  });
  return buildDynamicScene({
    config: sceneConfigSchema.parse({
      ...sceneConfigFixture,
      resultStatus
    }),
    baseline,
    view: missionViewV1Schema.parse({
      ...missionViewFixture,
      activePlan: {
        ...missionViewFixture.activePlan,
        planStatus: resultStatus
      }
    }),
    decisionTrace: trace,
    failureReport: resultStatus === "PARTIAL_SAFE_FALLBACK"
      ? failureReportSchema.parse({
          attemptId: trace.attemptId,
          sourcePlanVersion: trace.sourcePlanVersion,
          failures: [{
            code: "E503_PARTIAL_SAFE_FALLBACK",
            stage: "PLAN_PUBLICATION",
            message: "完整目标无法满足，已形成安全回退。",
            affectedObjectIds: ["TASK-REG-001"],
            recoverable: false,
            details: {}
          }]
        })
      : null,
    provenance: sceneProvenanceSchema.parse(sceneProvenanceFixture)
  });
}

function renderPanel(scene = sceneWith([
  candidate({
    candidateId: "CAND-SELECTED",
    lifecycle: "selected",
    selected: true,
    rank: 1
  }),
  candidate({
    candidateId: "CAND-REJECTED",
    level: "L3_STANDBY_LAUNCH",
    lifecycle: "rejected",
    metrics: null,
    rank: null,
    rejectionCodes: ["INSUFFICIENT_REMAINING_FUEL"],
    failureCodes: ["INSUFFICIENT_REMAINING_FUEL"],
    facts: [
      {code: "REQUIRED_FUEL_KG", value: 80, unit: "KG", objectIds: ["UAV-01"]},
      {code: "REMAINING_FUEL_KG", value: 50, unit: "KG", objectIds: ["UAV-01"]}
    ]
  })
], "CAND-SELECTED")) {
  render(
    <DecisionProcessPanel
      scene={scene}
      stageIndex={4}
      manual={false}
      playing={false}
      onSelectStage={vi.fn()}
      onPrevious={vi.fn()}
      onNext={vi.fn()}
      onPause={vi.fn()}
      onResumeAutomatic={vi.fn()}
    />
  );
}

function expectFixedOrder(card: HTMLElement) {
  const parts = ["结论", "原因", "方案数据", "对比证据"]
    .map(name => within(card).getByRole("heading", {name}));
  const audit = within(card).getByText("审计详情");
  [...parts, audit].reduce((before, after) => {
    expect(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
    return after;
  });
}

describe("decision process panel", () => {
  it("renders selected and rejected cards in the fixed five-part order", () => {
    renderPanel();

    const selected = screen.getByRole("article", {name: "方案 A"});
    const rejected = screen.getByRole("article", {name: "方案 B"});
    expectFixedOrder(selected);
    expectFixedOrder(rejected);
    expect(within(selected).getByText("接受")).toBeVisible();
    expect(within(rejected).getByText("拒绝")).toBeVisible();
    expect(within(rejected).getByText(/剩余油量不足/u)).toBeVisible();
    const requiredFuel = within(rejected).getByText("所需油量").closest("div");
    expect(requiredFuel).not.toBeNull();
    expect(within(requiredFuel as HTMLElement).getByText("80 千克")).toBeVisible();
  });

  it("keeps raw IDs and codes in a closed audit block", () => {
    renderPanel();

    const rejected = screen.getByRole("article", {name: "方案 B"});
    const details = within(rejected).getByText("审计详情").closest("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    const rawId = within(rejected).getByText("CAND-REJECTED");
    expect(rawId).not.toBeVisible();

    const primary = rejected.cloneNode(true) as HTMLElement;
    primary.querySelector("details")?.remove();
    expect(primary.textContent).not.toMatch(
      /L3_STANDBY_LAUNCH|rejected|INSUFFICIENT_REMAINING_FUEL|CAND-REJECTED/u
    );

    fireEvent.click(within(rejected).getByText("审计详情"));
    expect(rawId).toBeVisible();
    expect(within(rejected).getByText(/INSUFFICIENT_REMAINING_FUEL/u))
      .toBeVisible();
  });

  it("shows a data-backed safe fallback conclusion", () => {
    const fallbackScene = sceneWith([candidate({
      candidateId: "CAND-FALLBACK",
      lifecycle: "fallback",
      selected: true,
      rank: 1,
      metrics: null,
      allocations: [],
      failureCodes: ["E503_PARTIAL_SAFE_FALLBACK"]
    })], "CAND-FALLBACK", "PARTIAL_SAFE_FALLBACK");
    renderPanel(fallbackScene);

    const fallback = screen.getByRole("article", {name: "方案 A"});
    const conclusion = within(fallback).getByRole("heading", {name: "结论"})
      .parentElement;
    const reason = within(fallback).getByRole("heading", {name: "原因"})
      .parentElement;
    const planData = within(fallback).getByRole("heading", {name: "方案数据"})
      .parentElement;
    expect(conclusion).not.toBeNull();
    expect(reason).not.toBeNull();
    expect(planData).not.toBeNull();
    expect(within(conclusion as HTMLElement).getByText("安全回退")).toBeVisible();
    expect(within(reason as HTMLElement).getByText(/完整目标无法满足/u))
      .toBeVisible();
    expect(within(planData as HTMLElement).getByText("暂无记录")).toBeVisible();
  });
});
