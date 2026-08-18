// YouTube comments adapter: full commentThreads pagination + missing-reply
// backfill via comments.list + dedupe. Supports resuming from a pageToken.

import { ytGet, YouTubeApiError } from "@/lib/youtube/client";
import type { RawComment } from "@/lib/types";
import { stripHtmlToText } from "@/lib/analysis/normalize";

interface ThreadSnippetComment {
  id: string;
  snippet: {
    authorDisplayName?: string;
    authorChannelId?: { value?: string };
    textDisplay?: string;
    textOriginal?: string;
    likeCount?: number;
    publishedAt?: string;
    updatedAt?: string;
    parentId?: string;
  };
}

interface CommentThreadsResponse {
  items: {
    id: string;
    snippet: {
      totalReplyCount: number;
      topLevelComment: ThreadSnippetComment;
    };
    replies?: { comments: ThreadSnippetComment[] };
  }[];
  nextPageToken?: string;
}

interface CommentsListResponse {
  items: ThreadSnippetComment[];
  nextPageToken?: string;
}

function toRawComment(c: ThreadSnippetComment, parentId: string | null): RawComment {
  const s = c.snippet;
  return {
    id: c.id,
    parentId,
    authorDisplayName: s.authorDisplayName ?? "",
    authorChannelId: s.authorChannelId?.value ?? null,
    // textOriginal is plain text when available; textDisplay is HTML.
    textOriginal: s.textOriginal ?? stripHtmlToText(s.textDisplay ?? ""),
    likeCount: s.likeCount ?? 0,
    publishedAt: s.publishedAt ?? new Date(0).toISOString(),
    updatedAt: s.updatedAt ?? s.publishedAt ?? new Date(0).toISOString(),
    isReply: parentId != null,
  };
}

/** Fetches every public reply of a thread via comments.list pagination. */
export async function fetchAllReplies(
  parentId: string,
  signal?: AbortSignal,
): Promise<RawComment[]> {
  const replies: RawComment[] = [];
  let pageToken: string | undefined;
  do {
    const data = await ytGet<CommentsListResponse>(
      "comments",
      {
        part: "snippet",
        parentId,
        maxResults: 100,
        pageToken,
        textFormat: "plainText",
      },
      { signal },
    );
    for (const item of data.items ?? []) {
      replies.push(toRawComment(item, parentId));
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return replies;
}

export interface CollectPageResult {
  /** Deduped comments of this page (top-level + all replies). */
  comments: RawComment[];
  nextPageToken: string | null;
  /** Thread ids on this page whose replies were incomplete and backfilled. */
  backfilledThreads: number;
  /** Threads whose reply backfill was skipped due to maxRepliesPerThread. */
  skippedReplyThreads: number;
}

export interface CollectPageOptions {
  signal?: AbortSignal;
  /** "time" (newest first, default) or "relevance" (top comments). */
  order?: "time" | "relevance";
  /**
   * Sample mode guard: threads declaring more replies than this keep only the
   * embedded replies instead of backfilling everything (a single mega-thread
   * can carry tens of thousands of replies). Full mode leaves this unset.
   */
  maxRepliesPerThread?: number;
}

/**
 * Collects one page (up to 100 threads) of top-level comments plus ALL public
 * replies. When `totalReplyCount` differs from the number of replies embedded
 * in the thread payload, the missing replies are fetched with comments.list.
 */
export async function collectCommentPage(
  videoId: string,
  pageToken?: string | null,
  opts: CollectPageOptions = {},
): Promise<CollectPageResult> {
  const { signal, order = "time", maxRepliesPerThread } = opts;
  const data = await ytGet<CommentThreadsResponse>(
    "commentThreads",
    {
      part: "snippet,replies",
      videoId,
      maxResults: 100,
      order,
      textFormat: "plainText",
      pageToken: pageToken ?? undefined,
    },
    { signal },
  );

  const byId = new Map<string, RawComment>();
  let backfilledThreads = 0;
  let skippedReplyThreads = 0;

  for (const thread of data.items ?? []) {
    const top = toRawComment(thread.snippet.topLevelComment, null);
    byId.set(top.id, top);

    const embedded = thread.replies?.comments ?? [];
    for (const reply of embedded) {
      const raw = toRawComment(reply, reply.snippet.parentId ?? top.id);
      byId.set(raw.id, raw);
    }

    // The thread payload embeds at most a handful of replies; when the declared
    // count is larger, fetch the full reply list.
    if (thread.snippet.totalReplyCount > embedded.length) {
      if (
        maxRepliesPerThread != null &&
        thread.snippet.totalReplyCount > maxRepliesPerThread
      ) {
        skippedReplyThreads += 1;
        continue;
      }
      backfilledThreads += 1;
      const all = await fetchAllReplies(top.id, signal);
      for (const reply of all) {
        byId.set(reply.id, reply);
      }
    }
  }

  return {
    comments: [...byId.values()],
    nextPageToken: data.nextPageToken ?? null,
    backfilledThreads,
    skippedReplyThreads,
  };
}

export function isCommentsDisabledError(e: unknown): boolean {
  return e instanceof YouTubeApiError && e.reason === "commentsDisabled";
}

export { YouTubeApiError };
