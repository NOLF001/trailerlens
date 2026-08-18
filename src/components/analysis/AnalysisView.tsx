"use client";

// Polls the analysis job and renders progress → report.
// Refreshing the browser mid-analysis is safe: state lives in the DB.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Ban,
  CheckCircle2,
  Loader2,
  MessagesSquare,
  RotateCcw,
  Trash2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportView } from "@/components/analysis/ReportView";
import { ANALYSIS_STEPS, type AnalysisStatusPayload } from "@/lib/types";
import { cn } from "@/lib/utils";

const ACTIVE_STATUSES = new Set(["queued", "running", "canceling"]);

export function AnalysisView({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<AnalysisStatusPayload | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [pollKey, setPollKey] = useState(0);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function tick() {
      try {
        const res = await fetch(`/api/analyses/${id}`, { cache: "no-store" });
        if (res.status === 404) {
          if (!stopped) setNotFound(true);
          return;
        }
        if (res.ok) {
          const json = (await res.json()) as { analysis: AnalysisStatusPayload };
          if (!stopped) {
            setData(json.analysis);
            if (!ACTIVE_STATUSES.has(json.analysis.status)) return; // terminal → stop polling
          }
        }
      } catch {
        // transient network issue — keep polling
      }
      if (!stopped) timer = setTimeout(tick, 1500);
    }

    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [id, pollKey]);

  const act = useCallback(
    async (action: "cancel" | "retry") => {
      await fetch(`/api/analyses/${id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      setPollKey((k) => k + 1);
    },
    [id],
  );

  async function remove() {
    if (!window.confirm("이 분석과 관련 데이터를 삭제할까요?")) return;
    await fetch(`/api/analyses/${id}`, { method: "DELETE" });
    router.push("/");
  }

  if (notFound) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-muted-foreground">
          분석을 찾을 수 없습니다. 삭제되었을 수 있습니다.
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (data.status === "completed" && data.report) {
    return <ReportView analysisId={id} report={data.report} />;
  }

  // 댓글/답글 수집(1~2단계)이 끝나면 그 뒤 단계(분석 등)가 실패하거나
  // 취소돼도 이미 모은 댓글은 DB에 그대로 남아있습니다. 보고서가 안
  // 나왔다고 그 기록까지 못 보게 막을 이유가 없어서 바로 열어줍니다.
  const commentsCollected =
    data.currentStep > 3 || (data.currentStep === 3 && data.stepProgress >= 1);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Card>
        <CardContent className="space-y-6 p-6">
          <div>
            <h1 className="text-lg font-semibold">
              {data.video?.title ?? data.videoId}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.status === "queued" && "대기 중입니다…"}
              {data.status === "running" && "분석이 진행 중입니다. 페이지를 닫아도 계속 진행됩니다."}
              {data.status === "canceling" && "취소 중입니다…"}
              {data.status === "canceled" && "분석이 취소되었습니다. 이어서 재개할 수 있습니다."}
              {data.status === "failed" && "분석이 실패했습니다."}
            </p>
          </div>

          <ol className="space-y-3" aria-label="분석 진행 단계">
            {ANALYSIS_STEPS.map((label, i) => {
              const stepNo = i + 1;
              const isDone =
                data.currentStep > stepNo ||
                (data.currentStep === stepNo && data.stepProgress >= 1);
              const isActive =
                data.currentStep === stepNo &&
                data.stepProgress < 1 &&
                ACTIVE_STATUSES.has(data.status);
              const isFailed = data.status === "failed" && data.failedStep === stepNo;
              return (
                <li key={label} className="flex items-center gap-3">
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs tabular-nums",
                      isDone && "border-primary bg-primary text-primary-foreground",
                      isActive && "border-primary text-primary",
                      isFailed && "border-destructive text-destructive",
                      !isDone && !isActive && !isFailed && "border-border text-muted-foreground",
                    )}
                    aria-hidden
                  >
                    {isDone ? <CheckCircle2 className="size-4" /> : isFailed ? <XCircle className="size-4" /> : stepNo}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-sm",
                        isActive ? "font-medium" : "text-muted-foreground",
                      )}
                    >
                      {label}
                      {isActive && (
                        <Loader2
                          className="ml-2 inline size-3.5 animate-spin text-primary"
                          aria-hidden
                        />
                      )}
                    </p>
                    {isActive && (
                      <Progress
                        value={data.stepProgress * 100}
                        className="mt-1.5"
                        aria-label={`${label} 진행률`}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          {data.error && (
            <p role="alert" className="rounded-md bg-destructive/15 p-3 text-sm text-red-300">
              {data.error}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {ACTIVE_STATUSES.has(data.status) && (
              <Button variant="outline" onClick={() => act("cancel")}>
                <Ban aria-hidden /> 취소
              </Button>
            )}
            {(data.status === "failed" || data.status === "canceled") && (
              <Button onClick={() => act("retry")}>
                <RotateCcw aria-hidden /> 이어서 재시도
              </Button>
            )}
            {commentsCollected && (
              <Button variant="outline" asChild>
                <Link href={`/analysis/${id}/comments`}>
                  <MessagesSquare aria-hidden /> 수집된 댓글 보기
                </Link>
              </Button>
            )}
            <Button variant="ghost" onClick={remove} className="ml-auto text-muted-foreground">
              <Trash2 aria-hidden /> 삭제
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
