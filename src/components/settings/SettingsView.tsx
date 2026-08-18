"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SettingsStatus } from "@/lib/client-types";

function StatusRow({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <li className="flex items-center gap-3 py-2">
      {ok ? (
        <CheckCircle2 className="size-4 shrink-0 text-emerald-500" aria-hidden />
      ) : (
        <XCircle className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      )}
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      </div>
      <Badge variant={ok ? "secondary" : "muted"} className="ml-auto">
        {ok ? "구성됨" : "미구성"}
      </Badge>
    </li>
  );
}

export function SettingsView() {
  const [status, setStatus] = useState<SettingsStatus | null>(null);
  const [purging, setPurging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/settings/status")
      .then((r) => r.json())
      .then((d: SettingsStatus) => setStatus(d))
      .catch(() => {});
  }, []);

  async function purge() {
    if (
      !window.confirm(
        "수집된 모든 영상·댓글·분석 데이터를 삭제합니다. 되돌릴 수 없습니다. 계속할까요?",
      )
    ) {
      return;
    }
    setPurging(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/purge", { method: "POST" });
      if (res.ok) {
        setMessage("모든 데이터가 삭제되었습니다.");
        const s = await fetch("/api/settings/status").then((r) => r.json());
        setStatus(s as SettingsStatus);
      } else {
        setMessage("삭제에 실패했습니다.");
      }
    } finally {
      setPurging(false);
    }
  }

  if (!status) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden /> 상태 불러오는 중…
      </p>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>API 연동 상태</CardTitle>
          <CardDescription>
            키 값은 서버에만 존재하며 이 화면에는 구성 여부만 표시됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border/60">
            <StatusRow
              ok={status.youtubeApiConfigured}
              label="YouTube Data API v3"
              detail={status.mockMode ? "미구성 시 Mock 모드로 동작합니다" : undefined}
            />
            <StatusRow
              ok={status.anthropicConfigured}
              label="Anthropic Claude API"
              detail={
                status.mockClaude
                  ? "미구성 시 결정론적 mock 분석기가 사용됩니다"
                  : `모델: ${status.anthropicModel}`
              }
            />
            <StatusRow
              ok={status.googleOAuthConfigured}
              label="Google OAuth (채널 소유자 모드)"
            />
            <StatusRow ok={status.nextAuthSecretConfigured} label="NEXTAUTH_SECRET" />
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>데이터 소스</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span>동작 모드</span>
            <Badge variant={status.mockMode ? "secondary" : "muted"}>
              {status.mockMode ? "Mock (합성 데이터)" : "실제 YouTube 데이터"}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span>데이터베이스</span>
            <Badge variant="muted">{status.databaseProvider}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span>실험적 yt-dlp 히트맵</span>
            <Badge variant={status.ytdlpEnabled ? "secondary" : "muted"}>
              {status.ytdlpEnabled ? "활성 (로컬 전용)" : "비활성 (기본값)"}
            </Badge>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            yt-dlp 어댑터는 비공식 공개 히트맵 데이터를 읽는 실험 기능입니다.
            서버리스 환경에서는 자동으로 비활성화되며, 이용약관과 배포 환경 검토가
            필요합니다 (README 참고).
          </p>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>저장된 데이터</CardTitle>
          <CardDescription>
            영상 {status.counts.videos.toLocaleString()}개 · 댓글{" "}
            {status.counts.comments.toLocaleString()}개 · 분석{" "}
            {status.counts.analyses.toLocaleString()}건
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Button variant="destructive" onClick={purge} disabled={purging}>
            {purging ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Trash2 aria-hidden />
            )}
            모든 분석 데이터 삭제
          </Button>
          {message && <p className="text-sm text-muted-foreground">{message}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
