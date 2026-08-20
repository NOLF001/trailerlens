"use client";

import { useState } from "react";
import { Check, Loader2, Pencil, Play, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Reveal } from "@/components/ui/collapsible-section";
import { formatSeconds } from "@/lib/utils";
import { TOPIC_LABELS_KO, type SceneInfo, type Topic } from "@/lib/types";
import { seekPlayer } from "@/components/analysis/PlayerPanel";

export function SceneList({
  analysisId,
  scenes,
}: {
  analysisId: string;
  scenes: SceneInfo[];
}) {
  if (scenes.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-6 text-center text-body text-muted-foreground">
        타임스탬프 언급이나 히트맵 데이터가 부족해 장면을 구성하지 못했습니다.
      </p>
    );
  }
  return (
    <ol className="space-y-3">
      {scenes.map((scene) => (
        <Reveal key={scene.id} as="li">
          <SceneCard analysisId={analysisId} scene={scene} />
        </Reveal>
      ))}
    </ol>
  );
}

function SceneCard({ analysisId, scene }: { analysisId: string; scene: SceneInfo }) {
  const [description, setDescription] = useState(scene.description ?? "");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(description);
  const [busy, setBusy] = useState<"save" | "frames" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setBusy("save");
    setMessage(null);
    try {
      const res = await fetch(`/api/analyses/${analysisId}/scenes/${scene.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: draft }),
      });
      if (!res.ok) throw new Error();
      setDescription(draft);
      setEditing(false);
    } catch {
      setMessage("저장에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function uploadFrames(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy("frames");
    setMessage(null);
    try {
      const form = new FormData();
      form.set("confirmOwnership", "true");
      for (const f of Array.from(files).slice(0, 6)) form.append("frames", f);
      const res = await fetch(
        `/api/analyses/${analysisId}/scenes/${scene.id}/frames`,
        { method: "POST", body: form },
      );
      const data = (await res.json()) as { description?: string; error?: string };
      if (!res.ok || !data.description) {
        setMessage(data.error ?? "프레임 분석에 실패했습니다.");
        return;
      }
      setDescription(data.description);
      setDraft(data.description);
      setMessage("Claude Vision 분석으로 장면 설명이 갱신되었습니다.");
    } catch {
      setMessage("프레임 업로드에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="tabular-nums">#{scene.rank}</Badge>
          <span className="font-mono text-body font-semibold text-foreground">
            {formatSeconds(scene.startSec)} – {formatSeconds(scene.endSec)}
          </span>
          {scene.heatIntensity != null && (
            <Badge variant="muted">반복 강도 {scene.heatIntensity.toFixed(2)}</Badge>
          )}
          <Badge variant="muted">댓글 언급 {scene.mentionCount.toLocaleString()}개</Badge>
          <Badge variant="muted">
            좋아요 가중 {scene.likeWeighted.toFixed(1)}
          </Badge>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={() => seekPlayer(scene.startSec)}
          >
            <Play aria-hidden /> 영상에서 보기
          </Button>
        </div>

        {scene.topics.length > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label="대표 반응 주제">
            {scene.topics.map((t) => (
              <Badge key={t} variant="secondary" className="text-caption">
                {TOPIC_LABELS_KO[t as Topic] ?? t}
              </Badge>
            ))}
          </div>
        )}

        <div className="space-y-2 text-body">
          {editing ? (
            <div className="space-y-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                aria-label="장면 설명 편집"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={save} disabled={busy !== null}>
                  {busy === "save" ? (
                    <Loader2 className="animate-spin" aria-hidden />
                  ) : (
                    <Check aria-hidden />
                  )}
                  저장
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(false);
                    setDraft(description);
                  }}
                >
                  <X aria-hidden /> 취소
                </Button>
              </div>
            </div>
          ) : (
            <p>
              <span className="font-medium text-muted-foreground">장면 설명: </span>
              {description || "설명 초안이 아직 없습니다."}
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="ml-2 inline-flex items-center gap-1 text-caption text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                <Pencil className="size-3" aria-hidden /> 편집
              </button>
            </p>
          )}
          {scene.reason && (
            <p className="text-muted-foreground">
              <span className="font-medium">반복 시청 이유(추정): </span>
              {scene.reason}
            </p>
          )}
          {scene.summary && (
            <p className="text-muted-foreground">
              <span className="font-medium">대표 반응: </span>
              {scene.summary}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3 text-caption text-muted-foreground">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 hover:bg-accent">
            {busy === "frames" ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Upload className="size-3.5" aria-hidden />
            )}
            내가 소유한 원본 프레임 업로드 → Claude Vision 분석
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              className="sr-only"
              onChange={(e) => uploadFrames(e.target.files)}
              disabled={busy !== null}
            />
          </label>
          <span>
            (영상 소유자의 원본 파일만 지원 — YouTube 영상 다운로드 기능은 제공하지
            않습니다)
          </span>
        </div>
        {message && <p className="text-caption text-muted-foreground">{message}</p>}
      </CardContent>
    </Card>
  );
}
