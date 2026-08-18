"use client";

// 이 화면의 주인공. "사람들이 어느 지점에서 열광했는지"를 보여줍니다.
// 지점을 고르면 그 구간의 실제 댓글이 바로 아래에 뜨고, 영상도 그 시점부터 재생됩니다.

import { useState } from "react";
import { Flame, Info, MessageSquare, Play, Repeat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { HypeTimeline } from "@/components/analysis/HypeTimeline";
import { CommentQuoteList } from "@/components/analysis/CommentQuote";
import { PlayerPanel, seekPlayer } from "@/components/analysis/PlayerPanel";
import { CHART } from "@/lib/palette";
import { formatSeconds } from "@/lib/utils";
import { TOPIC_LABELS_KO, type HypeMoment, type Report } from "@/lib/types";

const EVIDENCE_LABEL: Record<HypeMoment["evidence"], string> = {
  both: "재생 기록 + 댓글",
  heatmap: "재생 기록",
  comments: "댓글",
};

export function HypeSection({ report }: { report: Report }) {
  const moments = report.hype?.moments ?? [];
  const [selected, setSelected] = useState<number>(moments[0]?.rank ?? 1);
  const current = moments.find((m) => m.rank === selected) ?? moments[0] ?? null;

  const mentionSeconds = moments.flatMap((m) =>
    m.comments.map((c) => c.timestampSec).filter((t): t is number => t != null),
  );

  const hasHeatmap = report.heatmap.segments.length > 0;

  if (moments.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-sm text-muted-foreground">
          열광 지점을 만들 근거가 없습니다. 최다 재생 구간 데이터도, 시점을 언급한
          댓글도 확보되지 않았습니다.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* 타임라인 + 플레이어 */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="overflow-hidden">
          <CardContent className="p-5">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold">영상 시간대별 열광도</h2>
              <p className="text-xs text-muted-foreground">
                {hasHeatmap
                  ? "유튜브가 집계한 '가장 많이 다시 본 구간' + 댓글 시점 언급"
                  : "댓글 시점 언급만으로 구성 (최다 재생 데이터 없음)"}
              </p>
            </div>
            <HypeTimeline
              segments={report.heatmap.segments}
              moments={moments}
              mentionSeconds={mentionSeconds}
              durationSeconds={report.video.durationSeconds}
              selectedRank={selected}
              onSelect={(rank) => {
                setSelected(rank);
                const m = moments.find((x) => x.rank === rank);
                if (m) seekPlayer(m.startSec);
              }}
            />
          </CardContent>
        </Card>

        <div className="space-y-3">
          <PlayerPanel videoId={report.video.id} isMock={report.video.isMock} />
          <p className="text-xs leading-relaxed text-muted-foreground">
            타임라인의 번호나 아래 카드를 누르면 그 시점부터 재생됩니다.
          </p>
        </div>
      </div>

      {/* 지점 선택 카드 */}
      <div>
        <h2 className="mb-3 text-base font-semibold">
          열광 지점 {moments.length}곳
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {moments.map((m) => (
            <MomentCard
              key={m.rank}
              moment={m}
              active={m.rank === selected}
              onSelect={() => {
                setSelected(m.rank);
                seekPlayer(m.startSec);
              }}
            />
          ))}
        </div>
      </div>

      {/* 선택된 지점 상세 */}
      {current && <MomentDetail moment={current} />}

      {/* 시점을 언급한 댓글 전체 */}
      <AllTimestampComments report={report} />
    </div>
  );
}

function AllTimestampComments({ report }: { report: Report }) {
  const list = report.hype?.timestampedComments ?? [];
  const coverage = report.hype?.timestampCoverage;
  if (!coverage) return null;

  const sharePct = coverage.collected > 0 ? (coverage.total / coverage.collected) * 100 : 0;

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div>
          <h3 className="text-lg font-semibold">
            시점을 언급한 댓글 전체 {list.length}개
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            영상 시각을 직접 적은 댓글을 어느 지점에 속하는지와 무관하게 시간순으로
            모았습니다.
          </p>
        </div>

        <div className="rounded-lg bg-muted/60 p-4">
          <p className="flex gap-2 text-sm leading-relaxed">
            <Info className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
            <span>
              수집한 댓글 <strong>{coverage.collected.toLocaleString()}개</strong> 중 시점을
              적은 것은{" "}
              <strong>{coverage.total.toLocaleString()}개</strong>({sharePct.toFixed(1)}
              %)입니다.
              {coverage.timestampOnly > 0 && (
                <>
                  {" "}
                  그중 {coverage.timestampOnly}개는 타임스탬프만 나열해 인용에서
                  제외했습니다.
                </>
              )}{" "}
              {coverage.quotable < 50
                ? "지점별 근거가 적은 것은 분석이 놓쳐서가 아니라 원래 시점을 적는 사람이 이만큼뿐이기 때문입니다. 댓글을 더 수집하면 이 숫자도 늘어납니다."
                : "시점을 적는 사람은 원래 전체의 2% 안팎이라, 댓글을 더 수집할수록 이 숫자도 비례해 늘어납니다."}
            </span>
          </p>
        </div>

        <CommentQuoteList
          comments={list}
          emptyText="시점을 언급한 댓글이 없습니다."
          initialVisible={8}
        />
      </CardContent>
    </Card>
  );
}

