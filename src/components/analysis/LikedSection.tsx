"use client";

// "댓글 분석" — 좋아요 순으로 줄을 세운 뒤, 그 상위 댓글들이 실제로 무엇에
// 대한 반응이었는지를 개수·좋아요 수·원문으로만 보여줍니다.
// 화면의 모든 문장은 라벨이거나 숫자 설명입니다. 해석을 지어내지 않습니다.

import { useEffect, useState } from "react";
import { Heart, Info, Loader2, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { CHART } from "@/lib/palette";
import { formatPercent } from "@/lib/utils";
import {
  REACTION_DESCRIPTIONS_KO,
  REACTION_LABELS_KO,
  TOPIC_LABELS_KO,
  type ReactionKind,
  type Topic,
} from "@/lib/types";
import type { LikedAnalysis, LikedComment, LikedGroup } from "@/lib/analysis/liked";

export function LikedSection({ analysisId }: { analysisId: string }) {
  const [scope, setScope] = useState(100);
  const [includeNoise, setIncludeNoise] = useState(false);
  const [data, setData] = useState<LikedAnalysis | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stopped = false;
    setLoading(true);
    void fetch(
      `/api/analyses/${analysisId}/liked?scope=${scope}&includeNoise=${includeNoise}`,
      { cache: "no-store" },
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((d: LikedAnalysis | null) => {
        if (!stopped && d) setData(d);
      })
      .finally(() => {
        if (!stopped) setLoading(false);
      });
    return () => {
      stopped = true;
    };
  }, [analysisId, scope, includeNoise]);

  if (loading && !data) {
    return (
      <p className="flex items-center gap-2 p-8 text-body text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden /> 좋아요 순으로 집계하는 중…
      </p>
    );
  }

  if (!data || data.ranking.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-body text-muted-foreground">
          집계할 댓글이 없습니다.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* 이 화면이 무엇을 하는지 — 해석이 아니라 방법 설명입니다. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/50 bg-card p-4">
        <p className="flex gap-2 text-caption text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            수집한 댓글을 좋아요 순으로 정렬해 상위 {data.scope.toLocaleString()}개를
            집계했습니다. 아래 숫자는 전부 그 댓글에서 직접 센 값이며, 요약 문장을
            따로 생성하지 않습니다.
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={String(scope)}
            onChange={(e) => setScope(Number(e.target.value))}
            aria-label="집계 범위"
            className="w-auto"
          >
            <option value="10">상위 10개</option>
            <option value="50">상위 50개</option>
            <option value="100">상위 100개</option>
            <option value="200">상위 200개</option>
            <option value="500">상위 500개</option>
          </Select>
          <div className="flex items-center gap-1.5">
            <Switch
              id="liked-noise"
              checked={includeNoise}
              onCheckedChange={setIncludeNoise}
            />
            <Label htmlFor="liked-noise" className="text-caption text-muted-foreground">
              중복·스팸 포함
            </Label>
          </div>
        </div>
      </div>

      <ScopeStats data={data} />

      <GroupBlock
        title="상위 댓글이 드러낸 반응"
        note="댓글 본문에 실제로 쓰인 표현으로 판정했습니다. 한 댓글이 여러 유형에 들어갈 수 있습니다."
        groups={data.reactionGroups}
        labelOf={(k) => REACTION_LABELS_KO[k as ReactionKind] ?? k}
        hintOf={(k) => REACTION_DESCRIPTIONS_KO[k as ReactionKind] ?? null}
        analysisId={analysisId}
        emptyText="상위 댓글에서 분류 가능한 반응 표현이 발견되지 않았습니다."
        footer={
          data.unmatchedReactionCount > 0
            ? `상위 ${data.scope.toLocaleString()}개 중 ${data.unmatchedReactionCount.toLocaleString()}개는 분류 표현이 없어 어느 유형에도 넣지 않았습니다.`
            : null
        }
      />

      <GroupBlock
        title="상위 댓글이 다룬 주제"
        note="댓글별 주제 분류를 그대로 집계했습니다. '기타'로만 분류된 댓글은 제외했습니다."
        groups={data.topicGroups}
        labelOf={(k) => TOPIC_LABELS_KO[k as Topic] ?? k}
        hintOf={() => null}
        analysisId={analysisId}
        emptyText="상위 댓글에 분류된 주제가 없습니다."
        footer={null}
      />

      <KeywordBlock data={data} analysisId={analysisId} />

      <CollapsibleSection
        id={`${analysisId}:liked-ranking`}
        title={`좋아요 순 상위 댓글 ${data.ranking.length.toLocaleString()}개`}
        teaser="원문 그대로, 좋아요가 많은 순서입니다"
        previewGlyph={
          <Heart className="size-5 text-primary" aria-hidden />
        }
      >
        <ol className="space-y-2">
          {data.ranking.map((c, i) => (
            <RankedComment key={c.id} comment={c} rank={i + 1} />
          ))}
        </ol>
      </CollapsibleSection>
    </div>
  );
}

