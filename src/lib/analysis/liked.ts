// "좋아요 순으로 정렬했을 때 사람들이 무엇을 좋아했는가" — 전부 실제 수치와
// 원문 인용으로만 답합니다. 여기서 문장을 지어내지 않습니다.
//
// 규칙:
//   · 모든 숫자는 수집한 댓글에서 직접 센 값입니다. 추정·보정 없음.
//   · 그룹 이름은 미리 정해진 분류표(반응 유형 / 주제)에서만 나옵니다.
//   · 근거는 항상 실제 댓글 원문을 그대로 붙입니다.

import { detectReactions } from "@/lib/analysis/hype";
import type { ReactionKind, Topic } from "@/lib/types";

export interface LikedComment {
  id: string;
  author: string;
  text: string;
  likeCount: number;
  publishedAt: string;
  isReply: boolean;
  /** 전체 좋아요 합에서 이 댓글이 차지하는 비율 0~1. */
  likeShare: number;
  reactions: ReactionKind[];
  topics: Topic[];
}

export interface LikedGroup {
  /** ReactionKind 또는 Topic 값. 라벨은 화면에서 붙입니다. */
  key: string;
  /** 상위 댓글 중 이 그룹에 속한 댓글 수. */
  count: number;
  /** 그 댓글들의 좋아요 합계. */
  likeTotal: number;
  /** 상위 댓글 전체 좋아요 대비 비율 0~1. */
  likeShare: number;
  /** 좋아요 순 실제 댓글. */
  comments: LikedComment[];
}

export interface KeywordStat {
  term: string;
  /** 이 표현이 등장한 상위 댓글 수. */
  commentCount: number;
  /** 그 댓글들의 좋아요 합계. */
  likeTotal: number;
}

export interface LikedAnalysis {
  /** 수집한 전체 댓글 수. */
  totalComments: number;
  /** 전체 댓글의 좋아요 합계. */
  totalLikes: number;
  /** 이 분석이 들여다본 상위 댓글 수. */
  scope: number;
  /** 상위 댓글이 전체 좋아요에서 차지하는 비율 0~1. */
  scopeLikeShare: number;
  /** 좋아요가 상위 몇 개에 얼마나 몰려 있는지. */
  concentration: { topN: number; likeShare: number }[];
  /** 좋아요 순 상위 댓글 원문. */
  ranking: LikedComment[];
  /** 상위 댓글을 반응 유형(정규식 판정)으로 묶은 것. */
  reactionGroups: LikedGroup[];
  /** 상위 댓글을 주제 분류로 묶은 것. */
  topicGroups: LikedGroup[];
  /** 상위 댓글에서 반복된 표현. */
  keywords: KeywordStat[];
  /** 반응 유형이 하나도 잡히지 않은 상위 댓글 수. */
  unmatchedReactionCount: number;
}

export interface LikedInput {
  id: string;
  author: string;
  text: string;
  likeCount: number;
  publishedAt: string;
  isReply: boolean;
  topics: Topic[];
}

// ── 표현 빈도 ────────────────────────────────────────────────────────────────

// 의미를 담지 않는 흔한 말들. 여기 없는 단어는 그대로 셉니다 — 빈도표에
// 나온 단어는 전부 실제로 그만큼 등장했다는 뜻입니다.
const STOPWORDS = new Set([
  // English
  "the","a","an","and","or","but","if","of","to","in","on","at","for","with","by",
  "is","are","was","were","be","been","being","am","do","does","did","have","has",
  "had","will","would","can","could","should","may","might","must","this","that",
  "these","those","it","its","i","you","he","she","we","they","me","him","her",
  "them","my","your","his","their","our","not","no","yes","so","just","really",
  "very","too","also","then","than","as","from","up","out","about","into","over",
  "after","before","when","while","how","what","who","why","where","all","any",
  "some","more","most","other","such","only","own","same","one","two","get","got",
  "like","dont","don","im","ive","youre","thats","theres","its","because","there",
  "here","now","still","even","much","many","make","made","see","saw","know","think",
  "s","t","m","re","ve","ll","d",
  // 한국어
  "그리고","그런데","하지만","그래서","이건","저건","그건","이거","저거","그거",
  "정말","진짜","너무","아주","매우","완전","그냥","좀","더","제일","가장","이제",
  "근데","그럼","해서","하는","했다","한다","합니다","했는데","같다","같은","같아",
  "있다","있는","없다","없는","되다","되는","보다","보는","이런","저런","그런",
  "나는","내가","니가","우리","저는","제가","것","수","때","건","거","등",
  // 日本語
  "これ","それ","あれ","この","その","あの","です","ます","した","して","する",
  "ある","いる","なる","こと","もの","ため","よう","そう","でも","から","まで",
]);

// 한국어 조사·어미 — 같은 단어가 조사만 달라 따로 세지 않도록 끝에서 떼어냅니다.
const KO_SUFFIX = /(으로서|으로써|에서는|에게서|이라고|라고는|에서|에게|까지|부터|보다|처럼|이랑|라도|이나|든지|마저|조차|밖에|한테|으로|로서|로써|은|는|이|가|을|를|에|의|도|만|과|와|로|랑|야|아|여)$/;

