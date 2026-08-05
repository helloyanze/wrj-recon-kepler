import type {DynamicScene} from "./buildDynamicScene";
import {
  candidateLevelLabel,
  decisionFactLabel,
  eventAuditReasonLabel,
  eventStatusLabel,
  eventTypeLabel,
  failureCodeLabel,
  formatDecisionValue,
  selectionReasonLabel,
  stageLabel,
  stageModules,
  validationCodeLabel
} from "./decisionLabels";
import type {
  DecisionCandidate,
  DecisionStage,
  DecisionTraceV1
} from "./decisionTraceSchema";
import type {
  DynamicPlaybackState
} from "./dynamicPlayback";

export interface PresentationDatum {
  label: string;
  value: string;
}

export interface AuditRow {
  label: string;
  value: string;
}

export interface CandidatePresentation {
  candidateId: string;
  title: string;
  strategy: string;
  verdict: string;
  tone: "accepted" | "rejected" | "candidate" | "fallback";
  reason: string;
  planData: PresentationDatum[];
  evidence: PresentationDatum[];
  comparison: string | null;
  audit: AuditRow[];
}

export interface DecisionStagePresentation {
  title: string;
  modules: string[];
  conclusion: string;
  data: PresentationDatum[];
  audit: AuditRow[];
}

const METRICS = [
  ["highPriorityCompletionRatio", "高优先级任务完成率", "ratio", "desc"],
  ["totalCompletionRatio", "总任务完成率", "ratio", "desc"],
  ["retainedPlanRatio", "计划保留率", "ratio", "desc"],
  ["newActiveResourceCount", "新增启用无人机数", "count", "asc"],
  ["totalFinishTimeSec", "完成时刻", "seconds", "asc"],
  ["totalFuelKg", "总油耗", "fuel", "asc"]
] as const satisfies ReadonlyArray<readonly [
  keyof NonNullable<DecisionCandidate["metrics"]>,
  string,
  "ratio" | "count" | "seconds" | "fuel",
  "asc" | "desc"
]>;

function metricValue(value: number, format: typeof METRICS[number][2]): string {
  switch (format) {
    case "ratio": return `${(value * 100).toFixed(1)}%`;
    case "count": return `${value} 架`;
    case "seconds": return `${value.toFixed(1)} 秒`;
    case "fuel": return `${value.toFixed(1)} 千克`;
  }
}

function candidateTitle(index: number): string {
  return index < 26 ? `方案 ${String.fromCharCode(65 + index)}` : `方案 ${index + 1}`;
}

function factRows(candidate: DecisionCandidate): PresentationDatum[] {
  return candidate.facts.flatMap(fact => {
    const label = decisionFactLabel(fact.code);
    return label.known ? [{
      label: label.label,
      value: formatDecisionValue(fact.code, fact.value, fact.unit)
    }] : [];
  });
}

function planData(candidate: DecisionCandidate): PresentationDatum[] {
  const rows: PresentationDatum[] = [];
  if (candidate.allocations.length > 0) {
    rows.push(
      {label: "涉及任务", value: `${new Set(candidate.allocations.map(item => item.taskId)).size} 项`},
      {label: "参与无人机", value: `${new Set(candidate.allocations.flatMap(item => item.resourceIds)).size} 架`},
      {label: "分配工作单元", value: `${new Set(candidate.allocations.flatMap(item => item.workUnitIds)).size} 项`}
    );
  }
  if (candidate.metrics !== null) {
    for (const [key, label, format] of METRICS) {
      rows.push({label, value: metricValue(candidate.metrics[key], format)});
    }
  }
  return rows.length === 0 ? [{label: "方案数据", value: "暂无记录"}] : rows;
}

function candidateEvidence(candidate: DecisionCandidate): PresentationDatum[] {
  const rows = factRows(candidate);
  for (const check of candidate.validationChecks.filter(item => !item.passed)) {
    const label = check.code === null ? null : validationCodeLabel(check.code);
    rows.unshift({
      label: "未通过校验",
      value: label?.known ? label.label : "未提供可解释原因"
    });
  }
  return rows.length === 0 ? [{label: "对比证据", value: "暂无记录"}] : rows;
}

function firstReason(candidate: DecisionCandidate): string {
  const failedCheck = candidate.validationChecks.find(check => !check.passed);
  if (failedCheck !== undefined) {
    const label = failedCheck.code === null ? null : validationCodeLabel(failedCheck.code);
    return label?.known ? label.label : "未提供可解释原因";
  }
  for (const code of candidate.rejectionCodes) {
    const label = failureCodeLabel(code);
    if (label.known) return label.label;
  }
  for (const code of candidate.failureCodes) {
    const label = failureCodeLabel(code);
    if (label.known) return label.label;
  }
  return "未提供可解释原因";
}

