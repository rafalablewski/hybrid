/**
 * SESSION FEEL — "how did that feel?", asked once, right after the workout.
 *
 * Two taps: how HARD it felt (perceived effort) and how SPENT you are now
 * (fatigue after). They exist because the objective log doesn't say what the
 * session cost the athlete. Two people run 10 km in 40 minutes; one floats
 * home, the other is destroyed. Identical rows in the database, completely
 * different training stimulus — and prescribing the same next session for both
 * is how you break the second one.
 *
 * Perceived effort × duration is `session RPE` (sRPE, Foster 1998): the
 * best-validated field measure of internal training load there is, and the one
 * number that separates those two athletes. That's the model here, kept
 * deliberately small and pure so both clients — and, later, whatever learns
 * from it — read exactly the same definition.
 *
 * Relationship to the other self-report scales in core:
 *  • `readiness-feeling` is asked BEFORE training (how ready am I today).
 *  • `notes` MOOD is an optional private reflection (how do I feel about it).
 *  • This is asked AFTER, about the SESSION, and is the only one that feeds
 *    training load.
 */
import type { LoggedSession } from "./engines/session";
import { doneReceipt } from "./done-receipt";
import { bwAt, type BodyweightInput } from "./bodyweight";
import { glyphMark, type Mark } from "./theme/mark";
import type { BrandAccent } from "./semantic";

/** Palette accent hint; each client maps it to its own theme colour. */
/** The four accents — see semantic.ts BrandAccent. */
export type FeelTone = BrandAccent;

export interface FeelDef {
  /** 1 (easiest) … 5 (maximal). Stored as-is. */
  value: 1 | 2 | 3 | 4 | 5;
  labelKey: string;
  /**
   * The level's drawing. Was an emoji (😌 🙂 😤 🥵 💀 / ⚡ 🙂 😮‍💨 🫠 🥴), and
   * the check-in draws it with NO LABEL beside it, so the mark carries the
   * whole question on its own. The five product faces are one drawn ramp —
   * brow dropping, mouth turning, in order — which an emoji ramp assembled
   * from two different Unicode blocks was not.
   */
  mark: Mark;
  tone: FeelTone;
  /** The 1–10 session-RPE this level maps to (Foster's category-ratio scale). */
  rpe: number;
}

/** How hard the session felt — five levels across the 1–10 sRPE scale. */
export const FEELS: readonly FeelDef[] = [
  { value: 1, labelKey: "session.feel.easy", mark: glyphMark("face-easy"), tone: "blue", rpe: 2 },
  { value: 2, labelKey: "session.feel.steady", mark: glyphMark("face-steady"), tone: "blue", rpe: 4 },
  { value: 3, labelKey: "session.feel.solid", mark: glyphMark("face-solid"), tone: "lime", rpe: 6 },
  { value: 4, labelKey: "session.feel.hard", mark: glyphMark("face-hard"), tone: "amber", rpe: 8 },
  { value: 5, labelKey: "session.feel.allOut", mark: glyphMark("face-spent"), tone: "red", rpe: 10 },
] as const;

export interface FatigueDef {
  value: 1 | 2 | 3 | 4 | 5;
  labelKey: string;
  mark: Mark;
  tone: FeelTone;
}

/** How spent the athlete is AFTER — the recovery side of the same question. */
export const FATIGUES: readonly FatigueDef[] = [
  { value: 1, labelKey: "session.fatigue.fresh", mark: glyphMark("face-easy"), tone: "lime" },
  { value: 2, labelKey: "session.fatigue.good", mark: glyphMark("face-steady"), tone: "lime" },
  { value: 3, labelKey: "session.fatigue.worked", mark: glyphMark("face-solid"), tone: "blue" },
  { value: 4, labelKey: "session.fatigue.tired", mark: glyphMark("face-hard"), tone: "amber" },
  { value: 5, labelKey: "session.fatigue.wrecked", mark: glyphMark("face-spent"), tone: "red" },
] as const;

export const feelDef = (v: number | null | undefined): FeelDef | null =>
  v == null ? null : FEELS.find((f) => f.value === v) ?? null;

export const fatigueDef = (v: number | null | undefined): FatigueDef | null =>
  v == null ? null : FATIGUES.find((f) => f.value === v) ?? null;

/** A valid 1..5 level, or null. Used by the API so a malformed client can't
 *  write a load-poisoning value. */
