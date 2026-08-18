// Shared domain types for TrailerLens.

export type AnalysisMode = "quick" | "sample" | "full" | "owner";

export const MODE_LABELS_KO: Record<AnalysisMode, string> = {
  quick: "빠른 분석",
  sample: "통계 표본 분석",
  full: "전체 댓글 심층 분석",
  owner: "채널 소유자 분석",
};

export type AnalysisStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "canceling"
  | "canceled";

export type Sentiment = "positive" | "neutral" | "negative" | "mixed";

export const SENTIMENTS: Sentiment[] = [
  "positive",
  "neutral",
  "negative",
  "mixed",
];

export const EMOTIONS = [
  "excitement",
  "admiration",
  "curiosity",
  "nostalgia",
  "concern",
  "disappointment",
  "humor",
  "controversy",
] as const;
export type Emotion = (typeof EMOTIONS)[number];

export const TOPICS = [
  "purchase_intent",
  "character_design",
  "combat_gameplay",
  "music_ost",
  "visual_quality",
  "world_building",
  "story_lore",
  "franchise_identity",
  "developer_support",
  "creative_independence",
  "fanservice",
  "cultural_reference",
  "platform_release",
  "censorship",
  "ai_concern",
  "existing_character_absence",
  "other",
] as const;
export type Topic = (typeof TOPICS)[number];

export const TOPIC_LABELS_KO: Record<Topic, string> = {
  purchase_intent: "구매 의사",
  character_design: "캐릭터 디자인",
  combat_gameplay: "전투/게임플레이",
  music_ost: "음악/OST",
  visual_quality: "그래픽/비주얼",
  world_building: "세계관",
  story_lore: "스토리/설정",
  franchise_identity: "프랜차이즈 정체성",
  developer_support: "개발사 응원",
  creative_independence: "창작 독립성",
  fanservice: "팬서비스",
  cultural_reference: "문화적 레퍼런스",
  platform_release: "플랫폼/출시",
  censorship: "검열",
  ai_concern: "AI 사용 의혹",
  existing_character_absence: "기존 캐릭터 부재",
  other: "기타",
};

export const CONTROVERSY_TOPICS: Topic[] = [
  "character_design",
  "existing_character_absence",
  "censorship",
  "platform_release",
  "ai_concern",
  "story_lore",
];

export type LanguageCode = "ko" | "en" | "ja" | "zh" | "ru" | "other";

export interface VideoMeta {
  id: string;
  title: string;
  channelId: string;
  channelTitle: string;
  thumbnailUrl: string;
  durationSeconds: number;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  publishedAt: string | null; // ISO string
  isMock: boolean;
}

/** A comment as collected from YouTube (HTML already stripped to plain text). */
export interface RawComment {
  id: string;
  parentId: string | null;
  authorDisplayName: string;
  authorChannelId: string | null;
  textOriginal: string;
  likeCount: number;
  publishedAt: string; // ISO
  updatedAt: string; // ISO
  isReply: boolean;
}

export type HeatmapSource = "owner" | "manual" | "ytdlp" | "mock";

export interface HeatSegment {
  startTime: number;
  endTime: number;
  /** Normalized relative intensity 0..1. NOT viewer counts or retention %. */
  value: number;
}

export interface HeatPeak extends HeatSegment {
  rank: number;
}

/** Structured result of Claude's per-comment analysis. */
export interface CommentAnalysisResult {
  commentId: string;
  sentiment: Sentiment;
  emotions: Emotion[];
  topics: Topic[];
  mentionedCharacters: string[];
  mentionedGamesOrMedia: string[];
  mentionedTimestampSeconds: number[];
  impressiveReason: string | null;
  concernReason: string | null;
  confidence: number; // 0..1
}

export interface TopicStat {
  topic: Topic;
  count: number;
  share: number; // count / analyzed total
  likeWeighted: number;
  likeWeightedShare: number;
  positiveShare: number;
  negativeShare: number;
  relatedTimestamps: number[];
}

export interface StatsVariant {
  totalComments: number;
  topLevelCount: number;
  replyCount: number;
  uniqueAuthors: number;
  languageShares: Record<string, number>; // language -> count
  duplicateCount: number;
  shortOrEmojiCount: number;
  sentimentCounts: Record<Sentiment, number>;
  emotionCounts: Record<string, number>;
  topics: TopicStat[];
  timestampMentionCount: number;
  likeTotal: number;
  avgLikesPerComment: number;
  commentsPerDay: { date: string; count: number }[];
  analyzedCount: number;
}

export interface SceneInfo {
  id: string;
  rank: number;
  startSec: number;
  endSec: number;
  mentionCount: number;
  likeWeighted: number;
  heatIntensity: number | null;
  topics: Topic[];
  summary: string | null;
  description: string | null;
  reason: string | null;
}

// ── 열광 지점 (Hype) ─────────────────────────────────────────────────────────

