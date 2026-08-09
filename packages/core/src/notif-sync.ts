/**
 * NOTIFICATION READ STATE, SYNCED — the store both clients run.
 *
 * The read state moved from the DEVICE to the ACCOUNT (see notifications.ts),
 * and the interesting part of that move is not the endpoint, it is what a
 * client does when the endpoint is not there: on a train, signed out, or before
 * the migration has been run. The rule this store keeps is that a decision is
 * never lost and never blinks:
 *
 *   • APPLY LOCALLY FIRST. Swiping a row is instant. The screen never waits for
 *     a round trip to paint what you just did.
 *   • QUEUE THE DECISION, not the resulting state. `NotifOp` values are what
 *     travel, so two devices are reconciled by arrival order at the server
 *     rather than by a merge rule nobody can state (notifications.ts, NotifOp).
 *   • THE SERVER IS THE BASE, THE QUEUE SITS ON TOP. Whenever the server
 *     answers, the state becomes `server + everything not yet confirmed`. That
 *     one line is what stops a freshly-swiped row flickering back to read
 *     because a poll landed a moment later.
 *   • A DEVICE THAT CANNOT REACH THE SERVER STILL WORKS. It keeps its cache and
 *     its queue, and drains the queue when it next gets through — which is the
 *     old per-device behaviour, now as the degraded mode rather than the design.
 *
 * The client supplies four ports (storage and transport differ; the semantics
 * do not). Everything above this line is identical on web and mobile.
 */
import {
  applyNotifOp,
  applyNotifOps,
  DEFAULT_NOTIF_READ,
  type NotifOp,
  type NotifReadState,
} from "./notifications";

/** What a device keeps between launches: the last known state and the backlog. */
export interface NotifSyncCache {
  state: NotifReadState;
  pending: NotifOp[];
}

/** What the server said. `synced: false` means it is NOT storing for us —
 *  signed out, or the table isn't migrated — so its state must be ignored
 *  rather than adopted over what this device already knows. */
export interface NotifSyncReply {
  state: NotifReadState;
  synced: boolean;
}

export interface NotifSyncPorts {
  /** Read the device cache. Resolve null when there isn't one. */
  load: () => Promise<NotifSyncCache | null>;
  /** Write the device cache. Fire-and-forget; must not throw. */
  save: (cache: NotifSyncCache) => void;
  /** GET the account's state. Resolve null on any failure. */
  pull: () => Promise<NotifSyncReply | null>;
  /** POST decisions. Resolve null on any failure, so they stay queued. */
  push: (ops: NotifOp[]) => Promise<NotifSyncReply | null>;
}

export interface NotifSync {
  /** The current state — server truth plus anything still in flight. */
  get: () => NotifReadState;
  subscribe: (listener: () => void) => () => void;
  /** Make a decision: applied now, sent when possible. */
  dispatch: (op: NotifOp) => void;
  /** Load the cache and ask the server. Idempotent — call it on every mount. */
  hydrate: () => void;
  /** Drain the queue now (window focus, app foreground, reconnect). */
  flush: () => void;
}

/**
 * How many un-sent decisions a device keeps. Reached only by a device that has
 * been offline for a very long time; the oldest go first, because the newest
 * are the ones whose absence the athlete would actually notice.
 */
export const NOTIF_PENDING_CAP = 200;

export function createNotifSync(ports: NotifSyncPorts): NotifSync {
  let state: NotifReadState = DEFAULT_NOTIF_READ;
  /** Decisions the server has not confirmed. THE INVARIANT: `state` always
   *  equals the last confirmed base with these applied on top. */
  let pending: NotifOp[] = [];
  let hydrated = false;
  let flushing = false;

  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  const persist = () => ports.save({ state, pending });

  /** Adopt a confirmed base and re-apply whatever is still in flight. */
  const rebase = (base: NotifReadState) => {
    state = applyNotifOps(base, pending);
    persist();
    emit();
  };

  const flush = (): void => {
    if (flushing || !pending.length) return;
    flushing = true;
    const inflight = pending.slice();
    let drained = false;
    void ports
      .push(inflight)
      .then((reply) => {
        // Not stored — keep the queue and try again later. This is the whole
        // offline story: nothing is dropped, the device just stays ahead.
        if (!reply?.synced) return;
        // Drop only what we sent; anything dispatched since stays queued.
        pending = pending.slice(inflight.length);
        rebase(reply.state);
        drained = true;
      })
      .catch(() => {})
      .finally(() => {
        flushing = false;
        // Chain ONLY on progress. Re-arming after a failure would spin: the
        // queue that just failed to send is still there, and nothing about
        // trying it again immediately would be different. A failed queue waits
        // for the next decision, focus, or foreground instead.
        if (drained && pending.length) flush();
      });
  };

  const hydrate = (): void => {
    if (hydrated) return;
    hydrated = true;
    void (async () => {
      const cache = await ports.load().catch(() => null);
      if (cache) {
        // Anything dispatched while the cache was loading is NEWER than the
        // cache's own backlog, so the cache's queue goes in front of it.
        pending = [...cache.pending, ...pending].slice(-NOTIF_PENDING_CAP);
        state = applyNotifOps(cache.state, pending);
        emit();
      }
      const reply = await ports.pull().catch(() => null);
      if (reply?.synced) rebase(reply.state);
      flush();
    })();
  };

  const dispatch = (op: NotifOp): void => {
    hydrate();
    const next = applyNotifOp(state, op);
    // The passive sweep returns the state it was given when there is nothing to
    // sweep (see sweepNotifsRead). Queueing that would send a decision that
    // isn't one — and re-arm the screen's sweep on every poll, for ever.
    if (next === state) return;
    state = next;
    pending = [...pending, op].slice(-NOTIF_PENDING_CAP);
    persist();
    emit();
    flush();
  };

  return {
    get: () => state,
    subscribe: (listener) => {
      hydrate();
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch,
    hydrate,
    flush,
  };
}

/**
 * Coerce a persisted cache (an older shape, a corrupt blob) into a usable one.
 *
 * The `?? v` fallback is the migration for every device already out there:
 * before this store existed the key held the bare NotifReadState, so a blob
 * with no `state` field IS the state. Nobody re-reads what they had read.
 *
 * Ops are not re-validated beyond their shape — they were built by this app,
 * and a queue we cannot parse is better dropped than replayed as something else.
 */
export function normalizeNotifCache(value: unknown, normalizeState: (v: unknown) => NotifReadState): NotifSyncCache {
  const v = (value ?? {}) as Partial<NotifSyncCache>;
  const pending = Array.isArray(v.pending)
    ? v.pending.filter((o): o is NotifOp => !!o && typeof (o as NotifOp).kind === "string").slice(-NOTIF_PENDING_CAP)
    : [];
  return { state: normalizeState(v.state ?? v), pending };
}