function ScopeStats({ data }: { data: LikedAnalysis }) {
  return (
    <div className="grid gap-4 rounded-lg border border-border/50 bg-card p-5 sm:grid-cols-2 lg:grid-cols-4">
      <Stat
        label="수집 댓글"
        value={data.totalComments.toLocaleString()}
        hint="이 집계의 모집단"
      />
      <Stat
        label="좋아요 합계"
        value={data.totalLikes.toLocaleString()}
        hint="수집 댓글 전체 기준"
      />
      <Stat
        label={`상위 ${data.scope.toLocaleString()}개가 받은 좋아요`}
        value={formatPercent(data.scopeLikeShare)}
        hint="전체 좋아요 대비"
      />
      <div>
        <dt className="text-caption">좋아요 집중도</dt>
        <dd className="mt-1 space-y-1">
          {data.concentration.map((c) => (
            <div key={c.topN} className="flex items-center gap-2 text-caption">
              <span className="w-16 shrink-0 tabular-nums text-muted-foreground">
                상위 {c.topN}
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(2, c.likeShare * 100)}%`,
                    backgroundColor: CHART.teal,
                  }}
                />
              </div>
              <span className="w-12 shrink-0 text-right font-semibold tabular-nums text-foreground">
                {formatPercent(c.likeShare)}
              </span>
            </div>
          ))}
        </dd>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div>
      <dt className="text-caption">{label}</dt>
      <dd className="text-display mt-1 font-bold tabular-nums">{value}</dd>
      <p className="text-caption mt-1 text-muted-foreground/80">{hint}</p>
    </div>
  );
}

function GroupBlock({
  title,
  note,
  groups,
  labelOf,
  hintOf,
  analysisId,
  emptyText,
  footer,
}: {
  title: string;
  note: string;
  groups: LikedGroup[];
  labelOf: (key: string) => string;
  hintOf: (key: string) => string | null;
  analysisId: string;
  emptyText: string;
  footer: string | null;
}) {
  const [open, setOpen] = useState<string | null>(groups[0]?.key ?? null);
  const current = groups.find((g) => g.key === open) ?? null;
  const maxLikes = Math.max(...groups.map((g) => g.likeTotal), 1);

  if (groups.length === 0) {
    return (
      <section>
        <h2 className="mb-1 text-heading font-semibold">{title}</h2>
        <p className="rounded-md border border-dashed p-6 text-center text-body text-muted-foreground">
          {emptyText}
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-heading font-semibold">{title}</h2>
      <p className="text-caption mt-1 text-muted-foreground">{note}</p>

      <ul className="mt-4 space-y-1.5">
        {groups.map((g) => (
          <li key={g.key}>
            <button
              type="button"
              onClick={() => setOpen(open === g.key ? null : g.key)}
              aria-expanded={open === g.key}
              className={`w-full rounded-lg border p-3 text-left transition-colors ${
                open === g.key
                  ? "border-primary/50 bg-primary/5"
                  : "border-border/40 hover:border-border hover:bg-accent/40"
              }`}
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-body font-medium">{labelOf(g.key)}</span>
                <span className="text-caption tabular-nums text-muted-foreground">
                  댓글 {g.count.toLocaleString()}개 · 좋아요{" "}
                  <strong className="text-foreground">{g.likeTotal.toLocaleString()}</strong>
                </span>
                <span className="ml-auto text-body font-semibold tabular-nums">
                  {formatPercent(g.likeShare)}
                </span>
              </div>
              {/* 막대는 그룹 간 좋아요 합 비교용입니다. */}
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(2, (g.likeTotal / maxLikes) * 100)}%`,
                    backgroundColor: open === g.key ? CHART.crimson : CHART.tealSoft,
                  }}
                />
              </div>
            </button>
          </li>
        ))}
      </ul>

      {current && (
        <div className="mt-4 rounded-lg border border-border/50 bg-card p-4">
          <div className="mb-3 flex flex-wrap items-baseline gap-2">
            <h3 className="text-body-lg font-semibold">
              {labelOf(current.key)} · 좋아요 상위 댓글
            </h3>
            {hintOf(current.key) && (
              <span className="text-caption text-muted-foreground">
                {hintOf(current.key)}
              </span>
            )}
          </div>
          <ol className="space-y-2">
            {current.comments.map((c, i) => (
              <RankedComment key={c.id} comment={c} rank={i + 1} />
            ))}
          </ol>
          {current.count > current.comments.length && (
            <p className="text-caption mt-3 text-muted-foreground">
              이 유형의 상위 {current.comments.length}개만 표시 — 전체{" "}
              {current.count.toLocaleString()}개.{" "}
              <a
                href={`/analysis/${analysisId}/comments`}
                className="underline underline-offset-2 hover:text-foreground"
              >
                댓글 탐색기에서 보기
              </a>
            </p>
          )}
        </div>
      )}

      {footer && <p className="text-caption mt-3 text-muted-foreground">{footer}</p>}
    </section>
  );
}