function normalizeToken(raw: string): string | null {
  let t = raw.toLowerCase();
  // 앞뒤 구두점 제거 (내부 하이픈/어퍼스트로피는 유지)
  t = t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  if (!t) return null;
  // 한글 단어는 조사를 떼고, 떼고 나서 너무 짧아지면 원형을 씁니다.
  if (/^[가-힣]+$/.test(t) && t.length >= 3) {
    const stripped = t.replace(KO_SUFFIX, "");
    if (stripped.length >= 2) t = stripped;
  }
  if (STOPWORDS.has(t)) return null;
  // 한 글자는 대부분 의미가 없지만, 한자/가나는 한 글자로도 뜻이 있습니다.
  if (t.length < 2 && !/[぀-ヿ一-鿿]/.test(t)) return null;
  if (/^\d+$/.test(t)) return null;
  return t;
}

function tokenize(text: string): string[] {
  // 타임스탬프(0:42)와 URL은 표현 빈도에서 뺍니다 — 내용이 아니라 좌표입니다.
  const cleaned = text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\d{1,2}:\d{2}(:\d{2})?/g, " ");
  const out: string[] = [];
  for (const raw of cleaned.split(/[\s,./\\|!?;:"'`~^&*()[\]{}<>+=_\-‐-―…·、。！？「」『』（）]+/u)) {
    const t = normalizeToken(raw);
    if (t) out.push(t);
  }
  return out;
}

/** 상위 댓글에서 반복된 표현. 등장 댓글 수 → 좋아요 합 순. */
function buildKeywords(comments: LikedComment[], limit: number): KeywordStat[] {
  const commentCount = new Map<string, number>();
  const likeTotal = new Map<string, number>();

  for (const c of comments) {
    // 한 댓글에서 같은 단어를 여러 번 써도 1회로 셉니다 — 도배 댓글 하나가
    // 빈도표를 통째로 흔드는 것을 막습니다.
    const seen = new Set(tokenize(c.text));
    for (const t of seen) {
      commentCount.set(t, (commentCount.get(t) ?? 0) + 1);
      likeTotal.set(t, (likeTotal.get(t) ?? 0) + c.likeCount);
    }
  }

  return [...commentCount.entries()]
    // 한 댓글에만 나온 단어는 "반복된 표현"이 아닙니다.
    .filter(([, n]) => n >= 2)
    .map(([term, count]) => ({
      term,
      commentCount: count,
      likeTotal: likeTotal.get(term) ?? 0,
    }))
    .sort((a, b) => b.commentCount - a.commentCount || b.likeTotal - a.likeTotal)
    .slice(0, limit);
}

// ── 그룹 묶기 ────────────────────────────────────────────────────────────────

function groupBy(
  comments: LikedComment[],
  keysOf: (c: LikedComment) => string[],
  scopeLikes: number,
  examplesPerGroup: number,
): LikedGroup[] {
  const buckets = new Map<string, LikedComment[]>();
  for (const c of comments) {
    for (const k of keysOf(c)) {
      const arr = buckets.get(k) ?? [];
      arr.push(c);
      buckets.set(k, arr);
    }
  }

  return [...buckets.entries()]
    .map(([key, list]) => {
      const likeTotal = list.reduce((s, c) => s + c.likeCount, 0);
      return {
        key,
        count: list.length,
        likeTotal,
        likeShare: scopeLikes > 0 ? likeTotal / scopeLikes : 0,
        comments: list.slice(0, examplesPerGroup),
      };
    })
    // 사람들이 "가장 많이 좋아한" 것이 위로 오도록 좋아요 합 기준으로 정렬합니다.
    .sort((a, b) => b.likeTotal - a.likeTotal || b.count - a.count);
}

// ── 본체 ─────────────────────────────────────────────────────────────────────

export function buildLikedAnalysis(
  input: LikedInput[],
  { scope = 100, examplesPerGroup = 5, keywordLimit = 40 } = {},
): LikedAnalysis {
  const totalLikes = input.reduce((s, c) => s + c.likeCount, 0);
  const sorted = [...input].sort(
    (a, b) => b.likeCount - a.likeCount || a.publishedAt.localeCompare(b.publishedAt),
  );

  const concentration = [10, 50, 100, 500]
    .filter((n) => n <= sorted.length)
    .map((topN) => ({
      topN,
      likeShare:
        totalLikes > 0
          ? sorted.slice(0, topN).reduce((s, c) => s + c.likeCount, 0) / totalLikes
          : 0,
    }));

  const top = sorted.slice(0, scope);
  const scopeLikes = top.reduce((s, c) => s + c.likeCount, 0);

  const ranking: LikedComment[] = top.map((c) => ({
    id: c.id,
    author: c.author,
    text: c.text,
    likeCount: c.likeCount,
    publishedAt: c.publishedAt,
    isReply: c.isReply,
    likeShare: totalLikes > 0 ? c.likeCount / totalLikes : 0,
    reactions: detectReactions(c.text),
    topics: c.topics,
  }));

  return {
    totalComments: input.length,
    totalLikes,
    scope: ranking.length,
    scopeLikeShare: totalLikes > 0 ? scopeLikes / totalLikes : 0,
    concentration,
    ranking,
    reactionGroups: groupBy(ranking, (c) => c.reactions, scopeLikes, examplesPerGroup),
    topicGroups: groupBy(
      ranking,
      // "기타"는 분류가 안 됐다는 뜻이라 무엇을 좋아했는지 알려주지 못합니다.
      (c) => c.topics.filter((t) => t !== "other"),
      scopeLikes,
      examplesPerGroup,
    ),
    keywords: buildKeywords(ranking, keywordLimit),
    unmatchedReactionCount: ranking.filter((c) => c.reactions.length === 0).length,
  };
}
