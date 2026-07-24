import {useEffect, useRef} from "react";
import type {CaseBundleV2, NormalizedSortie} from "../../features/cases/caseBundle";
import type {
  LiveSortieState,
  SortieStatus
} from "../../features/mission/missionInterpolation";

export type DrawerContent =
  | {type: "overview"}
  | {type: "uav"; uavId: string}
  | {type: "sortie"; assignmentId: string}
  | null;

export interface DetailDrawerProps {
  bundle: CaseBundleV2;
  liveSorties: readonly LiveSortieState[];
  missionTime: number;
  content: DrawerContent;
  attribution: string;
  onClose: () => void;
}

const COORDINATE_NOTICE =
  "算法数据采用 LOCAL_CARTESIAN_M；当前地图位置为日月湾视觉锚定，不代表真实地理定位。";

const STATUS_LABELS: Record<SortieStatus, string> = {
  waiting: "等待起飞",
  flying: "飞行中",
  landed: "已降落",
  completed: "已完成"
};

function MetricList({
  label,
  items
}: {
  label: string;
  items: ReadonlyArray<readonly [string, string]>;
}) {
  return (
    <dl aria-label={label}>
      {items.map(([name, value]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Overview({bundle}: {bundle: CaseBundleV2}) {
  const {metrics, validation} = bundle;
  const items = [
    ["方案状态", validation.valid ? "可行" : "需复核"],
    ["无人机数量", String(metrics.uavCount)],
    ["架次数量", String(metrics.sortieCount)],
    ["批次数量", String(metrics.batchCount)],
    ["条带数量", String(metrics.stripCount)],
    ["覆盖率", `${(metrics.coverageRatio * 100).toFixed(1)}%`],
    ["任务完成时间", `${metrics.missionMakespanSec.toFixed(1)} s`],
    ["总航程", `${(metrics.totalDistanceM / 1_000).toFixed(2)} km`],
    ["总燃油", `${metrics.totalFuelKg.toFixed(2)} kg`]
  ] as const;

  return (
    <>
      <MetricList label="算法任务指标" items={items} />
      {(validation.warnings.length > 0 || validation.failureCodes.length > 0) ? (
        <section aria-label="算法校验结果">
          <h3>校验信息</h3>
          <ul>
            {validation.warnings.map(warning => (
              <li key={`warning:${warning}`}>{warning}</li>
            ))}
            {validation.failureCodes.map(code => (
              <li key={`failure:${code}`}>{code}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function currentUavStatus(
  states: readonly LiveSortieState[]
): string {
  const active = states.find(({status}) => status === "flying");
  if (active !== undefined) return STATUS_LABELS.flying;
  const landed = states.find(({status}) => status === "landed");
  if (landed !== undefined) return STATUS_LABELS.landed;
  const waiting = states.find(({status}) => status === "waiting");
  if (waiting !== undefined) return STATUS_LABELS.waiting;
  return STATUS_LABELS.completed;
}

function UavDetails({
  bundle,
  liveSorties,
  uavId
}: {
  bundle: CaseBundleV2;
  liveSorties: readonly LiveSortieState[];
  uavId: string;
}) {
  const assignments = bundle.assignments.filter(item => item.uavId === uavId);
  const sorties = bundle.sorties.filter(item => item.uavId === uavId);
  const states = liveSorties.filter(item => item.uavId === uavId);
  const distanceM = sorties.reduce((sum, sortie) => sum + sortie.totalDistanceM, 0);
  const fuelKg = sorties.reduce((sum, sortie) => sum + sortie.totalFuelKg, 0);

  return (
    <>
      <MetricList
        label={`${uavId} 汇总`}
        items={[
          ["无人机编号", uavId],
          ["当前状态", currentUavStatus(states)],
          ["架次数量", String(sorties.length)],
          ["累计航程", `${(distanceM / 1_000).toFixed(2)} km`],
          ["累计燃油", `${fuelKg.toFixed(2)} kg`]
        ]}
      />
      <section aria-label={`${uavId} 分配任务`}>
        <h3>任务分配</h3>
        <ul>
          {assignments.map(assignment => (
            <li key={assignment.assignmentId}>
              <strong>{assignment.assignmentId}</strong>
              <span>第 {assignment.batchIndex + 1} 批</span>
              <span>{assignment.stripIds.join("、")}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function localPositionLabel(
  localPosition: LiveSortieState["localPosition"]
): string {
  if (localPosition === null) return "暂无";
  return [
    `X ${localPosition[0].toFixed(1)} m`,
    `Y ${localPosition[1].toFixed(1)} m`,
    `Z ${localPosition[2].toFixed(1)} m`
  ].join(" / ");
}

function SortieDetails({
  sortie,
  live,
  missionTime
}: {
  sortie: NormalizedSortie;
  live: LiveSortieState | undefined;
  missionTime: number;
}) {
  return (
    <MetricList
      label={`${sortie.assignmentId} 实时任务字段`}
      items={[
        ["任务编号", sortie.assignmentId],
        ["执行无人机", sortie.uavId],
        ["执行批次", `第 ${sortie.batchIndex + 1} 批`],
        ["计划起飞", `${sortie.plannedLaunchTimeSec.toFixed(1)} s`],
        ["当前任务时间", `${missionTime.toFixed(1)} s`],
        ["当前状态", live === undefined ? "暂无" : STATUS_LABELS[live.status]],
        ["当前航段", live?.segmentType ?? "暂无"],
        ["当前条带", live?.stripId ?? "暂无"],
        ["负责条带", sortie.stripIds.join("、")],
        ["规划燃油", `${sortie.totalFuelKg.toFixed(2)} kg`],
        ["本地坐标", localPositionLabel(live?.localPosition ?? null)],
        ["真实高度", `${(live?.altitudeM ?? 0).toFixed(1)} m`],
        ["真实速度", `${(live?.speedMps ?? 0).toFixed(1)} m/s`]
      ]}
    />
  );
}

export function DetailDrawer({
  bundle,
  liveSorties,
  missionTime,
  content,
  attribution,
  onClose
}: DetailDrawerProps) {
  const uavExists = content?.type === "uav" &&
    bundle.assignments.some(({uavId}) => uavId === content.uavId);
  const sortie = content?.type === "sortie"
    ? bundle.sorties.find(({assignmentId}) => assignmentId === content.assignmentId)
    : undefined;
  const shouldRender = content !== null && (
    content.type === "overview" ||
    uavExists ||
    sortie !== undefined
  );
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!shouldRender) return;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    closeButtonRef.current?.focus();
    return () => {
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [shouldRender]);

  if (!shouldRender || content === null) return null;

  const title = content.type === "overview"
    ? "任务概览"
    : content.type === "uav"
      ? `${content.uavId} 任务详情`
      : `${content.assignmentId} 架次详情`;

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="detail-drawer-title"
      onKeyDown={event => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header>
        <h2 id="detail-drawer-title">{title}</h2>
        <button
          ref={closeButtonRef}
          type="button"
          aria-label="关闭详情"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      {content.type === "overview" ? (
        <Overview bundle={bundle} />
      ) : content.type === "uav" ? (
        <UavDetails
          bundle={bundle}
          liveSorties={liveSorties}
          uavId={content.uavId}
        />
      ) : sortie !== undefined ? (
        <SortieDetails
          sortie={sortie}
          live={liveSorties.find(
            ({assignmentId}) => assignmentId === sortie.assignmentId
          )}
          missionTime={missionTime}
        />
      ) : null}
      <footer>
        <p>{COORDINATE_NOTICE}</p>
        <p>{attribution}</p>
      </footer>
    </aside>
  );
}
