export interface DecisionLabel {
  label: string;
  known: boolean;
}

const STAGES = {
  EVENT_INGESTION: ["接收并治理动态事件", ["T2-M01", "T2-M03"]],
  SNAPSHOT_AND_IMPACT: ["冻结快照并分析影响", ["T2-M02", "T2-M04"]],
  RESOURCE_ASSESSMENT: ["评估资源与安全状态", ["T2-M05"]],
  CANDIDATE_GENERATION: ["生成分层候选方案", ["T2-M06"]],
  PLANNING_AND_VALIDATION: ["规划、合并并校验", ["T2-M07", "T2-M08", "T2-M09", "T2-M11"]],
  RANKING_AND_SELECTION: ["排序并选择方案", ["T2-M10"]],
  PLAN_PUBLICATION: ["发布新版本和增量结果", ["T2-M12"]]
} as const;

const CANDIDATE_LEVELS: Record<string, string> = {
  L1_MINIMAL_ADJUSTMENT: "最小调整",
  L2_SINGLE_REPLACEMENT: "单机替换",
  L3_STANDBY_LAUNCH: "备份机接替",
  L4_MULTI_RESOURCE: "多机协同",
  L5_PREEMPTION: "抢占调度"
};

const LIFECYCLES: Record<string, string> = {
  generated: "已生成",
  rejected: "已拒绝",
  valid: "校验通过",
  selected: "已选中",
  fallback: "安全回退"
};

const FAILURE_CODES: Record<string, string> = {
  INSUFFICIENT_REMAINING_FUEL: "剩余油量不足",
  HARD_DEADLINE_MISSED: "无法满足硬截止时间",
  E503_PARTIAL_SAFE_FALLBACK: "完整目标无法满足，已形成安全回退"
};

const SELECTION_REASONS: Record<string, string> = {
  LEXICOGRAPHIC_RANKING: "按业务指标字典序择优",
  SAFE_FALLBACK_REQUIRED: "完整目标不可达，必须采用安全回退"
};

const FACTS: Record<string, string> = {
  AFFECTED_RESOURCE_COUNT: "受影响无人机数",
  AFFECTED_TASK_COUNT: "受影响任务数",
  ALLOCATED_RESOURCE_COUNT: "分配无人机数",
  ALLOCATED_TASK_COUNT: "分配任务数",
  ALLOCATED_WORK_UNIT_COUNT: "分配工作单元数",
  ASSESSED_RESOURCE_COUNT: "已评估无人机数",
  DUPLICATE_EVENT_COUNT: "重复事件数",
  EFFECTIVE_EVENT_COUNT: "有效事件数",
  EVENT_AUDIT_ENTRY: "事件治理记录",
  FAILED_VALIDATION_COUNT: "未通过校验数",
  GENERATED_CANDIDATE_COUNT: "生成候选数",
  OVERRIDDEN_EVENT_COUNT: "被覆盖事件数",
  PASSED_VALIDATION_COUNT: "通过校验数",
  PLAN_STATUS: "计划状态",
  PUBLISHED_PLAN_VERSION: "发布计划版本",
  RANKED_CANDIDATE_COUNT: "参与排序候选数",
  RECEIVED_EVENT_COUNT: "接收事件数",
  REJECTED_CANDIDATE_COUNT: "拒绝候选数",
  REMAINING_FUEL_KG: "剩余油量",
  REQUIRED_FUEL_KG: "所需油量",
  SNAPSHOT_ID: "任务快照",
  VALID_CANDIDATE_COUNT: "有效候选数"
};

const UNITS: Record<string, string> = {
  COUNT: "项",
  KG: "千克"
};

const EVENT_TYPES: Record<string, string> = {
  NEW_TASK: "新增任务",
  RESOURCE_DELAYED: "无人机延迟",
  RESOURCE_LOST: "无人机失联",
  RESOURCE_LOW_FUEL: "无人机低油量",
  TASK_CANCELLED: "任务取消",
  TASK_DEADLINE_TYPE_CHANGED: "任务截止类型变化",
  TASK_DEPENDENCY_CHANGED: "任务依赖变化",
  TASK_GEOMETRY_CHANGED: "任务区域变化",
  TASK_LATEST_FINISH_CHANGED: "任务最晚完成时间变化",
  TASK_PRIORITY_CHANGED: "任务优先级变化"
};

