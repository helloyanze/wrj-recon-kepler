import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

import {caseBundleSchema} from "../../src/features/cases/caseBundle";
import {buildDynamicScene} from "../../src/features/dynamic-replanning/buildDynamicScene";
import {
  automaticDecisionStageIndex,
  buildCandidatePresentations,
  buildDecisionStagePresentation,
  isPlanPublished
} from "../../src/features/dynamic-replanning/decisionPresentation";
import {
  candidateLevelLabel,
  decisionFactLabel,
  decisionUnitLabel,
  eventAuditReasonLabel,
  eventStatusLabel,
  eventTypeLabel,
  failureCodeLabel,
  lifecycleLabel,
  selectionReasonLabel,
  stageLabel,
  validationCodeLabel
} from "../../src/features/dynamic-replanning/decisionLabels";
import {decisionTraceV1Schema} from "../../src/features/dynamic-replanning/decisionTraceSchema";
import type {
  DynamicPlaybackPhase,
  DynamicPlaybackState
} from "../../src/features/dynamic-replanning/dynamicPlayback";
import {
  sceneConfigSchema,
  sceneProvenanceSchema
} from "../../src/features/dynamic-replanning/dynamicSceneSchema";
import {missionViewV1Schema} from "../../src/features/dynamic-replanning/missionViewSchema";
import {
  decisionTraceFixture,
  dynamicEventsFixture,
  missionViewFixture,
  sceneConfigFixture,
  sceneProvenanceFixture,
  taskGeometryDiffFixture
} from "../fixtures/task2MissionViewFixture";

const baseline = caseBundleSchema.parse(JSON.parse(readFileSync(resolve(
  "public/data/integration-cases/R01-BASELINE-01/bundle.json"
), "utf8")));
const scene = buildDynamicScene({
  config: sceneConfigSchema.parse(sceneConfigFixture),
  baseline,
  view: missionViewV1Schema.parse(missionViewFixture),
  dynamicEvents: dynamicEventsFixture,
  geometryDiff: taskGeometryDiffFixture,
  decisionTrace: decisionTraceV1Schema.parse(decisionTraceFixture),
  failureReport: null,
  provenance: sceneProvenanceSchema.parse(sceneProvenanceFixture)
});

const selectedMetrics = {
  highPriorityCompletionRatio: 1,
  totalCompletionRatio: 0.9,
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
    metrics: selectedMetrics,
    validationChecks: [],
    rejectionCodes: [],
    failureCodes: [],
    rank: 2,
    selected: false,
    ...overrides
  };
}

function traceWith(candidates: unknown[], selection: Record<string, unknown>) {
  return decisionTraceV1Schema.parse({
    ...decisionTraceFixture,
    selectedCandidateId: selection.selectedCandidateId ?? null,
    stages: decisionTraceFixture.stages.map(stage => ({
      ...stage,
      candidateIds: candidates.map(item =>
        (item as {candidateId: string}).candidateId
      )
    })),
    candidates,
    selection: {
      orderedCandidateIds: candidates.map(item =>
        (item as {candidateId: string}).candidateId
      ),
      reasonCodes: [],
      ...selection
    }
  });
}

function primaryText(presentation: ReturnType<
  typeof buildCandidatePresentations
>[number]): string {
  return [
    presentation.title,
    presentation.strategy,
    presentation.verdict,
    presentation.reason,
    ...presentation.planData.flatMap(row => [row.label, row.value]),
    ...presentation.evidence.flatMap(row => [row.label, row.value]),
    presentation.comparison ?? ""
  ].join(" ");
}

function playback(
  phase: DynamicPlaybackPhase,
  presentationElapsedMs = 0
): DynamicPlaybackState {
  return {
    phase,
    missionTimeSec: scene.eventTimeSec,
    presentationElapsedMs,
    playing: true,
    rate: 1,
    automaticCamera: true
  };
}

