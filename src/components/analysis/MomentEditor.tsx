"use client";

// 열광 지점을 직접 손대는 UI — 구간 추가, 영상 내용 설명, 숨기기.
// 설명은 사용자가 직접 적습니다. 자동으로 채우거나 추정하지 않습니다.

import { useState } from "react";
import { Check, Eye, Loader2, Pencil, Plus, Trash2, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatSeconds } from "@/lib/utils";
import type { HypeMoment } from "@/lib/types";

/** "83" / "1:23" / "1:02:03" 모두 초로 바꿉니다. 형식이 아니면 null. */
export function parseTimeInput(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const parts = s.split(":");
  if (parts.length > 3) return null;
  let total = 0;
  for (const p of parts) {
    if (!/^\d+$/.test(p.trim())) return null;
    total = total * 60 + Number(p.trim());
  }
  return Number.isFinite(total) ? total : null;
}

async function post(analysisId: string, body: unknown): Promise<string | null> {
  const res = await fetch(`/api/analyses/${analysisId}/moments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error ?? "저장하지 못했습니다.";
}

// ── 지점 직접 추가 ───────────────────────────────────────────────────────────

export function AddMomentForm({
  analysisId,
  durationSeconds,
  onDone,
}: {
  analysisId: string;
  durationSeconds: number;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const startSec = parseTimeInput(start);
    const endSec = parseTimeInput(end);
    if (startSec == null || endSec == null) {
      setError("시각은 1:23 또는 초 단위 숫자로 적어주세요.");
      return;
    }
    if (endSec <= startSec) {
      setError("종료 시각이 시작 시각보다 뒤여야 합니다.");
      return;
    }
    if (startSec > durationSeconds) {
      setError(`영상 길이(${formatSeconds(durationSeconds)})를 넘었습니다.`);
      return;
    }
    setBusy(true);
    setError(null);
    const err = await post(analysisId, {
      action: "add",
      startSec,
      endSec,
      description: description.trim() || undefined,
    });
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setStart("");
    setEnd("");
    setDescription("");
    setOpen(false);
    onDone();
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus aria-hidden />
        지점 직접 추가
      </Button>
    );
  }

  return (
    <div className="w-full rounded-lg border border-primary/30 bg-card p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="m-start" className="text-caption">
            시작
          </Label>
          <Input
            id="m-start"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            placeholder="1:23"
            className="h-9 w-24 font-mono"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="m-end" className="text-caption">
            종료
          </Label>
          <Input
            id="m-end"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            placeholder="1:45"
            className="h-9 w-24 font-mono"
          />
        </div>
        <p className="text-caption pb-2 text-muted-foreground">
          영상 길이 {formatSeconds(durationSeconds)}
        </p>
      </div>

      <div className="mt-3 space-y-1">
        <Label htmlFor="m-desc" className="text-caption">
          이 구간의 영상 내용 (선택)
        </Label>
        <Textarea
          id="m-desc"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="예: 주인공이 말을 타고 억새밭을 가로지르는 장면"
        />
      </div>

      {error && (
        <p role="alert" className="mt-2 text-caption text-red-400">
          {error}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={submit} disabled={busy}>
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          추가
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          취소
        </Button>
      </div>
    </div>
  );
}

// ── 설명 + 숨기기 ────────────────────────────────────────────────────────────

export function MomentControls({
  analysisId,
  moment,
  onDone,
}: {
  analysisId: string;
  moment: HypeMoment;
  onDone: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(moment.description ?? "");
  const [busy, setBusy] = useState<"save" | "hide" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isManual = moment.origin === "manual";
  const range = { startSec: moment.startSec, endSec: moment.endSec };

  async function save() {
    setBusy("save");
    setError(null);
    const err = await post(analysisId, {
      action: "describe",
      ...range,
      description: draft,
    });
    setBusy(null);
    if (err) {
      setError(err);
      return;
    }
    setEditing(false);
    onDone();
  }

  async function hide() {
    const message = isManual
      ? "직접 추가한 이 지점을 삭제할까요?"
      : "이 지점을 목록에서 숨길까요? 나중에 되돌릴 수 있습니다.";
    if (!window.confirm(message)) return;
    setBusy("hide");
    setError(null);
    const err = await post(analysisId, { action: "hide", ...range });
    setBusy(null);
    if (err) {
      setError(err);
      return;
    }
    onDone();
  }

  async function reset() {
    if (!moment.editId) return;
    setBusy("reset");
    setError(null);
    const res = await fetch(
      `/api/analyses/${analysisId}/moments?editId=${encodeURIComponent(moment.editId)}`,
      { method: "DELETE" },
    );
    setBusy(null);
    if (!res.ok) {
      setError("되돌리지 못했습니다.");
      return;
    }
    onDone();
  }

  return (
    <div className="space-y-3 rounded-lg border border-border/40 bg-muted/20 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-body-lg font-semibold">이 구간의 영상 내용</h4>
        {isManual && (
          <span className="rounded-full border border-primary/40 px-2 py-0.5 text-caption text-primary">
            직접 지정
          </span>
        )}
        <div className="ml-auto flex gap-1.5">
          {!editing && (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              <Pencil aria-hidden />
              {moment.description ? "설명 수정" : "설명 쓰기"}
            </Button>
          )}
          {/* 자동 지점을 숨겼다가 되돌리려면 편집 행 자체를 지웁니다. */}
          {!isManual && moment.editId && (
            <Button size="sm" variant="ghost" onClick={reset} disabled={busy !== null}>
              {busy === "reset" ? <Loader2 className="animate-spin" aria-hidden /> : <Undo2 aria-hidden />}
              편집 취소
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={hide} disabled={busy !== null}>
            {busy === "hide" ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : isManual ? (
              <Trash2 aria-hidden />
            ) : (
              <X aria-hidden />
            )}
            {isManual ? "삭제" : "숨기기"}
          </Button>
        </div>
      </div>

      {editing ? (
        <div className="space-y-2">
          <Textarea
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="구간 설명 편집"
            placeholder="이 구간에서 실제로 무엇이 나오는지 적어주세요."
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
                setDraft(moment.description ?? "");
              }}
            >
              취소
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-body text-muted-foreground">
          {moment.description || "아직 설명이 없습니다. 영상을 확인하고 직접 적어주세요."}
        </p>
      )}

      {error && (
        <p role="alert" className="text-caption text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

/** 숨긴 지점을 다시 꺼낼 수 있게 알려주는 줄. */
export function HiddenMomentsNotice({
  analysisId,
  hidden,
  onDone,
}: {
  analysisId: string;
  hidden: { id: string; startSec: number; endSec: number }[];
  onDone: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  if (hidden.length === 0) return null;

  async function restore(editId: string) {
    setBusy(editId);
    await fetch(`/api/analyses/${analysisId}/moments?editId=${encodeURIComponent(editId)}`, {
      method: "DELETE",
    });
    setBusy(null);
    onDone();
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border/60 p-3 text-caption text-muted-foreground">
      <Eye className="size-4 shrink-0" aria-hidden />
      숨긴 지점 {hidden.length}개:
      {hidden.map((h) => (
        <button
          key={h.id}
          type="button"
          onClick={() => restore(h.id)}
          disabled={busy !== null}
          className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 font-mono tabular-nums transition-colors hover:border-primary/50 hover:text-foreground"
        >
          {busy === h.id ? (
            <Loader2 className="size-3 animate-spin" aria-hidden />
          ) : (
            <Undo2 className="size-3" aria-hidden />
          )}
          {formatSeconds(h.startSec)}–{formatSeconds(h.endSec)}
        </button>
      ))}
    </div>
  );
}
