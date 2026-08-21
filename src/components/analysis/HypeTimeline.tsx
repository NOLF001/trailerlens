"use client";

// 열광 지점 타임라인.
// 가로축 = 영상 시간. 두 개의 서로 다른 근거를 한 눈에 겹쳐 봅니다.
//   면(area)   = 유튜브 최다 재생 강도
//   아래 눈금 = 그 시점을 직접 언급한 댓글
// 번호가 붙은 세로 밴드가 선택 가능한 열광 지점입니다.
//
// 유튜브 재생바처럼 어디든 마우스를 올리면 그 시점 정보가 뜨고, 누르면 영상이
// 그 시점부터 재생됩니다. 열광 지점 밴드는 누르면 지점 선택까지 함께 합니다.

import { useId, useRef, useState } from "react";
import { Play } from "lucide-react";
import { CHART } from "@/lib/palette";
import { formatSeconds } from "@/lib/utils";
import type { HeatSegment, HypeMoment } from "@/lib/types";

const W = 1000;
const H = 190;
const PAD = { top: 14, right: 12, bottom: 30, left: 12 };
const PLOT_H = H - PAD.top - PAD.bottom;
const PLOT_W = W - PAD.left - PAD.right;

/** 툴팁에서 "이 근처 댓글"로 볼 시간 범위(초). */
const NEAR_SEC = 2;

