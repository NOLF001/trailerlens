"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Loader2,
  Play,
  Search,
  ShieldCheck,
  Sigma,
  Zap,
  MessagesSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, formatCount, formatSeconds } from "@/lib/utils";
import type { AnalysisMode, VideoMeta } from "@/lib/types";

const MODES: {
  id: AnalysisMode;
  title: string;
  desc: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "quick",
    title: "빠른 분석",
    desc: "좋아요 상위 댓글 위주로 몇 분 안에 훑어봅니다.",
    icon: <Zap className="size-4" aria-hidden />,
  },
  {
    id: "sample",
    title: "통계 표본 분석",
    desc: "95% 신뢰수준 ±3%p 오차범위에 필요한 만큼 인기+최신 댓글을 표본 수집합니다. 댓글이 많은 영상에 적합.",
    icon: <Sigma className="size-4" aria-hidden />,
  },
  {
    id: "full",
    title: "전체 댓글 심층 분석",
    desc: "모든 공개 댓글과 답글을 수집해 전수 분석합니다. 댓글 수십만 개 이상이면 쿼터·시간이 오래 걸립니다.",
    icon: <MessagesSquare className="size-4" aria-hidden />,
  },
  {
    id: "owner",
    title: "채널 소유자 Analytics 분석",
    desc: "Google 로그인 후 실제 시청 유지율 데이터를 결합합니다.",
    icon: <ShieldCheck className="size-4" aria-hidden />,
  },
];

export function UrlForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [video, setVideo] = useState<VideoMeta | null>(null);
  const [isMock, setIsMock] = useState(false);
  const [mode, setMode] = useState<AnalysisMode>("full");
  const [busy, setBusy] = useState<"resolve" | "start" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resolve(e: React.FormEvent) {
    e.preventDefault();
    setBusy("resolve");
    setError(null);
    setVideo(null);
    try {
      const res = await fetch("/api/videos/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json()) as {
        video?: VideoMeta;
        mock?: boolean;
        error?: string;
      };
      if (!res.ok || !data.video) {
        setError(data.error ?? "영상을 불러오지 못했습니다.");
        return;
      }
      setVideo(data.video);
      setIsMock(Boolean(data.mock));
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function start() {
    if (!video) return;
    setBusy("start");
    setError(null);
    try {
      const res = await fetch("/api/analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: video.id, mode }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        setError(data.error ?? "분석을 시작하지 못했습니다.");
        return;
      }
      router.push(`/analysis/${data.id}`);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={resolve} className="flex gap-2">
        <label htmlFor="yt-url" className="sr-only">
          YouTube 트레일러 URL
        </label>
        <Input
          id="yt-url"
          placeholder="https://www.youtube.com/watch?v=... 또는 영상 ID"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          autoComplete="off"
          className="h-11 bg-card text-base"
        />
        <Button type="submit" size="lg" className="h-11" disabled={busy !== null || !url.trim()}>
          {busy === "resolve" ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <Search aria-hidden />
          )}
          영상 확인
        </Button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      {video && (
        <Card className="overflow-hidden">
          <CardContent className="p-5">
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-md bg-muted sm:w-56">
                {video.thumbnailUrl ? (
                  <Image
                    src={video.thumbnailUrl}
                    alt=""
                    fill
                    sizes="224px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <Play aria-hidden />
                  </div>
                )}
                <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1.5 py-0.5 text-xs">
                  {formatSeconds(video.durationSeconds)}
                </span>
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  {isMock && <Badge variant="secondary">Mock 데이터</Badge>}
                  <h3 className="font-semibold leading-snug">{video.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground">{video.channelTitle}</p>
                <p className="text-sm text-muted-foreground">
                  조회수 {formatCount(video.viewCount)} · 좋아요{" "}
                  {formatCount(video.likeCount)} · 댓글 {formatCount(video.commentCount)}
                </p>
              </div>
            </div>

            <fieldset className="mt-5">
              <legend className="mb-2 text-sm font-medium">분석 옵션</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMode(m.id)}
                    aria-pressed={mode === m.id}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      mode === m.id
                        ? "border-primary/70 bg-primary/10"
                        : "border-border hover:bg-accent",
                    )}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      {m.icon}
                      {m.title}
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                      {m.desc}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="mt-4 flex justify-end">
              <Button onClick={start} disabled={busy !== null} size="lg">
                {busy === "start" && <Loader2 className="animate-spin" aria-hidden />}
                분석 시작
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
