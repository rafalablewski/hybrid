import { describe, it, expect } from "vitest";
import {
  applyNotifOp,
  applyNotifOps,
  buildNotifications,
  countUnread,
  DEFAULT_NOTIF_READ,
  dismissNotif,
  normalizeNotifOp,
  isNotifDismissed,
  isNotifRead,
  markAllNotifsRead,
  markNotifRead,
  markNotifUnread,
  normalizeNotifRead,
  splitNotifications,
  sweepNotifsRead,
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
    expect(f.items[0]!.source).toBe("feel");
  });

  it("floats a request that needs an answer above ordinary events", () => {
    const req = kudos({ id: "req-ada", kind: "follow_request", title: "Ada requested to follow you", actionable: true, at: NOW - 3 * H });
    const f = buildNotifications({ sessions: [], social: [kudos(), req], now: NOW });
    expect(f.items[0]!.id).toBe("social-req-ada");
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
    expect(f.items[0]!.read).toBe(true);
  });

  it("marks one row read without touching the rest", () => {
    const f = buildNotifications({ sessions: [session()], social: [kudos()], now: NOW });
    const read = markNotifRead(DEFAULT_NOTIF_READ, f.items[0]!.id);
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
    expect(normalizeNotifRead({ seenAt: "nope", readIds: [1, "x", null] })).toEqual({ seenAt: 0, readIds: ["x"], unreadIds: [], dismissedIds: [] });
    expect(normalizeNotifRead({ seenAt: NaN })).toEqual(DEFAULT_NOTIF_READ);
  });

  it("normalizes a state persisted before the unread/dismissed sets existed", () => {
    // Every device that ever opened the bell has one of these in its store.
    expect(normalizeNotifRead({ seenAt: NOW, readIds: ["a"] })).toEqual({ seenAt: NOW, readIds: ["a"], unreadIds: [], dismissedIds: [] });
  });

  it("countUnread agrees with the built feed", () => {
    const read = markNotifRead(DEFAULT_NOTIF_READ, "feel-immediate-s1");
    const f = buildNotifications({ sessions: [session()], social: [kudos()], read, now: NOW });
    expect(countUnread(read, f.items)).toBe(f.unread);
  });

  it("isNotifRead reads the watermark and the id set", () => {
    const read = { ...DEFAULT_NOTIF_READ, seenAt: NOW - H, readIds: ["x"] };
    expect(isNotifRead(read, { id: "old", at: NOW - 2 * H })).toBe(true);
    expect(isNotifRead(read, { id: "new", at: NOW })).toBe(false);
    expect(isNotifRead(read, { id: "x", at: NOW })).toBe(true);
  });
});

describe("swipe right — back to unread", () => {
  const feedWith = (read = DEFAULT_NOTIF_READ) =>
    buildNotifications({ sessions: [session()], social: [kudos()], read, now: NOW });

  it("beats the watermark, so a swept row comes back", () => {
    const swept = markAllNotifsRead(DEFAULT_NOTIF_READ, feedWith().items, NOW);
    expect(feedWith(swept).unread).toBe(0);
    const held = markNotifUnread(swept, "social-kudos-nina");
    const after = feedWith(held);
    expect(after.unread).toBe(1);
    expect(after.items.find((i) => i.id === "social-kudos-nina")!.read).toBe(false);
  });

  it("survives the passive sweep — a timer does not undo a decision", () => {
    const held = markNotifUnread(markAllNotifsRead(DEFAULT_NOTIF_READ, feedWith().items, NOW), "social-kudos-nina");
    const after = sweepNotifsRead(held, feedWith(held).items, NOW + 1000);
    expect(isNotifRead(after, { id: "social-kudos-nina", at: NOW - 30 * 60_000 })).toBe(false);
  });

  it("but 'Mark all read' clears it — the one gesture that means all of it", () => {
    const held = markNotifUnread(markAllNotifsRead(DEFAULT_NOTIF_READ, feedWith().items, NOW), "social-kudos-nina");
    const after = markAllNotifsRead(held, feedWith(held).items, NOW + 1000);
    expect(feedWith(after).unread).toBe(0);
  });

  it("tapping a held row reads it again", () => {
    const held = markNotifUnread(DEFAULT_NOTIF_READ, "social-kudos-nina");
    const after = markNotifRead(held, "social-kudos-nina");
    expect(after.unreadIds).not.toContain("social-kudos-nina");
    expect(feedWith(after).items.find((i) => i.id === "social-kudos-nina")!.read).toBe(true);
  });

  it("a passive sweep with nothing to sweep returns the SAME state", () => {
    const swept = markAllNotifsRead(DEFAULT_NOTIF_READ, feedWith().items, NOW);
    const items = feedWith(swept).items;
    expect(sweepNotifsRead(swept, items, NOW + 1000)).toBe(swept);
    // And still the same object when the only unread row is one held by hand,
    // which is what stops the screen's re-armed sweep from looping.
    const held = markNotifUnread(swept, "social-kudos-nina");
    expect(sweepNotifsRead(held, feedWith(held).items, NOW + 2000)).toBe(held);
  });

  it("does not pre-read a future assignment that is being held unread", () => {
    const assignments = [{ id: "a1", name: "Tempo run", date: new Date(NOW + 3 * 86_400_000).toISOString(), status: "assigned" }];
    const held = markNotifUnread(DEFAULT_NOTIF_READ, "assign-a1");
    const after = sweepNotifsRead(held, buildNotifications({ sessions: [], assignments, read: held, now: NOW }).items, NOW);
    expect(after.readIds).not.toContain("assign-a1");
    expect(buildNotifications({ sessions: [], assignments, read: after, now: NOW }).unread).toBe(1);
  });
});

