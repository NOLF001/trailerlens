"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function HeatmapUpload({ analysisId }: { analysisId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setMessage(null);
    try {
      const trimmed = text.trim();
      let body: unknown;
      if (trimmed.startsWith("[")) {
        try {
          body = { format: "json", segments: JSON.parse(trimmed) };
        } catch {
          setMessage("JSON 파싱에 실패했습니다.");
          return;
        }
      } else {
        body = { format: "csv", text: trimmed };
      }
      const res = await fetch(`/api/analyses/${analysisId}/heatmap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok?: boolean; segments?: number; error?: string };
      if (!res.ok || !data.ok) {
        setMessage(data.error ?? "업로드에 실패했습니다.");
        return;
      }
      setMessage(`${data.segments}개 구간을 적용했습니다. 보고서를 새로 고칩니다…`);
      setTimeout(() => router.refresh(), 600);
      window.location.reload();
    } catch {
      setMessage("네트워크 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed p-4 text-body">
      <button
        type="button"
        className="flex items-center gap-2 font-medium underline-offset-4 hover:underline"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Upload className="size-4" aria-hidden />
        히트맵 수동 가져오기 (JSON / CSV)
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          <p className="text-caption text-muted-foreground">
            JSON: <code>{`[{"startTime":189.9,"endTime":192.01,"value":1.0}]`}</code>{" "}
            · CSV: <code>start,end,value</code> 한 줄씩. 값은 자동으로 0~1 상대
            강도로 정규화됩니다.
          </p>
          <Textarea
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder='[{"startTime": 10, "endTime": 12, "value": 0.8}, ...]'
            aria-label="히트맵 데이터"
            className="font-mono text-caption"
          />
          <Button size="sm" onClick={submit} disabled={busy || !text.trim()}>
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            적용하고 보고서 다시 생성
          </Button>
          {message && <p className="text-caption text-muted-foreground">{message}</p>}
        </div>
      )}
    </div>
  );
}
