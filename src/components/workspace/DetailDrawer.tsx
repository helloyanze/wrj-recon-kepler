import {useEffect, useRef} from "react";
import type {CaseSummary, UavSummary} from "../../data/caseSchema";
import {formatDistance, formatMinutes, formatPercent} from "../../utils/format";

export type DrawerContent =
  | {type: "overview"}
  | {type: "uav"; uavId: UavSummary["uavId"]}
  | null;

export interface DetailDrawerProps {
  summary: CaseSummary;
  content: DrawerContent;
  attribution: string;
  onClose: () => void;
}

function Provenance({summary, attribution}: Pick<DetailDrawerProps, "summary" | "attribution">) {
  return (
    <footer>
      <p>{summary.notice}</p>
      <p>{attribution}</p>
    </footer>
  );
}

function Overview({summary}: {summary: CaseSummary}) {
  const metrics = [
    ["方案状态", "可行"],
    ["无人机数量", String(summary.metrics.uavCount)],
    ["条带数量", String(summary.metrics.stripCount)],
    ["覆盖率", formatPercent(summary.metrics.coverageRatio)],
    ["并行完成时间", formatMinutes(summary.metrics.missionMakespanSec / 60)],
    ["总航程", formatDistance(summary.metrics.totalDistanceKm)]
  ] as const;

  return (
    <>
      <dl aria-label="任务指标">
        {metrics.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <section aria-label="任务说明">
        <p><strong>地理位置</strong>{summary.location}</p>
        <p><strong>数据边界</strong>真实底图与公开地理对象；模拟任务区、条带、航迹、高度及时序。</p>
        <p><strong>飞行阶段</strong>曲线爬升、海上盘旋、覆盖侦察、水滴掉头与曲线返航。</p>
      </section>
    </>
  );
}

function UavDetails({uav}: {uav: UavSummary}) {
  const fields = [
    ["无人机编号", uav.uavId],
    ["呼号", uav.callsign],
    ["负责条带", uav.stripRange],
    ["航程", formatDistance(uav.distanceKm)],
    ["任务时间", formatMinutes(uav.durationMin)],
    ["覆盖高度", `${uav.coverageAltitudeM} m`],
    ["转场高度", `${uav.transitAltitudeM} m`],
    ["最大高度", `${uav.maxAltitudeM} m`],
    ["规划状态", uav.status === "VALID" ? "已校验" : uav.status]
  ] as const;

  return (
    <dl aria-label={`${uav.uavId} 任务字段`}>
      {fields.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DetailDrawer({summary, content, attribution, onClose}: DetailDrawerProps) {
  const uav = content?.type === "uav"
    ? summary.uavs.find(({uavId}) => uavId === content.uavId)
    : null;
  const shouldRender = content !== null && (content.type === "overview" || Boolean(uav));
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

  const title = content.type === "overview" ? "任务概览" : `${content.uavId} 任务详情`;

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="detail-drawer-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header>
        <h2 id="detail-drawer-title">{title}</h2>
        <button ref={closeButtonRef} type="button" aria-label="关闭详情" onClick={onClose}>×</button>
      </header>
      {content.type === "overview" ? (
        <Overview summary={summary} />
      ) : uav ? <UavDetails uav={uav} /> : null}
      <Provenance summary={summary} attribution={attribution} />
    </aside>
  );
}
