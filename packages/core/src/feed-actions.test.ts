import { describe, it, expect } from "vitest";
import {
  DEFAULT_FEED_SAVED,
  FEED_SAVED_LIMIT,
  feedMenuActions,
  feedSharePayload,
  feedShareUrl,
  feedSubjectKey,
  isFeedSaved,
  normalizeFeedSaved,
  toggleFeedSaved,
} from "./feed-actions";

describe("saved posts (the bookmark)", () => {
  it("keys off the reaction anchor, not the feed's derived id", () => {
    // The feed is rebuilt on every load and `id` is derived; (subjectType,
    // subjectId) is the pair kudos and comments already anchor to.
    expect(feedSubjectKey({ subjectType: "post", subjectId: "p1" })).toBe("post:p1");
    expect(feedSubjectKey({ subjectType: "session", subjectId: "s1" })).toBe("session:s1");
  });

  it("saves to the FRONT and unsaves cleanly", () => {
    const a = toggleFeedSaved(DEFAULT_FEED_SAVED, "post:1");
    const b = toggleFeedSaved(a, "post:2");
    expect(b.ids).toEqual(["post:2", "post:1"]); // newest first
    expect(isFeedSaved(b, "post:1")).toBe(true);
    expect(toggleFeedSaved(b, "post:1").ids).toEqual(["post:2"]);
  });

  it("is pure — toggling never mutates the state handed in", () => {
    const before = { ids: ["post:1"] };
    toggleFeedSaved(before, "post:2");
    expect(before.ids).toEqual(["post:1"]);
  });

  it("caps the list so a synchronous store can't grow unbounded", () => {
    let s = DEFAULT_FEED_SAVED;
    for (let i = 0; i < FEED_SAVED_LIMIT + 20; i++) s = toggleFeedSaved(s, `post:${i}`);
    expect(s.ids.length).toBe(FEED_SAVED_LIMIT);
    expect(s.ids[0]).toBe(`post:${FEED_SAVED_LIMIT + 19}`); // newest kept
  });

  it("degrades a corrupt blob to 'nothing saved' rather than throwing", () => {
    // Whatever storage hands back — a half-written string, an old shape, null —
    // must never take the feed down on first render.
    expect(normalizeFeedSaved(null)).toEqual(DEFAULT_FEED_SAVED);
    expect(normalizeFeedSaved("nonsense")).toEqual(DEFAULT_FEED_SAVED);
    expect(normalizeFeedSaved({ ids: "post:1" })).toEqual(DEFAULT_FEED_SAVED);
    expect(normalizeFeedSaved({ ids: ["post:1", 7, "", "post:1", "post:2"] }).ids).toEqual(["post:1", "post:2"]);
  });
});

describe("share", () => {
  const item = { subjectType: "post", subjectId: "p 1", author: { displayName: "Ada Ruiz", handle: "ada" } };

  it("links through the shell's own address scheme, url-encoded", () => {
    expect(feedShareUrl(item)).toBe("https://hybrid.app/app?s=feed&post=post%3Ap%201");
  });

  it("leads with WHO, because a share lands where nobody has the app's context", () => {
    const p = feedSharePayload(item, "180 kg Back Squat");
    expect(p.text).toBe("Ada Ruiz – 180 kg Back Squat");
    expect(p.url).toContain("post%3Ap%201");
  });

  it("falls back to the @handle when there is no display name", () => {
    expect(feedSharePayload({ ...item, author: { handle: "ada" } }, "Session").text).toBe("@ada – Session");
  });

  it("never joins with a middot", () => {
    // CLAUDE.md: the middot reads as AI slop. A spaced en dash or nothing.
    expect(feedSharePayload(item, "Session").text).not.toContain("·");
  });

  it("still produces something shareable when the author is anonymous", () => {
    expect(feedSharePayload({ ...item, author: {} }, "Session").text).toBe("Session");
    expect(feedSharePayload({ ...item, author: {} }, "").text).toBe("HYBRID");
  });
});

describe("the overflow menu", () => {
  it("offers the 'less of this' verbs on someone else's post", () => {
    const keys = feedMenuActions({ mine: false, subjectType: "post" }).map((a) => a.key);
    expect(keys).toEqual(["follow", "mute", "notInterested", "report", "block"]);
  });

  it("puts the destructive row last", () => {
    const rows = feedMenuActions({ mine: false, subjectType: "post" });
    expect(rows[rows.length - 1]?.destructive).toBe(true);
    expect(rows.filter((a) => a.destructive).length).toBe(1);
  });

  it("never aims follow / mute / block / report at yourself", () => {
    const keys = feedMenuActions({ mine: true, subjectType: "post", canDelete: true }).map((a) => a.key);
    expect(keys).not.toContain("follow");
    expect(keys).not.toContain("mute");
    expect(keys).not.toContain("block");
    expect(keys).not.toContain("report");
  });

  it("offers delete only on a real Post the screen can actually delete", () => {
    const del = (i: Parameters<typeof feedMenuActions>[0]) => feedMenuActions(i).some((a) => a.key === "delete");
    expect(del({ mine: true, subjectType: "post", canDelete: true })).toBe(true);
    expect(del({ mine: true, subjectType: "post" })).toBe(false); // no handler supplied
    expect(del({ mine: true, subjectType: "session", canDelete: true })).toBe(false); // derived row
    expect(del({ mine: false, subjectType: "post", canDelete: true })).toBe(false);
  });

  it("marks which rows are real and which are drawn-but-unwired", () => {
    // The clients render `placeholder` honestly instead of firing a no-op that
    // reads as a bug. If one of these gets wired up, this test is the reminder.
    const rows = feedMenuActions({ mine: false, subjectType: "post" });
    expect(rows.every((a) => a.placeholder)).toBe(true);
    const own = feedMenuActions({ mine: true, subjectType: "post", canDelete: true });
    expect(own.map((a) => a.key)).toEqual(["delete"]);
    expect(own.every((a) => !a.placeholder)).toBe(true);
  });

  it("returns nothing for my own session or PR row, so no ⋯ is drawn", () => {
    // A derived row of mine has nothing to offer. An empty sheet behind a
    // button is worse than no button.
    expect(feedMenuActions({ mine: true, subjectType: "session" })).toEqual([]);
    expect(feedMenuActions({ mine: true, subjectType: "pr", canDelete: true })).toEqual([]);
  });

  it("names an i18n key for every row — no client invents English", () => {
    for (const a of feedMenuActions({ mine: false, subjectType: "post" })) {
      expect(a.labelKey).toMatch(/^feed\.menu\./);
      expect(a.subKey).toMatch(/^feed\.menu\./);
    }
  });
});
