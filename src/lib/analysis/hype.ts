// "열광 지점" 분석 — 외부 API 없이 로컬에서만 계산합니다.
//
// 두 가지 서로 다른 근거를 씁니다. 섞지 않고 각각 무엇에서 왔는지 남깁니다.
//   1) 유튜브 최다 재생 구간(heatmap) — 어느 "시점"을 반복해서 봤는지
//   2) 댓글 본문 — 무엇에 대해 어떻게 반응했는지 (+ 타임스탬프를 적은 댓글은 시점까지)
//
// 댓글에 타임스탬프를 적는 사람은 보통 전체의 1% 안팎이라, 시점 근거는 대부분
// heatmap에서 나오고 댓글은 그 구간의 "증거"로 붙습니다. 근거가 없으면 없다고
// 표시할 뿐, 추정으로 채우지 않습니다.

import type {
  HeatSegment,
  HypeComment,
  HypeMoment,
  HypeReport,
  MomentEdit,
  MomentEvidence,
  ReactionGroup,
  ReactionKind,
  Topic,
} from "@/lib/types";
import { REACTION_KINDS } from "@/lib/types";
import { normalizeSegments, findHeatPeaks, heatOverRange } from "@/lib/analysis/scenes";
import { clusterTimestamps } from "@/lib/analysis/timestamps";
import { likeWeight } from "@/lib/utils";

interface ReactionRule {
  kind: ReactionKind;
  /** 열광 강도 가중치. 감탄 계열이 가장 높습니다. */
  weight: number;
  re: RegExp;
}

