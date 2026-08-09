import { describe, it, expect, vi } from "vitest";
import {
  createNotifSync,
  normalizeNotifCache,
  NOTIF_PENDING_CAP,
  type NotifSyncCache,
  type NotifSyncReply,
} from "./notif-sync";
import {
  DEFAULT_NOTIF_READ,
  applyNotifOps,
  isNotifRead,
  markAllNotifsRead,
  normalizeNotifRead,
  type NotifOp,
  type NotifReadState,
} from "./notifications";

const NOW = Date.parse("2026-05-04T20:00:00Z");
const row = (id: string, at = NOW - 3_600_000) => ({ id, at });

/** A fake server that applies ops the way the real route does. */
function fakeServer(opts: { synced?: boolean; base?: NotifReadState } = {}) {
  const synced = opts.synced ?? true;
  let state = opts.base ?? DEFAULT_NOTIF_READ;
  const seen: NotifOp[][] = [];
  let blocker: Promise<void> | null = null;
  let unblock: (() => void) | null = null;
  return {
    get state() { return state; },
    get seen() { return seen; },
    /** Hold pushes open, so a test can dispatch mid-flight. */
    hold() { blocker = new Promise<void>((r) => { unblock = r; }); },
    release() { unblock?.(); blocker = null; unblock = null; },
    pull: async (): Promise<NotifSyncReply> => {
      if (blocker) await blocker;
      return { state, synced };
    },
    push: async (ops: NotifOp[]): Promise<NotifSyncReply> => {
      seen.push(ops);
      if (blocker) await blocker;
      if (synced) state = applyNotifOps(state, ops);
      return { state, synced };
    },
  };
}

function harness(server: ReturnType<typeof fakeServer>, cached: NotifSyncCache | null = null) {
  let saved: NotifSyncCache | null = cached;
  const sync = createNotifSync({
    load: async () => saved,
    save: (c) => { saved = c; },
    pull: server.pull,
    push: server.push,
  });
  return { sync, cache: () => saved };
}

const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); };

