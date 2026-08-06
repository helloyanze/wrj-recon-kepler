import type {DynamicScene} from "./buildDynamicScene";
import type {DynamicEvent} from "./dynamicEventSchema";
import {
  eventAuditReasonLabel,
  eventStatusLabel,
  eventTypeLabel,
  formatObjectName
} from "./decisionLabels";
import type {AuditRow, PresentationDatum} from "./decisionPresentation";

export interface EventGovernancePresentation {
  eventId: string;
  title: string;
  eventTime: string;
  objectLabel: string;
  verdict: string;
  tone: "accepted" | "ignored" | "overridden" | "unknown";
  reason: string;
  details: PresentationDatum[];
  audit: AuditRow[];
  defaultOpen: boolean;
}

export interface EventIngestionPresentation {
  summary: {
    received: number;
    effective: number;
    duplicate: number;
    overridden: number;
  };
  conclusion: string;
  events: EventGovernancePresentation[];
}

interface AuditValue {
  eventType?: unknown;
  status?: unknown;
  reason?: unknown;
  winningEventId?: unknown;
}

function auditValue(value: unknown): AuditValue {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as AuditValue
    : {};
}

function decimal(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function seconds(value: number): string {
  return `${decimal(value)} 秒`;
}

function area(value: number | null): string {
  return value === null ? "暂无记录" : `${decimal(value)} m²`;
}

function ratio(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function taskLabel(scene: DynamicScene, taskId: string): string {
  return scene.tasksById.has(taskId) ? formatObjectName(taskId) : taskId;
}

function detailsFor(scene: DynamicScene, event: DynamicEvent): PresentationDatum[] {
  const payload = event.payload;
  switch (payload.kind) {
    case "RESOURCE_LOW_FUEL":
      return [{
        label: "剩余油量",
        value: payload.remainingFuelKg === null
          ? "暂无记录"
          : `${decimal(payload.remainingFuelKg)} kg`
      }];
    case "RESOURCE_DEGRADED":
      return [{
        label: "不可用能力",
        value: payload.unavailableCapabilities.length === 0
          ? "无"
          : payload.unavailableCapabilities.join("、")
      }];
    case "RESOURCE_DELAYED":
      return [{label: "预计可用时间", value: seconds(payload.availableAfterTimeSec)}];
    case "RESOURCE_TIME_CONFLICT":
      return [
        {label: "冲突开始", value: seconds(payload.conflictStartTimeSec)},
        {label: "冲突结束", value: seconds(payload.conflictFinishTimeSec)}
      ];
    case "GEOMETRY_CHANGED": {
      const context = scene.geometryDiff?.entries.find(entry =>
        entry.taskId === event.affectedObjectId
      );
      return context === undefined ? [{
        label: "区域变化",
        value: "具体内容暂不可用"
      }] : [
        {label: "变化关系", value: context.relation},
        {label: "原区域面积", value: area(context.originalAreaM2)},
        {label: "当前区域面积", value: area(context.currentAreaM2)},
        {label: "扩展面积", value: area(context.extensionAreaM2)},
        {label: "扩展比例", value: ratio(context.extensionRatio)}
      ];
    }
    case "PRIORITY_CHANGED":
      return [{label: "新优先级", value: String(payload.priority)}];
    case "EARLIEST_START_CHANGED":
      return [{label: "最早开始", value: seconds(payload.earliestStartTimeSec)}];
    case "LATEST_FINISH_CHANGED":
      return [{label: "最晚完成", value: seconds(payload.latestFinishTimeSec)}];
    case "DEADLINE_TYPE_CHANGED":
      return [{label: "截止类型", value: payload.deadlineType}];
    case "DEPENDENCY_CHANGED":
      return [
        {label: "前置任务", value: payload.predecessorTaskIds.map(id => taskLabel(scene, id)).join("、") || "无"},
        {label: "后续任务", value: payload.successorTaskIds.map(id => taskLabel(scene, id)).join("、") || "无"}
      ];
    case "NEW_TASK":
      return [
        {label: "任务名称", value: typeof payload.task.metadata.demoName === "string" ? payload.task.metadata.demoName : taskLabel(scene, payload.task.taskId)},
        {label: "优先级", value: String(payload.task.priority)},
        {label: "时间窗口", value: `${payload.task.earliestStartTimeSec === null ? "不限" : seconds(payload.task.earliestStartTimeSec)} 至 ${payload.task.latestFinishTimeSec === null ? "不限" : seconds(payload.task.latestFinishTimeSec)}`},
        {label: "最低覆盖率", value: ratio(payload.task.minimumCoverageRatio)},
        {label: "前置任务", value: payload.task.predecessorTaskIds.join("、") || "无"},
        {label: "后续任务", value: payload.task.successorTaskIds.join("、") || "无"}
      ];
    case "EMPTY": {
      const task = scene.tasksById.get(event.affectedObjectId);
      const remaining = scene.view.workUnits.filter(work =>
        work.taskId === event.affectedObjectId && work.status === "REMAINING"
      ).length;
      return task === undefined ? [{label: "事件内容", value: "具体内容暂不可用"}] : [
        {label: "事件后任务状态", value: task.status},
        {label: "剩余后续工作单元", value: String(remaining)}
      ];
    }
  }
}

function auditRows(event: DynamicEvent, value: AuditValue): AuditRow[] {
  return [
    {label: "事件编号", value: event.eventId},
    {label: "原始事件类型", value: event.eventType},
    {label: "原始状态", value: event.status},
    {label: "原始载荷", value: JSON.stringify(event.payload)},
    {label: "治理状态码", value: typeof value.status === "string" ? value.status : "UNKNOWN"},
    ...(typeof value.reason === "string" ? [{label: "治理原因码", value: value.reason}] : []),
    ...(typeof value.winningEventId === "string" ? [{label: "覆盖事件编号", value: value.winningEventId}] : [])
  ];
}

function numericFact(scene: DynamicScene, code: string, fallback: number): number {
  const fact = scene.decisionTrace.stages
    .find(stage => stage.stageId === "EVENT_INGESTION")?.facts
    .find(item => item.code === code)?.value;
  return typeof fact === "number" ? fact : fallback;
}

export function buildEventIngestionPresentation(
  scene: DynamicScene
): EventIngestionPresentation {
  const audit = new Map<string, AuditValue>();
  for (const stage of scene.decisionTrace.stages) {
    for (const fact of stage.facts.filter(item => item.code === "EVENT_AUDIT_ENTRY")) {
      const eventId = fact.objectIds[0];
      if (eventId !== undefined) audit.set(eventId, auditValue(fact.value));
    }
  }
  const events = scene.rawEvents.map(event => {
    const value = audit.get(event.eventId) ?? {};
    const status = typeof value.status === "string" ? value.status : "UNKNOWN";
    const type = eventTypeLabel(event.eventType);
    const objectLabel = formatObjectName(event.affectedObjectId);
    const statusLabel = eventStatusLabel(status);
    const reason = status === "IGNORED_DUPLICATE"
      ? "内容相同，已去重"
      : status === "MERGED_INTO_OTHER_EVENT"
        ? `${typeof value.reason === "string"
          ? eventAuditReasonLabel(value.reason).label
          : "事件已被其他事件取代"}${typeof value.winningEventId === "string"
            ? `，覆盖事件为 ${value.winningEventId}`
            : ""}`
        : typeof value.reason === "string"
          ? eventAuditReasonLabel(value.reason).label
          : status === "MERGED"
            ? "事件载荷通过治理校验，已进入后续影响分析。"
            : statusLabel.known ? statusLabel.label : "治理状态暂不可用";
    const tone: EventGovernancePresentation["tone"] = status === "MERGED"
      ? "accepted"
      : status === "IGNORED_DUPLICATE"
        ? "ignored"
        : status === "MERGED_INTO_OTHER_EVENT"
          ? "overridden"
          : "unknown";
    const verdict = tone === "accepted"
      ? "已接受并进入规划"
      : tone === "ignored"
        ? "重复事件，未重复应用"
        : tone === "overridden"
          ? "已被其他事件覆盖"
          : "治理状态未知";
    return {
      eventId: event.eventId,
      title: `${objectLabel}${type.known ? type.label.replace(/^无人机|^任务/u, "") : "动态事件"}`,
      eventTime: seconds(event.eventTimeSec),
      objectLabel,
      verdict,
      tone,
      reason,
      details: detailsFor(scene, event),
      audit: auditRows(event, value),
      defaultOpen: tone === "accepted"
    };
  });
  const summary = {
    received: numericFact(scene, "RECEIVED_EVENT_COUNT", events.length),
    effective: numericFact(scene, "EFFECTIVE_EVENT_COUNT", events.filter(item => item.tone === "accepted").length),
    duplicate: numericFact(scene, "DUPLICATE_EVENT_COUNT", events.filter(item => item.tone === "ignored").length),
    overridden: numericFact(scene, "OVERRIDDEN_EVENT_COUNT", events.filter(item => item.tone === "overridden").length)
  };
  return {
    summary,
    conclusion: `共接收 ${summary.received} 条动态事件，其中 ${summary.effective} 条进入规划，${summary.duplicate} 条重复去重，${summary.overridden} 条被后续事件覆盖。`,
    events
  };
}