function MomentCard({
  moment,
  active,
  onSelect,
}: {
  moment: HypeMoment;
  active: boolean;
  onSelect: () => void;
}) {
  const heatPct = moment.heat != null ? Math.round(moment.heat * 100) : null;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`rounded-xl border p-4 text-left transition ${
        active
          ? "border-primary bg-primary/10 ring-1 ring-primary/40"
          : "border-border/70 bg-card/60 hover:border-primary/50 hover:bg-card"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold"
          style={{
            background: active ? CHART.crimson : "hsl(223 40% 14%)",
            color: active ? "#fff" : CHART.crimson,
          }}
        >
          {moment.rank}
        </span>
        <span className="text-lg font-semibold tabular-nums">
          {formatSeconds(moment.startSec)}
        </span>
        <span className="text-sm text-muted-foreground tabular-nums">
          –{formatSeconds(moment.endSec)}
        </span>
        <Play className="ml-auto size-4 text-muted-foreground" aria-hidden />
      </div>

      {heatPct != null && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Repeat className="size-3.5" aria-hidden />
              다시 본 강도
            </span>
            <span className="tabular-nums">{heatPct}</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{ width: `${heatPct}%`, background: CHART.tealSoft }}
            />
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline" className="font-normal">
          {EVIDENCE_LABEL[moment.evidence]}
        </Badge>
        <span className="flex items-center gap-1 text-muted-foreground">
          <MessageSquare className="size-3.5" aria-hidden />
          언급 댓글 {moment.mentionCount}개
        </span>
      </div>
    </button>
  );
}

function MomentDetail({ moment }: { moment: HypeMoment }) {
  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Flame className="size-5 text-primary" aria-hidden />
          <h3 className="text-lg font-semibold">
            {moment.rank}번 지점 · {formatSeconds(moment.startSec)}–
            {formatSeconds(moment.endSec)}
          </h3>
          <Button
            size="sm"
            variant="secondary"
            className="ml-auto"
            onClick={() => seekPlayer(moment.startSec)}
          >
            <Play aria-hidden />이 지점부터 재생
          </Button>
        </div>

        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric
            label="다시 본 강도"
            value={moment.heat != null ? `${Math.round(moment.heat * 100)}` : "—"}
            hint="구간 중 최대치를 100으로 둔 상대값"
          />
          <Metric
            label="이 구간 언급 댓글"
            value={`${moment.mentionCount}개`}
            hint="댓글에 시점을 직접 적은 것만"
          />
          <Metric label="근거" value={EVIDENCE_LABEL[moment.evidence]} hint="이 지점이 뽑힌 이유" />
          <Metric
            label="주요 주제"
            value={
              moment.topics.length > 0
                ? moment.topics.map((t) => TOPIC_LABELS_KO[t]).join(", ")
                : "—"
            }
            hint="언급 댓글에서 집계"
          />
        </dl>

        <div>
          <h4 className="mb-3 text-sm font-semibold text-muted-foreground">
            이 구간을 언급한 실제 댓글
          </h4>
          <CommentQuoteList
            initialVisible={5}
            comments={moment.comments}
            emptyText={
              moment.mentionCount > 0
                ? "이 구간을 시점으로 찍은 댓글은 있지만 타임스탬프만 나열한 형태라 인용할 내용이 없습니다."
                : "이 지점은 다시 본 횟수로만 뽑혔습니다. 시점을 직접 적은 댓글은 없습니다."
            }
          />
        </div>

        {moment.evidence === "heatmap" && (
          <p className="flex gap-2 rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            시청자가 여기를 반복해서 본 것은 확실하지만, 왜 그랬는지는 댓글 근거가
            없어 알 수 없습니다. 영상에서 직접 확인해 보세요.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold leading-tight">{value}</dd>
      <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground/80">{hint}</p>
    </div>
  );
}
