import {mapStyleChange, updateMap, wrapTo} from "@kepler.gl/actions";
import type {ComponentType} from "react";
import {useCallback, useEffect, useRef, useState} from "react";
import {useDispatch} from "react-redux";
import type {AppDispatch} from "../app/store";
import type {ResolvedBasemap} from "../basemap/basemapConfig";
import type {CaseSummary, UavSummary} from "../data/caseSchema";
import {loadCase} from "../data/loadCase";
import {DEFAULT_MAP_STATE, UAV_COLORS, WRJ_MAP_ID} from "../kepler/constants";
import {loadKeplerCase} from "../kepler/loadKeplerCase";
import {formatDistance, formatMinutes, formatPercent} from "../utils/format";
import {WrjKeplerMap, type WrjKeplerMapProps} from "./WrjKeplerMap";

type CaseLoader = typeof loadCase;
type KeplerLoader = typeof loadKeplerCase;

export interface WorkspaceProps {
  basemap: ResolvedBasemap;
  debugMode: boolean;
  dataBase: string;
  caseLoader?: CaseLoader;
  keplerLoader?: KeplerLoader;
  MapView?: ComponentType<WrjKeplerMapProps>;
}

type LoadStatus = "loading" | "ready" | "error";

const STAGES = [
  "任务区域",
  "条带分配",
  "起飞爬升",
  "等待盘旋",
  "覆盖侦察",
  "曲线返航",
  "任务完成"
];

const LEGEND = [
  ["point", "真实公开地理点"],
  ["shape", "真实地理对象"],
  ["region", "模拟任务区域"],
  ["strip", "模拟侦察条带"],
  ["route", "模拟规划航迹"],
  ["trip", "动态模拟飞行"]
] as const;

const PERMANENT_NOTICE =
  "底图和公共地理对象来自真实地图数据；任务区域、条带和无人机航迹为模拟规划数据；本演示不构成真实飞行计划或空域信息。";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function MetricGrid({summary}: {summary: CaseSummary}) {
  const metrics = [
    ["方案状态", "可行", "success"],
    ["无人机数量", String(summary.metrics.uavCount), ""],
    ["条带数量", String(summary.metrics.stripCount), ""],
    ["覆盖率", formatPercent(summary.metrics.coverageRatio), "accent"],
    ["并行完成时间", formatMinutes(summary.metrics.missionMakespanSec / 60), ""],
    ["总航程", formatDistance(summary.metrics.totalDistanceKm), ""]
  ];
  return (
    <section className="metric-grid" aria-label="任务指标">
      {metrics.map(([label, value, tone]) => (
        <article className="metric-card" key={label}>
          <span>{label}</span>
          <strong className={tone}>{value}</strong>
        </article>
      ))}
    </section>
  );
}

function UavList({
  uavs,
  selectedId,
  onSelect
}: {
  uavs: UavSummary[];
  selectedId: string | null;
  onSelect: (uav: UavSummary) => void;
}) {
  return (
    <aside className="uav-panel panel">
      <div className="panel-heading">
        <span className="eyebrow">任务编队</span>
        <strong>无人机列表</strong>
      </div>
      <div className="uav-list">
        {uavs.map((uav) => (
          <button
            type="button"
            className={`uav-card ${selectedId === uav.uavId ? "selected" : ""}`}
            key={uav.uavId}
            onClick={() => onSelect(uav)}
            aria-label={`${uav.uavId} ${uav.callsign}`}
          >
            <span className="uav-title">
              <i style={{background: UAV_COLORS[uav.uavId]}} />
              {uav.uavId} / {uav.callsign}
            </span>
            <span>条带 {uav.stripRange.replace("-", "～")}</span>
            <span>覆盖高度 {uav.coverageAltitudeM} m</span>
            <span>任务时间 {formatMinutes(uav.durationMin)}</span>
          </button>
        ))}
      </div>
      <div className="panel-footnote">点击无人机查看任务详情</div>
    </aside>
  );
}

