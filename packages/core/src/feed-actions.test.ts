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
  orderBySaved,
  parseFeedSubjectKey,
  pruneFeedSaved,
  reconcileFeedSaved,
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

describe("reading the saved list back (the Saved screen)", () => {
  it("round-trips a key, and refuses anything that isn't one", () => {
    // This is a TRUST BOUNDARY: these keys live in device storage, which the
    // user can edit, and the Saved screen posts them to the server to be turned
    // into database queries.
    expect(parseFeedSubjectKey("post:abc")).toEqual({ subjectType: "post", subjectId: "abc" });
    expect(parseFeedSubjectKey("session:s1")).toEqual({ subjectType: "session", subjectId: "s1" });
    expect(parseFeedSubjectKey("pr:s1")).toEqual({ subjectType: "pr", subjectId: "s1" });
    expect(parseFeedSubjectKey("user:me")).toBeNull();        // not a feed subject
    expect(parseFeedSubjectKey("post:")).toBeNull();          // no id
    expect(parseFeedSubjectKey(":abc")).toBeNull();           // no type
    expect(parseFeedSubjectKey("postabc")).toBeNull();        // no separator
    expect(parseFeedSubjectKey(`post:${"x".repeat(65)}`)).toBeNull(); // unbounded id
    expect(parseFeedSubjectKey(null)).toBeNull();
  });

  it("keeps an id containing a colon whole", () => {
    // Split on the FIRST colon only — an id is opaque and may contain one.
    expect(parseFeedSubjectKey("post:a:b")).toEqual({ subjectType: "post", subjectId: "a:b" });
  });

  it("prunes rows that are gone, and keeps rows that merely turned invisible", () => {
    // Deleted → forget it. Author went private or blocked you → KEEP it; that
    // state reverses, and forgetting is the failure the shelf exists to fix.
    const s = { ids: ["post:1", "post:2", "post:3"] };
    expect(pruneFeedSaved(s, ["post:2"]).ids).toEqual(["post:1", "post:3"]);
    expect(pruneFeedSaved(s, [])).toBe(s); // same object — no needless re-render
    expect(pruneFeedSaved(s, ["post:9"])).toBe(s); // nothing matched
  });

  it("orders resolved items by WHEN THEY WERE SAVED, not when they were posted", () => {
    const state = { ids: ["post:c", "post:a", "post:b"] };
    const items = [
      { subjectType: "post", subjectId: "a" },
      { subjectType: "post", subjectId: "b" },
      { subjectType: "post", subjectId: "c" },
    ];
    expect(orderBySaved(state, items).map((i) => i.subjectId)).toEqual(["c", "a", "b"]);
  });

  it("puts anything the server returned but the store doesn't know about last", () => {
    const state = { ids: ["post:b"] };
    const items = [{ subjectType: "post", subjectId: "a" }, { subjectType: "post", subjectId: "b" }];
    expect(orderBySaved(state, items).map((i) => i.subjectId)).toEqual(["b", "a"]);
  });
});

describe("syncing the shelf across devices", () => {
  it("first sync UNIONS, so turning sync on loses nothing in either direction", () => {
    // This device saved things before SavedPost existed; another device saved
    // things this one has never seen. Neither is wrong.
    const local = { ids: ["post:local", "post:both"] };
    const { next, push } = reconcileFeedSaved(local, ["post:both", "post:remote"]);
    expect(next.ids).toEqual(["post:local", "post:both", "post:remote"]); // local leads
    expect(next.synced).toBe(true);
    expect(push).toEqual(["post:local"]); // only what the server hasn't got
  });

  it("every sync after that takes the server's list — which is what makes an unsave stick", () => {
    // The union cannot tell "you removed this" from "this device hasn't heard
    // yet", so running it forever would resurrect an unsaved post from any
    // stale device.
    const local = { ids: ["post:stale", "post:kept"], synced: true };
    const { next, push } = reconcileFeedSaved(local, ["post:kept"]);
    expect(next.ids).toEqual(["post:kept"]);
    expect(push).toEqual([]);
  });

  it("survives a server that returns junk", () => {
    const { next } = reconcileFeedSaved({ ids: ["post:a"], synced: true }, ["", "post:b", "post:b"] as string[]);
    expect(next.ids).toEqual(["post:b"]);
  });

  it("keeps the synced flag through a toggle and a prune", () => {
    // Dropping it would put the device back into first-sync mode and resurrect
    // whatever it just unsaved.
    const s = { ids: ["post:1"], synced: true };
    expect(toggleFeedSaved(s, "post:2").synced).toBe(true);
    expect(toggleFeedSaved(s, "post:1").synced).toBe(true);
    expect(pruneFeedSaved(s, ["post:1"]).synced).toBe(true);
    expect(normalizeFeedSaved(JSON.parse(JSON.stringify(s))).synced).toBe(true);
  });

  it("a device that has never synced is not marked synced by storage alone", () => {
    expect(normalizeFeedSaved({ ids: ["post:1"] }).synced).toBeUndefined();
    expect(normalizeFeedSaved({ ids: [], synced: "yes" }).synced).toBeUndefined();
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
    // reads as a bug. Mute and "not interested" are the two still waiting on
    // state that doesn't exist; when one lands, this test is the reminder.
    const rows = feedMenuActions({ mine: false, subjectType: "post" });
    expect(rows.filter((a) => a.placeholder).map((a) => a.key)).toEqual(["mute", "notInterested"]);
    expect(rows.filter((a) => !a.placeholder).map((a) => a.key)).toEqual(["follow", "report", "block"]);
    const own = feedMenuActions({ mine: true, subjectType: "post", canDelete: true });
    expect(own.map((a) => a.key)).toEqual(["delete"]);
    expect(own.every((a) => !a.placeholder)).toBe(true);
  });

  it("the follow row names what pressing it will DO", () => {
    // A row that says "Follow" to someone you already follow makes the menu
    // look like it doesn't know who you are.
    const label = (relation?: Parameters<typeof feedMenuActions>[0]["relation"]) =>
      feedMenuActions({ mine: false, subjectType: "post", relation }).find((a) => a.key === "follow")?.labelKey;
    expect(label("none")).toBe("feed.menu.follow");
    expect(label("follower")).toBe("feed.menu.follow"); // they follow me, I don't follow back
    expect(label(undefined)).toBe("feed.menu.follow"); // unknown → the safe direction
    expect(label("following")).toBe("feed.menu.unfollow");
    expect(label("friend")).toBe("feed.menu.unfollow");
    expect(label("close")).toBe("feed.menu.unfollow");
  });

  it("reports the POST on a post, and the ATHLETE on a derived row", () => {
    // A session or PR card isn't a content row anyone can file against — what
    // you're reporting there is the person, so the label must not say "post".
    const label = (subjectType: string) =>
      feedMenuActions({ mine: false, subjectType }).find((a) => a.key === "report")?.labelKey;
    expect(label("post")).toBe("feed.menu.report");
    expect(label("session")).toBe("feed.menu.reportAuthor");
    expect(label("pr")).toBe("feed.menu.reportAuthor");
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
    }
  });
});