export function sanitizeFeelLevel(input: unknown): number | null {
  const n = typeof input === "number" ? input : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

/** The 1–10 session RPE a chosen feel level represents. */
export function sessionRpe(feel: number | null | undefined): number | null {
  return feelDef(feel)?.rpe ?? null;
}

/**
 * Internal training load in arbitrary units — sRPE × minutes (Foster). This is
 * the number that makes two identical-looking sessions comparable: the same
 * 40-minute run is 160 AU for the athlete who found it easy and 320 AU for the
 * one who was hanging on.
 *
 * Distinct from `engines/load.sessionLoad`, which INFERS the same quantity from
 * per-block RPEs and a set-count duration heuristic when nobody was asked. This
 * one is the athlete's own answer, so it always wins where it exists.
 */
export function feltSessionLoad(feel: number | null | undefined, minutes: number | null | undefined): number | null {
  const rpe = sessionRpe(feel);
  if (rpe == null || minutes == null || !(minutes > 0)) return null;
  return Math.round(rpe * minutes);
}

/** Coarse band for a load figure, so the UI can say something in words. */
export type LoadBand = "recovery" | "light" | "moderate" | "hard" | "peak";

export function loadBand(load: number): LoadBand {
  if (load < 100) return "recovery";
  if (load < 250) return "light";
  if (load < 450) return "moderate";
  if (load < 700) return "hard";
  return "peak";
}

export const LOAD_BAND_KEY: Record<LoadBand, string> = {
  recovery: "session.load.recovery",
  light: "session.load.light",
  moderate: "session.load.moderate",
  hard: "session.load.hard",
  peak: "session.load.peak",
};

/**
 * One training-load sample — a session reduced to the fields that actually
 * carry signal about the athlete's response. This is the row shape the future
 * model trains on; keeping it here (rather than assembling it ad hoc at each
 * call site) means the definition of "a labelled session" lives in one place.
 */
export interface FeelSample {
  sessionId: string;
  /** ISO start of the session. */
  at: string;
  minutes: number;
  /** 1..5 perceived effort. */
  feel: number;
  /** 1..5 fatigue after, when the athlete answered the second question. */
  fatigue: number | null;
  /** sRPE load, AU. */
  load: number;
  /** total cardio distance in km, 0 for a gym session. */
  distanceKm: number;
  /** strength tonnage in kg, 0 for a cardio session. */
  tonnageKg: number;
}

/**
 * The athlete's own recent load baseline — the mean sRPE load of their labelled
 * sessions in the last `days`, excluding `excludeId` (so a session never
 * compares against itself). Null until there are at least `minSamples`, because
 * a "relative effort" computed against one prior session is noise wearing the
 * costume of an insight.
 */
export function loadBaseline(
  samples: FeelSample[],
  opts: { now?: number; days?: number; excludeId?: string; minSamples?: number } = {},
): number | null {
  const now = opts.now ?? Date.now();
  const days = opts.days ?? 28;
  const minSamples = opts.minSamples ?? 3;
  const since = now - days * 86_400_000;
  const pool = samples.filter(
    (s) => s.sessionId !== opts.excludeId && Date.parse(s.at) >= since && Date.parse(s.at) <= now,
  );
  if (pool.length < minSamples) return null;
  return Math.round(pool.reduce((n, s) => n + s.load, 0) / pool.length);
}

/**
 * This session's load against the athlete's own baseline. `ratio` is 1.0 when
 * it matched their normal; 1.4 means 40% more than they usually do. Personal by
 * construction — the comparison is always to the same athlete, never a cohort.
 */
export function relativeEffort(load: number, baseline: number | null): { ratio: number; pct: number } | null {
  if (baseline == null || !(baseline > 0) || !(load > 0)) return null;
  const ratio = load / baseline;
  return { ratio, pct: Math.round((ratio - 1) * 100) };
}

/**
 * Has the athlete answered the post-workout question for this session? Effort
 * alone counts — the fatigue tap is a second, optional refinement.
 */
export const hasFeel = (s: { feel?: number | null }): boolean => s.feel != null;

/**
 * Turn the athlete's history into labelled training-load samples — every
 * session they answered "how did that feel?" for, reduced to FeelSample. A
 * session with no answer, or no trusted duration, carries no load signal and is
 * simply left out (never defaulted to a middle value — an invented label is
 * worse than a missing one).
 */
export function feelSamples(sessions: LoggedSession[], bw?: BodyweightInput): FeelSample[] {
  const out: FeelSample[] = [];
  for (const s of sessions) {
    const feel = sanitizeFeelLevel(s.feel);
    if (feel == null) continue;
    const receipt = doneReceipt(s, { bodyweightKg: bwAt(bw, s.startedAt) });
    const load = feltSessionLoad(feel, receipt.durationMin);
    if (load == null) continue;
    out.push({
      sessionId: s.id,
      at: s.startedAt,
      minutes: receipt.durationMin!,
      feel,
      fatigue: sanitizeFeelLevel(s.fatigue),
      load,
      distanceKm: receipt.distanceKm,
      tonnageKg: receipt.tonnageKg,
    });
  }
  return out;
}
