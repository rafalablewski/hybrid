/**
 * SESSION WRAPPED — the data behind the workout-page "Wrapped" sequence: the
 * free BASICS every athlete sees (sets / reps / volume / time / distance) and
 * the premium FACTS gated behind Full (est-1RM, muscle split, e1RM trend,
 * readiness). One pure model both clients render so the panels agree — and,
 * crucially, so both agree on WHICH figures are honest enough to show.
 *
 * Honesty rule (inherited from done-receipt): only real, derived numbers appear
 * here — no fabricated "power/energy/percentile". A fact that can't be computed
 * from the logged session + history is simply omitted, never invented.
 */
import type { LoggedSession } from "./engines/session";
import { sessionVolume, blockBestE1rm, e1rmSeries } from "./engines/session";
import { volumeByMuscle } from "./engines/records";
import { bwAt, type BodyweightInput } from "./bodyweight";
import { doneReceipt } from "./done-receipt";
import { fmtWeight, fmtTonnage, type WeightUnit } from "./units";
import { benchmarkMetric, type Cohort } from "./benchmarks";

/** A free basic stat — unit lives in the value, label is an i18n key. */
export interface WrappedStat {
  labelKey: string;
  value: string;
}

/** A premium fact — a signed tone lets the client colour a gain/loss. */
export interface WrappedFact {
  labelKey: string;
  value: string;
  tone?: "up" | "down" | "neutral";
}

export interface SessionWrapped {
  /** free — every athlete sees these */
  basics: WrappedStat[];
  /** premium (Full) — real derived analytics, each present only when computable */
  facts: WrappedFact[];
}

/**
 * "Where you stand" — the headline lift's RELATIVE-STRENGTH percentile vs a
 * cohort (sport / sex / age), from the documented synthetic norms in
 * benchmarks.ts. An ESTIMATE (norms-prior-v0), surfaced only when the athlete
 * has a talent profile (sex + age) AND a known bodyweight — never fabricated.
 * `topPct` = "you're in the top N%".
 */
export interface LiftStanding {
  /** 1..99 percentile vs the cohort */
  percentile: number;
  /** "top N%" — the athlete's standing, N = 100 − percentile (≥ 1) */
  topPct: number;
}

export function liftStanding(e1rmKg: number, bodyweightKg: number, cohort: Cohort): LiftStanding | null {
  if (!(e1rmKg > 0) || !(bodyweightKg > 0)) return null;
  const relStrength = e1rmKg / bodyweightKg;
  const b = benchmarkMetric("relStrength", relStrength, cohort);
  const percentile = Math.round(b.percentile);
  return { percentile, topPct: Math.max(1, 100 - percentile) };
}

/** Total working reps across a session's strength sets (warm-ups included — a
 *  rep is a rep for this headline count). */
function totalReps(session: LoggedSession): number {
  // StrengthSet.reps is a display string ("15", "10/leg") — parse the leading
  // integer; a per-side or timed notation contributes its leading number.
  let reps = 0;
  for (const b of session.blocks)
    if (b.kind === "strength") for (const s of b.sets) reps += Number.parseInt(s.reps, 10) || 0;
  return reps;
}

/** The session's heaviest lift (by e1RM at this session's bodyweight). */
function topLift(session: LoggedSession, bwHereKg: number | null): { name: string; e1rm: number } | null {
  let best: { name: string; e1rm: number } | null = null;
  for (const b of session.blocks)
    if (b.kind === "strength") {
      const e = Math.round(blockBestE1rm(b, bwHereKg));
      if (e > 0 && (!best || e > best.e1rm)) best = { name: b.name, e1rm: e };
    }
  return best;
}

const MUSCLE_LABEL_KEY = (m: string) => `muscle.${m}`;

/**
 * Build the Wrapped model for a logged session. `all` is the full history (for
 * the e1RM trend); `bw` is the dated bodyweight lookup so tonnage/e1RM use the
 * athlete's weight at this session's date.
 */
export function sessionWrapped(
  session: LoggedSession,
  all: LoggedSession[],
  opts: { units: WeightUnit; bw?: BodyweightInput },
): SessionWrapped {
  const { units, bw } = opts;
  const bwHereKg = bwAt(bw, session.startedAt);
  const receipt = doneReceipt(session, { bodyweightKg: bwHereKg });
  const reps = totalReps(session);

  // ---- BASICS (free) — the numbers everyone expects, each only when real. ----
  const basics: WrappedStat[] = [];
  basics.push({ labelKey: "summary.sets", value: String(receipt.sets) });
  if (reps > 0) basics.push({ labelKey: "session.wrapped.reps", value: String(reps) });
  if (receipt.tonnageKg > 0) basics.push({ labelKey: "summary.volumeMoved", value: fmtTonnage(receipt.tonnageKg, units) });
  if (receipt.durationMin != null) basics.push({ labelKey: "summary.minutes", value: `${receipt.durationMin}` });
  if (receipt.distanceKm > 0) basics.push({ labelKey: "session.distance", value: `${receipt.distanceKm} km` });

  // ---- FACTS (premium) — real derived analytics only. ----
  const facts: WrappedFact[] = [];
  const top = topLift(session, bwHereKg);
  if (top) {
    facts.push({ labelKey: "session.wrapped.est1rm", value: fmtWeight(top.e1rm, units), tone: "neutral" });
    // e1RM trend for the headline lift: gain from first logged to this session.
    const series = e1rmSeries(all, top.name, bw);
    if (series.length > 1) {
      const delta = Math.round(series[series.length - 1]!.e1rm - series[0]!.e1rm);
      if (delta !== 0)
        facts.push({
          labelKey: "session.wrapped.trend",
          value: `${delta > 0 ? "+" : "−"}${fmtWeight(Math.abs(delta), units)}`,
          tone: delta > 0 ? "up" : "down",
        });
    }
  }
  // Muscle split — the session's most-trained muscle and its tonnage
  // (bodyweight-aware via this session's weight, so dips/pull-ups count).
  const muscles = volumeByMuscle(session.blocks, false, bwHereKg);
  if (muscles.length > 0) {
    const m = muscles[0]!;
    facts.push({ labelKey: MUSCLE_LABEL_KEY(m.muscle), value: fmtWeight(m.volume, units), tone: "neutral" });
  }
  // Readiness the athlete logged for the day, when present.
  if (typeof session.readiness === "number") {
    facts.push({ labelKey: "home.readiness", value: `${session.readiness}`, tone: "neutral" });
  }
  // Total volume also lives here as the anchor premium fact when a lift exists.
  if (receipt.tonnageKg > 0 && top) {
    facts.unshift({ labelKey: "summary.volumeMoved", value: fmtTonnage(receipt.tonnageKg, units), tone: "neutral" });
  }

  return { basics, facts };
}
