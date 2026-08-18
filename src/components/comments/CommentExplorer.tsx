"use client";

// Filterable, server-paginated comment explorer. Handles thousands of
// comments via server-side filtering + pagination (50/page).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, CornerDownRight, Loader2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { formatSeconds } from "@/lib/utils";
import { SENTIMENT_LABELS_KO } from "@/lib/palette";
import { TOPICS, TOPIC_LABELS_KO, type Topic } from "@/lib/types";
import type { ExplorerComment, ExplorerResponse } from "@/lib/client-types";

interface Filters {
  q: string;
  language: string;
  topic: string;
  sentiment: string;
  type: string;
  minLikes: string;
  hasTimestamp: boolean;
  includeNoise: boolean;
  sort: string;
}

const INITIAL: Filters = {
  q: "",
  language: "",
  topic: "",
  sentiment: "",
  type: "all",
  minLikes: "",
  hasTimestamp: false,
  includeNoise: false,
  sort: "likes",
};

export function CommentExplorer({
  analysisId,
  initialTopic,
}: {
  analysisId: string;
  initialTopic?: string;
}) {
  const [filters, setFilters] = useState<Filters>(() => ({
    ...INITIAL,
    topic: initialTopic ?? "",
  }));
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ExplorerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.q) p.set("q", filters.q);
    if (filters.language) p.set("language", filters.language);
    if (filters.topic) p.set("topic", filters.topic);
    if (filters.sentiment) p.set("sentiment", filters.sentiment);
    if (filters.type !== "all") p.set("type", filters.type);
    if (filters.minLikes) p.set("minLikes", filters.minLikes);
    if (filters.hasTimestamp) p.set("hasTimestamp", "true");
    if (filters.includeNoise) p.set("includeNoise", "true");
    p.set("sort", filters.sort);
    p.set("page", String(page));
    p.set("pageSize", "50");
    return p.toString();
  }, [filters, page]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/analyses/${analysisId}/comments?${queryString}`, {
        cache: "no-store",
      });
      if (res.ok) setData((await res.json()) as ExplorerResponse);
    } finally {
      setLoading(false);
    }
  }, [analysisId, queryString]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void load(), 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [load]);

  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <div className="grid gap-2 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2">
          <Search
            className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={filters.q}
            onChange={(e) => update("q", e.target.value)}
            placeholder="댓글 내용 검색…"
            className="pl-8"
            aria-label="댓글 검색"
          />
        </div>
        <Select
          value={filters.language}
          onChange={(e) => update("language", e.target.value)}
          aria-label="언어 필터"
        >
          <option value="">모든 언어</option>
          <option value="ko">한국어</option>
          <option value="en">영어</option>
          <option value="ja">일본어</option>
          <option value="zh">중국어</option>
          <option value="ru">러시아어</option>
          <option value="other">기타</option>
        </Select>
        <Select
          value={filters.topic}
          onChange={(e) => update("topic", e.target.value)}
          aria-label="주제 필터"
        >
          <option value="">모든 주제</option>
          {TOPICS.map((t) => (
            <option key={t} value={t}>
              {TOPIC_LABELS_KO[t]}
            </option>
          ))}
        </Select>
        <Select
          value={filters.sentiment}
          onChange={(e) => update("sentiment", e.target.value)}
          aria-label="감정 필터"
        >
          <option value="">모든 감정</option>
          <option value="positive">긍정</option>
          <option value="neutral">중립</option>
          <option value="negative">부정</option>
          <option value="mixed">혼합</option>
        </Select>
        <Select
          value={filters.type}
          onChange={(e) => update("type", e.target.value)}
          aria-label="댓글 유형 필터"
        >
          <option value="all">최상위 + 답글</option>
          <option value="top">최상위 댓글만</option>
          <option value="reply">답글만</option>
        </Select>
        <Input
          type="number"
          min={0}
          value={filters.minLikes}
          onChange={(e) => update("minLikes", e.target.value)}
          placeholder="최소 좋아요 수"
          aria-label="최소 좋아요 수"
        />
        <Select
          value={filters.sort}
          onChange={(e) => update("sort", e.target.value)}
          aria-label="정렬"
        >
          <option value="likes">좋아요순</option>
          <option value="recent">최신순</option>
        </Select>
        <div className="flex items-center gap-4 px-1">
          <div className="flex items-center gap-1.5">
            <Switch
              id="f-ts"
              checked={filters.hasTimestamp}
              onCheckedChange={(v) => update("hasTimestamp", v)}
            />
            <Label htmlFor="f-ts" className="text-xs text-muted-foreground">
              타임스탬프 포함
            </Label>
          </div>
          <div className="flex items-center gap-1.5">
            <Switch
              id="f-noise"
              checked={filters.includeNoise}
              onCheckedChange={(v) => update("includeNoise", v)}
            />
            <Label htmlFor="f-noise" className="text-xs text-muted-foreground">
              중복·스팸 포함
            </Label>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span aria-live="polite">
          {loading ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> 불러오는 중…
            </span>
          ) : (
            `${(data?.total ?? 0).toLocaleString()}개 댓글`
          )}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            aria-label="이전 페이지"
          >
            <ChevronLeft aria-hidden />
          </Button>
          <span className="tabular-nums">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            aria-label="다음 페이지"
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </div>

      <ul className="space-y-2">
        {(data?.comments ?? []).map((c) => (
          <CommentRow key={c.id} comment={c} />
        ))}
      </ul>

      {data && data.comments.length === 0 && !loading && (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          조건에 맞는 댓글이 없습니다.
        </p>
      )}
    </div>
  );
}

export function CommentRow({ comment: c }: { comment: ExplorerComment }) {
  return (
    <li className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {c.isReply && <CornerDownRight className="size-3.5" aria-label="답글" />}
        <span className="font-medium text-foreground">{c.author}</span>
        <span>{new Date(c.publishedAt).toLocaleDateString("ko-KR")}</span>
        <span className="tabular-nums">👍 {c.likeCount.toLocaleString()}</span>
        {c.sentiment && (
          <Badge variant="muted" className="text-[10px]">
            {SENTIMENT_LABELS_KO[c.sentiment] ?? c.sentiment}
          </Badge>
        )}
        {c.isDuplicate && (
          <Badge variant="muted" className="text-[10px]">
            중복
          </Badge>
        )}
        {c.isSpam && (
          <Badge variant="muted" className="text-[10px] text-amber-400">
            스팸 의심
          </Badge>
        )}
      </div>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">
        {c.text}
      </p>
      {(c.topics.length > 0 || c.timestamps.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {c.topics.map((t) => (
            <Badge key={t} variant="secondary" className="text-[10px]">
              {TOPIC_LABELS_KO[t as Topic] ?? t}
            </Badge>
          ))}
          {c.timestamps.map((ts) => (
            <span
              key={ts}
              className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground"
            >
              {formatSeconds(ts)}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}
