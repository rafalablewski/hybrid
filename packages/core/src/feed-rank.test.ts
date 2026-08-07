import { describe, it, expect } from "vitest";
import {
  rankFeed,
  scoreItem,
  momentWeight,
  affinity,
  engagementMultiplier,
  decay,
  reasonFor,
} from "./feed-rank";
import type { FeedItem } from "./social";

const NOW = Date.parse("2026-03-06T12:00:00.000Z");
const hoursAgo = (h: number) => NOW - h * 3_600_000;

const item = (over: Partial<FeedItem> & { id: string; authorId?: string }): FeedItem => ({
  kind: "session",
  subjectType: "session",
  subjectId: over.id,
  author: { id: over.authorId ?? "u1", handle: "kasia", displayName: "Kasia Nowak" },
  title: "",
  body: null,
  chips: [],
  lead: null,
  at: hoursAgo(1),
  when: "1 h",
  accent: "lime",
  detail: "",
  card: { moment: "p2", archetype: "sets", headlineKey: "feed.hl.session" },
  ...over,
});

const pr = (over: Partial<FeedItem> & { id: string; authorId?: string }): FeedItem =>
  item({
    kind: "pr",
    card: { moment: "p0", archetype: "stat", headlineKey: "feed.hl.pr", headlineArg: "Deadlift", figureKg: 210, tier: 0 },
    ...over,
  });

describe("moment leads the score", () => {
  it("puts a stranger's PR above an ordinary session from a close friend", () => {
    const ranked = rankFeed(
      [item({ id: "friend-session", authorId: "friend" }), pr({ id: "stranger-pr", authorId: "stranger" })],
      (i) => (i.author.id === "friend" ? { relation: "close" } : { relation: "none" }),
      { now: NOW },
    );
    expect(ranked[0]!.id).toBe("stranger-pr");
  });

  it("does NOT let a moment outrank everything regardless of age", () => {
    // A four-day-old PR should lose to a friend's session from an hour ago.
    const ranked = rankFeed(
      [pr({ id: "stale-pr", authorId: "stranger", at: hoursAgo(96) }), item({ id: "fresh", authorId: "friend" })],
      (i) => (i.author.id === "friend" ? { relation: "friend" } : { relation: "none" }),
      { now: NOW },
    );
    expect(ranked[0]!.id).toBe("fresh");
  });

  it("rewards evidence only where a claim is being made", () => {
    const claimed = pr({ id: "a" });
    const witnessed = pr({ id: "b", card: { ...pr({ id: "b" }).card!, tier: 2 } });
    expect(momentWeight(witnessed)).toBeGreaterThan(momentWeight(claimed));
    // The same badge on a session card rewards owning a watch, not lifting.
    const session = item({ id: "c" });
    const sessionWithTier = item({ id: "d", card: { ...session.card!, tier: 2 } });
    expect(momentWeight(sessionWithTier)).toBe(momentWeight(session));
  });

  it("treats a first-ever lift as rarer than another 2.5 kg on a familiar bar", () => {
    const repeat = pr({ id: "a", card: { ...pr({ id: "a" }).card!, deltaPct: 1 } });
    const first = pr({ id: "b", card: { ...pr({ id: "b" }).card!, firstEver: true } });
    expect(momentWeight(first)).toBeGreaterThan(momentWeight(repeat));
  });
});

describe("affinity is two-way", () => {
  it("ranks close above friend above following, and earns nothing from being followed", () => {
    expect(affinity({ relation: "close" })).toBeGreaterThan(affinity({ relation: "friend" }));
    expect(affinity({ relation: "friend" })).toBeGreaterThan(affinity({ relation: "following" }));
    // Being followed BY someone popular is not a relationship the viewer chose.
    expect(affinity({ relation: "follower" })).toBeLessThan(affinity({ relation: "following" }));
  });

  it("saturates interaction history — a bond, not a leaderboard", () => {
    expect(affinity({ interactions: 100 })).toBe(affinity({ interactions: 10 }));
  });
});