export const REACTION_KINDS = [
  "awe",
  "replay",
  "anticipation",
  "purchase",
  "nostalgia",
  "humor",
  "critique",
] as const;
export type ReactionKind = (typeof REACTION_KINDS)[number];

export const REACTION_LABELS_KO: Record<ReactionKind, string> = {
  awe: "감탄 · 소름",
  replay: "반복 시청",
  anticipation: "기대 · 기다림",
  purchase: "구매 의사",
  nostalgia: "추억 · 향수",
  humor: "웃음 · 드립",
  critique: "아쉬움 · 지적",
};

export const REACTION_DESCRIPTIONS_KO: Record<ReactionKind, string> = {
  awe: "소름, 미쳤다, goosebumps, insane 같이 강한 감탄을 직접 드러낸 댓글",
  replay: "몇 번씩 다시 봤다고 밝힌 댓글",
  anticipation: "출시를 기다린다고 말한 댓글",
  purchase: "사겠다, 예약했다처럼 구매 의사를 밝힌 댓글",
  nostalgia: "전작이나 과거 경험을 떠올린 댓글",
  humor: "농담, 밈, 웃음 표현이 중심인 댓글",
  critique: "실망, 우려, 비판을 표현한 댓글",
};

export interface HypeComment {
  id: string;
  author: string;
  text: string;
  likeCount: number;
  /** 이 댓글이 직접 적은 시점(초). 없으면 null. */
  timestampSec: number | null;
  reactions: ReactionKind[];
}

/** 이 구간이 무엇을 근거로 뽑혔는지. */
export type MomentEvidence = "heatmap" | "comments" | "both";

export interface HypeMoment {
  rank: number;
  startSec: number;
  endSec: number;
  /** 유튜브 최다 재생 상대 강도 0~1. heatmap이 없으면 null. */
  heat: number | null;
  /** 이 구간을 직접 언급한 댓글 수. */
  mentionCount: number;
  likeWeighted: number;
  topics: Topic[];
  evidence: MomentEvidence;
  comments: HypeComment[];
}

export interface ReactionGroup {
  kind: ReactionKind;
  count: number;
  /** 분석 대상 댓글 중 비율 0~1. */
  share: number;
  examples: HypeComment[];
}

export interface HypeReport {
  moments: HypeMoment[];
  /** 시점과 무관하게 열광 강도가 가장 높은 댓글들. */
  topReactions: HypeComment[];
  groups: ReactionGroup[];
  /** 반응 유형이 하나도 잡히지 않은 댓글 수. */
  unclassifiedCount: number;
  /**
   * 영상 시점을 언급한 댓글 전체. 어느 열광 지점에도 붙지 않은 것까지 포함해
   * 시간순으로 정렬합니다.
   */
  timestampedComments?: HypeComment[];
  /** 시점 언급 댓글 집계. 왜 근거가 적은지 화면에서 설명하기 위한 값입니다. */
  timestampCoverage?: {
    /** 시점을 언급한 댓글 수(나열형 포함). */
    total: number;
    /** 그중 읽을 내용이 있어 인용 가능한 댓글 수. */
    quotable: number;
    /** 타임스탬프만 나열해 인용에서 제외한 댓글 수. */
    timestampOnly: number;
    /** 분석 대상 전체 댓글 수. */
    collected: number;
  };
}

export interface ControversyStat {
  topic: Topic;
  count: number;
  share: number;
  likeWeighted: number;
  positiveShare: number;
  negativeShare: number;
  summary: string | null;
}

export interface CollectionInfo {
  collectedTotal: number;
  topLevel: number;
  replies: number;
  displayedByYouTube: number | null;
  notices: string[];
}

export interface Report {
  generatedAt: string;
  mode: AnalysisMode;
  video: VideoMeta;
  collection: CollectionInfo;
  conclusion: string;
  completeness: string[];
  heatmap: {
    source: HeatmapSource | "none";
    segments: HeatSegment[];
    peaks: HeatPeak[];
    disclaimer: string;
  };
  scenes: SceneInfo[];
  /** 열광 지점 + 반응 유형. 이전 버전 보고서에는 없을 수 있습니다. */
  hype?: HypeReport;
  stats: {
    raw: StatsVariant;
    cleaned: StatsVariant;
  };
  topicSummaries: Partial<Record<Topic, string>>;
  controversy: ControversyStat[];
}

/** Analysis progress steps shown in the UI (1-based). */
export const ANALYSIS_STEPS = [
  "영상 확인",
  "댓글 수집",
  "답글 수집",
  "언어 및 중복 분석",
  "Claude 배치 분석",
  "장면 연결",
  "보고서 생성",
] as const;

export interface AnalysisStatusPayload {
  id: string;
  videoId: string;
  mode: AnalysisMode;
  status: AnalysisStatus;
  currentStep: number;
  stepProgress: number;
  error: string | null;
  failedStep: number | null;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  video: VideoMeta | null;
  report: Report | null;
}
