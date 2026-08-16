/**
 * Shared presentation formatters — the single source of truth for the little
 * UI string helpers that were previously copy-pasted (and quietly diverging)
 * across the web + mobile clients. Pure; `now` is injectable for tests.
 */

/** Seconds → `m:ss` (clamped at 0 so a negative countdown never renders as
 *  `-1:59`). Used by the workout/interval timers and the run-track stopwatch. */
export function mmss(s: number): string {
  const c = Math.max(0, Math.floor(s));
  return `${Math.floor(c / 60)}:${String(c % 60).padStart(2, "0")}`;
}

/**
 * Seconds → a RACE CLOCK: `m:ss` under an hour, `h:mm:ss` over it.
 *
 * `mmss` alone cannot state a long one — a 1 h 52 min half marathon comes out
 * of it as "112:10", which is a lap count wearing a clock's punctuation. This
 * is the formatter for any figure that is a *finishing time*; a duration the
 * athlete is meant to read as an amount of training ("1h 52min") is
 * formatDuration's job, not this one.
 */
export function clock(s: number): string {
  const c = Math.max(0, Math.floor(s));
  if (c < 3600) return mmss(c);
  const h = Math.floor(c / 3600);
  const m = Math.floor((c % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(c % 60).padStart(2, "0")}`;
}

/** ISO timestamp → a compact "time since" label (`just now` / `5m ago` /
 *  `3h ago` / `2d ago`). Never negative (a future instant reads as `just now`). */
export function ago(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "just now";
  const s = Math.max(0, (now - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** ISO timestamp (or null) → a compact "time until" label (`in 5m` / `in 3h` /
 *  `in 2d`); `—` when null, `due now` once the instant has passed. */
export function until(iso: string | null, now: number = Date.now()): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const s = (t - now) / 1000;
  if (s < 0) return "due now";
  if (s < 3600) return `in ${Math.ceil(s / 60)}m`;
  if (s < 86400) return `in ${Math.round(s / 3600)}h`;
  return `in ${Math.round(s / 86400)}d`;
}