describe("the engagement term is capped", () => {
  it("never exceeds 1.5 or drops below 0.8, however confident the model is", () => {
    expect(engagementMultiplier({ engagement: 1 })).toBeLessThanOrEqual(1.5);
    expect(engagementMultiplier({ engagement: 0 })).toBeGreaterThanOrEqual(0.8);
    expect(engagementMultiplier({ engagement: 99 })).toBe(1.5);
  });

  it("is exactly 1 when no model has spoken — v1 ships no learned term", () => {
    expect(engagementMultiplier({})).toBe(1);
  });

  it("cannot rescue a Tuesday over a PR — it breaks ties, it doesn't set the agenda", () => {
    const boring = scoreItem(item({ id: "a" }), { relation: "close", engagement: 1 }, NOW);
    const record = scoreItem(pr({ id: "b" }), { relation: "none" }, NOW);
    expect(record).toBeGreaterThan(boring);
  });
});

describe("freshness decays per family", () => {
  it("keeps a PR interesting for days and a session for hours", () => {
    const dayOldPr = decay(pr({ id: "a", at: hoursAgo(24) }), NOW);
    const dayOldSession = decay(item({ id: "b", at: hoursAgo(24) }), NOW);
    expect(dayOldPr).toBeGreaterThan(dayOldSession);
  });

  it("halves at the half-life", () => {
    expect(decay(pr({ id: "a", at: hoursAgo(72) }), NOW)).toBeCloseTo(0.5, 5);
  });
});

describe("guardrails", () => {
  it("caps one author so a prolific week cannot own the feed", () => {
    const many = [1, 2, 3, 4, 5].map((n) => pr({ id: `p${n}`, authorId: "loud", at: hoursAgo(n) }));
    const ranked = rankFeed([...many, item({ id: "other", authorId: "someone-else" })], () => ({ relation: "following" }), { now: NOW });
    expect(ranked.filter((i) => i.author.id === "loud")).toHaveLength(2);
    // and the other athlete still makes it in
    expect(ranked.some((i) => i.author.id === "someone-else")).toBe(true);
  });

  it("explains every card the viewer does not already follow", () => {
    expect(reasonFor({ coach: true })).toEqual({ key: "feed.why.coach" });
    expect(reasonFor({ relation: "none", sameGym: true })).toEqual({ key: "feed.why.gym" });
    expect(reasonFor({ relation: "follower" })).toEqual({ key: "feed.why.followsYou" });
  });

  it("says nothing about people you already follow, or about yourself", () => {
    expect(reasonFor({ relation: "friend" })).toBeNull();
    expect(reasonFor({ relation: "following" })).toBeNull();
    expect(reasonFor({ mine: true, relation: "self" })).toBeNull();
  });

  it("attaches the reason to the ranked card so the client never has to re-derive it", () => {
    const ranked = rankFeed([item({ id: "x", authorId: "coach-1" })], () => ({ relation: "none", coach: true }), { now: NOW });
    expect(ranked[0]!.reason).toEqual({ key: "feed.why.coach" });
  });

  it("is stable: equal scores fall back to recency, never to input order", () => {
    const a = item({ id: "older", authorId: "u1", at: hoursAgo(5) });
    const b = item({ id: "newer", authorId: "u2", at: hoursAgo(2) });
    expect(rankFeed([a, b], () => ({ relation: "following" }), { now: NOW })[0]!.id).toBe("newer");
    expect(rankFeed([b, a], () => ({ relation: "following" }), { now: NOW })[0]!.id).toBe("newer");
  });

  it("an absent signal contributes nothing rather than being guessed", () => {
    const withNothing = scoreItem(item({ id: "a" }), {}, NOW);
    const withGym = scoreItem(item({ id: "a" }), { sameGym: true }, NOW);
    expect(withGym).toBeGreaterThan(withNothing);
    expect(withNothing).toBeGreaterThan(0);
  });
});
