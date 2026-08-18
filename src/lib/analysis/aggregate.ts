// Deterministic aggregation. Everything here is computed in code — the LLM
// never produces numbers that appear in the report.

import {
  SENTIMENTS,
  TOPICS,
  type Sentiment,
  type StatsVariant,
  type Topic,
  type TopicStat,
} from "@/lib/types";
import { likeWeight } from "@/lib/utils";
import { SPAM_THRESHOLD } from "@/lib/analysis/spam";

/** Pure input shape so the aggregator is trivially unit-testable. */
export interface AggregateComment {
  id: string;
  isReply: boolean;
  authorKey: string;
  likeCount: number;
  publishedAt: string; // ISO
  detectedLanguage: string | null;
  timestamps: number[];
  duplicateGroupId: string | null;
  spamProbability: number | null;
  shortOrEmoji: boolean;
  analyzed: boolean;
  sentiment: Sentiment | null;
  emotions: string[];
  topics: Topic[];
}

/**
 * Removes spam and duplicate copies (keeps the most-liked member per duplicate
 * group). Used for the "cleaned" stats variant.
 */
export function cleanComments(comments: AggregateComment[]): AggregateComment[] {
  const keptPerGroup = new Map<string, AggregateComment>();
  for (const c of comments) {
    if (!c.duplicateGroupId) continue;
    const current = keptPerGroup.get(c.duplicateGroupId);
    if (!current || c.likeCount > current.likeCount) {
      keptPerGroup.set(c.duplicateGroupId, c);
    }
  }

  return comments.filter((c) => {
    if ((c.spamProbability ?? 0) >= SPAM_THRESHOLD) return false;
    if (c.duplicateGroupId && keptPerGroup.get(c.duplicateGroupId)?.id !== c.id) {
      return false;
    }
    return true;
  });
}

export function computeStatsVariant(comments: AggregateComment[]): StatsVariant {
  const analyzed = comments.filter((c) => c.analyzed && c.sentiment);

  const languageShares: Record<string, number> = {};
  const sentimentCounts = Object.fromEntries(
    SENTIMENTS.map((s) => [s, 0]),
  ) as Record<Sentiment, number>;
  const emotionCounts: Record<string, number> = {};
  const authors = new Set<string>();
  const perDay = new Map<string, number>();

  let likeTotal = 0;
  let shortOrEmojiCount = 0;
  let timestampMentionCount = 0;
  let replyCount = 0;

  const duplicateGroups = new Map<string, number>();

  for (const c of comments) {
    authors.add(c.authorKey);
    likeTotal += c.likeCount;
    if (c.isReply) replyCount += 1;
    if (c.shortOrEmoji) shortOrEmojiCount += 1;
    timestampMentionCount += c.timestamps.length;

    const lang = c.detectedLanguage ?? "other";
    languageShares[lang] = (languageShares[lang] ?? 0) + 1;

    const day = c.publishedAt.slice(0, 10);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);

    if (c.duplicateGroupId) {
      duplicateGroups.set(
        c.duplicateGroupId,
        (duplicateGroups.get(c.duplicateGroupId) ?? 0) + 1,
      );
    }
  }

  let duplicateCount = 0;
  for (const size of duplicateGroups.values()) duplicateCount += size - 1;

  for (const c of analyzed) {
    sentimentCounts[c.sentiment as Sentiment] += 1;
    for (const e of c.emotions) emotionCounts[e] = (emotionCounts[e] ?? 0) + 1;
  }

  return {
    totalComments: comments.length,
    topLevelCount: comments.length - replyCount,
    replyCount,
    uniqueAuthors: authors.size,
    languageShares,
    duplicateCount,
    shortOrEmojiCount,
    sentimentCounts,
    emotionCounts,
    topics: computeTopicStats(analyzed),
    timestampMentionCount,
    likeTotal,
    avgLikesPerComment: comments.length > 0 ? likeTotal / comments.length : 0,
    commentsPerDay: [...perDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count })),
    analyzedCount: analyzed.length,
  };
}

export function computeTopicStats(analyzed: AggregateComment[]): TopicStat[] {
  const totalAnalyzed = analyzed.length;
  const totalWeight = analyzed.reduce((sum, c) => sum + likeWeight(c.likeCount), 0);

  const stats: TopicStat[] = [];

  for (const topic of TOPICS) {
    const members = analyzed.filter((c) => c.topics.includes(topic));
    if (members.length === 0) continue;

    const weight = members.reduce((sum, c) => sum + likeWeight(c.likeCount), 0);
    const positive = members.filter((c) => c.sentiment === "positive").length;
    const negative = members.filter((c) => c.sentiment === "negative").length;

    const tsCounter = new Map<number, number>();
    for (const c of members) {
      for (const t of c.timestamps) tsCounter.set(t, (tsCounter.get(t) ?? 0) + 1);
    }
    const relatedTimestamps = [...tsCounter.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([t]) => t)
      .sort((a, b) => a - b);

    stats.push({
      topic,
      count: members.length,
      share: totalAnalyzed > 0 ? members.length / totalAnalyzed : 0,
      likeWeighted: weight,
      likeWeightedShare: totalWeight > 0 ? weight / totalWeight : 0,
      positiveShare: members.length > 0 ? positive / members.length : 0,
      negativeShare: members.length > 0 ? negative / members.length : 0,
      relatedTimestamps,
    });
  }

  return stats.sort((a, b) => b.count - a.count);
}
