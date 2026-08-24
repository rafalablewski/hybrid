import { REST_DAYS_KEY, dayKeyDiff, localDayKey, localTodayKey } from "@hybrid/core";
import { getPref, setPref } from "./synced-prefs";

/**
 * A DECLARED REST DAY — the athlete saying so, rather than the app inferring it.
 *
 * WHAT WAS MISSING. A logbook day had exactly two states: it held training, or
 * it was empty. Those are not the same as "I rested" — an empty day is the app
 * not knowing, and it draws the invitation to log something, every day, at the
 * athlete who has decided today is for recovering. There was no way to answer
 * it. The plan rail has always had a rest day because a PROGRAM can prescribe
 * one; the plan-less athlete had no vocabulary for the same fact.
 *
 * So this is the second training-INTENT signal the app collects (the first is
 * day-band-prefs' "not today"), and everything else it knows is what already
 * happened.
 *
 * ── IT FOLLOWS THE ACCOUNT NOW ────────────────────────────────────────────
 * This file used to argue that a rest day belonged on the device — a statement
 * about a day rather than a record of work, not worth a migration and a sync
 * path — while admitting the cost in the same breath: it did not survive a
 * reinstall. That trade was overturned in Aug 2026 when the whole class of
 * per-device settings moved to the account (lib/synced-prefs.ts → /api/prefs),
 * because the sync path it was not worth building alone is now written once and
 * shared. A declared rest day is a thing the athlete SAID, and the app should
 * not forget it because they changed phones.
 *
 * It is still not a Signal, and that distinction survives: when rest starts
 * feeding the engines — a streak a declared rest day does not break, an MRV
 * week that counts it — it becomes an INPUT and wants a row of its own with the
 * provenance an engine can audit. Syncing the note is not the same as modelling
 * the fact. See `rest-day-signal` in capabilities.ts.
 *
 * ── NOT SCOPED TO TODAY, unlike a rejection ───────────────────────────────
 * "Not swimming today" must not still be true on Friday, so day-band-prefs
 * drops anything that isn't today's key. A rest day is the opposite: Saturday
 * was a rest day is still true next week, and the rail scrolls back four. The
 * store is therefore a SET of day keys, pruned to the rail's own reach so it
 * cannot grow without bound.
 */

/** How far back a key is kept. The logbook rail reaches 28 days
 *  (LOGBOOK_SCROLL_WINDOW); a quarter is comfortably past anything that can
 *  still be looked at, and bounds the record at ~90 short strings. */
const KEEP_DAYS = 90;

interface Stored {
  /** local yyyy-mm-dd keys the athlete declared a rest day. */
  days: string[];
}

/** Every declared rest day still in reach, oldest keys dropped. */
export async function readRestDays(now: number = Date.now()): Promise<Set<string>> {
  try {
    const parsed = getPref<Stored | null>(REST_DAYS_KEY, null);
    const days = Array.isArray(parsed?.days) ? parsed.days : [];
    const today = localTodayKey(now);
    // `dayKeyDiff(a, b)` is b − a, so a past key reads NEGATIVE against today.
    // The upper bound is 1 rather than 0 on purpose: a declaration written just
    // before local midnight, or read from a device that has since crossed a
    // timezone, can legitimately sit one day ahead, and dropping it would erase
    // an answer the athlete gave.
    return new Set(days.filter((d) => {
      if (typeof d !== "string") return false;
      const delta = dayKeyDiff(today, d);
      return delta >= -KEEP_DAYS && delta <= 1;
    }));
  } catch {
    return new Set();
  }
}

/**
 * Declare (or retract) a rest day.
 *
 * Takes a TIMESTAMP, not a key, because every caller has the day's own `ts`
 * and none of them should be composing date strings.
 *
 * IT RETURNS THE NEW SET, AND THE SCREEN DELIBERATELY IGNORES IT. Rendering
 * from this answer is the obvious shape and it is the wrong one: it puts an
 * AsyncStorage round-trip between the finger and the first pixel, and there is
 * a layout animation armed on that commit (lib/list-motion.ts) which would then
 * be armed around whatever else happened to land during the await. The card
 * computes its own next state from the day it already has and treats this write
 * as best-effort; a failure reconciles on the next `readRestDays`. The return
 * is kept for a caller that has no day in hand — a settings-style bulk edit,
 * a migration — where the read is the point.
 */
export async function setRestDay(ts: number, resting: boolean, now: number = Date.now()): Promise<Set<string>> {
  const next = await readRestDays(now);
  const key = localDayKey(ts);
  if (resting) next.add(key); else next.delete(key);
  setPref(REST_DAYS_KEY, { days: [...next] } satisfies Stored);
  return next;
}
