import {
  PLAYBACK_RATES,
  type PlaybackRate
} from "../../features/mission/missionClock";

export interface DynamicTimelineProps {
  missionTimeSec: number;
  makespanSec: number;
  eventTimeSec: number;
  planCommitTimeSec: number;
  playing: boolean;
  rate: PlaybackRate;
  disabled?: boolean;
  onToggle(): void;
  onSeek(value: number): void;
  onRateChange(rate: PlaybackRate): void;
  onRestart?(): void;
}

function markerLeft(timeSec: number, makespanSec: number): string {
  if (makespanSec <= 0) return "0%";
  const percentage = Math.max(
    0,
    Math.min(100, timeSec / makespanSec * 100)
  );
  return `${percentage}%`;
}

export function DynamicTimeline({
  missionTimeSec,
  makespanSec,
  eventTimeSec,
  planCommitTimeSec,
  playing,
  rate,
  disabled = false,
  onToggle,
  onSeek,
  onRateChange,
  onRestart
}: DynamicTimelineProps) {
  const markersOverlap = Math.abs(eventTimeSec - planCommitTimeSec) < 0.05;
  return (
    <section
      className="task2-timeline"
      role="region"
      aria-label="动态重规划时间轴"
    >
      <div className="task2-timeline__controls">
        <button
          type="button"
          disabled={disabled}
          onClick={onToggle}
          aria-label={playing ? "暂停动态场景" : "播放动态场景"}
        >
          {playing ? "暂停" : "播放"}
        </button>
        {onRestart === undefined ? null : (
          <button type="button" disabled={disabled} onClick={onRestart}>
            重新播放
          </button>
        )}
        <label>
          播放速度
          <select
            value={rate}
            disabled={disabled}
            onChange={event =>
              onRateChange(Number(event.currentTarget.value) as PlaybackRate)
            }
          >
            {PLAYBACK_RATES.map(value => (
              <option key={value} value={value}>{value}×</option>
            ))}
          </select>
        </label>
        <span className="task2-timeline__legend">
          <i className="event" />事件
          <i className="commit" />发布
        </span>
        <output>{missionTimeSec.toFixed(1)} / {makespanSec.toFixed(1)} s</output>
      </div>
      <div className="task2-timeline__track">
        <input
          type="range"
          min={0}
          max={makespanSec}
          step={0.1}
          value={Math.min(missionTimeSec, makespanSec)}
          disabled={disabled}
          aria-label="动态任务进度"
          onChange={event => onSeek(Number(event.currentTarget.value))}
        />
        <span
          className="task2-timeline__marker task2-timeline__marker--event"
          aria-label="动态事件时刻"
          style={{left: markerLeft(eventTimeSec, makespanSec)}}
        />
        <span
          className="task2-timeline__marker task2-timeline__marker--commit"
          aria-label="新方案生效时刻"
          style={{
            left: markerLeft(planCommitTimeSec, makespanSec),
            transform: markersOverlap ? "translateX(5px)" : undefined
          }}
        />
      </div>
    </section>
  );
}
