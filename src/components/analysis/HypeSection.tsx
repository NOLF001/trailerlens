"use client";

// 이 화면의 주인공. "사람들이 어느 지점에서 열광했는지"를 보여줍니다.
// 지점을 고르면 그 구간의 실제 댓글이 바로 아래에 뜨고, 영상도 그 시점부터 재생됩니다.

import { useState } from "react";
import { Flame, Info, MessageSquare, Play, Repeat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { HypeTimeline } from "@/components/analysis/HypeTimeline";
import { CommentQuoteList } from "@/components/analysis/CommentQuote";
import { PlayerPanel, seekPlayer } from "@/components/analysis/PlayerPanel";
import {
  AddMomentForm,
  HiddenMomentsNotice,
  MomentControls,
} from "@/components/analysis/MomentEditor";
import { CHART } from "@/lib/palette";
import { formatSeconds } from "@/lib/utils";
import { TOPIC_LABELS_KO, type HypeMoment, type Report } from "@/lib/types";

const EVIDENCE_LABEL: Record<HypeMoment["evidence"], string> = {
  both: "재생 기록 + 댓글",
  heatmap: "재생 기록",
  comments: "댓글",
  manual: "직접 지정",
};

export function HypeSection({
  report,
  analysisId,
  onDataChanged,
}: {
  report: Report;
  analysisId: string;
  onDataChanged?: () => void;
}) {
  const moments = report.hype?.moments ?? [];
  const hiddenMoments = report.hype?.hiddenMoments ?? [];
  // 편집 후에는 폴링을 한 번 더 돌려 새 보고서를 받아옵니다. 콜백이 없으면
  // (구버전 호출부) 전체 새로고침으로 물러납니다.
  const refresh = onDataChanged ?? (() => window.location.reload());
  const [selected, setSelected] = useState<number>(moments[0]?.rank ?? 1);
  const current = moments.find((m) => m.rank === selected) ?? moments[0] ?? null;

  // 눈금은 시점을 적은 댓글 "전체"에서 뽑습니다. 예전에는 열광 지점에 붙은
  // 댓글에서만 뽑아서, 어느 지점에도 안 걸린 시점 언급이 타임라인에서 통째로
  // 빠져 보였습니다(실측 92건 중 33건 누락). 지점 밖에 사람들이 반응한 자리가
  // 있다는 것 자체가 정보라서 전부 찍습니다.
  const allTimestamped = report.hype?.timestampedComments;
  const mentionSeconds = (
    allTimestamped && allTimestamped.length > 0
      ? allTimestamped
      : // 이 필드가 없는 예전 보고서는 기존 방식으로 물러납니다.
        moments.flatMap((m) => m.comments)
  )
    .map((c) => c.timestampSec)
    .filter((t): t is number => t != null);

  const hasHeatmap = report.heatmap.segments.length > 0;

  if (moments.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-4 p-10 text-center text-body text-muted-foreground">
          <p>
            열광 지점을 만들 근거가 없습니다. 최다 재생 구간 데이터도, 시점을 언급한
            댓글도 확보되지 않았습니다.
          </p>
          <div className="flex justify-center">
            <AddMomentForm
              analysisId={analysisId}
              durationSeconds={report.video.durationSeconds}
              onDone={refresh}
            />
          </div>
          <HiddenMomentsNotice
            analysisId={analysisId}
            hidden={hiddenMoments}
            onDone={refresh}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-10">
      {/* 타임라인 + 플레이어 — 카드 두 개의 padding/무게를 맞춰서 나란히 둬도
          한쪽만 붕 뜨지 않게 합니다. */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="overflow-hidden">
          <CardContent className="p-5 sm:p-6">
            <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="text-heading font-semibold">영상 시간대별 열광도</h2>
              <p className="text-caption">
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
              // 유튜브 재생바처럼 열광 지점이 아닌 곳을 눌러도 이동합니다.
              onSeek={(sec) => seekPlayer(Math.floor(sec))}
            />
          </CardContent>
        </Card>

        <Card className="flex flex-col overflow-hidden">
          <CardContent className="flex flex-1 flex-col gap-3 p-5 sm:p-6">
            <PlayerPanel videoId={report.video.id} isMock={report.video.isMock} />
            <p className="text-caption">
              타임라인의 번호나 아래 카드를 누르면 그 시점부터 재생됩니다.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 지점 선택 카드 — 1번은 primary, 나머지는 secondary */}
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-heading font-semibold">열광 지점 {moments.length}곳</h2>
          <AddMomentForm
            analysisId={analysisId}
            durationSeconds={report.video.durationSeconds}
            onDone={refresh}
          />
        </div>
        <HiddenMomentsNotice
          analysisId={analysisId}
          hidden={hiddenMoments}
          onDone={refresh}
        />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
      {current && (
        <MomentDetail moment={current} analysisId={analysisId} onDataChanged={refresh} />
      )}

      {/* 시점을 언급한 댓글 전체 */}
      <AllTimestampComments report={report} analysisId={analysisId} />
    </div>
  );
}

function AllTimestampComments({
  report,
  analysisId,
}: {
  report: Report;
  analysisId: string;
}) {
  const list = report.hype?.timestampedComments ?? [];
  const coverage = report.hype?.timestampCoverage;
  if (!coverage) return null;

  const sharePct = coverage.collected > 0 ? (coverage.total / coverage.collected) * 100 : 0;

  return (
    <CollapsibleSection
      id={`${analysisId}:all-timestamp-comments`}
      title={`시점을 언급한 댓글 전체 ${list.length}개`}
      teaser="영상 시각을 직접 적은 댓글을 시간순으로 모았습니다"
      previewGlyph={
        <span className="text-heading font-bold tabular-nums text-foreground">
          {list.length}
        </span>
      }
    >
      {/* 안내문은 댓글 목록과 다른 톤(더 작고, 배경 분리)으로 둬서 실제
          콘텐츠(댓글)와 섞이지 않게 합니다. */}
      <div className="rounded-lg border border-amber-500/20 bg-[#1f2025] p-4">
        <p className="flex gap-2 text-caption">
          <Info className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
          <span>
            수집한 댓글 {coverage.collected.toLocaleString()}개 중 시점을
            적은 것은{" "}
            <strong className="text-foreground">{coverage.total.toLocaleString()}개</strong>({sharePct.toFixed(1)}
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

      <div className="mt-6">
        <CommentQuoteList
          comments={list}
          emptyText="시점을 언급한 댓글이 없습니다."
          initialVisible={8}
        />
      </div>
    </CollapsibleSection>
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
  // 선택된 카드만 primary로 강조하고 나머지는 낮춥니다 — 6개가 전부 같은
  // 무게로 경쟁하면 어디부터 봐야 할지 알 수 없어집니다.
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`rounded-xl border text-left transition ${
        active
          ? "border-primary bg-[#190d1a] p-5 shadow-[0_0_0_1px_hsl(var(--primary)/0.25)]"
          : "border-border/30 bg-card/40 p-4 hover:border-border/60 hover:bg-card/70"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={`flex shrink-0 items-center justify-center rounded-full font-bold tabular-nums transition-all ${
            active ? "size-8 text-body-lg" : "size-6 text-caption"
          }`}
          style={{
            background: active ? CHART.crimson : "hsl(var(--muted))",
            color: active ? "#fff" : "hsl(var(--muted-foreground))",
          }}
        >
          {moment.rank}
        </span>
        <span
          className={`tabular-nums ${
            active ? "text-display font-bold text-primary" : "text-body-lg font-medium text-foreground/85"
          }`}
        >
          {formatSeconds(moment.startSec)}
        </span>
        <span className="text-caption tabular-nums">–{formatSeconds(moment.endSec)}</span>
        {active && <Play className="ml-auto size-4 text-primary/70" aria-hidden />}
      </div>

      {heatPct != null && (
        <div className="mt-3.5">
          {/* 라벨과 값을 같은 줄에 붙여서 — 카드 양 끝으로 벌려두면 값이
              라벨과 무관해 보입니다. */}
          <div className="flex items-center gap-1.5 text-caption">
            <Repeat className="size-3.5 shrink-0" aria-hidden />
            <span>다시 본 강도</span>
            <span className={`tabular-nums ${active ? "font-semibold text-foreground" : ""}`}>
              {heatPct}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{
                width: `${heatPct}%`,
                background: CHART.tealSoft,
                opacity: active ? 1 : 0.7,
              }}
            />
          </div>
        </div>
      )}

      <div className="mt-3.5 flex flex-wrap items-center gap-2 text-caption">
        <Badge variant="outline" className="font-normal">
          {EVIDENCE_LABEL[moment.evidence]}
        </Badge>
        <span className="flex items-center gap-1">
          <MessageSquare className="size-3.5" aria-hidden />
          언급 댓글 {moment.mentionCount}개
        </span>
      </div>

      {moment.description && (
        <p className="mt-2.5 line-clamp-2 text-caption text-muted-foreground">
          {moment.description}
        </p>
      )}
    </button>
  );
}

function MomentDetail({
  moment,
  analysisId,
  onDataChanged,
}: {
  moment: HypeMoment;
  analysisId: string;
  onDataChanged: () => void;
}) {
  return (
    // Heading → Metrics → Evidence → Comments 순서로 읽히게 합니다.
    <Card className="border-primary/25">
      <CardContent className="space-y-6 p-6 sm:p-7">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2.5">
            <Flame className="size-5 shrink-0 text-primary" aria-hidden />
            <h3 className="text-heading font-bold tabular-nums">
              {moment.rank}번 지점 · {formatSeconds(moment.startSec)}–
              {formatSeconds(moment.endSec)}
            </h3>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="ml-auto"
            onClick={() => seekPlayer(moment.startSec)}
          >
            <Play aria-hidden />이 지점부터 재생
          </Button>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-y border-border/30 py-5 sm:grid-cols-4">
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

        <MomentControls
          analysisId={analysisId}
          moment={moment}
          onDone={onDataChanged}
        />

        {moment.evidence === "heatmap" && (
          <p className="flex gap-2 rounded-lg bg-muted/50 p-3 text-caption">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            시청자가 여기를 반복해서 본 것은 확실하지만, 왜 그랬는지는 댓글 근거가
            없어 알 수 없습니다. 영상에서 직접 확인해 보세요.
          </p>
        )}

        <div>
          <h4 className="mb-4 text-body-lg font-semibold">이 구간을 언급한 실제 댓글</h4>
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
      <dt className="text-caption">{label}</dt>
      <dd className="text-display mt-1 font-bold tabular-nums">{value}</dd>
      <p className="text-caption mt-1 text-muted-foreground/80">{hint}</p>
    </div>
  );
}