const REACTION_RULES: ReactionRule[] = [
  {
    kind: "awe",
    weight: 3,
    re: /goosebump|chills|소름|미쳤|미친|지린|개쩐|말도\s*안\s*(돼|되)|insane|unreal|masterpiece|breathtaking|jaw[\s-]?drop|holy\s*(shit|hell|moly)|no\s*way\b|\bwow\b|\bgoat(ed)?\b|legendary|iconic|cinema\b|peak\b|10\s*\/\s*10|goat\b|鳥肌|やばい/i,
  },
  {
    kind: "awe",
    weight: 2,
    re: /stunning|gorgeous|beautiful|perfect|amazing|incredible|best\s+trailer|so\s+real|next[\s-]?gen|대박|역대급|명작|😱|🤯|🥶|🔥/i,
  },
  {
    kind: "replay",
    weight: 2.5,
    re: /replay(ed|ing|s)?\b|rewatch|다시\s*보|몇\s*번(째|이나)?\s*(봤|보)|\d+\s*회차|keep\s+coming\s+back|watch(ing|ed)?\s+(this|it)\s+again|who('?s|\s+is)\s+(here|watching|still)|still\s+(here|watching)|何回も/i,
  },
  {
    kind: "anticipation",
    weight: 2,
    re: /can'?t\s+wait|기다리|기다렸|존버|언제\s*(나와|나오|출시|발매)|counting\s+down|hyped?\b|기대(된|돼|한)|release\s+date|待って|楽しみ/i,
  },
  {
    kind: "purchase",
    weight: 2.5,
    re: /구매|살게|사야|지른다|예약\s*(구매|했)|pre[\s-]?order(ed|ing)?|day\s*one|take\s+my\s+money|\bcop(ping|ped)?\b|buy(ing)?\s+(this|it)|wishlist/i,
  },
  {
    kind: "nostalgia",
    weight: 2,
    re: /nostalgi[ac]|grew\s+up|childhood|years?\s+later|takes?\s+me\s+back|어릴\s*때|어린\s*시절|추억|그\s*시절|전작|원작|懐かし/i,
  },
  {
    kind: "humor",
    weight: 1,
    re: /😂|🤣|\blmao\b|\blmfao\b|\blol\b|ㅋㅋ|ㅎㅎ|웃겨|웃긴|funny|草/i,
  },
  {
    kind: "critique",
    weight: 1.5,
    re: /실망|아쉽|별로|우려|걱정|망했|disappoint|underwhelm|\bmid\b|overrated|not\s+impressed|concern(ed|ing)?|worried|downgrade|残念/i,
  },
];

/** 이 댓글이 드러낸 반응 유형들. 매칭이 없으면 빈 배열입니다. */
export function detectReactions(text: string): ReactionKind[] {
  const kinds = new Set<ReactionKind>();
  for (const rule of REACTION_RULES) {
    if (rule.re.test(text)) kinds.add(rule.kind);
  }
  return [...kinds];
}

/**
 * 열광 강도. 규칙 가중치 합에 좋아요 가중치를 곱합니다.
 * 좋아요가 0이어도 표현이 강하면 점수가 남고, 표현이 없으면 0입니다.
 */
export function hypeScore(text: string, likeCount: number): number {
  let intensity = 0;
  for (const rule of REACTION_RULES) {
    if (rule.re.test(text)) intensity += rule.weight;
  }
  if (intensity === 0) return 0;
  return intensity * likeWeight(likeCount);
}

export interface HypeCommentInput {
  id: string;
  author: string;
  text: string;
  likeCount: number;
  timestamps: number[];
  topics: Topic[];
}

const EXCERPT_LIMIT = 400;

function toHypeComment(c: HypeCommentInput, near?: number): HypeComment {
  const inRange =
    near !== undefined
      ? c.timestamps.find((t) => Math.abs(t - near) <= 8)
      : c.timestamps[0];
  return {
    id: c.id,
    author: c.author,
    text: c.text.length > EXCERPT_LIMIT ? `${c.text.slice(0, EXCERPT_LIMIT)}…` : c.text,
    likeCount: c.likeCount,
    timestampSec: inRange ?? c.timestamps[0] ?? null,
    reactions: detectReactions(c.text),
  };
}

/** 같은 사람이 같은 말을 반복한 경우를 예시에서 걸러냅니다. */
function dedupeComments(comments: HypeComment[]): HypeComment[] {
  const seen = new Set<string>();
  const out: HypeComment[] = [];
  for (const c of comments) {
    const key = c.text.replace(/\s+/g, "").toLowerCase().slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/**
 * "0:25 0:26 0:26 0:27…"처럼 시점을 줄줄이 나열하기만 한 댓글은 읽을 내용이
 * 없어 인용에서 뺍니다.
 *
 * 반면 "0:29" 하나만 적은 댓글은 남깁니다. 문장은 없어도 그 순간을 지목한
 * 유효한 신호이고, 이런 것까지 버리면 근거가 실제보다 적어 보입니다.
 */
function isTimestampDump(text: string): boolean {
  // 유튜브 댓글에는 양방향 제어문자가 섞여 들어오는 경우가 있어 함께 제거합니다.
  const cleaned = text.replace(/[‎‏‪-‮⁦-⁩]/g, "");
  const stamps = cleaned.match(/\d{1,2}:\d{2}(:\d{2})?/g) ?? [];
  const stripped = cleaned
    .replace(/\d{1,2}:\d{2}(:\d{2})?/g, "")
    .replace(/[\s,·]/g, "");
  return stamps.length >= 3 && stripped.length <= 3;
}

function pickComments(
  pool: HypeCommentInput[],
  limit: number,
  near?: number,
): HypeComment[] {
  return dedupeComments(
    pool
      // 나열형은 읽을 내용이 없어 인용하지 않습니다. 언급 수에는 그대로 남습니다.
      .filter((c) => !isTimestampDump(c.text))
      .sort((a, b) => {
        const d = hypeScore(b.text, b.likeCount) - hypeScore(a.text, a.likeCount);
        if (d !== 0) return d;
        return b.likeCount - a.likeCount;
      })
      .map((c) => toHypeComment(c, near)),
  ).slice(0, limit);
}

/**
 * 열광 지점을 만듭니다.
 * heatmap 피크와 댓글 타임스탬프 군집을 각각 후보로 올린 뒤,
 * 겹치는 것은 하나로 합치고 (재생 강도 + 댓글 언급량)으로 순위를 매깁니다.
 */
export function buildHypeMoments({
  comments,
  heatmap,
  durationSeconds,
  maxMoments = 6,
  edits = [],
}: {
  comments: HypeCommentInput[];
  heatmap: HeatSegment[];
  durationSeconds: number;
  maxMoments?: number;
  /** 사용자가 직접 손댄 지점(추가·설명·숨김). 자동 탐지 결과 위에 덮어씁니다. */
  edits?: MomentEdit[];
}): HypeMoment[] {
  const normalized = normalizeSegments(heatmap);
  // 90초짜리 트레일러에서 12초 간격은 너무 성깁니다. 길이에 맞춰 조정합니다.
  const separation = Math.max(4, Math.min(12, Math.round(durationSeconds / 12)));
  // 영상 맨 앞은 모든 시청자가 반드시 지나가므로 어떤 영상에서든 최대치가 됩니다.
  // 재생 시작 아티팩트일 뿐 열광 지점이 아니라서 후보에서 뺍니다.
  const INTRO_ARTIFACT_SEC = 2;
  const peaks = findHeatPeaks(
    normalized.filter((s) => s.endTime > INTRO_ARTIFACT_SEC),
    { topN: maxMoments + 2, minSeparationSec: separation },
  );

  const mentions = comments.flatMap((c) =>
    c.timestamps.map((seconds) => ({ seconds, weight: likeWeight(c.likeCount) })),
  );
  const clusters = clusterTimestamps(mentions, { binSize: 4, durationSeconds });

  interface Candidate {
    startSec: number;
    endSec: number;
    heat: number | null;
    mentionCount: number;
    likeWeighted: number;
    fromHeat: boolean;
  }

  const candidates: Candidate[] = peaks.map((p) => ({
    startSec: Math.max(0, Math.floor(p.startTime)),
    endSec: Math.min(durationSeconds, Math.ceil(p.endTime)),
    heat: p.value,
    mentionCount: 0,
    likeWeighted: 0,
    fromHeat: true,
  }));

  // 히트맵 피크가 없는 곳에 댓글만 몰려 있으면 그것도 후보로 올립니다.
  for (const cl of clusters) {
    const center = (cl.startSec + cl.endSec) / 2;
    const covered = candidates.some(
      (c) => center >= c.startSec - separation / 2 && center <= c.endSec + separation / 2,
    );
    if (!covered) {
      candidates.push({
        startSec: cl.startSec,
        endSec: Math.min(durationSeconds, cl.endSec),
        heat: heatOverRange(normalized, cl.startSec - 2, cl.endSec + 2),
        mentionCount: 0,
        likeWeighted: 0,
        fromHeat: false,
      });
    }
  }

  // 히트맵 한 칸은 1초 미만이라 그대로 쓰면 "지점"이라기엔 너무 좁습니다.
  // 중심을 기준으로 최소 폭까지만 넓힙니다.
  const MIN_WINDOW_SEC = 4;
  const padded = candidates.map((c) => {
    const width = c.endSec - c.startSec;
    if (width >= MIN_WINDOW_SEC) return c;
    const center = (c.startSec + c.endSec) / 2;
    return {
      ...c,
      startSec: Math.max(0, Math.round(center - MIN_WINDOW_SEC / 2)),
      endSec: Math.min(durationSeconds, Math.round(center + MIN_WINDOW_SEC / 2)),
    };
  });

  // 근거 댓글은 확정된 구간에서 한 번만 계산합니다. 순위와 화면 표시가
  // 서로 다른 값으로 갈리지 않도록 여기서 나온 값만 씁니다.
  // 경계는 [start-2, end+2)로 잡아 인접 지점이 같은 댓글을 나눠 갖지 않게 합니다.
  const withMembers = padded.map((c) => {
    const members = comments.filter((cm) =>
      cm.timestamps.some((t) => t >= c.startSec - 2 && t < c.endSec + 2),
    );
    return {
      ...c,
      members,
      mentionCount: members.length,
      likeWeighted: members.reduce((sum, cm) => sum + likeWeight(cm.likeCount), 0),
    };
  });

  const autoMaxWeight = Math.max(...withMembers.map((c) => c.likeWeighted), 0.0001);

  const ranked = withMembers
    .map((c) => ({
      ...c,
      score: 0.65 * (c.heat ?? 0) + 0.35 * (c.likeWeighted / autoMaxWeight),
    }))
    .sort((a, b) => b.score - a.score);

  // 상위 지점과 겹치는 하위 후보는 같은 장면이므로 버립니다.
  const selected: typeof ranked = [];
  for (const c of ranked) {
    if (selected.length >= maxMoments) break;
    const overlaps = selected.some((s) => c.startSec < s.endSec && c.endSec > s.startSec);
    if (!overlaps) selected.push(c);
  }

  // ── 사용자가 손댄 내용 반영 ────────────────────────────────────────────────
  // 자동 탐지는 그대로 두고, 그 위에 설명/숨김을 덮고 직접 지정한 구간을 더합니다.
  const overlapsRange = (
    a: { startSec: number; endSec: number },
    b: { startSec: number; endSec: number },
  ) => a.startSec < b.endSec && a.endSec > b.startSec;

  const autoEdits = edits.filter((e) => e.origin === "auto");
  const manualEdits = edits.filter((e) => e.origin === "manual" && !e.hidden);

  type Built = {
    startSec: number;
    endSec: number;
    heat: number | null;
    members: HypeCommentInput[];
    mentionCount: number;
    likeWeighted: number;
    fromHeat: boolean;
    origin: "auto" | "manual";
    description: string | null;
    editId: string | null;
  };

  const autoBuilt: Built[] = selected
    .map((c) => {
      const edit = autoEdits.find((e) => overlapsRange(e, c));
      return {
        ...c,
        origin: "auto" as const,
        description: edit?.description ?? null,
        editId: edit?.id ?? null,
        hidden: edit?.hidden ?? false,
      };
    })
    .filter((c) => !c.hidden)
    // 사용자가 직접 지정한 구간과 겹치면 사용자 쪽을 남깁니다 — 같은 장면이
    // 자동/수동으로 두 번 뜨는 것을 막습니다.
    .filter((c) => !manualEdits.some((m) => overlapsRange(m, c)));

  const manualBuilt: Built[] = manualEdits.map((e) => {
    const startSec = Math.max(0, Math.min(e.startSec, durationSeconds));
    const endSec = Math.max(startSec + 1, Math.min(e.endSec, durationSeconds));
    const members = comments.filter((cm) =>
      cm.timestamps.some((t) => t >= startSec - 2 && t < endSec + 2),
    );
    return {
      startSec,
      endSec,
      heat: heatOverRange(normalized, startSec, endSec),
      members,
      mentionCount: members.length,
      likeWeighted: members.reduce((sum, cm) => sum + likeWeight(cm.likeCount), 0),
      fromHeat: false,
      origin: "manual" as const,
      description: e.description,
      editId: e.id,
    };
  });

  const combined = [...autoBuilt, ...manualBuilt];
  const maxWeight = Math.max(...combined.map((c) => c.likeWeighted), 0.0001);

  return combined
    .map((c) => ({
      ...c,
      score: 0.65 * (c.heat ?? 0) + 0.35 * (c.likeWeighted / maxWeight),
    }))
    .sort((a, b) => b.score - a.score)
    .map((c, i) => {
      const topicCounter = new Map<Topic, number>();
      for (const cm of c.members) {
        for (const t of cm.topics) {
          if (t === "other") continue;
          topicCounter.set(t, (topicCounter.get(t) ?? 0) + 1);
        }
      }

      const evidence: MomentEvidence =
        c.origin === "manual"
          ? "manual"
          : c.fromHeat && c.members.length > 0
            ? "both"
            : c.fromHeat
              ? "heatmap"
              : "comments";

      return {
        rank: i + 1,
        startSec: c.startSec,
        endSec: c.endSec,
        heat: c.heat,
        mentionCount: c.mentionCount,
        likeWeighted: c.likeWeighted,
        topics: [...topicCounter.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([t]) => t),
        evidence,
        origin: c.origin,
        description: c.description,
        editId: c.editId,
        // 근거는 자르지 않고 전부 담습니다. 화면에서 접었다 펼칩니다.
        comments: pickComments(c.members, Number.POSITIVE_INFINITY, (c.startSec + c.endSec) / 2),
      };
    });
}

/** 시점과 무관하게, 사람들이 "무엇에" 반응했는지를 유형별로 묶습니다. */
export function buildReactionGroups(comments: HypeCommentInput[]): {
  groups: ReactionGroup[];
  topReactions: HypeComment[];
  unclassifiedCount: number;
} {
  const buckets = new Map<ReactionKind, HypeCommentInput[]>();
  let unclassifiedCount = 0;

  for (const c of comments) {
    const kinds = detectReactions(c.text);
    if (kinds.length === 0) {
      unclassifiedCount += 1;
      continue;
    }
    for (const k of kinds) {
      const arr = buckets.get(k) ?? [];
      arr.push(c);
      buckets.set(k, arr);
    }
  }

  const total = comments.length || 1;
  const groups = REACTION_KINDS.map((kind) => {
    const pool = buckets.get(kind) ?? [];
    return {
      kind,
      count: pool.length,
      share: pool.length / total,
      examples: pickComments(pool, 4),
    };
  })
    .filter((g) => g.count > 0)
    .sort((a, b) => b.count - a.count);

  const topReactions = pickComments(comments, 8);

  return { groups, topReactions, unclassifiedCount };
}

/**
 * 시점을 언급한 댓글을 전부 모아 시간순으로 돌려줍니다.
 * 어느 열광 지점에도 붙지 않은 댓글까지 포함합니다 — 근거가 적을 때
 * "왜 적은지"를 화면에서 그대로 보여주기 위해서입니다.
 */
export function collectTimestampedComments(comments: HypeCommentInput[]): {
  list: HypeComment[];
  coverage: NonNullable<HypeReport["timestampCoverage"]>;
} {
  const withTimestamp = comments.filter((c) => c.timestamps.length > 0);
  const timestampOnly = withTimestamp.filter((c) => isTimestampDump(c.text));
  const quotable = withTimestamp.filter((c) => !isTimestampDump(c.text));

  const list = dedupeComments(
    quotable
      .map((c) => toHypeComment(c))
      .sort((a, b) => (a.timestampSec ?? 0) - (b.timestampSec ?? 0)),
  );

  return {
    list,
    coverage: {
      total: withTimestamp.length,
      quotable: list.length,
      timestampOnly: timestampOnly.length,
      collected: comments.length,
    },
  };
}

export function buildHypeReport({
  comments,
  heatmap,
  durationSeconds,
  edits = [],
}: {
  comments: HypeCommentInput[];
  heatmap: HeatSegment[];
  durationSeconds: number;
  edits?: MomentEdit[];
}): HypeReport {
  const { groups, topReactions, unclassifiedCount } = buildReactionGroups(comments);
  const { list, coverage } = collectTimestampedComments(comments);
  return {
    moments: buildHypeMoments({ comments, heatmap, durationSeconds, edits }),
    topReactions,
    groups,
    unclassifiedCount,
    hiddenMoments: edits
      .filter((e) => e.hidden)
      .map((e) => ({ id: e.id, startSec: e.startSec, endSec: e.endSec })),
    timestampedComments: list,
    timestampCoverage: coverage,
  };
}
