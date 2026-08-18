"use client";

// 실제 수집된 댓글을 원문 그대로 보여줍니다. 요약이나 의역을 하지 않습니다.

import { useState } from "react";
import { ChevronDown, ChevronUp, Heart, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { seekPlayer } from "@/components/analysis/PlayerPanel";
import { REACTION_LABELS_KO, type HypeComment } from "@/lib/types";
import { formatSeconds } from "@/lib/utils";

export function CommentQuote({ comment }: { comment: HypeComment }) {
  return (
    <li className="rounded-lg border border-border/70 bg-card/60 p-4">
      <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-foreground/95">
        {comment.text}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
        <span className="truncate font-medium text-foreground/70">{comment.author}</span>
        <span className="flex items-center gap-1 tabular-nums">
          <Heart className="size-3.5" aria-hidden />
          {comment.likeCount.toLocaleString()}
        </span>
        {comment.timestampSec != null && (
          <button
            type="button"
            onClick={() => seekPlayer(comment.timestampSec!)}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-primary hover:bg-primary/10"
          >
            <Play className="size-3" aria-hidden />
            {formatSeconds(comment.timestampSec)}부터 보기
          </button>
        )}
        {comment.reactions.length > 0 && (
          <span className="ml-auto flex flex-wrap gap-1">
            {comment.reactions.map((r) => (
              <Badge key={r} variant="secondary" className="font-normal">
                {REACTION_LABELS_KO[r]}
              </Badge>
            ))}
          </span>
        )}
      </div>
    </li>
  );
}

export function CommentQuoteList({
  comments,
  emptyText,
  initialVisible,
}: {
  comments: HypeComment[];
  emptyText: string;
  /** 이 개수를 넘으면 접어두고 '더 보기'를 답니다. 없으면 전부 펼칩니다. */
  initialVisible?: number;
}) {
  const initial = initialVisible ?? comments.length;
  const [visibleCount, setVisibleCount] = useState(initial);

  if (comments.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border/70 p-5 text-sm text-muted-foreground">
        {emptyText}
      </p>
    );
  }

  // 댓글이 수백 개일 수 있어 한 번에 다 그리지 않고 단계적으로 늘립니다.
  const STEP = 20;
  const visible = comments.slice(0, visibleCount);
  const hidden = comments.length - visible.length;

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {visible.map((c) => (
          <CommentQuote key={c.id} comment={c} />
        ))}
      </ul>

      {(hidden > 0 || visibleCount > initial) && (
        <div className="flex flex-wrap gap-2">
          {hidden > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setVisibleCount((n) => n + STEP)}
            >
              <ChevronDown aria-hidden />
              {Math.min(STEP, hidden)}개 더 보기
              <span className="text-muted-foreground">(남은 {hidden.toLocaleString()}개)</span>
            </Button>
          )}
          {hidden > STEP && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setVisibleCount(comments.length)}
            >
              전부 펼치기
            </Button>
          )}
          {visibleCount > initial && (
            <Button variant="ghost" size="sm" onClick={() => setVisibleCount(initial)}>
              <ChevronUp aria-hidden />
              접기
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