describe("swipe left — delete", () => {
  it("drops the row from the list and from the count", () => {
    const before = buildNotifications({ sessions: [session()], social: [kudos()], now: NOW });
    const read = dismissNotif(DEFAULT_NOTIF_READ, "social-kudos-nina");
    const after = buildNotifications({ sessions: [session()], social: [kudos()], read, now: NOW });
    expect(after.items.some((i) => i.id === "social-kudos-nina")).toBe(false);
    expect(after.items.length).toBe(before.items.length - 1);
    expect(after.unread).toBe(before.unread - 1);
    expect(isNotifDismissed(read, "social-kudos-nina")).toBe(true);
  });

  it("stays deleted when the same event is fetched again", () => {
    const read = dismissNotif(DEFAULT_NOTIF_READ, "feel-immediate-s1");
    // The feel read is a PROJECTION — it is rebuilt from the session every poll,
    // so only the tombstone can keep it away.
    for (let i = 0; i < 3; i++) {
      expect(buildNotifications({ sessions: [session()], read, now: NOW }).items.some((x) => x.id === "feel-immediate-s1")).toBe(false);
    }
  });

  it("lets the next row up rather than shortening the list", () => {
    const social = Array.from({ length: 6 }, (_, i) => kudos({ id: `k${i}`, at: NOW - (i + 1) * 60_000 }));
    const full = buildNotifications({ sessions: [], social, limit: 3, now: NOW });
    expect(full.items.length).toBe(3);
    const read = dismissNotif(DEFAULT_NOTIF_READ, full.items[0]!.id);
    expect(buildNotifications({ sessions: [], social, limit: 3, read, now: NOW }).items.length).toBe(3);
  });

  it("clears the row's read and unread marks with it", () => {
    const held = markNotifUnread(markNotifRead(DEFAULT_NOTIF_READ, "x"), "x");
    const gone = dismissNotif(held, "x");
    expect(gone.readIds).not.toContain("x");
    expect(gone.unreadIds).not.toContain("x");
    expect(gone.dismissedIds).toContain("x");
  });

  it("bounds the tombstones too", () => {
    let state = DEFAULT_NOTIF_READ;
    for (let i = 0; i < NOTIF_READ_ID_CAP + 5; i++) state = dismissNotif(state, `d${i}`);
    expect(state.dismissedIds.length).toBe(NOTIF_READ_ID_CAP);
  });
});

describe("the ops — one reducer for the clients and the server", () => {
  const items = () => buildNotifications({ sessions: [session()], social: [kudos()], now: NOW }).items;

  it("each op does what its named function does", () => {
    expect(applyNotifOp(DEFAULT_NOTIF_READ, { kind: "read", id: "a" })).toEqual(markNotifRead(DEFAULT_NOTIF_READ, "a"));
    expect(applyNotifOp(DEFAULT_NOTIF_READ, { kind: "unread", id: "a" })).toEqual(markNotifUnread(DEFAULT_NOTIF_READ, "a"));
    expect(applyNotifOp(DEFAULT_NOTIF_READ, { kind: "dismiss", id: "a" })).toEqual(dismissNotif(DEFAULT_NOTIF_READ, "a"));
    const list = items();
    expect(applyNotifOp(DEFAULT_NOTIF_READ, { kind: "sweep", items: list, now: NOW })).toEqual(sweepNotifsRead(DEFAULT_NOTIF_READ, list, NOW));
    expect(applyNotifOp(DEFAULT_NOTIF_READ, { kind: "markAll", items: list, now: NOW })).toEqual(markAllNotifsRead(DEFAULT_NOTIF_READ, list, NOW));
  });

  it("arrival order decides when two devices disagree about one row", () => {
    // The phone reads it, then the laptop swipes it back to unread. Last one in
    // wins, because that is the order the athlete did them in.
    const late = applyNotifOps(DEFAULT_NOTIF_READ, [{ kind: "read", id: "x" }, { kind: "unread", id: "x" }]);
    expect(isNotifRead(late, { id: "x", at: NOW })).toBe(false);
    const other = applyNotifOps(DEFAULT_NOTIF_READ, [{ kind: "unread", id: "x" }, { kind: "read", id: "x" }]);
    expect(isNotifRead(other, { id: "x", at: NOW })).toBe(true);
  });

  it("replays a pending queue on top of the server's state", () => {
    // What a client does when the server answers while ops are still in flight:
    // the swipe must not blink back to read.
    const server = markAllNotifsRead(DEFAULT_NOTIF_READ, items(), NOW);
    const withPending = applyNotifOps(server, [{ kind: "unread", id: "social-kudos-nina" }]);
    expect(buildNotifications({ sessions: [session()], social: [kudos()], read: withPending, now: NOW }).unread).toBe(1);
  });

  it("replaying the same op twice is the same as once", () => {
    // A queue that retries after a timeout must not double-apply.
    const once = applyNotifOps(DEFAULT_NOTIF_READ, [{ kind: "dismiss", id: "x" }]);
    const twice = applyNotifOps(DEFAULT_NOTIF_READ, [{ kind: "dismiss", id: "x" }, { kind: "dismiss", id: "x" }]);
    expect(twice).toEqual(once);
  });
});

