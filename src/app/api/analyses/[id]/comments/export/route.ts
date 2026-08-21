// GET /api/analyses/[id]/comments/export — 수집한 댓글을 엑셀(.xlsx)로 내려받습니다.
//
// 쿼리 파라미터는 댓글 탐색기와 동일합니다(같은 필터 모듈을 씁니다).
// 아무 필터도 없으면 수집한 전체 댓글이 나갑니다.
//
// 댓글이 수십만 개일 수 있어 파일 전체를 메모리에 올리지 않고,
// DB에서 배치로 읽어 스트리밍으로 곧장 응답에 씁니다.

import { NextResponse, type NextRequest } from "next/server";
import { PassThrough, Readable } from "node:stream";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { safeJsonParse, formatSeconds } from "@/lib/utils";
import { SPAM_THRESHOLD } from "@/lib/analysis/spam";
import {
  buildCommentOrderBy,
  buildCommentWhere,
  commentFilterSchema,
  hasActiveFilters,
} from "@/lib/comment-filters";
import { SENTIMENT_LABELS_KO } from "@/lib/palette";
import { TOPIC_LABELS_KO, type Topic } from "@/lib/types";

// 스트리밍이라 Node 런타임이 필요합니다(Edge 불가).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BATCH = 2_000;

const COLUMNS = [
  { header: "번호", key: "no", width: 8 },
  { header: "작성자", key: "author", width: 22 },
  { header: "댓글 내용", key: "text", width: 80 },
  { header: "좋아요", key: "likes", width: 10 },
  { header: "작성일시", key: "publishedAt", width: 20 },
  { header: "유형", key: "kind", width: 10 },
  { header: "언어", key: "language", width: 8 },
  { header: "감정", key: "sentiment", width: 10 },
  { header: "주제", key: "topics", width: 30 },
  { header: "언급 시점", key: "timestamps", width: 18 },
  { header: "중복", key: "duplicate", width: 8 },
  { header: "스팸 의심", key: "spam", width: 10 },
];

// 참고: CSV와 달리 xlsx는 문자열 셀(t="s")을 수식으로 해석하지 않으므로
// "=" · "@"로 시작하는 댓글에 따옴표를 덧붙이지 않습니다. 원문 그대로 내보내는
// 것이 이 파일의 목적입니다 — 작성자명(@닉네임)이 훼손되면 안 됩니다.

function filenameFor(title: string, filtered: boolean): string {
  const base = title.replace(/[\\/:*?"<>|]/g, "").slice(0, 60).trim() || "comments";
  const suffix = filtered ? "_필터" : "_전체";
  // 비ASCII 파일명은 filename*= (RFC 5987)로 따로 전달합니다.
  return `${base}${suffix}_댓글.xlsx`;
}

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const analysis = await prisma.analysis.findUnique({
    where: { id },
    include: { video: true },
  });
  if (!analysis || !analysis.video) {
    return NextResponse.json({ error: "분석을 찾을 수 없습니다." }, { status: 404 });
  }

  const parsed = commentFilterSchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 필터입니다." }, { status: 400 });
  }
  const qp = parsed.data;

  const where = buildCommentWhere(analysis.video.id, qp);
  const orderBy = buildCommentOrderBy(qp);
  const total = await prisma.comment.count({ where });
  if (total === 0) {
    return NextResponse.json(
      { error: "조건에 맞는 댓글이 없습니다." },
      { status: 404 },
    );
  }

  const video = analysis.video;
  const filtered = hasActiveFilters(qp);

  // ExcelJS는 진짜 Node Writable을 요구합니다(내부 압축기가 drain/finish
  // 이벤트를 기다려서, 흉내낸 객체를 주면 영원히 멈춥니다).
  // PassThrough에 쓰고 그것을 웹 스트림으로 변환해 응답에 그대로 흘립니다.
  const pass = new PassThrough();
  const webStream = Readable.toWeb(pass) as ReadableStream<Uint8Array>;

  void (async () => {
    try {
      const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
        stream: pass,
        useStyles: true,
      });

      // 1번 시트: 이 파일이 무엇인지. 나중에 파일만 보고도 출처를 알 수 있게 합니다.
      const info = workbook.addWorksheet("수집 정보");
      info.columns = [
        { header: "항목", key: "k", width: 22 },
        { header: "값", key: "v", width: 70 },
      ];
      info.getRow(1).font = { bold: true };
      for (const [k, v] of [
        ["영상 제목", video.title],
        ["채널", video.channelTitle],
        ["영상 URL", `https://www.youtube.com/watch?v=${video.id}`],
        ["유튜브 표시 댓글 수", video.commentCount?.toLocaleString() ?? "—"],
        ["이 파일의 댓글 수", total.toLocaleString()],
        ["범위", filtered ? "댓글 탐색기 필터 적용" : "수집한 전체 댓글"],
        ["정렬", qp.sort === "recent" ? "최신순" : "좋아요순"],
        ["중복·스팸", qp.includeNoise === "true" ? "포함" : "제외"],
        ["내보낸 시각", new Date().toISOString()],
      ] as [string, string][]) {
        info.addRow({ k, v }).commit();
      }
      info.commit();

      // 스트리밍 시트에서는 views/autoFilter가 읽기 전용이라 생성 시점에만
      // 넘길 수 있습니다.
      const sheet = workbook.addWorksheet("댓글", {
        views: [{ state: "frozen", ySplit: 1 }],
        // autoFilter는 WorksheetWriter가 생성 옵션으로 실제로 받지만
        // exceljs의 타입 정의에는 빠져 있습니다.
        ...({ autoFilter: { from: "A1", to: "L1" } } as object),
      });
      sheet.columns = COLUMNS;
      const head = sheet.getRow(1);
      head.font = { bold: true };
      head.commit();

      let no = 0;
      for (let skip = 0; skip < total; skip += BATCH) {
        const rows = await prisma.comment.findMany({ where, orderBy, skip, take: BATCH });
        if (rows.length === 0) break;

        for (const r of rows) {
          no += 1;
          const topics = safeJsonParse<Topic[]>(r.topics, []);
          const stamps = safeJsonParse<number[]>(r.extractedTimestamps, []);
          const row = sheet.addRow({
            no,
            author: r.authorDisplayName,
            text: r.textOriginal,
            likes: r.likeCount,
            publishedAt: r.publishedAt.toISOString().replace("T", " ").slice(0, 19),
            kind: r.isReply ? "답글" : "원댓글",
            language: r.detectedLanguage ?? "",
            sentiment: r.sentiment ? (SENTIMENT_LABELS_KO[r.sentiment] ?? r.sentiment) : "",
            topics: topics.map((t) => TOPIC_LABELS_KO[t] ?? t).join(", "),
            timestamps: stamps.map((s) => formatSeconds(s)).join(", "),
            duplicate: r.duplicateGroupId ? "Y" : "",
            spam: (r.spamProbability ?? 0) >= SPAM_THRESHOLD ? "Y" : "",
          });
          row.getCell("text").alignment = { wrapText: true, vertical: "top" };
          row.commit();
        }
      }

      sheet.commit();
      // workbook.commit()이 스트림까지 닫아줍니다.
      await workbook.commit();
    } catch (e) {
      console.error("comment export failed:", e);
      pass.destroy(e as Error);
    }
  })();

  const filename = filenameFor(video.title, filtered);
  return new Response(webStream, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="comments.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