function buildAreaPath(
  segments: HeatSegment[],
  duration: number,
): { area: string; line: string } {
  if (segments.length === 0 || duration <= 0) return { area: "", line: "" };
  const x = (t: number) => PAD.left + (PLOT_W * t) / duration;
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

/** 이 시점의 최다 재생 강도(0~1). 해당 구간이 없으면 null. */
function heatAt(segments: HeatSegment[], t: number): number | null {
  const hit = segments.find((s) => t >= s.startTime && t < s.endTime);
  return hit ? hit.value : null;
}

export function HypeTimeline({
  segments,
  moments,
  mentionSeconds,
  durationSeconds,
  selectedRank,
  onSelect,
  onSeek,
}: {
  segments: HeatSegment[];
  moments: HypeMoment[];
  /** 댓글이 직접 언급한 시점들(초). */
  mentionSeconds: number[];
  durationSeconds: number;
  selectedRank: number | null;
  onSelect: (rank: number) => void;
  /** 타임라인 아무 곳이나 눌렀을 때 그 시점부터 재생. */
  onSeek?: (seconds: number) => void;
}) {
  const gradientId = useId();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverSec, setHoverSec] = useState<number | null>(null);

  const duration = Math.max(1, durationSeconds);
  const x = (t: number) => PAD.left + (PLOT_W * t) / duration;
  const { area, line } = buildAreaPath(segments, duration);

  const ticks = Array.from({ length: 5 }, (_, i) => (duration / 4) * i);
  const baseline = PAD.top + PLOT_H;

  /** 화면 좌표 → 영상 시간(초). viewBox가 늘어나 있어도 비율로 환산합니다. */
  function secondsFromClientX(clientX: number): number | null {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    const vbX = ((clientX - rect.left) / rect.width) * W;
    const t = ((vbX - PAD.left) / PLOT_W) * duration;
    return Math.min(duration, Math.max(0, t));
  }

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    const t = secondsFromClientX(e.clientX);
    if (t != null) setHoverSec(t);
  }

  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    const t = secondsFromClientX(e.clientX);
    if (t != null) onSeek?.(t);
  }

  function nudge(delta: number) {
    setHoverSec((prev) => {
      const next = Math.min(duration, Math.max(0, (prev ?? 0) + delta));
      return next;
    });
  }

  const hoverHeat = hoverSec != null ? heatAt(segments, hoverSec) : null;
  const nearbyMentions =
    hoverSec != null
      ? mentionSeconds.filter((t) => Math.abs(t - hoverSec) <= NEAR_SEC).length
      : 0;
  const hoverMoment =
    hoverSec != null
      ? moments.find((m) => hoverSec >= m.startSec && hoverSec < m.endSec)
      : undefined;
  // 툴팁이 양끝에서 잘리지 않게 가장자리에서는 기준점을 옮깁니다.
  const hoverPct = hoverSec != null ? (x(hoverSec) / W) * 100 : 0;
  const tooltipShift = hoverPct < 12 ? "0%" : hoverPct > 88 ? "-100%" : "-50%";

  return (
    <figure className="w-full">
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="h-[190px] w-full cursor-pointer touch-none select-none"
          role="group"
          aria-label={`영상 시간대별 열광 지점 타임라인. 열광 지점 ${moments.length}개. 누르면 그 시점부터 재생됩니다.`}
          onPointerMove={handleMove}
          onPointerLeave={() => setHoverSec(null)}
          onClick={handleClick}
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
            const select = (e: React.SyntheticEvent) => {
              // 밴드를 누른 것은 "지점 선택"이므로 타임라인 전체의
              // 임의 시점 이동과 겹치지 않게 여기서 멈춥니다.
              e.stopPropagation();
              onSelect(m.rank);
            };
            return (
              <g
                key={m.rank}
                className="cursor-pointer"
                onClick={select}
                role="button"
                tabIndex={0}
                aria-label={`열광 지점 ${m.rank}, ${formatSeconds(m.startSec)}부터 ${formatSeconds(m.endSec)}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    select(e);
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
                  fontSize={isSelected ? 14 : 12}
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

          {/* 재생 위치 표시 — 유튜브 재생바의 커서와 같은 역할 */}
          {hoverSec != null && (
            <g pointerEvents="none">
              <line
                x1={x(hoverSec)}
                x2={x(hoverSec)}
                y1={PAD.top}
                y2={baseline + 8}
                stroke="#fff"
                strokeOpacity={0.85}
                strokeWidth={1.5}
              />
              {hoverHeat != null && (
                <circle
                  cx={x(hoverSec)}
                  cy={PAD.top + PLOT_H * (1 - Math.min(1, Math.max(0, hoverHeat)))}
                  r={4.5}
                  fill="#fff"
                  stroke={CHART.tealSoft}
                  strokeWidth={2}
                />
              )}
            </g>
          )}

          {/* 키보드로도 시점을 옮기고 재생할 수 있게 하는 투명 슬라이더 */}
          <rect
            x={PAD.left}
            y={PAD.top}
            width={PLOT_W}
            height={PLOT_H}
            fill="transparent"
            pointerEvents="none"
            tabIndex={0}
            role="slider"
            aria-label="영상 시간 탐색"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(hoverSec ?? 0)}
            aria-valuetext={formatSeconds(hoverSec ?? 0)}
            // 포커스를 받으면 재생 위치 표시선이 나타나므로 그것이 곧
            // 포커스 표시가 됩니다.
            className="outline-none"
            onFocus={() => setHoverSec((p) => p ?? 0)}
            onBlur={() => setHoverSec(null)}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 1 : 5;
              if (e.key === "ArrowRight") {
                e.preventDefault();
                nudge(step);
              } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                nudge(-step);
              } else if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (hoverSec != null) onSeek?.(hoverSec);
              }
            }}
          />
        </svg>

        {/* 커서 위치 정보 — 유튜브 미리보기 자리에 숫자를 대신 넣습니다. */}
        {hoverSec != null && (
          <div
            className="pointer-events-none absolute -top-1 z-10 whitespace-nowrap rounded-md border border-border/70 bg-[#12141a] px-2.5 py-1.5 text-xs shadow-lg"
            style={{ left: `${hoverPct}%`, transform: `translateX(${tooltipShift})` }}
          >
            <span className="flex items-center gap-1.5 font-mono font-semibold tabular-nums text-foreground">
              <Play className="size-3 text-primary" aria-hidden />
              {formatSeconds(hoverSec)}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
              {hoverHeat != null && <span>다시 본 강도 {Math.round(hoverHeat * 100)}</span>}
              {nearbyMentions > 0 && <span>언급 댓글 {nearbyMentions}개</span>}
              {hoverMoment && (
                <span style={{ color: CHART.crimson }}>{hoverMoment.rank}번 지점</span>
              )}
            </span>
          </div>
        )}
      </div>

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
        <span className="text-muted-foreground/80">
          타임라인 아무 곳이나 누르면 그 시점부터 재생됩니다
        </span>
      </figcaption>
    </figure>
  );
}
