"use client";

// 열광 지점 타임라인.
// 가로축 = 영상 시간. 두 개의 서로 다른 근거를 한 눈에 겹쳐 봅니다.
//   면(area)   = 유튜브 최다 재생 강도
//   아래 눈금 = 그 시점을 직접 언급한 댓글
// 번호가 붙은 세로 밴드가 선택 가능한 열광 지점입니다.

import { useId } from "react";
import { CHART } from "@/lib/palette";
import { formatSeconds } from "@/lib/utils";
import type { HeatSegment, HypeMoment } from "@/lib/types";

const W = 1000;
const H = 190;
const PAD = { top: 14, right: 12, bottom: 30, left: 12 };
const PLOT_H = H - PAD.top - PAD.bottom;

function buildAreaPath(
  segments: HeatSegment[],
  duration: number,
): { area: string; line: string } {
  if (segments.length === 0 || duration <= 0) return { area: "", line: "" };
  const x = (t: number) => PAD.left + ((W - PAD.left - PAD.right) * t) / duration;
  const y = (v: number) => PAD.top + PLOT_H * (1 - Math.min(1, Math.max(0, v)));

  const pts = segments
    .map((s) => ({ t: (s.startTime + s.endTime) / 2, v: s.value }))
    .sort((a, b) => a.t - b.t);

  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  const area = `${line} L${x(last.t).toFixed(1)},${(PAD.top + PLOT_H).toFixed(1)} L${x(first.t).toFixed(1)},${(PAD.top + PLOT_H).toFixed(1)} Z`;
  return { area, line };
}

export function HypeTimeline({
  segments,
  moments,
  mentionSeconds,
  durationSeconds,
  selectedRank,
  onSelect,
}: {
  segments: HeatSegment[];
  moments: HypeMoment[];
  /** 댓글이 직접 언급한 시점들(초). */
  mentionSeconds: number[];
  durationSeconds: number;
  selectedRank: number | null;
  onSelect: (rank: number) => void;
}) {
  const gradientId = useId();
  const duration = Math.max(1, durationSeconds);
  const x = (t: number) => PAD.left + ((W - PAD.left - PAD.right) * t) / duration;
  const { area, line } = buildAreaPath(segments, duration);

  const ticks = Array.from({ length: 5 }, (_, i) => (duration / 4) * i);
  const baseline = PAD.top + PLOT_H;

  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-[190px] w-full touch-none select-none"
        role="img"
        aria-label={`영상 시간대별 열광 지점 타임라인. 열광 지점 ${moments.length}개.`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART.tealSoft} stopOpacity={0.55} />
            <stop offset="100%" stopColor={CHART.tealSoft} stopOpacity={0.03} />
          </linearGradient>
        </defs>

        {/* 눈금선 — plot을 깨끗하게 유지하려고 아주 옅게 */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={PAD.left}
            x2={W - PAD.right}
            y1={PAD.top + PLOT_H * f}
            y2={PAD.top + PLOT_H * f}
            stroke="hsl(222 22% 27%)"
            strokeOpacity={0.4}
            strokeWidth={1}
          />
        ))}

        {/* 최다 재생 강도 */}
        {area && <path d={area} fill={`url(#${gradientId})`} />}
        {line && <path d={line} fill="none" stroke={CHART.tealSoft} strokeWidth={2} />}

        {/* 열광 지점 밴드 */}
        {moments.map((m) => {
          const isSelected = m.rank === selectedRank;
          const left = x(m.startSec);
          const width = Math.max(6, x(m.endSec) - left);
          return (
            <g
              key={m.rank}
              className="cursor-pointer"
              onClick={() => onSelect(m.rank)}
              role="button"
              tabIndex={0}
              aria-label={`열광 지점 ${m.rank}, ${formatSeconds(m.startSec)}부터 ${formatSeconds(m.endSec)}`}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(m.rank);
                }
              }}
            >
              {/* 선택된 지점만 강하게: 나머지는 옅은 회색 윤곽만 남겨서
                  숫자들이 서로 경쟁하지 않게 합니다. */}
              <rect
                x={left}
                y={PAD.top}
                width={width}
                height={PLOT_H}
                fill={CHART.crimson}
                fillOpacity={isSelected ? 0.28 : 0.06}
                stroke={isSelected ? CHART.crimson : "hsl(222 18% 45%)"}
                strokeOpacity={isSelected ? 0.9 : 0.3}
                strokeWidth={isSelected ? 2 : 1}
                rx={3}
              />
              <circle
                cx={left + width / 2}
                cy={PAD.top + 2}
                r={isSelected ? 12 : 9}
                fill={isSelected ? CHART.crimson : "hsl(222 30% 16%)"}
                stroke={isSelected ? CHART.crimson : "hsl(222 18% 45%)"}
                strokeWidth={isSelected ? 1.5 : 1}
              />
              <text
                x={left + width / 2}
                y={PAD.top + (isSelected ? 6 : 5)}
                textAnchor="middle"
                fontSize={isSelected ? 13 : 10}
                fontWeight={isSelected ? 700 : 500}
                fill={isSelected ? "#fff" : "hsl(220 15% 60%)"}
              >
                {m.rank}
              </text>
            </g>
          );
        })}

        {/* 축 */}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={baseline}
          y2={baseline}
          stroke="hsl(222 22% 27%)"
          strokeWidth={1}
        />

        {/* 댓글이 직접 언급한 시점 */}
        {mentionSeconds.map((t, i) => (
          <line
            key={`${t}-${i}`}
            x1={x(t)}
            x2={x(t)}
            y1={baseline + 1}
            y2={baseline + 8}
            stroke={CHART.amber}
            strokeWidth={2}
            strokeOpacity={0.8}
          />
        ))}

        {ticks.map((t) => (
          <text
            key={t}
            x={x(t)}
            y={H - 8}
            textAnchor={t === 0 ? "start" : t === duration ? "end" : "middle"}
            fontSize={12}
            fill="hsl(220 18% 60%)"
          >
            {formatSeconds(t)}
          </text>
        ))}
      </svg>

      <figcaption className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-sm" style={{ background: CHART.tealSoft }} />
          유튜브 최다 재생 강도
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="h-3 w-3 rounded-sm border"
            style={{ borderColor: CHART.crimson, background: `${CHART.crimson}33` }}
          />
          열광 지점 (누르면 아래에 상세)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-0.5" style={{ background: CHART.amber }} />
          댓글이 직접 적은 시점 {mentionSeconds.length}건
        </span>
      </figcaption>
    </figure>
  );
}
