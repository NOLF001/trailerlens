// 기존 분석에 댓글을 더 수집해 붙입니다. Claude API는 쓰지 않습니다(비용 0원).
//
//   node scripts/collect-more-comments.mjs <analysisId> [목표개수] [baseUrl]
//
// 왜 필요한가:
//   "열광 지점"의 근거는 댓글에 적힌 영상 시점인데, 시점을 적는 사람은 전체의
//   0.5% 안팎입니다. 근거를 늘리는 유일한 방법은 댓글을 더 모으는 것입니다.
//
// 하는 일:
//   1) YouTube commentThreads를 인기순 → 최신순으로 페이지네이션하며 수집
//   2) 기존 Comment 테이블에 upsert (이미 있는 댓글은 좋아요 수만 갱신)
//   3) 끝나면 분석 재실행을 걸어 4~7단계(타임스탬프 추출 → 보고서)를 다시 계산
//
// YouTube Data API 할당량만 소비합니다. commentThreads 1회 호출 = 1유닛 = 최대 100스레드.

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const analysisId = process.argv[2];
const target = Number(process.argv[3] ?? 40000);
const baseUrl = process.argv[4] ?? "http://localhost:3000";

if (!analysisId || !Number.isFinite(target) || target <= 0) {
  console.error(
    "사용법: node scripts/collect-more-comments.mjs <analysisId> [목표개수] [baseUrl]",
  );
  process.exit(1);
}

/** .env를 직접 읽습니다 (Next 런타임 밖이라 자동 로드가 안 됩니다). */
function readEnv(key) {
  const file = path.join(process.cwd(), ".env");
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m && m[1] === key) return m[2].trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

const API_KEY = readEnv("YOUTUBE_API_KEY");
if (!API_KEY) {
  console.error(".env에 YOUTUBE_API_KEY가 없습니다.");
  process.exit(1);
}

function decodeEntities(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function stripHtml(html) {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>(\n)?/gi, "\n")
      .replace(/<\/(p|div)>/gi, "\n")
      .replace(/<[^>]*>/g, ""),
  )
    .replace(/\r\n/g, "\n")
    .trim();
}

function toRow(videoId, c, parentId) {
  const s = c.snippet ?? {};
  return {
    id: c.id,
    videoId,
    parentId,
    authorDisplayName: s.authorDisplayName ?? "",
    authorChannelId: s.authorChannelId?.value ?? null,
    textOriginal: s.textOriginal ?? stripHtml(s.textDisplay ?? ""),
    likeCount: s.likeCount ?? 0,
    publishedAt: new Date(s.publishedAt ?? 0),
    updatedAt: new Date(s.updatedAt ?? s.publishedAt ?? 0),
    isReply: parentId != null,
  };
}

async function fetchPage(videoId, pageToken, order) {
  const params = new URLSearchParams({
    part: "snippet,replies",
    videoId,
    maxResults: "100",
    order,
    textFormat: "plainText",
    key: API_KEY,
  });
  if (pageToken) params.set("pageToken", pageToken);

  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/commentThreads?${params}`,
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube API ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

const prisma = new PrismaClient();

try {
  const analysis = await prisma.analysis.findUnique({ where: { id: analysisId } });
  if (!analysis) {
    console.error(`분석을 찾을 수 없습니다: ${analysisId}`);
    process.exit(1);
  }
  const videoId = analysis.videoId;

  const before = await prisma.comment.count({ where: { videoId } });
  console.log(`영상 ${videoId} · 현재 수집 댓글 ${before.toLocaleString()}개`);
  console.log(`목표 ${target.toLocaleString()}개까지 수집합니다.\n`);

  let quotaCalls = 0;
  let collected = before;

  for (const order of ["relevance", "time"]) {
    let pageToken = null;
    if (collected >= target) break;

    for (;;) {
      let page;
      try {
        page = await fetchPage(videoId, pageToken, order);
        quotaCalls += 1;
      } catch (e) {
        console.error(`\n수집 중단 (${order}): ${e.message}`);
        break;
      }

      const rows = [];
      for (const thread of page.items ?? []) {
        const top = toRow(videoId, thread.snippet.topLevelComment, null);
        rows.push(top);
        for (const reply of thread.replies?.comments ?? []) {
          rows.push(toRow(videoId, reply, reply.snippet?.parentId ?? top.id));
        }
      }

      // SQLite 트랜잭션이 너무 커지지 않게 나눠 씁니다.
      const CHUNK = 50;
      for (let i = 0; i < rows.length; i += CHUNK) {
        await prisma.$transaction(
          rows.slice(i, i + CHUNK).map((r) =>
            prisma.comment.upsert({
              where: { id: r.id },
              create: r,
              update: {
                likeCount: r.likeCount,
                textOriginal: r.textOriginal,
                updatedAt: r.updatedAt,
              },
            }),
          ),
        );
      }

      collected = await prisma.comment.count({ where: { videoId } });
      process.stdout.write(
        `\r  ${order} · API 호출 ${quotaCalls}회 · 누적 ${collected.toLocaleString()}개   `,
      );

      pageToken = page.nextPageToken ?? null;
      if (!pageToken || collected >= target) break;
    }
    console.log("");
  }

  const added = collected - before;
  console.log(`\n수집 완료: +${added.toLocaleString()}개 (총 ${collected.toLocaleString()}개)`);
  console.log(`YouTube API 할당량 사용: 약 ${quotaCalls}유닛 (하루 한도 10,000)`);

  if (added === 0) {
    console.log("새로 추가된 댓글이 없어 재분석을 건너뜁니다.");
    process.exit(0);
  }

  // 새 댓글이 타임스탬프 추출과 보고서에 반영되도록 4~7단계를 다시 돌립니다.
  await prisma.analysis.update({
    where: { id: analysisId },
    data: { status: "failed", error: null },
  });
  const res = await fetch(`${baseUrl}/api/analyses/${analysisId}/actions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "retry" }),
  });
  console.log(`재분석 요청: HTTP ${res.status} ${JSON.stringify(await res.json())}`);
  console.log("진행 상황은 분석 페이지에서 확인하세요.");
} finally {
  await prisma.$disconnect();
}