describe("decision presentation", () => {
  it("maps the frozen presentation to all seven backend stages", () => {
    expect(automaticDecisionStageIndex(playback("EVENT_ALERT"), scene)).toBe(0);
    expect(automaticDecisionStageIndex(
      playback("IMPACT_REVEAL", scene.config.playback.impactRevealMs),
      scene
    )).toBe(2);
    expect(automaticDecisionStageIndex(
      playback("REPLAN_EXPLAINER", 0),
      scene
    )).toBe(3);
    expect(automaticDecisionStageIndex(
      playback(
        "REPLAN_EXPLAINER",
        scene.config.playback.replanExplainerMs
      ),
      scene
    )).toBe(5);
    expect(automaticDecisionStageIndex(
      playback("PLAN_TRANSITION"),
      scene
    )).toBe(6);
  });

  it("does not expose publication state before the publication phase", () => {
    expect(isPlanPublished(playback("REPLAN_EXPLAINER"))).toBe(false);
    expect(isPlanPublished(playback("PLAN_TRANSITION"))).toBe(true);
  });

  it("explains a rejected low-fuel candidate with measured facts", () => {
    const trace = traceWith([candidate({
      candidateId: "CAND-LOW-FUEL",
      level: "L3_STANDBY_LAUNCH",
      lifecycle: "rejected",
      metrics: null,
      rank: null,
      rejectionCodes: ["INSUFFICIENT_REMAINING_FUEL"],
      failureCodes: ["INSUFFICIENT_REMAINING_FUEL"],
      facts: [
        {code: "REQUIRED_FUEL_KG", value: 114.8, unit: "KG", objectIds: ["UAV-01"]},
        {code: "REMAINING_FUEL_KG", value: 90, unit: "KG", objectIds: ["UAV-01"]}
      ]
    })], {selectedCandidateId: null});

    const [presentation] = buildCandidatePresentations(trace);
    expect(presentation).toMatchObject({
      title: "方案 A",
      strategy: "备份机接替",
      verdict: "拒绝",
      tone: "rejected"
    });
    expect(presentation.reason).toContain("剩余油量不足");
    expect(presentation.reason).toMatch(/所需油量 114\.8 千克.*剩余油量 90 千克/u);
    expect(presentation.evidence.map(row => row.value).join(" "))
      .toMatch(/114\.8.*90/u);
    expect(primaryText(presentation)).not.toMatch(
      /L3_STANDBY_LAUNCH|rejected|INSUFFICIENT_REMAINING_FUEL|\bKG\b|UAV-01/u
    );
    expect(presentation.audit.map(row => row.value).join(" "))
      .toContain("INSUFFICIENT_REMAINING_FUEL");
  });

  it("prioritizes a failed validation check over rejection codes", () => {
    const trace = traceWith([candidate({
      candidateId: "CAND-DEADLINE",
      lifecycle: "rejected",
      metrics: null,
      rank: null,
      validationChecks: [{
        checkId: "CHK-1",
        name: "hard_deadline_TASK-REG-001",
        passed: false,
        code: "HARD_DEADLINE_MISSED",
        affectedObjectIds: ["TASK-REG-001"]
      }],
      rejectionCodes: ["INSUFFICIENT_REMAINING_FUEL"],
      facts: [{
        code: "REQUIRED_FUEL_KG",
        value: 20,
        unit: "KG",
        objectIds: ["UAV-01"]
      }]
    })], {selectedCandidateId: null});

    const [presentation] = buildCandidatePresentations(trace);
    expect(presentation.reason).toContain("无法满足硬截止时间");
    expect(presentation.reason).not.toContain("剩余油量不足");
    expect(presentation.audit.map(row => row.value).join(" ")).toContain("CHK-1");
  });

  it("stops valid-candidate comparison at the first unequal metric", () => {
    const trace = traceWith([
      candidate({
        candidateId: "CAND-WINNER",
        lifecycle: "selected",
        selected: true,
        rank: 1,
        metrics: selectedMetrics
      }),
      candidate({
        candidateId: "CAND-RUNNER-UP",
        metrics: {
          ...selectedMetrics,
          retainedPlanRatio: 0.6,
          totalFuelKg: 20
        }
      })
    ], {
      selectedCandidateId: "CAND-WINNER",
      reasonCodes: ["LEXICOGRAPHIC_RANKING"]
    });

    const [winner, runnerUp] = buildCandidatePresentations(trace);
    expect(winner.verdict).toBe("接受");
    expect(winner.comparison).toMatch(/方案 B.*计划保留率.*70\.0%.*60\.0%/u);
    expect(runnerUp.verdict).toBe("可执行但未选中");
    expect(runnerUp.comparison).toMatch(/方案 A.*计划保留率.*60\.0%.*70\.0%/u);
    expect(runnerUp.comparison).not.toContain("油耗");
  });

  it("shows safe fallback and explicit missing-data text", () => {
    const trace = traceWith([candidate({
      candidateId: "CAND-FALLBACK",
      lifecycle: "fallback",
      selected: true,
      rank: 1,
      metrics: null,
      allocations: [],
      affectedTaskIds: [],
      affectedResourceIds: [],
      facts: [],
      failureCodes: ["E503_PARTIAL_SAFE_FALLBACK"]
    })], {
      selectedCandidateId: "CAND-FALLBACK",
      reasonCodes: ["SAFE_FALLBACK_REQUIRED"]
    });

    const [presentation] = buildCandidatePresentations(trace);
    expect(presentation).toMatchObject({
      strategy: "安全回退",
      verdict: "安全回退",
      tone: "fallback"
    });
    expect(presentation.reason).toContain("完整目标无法满足");
    expect(presentation.planData).toEqual([{label: "方案数据", value: "暂无记录"}]);
  });

  it("presents event governance in Chinese while retaining raw audit values", () => {
    const stage = decisionTraceV1Schema.parse({
      ...decisionTraceFixture,
      stages: decisionTraceFixture.stages.map((item, index) => index === 0 ? {
        ...item,
        facts: [
          {code: "RECEIVED_EVENT_COUNT", value: 2, unit: "COUNT", objectIds: []},
          {code: "EFFECTIVE_EVENT_COUNT", value: 1, unit: "COUNT", objectIds: []},
          {code: "OVERRIDDEN_EVENT_COUNT", value: 1, unit: "COUNT", objectIds: []},
          {
            code: "EVENT_AUDIT_ENTRY",
            value: {
              eventType: "TASK_GEOMETRY_CHANGED",
              status: "MERGED_INTO_OTHER_EVENT",
              reason: "superseded by higher-precedence or later event",
              winningEventId: "EV-CANCEL"
            },
            unit: null,
            objectIds: ["EV-GEOMETRY"]
          }
        ]
      } : item)
    }).stages[0];

    const presentation = buildDecisionStagePresentation(stage);
    expect(presentation).toMatchObject({
      title: "接收并治理动态事件",
      modules: ["T2-M01", "T2-M03"]
    });
    expect(presentation.data.map(row => row.value).join(" "))
      .toMatch(/2 项.*1 项.*任务区域变化.*已并入其他事件/u);
    expect(presentation.conclusion).toContain("取消事件");
    expect(presentation.audit.map(row => row.value).join(" "))
      .toMatch(/TASK_GEOMETRY_CHANGED.*MERGED_INTO_OTHER_EVENT.*EV-CANCEL/u);
  });

  it("covers every committed trace code with a Chinese label or audit fallback", () => {
    const traces = JSON.parse(readFileSync(resolve(
      "public/data/task2/scenes/catalog.json"
    ), "utf8")) as {scenes: Array<{baseUrl: string}>};
    const parsed = traces.scenes.map(entry => decisionTraceV1Schema.parse(
      JSON.parse(readFileSync(resolve(
        "public/data",
        entry.baseUrl,
        "decision_trace.v1.json"
      ), "utf8"))
    ));
    const labels = [
      ...parsed.flatMap(trace => trace.stages.map(stage => stageLabel(stage.stageId))),
      ...parsed.flatMap(trace => trace.candidates.map(item => candidateLevelLabel(item.level))),
      ...parsed.flatMap(trace => trace.candidates.map(item => lifecycleLabel(item.lifecycle))),
      ...parsed.flatMap(trace => trace.candidates.flatMap(item => item.rejectionCodes.map(failureCodeLabel))),
      ...parsed.flatMap(trace => trace.candidates.flatMap(item => item.failureCodes.map(failureCodeLabel))),
      ...parsed.flatMap(trace => trace.stages.flatMap(stage => stage.failureCodes.map(failureCodeLabel))),
      ...parsed.flatMap(trace => trace.candidates.flatMap(item => item.validationChecks.flatMap(check => check.code === null ? [] : [validationCodeLabel(check.code)]))),
      ...parsed.flatMap(trace => trace.selection.reasonCodes.map(selectionReasonLabel)),
      ...parsed.flatMap(trace => trace.stages.flatMap(stage => stage.facts.map(fact => decisionFactLabel(fact.code)))),
      ...parsed.flatMap(trace => trace.candidates.flatMap(item => item.facts.map(fact => decisionFactLabel(fact.code)))),
      ...parsed.flatMap(trace => trace.stages.flatMap(stage => stage.facts.flatMap(fact => fact.unit === null ? [] : [decisionUnitLabel(fact.unit)]))),
      ...parsed.flatMap(trace => trace.candidates.flatMap(item => item.facts.flatMap(fact => fact.unit === null ? [] : [decisionUnitLabel(fact.unit)])))
    ];
    expect(labels.every(label => label.known)).toBe(true);
    expect(labels.every(label => /[\u3400-\u9fff]/u.test(label.label))).toBe(true);

    const audit = parsed.flatMap(trace => trace.stages.flatMap(stage => stage.facts))
      .filter(fact => fact.code === "EVENT_AUDIT_ENTRY")
      .map(fact => fact.value as {eventType: string; status: string; reason: string | null});
    expect(audit.every(item => eventTypeLabel(item.eventType).known))
      .toBe(true);
    expect(audit.every(item => eventStatusLabel(item.status).known))
      .toBe(true);
    expect(audit.filter(item => item.reason !== null).every(item =>
      eventAuditReasonLabel(item.reason as string).known
    )).toBe(true);

    const candidatePresentations = parsed.flatMap(buildCandidatePresentations);
    expect(candidatePresentations.filter(item => item.tone === "rejected"))
      .not.toHaveLength(0);
    expect(candidatePresentations.filter(item => item.verdict === "可执行但未选中"))
      .not.toHaveLength(0);
    expect(candidatePresentations.every(item => !(
      /L[1-5]_|generated|rejected|selected|fallback|\bKG\b|CAND-/u
    ).test(primaryText(item)))).toBe(true);
    expect(candidatePresentations.filter(item => item.tone === "rejected")
      .every(item => item.reason !== "未提供可解释原因" &&
        item.evidence.some(row => row.value !== "暂无记录")))
      .toBe(true);
    expect(candidatePresentations.filter(item => item.verdict === "可执行但未选中")
      .every(item => item.comparison !== null && item.comparison !== "暂无记录"))
      .toBe(true);

    const stagePresentations = parsed.flatMap(trace =>
      trace.stages.map(buildDecisionStagePresentation)
    );
    expect(stagePresentations.every(item => !(
      /EVENT_INGESTION|SNAPSHOT_AND_IMPACT|RESOURCE_ASSESSMENT|CANDIDATE_GENERATION|PLANNING_AND_VALIDATION|RANKING_AND_SELECTION|PLAN_PUBLICATION/u
    ).test([
      item.title,
      item.conclusion,
      ...item.data.flatMap(row => [row.label, row.value])
    ].join(" ")))).toBe(true);
  });

  it("keeps unknown codes out of primary text and preserves them in audit", () => {
    expect(failureCodeLabel("UNKNOWN_REASON")).toEqual({
      label: "未识别代码（UNKNOWN_REASON）",
      known: false
    });
    const trace = traceWith([candidate({
      candidateId: "CAND-UNKNOWN",
      lifecycle: "rejected",
      metrics: null,
      rank: null,
      allocations: [],
      rejectionCodes: ["UNKNOWN_REASON"]
    })], {selectedCandidateId: null});

    const [presentation] = buildCandidatePresentations(trace);
    expect(presentation.reason).toBe("未提供可解释原因");
    expect(primaryText(presentation)).not.toContain("UNKNOWN_REASON");
    expect(presentation.audit.map(row => row.value).join(" "))
      .toContain("UNKNOWN_REASON");
  });
});
