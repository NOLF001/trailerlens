"use client";

// 시점을 적지 않은 댓글이 대부분입니다. 그 댓글들은 "언제"가 아니라
// "무엇에 어떻게" 반응했는지로 묶어서 보여줍니다.

import { useState } from "react";
import { Quote } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { CommentQuoteList } from "@/components/analysis/CommentQuote";
import { CHART } from "@/lib/palette";
import { formatPercent } from "@/lib/utils";
import {
  REACTION_DESCRIPTIONS_KO,
  REACTION_LABELS_KO,
  type HypeReport,
  type ReactionKind,
} from "@/lib/types";

const REACTION_COLORS: Record<ReactionKind, string> = {
  awe: CHART.crimson,
  replay: CHART.tealSoft,
  anticipation: CHART.violet,
  purchase: CHART.magenta,
  nostalgia: CHART.amber,
  humor: CHART.blue,
  critique: CHART.slate,
};

export function ReactionsSection({
  hype,
  analyzedCount,
}: {
  hype: HypeReport;
  analyzedCount: number;
}) {
  const [active, setActive] = useState<ReactionKind | null>(hype.groups[0]?.kind ?? null);
  const group = hype.groups.find((g) => g.kind === active) ?? hype.groups[0] ?? null;
  const maxCount = Math.max(...hype.groups.map((g) => g.count), 1);

  return (
    <div className="space-y-6">
      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* 반응 유형 목록 */}
        <Card>
          <CardContent className="p-5">
            <h2 className="text-section-title">어떤 반응이었나</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              댓글 본문의 표현으로 분류했습니다. 한 댓글이 여러 유형에 들어갈 수
              있어 합이 100%를 넘습니다.
            </p>

            <ul className="mt-4 space-y-1.5">
              {hype.groups.map((g) => {
                const isActive = g.kind === active;
                return (
                  <li key={g.kind}>
                    <button
                      type="button"
                      onClick={() => setActive(g.kind)}
                      aria-pressed={isActive}
                      className={`w-full rounded-lg px-3 py-2.5 text-left transition ${
                        isActive ? "bg-accent" : "hover:bg-accent/50"
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium">
                          {REACTION_LABELS_KO[g.kind]}
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {g.count.toLocaleString()}개 · {formatPercent(g.share)}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(g.count / maxCount) * 100}%`,
                            background: REACTION_COLORS[g.kind],
                          }}
                        />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>

            <p className="mt-4 border-t border-border/70 pt-3 text-xs leading-relaxed text-muted-foreground">
              분류 표현이 없는 댓글{" "}
              <strong className="text-foreground/80">
                {hype.unclassifiedCount.toLocaleString()}개
              </strong>
              는 어느 유형에도 넣지 않았습니다. 전체 {analyzedCount.toLocaleString()}개
              기준.
            </p>
          </CardContent>
        </Card>

        {/* 선택된 유형의 실제 댓글 */}
        <Card>
          <CardContent className="p-5">
            {group ? (
              <>
                <h3 className="text-section-title">
                  {REACTION_LABELS_KO[group.kind]} · {group.count.toLocaleString()}개
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {REACTION_DESCRIPTIONS_KO[group.kind]}
                </p>
                <div className="mt-4">
                  <CommentQuoteList
                    comments={group.examples}
                    emptyText="예시 댓글이 없습니다."
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">분류된 반응이 없습니다.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 가장 강한 반응 */}
      <Card>
        <CardContent className="p-5">
          <h2 className="flex items-center gap-2 text-section-title">
            <Quote className="size-4 text-primary" aria-hidden />
            가장 강하게 반응한 댓글
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            표현 강도와 좋아요 수를 함께 반영해 정렬했습니다. 원문 그대로입니다.
          </p>
          <div className="mt-4">
            <CommentQuoteList
              comments={hype.topReactions}
              emptyText="표시할 댓글이 없습니다."
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
