// Assembles the final report payload stored on the Analysis row.

import type {
  AnalysisMode,
  CollectionInfo,
  ControversyStat,
  HeatPeak,
  HeatSegment,
  HeatmapSource,
  HypeReport,
  Report,
  SceneInfo,
  StatsVariant,
  Topic,
  VideoMeta,
} from "@/lib/types";
import { CONTROVERSY_TOPICS } from "@/lib/types";
import type { NarrativeResult } from "@/lib/analysis/claude";

export const HEATMAP_DISCLAIMERS: Record<HeatmapSource | "none", string> = {
  owner:
    "채널 소유자 YouTube Analytics 데이터 기반. 값은 구간별 상대 시청 강도(0~1)로 정규화되었으며 절대 시청자 수가 아닙니다.",
  manual:
    "사용자가 직접 업로드한 히트맵 데이터입니다. 값은 정규화된 상대 강도(0~1)이며 시청자 수나 유지율 퍼센트가 아닙니다.",
  ytdlp:
    "비공식 공개 히트맵 데이터(실험적 yt-dlp 어댑터). 값은 정규화된 상대 강도(0~1)이며 실제 시청자 유지율 데이터가 아닙니다. 이용약관 및 배포 환경을 검토하세요.",
  mock: "합성 데모 데이터입니다. 실제 시청 데이터가 아닙니다.",
  none: "반복 재생 데이터가 없습니다. 채널 소유자 로그인, 수동 업로드 또는 실험적 로컬 모드로 추가할 수 있습니다.",
};

export function buildControversy(
  stats: StatsVariant,
  summaries: Partial<Record<Topic, string>>,
): ControversyStat[] {
  return stats.topics
    .filter((t) => CONTROVERSY_TOPICS.includes(t.topic))
    .map((t) => ({
      topic: t.topic,
      count: t.count,
      share: t.share,
      likeWeighted: t.likeWeighted,
      positiveShare: t.positiveShare,
      negativeShare: t.negativeShare,
      summary: summaries[t.topic] ?? null,
    }));
}

export function buildReportPayload(args: {
  mode: AnalysisMode;
  video: VideoMeta;
  collection: CollectionInfo;
  statsRaw: StatsVariant;
  statsCleaned: StatsVariant;
  scenes: SceneInfo[];
  hype: HypeReport;
  heatmapSource: HeatmapSource | "none";
  heatmapSegments: HeatSegment[];
  heatmapPeaks: HeatPeak[];
  narratives: NarrativeResult;
  completeness: string[];
}): Report {
  const topicSummaries: Partial<Record<Topic, string>> = {};
  for (const t of args.narratives.topicSummaries) {
    topicSummaries[t.topic] = t.summary;
  }
  const controversySummaries: Partial<Record<Topic, string>> = {};
  for (const c of args.narratives.controversySummaries) {
    controversySummaries[c.topic] = c.summary;
  }

  return {
    generatedAt: new Date().toISOString(),
    mode: args.mode,
    video: args.video,
    collection: args.collection,
    conclusion: args.narratives.conclusion,
    completeness: args.completeness,
    heatmap: {
      source: args.heatmapSource,
      segments: args.heatmapSegments,
      peaks: args.heatmapPeaks,
      disclaimer: HEATMAP_DISCLAIMERS[args.heatmapSource],
    },
    scenes: args.scenes,
    hype: args.hype,
    stats: { raw: args.statsRaw, cleaned: args.statsCleaned },
    topicSummaries,
    controversy: buildControversy(args.statsCleaned, controversySummaries),
  };
}
