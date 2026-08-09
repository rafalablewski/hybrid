import { describe, it, expect } from "vitest";
import {
  normalizeHandle,
  isValidHandle,
  suggestHandle,
  relationTo,
  isFriend,
  canViewResults,
  buildSocialFeed,
  prPostFigure,
  feedCardView,
  friendLeaderboard,
  compareAthletes,
  profileStats,
  coachRailItems,
  PLACEHOLDER_COACHES,
  buildSocialNotifications,
  type SocialNotifEvent,
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

describe("privacy gate — the full visibility × relation contract", () => {
  // The feed/leaderboard/compare cross-user reads rely ENTIRELY on this gate
  // (the server role bypasses RLS), so pin every combination explicitly.
  const relations = ["self", "none", "following", "follower", "friend", "close"] as const;
  const expected: Record<string, Record<(typeof relations)[number], boolean>> = {
    public:    { self: true, none: true,  following: true,  follower: true,  friend: true, close: true },
    followers: { self: true, none: false, following: true,  follower: true,  friend: true, close: true },
    private:   { self: true, none: false, following: false, follower: false, friend: false, close: false },
  };
  for (const vis of ["public", "followers", "private"] as const) {
    for (const rel of relations) {
      it(`${vis} × ${rel} → ${expected[vis]![rel]}`, () => {
        expect(canViewResults(vis, rel)).toBe(expected[vis]![rel]);
      });
    }
  }
  it("a PENDING follow never counts as an active relation (no early access to a private profile)", () => {
    const edges: FollowEdge[] = [{ followerId: "me", followeeId: "ghost", status: "pending" }];
    const rel = relationTo("me", "ghost", edges);
    expect(rel).toBe("none");
    expect(canViewResults("private", rel)).toBe(false);
    expect(canViewResults("followers", rel)).toBe(false);
  });
  it("unfollowing (edge removed) drops a former follower back to no access", () => {
    expect(canViewResults("followers", relationTo("me", "x", []))).toBe(false);
  });
});

describe("activity feed", () => {
  it("posts ONE item per workout, newest first, with the records it set on it", () => {
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
    // Two sessions → two posts. A record is a LINE on its workout, never a
    // second card putting the same session in the stream twice.
    expect(feed).toHaveLength(2);
    expect(feed.map((f) => f.kind)).toEqual(["session", "session"]);
    expect(feed[0]!.subjectId).toBe("a2"); // newest first
    expect(feed[0]!.detail!.prs).toEqual([
      expect.objectContaining({ lift: "Back Squat", topLoadKg: 130, previousTopLoadKg: 100, firstEver: false }),
    ]);
    expect(feed[1]!.detail!.prs![0]).toMatchObject({ lift: "Back Squat", firstEver: true });
    // every item carries an anchor for kudos/comments
    expect(feed.every((f) => f.subjectType && f.subjectId)).toBe(true);
  });
  it("includes first-class posts (status + PR card) as feed items", () => {
    const feed = buildSocialFeed(
      [
        {
          author: { id: "alice", handle: "alice", displayName: "Alice" },
          sessions: [],
          posts: [
            { id: "p1", kind: "status", text: "New 5k PB this morning!", at: NOW - 3600_000 },
            { id: "p2", kind: "pr", text: "finally", data: { lift: "Back Squat", e1rm: 150 }, at: NOW - 1800_000 },
          ],
        },
      ],
      { now: NOW },
    );
    const status = feed.find((f) => f.subjectId === "p1")!;
    const pr = feed.find((f) => f.subjectId === "p2")!;
    expect(status.kind).toBe("post");
    expect(status.body).toContain("5k PB");
    expect(pr.title).toContain("shared a PR");
    expect(pr.chips.join(" ")).toContain("Back Squat");
    expect(pr.chips.join(" ")).toContain("150");
    // newest first → the PR (more recent) leads
    expect(feed[0]!.subjectId).toBe("p2");
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

describe("coach discovery rail", () => {
  it("falls back to placeholder people when the marketplace is empty", () => {
    expect(coachRailItems([])).toBe(PLACEHOLDER_COACHES);
    expect(coachRailItems(null)).toBe(PLACEHOLDER_COACHES);
    expect(coachRailItems(undefined)).toBe(PLACEHOLDER_COACHES);
    expect(PLACEHOLDER_COACHES.every((c) => c.placeholder && !c.userId)).toBe(true);
  });
  it("maps real marketplace coaches into the rail shape", () => {
    const items = coachRailItems([
      { userId: "u1", handle: "real_coach", name: "Real Coach", specialties: ["Strength"], coachVerified: true, rating: 4.5, reviews: 3 },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]!.userId).toBe("u1");
    expect(items[0]!.verified).toBe(true);
    expect(items[0]!.placeholder).toBe(false);
    expect(items[0]!.headline).toContain("Strength"); // derived from specialties when no headline
  });
});

describe("social notifications", () => {
  it("formats + sorts events newest first and flags the actionable ones", () => {
    const events: SocialNotifEvent[] = [
      { kind: "follow", at: 1000, actor: { handle: "maya", displayName: "Maya K." } },
      { kind: "follow_request", at: 3000, actor: { handle: "dev" }, followerId: "u_dev" },
      { kind: "enroll_request", at: 2000, actor: { handle: "alex", displayName: "Alex" }, text: "8-Week Block", enrollmentId: "e1" },
      { kind: "kudos", at: 500, actor: { handle: "jon" }, text: "PR" },
    ];
    const items = buildSocialNotifications(events, 4000);
    expect(items.map((i) => i.kind)).toEqual(["follow_request", "enroll_request", "follow", "kudos"]);
    expect(items[0]!.title).toContain("requested to follow");
    expect(items.find((i) => i.kind === "enroll_request")!.actionable).toBe(true);
    expect(items.find((i) => i.kind === "enroll_request")!.title).toContain("8-Week Block");
    expect(items.find((i) => i.kind === "follow")!.actionable).toBe(false);
    expect(items.find((i) => i.kind === "kudos")!.title).toContain("cheered your PR");
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

describe("feedCardView", () => {
  const author = { handle: "maja", displayName: "Maja K." };
  it("session: carries the workout name as lead and the stats as chips", () => {
    const v = feedCardView({ author, lead: "Push day", chips: ["5 exercises", "18,200 kg"], body: null, when: "2h ago" });
    expect(v.name).toBe("Maja K.");
    expect(v.when).toBe("2h ago");
    expect(v.lead).toBe("Push day");
    expect(v.body).toBeNull();
    expect(v.chips).toEqual(["5 exercises", "18,200 kg"]);
  });
  it("pr: lead is the PR tag, the lift/e1RM stays a chip", () => {
    const v = feedCardView({ author, lead: "PR", chips: ["Back Squat — 182 kg e1RM"], body: null, when: "5h ago" });
    expect(v.lead).toBe("PR");
    expect(v.chips).toEqual(["Back Squat — 182 kg e1RM"]);
  });
  it("post: keeps its prose as the body, no chips or lead", () => {
    const v = feedCardView({ author, body: "New bench PR this morning", chips: [], lead: null, when: "1h ago" });
    expect(v.body).toBe("New bench PR this morning");
    expect(v.chips).toEqual([]);
    expect(v.lead).toBeNull();
  });
  it("falls back to @handle when there's no display name", () => {
    const v = feedCardView({ author: { handle: "tom", displayName: null }, body: null, chips: [], lead: null, when: "now" });
    expect(v.name).toBe("@tom");
  });
});

describe("shared PR posts render both stored shapes (#231 migration)", () => {
  const post = (data: Record<string, unknown>) =>
    buildSocialFeed(
      [{
        author: { id: "a", handle: "a", displayName: "A" },
        sessions: [],
        posts: [{ id: "p", kind: "pr" as const, data, at: NOW - 1000 }],
      }],
      { now: NOW },
    ).find((f) => f.subjectId === "p")!;

  it("a NEW post headlines the weight actually lifted, unlabelled", () => {
    const pr = post({ lift: "Barbell Deadlift", topLoad: 250, e1rm: 333 });
    expect(pr.chips.join(" ")).toContain("250 kg");
    expect(pr.chips.join(" ")).not.toContain("333");
    expect(pr.chips.join(" ")).not.toContain("e1RM");
    expect(pr.metric).toBe(250);
  });

  it("a LEGACY post still renders, and stays labelled as an estimate", () => {
    // Written before #231 — there is no bar weight to recover, so it must not
    // be passed off as one.
    const pr = post({ lift: "Barbell Deadlift", e1rm: 333 });
    expect(pr.chips.join(" ")).toContain("333 kg e1RM");
    expect(pr.metric).toBe(333);
  });

  it("survives a post with neither figure", () => {
    expect(post({ lift: "Barbell Deadlift" }).metric).toBeUndefined();
  });

  it("prPostFigure prefers topLoad over a stale e1rm on the same row", () => {
    expect(prPostFigure({ topLoad: 250, e1rm: 333 })).toEqual({ text: "250 kg", value: 250 });
    expect(prPostFigure({ e1rm: 333 })).toEqual({ text: "333 kg e1RM", value: 333 });
    expect(prPostFigure({})).toEqual({ text: "? kg", value: undefined });
  });
});
