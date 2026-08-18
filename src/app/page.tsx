import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/db";
import { isMockMode } from "@/lib/env";
import { UrlForm } from "@/components/home/UrlForm";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatCount } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  queued: "대기 중",
  running: "분석 중",
  completed: "완료",
  failed: "실패",
  canceling: "취소 중",
  canceled: "취소됨",
};

export default async function HomePage() {
  const recent = await prisma.analysis.findMany({
    orderBy: { createdAt: "desc" },
    take: 9,
    include: { video: true },
  });

  return (
    <div className="space-y-10">
      <section className="mx-auto max-w-3xl space-y-4 pt-6 text-center">
        <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
          트레일러에 쏟아진 반응, <span className="text-primary">장면 단위</span>로
          읽어드립니다
        </h1>
        <p className="text-balance text-muted-foreground">
          유튜브 게임 트레일러 URL을 넣으면 전체 공개 댓글·답글과 반복 재생 신호를
          수집하고, 사람들이 어떤 장면을 왜 인상적으로 봤는지 보고서로 정리합니다.
        </p>
        {isMockMode() && (
          <Badge variant="secondary" className="mx-auto">
            Mock 모드 — API 키 없이 합성 데이터로 전체 흐름을 체험할 수 있습니다
          </Badge>
        )}
      </section>

      <section className="mx-auto max-w-3xl">
        <UrlForm />
      </section>

      {recent.length > 0 && (
        <section aria-labelledby="recent-heading" className="space-y-3">
          <h2 id="recent-heading" className="text-lg font-semibold">
            최근 분석
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((a) => (
              <Link key={a.id} href={`/analysis/${a.id}`} className="group">
                <Card className="h-full transition-colors group-hover:border-primary/50">
                  <CardContent className="flex gap-3 p-4">
                    <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded bg-muted">
                      {a.video?.thumbnailUrl ? (
                        <Image
                          src={a.video.thumbnailUrl}
                          alt=""
                          fill
                          sizes="112px"
                          className="object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 space-y-1">
                      <p className="line-clamp-2 text-sm font-medium leading-snug">
                        {a.video?.title ?? a.videoId}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {a.video ? `조회수 ${formatCount(Number(a.video.viewCount ?? 0))}` : ""}
                      </p>
                      <Badge
                        variant={a.status === "completed" ? "secondary" : "muted"}
                        className="text-[11px]"
                      >
                        {STATUS_LABEL[a.status] ?? a.status}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
