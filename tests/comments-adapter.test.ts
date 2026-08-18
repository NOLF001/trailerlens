// Comments adapter: pagination, missing-reply backfill, dedupe.
// Uses a stubbed global fetch — no network.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function thread(id: string, totalReplyCount: number, embedded: string[]) {
  return {
    id,
    snippet: {
      totalReplyCount,
      topLevelComment: {
        id,
        snippet: {
          authorDisplayName: `user-${id}`,
          authorChannelId: { value: `UC-${id}` },
          textOriginal: `top comment ${id}`,
          likeCount: 10,
          publishedAt: "2026-08-01T00:00:00Z",
          updatedAt: "2026-08-01T00:00:00Z",
        },
      },
    },
    replies: {
      comments: embedded.map((rid) => ({
        id: rid,
        snippet: {
          authorDisplayName: `user-${rid}`,
          textOriginal: `reply ${rid}`,
          likeCount: 1,
          publishedAt: "2026-08-02T00:00:00Z",
          updatedAt: "2026-08-02T00:00:00Z",
          parentId: id,
        },
      })),
    },
  };
}

function reply(id: string, parentId: string) {
  return {
    id,
    snippet: {
      authorDisplayName: `user-${id}`,
      textOriginal: `reply ${id}`,
      likeCount: 1,
      publishedAt: "2026-08-02T00:00:00Z",
      updatedAt: "2026-08-02T00:00:00Z",
      parentId,
    },
  };
}

describe("collectCommentPage", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.YOUTUBE_API_KEY = "test-key";
    delete process.env.MOCK_MODE;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("collects top-level + embedded replies, backfills missing replies, dedupes, and paginates", async () => {
    const calls: string[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        calls.push(url.pathname + "?" + url.searchParams.toString());

        if (url.pathname.endsWith("/commentThreads")) {
          const pageToken = url.searchParams.get("pageToken");
          if (!pageToken) {
            return Response.json({
              // t1 declares 4 replies but embeds only 2 → backfill via comments.list
              items: [thread("t1", 4, ["r1", "r2"]), thread("t2", 0, [])],
              nextPageToken: "PAGE2",
            });
          }
          return Response.json({ items: [thread("t3", 0, [])] });
        }

        if (url.pathname.endsWith("/comments")) {
          const parentId = url.searchParams.get("parentId");
          expect(parentId).toBe("t1");
          const pageToken = url.searchParams.get("pageToken");
          if (!pageToken) {
            // includes r1/r2 again (dedupe) + r3, second page carries r4
            return Response.json({
              items: [reply("r1", "t1"), reply("r2", "t1"), reply("r3", "t1")],
              nextPageToken: "RPAGE2",
            });
          }
          return Response.json({ items: [reply("r4", "t1")] });
        }

        return new Response("not found", { status: 404 });
      }),
    );

    const { collectCommentPage } = await import("@/lib/youtube/comments");

    const page1 = await collectCommentPage("videoabcdef");
    const ids = page1.comments.map((c) => c.id).sort();
    expect(ids).toEqual(["r1", "r2", "r3", "r4", "t1", "t2"]); // deduped
    expect(page1.nextPageToken).toBe("PAGE2");
    expect(page1.backfilledThreads).toBe(1);

    const replies = page1.comments.filter((c) => c.isReply);
    expect(replies).toHaveLength(4);
    expect(new Set(replies.map((r) => r.parentId))).toEqual(new Set(["t1"]));

    // resume from the checkpointed page token
    const page2 = await collectCommentPage("videoabcdef", page1.nextPageToken);
    expect(page2.comments.map((c) => c.id)).toEqual(["t3"]);
    expect(page2.nextPageToken).toBeNull();

    // replies pagination hit both pages of comments.list
    const replyCalls = calls.filter((c) => c.includes("/comments?"));
    expect(replyCalls).toHaveLength(2);
  });

  it("classifies commentsDisabled errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: { code: 403, errors: [{ reason: "commentsDisabled" }] } },
          { status: 403 },
        ),
      ),
    );

    const { collectCommentPage, isCommentsDisabledError } = await import(
      "@/lib/youtube/comments"
    );

    try {
      await collectCommentPage("videoabcdef");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(isCommentsDisabledError(e)).toBe(true);
    }
  });

  it("retries transient 500s with backoff and eventually succeeds", async () => {
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        n += 1;
        if (n < 3) return new Response("oops", { status: 500 });
        return Response.json({ items: [thread("t1", 0, [])] });
      }),
    );

    const { collectCommentPage } = await import("@/lib/youtube/comments");
    const page = await collectCommentPage("videoabcdef");
    expect(page.comments).toHaveLength(1);
    expect(n).toBe(3);
  }, 40_000);
});
