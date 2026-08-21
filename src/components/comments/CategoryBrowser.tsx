"use client";

// 카테고리(주제)별로 실제 수집 댓글을 훑어보는 뷰.
// 각 카테고리는 좋아요 상위 대표 댓글을 보여주고, 전체 목록으로 이동할 수 있다.

import { useEffect, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { CommentRow } from "@/components/comments/CommentExplorer";
import { formatPercent } from "@/lib/utils";
import { CHART } from "@/lib/palette";
import { TOPIC_LABELS_KO, type Topic } from "@/lib/types";
import type { CategoryResponse } from "@/lib/client-types";

export function CategoryBrowser({
  analysisId,
  onOpenTopic,
}: {
  analysisId: string;
  onOpenTopic: (topic: string) => void;
}) {
  const [data, setData] = useState<CategoryResponse | null>(null);
  const [includeNoise, setIncludeNoise] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stopped = false;
    setLoading(true);
    void fetch(
      `/api/analyses/${analysisId}/comments/by-category?per=6&includeNoise=${includeNoise}`,
      { cache: "no-store" },
    )
      .then((r) => r.json())
      .then((d: CategoryResponse) => {
        if (!stopped) setData(d);
      })
      .finally(() => {
        if (!stopped) setLoading(false);
      });
    return () => {
      stopped = true;
    };
  }, [analysisId, includeNoise]);

  if (loading && !data) {
    return (
      <p className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden /> 카테고리별 댓글을
        불러오는 중…
      </p>
    );
  }

  if (!data || data.groups.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        분석된 댓글이 없습니다.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          분석 댓글 {data.totalAnalyzed.toLocaleString()}개 · 카테고리{" "}
          {data.groups.length}개 (한 댓글이 여러 카테고리에 속할 수 있습니다)
        </span>
        <div className="flex items-center gap-1.5">
          <Switch id="cat-noise" checked={includeNoise} onCheckedChange={setIncludeNoise} />
          <Label htmlFor="cat-noise" className="text-xs text-muted-foreground">
            중복·스팸 포함
          </Label>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 rounded-lg border bg-card p-3">
        {data.groups.map((g) => (
          <button
            key={g.topic}
            type="button"
            onClick={() =>
              document
                .getElementById(`cat-${g.topic}`)
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent hover:text-foreground"
          >
            {TOPIC_LABELS_KO[g.topic as Topic] ?? g.topic}
            <Badge variant="muted" className="tabular-nums text-[10px]">
              {g.count.toLocaleString()}
            </Badge>
          </button>
        ))}
      </div>

      {data.groups.map((g) => (
        <Card key={g.topic} id={`cat-${g.topic}`}>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>{TOPIC_LABELS_KO[g.topic as Topic] ?? g.topic}</CardTitle>
              <Badge variant="muted" className="tabular-nums">
                {g.count.toLocaleString()}개 · {formatPercent(g.share)}
              </Badge>
            </div>
            <Button variant="outline" size="sm" onClick={() => onOpenTopic(g.topic)}>
              전체 보기 <ArrowRight aria-hidden />
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            <div
              className="h-1 w-full overflow-hidden rounded-full bg-muted"
              aria-hidden
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(2, g.share * 100)}%`,
                  backgroundColor: CHART.teal,
                }}
              />
            </div>
            <ul className="space-y-2">
              {g.comments.map((c) => (
                <CommentRow key={`${g.topic}-${c.id}`} comment={c} />
              ))}
            </ul>
            {g.count > g.comments.length && (
              <p className="text-xs text-muted-foreground">
                좋아요 상위 {g.comments.length}개만 표시 —{" "}
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={() => onOpenTopic(g.topic)}
                >
                  나머지 {(g.count - g.comments.length).toLocaleString()}개 보기
                </button>
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
