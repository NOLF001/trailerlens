// 완료(completed) 처리됐지만 일부 댓글이 Claude 분석에 실패한 분석을 다시 돌립니다.
//
//   node scripts/retry-failed-comments.mjs <analysisId> [baseUrl]
//
// 하는 일:
//   1) 해당 영상의 analysisStatus="failed" 댓글 수를 확인
//   2) 분석 레코드를 재시도 가능한 상태로 되돌림 (completed → failed)
//   3) POST /api/analyses/{id}/actions {"action":"retry"} 호출
// 실제 재분석은 dev 서버 프로세스 안에서 5~7단계를 다시 돌며 진행됩니다.
// (실패 댓글을 pending으로 되돌리는 처리는 pipeline.ts의 5단계 시작 지점에 있습니다.)

import { PrismaClient } from "@prisma/client";

const analysisId = process.argv[2];
const baseUrl = process.argv[3] ?? "http://localhost:3000";

if (!analysisId) {
  console.error("사용법: node scripts/retry-failed-comments.mjs <analysisId> [baseUrl]");
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  const analysis = await prisma.analysis.findUnique({ where: { id: analysisId } });
  if (!analysis) {
    console.error(`분석을 찾을 수 없습니다: ${analysisId}`);
    process.exit(1);
  }

  const failed = await prisma.comment.count({
    where: { videoId: analysis.videoId, analysisStatus: "failed" },
  });
  console.log(`분석 ${analysisId} (${analysis.videoId}) · 현재 상태: ${analysis.status}`);
  console.log(`재분석 대상 댓글: ${failed.toLocaleString()}개`);

  if (failed === 0) {
    console.log(
      "실패한 댓글은 없습니다. 이미 분석된 댓글은 건너뛰고 장면 연결·보고서만 다시 만듭니다.",
    );
  }

  if (analysis.status === "running" || analysis.status === "queued") {
    console.error("이미 실행 중입니다. 끝난 뒤 다시 시도하세요.");
    process.exit(1);
  }

  // resumeAnalysis()는 failed/canceled 상태만 다시 큐에 넣습니다.
  await prisma.analysis.update({
    where: { id: analysisId },
    data: { status: "failed", error: null },
  });

  const res = await fetch(`${baseUrl}/api/analyses/${analysisId}/actions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "retry" }),
  });
  const body = await res.json();
  console.log(`retry 요청: HTTP ${res.status} ${JSON.stringify(body)}`);

  if (!res.ok) {
    console.error("재시도 요청이 거부됐습니다. dev 서버가 켜져 있는지 확인하세요.");
    process.exit(1);
  }
  console.log("재분석을 시작했습니다. 진행 상황은 분석 페이지에서 확인하세요.");
} finally {
  await prisma.$disconnect();
}
