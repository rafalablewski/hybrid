import { sapi } from "./social-api";
import { refreshBodyweight } from "./use-bodyweight";

/**
 * LOGGING A WEIGH-IN FROM A PLACE THAT IS NOT THE SCALE FORM.
 *
 * Body mass is asked in two places that are not Profile → Body & progress: the
 * setup wizard, and the questionnaire's own body-mass row. Both used to write a
 * standing `bodyweightKg` onto the volume profile, which is the defect this
 * module exists to end — a figure typed once outranked every subsequent
 * weigh-in for the life of the account, so the volume model, the recovery
 * multiplier and every strength standard kept quoting the number from the day
 * the athlete installed the app.
 *
 * A body mass is a READING WITH A DATE. It belongs in the body log, which is
 * already the store that feeds bodyweight-aware tonnage, e1RM, the nutrition
 * maintenance fit and the energy-availability read. One store, and it cannot go
 * stale by construction.
 *
 * ── WHY THE DEBOUNCE AND THE REPLACE ───────────────────────────────────────
 *
 * The questionnaire's control is a scrub field: dragging from 80 to 74 fires
 * dozens of changes, and posting each one would fill the athlete's weight trend
 * with a smear of numbers they passed through on the way to the one they meant.
 * So the write settles first, and a settled write REPLACES the row this module
 * wrote earlier the same day rather than appending beside it.
 *
 * It replaces only its OWN row — the id is remembered here — because an athlete
 * who weighed in this morning on the scale form and then corrected their
 * profile this afternoon has given two real readings, and eating one of them
 * would be this module deciding which of the athlete's measurements counted.
 */

const SETTLE_MS = 1200;

let timer: ReturnType<typeof setTimeout> | null = null;
let pending: number | null = null;
/** The row this module last created, and the day it belongs to. */
let mine: { id: string; day: string } | null = null;

const dayKey = (d: Date): string => d.toISOString().slice(0, 10);

async function post(kg: number): Promise<void> {
  const now = new Date();
  const today = dayKey(now);
  // Supersede our own earlier row for today, so a session of adjusting the
  // figure leaves ONE weigh-in rather than a trail of the values it crossed.
  if (mine && mine.day === today) {
    await sapi(`/api/body?id=${encodeURIComponent(mine.id)}`, "DELETE").catch(() => {});
    mine = null;
  }
  const res = await sapi<{ metric?: { id?: string } }>("/api/body", "POST", {
    weightKg: kg,
    measuredAt: now.toISOString(),
  }).catch(() => null);
  if (res?.metric?.id) mine = { id: res.metric.id, day: today };
  // Every reader of the log shares one cache; without this the figure the
  // athlete just set would not reach the model until the next cold start.
  refreshBodyweight();
}

/**
 * Record a weigh-in once the athlete stops moving the control. Best-effort:
 * signed out, offline, or a failing API leaves the log as it was, and the
 * questionnaire's own copy of the figure carries the screen until it lands.
 */
export function logWeighIn(kg: number): void {
  if (!Number.isFinite(kg) || kg < 25 || kg > 300) return;
  pending = Math.round(kg * 10) / 10;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    const kgToSend = pending;
    pending = null;
    if (kgToSend != null) void post(kgToSend);
  }, SETTLE_MS);
}

/**
 * Record a weigh-in NOW, with no settling — for setup, where the athlete is
 * about to leave the screen and there is no later to write in.
 */
export async function logWeighInNow(kg: number): Promise<void> {
  if (!Number.isFinite(kg) || kg < 25 || kg > 300) return;
  await post(Math.round(kg * 10) / 10);
}

/** Forget which row belongs to this device's editing session — on sign-out, so
 *  the next account can never have a row of ours deleted out from under it. */
export function resetWeighIn(): void {
  if (timer) {
    clearTimeout(timer); // never let a queued weigh-in land against a new account
    timer = null;
  }
  pending = null;
  mine = null;
}
