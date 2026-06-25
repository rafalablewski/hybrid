import { describe, it, expect } from "vitest";
import {
  normalizeHandle,
  isValidHandle,
  suggestHandle,
  relationTo,
  isFriend,
  canViewResults,
  buildSocialFeed,
  friendLeaderboard,
  compareAthletes,
  profileStats,
  type FollowEdge,
  type LoggedSession,
} from "./index";

const squat = (load: string, reps: string): LoggedSession["blocks"][number] => ({
  kind: "strength",
  name: "Back Squat",
  sets: [{ load, reps }],
});
const run = (distance: number): LoggedSession["blocks"][number] => ({
  kind: "cardio",
  name: "Easy Run",
  distance,
  minutes: distance * 5,
});
const sess = (id: string, startedAt: string, blocks: LoggedSession["blocks"]): LoggedSession => ({
  id,
  title: "Session",
  startedAt,
  completedAt: startedAt,
  blocks,
});

const NOW = Date.parse("2026-06-25T12:00:00.000Z");
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

describe("handles", () => {
  it("normalizes free input to a slug", () => {
    expect(normalizeHandle("Rafal Ablewski!")).toBe("rafal_ablewski");
    expect(normalizeHandle("  --A.B--  ")).toBe("a_b");
  });
  it("validates length + charset", () => {
    expect(isValidHandle("rafal_95")).toBe(true);
    expect(isValidHandle("ab")).toBe(false); // too short
    expect(isValidHandle("has space")).toBe(false);
    expect(isValidHandle("x".repeat(21))).toBe(false); // too long
  });
  it("suggests a handle from an email/name", () => {
    expect(suggestHandle("rafal@example.com")).toBe("rafal");
    expect(suggestHandle("al")).toBe("al_athlete");
  });
});

describe("relations + privacy gate", () => {
  const edges: FollowEdge[] = [
    { followerId: "me", followeeId: "alice", status: "active", closeFriend: false },
    { followerId: "alice", followeeId: "me", status: "active" }, // mutual → friend
    { followerId: "me", followeeId: "bob", status: "active", closeFriend: true }, // close
    { followerId: "carol", followeeId: "me", status: "active" }, // follower only
    { followerId: "me", followeeId: "dave", status: "pending" }, // pending, not yet active
  ];
  it("derives the relation from the edges", () => {
    expect(relationTo("me", "me", edges)).toBe("self");
    expect(relationTo("me", "alice", edges)).toBe("friend");
    expect(relationTo("me", "bob", edges)).toBe("close");
    expect(relationTo("me", "carol", edges)).toBe("follower");
    expect(relationTo("me", "dave", edges)).toBe("none"); // pending isn't active
    expect(relationTo("me", "stranger", edges)).toBe("none");
  });
  it("close + friend both count as friend", () => {
    expect(isFriend("friend")).toBe(true);
    expect(isFriend("close")).toBe(true);
    expect(isFriend("following")).toBe(false);
  });
  it("gates results by visibility × relation", () => {
    expect(canViewResults("public", "none")).toBe(true);
    expect(canViewResults("followers", "none")).toBe(false);
    expect(canViewResults("followers", "following")).toBe(true);
    expect(canViewResults("followers", "friend")).toBe(true);
    expect(canViewResults("private", "friend")).toBe(false);
    expect(canViewResults("private", "self")).toBe(true);
  });
});

describe("activity feed", () => {
  it("emits session + PR items, newest first, PR above its session", () => {
    const feed = buildSocialFeed(
      [
        {
          author: { id: "alice", handle: "alice" },
          sessions: [
            sess("a1", day(10), [squat("100", "5")]), // first time → PR
            sess("a2", day(2), [squat("130", "3")]), // new best → PR
          ],
        },
      ],
      { now: NOW },
    );
    // newest session (a2) and its PR come first
    expect(feed[0]!.subjectId).toBe("a2");
    expect(feed[0]!.kind).toBe("pr");
    expect(feed[1]!.kind).toBe("session");
    expect(feed[1]!.subjectId).toBe("a2");
    // every item carries an anchor for kudos/comments
    expect(feed.every((f) => f.subjectType && f.subjectId)).toBe(true);
  });
  it("boosts close friends to the top despite older activity", () => {
    const feed = buildSocialFeed(
      [
        { author: { id: "old", handle: "oldfriend", closeFriend: true }, sessions: [sess("o1", day(1) , [squat("80", "5")])] },
        { author: { id: "new", handle: "newperson" }, sessions: [sess("n1", day(1), [squat("80", "5")])] },
      ],
      { now: NOW, closeBoostHours: 48 },
    );
    expect(feed[0]!.author.id).toBe("old");
  });
});

describe("friend leaderboard", () => {
  const entries = [
    { id: "me", handle: "me", isMe: true, sessions: [sess("m", day(1), [squat("100", "5")])] },
    { id: "alice", handle: "alice", sessions: [sess("a", day(1), [run(10)]), sess("a2", day(2), [run(8)])] },
    { id: "bob", handle: "bob", sessions: [] },
  ];
  it("ranks by the chosen metric, highest first, everyone included", () => {
    const board = friendLeaderboard(entries, "distance", NOW);
    expect(board[0]!.id).toBe("alice"); // 18 km this week
    expect(board.map((r) => r.id)).toContain("bob"); // 0 still listed
    expect(board[0]!.label).toContain("km");
  });
  it("marks the viewer", () => {
    const board = friendLeaderboard(entries, "sessions", NOW);
    expect(board.find((r) => r.id === "me")!.isMe).toBe(true);
  });
});

describe("head-to-head compare", () => {
  it("scores each side per line and compares shared lifts", () => {
    const a = { id: "a", handle: "a", sessions: [sess("a1", day(1), [squat("140", "3")])] };
    const b = { id: "b", handle: "b", sessions: [sess("b1", day(1), [squat("120", "3")])] };
    const r = compareAthletes(a, b, NOW);
    expect(r.sharedLifts.find((l) => l.lift === "Back Squat")!.leader).toBe("a");
    expect(r.score.a).toBeGreaterThan(0);
  });
});

describe("profile stats", () => {
  it("summarizes lifetime totals", () => {
    const s = profileStats([sess("1", day(1), [squat("100", "5")]), sess("2", day(2), [squat("120", "3")])], NOW);
    expect(s.totalSessions).toBe(2);
    expect(s.topLifts[0]!.lift).toBe("Back Squat");
    expect(s.totalVolumeKg).toBeGreaterThan(0);
  });
});