function reasonWithMeasurements(candidate: DecisionCandidate): string {
  const reason = firstReason(candidate);
  const measurements = factRows(candidate)
    .filter(row => row.value !== "暂无记录")
    .map(row => `${row.label} ${row.value}`);
  return measurements.length === 0
    ? reason
    : `${reason}：${measurements.join("，")}。`;
}

function candidateAudit(candidate: DecisionCandidate): AuditRow[] {
  const rows: AuditRow[] = [
    {label: "候选编号", value: candidate.candidateId},
    {label: "候选层级", value: candidate.level},
    {label: "生命周期", value: candidate.lifecycle}
  ];
  const objectIds = [...new Set([
    ...candidate.affectedTaskIds,
    ...candidate.affectedResourceIds,
    ...candidate.allocations.flatMap(item => [
      item.taskId,
      ...item.resourceIds,
      ...item.workUnitIds
    ])
  ])];
  if (objectIds.length > 0) rows.push({label: "对象编号", value: objectIds.join("、")});
  for (const check of candidate.validationChecks) {
    rows.push({
      label: "校验记录",
      value: [check.checkId, check.name, check.code, check.passed ? "passed" : "failed"]
        .filter(value => value !== null).join(" · ")
    });
  }
  const codes = [...new Set([...candidate.rejectionCodes, ...candidate.failureCodes])];
  if (codes.length > 0) rows.push({label: "原因代码", value: codes.join(" · ")});
  for (const fact of candidate.facts) {
    rows.push({
      label: "原始事实",
      value: `${fact.code}=${JSON.stringify(fact.value)}${fact.unit === null ? "" : ` ${fact.unit}`}`
    });
  }
  return rows;
}

function comparison(
  subject: DecisionCandidate,
  reference: DecisionCandidate,
  subjectTitle: string,
  referenceTitle: string,
  winner: boolean
): string | null {
  if (subject.metrics === null || reference.metrics === null) return null;
  for (const [key, label, format, direction] of METRICS) {
    const subjectValue = subject.metrics[key];
    const referenceValue = reference.metrics[key];
    if (subjectValue === referenceValue) continue;
    const subjectBetter = direction === "desc"
      ? subjectValue > referenceValue
      : subjectValue < referenceValue;
    const relation = subjectValue > referenceValue ? "高于" : "低于";
    const ending = winner && subjectBetter ? "，因此率先胜出" : "";
    return `${winner ? `相较${referenceTitle}` : `与${referenceTitle}相比`}，${subjectTitle}${label}为${metricValue(subjectValue, format)}，${relation}${referenceTitle}${metricValue(referenceValue, format)}${ending}。`;
  }
  return "暂无记录";
}

export function buildCandidatePresentations(
  trace: DecisionTraceV1
): CandidatePresentation[] {
  const titles = new Map(trace.candidates.map((item, index) => [
    item.candidateId,
    candidateTitle(index)
  ]));
  const selected = trace.candidates.find(item =>
    item.candidateId === trace.selectedCandidateId
  );
  const runnerUp = trace.selection.orderedCandidateIds
    .map(id => trace.candidates.find(item => item.candidateId === id))
    .find(item => item !== undefined && item.candidateId !== selected?.candidateId && item.metrics !== null);

  return trace.candidates.map((item, index) => {
    const title = candidateTitle(index);
    const isFallback = item.lifecycle === "fallback";
    const isSelected = item.selected || item.candidateId === trace.selectedCandidateId;
    const isRejected = item.lifecycle === "rejected";
    const tone = isFallback
      ? "fallback"
      : isRejected ? "rejected" : isSelected ? "accepted" : "candidate";
    const verdict = isFallback
      ? "安全回退"
      : isRejected ? "拒绝" : isSelected ? "接受" : "可执行但未选中";
    const strategyLabel = candidateLevelLabel(item.level);
    let reason: string;
    if (isRejected || isFallback) {
      reason = reasonWithMeasurements(item);
    } else if (isSelected) {
      reason = "方案通过校验，并按业务指标字典序排名第一。";
    } else if (item.lifecycle === "valid") {
      reason = "方案可执行，但在字典序比较中低于胜出方案。";
    } else {
      reason = "候选方案已生成，尚未完成校验。";
    }
    let comparisonText: string | null = null;
    if (isSelected && runnerUp !== undefined) {
      comparisonText = comparison(
        item,
        runnerUp,
        title,
        titles.get(runnerUp.candidateId) ?? "对比方案",
        true
      );
    } else if (!isRejected && !isFallback && selected !== undefined) {
      comparisonText = comparison(
        item,
        selected,
        title,
        titles.get(selected.candidateId) ?? "胜出方案",
        false
      );
    }
    if (isSelected && comparisonText === null) {
      const selectionLabel = trace.selection.reasonCodes
        .map(selectionReasonLabel).find(label => label.known);
      comparisonText = selectionLabel?.label ?? "暂无记录";
    }
    return {
      candidateId: item.candidateId,
      title,
      strategy: isFallback
        ? "安全回退"
        : strategyLabel.known ? strategyLabel.label : "未识别候选策略",
      verdict,
      tone,
      reason,
      planData: planData(item),
      evidence: candidateEvidence(item),
      comparison: comparisonText,
      audit: candidateAudit(item)
    };
  });
}