function FixedLegend() {
  return (
    <div className="legend" aria-label="固定图例">
      <h3>固定图例</h3>
      {LEGEND.map(([kind, label]) => (
        <div className="legend-row" key={kind}>
          <i className={`legend-mark ${kind}`} />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function Provenance({
  attribution,
  notice = PERMANENT_NOTICE
}: {
  attribution: string;
  notice?: string;
}) {
  return (
    <div className="provenance">
      <p>{notice}</p>
      <span>{attribution}</span>
    </div>
  );
}

function PendingDetailPanel({status, attribution}: {status: LoadStatus; attribution: string}) {
  return (
    <aside className="detail-panel panel pending-detail">
      <div className="panel-heading">
        <span className="eyebrow">数据说明</span>
        <h2>{status === "error" ? "加载异常" : "算例准备中"}</h2>
      </div>
      <div className="overview-copy">
        <p><span>真实环境</span>底图、岸线、道路、建筑与公开地理对象。</p>
        <p><span>模拟任务</span>任务区域、侦察条带、航迹、高度、速度及时序。</p>
      </div>
      <FixedLegend />
      <Provenance attribution={attribution} />
    </aside>
  );
}

function DetailPanel({
  summary,
  selected,
  attribution
}: {
  summary: CaseSummary;
  selected: UavSummary | null;
  attribution: string;
}) {
  return (
    <aside className="detail-panel panel">
      <div className="panel-heading">
        <span className="eyebrow">任务信息</span>
        <h2>{selected ? `${selected.uavId} 任务详情` : "任务总览"}</h2>
      </div>
      {selected ? (
        <dl className="detail-list">
          <div><dt>呼号</dt><dd>{selected.callsign}</dd></div>
          <div><dt>负责条带</dt><dd>{selected.stripRange}</dd></div>
          <div><dt>航程</dt><dd>{formatDistance(selected.distanceKm)}</dd></div>
          <div><dt>任务时间</dt><dd>{formatMinutes(selected.durationMin)}</dd></div>
          <div><dt>覆盖高度</dt><dd>{selected.coverageAltitudeM} m</dd></div>
          <div><dt>转场高度</dt><dd>{selected.transitAltitudeM} m</dd></div>
          <div><dt>最大高度</dt><dd>{selected.maxAltitudeM} m</dd></div>
          <div><dt>规划状态</dt><dd className="success">已校验</dd></div>
        </dl>
      ) : (
        <div className="overview-copy">
          <p><span>地理位置</span>{summary.location}</p>
          <p><span>数据边界</span>真实底图与公开地理对象；模拟任务区、条带、航迹、高度及时序。</p>
          <p><span>飞行阶段</span>曲线爬升、海上盘旋、覆盖侦察、水滴掉头与曲线返航。</p>
        </div>
      )}
      <FixedLegend />
      <Provenance attribution={attribution} notice={summary.notice} />
    </aside>
  );
}

export function Workspace({
  basemap,
  debugMode,
  dataBase,
  caseLoader = loadCase,
  keplerLoader = loadKeplerCase,
  MapView = WrjKeplerMap
}: WorkspaceProps) {
  const dispatch = useDispatch<AppDispatch>();
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<CaseSummary | null>(null);
  const [selected, setSelected] = useState<UavSummary | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [styleType, setStyleType] = useState<"satellite" | "light">("satellite");
  const loadedCaseRef = useRef<string | null>(null);
  const injectionRef = useRef<{key: string; promise: Promise<void>} | null>(null);
  const generationRef = useRef(0);

  const resetView = useCallback(() => {
    dispatch(wrapTo(WRJ_MAP_ID, updateMap(DEFAULT_MAP_STATE)));
  }, [dispatch]);

  const changeStyle = useCallback(
    (style: "satellite" | "light") => {
      setStyleType(style);
      dispatch(wrapTo(WRJ_MAP_ID, mapStyleChange(style)));
    },
    [dispatch]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "r") resetView();
      if (event.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [resetView]);

  useEffect(() => {
    const controller = new AbortController();
    const generation = ++generationRef.current;
    const injectionKey = `riyue-3d|${dataBase}|${debugMode}|${attempt}`;
    setStatus("loading");
    setError(null);
    const run = async () => {
      try {
        const bundle = await caseLoader("riyue-3d", dataBase, controller.signal);
        if (controller.signal.aborted || generationRef.current !== generation) return;
        if (loadedCaseRef.current !== injectionKey) {
          let injection = injectionRef.current;
          if (!injection || injection.key !== injectionKey) {
            const previousInjection = injection?.promise ?? Promise.resolve();
            injection = {
              key: injectionKey,
              promise: previousInjection
                .catch(() => undefined)
                .then(() => keplerLoader(dispatch, bundle, debugMode))
            };
            injectionRef.current = injection;
          }
          await injection.promise;
          loadedCaseRef.current = injectionKey;
          if (injectionRef.current === injection) injectionRef.current = null;
        }
        if (controller.signal.aborted || generationRef.current !== generation) return;
        setSummary(bundle.summary);
        setStatus("ready");
      } catch (caught) {
        if (
          controller.signal.aborted ||
          generationRef.current !== generation ||
          isAbortError(caught)
        ) return;
        setError(errorMessage(caught));
        setStatus("error");
      }
    };
    void run();
    return () => {
      controller.abort();
      if (generationRef.current === generation) generationRef.current += 1;
    };
  }, [attempt, caseLoader, dataBase, debugMode, dispatch, keplerLoader]);

  const retry = () => {
    setAttempt((value) => value + 1);
  };
  const attribution = basemap.attributionByStyle[styleType];

  return (
    <main className="workspace">
      <header className="topbar">
        <div className="brand"><span>WRJ</span><strong>静态侦察规划</strong></div>
        <div className="case-name"><small>当前算例</small><b>日月湾三维多无人机静态侦察</b></div>
        <span className="demo-badge">演示模拟数据</span>
        <span className="token-status"><i /> {basemap.statusLabel}</span>
        {debugMode ? <span className="debug-badge">调试模式</span> : null}
        <div className="top-actions">
          <button type="button" className={styleType === "satellite" ? "active" : ""} onClick={() => changeStyle("satellite")} disabled={status !== "ready"}>{basemap.primaryLabel}</button>
          <button type="button" className={styleType === "light" ? "active" : ""} onClick={() => changeStyle("light")} disabled={status !== "ready"}>{basemap.secondaryLabel}</button>
          <button type="button" onClick={resetView}>重置三维视角</button>
        </div>
      </header>

      {status === "ready" && summary ? <MetricGrid summary={summary} /> : <div className="metric-grid metric-skeleton" />}

      <section className="main-grid">
        {status === "ready" && summary ? (
          <UavList uavs={summary.uavs} selectedId={selected?.uavId ?? null} onSelect={setSelected} />
        ) : <aside className="uav-panel panel placeholder-panel" />}

        <section className="map-panel">
          <MapView basemap={basemap} />
          {status === "loading" ? <div className="state-overlay"><span className="spinner" />正在加载算例数据…</div> : null}
          {status === "error" ? (
            <div className="state-overlay error-state">
              <strong>算例加载失败</strong>
              <p>{error}</p>
              <button type="button" onClick={retry}>重新加载</button>
            </div>
          ) : null}
          <div className="map-tag"><b>真实地理环境</b><span>任务规划为模拟数据</span></div>
        </section>

        {status === "ready" && summary ? (
          <DetailPanel summary={summary} selected={selected} attribution={attribution} />
        ) : <PendingDetailPanel status={status} attribution={attribution} />}
      </section>

      <footer className="step-indicator" aria-label="任务阶段">
        {STAGES.map((stage, index) => (
          <div key={stage} className={index < 5 ? "complete" : ""}>
            <i>{index + 1}</i><span>{stage}</span>
          </div>
        ))}
      </footer>
    </main>
  );
}