function KeywordBlock({ data, analysisId }: { data: LikedAnalysis; analysisId: string }) {
  if (data.keywords.length === 0) return null;
  const max = Math.max(...data.keywords.map((k) => k.commentCount), 1);

  return (
    <CollapsibleSection
      id={`${analysisId}:liked-keywords`}
      title={`상위 댓글에서 반복된 표현 ${data.keywords.length}개`}
      teaser="두 개 이상의 댓글에 실제로 등장한 단어만 셌습니다"
      previewGlyph={
        <span className="text-heading font-bold tabular-nums text-foreground">
          {data.keywords.length}
        </span>
      }
    >
      <p className="text-caption mb-4 text-muted-foreground">
        조사·관사 같은 기능어는 제외했고, 한 댓글 안에서 같은 단어를 여러 번 써도
        1회로 셉니다. 숫자는 등장한 댓글 수이며 의미 해석은 붙이지 않았습니다.
      </p>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {data.keywords.map((k) => (
          <li key={k.term} className="flex items-center gap-2 text-caption">
            <span className="w-28 shrink-0 truncate font-medium text-foreground" title={k.term}>
              {k.term}
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(3, (k.commentCount / max) * 100)}%`,
                  backgroundColor: CHART.teal,
                }}
              />
            </div>
            <span className="w-24 shrink-0 text-right tabular-nums text-muted-foreground">
              {k.commentCount}개 · 👍{k.likeTotal.toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </CollapsibleSection>
  );
}

function RankedComment({ comment: c, rank }: { comment: LikedComment; rank: number }) {
  return (
    <li className="rounded-lg border border-border/40 bg-background/40 p-3">
      <div className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold tabular-nums">
          {rank}
        </span>
        <span className="font-medium text-foreground">{c.author}</span>
        <span className="tabular-nums">👍 {c.likeCount.toLocaleString()}</span>
        <span className="tabular-nums">
          전체 좋아요의 {formatPercent(c.likeShare)}
        </span>
        <span>{new Date(c.publishedAt).toLocaleDateString("ko-KR")}</span>
        {c.isReply && (
          <Badge variant="outline" className="text-[10px]">
            답글
          </Badge>
        )}
      </div>
      <p className="mt-2 whitespace-pre-wrap break-words text-body leading-relaxed">
        {c.text}
      </p>
      {(c.reactions.length > 0 || c.topics.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {c.reactions.map((r) => (
            <Badge key={r} variant="secondary" className="text-[10px]">
              {REACTION_LABELS_KO[r] ?? r}
            </Badge>
          ))}
          {c.topics
            .filter((t) => t !== "other")
            .map((t) => (
              <Badge key={t} variant="outline" className="text-[10px] text-muted-foreground">
                {TOPIC_LABELS_KO[t] ?? t}
              </Badge>
            ))}
        </div>
      )}
    </li>
  );
}

/** 탭 라벨 옆 아이콘 재사용을 위해 노출합니다. */
export const LikedSectionIcon = MessageSquare;
