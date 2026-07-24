import {PLAYBACK_RATES, type PlaybackRate} from "../../features/mission/missionClock";
import type {NormalizedSortie} from "../../features/cases/caseBundle";
import type {LiveSortieState} from "../../features/mission/missionInterpolation";

export interface MissionTimelineProps {
  missionTimeSec: number;
  makespanSec: number;
  playing: boolean;
  rate: PlaybackRate;
  sorties: readonly NormalizedSortie[];
  liveSorties: readonly LiveSortieState[];
  disabled?: boolean;
  onToggle: () => void;
  onSeek: (missionTimeSec: number) => void;
  onRateChange: (rate: PlaybackRate) => void;
}

function formatClock(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(wholeSeconds / 3_600);
  const minutes = Math.floor(wholeSeconds % 3_600 / 60);
  const remainingSeconds = wholeSeconds % 60;
  return [hours, minutes, remainingSeconds]
    .map(value => String(value).padStart(2, "0"))
    .join(":");
}

function currentBatch(
  sorties: readonly NormalizedSortie[],
  missionTimeSec: number
): number | null {
  const launched = sorties
    .filter(sortie => sortie.plannedLaunchTimeSec <= missionTimeSec)
    .map(sortie => sortie.batchIndex);
  return launched.length === 0 ? null : Math.max(...launched) + 1;
}

export function MissionTimeline({
  missionTimeSec,
  makespanSec,
  playing,
  rate,
  sorties,
  liveSorties,
  disabled = false,
  onToggle,
  onSeek,
  onRateChange
}: MissionTimelineProps) {
  const batch = currentBatch(sorties, missionTimeSec);
  const activeCount = liveSorties.filter(sortie => sortie.status === "flying").length;
  const controlsDisabled = disabled || makespanSec <= 0;

  return (
    <section
      aria-label="任务时间轴"
      className="mission-timeline"
      style={{
        position: "absolute",
        zIndex: 4,
        right: 16,
        bottom: 16,
        left: 16,
        display: "grid",
        gridTemplateColumns: "auto minmax(160px, 1fr) auto",
        alignItems: "center",
        gap: 10,
        padding: "9px 12px",
        border: "1px solid rgba(151, 169, 187, .25)",
        borderRadius: 6,
        background: "rgba(9, 18, 27, .9)",
        color: "#dbe7f1"
      }}
    >
      <button
        type="button"
        disabled={controlsDisabled}
        aria-label={playing ? "暂停任务" : "播放任务"}
        onClick={onToggle}
      >
        {playing ? "Ⅱ" : "▶"}
      </button>
      <label style={{display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 8}}>
        <output>{formatClock(missionTimeSec)}</output>
        <output
          aria-label="当前任务时间原始秒"
          className="sr-only"
        >
          {missionTimeSec.toFixed(3)} 秒
        </output>
        <input
          aria-label="任务进度"
          type="range"
          min="0"
          max={makespanSec}
          step="0.001"
          value={Math.min(missionTimeSec, makespanSec)}
          disabled={controlsDisabled}
          onChange={event => onSeek(event.currentTarget.valueAsNumber)}
        />
        <output>{formatClock(makespanSec)}</output>
      </label>
      <div style={{display: "flex", alignItems: "center", gap: 6}}>
        <span>{batch === null ? "当前批次 —" : `当前批次 ${batch}`}</span>
        <span>飞行中 {activeCount}</span>
        {PLAYBACK_RATES.map(playbackRate => (
          <button
            key={playbackRate}
            type="button"
            disabled={controlsDisabled}
            aria-label={`${playbackRate} 倍速`}
            aria-pressed={rate === playbackRate}
            onClick={() => onRateChange(playbackRate)}
          >
            {playbackRate}×
          </button>
        ))}
      </div>
    </section>
  );
}