interface EventAuditValue {
  eventType?: unknown;
  status?: unknown;
  reason?: unknown;
  winningEventId?: unknown;
}

function eventAuditValue(value: unknown): EventAuditValue | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as EventAuditValue
    : null;
}

export function buildDecisionStagePresentation(
  stage: DecisionStage
): DecisionStagePresentation {
  const stageName = stageLabel(stage.stageId);
  const data: PresentationDatum[] = [];
  const audit: AuditRow[] = [
    {label: "阶段代码", value: stage.stageId},
    {label: "阶段状态", value: stage.status},
    {label: "实际耗时", value: `${stage.actualDurationMs} ms`}
  ];
  let conflictResolved = false;
  for (const fact of stage.facts) {
    if (fact.code === "EVENT_AUDIT_ENTRY") {
      const value = eventAuditValue(fact.value);
      const eventType = typeof value?.eventType === "string"
        ? eventTypeLabel(value.eventType) : null;
      const status = typeof value?.status === "string"
        ? eventStatusLabel(value.status) : null;
      data.push({
        label: "事件治理",
        value: `${eventType?.known ? eventType.label : "未识别事件"} · ${status?.known ? status.label : "处理状态未知"}`
      });
      conflictResolved ||= value?.eventType === "TASK_GEOMETRY_CHANGED" &&
        value.status === "MERGED_INTO_OTHER_EVENT";
      const reason = typeof value?.reason === "string"
        ? eventAuditReasonLabel(value.reason).label : "";
      audit.push({
        label: "事件治理原始记录",
        value: [
          value?.eventType,
          value?.status,
          value?.reason,
          value?.winningEventId,
          ...fact.objectIds
        ].filter(item => typeof item === "string" && item.length > 0).join(" · ")
      });
      if (reason !== "") audit.push({label: "事件治理原因", value: reason});
      continue;
    }
    const label = decisionFactLabel(fact.code);
    data.push({
      label: label.known ? label.label : "未识别数据",
      value: label.known
        ? formatDecisionValue(fact.code, fact.value, fact.unit)
        : "暂无记录"
    });
    audit.push({
      label: "原始事实",
      value: `${fact.code}=${JSON.stringify(fact.value)}${fact.unit === null ? "" : ` ${fact.unit}`}`
    });
  }
  if (stage.affectedEventIds.length > 0) {
    audit.push({label: "事件编号", value: stage.affectedEventIds.join("、")});
  }
  if (stage.affectedObjectIds.length > 0) {
    audit.push({label: "对象编号", value: stage.affectedObjectIds.join("、")});
  }
  if (stage.failureCodes.length > 0) {
    audit.push({label: "失败代码", value: stage.failureCodes.join("、")});
  }
  const conclusion = stage.status === "SAFE_FALLBACK"
    ? "完整目标无法满足，系统已形成可审计的安全回退。"
    : conflictResolved
      ? "任务区域变化已被优先级更高的取消事件取代，未进入最终规划状态。"
      : data.length === 0
        ? "暂无记录"
        : `${stageName.known ? stageName.label : "当前步骤"}已完成，并形成结构化处理结果。`;
  return {
    title: stageName.known ? stageName.label : "未识别决策步骤",
    modules: stageModules(stage.stageId),
    conclusion,
    data: data.length === 0 ? [{label: "步骤数据", value: "暂无记录"}] : data,
    audit
  };
}

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
