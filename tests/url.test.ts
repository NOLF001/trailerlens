import { describe, expect, it } from "vitest";
import { extractVideoId, isValidVideoId } from "@/lib/youtube/url";

describe("extractVideoId", () => {
  const ID = "dQw4w9WgXcQ";

  it.each([
    [`https://www.youtube.com/watch?v=${ID}`, ID],
    [`http://youtube.com/watch?v=${ID}&t=42s`, ID],
    [`https://m.youtube.com/watch?v=${ID}`, ID],
    [`https://youtu.be/${ID}`, ID],
    [`https://youtu.be/${ID}?si=abc123`, ID],
    [`https://www.youtube.com/shorts/${ID}`, ID],
    [`https://www.youtube.com/embed/${ID}`, ID],
    [`https://www.youtube.com/live/${ID}`, ID],
    [`https://www.youtube.com/v/${ID}`, ID],
    [`https://music.youtube.com/watch?v=${ID}&list=RD123`, ID],
    [`www.youtube.com/watch?v=${ID}`, ID], // no protocol
    [ID, ID], // bare id
  ])("extracts from %s", (input, expected) => {
    expect(extractVideoId(input)).toBe(expected);
  });

  it.each([
    "",
    "not a url",
    "https://example.com/watch?v=dQw4w9WgXcQ", // wrong host
    "https://www.youtube.com/watch?v=short", // invalid id length
    "https://www.youtube.com/playlist?list=PL123", // no video id
    "https://youtu.be/", // empty path
    "dQw4w9WgXc", // 10 chars
    "dQw4w9WgXcQQ", // 12 chars
  ])("rejects %s", (input) => {
    expect(extractVideoId(input)).toBeNull();
  });

  it("validates raw ids", () => {
    expect(isValidVideoId("dQw4w9WgXcQ")).toBe(true);
    expect(isValidVideoId("invalid id!")).toBe(false);
  });
});