const EVENT_STATUSES: Record<string, string> = {
  IGNORED_DUPLICATE: "已忽略重复事件",
  MERGED: "已纳入有效事件",
  MERGED_INTO_OTHER_EVENT: "已并入其他事件"
};

const EVENT_AUDIT_REASONS: Record<string, string> = {
  "duplicate canonical event": "规范化后与已有事件重复",
  "superseded by higher-precedence or later event": "被优先级更高或时间更晚的事件取代"
};

export const CATEGORY_LABELS: Record<string, string> = {
  foundation: "基础异常",
  task_change: "任务变更",
  event_governance: "事件治理",
  comprehensive: "综合案例"
};

export const DATA_NATURE_LABELS: Record<string, string> = {
  SIMULATED_PIPELINE_RESULT: "演示构造输入 · 任务二实际计算"
};

function fromMap(map: Readonly<Record<string, string>>, code: string): DecisionLabel {
  const label = map[code];
  return label === undefined
    ? {label: `未识别代码（${code}）`, known: false}
    : {label, known: true};
}

export function stageLabel(code: string): DecisionLabel {
  const value = STAGES[code as keyof typeof STAGES];
  return value === undefined
    ? {label: `未识别代码（${code}）`, known: false}
    : {label: value[0], known: true};
}

export function stageModules(code: string): string[] {
  return [...(STAGES[code as keyof typeof STAGES]?.[1] ?? [])];
}

export const candidateLevelLabel = (code: string) => fromMap(CANDIDATE_LEVELS, code);
export const lifecycleLabel = (code: string) => fromMap(LIFECYCLES, code);
export const failureCodeLabel = (code: string) => fromMap(FAILURE_CODES, code);
export const validationCodeLabel = (code: string) => fromMap(FAILURE_CODES, code);
export const selectionReasonLabel = (code: string) => fromMap(SELECTION_REASONS, code);
export const decisionFactLabel = (code: string) => fromMap(FACTS, code);
export const decisionUnitLabel = (code: string) => fromMap(UNITS, code);
export const eventTypeLabel = (code: string) => fromMap(EVENT_TYPES, code);
export const eventStatusLabel = (code: string) => fromMap(EVENT_STATUSES, code);
export const eventAuditReasonLabel = (code: string) => fromMap(EVENT_AUDIT_REASONS, code);

function decimal(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function formatDecisionValue(
  code: string,
  value: unknown,
  unit: string | null
): string {
  if (value === null || value === undefined || value === "") return "暂无记录";
  if (code === "SNAPSHOT_ID") return "已冻结任务快照";
  if (code === "PLAN_STATUS" && typeof value === "string") {
    return value === "COMPLETE"
      ? "完整计划"
      : value === "PARTIAL_SAFE_FALLBACK"
        ? "部分安全回退"
        : value === "FAILED" ? "未发布计划" : "暂无记录";
  }
  if (code === "PUBLISHED_PLAN_VERSION" && typeof value === "number") {
    return `第 ${decimal(value)} 版`;
  }
  if (typeof value === "number") {
    const unitLabel = unit === null ? "" : decisionUnitLabel(unit);
    return unitLabel === "" || !unitLabel.known
      ? decimal(value)
      : `${decimal(value)} ${unitLabel.label}`;
  }
  if (typeof value === "boolean") return value ? "是" : "否";
  return typeof value === "string" ? value : "暂无记录";
}

export function formatObjectName(objectId: string): string {
  const uav = /^UAV-0*(\d+)$/iu.exec(objectId);
  if (uav !== null) return `${Number(uav[1])}号无人机`;
  const workUnit = /^ST-0*(\d+)$/iu.exec(objectId);
  if (workUnit !== null) return `${Number(workUnit[1])}号工作单元`;
  const task = /^(?:TASK-)?(?:REG-|T-)?0*([A-Z]?\d+|[A-Z])$/iu.exec(objectId);
  if (task !== null) return `${task[1]}号任务`;
  return "相关对象";
}
