// Synthetic mock data so the whole product can be explored without API keys.
// All comments below are invented for a fictional game trailer — nothing is
// copied from real YouTube content.

import type { HeatSegment, RawComment, VideoMeta } from "@/lib/types";

/** Deterministic RNG so the same videoId always produces the same dataset. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const MOCK_DURATION = 222; // 3:42 trailer

export function buildMockVideo(videoId: string): VideoMeta {
  const rand = mulberry32(hashSeed(videoId));
  return {
    id: videoId,
    title: "AURORA FALL — 공식 공개 트레일러 (가상 데모 데이터)",
    channelId: "UC_mock_studio",
    channelTitle: "Nightglass Studio (Mock)",
    thumbnailUrl: "",
    durationSeconds: MOCK_DURATION,
    viewCount: 1_200_000 + Math.floor(rand() * 4_000_000),
    likeCount: 80_000 + Math.floor(rand() * 120_000),
    commentCount: 0, // filled by caller after comments are generated
    publishedAt: new Date(Date.now() - 21 * 24 * 3600 * 1000).toISOString(),
    isMock: true,
  };
}

// Template pool. {ts} placeholders get replaced with a clustered timestamp.
// Fictional characters: 리아(Ria, new protagonist), 카일(Kyle, legacy hero).
const KO_TEMPLATES: string[] = [
  "{ts} 리아가 검 뽑는 장면 소름 돋았다... 백번은 돌려봤음",
  "{ts} 여기 BGM 전환 미쳤다. OST 언제 나오나요",
  "리아 디자인 너무 좋은데? 왜 논란인지 모르겠음",
  "솔직히 리아 디자인은 실망. 원작 분위기랑 너무 다름",
  "카일은 어디 갔나요... 전작 주인공 없는 후속작이라니",
  "{ts} 전투 이펙트 보소. 이건 무조건 산다",
  "그래픽 하나는 인정. 근데 스토리가 걱정되네",
  "발매일만 알려줘 제발. 예약구매 준비 완료",
  "{ts}부터 나오는 도시 배경 세계관 설정 미쳤다",
  "이거 일부 장면 AI로 만든 거 아님? 손가락이 이상한데",
  "PC로도 나오나요? 콘솔 독점이면 웁니다",
  "검열 때문에 우리 지역 버전은 잘릴 것 같아서 불안하다",
  "{ts} 여기서 나오는 대사, 1편 오마주인 거 눈치챈 사람?",
  "음악 담당 작곡가 그대로 가는 거 실화냐. 믿고 듣는다",
  "개발사가 인디 시절 감성 그대로 가져가줬으면",
  "트레일러만 보고 판단하기는 이르지만 기대됨",
  "ㅋㅋㅋㅋㅋㅋㅋ {ts} 고양이 나오는 거 봤음?",
  "와 이건 진짜 미쳤다",
  "기대 반 걱정 반... 전작 팬으로서 지켜본다",
  "{ts} 보스 등장 컷 전율... 스킵 못 함",
];

const EN_TEMPLATES: string[] = [
  "The sword draw at {ts} is pure cinema. I keep replaying it",
  "Whoever composed the track that kicks in at {ts} deserves a raise",
  "Ria's design is gorgeous, I don't get the hate",
  "Not a fan of the new protagonist design tbh, feels off-brand",
  "Where is Kyle though? A sequel without the OG hero is wild",
  "Combat looks crisp. Day one purchase for me",
  "Visuals are stunning but I'm worried about the story",
  "Just give us the release date already",
  "The city reveal at {ts} sold me on the worldbuilding",
  "Some shots look AI generated... look at the hands at {ts}",
  "Please tell me this is coming to PC",
  "Hope the localization doesn't get censored this time",
  "That line at {ts} is a direct callback to the first game, chills",
  "This studio never misses with the soundtrack",
  "Cautiously optimistic. Trailer looks great at least",
  "GOTY incoming",
  "{ts} the cat cameo lmaooo",
  "Absolutely insane trailer",
];

const JA_TEMPLATES: string[] = [
  "{ts} のリアの抜刀シーン、鳥肌立った",
  "{ts} からのBGM最高すぎる",
  "リアのデザイン好きだけどな、何が問題なの",
  "新主人公のデザインはちょっと残念かも",
  "カイルはどこ?前作主人公不在は寂しい",
  "戦闘エフェクトやばい。絶対買う",
  "映像は綺麗だけどストーリーが心配",
  "発売日はよ",
];

type MockLang = "ko" | "en" | "ja";

const REPLY_TEMPLATES: Record<MockLang, string[]> = {
  ko: [
    "ㄹㅇ 인정합니다",
    "이 댓글 때문에 다시 봤네요 ㅋㅋ",
    "원작 안 해봤으면 모를 수도 있음",
    "동감입니다. 저도 그 장면 계속 돌려봄",
    "{ts} 부분부터가 진짜라고 생각함",
    "저는 반대로 좀 아쉬웠어요",
    "이게 맞는 반응이지",
  ],
  en: [
    "Agreed 100%",
    "nah I disagree, the design fits the new setting",
    "sauce? where did you see that",
    "this comment sums it up perfectly",
    "fr the {ts} part is unreal",
    "underrated comment honestly",
  ],
  ja: [
    "それなすぎる",
    "わかる、もう何回も見てる",
    "{ts} のところ本当に最高だった",
    "自分は逆にちょっと微妙だったかも",
  ],
};

const REPLY_SUFFIX: Record<MockLang, string[]> = {
  ko: ["", "", "", " 22", " ㅋㅋ", "!!", "…"],
  en: ["", "", "", " tbh", "!!", " ngl"],
  ja: ["", "", " w", "!!"],
};

const SPAM_TEMPLATES: string[] = [
  "무료 기프트 카드 받아가세요 http://totally-not-spam.example/win",
  "Check out my channel for free v-bucks!!! http://spam.example",
  "주식 리딩방 무료 체험 카톡 ID: mockspam",
];

// Timestamp hotspots for the fictional trailer (seconds).
const HOTSPOTS = [12, 58, 97, 148, 190];

function pick<T>(rand: () => number, arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)]!;
}

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fillTs(rand: () => number, template: string): string {
  if (!template.includes("{ts}")) return template;
  const spot = pick(rand, HOTSPOTS) + Math.floor(rand() * 5) - 2;
  return template.replaceAll("{ts}", fmt(Math.max(0, spot)));
}

export interface MockDataset {
  video: VideoMeta;
  comments: RawComment[];
  heatmap: HeatSegment[];
}

export function buildMockComments(videoId: string): RawComment[] {
  const rand = mulberry32(hashSeed(`${videoId}:comments`));
  const comments: RawComment[] = [];
  const baseTime = Date.now() - 20 * 24 * 3600 * 1000;

  const pools: { lang: MockLang; templates: string[]; share: number }[] = [
    { lang: "ko", templates: KO_TEMPLATES, share: 0.5 },
    { lang: "en", templates: EN_TEMPLATES, share: 0.38 },
    { lang: "ja", templates: JA_TEMPLATES, share: 0.12 },
  ];

  const TOP_LEVEL = 150;
  let counter = 0;

  for (let i = 0; i < TOP_LEVEL; i++) {
    const roll = rand();
    let pool = pools[0]!.templates;
    let lang: MockLang = "ko";
    let acc = 0;
    for (const p of pools) {
      acc += p.share;
      if (roll <= acc) {
        pool = p.templates;
        lang = p.lang;
        break;
      }
    }

    const isSpam = rand() < 0.03;
    const text = isSpam ? pick(rand, SPAM_TEMPLATES) : fillTs(rand, pick(rand, pool));
    // A handful of exact duplicates to exercise dedup.
    const duplicated = !isSpam && rand() < 0.05;
    const finalText = duplicated ? "와 이건 진짜 미쳤다" : text;

    // Comment ids are globally unique on YouTube — namespace mock ids by video.
    const id = `mock-${videoId}-c${counter++}`;
    const publishedAt = new Date(
      baseTime + Math.floor(rand() * 19 * 24 * 3600 * 1000),
    ).toISOString();
    const likeCount = Math.floor(rand() ** 2.2 * 4000);

    comments.push({
      id,
      parentId: null,
      authorDisplayName: `mock_user_${Math.floor(rand() * 4000)}`,
      authorChannelId: `UC_mock_${Math.floor(rand() * 4000)}`,
      textOriginal: finalText,
      likeCount,
      publishedAt,
      updatedAt: publishedAt,
      isReply: false,
    });

    // Replies: popular comments get more.
    const replyCount =
      likeCount > 1500 ? 2 + Math.floor(rand() * 6) : rand() < 0.3 ? 1 + Math.floor(rand() * 2) : 0;
    for (let r = 0; r < replyCount; r++) {
      const rid = `mock-${videoId}-c${counter++}`;
      // Replies mostly follow the parent's language; timestamps never exceed now.
      const replyLang: MockLang =
        rand() < 0.75 ? lang : (["ko", "en", "ja"] as const)[Math.floor(rand() * 3)]!;
      const rPublished = new Date(
        Math.min(
          Date.now(),
          new Date(publishedAt).getTime() + Math.floor(rand() * 3 * 24 * 3600 * 1000),
        ),
      ).toISOString();
      comments.push({
        id: rid,
        parentId: id,
        authorDisplayName: `mock_user_${Math.floor(rand() * 4000)}`,
        authorChannelId: `UC_mock_${Math.floor(rand() * 4000)}`,
        textOriginal:
          fillTs(rand, pick(rand, REPLY_TEMPLATES[replyLang])) +
          pick(rand, REPLY_SUFFIX[replyLang]),
        likeCount: Math.floor(rand() ** 2.5 * 300),
        publishedAt: rPublished,
        updatedAt: rPublished,
        isReply: true,
      });
    }
  }

  return comments;
}

/** Synthetic "most replayed"-style heatmap with bumps on the hotspots. */
export function buildMockHeatmap(videoId: string): HeatSegment[] {
  const rand = mulberry32(hashSeed(`${videoId}:heatmap`));
  const duration = MOCK_DURATION;
  const step = 2;
  const segments: HeatSegment[] = [];

  for (let t = 0; t < duration; t += step) {
    let v = 0.08 + rand() * 0.05;
    for (const spot of HOTSPOTS) {
      const d = Math.abs(t + step / 2 - spot);
      v += Math.exp(-(d * d) / (2 * 36)) * (0.5 + rand() * 0.4);
    }
    segments.push({ startTime: t, endTime: Math.min(duration, t + step), value: v });
  }

  const max = Math.max(...segments.map((s) => s.value));
  return segments.map((s) => ({ ...s, value: s.value / max }));
}

export function buildMockDataset(videoId: string): MockDataset {
  const video = buildMockVideo(videoId);
  const comments = buildMockComments(videoId);
  video.commentCount = comments.length + 3; // mimic "displayed count differs"
  return { video, comments, heatmap: buildMockHeatmap(videoId) };
}
