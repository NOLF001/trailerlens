"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  ExternalLink,
  Flame,
  MessageSquareText,
  MessagesSquare,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SentimentDonut, DailyBars } from "@/components/analysis/charts";
import { HypeSection } from "@/components/analysis/HypeSection";
import { ReactionsSection } from "@/components/analysis/ReactionsSection";
import { SceneList } from "@/components/analysis/SceneList";
import { seekPlayer } from "@/components/analysis/PlayerPanel";
import { HeatmapUpload } from "@/components/analysis/HeatmapUpload";
import { CHART, LANGUAGE_COLORS, LANGUAGE_LABELS_KO, HEATMAP_SOURCE_META } from "@/lib/palette";
import { formatCount, formatPercent, formatSeconds } from "@/lib/utils";
import { watchUrl } from "@/lib/youtube/url";
import {
  MODE_LABELS_KO,
  TOPIC_LABELS_KO,
  type Report,
  type StatsVariant,
  type Topic,
} from "@/lib/types";

const TAB_CLASS =
  "gap-2 rounded-md px-4 py-2 text-sm data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm";

export function ReportView({ analysisId, report }: { analysisId: string; report: Report }) {
  const [cleaned, setCleaned] = useState(true);
  const stats = cleaned ? report.stats.cleaned : report.stats.raw;

  return (
    <div className="space-y-6">
      <SummaryHeader report={report} />

      <Tabs defaultValue="hype" className="space-y-5">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 p-1">
          <TabsTrigger value="hype" className={TAB_CLASS}>
            <Flame className="size-4" aria-hidden />
            열광 지점
          </TabsTrigger>
          <TabsTrigger value="reactions" className={TAB_CLASS}>
            <MessagesSquare className="size-4" aria-hidden />
            반응 모아보기
          </TabsTrigger>
          <TabsTrigger value="stats" className={TAB_CLASS}>
            <Scale className="size-4" aria-hidden />
            통계
          </TabsTrigger>
          <TabsTrigger value="source" className={TAB_CLASS}>
            <ShieldCheck className="size-4" aria-hidden />
            데이터 출처
          </TabsTrigger>
        </TabsList>

        {/* 1. 열광 지점 — 이 화면의 주인공 */}
        <TabsContent value="hype" className="mt-0 focus-visible:outline-none">
          <HypeSection report={report} />
        </TabsContent>

        {/* 2. 반응 모아보기 */}
        <TabsContent value="reactions" className="mt-0 focus-visible:outline-none">
          {report.hype ? (
            <ReactionsSection
              hype={report.hype}
              analyzedCount={report.collection.collectedTotal}
            />
          ) : (
            <Card>
              <CardContent className="p-10 text-center text-sm text-muted-foreground">
                이 보고서는 반응 분류 이전 버전입니다. 다시 분석하면 표시됩니다.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* 3. 통계 */}
        <TabsContent value="stats" className="mt-0 space-y-8 focus-visible:outline-none">
          <section aria-labelledby="overview-heading" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="overview-heading" className="text-base font-semibold">
                댓글 반응 개요
              </h2>
              <div className="flex items-center gap-2">
                <Switch id="cleaned-toggle" checked={cleaned} onCheckedChange={setCleaned} />
                <Label htmlFor="cleaned-toggle" className="text-sm text-muted-foreground">
                  {cleaned ? "정제 데이터 (중복·스팸 제거)" : "원본 데이터 (전체)"}
                </Label>
              </div>
            </div>
            <OverviewGrid stats={stats} />
          </section>

          <section aria-labelledby="topics-heading" className="space-y-3">
            <h2 id="topics-heading" className="text-base font-semibold">
              주제별 반응
            </h2>
            <p className="text-sm text-muted-foreground">
              비율은 분석된 댓글 대비, 영향력은 좋아요 가중치(1 + ln(1+좋아요)) 합계
              기준입니다.
            </p>
            <TopicsTable stats={stats} summaries={report.topicSummaries} />
          </section>

          <section aria-labelledby="controversy-heading" className="space-y-3">
            <h2 id="controversy-heading" className="text-base font-semibold">
              논쟁 및 우려
            </h2>
            <p className="text-sm text-muted-foreground">
              소수 의견이 사라지지 않도록 별도로 표시합니다. 개별 작성자가 아닌 집단
              수준의 요약입니다.
            </p>
            <ControversyGrid report={report} />
          </section>

          <section aria-labelledby="scenes-heading" className="space-y-3">
            <h2 id="scenes-heading" className="text-base font-semibold">
              장면 클러스터 (원본)
            </h2>
            <p className="text-sm text-muted-foreground">
              열광 지점의 바탕이 된 군집 데이터입니다. 구간을 직접 수정할 수 있습니다.
            </p>
            <SceneList analysisId={analysisId} scenes={report.scenes} />
          </section>
        </TabsContent>

        {/* 4. 데이터 출처 */}
        <TabsContent value="source" className="mt-0 space-y-5 focus-visible:outline-none">
          <SourcePanel report={report} analysisId={analysisId} />
        </TabsContent>
      </Tabs>

      <div className="flex justify-center pb-4">
        <Button asChild variant="outline" size="lg">
          <Link href={`/analysis/${analysisId}/comments`}>
            <MessageSquareText aria-hidden />
            댓글 탐색기 열기 ({report.collection.collectedTotal.toLocaleString()}개)
          </Link>
        </Button>
      </div>
    </div>
  );
}

// ── 상단 요약 ────────────────────────────────────────────────────────────────

function SummaryHeader({ report }: { report: Report }) {
  const v = report.video;
  const topMoment = report.hype?.moments[0] ?? null;

  return (
    <section
      aria-label="분석 요약"
      className="relative overflow-hidden rounded-xl border bg-card"
    >
      {v.thumbnailUrl && (
        <div className="pointer-events-none absolute inset-0 opacity-20">
          <Image
            src={v.thumbnailUrl}
            alt=""
            fill
            sizes="100vw"
            className="scale-110 object-cover blur-2xl"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/30 to-card" />
        </div>
      )}
      <div className="relative flex flex-col gap-6 p-6 sm:flex-row">
        <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg border border-border/60 sm:w-64">
          {v.thumbnailUrl ? (
            <Image src={v.thumbnailUrl} alt="" fill sizes="256px" className="object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center bg-muted text-muted-foreground">
              썸네일 없음
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {v.isMock && <Badge variant="secondary">Mock 데이터</Badge>}
            <Badge variant="muted">{MODE_LABELS_KO[report.mode]}</Badge>
            <span className="text-xs text-muted-foreground">
              {new Date(report.generatedAt).toLocaleString("ko-KR")} 기준
            </span>
          </div>

          <h1 className="text-2xl font-bold leading-tight">{v.title}</h1>
          <p className="text-sm text-muted-foreground">
            {v.channelTitle} ·{" "}
            <a
              href={watchUrl(v.id)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
            >
              YouTube에서 열기 <ExternalLink className="size-3" aria-hidden />
            </a>
          </p>

          {topMoment && (
            <p className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2.5 text-sm">
              <Flame className="size-4 shrink-0 text-primary" aria-hidden />
              <span>
                가장 열광한 지점은{" "}
                <strong className="text-primary tabular-nums">
                  {formatSeconds(topMoment.startSec)}–{formatSeconds(topMoment.endSec)}
                </strong>
                {topMoment.mentionCount > 0
                  ? ` · 이 구간을 직접 언급한 댓글 ${topMoment.mentionCount}개`
                  : " · 다시 본 횟수 기준"}
              </span>
            </p>
          )}

          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            <Stat label="조회수" value={formatCount(v.viewCount)} />
            <Stat label="좋아요" value={formatCount(v.likeCount)} />
            <Stat label="유튜브 표시 댓글" value={formatCount(v.commentCount)} />
            <Stat
              label="수집 댓글"
              value={report.collection.collectedTotal.toLocaleString()}
            />
          </dl>

          <p className="text-sm leading-relaxed text-muted-foreground">{report.conclusion}</p>
        </div>
      </div>
    </section>
  );
}

// ── 데이터 출처 ──────────────────────────────────────────────────────────────

function SourcePanel({ report, analysisId }: { report: Report; analysisId: string }) {
  const sourceMeta = HEATMAP_SOURCE_META[report.heatmap.source] ?? HEATMAP_SOURCE_META.none!;
  const notices = [...report.collection.notices, ...report.completeness];

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>반복 재생 데이터</CardTitle>
            <CardDescription className="mt-1">{report.heatmap.disclaimer}</CardDescription>
          </div>
          <Badge
            variant="outline"
            className="shrink-0"
            style={{ borderColor: sourceMeta.color, color: sourceMeta.color }}
          >
            {sourceMeta.label}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <Stat label="수집 구간 수" value={`${report.heatmap.segments.length}개`} />
            <Stat label="검출 피크" value={`${report.heatmap.peaks.length}개`} />
            <Stat label="영상 길이" value={formatSeconds(report.video.durationSeconds)} />
          </dl>
          <HeatmapUpload analysisId={analysisId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>이 분석이 말할 수 없는 것</CardTitle>
          <CardDescription className="mt-1">
            결과를 읽을 때 함께 봐야 하는 한계입니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {notices.map((n, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
                {n}
              </li>
            ))}
            {notices.length === 0 && (
              <li className="text-sm text-muted-foreground">기록된 제한 사항이 없습니다.</li>
            )}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

// ── 개요 그리드 ──────────────────────────────────────────────────────────────

function OverviewGrid({ stats }: { stats: StatsVariant }) {
  const langEntries = useMemo(
    () =>
      Object.entries(stats.languageShares)
        .sort((a, b) => b[1] - a[1])
        .map(([lang, count]) => ({
          lang,
          count,
          share: stats.totalComments > 0 ? count / stats.totalComments : 0,
        })),
    [stats],
  );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>감정 분포</CardTitle>
          <CardDescription>
            분석된 댓글 {stats.analyzedCount.toLocaleString()}개 기준
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SentimentDonut counts={stats.sentimentCounts} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>언어별 비율</CardTitle>
          <CardDescription>스크립트 기반 자동 감지</CardDescription>
        </CardHeader>
        <CardContent>
          <figure aria-label="언어별 비율">
            <div
              className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={langEntries
                .map(
                  (e) =>
                    `${LANGUAGE_LABELS_KO[e.lang] ?? e.lang} ${formatPercent(e.share)}`,
                )
                .join(", ")}
            >
              {langEntries.map((e) => (
                <span
                  key={e.lang}
                  style={{
                    width: `${Math.max(1, e.share * 100)}%`,
                    backgroundColor: LANGUAGE_COLORS[e.lang] ?? CHART.slate,
                  }}
                  className="border-r-2 border-card last:border-r-0"
                />
              ))}
            </div>
            <ul className="mt-3 space-y-1.5 text-sm">
              {langEntries.map((e) => (
                <li key={e.lang} className="flex items-center gap-2">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: LANGUAGE_COLORS[e.lang] ?? CHART.slate }}
                    aria-hidden
                  />
                  <span className="text-muted-foreground">
                    {LANGUAGE_LABELS_KO[e.lang] ?? e.lang}
                  </span>
                  <span className="ml-auto tabular-nums">
                    {e.count.toLocaleString()}개 · {formatPercent(e.share)}
                  </span>
                </li>
              ))}
            </ul>
          </figure>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>구성 요약</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Stat label="전체 댓글" value={stats.totalComments.toLocaleString()} />
            <Stat
              label="최상위 / 답글"
              value={`${stats.topLevelCount.toLocaleString()} / ${stats.replyCount.toLocaleString()}`}
            />
            <Stat label="고유 작성자" value={stats.uniqueAuthors.toLocaleString()} />
            <Stat label="중복 댓글" value={stats.duplicateCount.toLocaleString()} />
            <Stat
              label="짧은/이모지 댓글"
              value={stats.shortOrEmojiCount.toLocaleString()}
            />
            <Stat
              label="타임스탬프 언급"
              value={`${stats.timestampMentionCount.toLocaleString()}회`}
            />
            <Stat label="좋아요 합계" value={stats.likeTotal.toLocaleString()} />
            <Stat
              label="댓글당 평균 좋아요"
              value={stats.avgLikesPerComment.toFixed(1)}
            />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>시간대별 댓글 분포</CardTitle>
          <CardDescription>게시일 기준 일별 댓글 수</CardDescription>
        </CardHeader>
        <CardContent>
          <DailyBars data={stats.commentsPerDay} />
        </CardContent>
      </Card>
    </div>
  );
}

// ── 인상 요인 테이블 ─────────────────────────────────────────────────────────

function TopicsTable({
  stats,
  summaries,
}: {
  stats: StatsVariant;
  summaries: Partial<Record<Topic, string>>;
}) {
  const maxShare = Math.max(...stats.topics.map((t) => t.share), 0.0001);
  return (
    <div className="space-y-2">
      {stats.topics.slice(0, 12).map((t) => (
        <Card key={t.topic}>
          <CardContent className="space-y-2 p-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="min-w-32 font-semibold">
                {TOPIC_LABELS_KO[t.topic] ?? t.topic}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {t.count.toLocaleString()}개 · {formatPercent(t.share)}
              </span>
              <span className="tabular-nums text-muted-foreground">
                영향력 {formatPercent(t.likeWeightedShare)}
              </span>
              <span className="ml-auto flex items-center gap-2 text-xs tabular-nums">
                <span style={{ color: CHART.tealSoft }}>
                  긍정 {formatPercent(t.positiveShare)}
                </span>
                <span style={{ color: "#fb7185" }}>
                  부정 {formatPercent(t.negativeShare)}
                </span>
              </span>
            </div>
            {/* 댓글 수 vs 좋아요 가중 영향력 — 두 지표를 나란히 표시 */}
            <div className="space-y-1" aria-hidden>
              <MetricBar
                label="댓글 비중"
                ratio={t.share / maxShare}
                display={formatPercent(t.share)}
                color={CHART.teal}
              />
              <MetricBar
                label="좋아요 가중"
                ratio={t.likeWeightedShare / Math.max(0.0001, maxShare)}
                display={formatPercent(t.likeWeightedShare)}
                color={CHART.violet}
              />
            </div>
            {summaries[t.topic] && (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {summaries[t.topic]}
              </p>
            )}
            {t.relatedTimestamps.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">관련 타임스탬프:</span>
                {t.relatedTimestamps.map((ts) => (
                  <button
                    key={ts}
                    type="button"
                    onClick={() => seekPlayer(ts)}
                    className="rounded bg-muted px-1.5 py-0.5 font-mono tabular-nums hover:bg-accent"
                  >
                    {formatSeconds(ts)}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function MetricBar({
  label,
  ratio,
  display,
  color,
}: {
  label: string;
  ratio: number;
  display: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
      <span className="w-20 shrink-0">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(100, Math.max(2, ratio * 100))}%`,
            backgroundColor: color,
          }}
        />
      </div>
      <span className="w-12 text-right tabular-nums">{display}</span>
    </div>
  );
}

// ── 논쟁 및 우려 ─────────────────────────────────────────────────────────────

function ControversyGrid({ report }: { report: Report }) {
  if (report.controversy.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        뚜렷한 논쟁·우려 신호가 관찰되지 않았습니다.
      </p>
    );
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {report.controversy.map((c) => (
        <Card key={c.topic} className="border-amber-900/40">
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{TOPIC_LABELS_KO[c.topic] ?? c.topic}</span>
              <Badge variant="muted" className="tabular-nums">
                {c.count.toLocaleString()}개 · {formatPercent(c.share)}
              </Badge>
            </div>
            <div className="flex gap-3 text-xs tabular-nums text-muted-foreground">
              <span>긍정 {formatPercent(c.positiveShare)}</span>
              <span>부정 {formatPercent(c.negativeShare)}</span>
              <span>좋아요 가중 {c.likeWeighted.toFixed(1)}</span>
            </div>
            {c.summary && (
              <p className="text-sm leading-relaxed text-muted-foreground">{c.summary}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
