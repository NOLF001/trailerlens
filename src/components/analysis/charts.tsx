"use client";

// Recharts chart components. Palette values are validated (src/lib/palette.ts).
// Every chart ships a text alternative (<details> table) — never color-alone.

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useReducedMotion } from "framer-motion";
import { CHART, SENTIMENT_COLORS, SENTIMENT_LABELS_KO } from "@/lib/palette";
import { formatSeconds } from "@/lib/utils";
import type { HeatPeak, HeatSegment, Sentiment } from "@/lib/types";
import { seekPlayer } from "@/components/analysis/PlayerPanel";

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(222 38% 11%)",
  border: "1px solid hsl(222 22% 27%)",
  borderRadius: 8,
  fontSize: 12,
  color: "hsl(222 25% 95%)",
} as const;

function ChartTable({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: string[];
  rows: (string | number)[][];
}) {
  return (
    <details className="mt-2 text-caption text-muted-foreground">
      <summary className="cursor-pointer select-none">표로 보기</summary>
      <div className="mt-1 overflow-x-auto">
        <table className="w-full min-w-64 border-collapse text-left">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h} className="border-b border-border py-1 pr-4 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} className="border-b border-border/50 py-1 pr-4">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

// ── Sentiment donut ──────────────────────────────────────────────────────────

export function SentimentDonut({
  counts,
}: {
  counts: Record<Sentiment, number>;
}) {
  const reducedMotion = useReducedMotion() ?? false;
  const order: Sentiment[] = ["positive", "neutral", "negative", "mixed"];
  const total = order.reduce((s, k) => s + (counts[k] ?? 0), 0);
  const data = order
    .map((k) => ({ key: k, name: SENTIMENT_LABELS_KO[k], value: counts[k] ?? 0 }))
    .filter((d) => d.value > 0);

  return (
    <figure aria-label="감정 분포 도넛 차트">
      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <div className="h-44 w-44 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={48}
                outerRadius={72}
                paddingAngle={2}
                stroke="hsl(223 45% 8%)"
                strokeWidth={2}
                isAnimationActive={!reducedMotion}
                animationDuration={900}
                animationEasing="ease-out"
              >
                {data.map((d) => (
                  <Cell key={d.key} fill={SENTIMENT_COLORS[d.key]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value: number | string, name: string) => [
                  `${Number(value).toLocaleString()}개 (${total > 0 ? ((Number(value) / total) * 100).toFixed(1) : 0}%)`,
                  name,
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="grid w-full grid-cols-2 gap-2 text-body" aria-hidden={false}>
          {order.map((k) => {
            const v = counts[k] ?? 0;
            return (
              <li key={k} className="flex items-center gap-2">
                <span
                  className="inline-block size-2.5 rounded-full"
                  style={{ backgroundColor: SENTIMENT_COLORS[k] }}
                  aria-hidden
                />
                <span className="text-muted-foreground">{SENTIMENT_LABELS_KO[k]}</span>
                <span className="ml-auto font-medium tabular-nums">
                  {total > 0 ? `${((v / total) * 100).toFixed(1)}%` : "—"}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <ChartTable
        caption="감정 분포"
        head={["감정", "댓글 수", "비율"]}
        rows={order.map((k) => [
          SENTIMENT_LABELS_KO[k],
          (counts[k] ?? 0).toLocaleString(),
          total > 0 ? `${(((counts[k] ?? 0) / total) * 100).toFixed(1)}%` : "0%",
        ])}
      />
    </figure>
  );
}

// ── Replay heatmap area ──────────────────────────────────────────────────────

export function HeatmapArea({
  segments,
  peaks,
  durationSeconds,
}: {
  segments: HeatSegment[];
  peaks: HeatPeak[];
  durationSeconds: number;
}) {
  if (segments.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-6 text-center text-body text-muted-foreground">
        반복 재생 데이터가 없습니다. 아래에서 수동으로 가져오거나, 채널 소유자
        모드/실험적 로컬 모드를 사용할 수 있습니다.
      </p>
    );
  }

  const data = segments.map((s) => ({
    t: (s.startTime + s.endTime) / 2,
    value: Number(s.value.toFixed(3)),
  }));

  return (
    <figure aria-label="반복 재생 강도 타임라인">
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: -18 }}>
            <defs>
              <linearGradient id="heatFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART.tealSoft} stopOpacity={0.5} />
                <stop offset="100%" stopColor={CHART.tealSoft} stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="t"
              type="number"
              domain={[0, durationSeconds]}
              tickFormatter={(v: number) => formatSeconds(v)}
              tick={{ fill: "hsl(220 18% 74%)", fontSize: 12 }}
              stroke="hsl(223 34% 20%)"
            />
            <YAxis
              domain={[0, 1]}
              tickFormatter={(v: number) => v.toFixed(1)}
              tick={{ fill: "hsl(220 18% 74%)", fontSize: 12 }}
              stroke="hsl(223 34% 20%)"
              width={40}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelFormatter={(v) => `${formatSeconds(Number(v))} 지점`}
              formatter={(value: number | string) => [
                `${Number(value).toFixed(2)}`,
                "상대 강도(0~1)",
              ]}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={CHART.tealSoft}
              strokeWidth={2}
              fill="url(#heatFill)"
            />
            {peaks.map((p) => (
              <ReferenceDot
                key={p.rank}
                x={(p.startTime + p.endTime) / 2}
                y={Math.min(1, p.value)}
                r={6}
                fill={CHART.crimson}
                stroke="hsl(223 45% 8%)"
                strokeWidth={2}
                onClick={() => seekPlayer(p.startTime)}
                className="cursor-pointer"
                aria-label={`피크 ${p.rank}: ${formatSeconds(p.startTime)}`}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <ChartTable
        caption="반복 재생 피크"
        head={["순위", "구간", "상대 강도"]}
        rows={peaks.map((p) => [
          p.rank,
          `${formatSeconds(p.startTime)}–${formatSeconds(p.endTime)}`,
          p.value.toFixed(2),
        ])}
      />
    </figure>
  );
}

// ── Daily comment histogram ──────────────────────────────────────────────────

export function DailyBars({ data }: { data: { date: string; count: number }[] }) {
  const reducedMotion = useReducedMotion() ?? false;
  if (data.length === 0) {
    return <p className="text-body text-muted-foreground">데이터가 없습니다.</p>;
  }
  return (
    <figure aria-label="일자별 댓글 수">
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}>
            <XAxis
              dataKey="date"
              tickFormatter={(v: string) => v.slice(5)}
              tick={{ fill: "hsl(220 18% 74%)", fontSize: 12 }}
              stroke="hsl(223 34% 20%)"
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: "hsl(220 18% 74%)", fontSize: 12 }}
              stroke="hsl(223 34% 20%)"
              allowDecimals={false}
              width={40}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value: number | string) => [
                `${Number(value).toLocaleString()}개`,
                "댓글",
              ]}
            />
            <Bar
              dataKey="count"
              fill={CHART.violet}
              radius={[4, 4, 0, 0]}
              maxBarSize={18}
              isAnimationActive={!reducedMotion}
              animationDuration={500}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ChartTable
        caption="일자별 댓글 수"
        head={["날짜", "댓글 수"]}
        rows={data.map((d) => [d.date, d.count.toLocaleString()])}
      />
    </figure>
  );
}
