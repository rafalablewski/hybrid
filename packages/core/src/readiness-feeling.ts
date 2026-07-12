/**
 * Readiness feeling ↔ emoji — the shared mapping for the Today glance strip's
 * middle column. The quick Readiness picker offers four feelings
 * (primed / good / flat / wrecked, written as a 1–5 rating into the daily
 * check-in); the strip reflects TODAY's chosen feeling as an emoji rather than
 * a computed score. Consumed by both clients so the mapping lives in one place.
 */

/** Ordered worst → best, matching the readiness picker's four levels. */
export const READINESS_FEELINGS = ["wrecked", "flat", "good", "primed"] as const;
export type ReadinessFeeling = (typeof READINESS_FEELINGS)[number];

/** The glanceable face for each feeling — a clear happy→struggling gradient. */
export const READINESS_EMOJI: Record<ReadinessFeeling, string> = {
  primed: "😃",
  good: "🙂",
  flat: "😐",
  wrecked: "😫",
};

type CheckinScores = {
  energy?: number | null;
  sleep?: number | null;
  soreness?: number | null;
  mood?: number | null;
};

/** Average the four 1–5 sub-scores of a daily check-in into one rating (or
 *  null when none are present). The quick picker sets all four equal, so this
 *  round-trips the picked level; the full weekly form can mix them. */
export function checkinRating(c: CheckinScores): number | null {
  const vals = [c.energy, c.sleep, c.soreness, c.mood].filter(
    (v): v is number => typeof v === "number",
  );
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Map a 1–5 rating to the nearest readiness feeling. */
export function feelingFromRating(rating: number): ReadinessFeeling {
  if (rating >= 4.5) return "primed";
  if (rating >= 3.5) return "good";
  if (rating >= 2.5) return "flat";
  return "wrecked";
}

/** The emoji for a daily check-in, or null if it carries no usable score. */
export function checkinEmoji(c: CheckinScores): string | null {
  const rating = checkinRating(c);
  return rating == null ? null : READINESS_EMOJI[feelingFromRating(rating)];
}
