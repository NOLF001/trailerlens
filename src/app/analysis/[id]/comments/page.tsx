import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { ExplorerTabs } from "@/components/comments/ExplorerTabs";

export const metadata: Metadata = { title: "댓글 탐색기" };
export const dynamic = "force-dynamic";

export default async function CommentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const analysis = await prisma.analysis.findUnique({
    where: { id },
    include: { video: true },
  });

  if (!analysis) {
    return (
      <p className="rounded-md border border-dashed p-10 text-center text-muted-foreground">
        분석을 찾을 수 없습니다.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Link
          href={`/analysis/${id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden /> 보고서로 돌아가기
        </Link>
        <h1 className="mt-2 text-xl font-bold">댓글 탐색기</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {analysis.video?.title}
        </p>
      </div>
      <ExplorerTabs analysisId={id} />
    </div>
  );
}
