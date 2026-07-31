import type {
  DecisionCandidate,
  DecisionStage
} from "../../features/dynamic-replanning/decisionTraceSchema";
import type {
  DynamicScene
} from "../../features/dynamic-replanning/buildDynamicScene";

const STAGE_LABELS: Record<DecisionStage["stageId"], string> = {
  EVENT_INGESTION: "接收动态事件",
  SNAPSHOT_AND_IMPACT: "冻结快照并分析影响",
  RESOURCE_ASSESSMENT: "评估资源可用性",
  CANDIDATE_GENERATION: "生成候选调整方案",
  PLANNING_AND_VALIDATION: "规划并逐项校验",
  RANKING_AND_SELECTION: "排序并选择方案",
  PLAN_PUBLICATION: "发布新计划"
};

const FACT_LABELS: Record<string, string> = {
  EFFECTIVE_EVENT_COUNT: "有效事件",
  SNAPSHOT_ID: "任务快照",
  AFFECTED_TASK_COUNT: "受影响任务",
  AFFECTED_RESOURCE_COUNT: "受影响资源",
  ASSESSED_RESOURCE_COUNT: "已评估资源",
  GENERATED_CANDIDATE_COUNT: "已生成候选",
  VALID_CANDIDATE_COUNT: "通过校验候选",
  REJECTED_CANDIDATE_COUNT: "被拒绝候选",
  RANKED_CANDIDATE_COUNT: "参与排序候选",
  PUBLISHED_PLAN_VERSION: "发布版本",
  PLAN_STATUS: "计划状态"
};

const LIFECYCLE_LABELS: Record<DecisionCandidate["lifecycle"], string> = {
  generated: "已生成",
  rejected: "已拒绝",
  valid: "校验通过",
  selected: "已选中",
  fallback: "安全回退"
};

function candidateSummary(candidate: DecisionCandidate) {
  const metrics = candidate.metrics;
  return (
    <article
      key={candidate.candidateId}
      className={`decision-candidate decision-candidate--${candidate.lifecycle}`}
    >
      <header>
        <strong>{candidate.candidateId}</strong>
        <span>{LIFECYCLE_LABELS[candidate.lifecycle]}</span>
      </header>
      <p>{candidate.level} · {candidate.affectedResourceIds.join("、") || "无新增资源"}</p>
      {metrics === null ? null : (
        <dl>
          <div>
            <dt>任务完成率</dt>
            <dd>{(metrics.totalCompletionRatio * 100).toFixed(1)}%</dd>
          </div>
          <div>
            <dt>计划保留率</dt>
            <dd>{(metrics.retainedPlanRatio * 100).toFixed(1)}%</dd>
          </div>
          <div>
            <dt>完成时刻</dt>
            <dd>{metrics.totalFinishTimeSec.toFixed(1)} s</dd>
          </div>
        </dl>
      )}
      {[...candidate.rejectionCodes, ...candidate.failureCodes].length === 0
        ? null
        : (
          <p className="decision-candidate__codes">
            {[...new Set([
              ...candidate.rejectionCodes,
              ...candidate.failureCodes
            ])].join(" · ")}
          </p>
        )}
    </article>
  );
}

export interface DecisionProcessPanelProps {
  scene: DynamicScene;
  stageIndex: number | null;
  manual: boolean;
  playing: boolean;
  onSelectStage(index: number): void;
  onPrevious(): void;
  onNext(): void;
  onPause(): void;
  onResumeAutomatic(): void;
}

export function DecisionProcessPanel({
  scene,
  stageIndex,
  manual,
  playing,
  onSelectStage,
  onPrevious,
  onNext,
  onPause,
  onResumeAutomatic
}: DecisionProcessPanelProps) {
  const stages = scene.decisionTrace.stages;
  const resolvedIndex = stageIndex ?? 0;
  const stage = stages[resolvedIndex];
  const candidates = scene.decisionTrace.candidates.filter(candidate =>
    stage.candidateIds.includes(candidate.candidateId)
  );
  return (
    <section className="decision-process">
      <header className="decision-process__header">
        <div>
          <span>实时决策过程</span>
          <strong>{manual ? "手动查看" : "自动讲解"}</strong>
        </div>
        {manual ? (
          <button type="button" onClick={onResumeAutomatic}>
            继续自动
          </button>
        ) : (
          <button type="button" disabled={!playing} onClick={onPause}>
            暂停讲解
          </button>
        )}
      </header>
      <ol className="decision-process__stages">
        {stages.map((item, index) => (
          <li
            key={item.stageId}
            data-state={
              stageIndex === null
                ? "pending"
                : index < resolvedIndex
                  ? "complete"
                  : index === resolvedIndex
                    ? "current"
                    : "pending"
            }
          >
            <button type="button" onClick={() => onSelectStage(index)}>
              <span>{index + 1}</span>
              {STAGE_LABELS[item.stageId]}
            </button>
          </li>
        ))}
      </ol>
      <article className="decision-process__current">
        {stageIndex === null ? (
          <>
            <span className="sr-only">等待播放</span>
            <small>演示尚未触发事件</small>
            <h2>原计划正在执行</h2>
            <p>事件发生后，任务时间会冻结，右侧将逐步展示系统如何形成决策。</p>
          </>
        ) : (
          <>
            <small>
              第 {resolvedIndex + 1} 步 · {stage.actualDurationMs.toFixed(1)} ms
            </small>
            <h2>{STAGE_LABELS[stage.stageId]}</h2>
            <p>
              {stage.status === "SAFE_FALLBACK"
                ? "完整目标无法满足，系统正在保留物理安全并形成可审计回退。"
                : "系统使用当前任务快照和结构化证据完成本步骤。"}
            </p>
            <dl className="decision-process__facts">
              {stage.facts.map(fact => (
                <div key={`${fact.code}-${String(fact.value)}`}>
                  <dt>{FACT_LABELS[fact.code] ?? fact.code}</dt>
                  <dd>{String(fact.value)}</dd>
                </div>
              ))}
            </dl>
            {candidates.length === 0 ? null : (
              <section className="decision-process__candidates">
                <h3>候选方案</h3>
                {candidates.map(candidateSummary)}
              </section>
            )}
            <details className="decision-process__audit">
              <summary>展开工程审计详情</summary>
              <dl>
                <div><dt>阶段代码</dt><dd>{stage.stageId}</dd></div>
                <div><dt>事件</dt><dd>{stage.affectedEventIds.join("、") || "—"}</dd></div>
                <div><dt>对象</dt><dd>{stage.affectedObjectIds.join("、") || "—"}</dd></div>
                <div><dt>校验</dt><dd>{stage.validationCheckIds.join("、") || "—"}</dd></div>
                <div><dt>失败码</dt><dd>{stage.failureCodes.join("、") || "—"}</dd></div>
              </dl>
            </details>
          </>
        )}
      </article>
      <footer className="decision-process__controls">
        <button
          type="button"
          disabled={stageIndex === null || resolvedIndex === 0}
          onClick={onPrevious}
        >
          上一步
        </button>
        <button
          type="button"
          disabled={stageIndex === null || resolvedIndex === stages.length - 1}
          onClick={onNext}
        >
          下一步
        </button>
      </footer>
    </section>
  );
}
