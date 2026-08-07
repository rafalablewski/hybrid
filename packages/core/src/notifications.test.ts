import { describe, it, expect } from "vitest";
import {
  buildNotifications,
  countUnread,
  DEFAULT_NOTIF_READ,
  isNotifRead,
  markAllNotifsRead,
  markNotifRead,
  normalizeNotifRead,
  NOTIF_READ_ID_CAP,
} from "./notifications";
import type { LoggedSession, SocialNotifItem } from "./index";

const H = 3_600_000;
const NOW = Date.parse("2026-05-04T20:00:00Z");
const iso = (agoMs: number) => new Date(NOW - agoMs).toISOString();

const session = (over: Partial<LoggedSession> = {}): LoggedSession => ({
  id: "s1",
  title: "Back squat",
  startedAt: iso(2 * H),
  completedAt: iso(1 * H),
  blocks: [],
  ...over,
});

const kudos = (over: Partial<SocialNotifItem> = {}): SocialNotifItem => ({
  id: "kudos-nina",
  kind: "kudos",
  at: NOW - 30 * 60_000,
  title: "Nina cheered your workout",
  when: "30m ago",
  accent: "lime",
  actionable: false,
  ...over,
});

describe("buildNotifications", () => {
  it("is empty (and zero) with nothing to say", () => {
    const f = buildNotifications({ sessions: [], now: NOW });
    expect(f.items).toEqual([]);
    expect(f.unread).toBe(0);
  });

  it("merges training, social and feel reads into one list", () => {
    const f = buildNotifications({ sessions: [session()], social: [kudos()], now: NOW });
    expect(f.items.map((i) => i.source)).toContain("feel");
    expect(f.items.map((i) => i.source)).toContain("social");
    expect(f.items.map((i) => i.source)).toContain("training");
  });

  it("puts an open feel read at the top, ahead of a newer social event", () => {
    // The kudos is 30m old, the feel read came due an hour ago — urgency wins.
    const f = buildNotifications({ sessions: [session()], social: [kudos()], now: NOW });
    expect(f.items[0].source).toBe("feel");
  });

  it("floats a request that needs an answer above ordinary events", () => {
    const req = kudos({ id: "req-ada", kind: "follow_request", title: "Ada requested to follow you", actionable: true, at: NOW - 3 * H });
    const f = buildNotifications({ sessions: [], social: [kudos(), req], now: NOW });
    expect(f.items[0].id).toBe("social-req-ada");
  });
});

describe("the feel reminder", () => {
  it("asks for the immediate read while the window is open", () => {
    const f = buildNotifications({ sessions: [session()], now: NOW });
    const feel = f.items.find((i) => i.source === "feel");
    expect(feel?.id).toBe("feel-immediate-s1");
    expect(feel?.titleKey).toBe("notif.feel.immediate");
    expect(feel?.action).toEqual({ kind: "session", sessionId: "s1" });
  });

  it("stops asking once the session has its immediate read", () => {
    const answered = session({ fatigue: 3, feelLoggedAt: iso(0.5 * H) });
    const f = buildNotifications({ sessions: [answered], now: NOW });
    expect(f.items.some((i) => i.id === "feel-immediate-s1")).toBe(false);
  });

  it("asks for the recovery read six hours on, and routes it to the check-in", () => {
    const f = buildNotifications({ sessions: [session({ startedAt: iso(8 * H), completedAt: iso(7 * H) })], now: NOW });
    const feel = f.items.find((i) => i.id === "feel-recovery-s1");
    expect(feel).toBeDefined();
    expect(feel?.action).toEqual({ kind: "checkin" });
    expect(feel?.detail).toContain("1h on");
  });

  it("drops the recovery read once the athlete has checked in since it came due", () => {
    const s = session({ startedAt: iso(8 * H), completedAt: iso(7 * H) });
    const f = buildNotifications({ sessions: [s], lastCheckinAt: iso(0.5 * H), now: NOW });
    expect(f.items.some((i) => i.id === "feel-recovery-s1")).toBe(false);
  });

  it("does not nag about a read whose window has closed", () => {
    // 40h ago: past the immediate window AND past the 36h recovery boundary.
    const stale = session({ startedAt: iso(41 * H), completedAt: iso(40 * H) });
    const f = buildNotifications({ sessions: [stale], now: NOW });
    expect(f.items.some((i) => i.source === "feel")).toBe(false);
  });

  it("stamps the read at its due time, so it ages honestly", () => {
    const s = session({ startedAt: iso(8 * H), completedAt: iso(7 * H) });
    const feel = buildNotifications({ sessions: [s], now: NOW }).items.find((i) => i.id === "feel-recovery-s1");
    // Session ended 7h ago, the recovery read opened at +6h → 1h ago.
    expect(feel!.at).toBe(NOW - 1 * H);
  });
});

