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

/** ISO timestamp → a compact "time since" label (`just now` / `5m ago` /
 *  `3h ago` / `2d ago`). Never negative (a future instant reads as `just now`). */
export function ago(iso: string, now: number = Date.now()): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** ISO timestamp (or null) → a compact "time until" label (`in 5m` / `in 3h` /
 *  `in 2d`); `—` when null, `due now` once the instant has passed. */
export function until(iso: string | null, now: number = Date.now()): string {
  if (!iso) return "—";
  const s = (new Date(iso).getTime() - now) / 1000;
  if (s < 0) return "due now";
  if (s < 3600) return `in ${Math.ceil(s / 60)}m`;
  if (s < 86400) return `in ${Math.round(s / 3600)}h`;
  return `in ${Math.round(s / 86400)}d`;
}