describe("normalizeNotifOp — this is a request body, not our data", () => {
  it("takes the ops it recognises", () => {
    expect(normalizeNotifOp({ kind: "read", id: "a" }, NOW)).toEqual({ kind: "read", id: "a" });
    expect(normalizeNotifOp({ kind: "dismiss", id: "a" }, NOW)).toEqual({ kind: "dismiss", id: "a" });
  });

  it("rejects anything else", () => {
    expect(normalizeNotifOp(null, NOW)).toBeNull();
    expect(normalizeNotifOp({ kind: "drop table" }, NOW)).toBeNull();
    expect(normalizeNotifOp({ kind: "read" }, NOW)).toBeNull();
    expect(normalizeNotifOp({ kind: "sweep" }, NOW)).toBeNull();
  });

  it("drops junk items rather than the whole sweep", () => {
    const op = normalizeNotifOp({ kind: "sweep", now: NOW, items: [{ id: "a", at: NOW }, { id: 5, at: NOW }, null, { id: "b" }] }, NOW);
    expect(op).toEqual({ kind: "sweep", items: [{ id: "a", at: NOW }], now: NOW });
  });

  it("clamps a device clock that runs ahead", () => {
    // Unclamped, a wrong clock pushes the watermark into the future and reads
    // everything, for good.
    const op = normalizeNotifOp({ kind: "markAll", items: [], now: NOW + 400 * 86_400_000 }, NOW);
    expect(op).toEqual({ kind: "markAll", items: [], now: NOW });
  });

  it("leaves an honest clock alone, including one running behind", () => {
    expect(normalizeNotifOp({ kind: "sweep", items: [], now: NOW - H }, NOW)).toEqual({ kind: "sweep", items: [], now: NOW - H });
  });

  it("bounds the ids one op can carry", () => {
    const many = Array.from({ length: 400 }, (_, i) => ({ id: `n${i}`, at: NOW }));
    const op = normalizeNotifOp({ kind: "sweep", items: many, now: NOW }, NOW);
    if (op?.kind !== "sweep") throw new Error("expected a sweep op");
    expect(op.items).toHaveLength(200);
  });
});

describe("New versus Seen", () => {
  const items = (read = DEFAULT_NOTIF_READ) =>
    buildNotifications({ sessions: [session()], social: [kudos()], read, now: NOW }).items;

  it("puts everything unread in New and nothing in Seen", () => {
    const { fresh, seen } = splitNotifications(items(), new Set());
    expect(fresh.length).toBe(items().length);
    expect(seen).toEqual([]);
  });

  it("moves what an earlier visit read into Seen", () => {
    const read = markAllNotifsRead(DEFAULT_NOTIF_READ, items(), NOW);
    const { fresh, seen } = splitNotifications(items(read), new Set());
    expect(fresh).toEqual([]);
    expect(seen.length).toBe(items(read).length);
  });

  it("holds THIS visit's rows in New even after the sweep reads them", () => {
    // The sweep fires while the athlete is still looking at the list; the rows
    // must not tip into Seen under their eyes.
    const visit = new Set(items().map((i) => i.id));
    const read = markAllNotifsRead(DEFAULT_NOTIF_READ, items(), NOW);
    const { fresh, seen } = splitNotifications(items(read), visit);
    expect(fresh.length).toBe(items(read).length);
    expect(seen).toEqual([]);
  });

  it("keeps each section in the feed's own order", () => {
    const read = markNotifRead(DEFAULT_NOTIF_READ, "feel-immediate-s1");
    const all = items(read);
    const { fresh, seen } = splitNotifications(all, new Set());
    expect([...fresh, ...seen].map((i) => i.id).sort()).toEqual(all.map((i) => i.id).sort());
    expect(fresh.map((i) => i.id)).toEqual(all.filter((i) => !i.read).map((i) => i.id));
  });
});
