import type { BrandAccent } from "./semantic";
/**
 * Readiness feeling — the shared model behind the Readiness picker AND the Today
 * glance strip's middle column. The quick picker offers four feelings
 * (primed / good / flat / wrecked, written as a 1–5 rating into the daily
 * check-in); the strip reflects TODAY's chosen feeling as the SAME minimal face
 * the picker draws (eyes + mood mouth, in the semantic accent colour) rather
 * than a computed score. The face geometry is per-client (web SVG / native
 * Views), but the expression + accent mapping lives here so both agree.
 */

/** Ordered worst → best, matching the readiness picker's four levels. */
export const READINESS_FEELINGS = ["wrecked", "flat", "good", "primed"] as const;
export type ReadinessFeeling = (typeof READINESS_FEELINGS)[number];

/** The mood-shaped mouth for a feeling's face. */
export type ReadinessMouth = "grin" | "smile" | "flat" | "frown";
/** Semantic accent tone (palette key) a feeling's face is drawn in. */
/** The four accents — see semantic.ts BrandAccent. */
export type ReadinessAccent = BrandAccent;

/** Face expression + accent per feeling — one source of truth for both the
 *  picker and the glance strip, on web and native. */
export const READINESS_FACE: Record<ReadinessFeeling, { mouth: ReadinessMouth; accent: ReadinessAccent }> = {
  primed: { mouth: "grin", accent: "lime" },
  good: { mouth: "smile", accent: "blue" },
  flat: { mouth: "flat", accent: "amber" },
  wrecked: { mouth: "frown", accent: "red" },
};

type CheckinScores = {
  energy?: number | null;
  sleep?: number | null;
  soreness?: number | null;
  mood?: number | null;
};

/**
 * Average whichever of the four 1–5 sub-scores are present (or null when none
 * are).
 *
 * NOT THE ATHLETE'S ANSWER TO "HOW READY DO YOU FEEL?". This averages four
 * different questions — readiness, sleep, freshness and mood — into a number
 * nobody reported. Use `quickCheckinFeeling` (checkin-flow.ts) anywhere the
 * result is shown to the athlete as their own report or fed to something that
 * quotes it back ("you're feeling flat today"): every caller in both clients
 * was doing exactly that, and each one contradicted the face the athlete had
 * tapped as soon as they answered the rest of the check-in.
 *
 * Kept for the honest reading it actually describes — the day as a whole,
 * averaged — which is a legitimate thing to want and is what the check-in
 * history charts.
 */
export function checkinRating(c: CheckinScores | null | undefined): number | null {
  if (!c) return null;
  const vals = [c.energy, c.sleep, c.soreness, c.mood].filter(
    (v): v is number => typeof v === "number",
  );
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * The rating a feeling is WRITTEN as — the inverse of `feelingFromRating` for
 * the four the picker can produce. It is the picker's own map stated once
 * (`READINESS_FEELINGS` index + 2, which is what both clients tap through), so
 * anything that has a feeling but not the row it came from — an optimistic tap,
 * a legacy check-in — can still place it on the 1–5 scale the engine speaks.
 */
export function ratingForFeeling(feeling: ReadinessFeeling): number {
  return READINESS_FEELINGS.indexOf(feeling) + 2;
}

/** Map a 1–5 rating to the nearest readiness feeling. */
export function feelingFromRating(rating: number): ReadinessFeeling {
  if (rating >= 4.5) return "primed";
  if (rating >= 3.5) return "good";
  if (rating >= 2.5) return "flat";
  return "wrecked";
}

/** The feeling for a daily check-in, or null if it carries no usable score. */
export function checkinFeeling(c: CheckinScores | null | undefined): ReadinessFeeling | null {
  const rating = checkinRating(c);
  return rating == null ? null : feelingFromRating(rating);
}

/** How today's SUBJECTIVE readiness scales the prescribed working load — the
 *  picker's per-level guidance ("push, add load" … "deload, protect recovery")
 *  made mechanical. A primed athlete earns a touch more; a flat one holds back;
 *  a wrecked one deloads. Applied on top of the progression-signal dose in
 *  prescribeSession, so the one-tap readiness pick actually moves today's load. */
export const READINESS_LOAD_FACTOR: Record<ReadinessFeeling, number> = {
  primed: 1.05,
  good: 1.0,
  flat: 0.94,
  wrecked: 0.85,
};

/** The load multiplier for a feeling — 1.0 (neutral) when none is logged. */
export function readinessLoadFactor(feeling: ReadinessFeeling | null | undefined): number {
  return feeling ? READINESS_LOAD_FACTOR[feeling] : 1;
}