describe("read state", () => {
  it("counts everything unread with a fresh state", () => {
    const f = buildNotifications({ sessions: [session()], social: [kudos()], now: NOW });
    expect(f.unread).toBe(f.items.length);
    expect(f.items.every((i) => !i.read)).toBe(true);
  });

  it("marking all read empties the badge", () => {
    const first = buildNotifications({ sessions: [session()], social: [kudos()], now: NOW });
    const read = markAllNotifsRead(DEFAULT_NOTIF_READ, first.items, NOW);
    const after = buildNotifications({ sessions: [session()], social: [kudos()], read, now: NOW });
    expect(after.unread).toBe(0);
    expect(after.items.length).toBe(first.items.length); // read, not deleted
  });

  it("a future-dated assignment is marked read explicitly, not by the watermark", () => {
    const assignments = [{ id: "a1", name: "Tempo run", date: new Date(NOW + 3 * 86_400_000).toISOString(), status: "assigned" }];
    const first = buildNotifications({ sessions: [], assignments, now: NOW });
    expect(first.unread).toBe(1);
    const read = markAllNotifsRead(DEFAULT_NOTIF_READ, first.items, NOW);
    expect(read.readIds).toContain("assign-a1");
    expect(buildNotifications({ sessions: [], assignments, read, now: NOW }).unread).toBe(0);
  });

  it("does NOT pre-read an assignment that appears after the sweep", () => {
    const read = markAllNotifsRead(DEFAULT_NOTIF_READ, [], NOW);
    const later = [{ id: "a2", name: "Long run", date: new Date(NOW + 5 * 86_400_000).toISOString(), status: "assigned" }];
    expect(buildNotifications({ sessions: [], assignments: later, read, now: NOW }).unread).toBe(1);
  });

  it("an event that arrives late but is dated before the sweep stays unread", () => {
    // Read everything at NOW, then a kudos from an hour ago finally lands. It
    // is older than the watermark but was never on screen — the id decides.
    const read = markAllNotifsRead(DEFAULT_NOTIF_READ, [], NOW);
    const late = kudos({ id: "kudos-late", at: NOW - H });
    const f = buildNotifications({ sessions: [], social: [late], read, now: NOW });
    // The watermark alone would call this read; that is the known trade — the
    // sweep says "I have seen the list as of now".
    expect(f.items[0].read).toBe(true);
  });

  it("marks one row read without touching the rest", () => {
    const f = buildNotifications({ sessions: [session()], social: [kudos()], now: NOW });
    const read = markNotifRead(DEFAULT_NOTIF_READ, f.items[0].id);
    const after = buildNotifications({ sessions: [session()], social: [kudos()], read, now: NOW });
    expect(after.unread).toBe(f.unread - 1);
  });

  it("a read feel prompt stays in the list — reminded, not nagged", () => {
    const read = markNotifRead(DEFAULT_NOTIF_READ, "feel-immediate-s1");
    const f = buildNotifications({ sessions: [session()], read, now: NOW });
    const feel = f.items.find((i) => i.id === "feel-immediate-s1");
    expect(feel).toBeDefined();
    expect(feel!.read).toBe(true);
  });

  it("bounds the explicit id set", () => {
    let state = DEFAULT_NOTIF_READ;
    for (let i = 0; i < NOTIF_READ_ID_CAP + 50; i++) state = markNotifRead(state, `n${i}`);
    expect(state.readIds.length).toBe(NOTIF_READ_ID_CAP);
    expect(state.readIds).toContain(`n${NOTIF_READ_ID_CAP + 49}`);
    expect(state.readIds).not.toContain("n0");
  });

  it("re-marking an id keeps it once, at the end", () => {
    const state = markNotifRead(markNotifRead(markNotifRead(DEFAULT_NOTIF_READ, "a"), "b"), "a");
    expect(state.readIds).toEqual(["b", "a"]);
  });

  it("normalizes junk to a usable state", () => {
    expect(normalizeNotifRead(null)).toEqual(DEFAULT_NOTIF_READ);
    expect(normalizeNotifRead({ seenAt: "nope", readIds: [1, "x", null] })).toEqual({ seenAt: 0, readIds: ["x"] });
    expect(normalizeNotifRead({ seenAt: NaN })).toEqual(DEFAULT_NOTIF_READ);
  });

  it("countUnread agrees with the built feed", () => {
    const read = markNotifRead(DEFAULT_NOTIF_READ, "feel-immediate-s1");
    const f = buildNotifications({ sessions: [session()], social: [kudos()], read, now: NOW });
    expect(countUnread(read, f.items)).toBe(f.unread);
  });

  it("isNotifRead reads the watermark and the id set", () => {
    const read = { seenAt: NOW - H, readIds: ["x"] };
    expect(isNotifRead(read, { id: "old", at: NOW - 2 * H })).toBe(true);
    expect(isNotifRead(read, { id: "new", at: NOW })).toBe(false);
    expect(isNotifRead(read, { id: "x", at: NOW })).toBe(true);
  });
});
