import type {DynamicScene} from "../../features/dynamic-replanning/buildDynamicScene";
import {formatDecisionValue, stageLabel} from "../../features/dynamic-replanning/decisionLabels";
import {
  buildCandidatePresentations,
  buildDecisionStagePresentation,
  type AuditRow,
  type CandidatePresentation,
  type PresentationDatum
} from "../../features/dynamic-replanning/decisionPresentation";

function dataList(rows: PresentationDatum[] | AuditRow[], className?: string) {
  return (
    <dl className={className}>
      {rows.map((row, index) => (
        <div key={`${row.label}-${row.value}-${index}`}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function candidateCard(candidate: CandidatePresentation, index: number) {
  const titleId = `decision-candidate-title-${index}`;
  const evidence = candidate.evidence.filter(row => !(
    row.label === "对比证据" &&
    row.value === "暂无记录" &&
    candidate.comparison !== null &&
    candidate.comparison !== "暂无记录"
  ));
  return (
    <article
      key={candidate.candidateId}
      className={`decision-candidate decision-candidate--${candidate.tone}`}
      aria-labelledby={titleId}
    >
      <header className="decision-candidate__header">
        <h3 id={titleId}>{candidate.title}</h3>
        <span>{candidate.strategy}</span>
      </header>
      <section className="decision-candidate__section decision-candidate__conclusion">
        <h4>结论</h4>
        <strong>{candidate.verdict}</strong>
      </section>
      <section className="decision-candidate__section">
        <h4>原因</h4>
        <p>{candidate.reason}</p>
      </section>
      <section className="decision-candidate__section">
        <h4>方案数据</h4>
        {dataList(candidate.planData, "decision-candidate__data")}
      </section>
      <section className="decision-candidate__section">
        <h4>对比证据</h4>
        {candidate.comparison === null ? null : (
          <p>{candidate.comparison}</p>
        )}
        {evidence.length === 0 ? null : dataList(
          evidence,
          "decision-candidate__evidence"
        )}
      </section>
      <details className="decision-candidate__audit">
        <summary>审计详情</summary>
        {dataList(candidate.audit)}
      </details>
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
  const stagePresentation = buildDecisionStagePresentation(stage);
  const candidates = buildCandidatePresentations(scene.decisionTrace).filter(candidate =>
    stage.candidateIds.includes(candidate.candidateId)
  );
  const affectedObjectCount = new Set(stage.affectedObjectIds).size;
  const showResultStatus = stage.stageId === "PLAN_PUBLICATION" || (
    stage.status === "SAFE_FALLBACK" &&
    scene.decisionTrace.resultStatus === "PARTIAL_SAFE_FALLBACK"
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
              {stageLabel(item.stageId).label}
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
            <small>第 {resolvedIndex + 1} 步</small>
            <h2>{stagePresentation.title}</h2>
            <p className="decision-process__modules">
              <span>关联模块</span>
              {stagePresentation.modules.join("、") || "暂无记录"}
            </p>
            <section className="decision-process__section">
              <h3>阶段结论</h3>
              <p>{stagePresentation.conclusion}</p>
            </section>
            <section className="decision-process__section">
              <h3>步骤数据</h3>
              {dataList(stagePresentation.data, "decision-process__facts")}
            </section>
            <p className="decision-process__affected">
              <span>受影响对象</span>
              <strong>{affectedObjectCount === 0 ? "暂无记录" : `${affectedObjectCount} 项`}</strong>
            </p>
            {showResultStatus ? (
              <p className="decision-process__result-status">
                <span>结果状态</span>
                <strong>{formatDecisionValue(
                  "PLAN_STATUS",
                  scene.decisionTrace.resultStatus,
                  null
                )}</strong>
              </p>
            ) : null}
            {candidates.length === 0 ? null : (
              <section className="decision-process__candidates">
                <h3>候选方案</h3>
                {candidates.map(candidateCard)}
              </section>
            )}
            <details className="decision-process__audit">
              <summary>阶段审计详情</summary>
              {dataList(stagePresentation.audit)}
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
