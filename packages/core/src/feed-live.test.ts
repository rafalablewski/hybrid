import { describe, it, expect } from "vitest";
import { buildLiveNow, isLive, liveElapsedText, LIVE_WINDOW_MIN } from "./feed-live";
import { buildSocialFeed, type FeedSubjectInput } from "./social";
import type { LoggedSession } from "./engines";

const NOW = Date.parse("2026-03-06T18:00:00.000Z");
const minsAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

const session = (over: Partial<LoggedSession> = {}): LoggedSession => ({
  id: "s1",
  title: "Lower — W4D2",
  startedAt: minsAgo(24),
  completedAt: null,
  blocks: [
    { kind: "strength", name: "Back Squat", sets: [{ load: "140", reps: "5" }] },
    { kind: "strength", name: "Romanian Deadlift", sets: [] },
  ],
  ...over,
});

const subject = (over: Partial<FeedSubjectInput> = {}): FeedSubjectInput => ({
  author: { id: "u1", handle: "marta", displayName: "Marta Wójcik" },
  sessions: [session()],
  ...over,
});

describe("what counts as live", () => {
  it("is a session started and not finished", () => {
    expect(isLive(session(), NOW)).toBe(true);
    expect(isLive(session({ completedAt: minsAgo(2) }), NOW)).toBe(false);
  });

  it("EXPIRES — a session someone forgot to close is not a person at the gym", () => {
    expect(isLive(session({ startedAt: minsAgo(LIVE_WINDOW_MIN + 1) }), NOW)).toBe(false);
    expect(isLive(session({ startedAt: minsAgo(LIVE_WINDOW_MIN - 1) }), NOW)).toBe(true);
  });

  it("ignores a start time in the future rather than showing a negative timer", () => {
    expect(isLive(session({ startedAt: new Date(NOW + 60_000).toISOString() }), NOW)).toBe(false);
  });
});

describe("the strip", () => {
  it("reports elapsed time and what they're on right now", () => {
    const [live] = buildLiveNow([subject()], { now: NOW });
    expect(live).toMatchObject({ elapsedMin: 24, currentExercise: "Back Squat", accent: "lime" });
  });

  it("reads the discipline from the work itself, not the session's name", () => {
    const run = subject({
      sessions: [session({ blocks: [{ kind: "cardio", name: "Easy run", minutes: 30, distance: 6 }] })],
    });
    expect(buildLiveNow([run], { now: NOW })[0]!.accent).toBe("blue");
  });

  it("survives a session with nothing logged into it yet", () => {
    const fresh = subject({ sessions: [session({ blocks: [] })] });
    expect(buildLiveNow([fresh], { now: NOW })[0]).toMatchObject({ currentExercise: null, accent: "lime" });
  });

  it("never puts the viewer in their own presence strip", () => {
    expect(buildLiveNow([subject()], { now: NOW, viewerId: "u1" })).toEqual([]);
  });

  it("shows one entry per athlete — the session they're actually in", () => {
    const two = subject({
      sessions: [session({ id: "old", startedAt: minsAgo(90) }), session({ id: "current", startedAt: minsAgo(10) })],
    });
    const live = buildLiveNow([two], { now: NOW });
    expect(live).toHaveLength(1);
    expect(live[0]!.sessionId).toBe("current");
  });

  it("puts the most recent start first", () => {
    const a = subject({ author: { id: "a", handle: "a" }, sessions: [session({ startedAt: minsAgo(80) })] });
    const b = subject({ author: { id: "b", handle: "b" }, sessions: [session({ startedAt: minsAgo(5) })] });
    expect(buildLiveNow([a, b], { now: NOW }).map((l) => l.author.id)).toEqual(["b", "a"]);
  });

  it("is empty when nobody is training — the strip hides rather than showing a void", () => {
    expect(buildLiveNow([subject({ sessions: [session({ completedAt: minsAgo(5) })] })], { now: NOW })).toEqual([]);
  });
});

describe("presence is not a post", () => {
  it("keeps an in-progress session OUT of the feed — it hasn't happened yet", () => {
    const feed = buildSocialFeed([subject()], { now: NOW });
    expect(feed.filter((i) => i.kind === "session")).toEqual([]);
    expect(buildLiveNow([subject()], { now: NOW })).toHaveLength(1);
  });

  it("still posts a session someone forgot to close, dated when they started", () => {
    const forgotten = subject({ sessions: [session({ startedAt: minsAgo(LIVE_WINDOW_MIN + 60) })] });
    const feed = buildSocialFeed([forgotten], { now: NOW });
    expect(feed.some((i) => i.kind === "session")).toBe(true);
    expect(buildLiveNow([forgotten], { now: NOW })).toEqual([]);
  });

  it("posts a finished session as normal", () => {
    const done = subject({ sessions: [session({ startedAt: minsAgo(70), completedAt: minsAgo(5) })] });
    expect(buildSocialFeed([done], { now: NOW }).some((i) => i.kind === "session")).toBe(true);
  });
});

describe("elapsed text", () => {
  it("reads in minutes, then rolls to hours — mm:ss is false precision on a polled value", () => {
    expect(liveElapsedText(24)).toBe("24m");
    expect(liveElapsedText(60)).toBe("1h");
    expect(liveElapsedText(95)).toBe("1h 35m");
  });
});
