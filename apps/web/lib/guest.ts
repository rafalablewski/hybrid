// Guest mode (web): a brand-new visitor can train BEFORE creating an account —
// the same pre-signup experience mobile already ships (apps/mobile/lib/guest.ts).
// Workouts are saved on the device (localStorage) and best-effort mirrored to the
// backend as AnonSession rows so an admin sees real pre-signup usage. When the
// guest signs up, flushGuestSessions() pushes everything to the real backend so
// nothing is lost. Web twin of the mobile guest lib — same keys/shape/flow.
import type { SessionBlock, LoggedSession } from "@hybrid/core";

export type NewSession = {
  title: string;
  readiness?: number;
  startedAt?: string;
  completedAt?: string;
  blocks: unknown[];
};

export type GuestSession = NewSession & { savedAt: string };

const KEY = "hybrid.guestSessions";
const DEVICE_KEY = "hybrid.deviceId";

/** Set when a guest's workouts flush up on sign-in; the app-shell reads it to
 *  defer the first-run tutorial one open (workout first), then clears it. Mirrors
 *  the mobile CAME_FROM_GUEST_KEY. */
export const CAME_FROM_GUEST_KEY = "hybrid.cameFromGuest";

/** An opaque per-install id (not PII) so an admin can group a guest device's
 *  logged workouts. Generated once and persisted on-device. */
function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "unknown";
  }
}

export function listGuestSessions(): GuestSession[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as GuestSession[]) : [];
  } catch {
    return [];
  }
}

export function clearGuestSessions(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore storage failures */
  }
}

export function guestSessionCount(): number {
  return listGuestSessions().length;
}

/** Guest workouts as LoggedSession[] so the logger's PR/last-time comparisons and
 *  History work against prior guest sessions, exactly like a signed-in athlete. */
export function guestSessionsAsLogged(): LoggedSession[] {
  return listGuestSessions().map((g, i) => ({
    id: `guest-${i}`,
    title: g.title,
    startedAt: g.startedAt ?? g.savedAt,
    completedAt: g.completedAt ?? null,
    blocks: (g.blocks ?? []) as SessionBlock[],
  }));
}

/** Mirror a guest (no-account) workout to the backend so an admin sees real
 *  pre-signup usage. No auth — there's no account yet. Best-effort. */
async function logAnonSession(payload: NewSession): Promise<void> {
  try {
    await fetch("/api/anon-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, deviceId: deviceId(), platform: "web" }),
    });
  } catch {
    /* best-effort — the workout is already safe on-device */
  }
}

/** Save a guest workout on-device, then best-effort mirror it to the backend for
 *  the admin's pre-signup usage picture. Never blocks or throws on the mirror —
 *  the on-device save is what matters. */
export async function saveGuestSession(payload: NewSession): Promise<void> {
  const list = listGuestSessions();
  list.push({ ...payload, savedAt: new Date().toISOString() });
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore storage failures (private mode, quota) */
  }
  await logAnonSession(payload);
}

let flushing = false;

/** After sign-in: push every locally-saved guest workout to the backend as real
 *  Session rows. Keeps any that fail so a later attempt can retry. Returns the
 *  number successfully synced. Guarded so overlapping triggers can't double-post.
 *  Web twin of apps/mobile/lib/guest.ts flushGuestSessions. */
export async function flushGuestSessions(): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  try {
    const list = listGuestSessions();
    if (!list.length) return 0;
    // Mark guest origin the moment we see queued workouts (one-shot, cleared by
    // the app-shell) so the first-run tutorial can step aside after the flush.
    try {
      localStorage.setItem(CAME_FROM_GUEST_KEY, "1");
    } catch {
      /* ignore */
    }
    const remaining: GuestSession[] = [];
    let synced = 0;
    for (const g of list) {
      const { savedAt: _savedAt, ...payload } = g;
      try {
        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) synced++;
        else remaining.push(g);
      } catch {
        remaining.push(g);
      }
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(remaining));
    } catch {
      /* ignore */
    }
    return synced;
  } finally {
    flushing = false;
  }
}