describe("the synced store", () => {
  it("applies a decision immediately, without waiting for the server", () => {
    const server = fakeServer();
    const { sync } = harness(server);
    server.hold();
    sync.dispatch({ kind: "unread", id: "a" });
    // No awaits: the swipe has already painted, and the server has not answered.
    expect(isNotifRead(sync.get(), row("a"))).toBe(false);
    expect(server.state).toEqual(DEFAULT_NOTIF_READ);
    server.release();
  });

  it("sends the decision and adopts what the server says", async () => {
    const server = fakeServer();
    const { sync } = harness(server);
    sync.dispatch({ kind: "dismiss", id: "a" });
    await settle();
    expect(server.seen).toEqual([[{ kind: "dismiss", id: "a" }]]);
    expect(sync.get().dismissedIds).toContain("a");
    expect(server.state.dismissedIds).toContain("a");
  });

  it("keeps the queue when the server isn't storing, and drains it later", async () => {
    // Signed out, offline, or the migration not yet run.
    const offline = fakeServer({ synced: false });
    const { sync, cache } = harness(offline);
    sync.dispatch({ kind: "dismiss", id: "a" });
    await settle();
    expect(sync.get().dismissedIds).toContain("a"); // still works, per-device
    expect(cache()!.pending).toHaveLength(1); // and nothing was lost

    // The same decisions replayed against a server that IS storing.
    const online = fakeServer();
    const revived = harness(online, cache());
    revived.sync.hydrate();
    await settle();
    expect(online.state.dismissedIds).toContain("a");
    expect(revived.cache()!.pending).toEqual([]);
  });

  it("does not let a poll revert a swipe that is still in flight", async () => {
    // The failure this store exists to prevent: server truth landing on top of
    // a decision the athlete has already seen applied.
    const server = fakeServer({ base: markAllNotifsRead(DEFAULT_NOTIF_READ, [row("a")], NOW) });
    const { sync } = harness(server);
    sync.dispatch({ kind: "unread", id: "a" });
    await settle();
    expect(isNotifRead(sync.get(), row("a"))).toBe(false);
  });

  it("keeps decisions made while a request is in the air", async () => {
    const server = fakeServer();
    const { sync } = harness(server);
    server.hold();
    sync.dispatch({ kind: "read", id: "a" });
    await Promise.resolve();
    sync.dispatch({ kind: "dismiss", id: "b" });
    server.release();
    await settle();
    // Two requests, the second carrying only the op raised mid-flight.
    expect(server.seen).toEqual([[{ kind: "read", id: "a" }], [{ kind: "dismiss", id: "b" }]]);
    expect(server.state.dismissedIds).toContain("b");
    expect(sync.get().dismissedIds).toContain("b");
  });

  it("never queues a no-op sweep", async () => {
    // sweepNotifsRead returns the state it was given when there's nothing to
    // sweep. Queueing that would re-arm the screen's sweep on every poll.
    const server = fakeServer();
    const { sync } = harness(server);
    const items = [row("a")];
    sync.dispatch({ kind: "markAll", items, now: NOW });
    await settle();
    server.seen.length = 0;
    sync.dispatch({ kind: "sweep", items, now: NOW + 1000 });
    await settle();
    expect(server.seen).toEqual([]);
  });

  it("paints from the cache first, so the bell isn't blank while the server answers", async () => {
    const server = fakeServer({ base: { ...DEFAULT_NOTIF_READ, dismissedIds: ["from-phone"] } });
    const cached: NotifSyncCache = { state: { ...DEFAULT_NOTIF_READ, dismissedIds: ["old"] }, pending: [] };
    const { sync } = harness(server, cached);
    server.hold();
    sync.hydrate();
    await settle();
    // The cache is showing; the server hasn't answered yet.
    expect(sync.get().dismissedIds).toEqual(["old"]);
    server.release();
    await settle();
    // And now it has.
    expect(sync.get().dismissedIds).toEqual(["from-phone"]);
  });

  it("notifies subscribers on every change", async () => {
    const server = fakeServer();
    const { sync } = harness(server);
    const seen = vi.fn();
    sync.subscribe(seen);
    sync.dispatch({ kind: "read", id: "a" });
    expect(seen).toHaveBeenCalled();
  });

  it("hydrates once however many times it is asked", async () => {
    const server = fakeServer();
    const pull = vi.fn(server.pull);
    const sync = createNotifSync({ load: async () => null, save: () => {}, pull, push: server.push });
    sync.hydrate();
    sync.hydrate();
    sync.subscribe(() => {});
    await settle();
    expect(pull).toHaveBeenCalledTimes(1);
  });

  it("bounds the backlog of a device that has been away a long time", async () => {
    const offline = fakeServer({ synced: false });
    const { sync, cache } = harness(offline);
    for (let i = 0; i < NOTIF_PENDING_CAP + 30; i++) sync.dispatch({ kind: "dismiss", id: `n${i}` });
    await settle();
    expect(cache()!.pending).toHaveLength(NOTIF_PENDING_CAP);
    // The newest survive — their absence is what would be noticed.
    const last = cache()!.pending.at(-1);
    expect(last).toEqual({ kind: "dismiss", id: `n${NOTIF_PENDING_CAP + 29}` });
  });
});

describe("normalizeNotifCache", () => {
  it("reads a cache written by this store", () => {
    const c: NotifSyncCache = { state: { ...DEFAULT_NOTIF_READ, seenAt: NOW }, pending: [{ kind: "read", id: "a" }] };
    expect(normalizeNotifCache(c, normalizeNotifRead)).toEqual(c);
  });

  it("migrates a device that stored the bare read state", () => {
    // Every device already out there has one of these under the old key.
    const old = { seenAt: NOW, readIds: ["a"] };
    expect(normalizeNotifCache(old, normalizeNotifRead)).toEqual({
      state: { seenAt: NOW, readIds: ["a"], unreadIds: [], dismissedIds: [] },
      pending: [],
    });
  });

  it("survives junk", () => {
    expect(normalizeNotifCache(null, normalizeNotifRead)).toEqual({ state: DEFAULT_NOTIF_READ, pending: [] });
    expect(normalizeNotifCache({ state: {}, pending: "nope" }, normalizeNotifRead).pending).toEqual([]);
    expect(normalizeNotifCache({ state: {}, pending: [null, 3, { kind: "read", id: "a" }] }, normalizeNotifRead).pending).toEqual([
      { kind: "read", id: "a" },
    ]);
  });
});
