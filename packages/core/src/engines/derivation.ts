/**
 * Derivations — "show your work" for the Engine Room.
 *
 * The formula sheet documents the math; a derivation SUBSTITUTES the athlete's
 * actual inputs into it, step by step, so an operator can see exactly what
 * determined a value — why this athlete reads 78 and that one reads 61. Every
 * derivation ends in the same number the live engine produces (drift-guarded
 * by tests that compare the two), because each step is computed with the same
 * exported primitives the engines run on.
 *
 * Also here: the FEELING LAB — the one-tap check-in (primed/good/flat/wrecked)
 * made inspectable: the rating→feeling thresholds and, per feeling, exactly
 * what it does to today's prescribed session for this athlete.
 *
 * Pure data + composition. No UI, no I/O.
 */

import type { Biometrics, MuscleGroup, TrainingLog } from "./types";
import { computeFatigue } from "./fatigue";
import { biometricDeviations, computeReadiness } from "./readiness";
import { computeHpi, enduranceFatigue, HYBRID_WEIGHTS, type HpiWeights } from "./hpi";
import {
  calibrateRisk,
  computeInjuryRisk,
  tissueLoadWindow,
  PRIOR_COEFFS,
  type CalibrationCoeffs,
} from "./injury";
import { ALL_MUSCLES } from "./movements";
import { prescribeSession } from "./prescription";
import {
  READINESS_FEELINGS,
  READINESS_LOAD_FACTOR,
  type ReadinessFeeling,
} from "../readiness-feeling";

/** One substituted-arithmetic step. `math` carries the actual numbers. */
export interface DerivationStep {
  label: string;
  math: string;
  note?: string;
}

export interface Derivation {
  id: string;
  title: string;
  /** the final value, exactly as the live engine reports it */
  result: string;
  steps: DerivationStep[];
}

const f1 = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const f2 = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const sign = (n: number) => (n >= 0 ? `+${f1(n)}` : `−${f1(Math.abs(n))}`);

const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  quads: "quads",
  glutes: "glutes",
  posterior: "posterior",
  back: "back",
  chest: "chest",
  shoulders: "shoulders",
  triceps: "triceps",
};

/** Readiness, derived step by step from the athlete's own inputs. */
export function deriveReadiness(log: TrainingLog, bio?: Biometrics): Derivation {
  const fatigue = computeFatigue(log);
  const vals = ALL_MUSCLES.map((m) => fatigue.muscles[m]);
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  const base = 100 - avg * 0.7;
  const live = computeReadiness(fatigue, bio);

  const steps: DerivationStep[] = [
    {
      label: "Per-muscle fatigue (decayed, normalized 0..100)",
      math: ALL_MUSCLES.map((m) => `${MUSCLE_LABEL[m]} ${fatigue.muscles[m]}`).join(", "),
      note: "computeFatigue: each session doses the muscles it touches, halving every 2 days",
    },
    {
      label: "Average muscle fatigue",
      math: `(${vals.join(" + ")}) / ${vals.length} = ${f1(avg)}`,
    },
    {
      label: "Base readiness",
      math: `100 − 0.7 × ${f1(avg)} = ${f1(base)}`,
    },
  ];

  if (bio) {
    for (const d of biometricDeviations(bio)) {
      const m = bio[d.metric];
      const name = d.metric === "hrv" ? "HRV" : d.metric === "restingHr" ? "resting HR" : "sleep";
      steps.push({
        label: `Wearable – ${name}`,
        math: `(${f1(m.today)} − ${f1(m.baseline)}) / ${f1(m.baseline)} = ${sign(d.dev * 100)}% → × ${
          d.metric === "restingHr" ? "−" : ""
        }${d.weight} → ${sign(d.contribution)}`,
        note: `deviation from this athlete's own baseline${d.metric === "restingHr" ? " (sign flipped: up = worse)" : ""}`,
      });
    }
    const raw = biometricDeviations(bio).reduce((a, d) => a + d.contribution, 0);
    steps.push({
      label: "Wearable adjustment",
      math: `round(clamp(${f1(raw)}, −15, +15)) = ${sign(live.bioAdj)}`,
    });
  } else {
    steps.push({ label: "Wearable adjustment", math: "no signals → +0" });
  }

  steps.push({
    label: "Final score",
    math: `clamp(round(${f1(base)} ${sign(live.bioAdj)}), 35, 98) = ${live.score}`,
  });

  return { id: "readiness", title: "Readiness", result: `${live.score} / 100`, steps };
}

/** HPI, derived step by step (mirrors computeHpi's exact rounding order). */
export function deriveHpi(
  log: TrainingLog,
  bio?: Biometrics,
  weights: HpiWeights = HYBRID_WEIGHTS,
): Derivation {
  const fatigue = computeFatigue(log);
  const vals = ALL_MUSCLES.map((m) => fatigue.muscles[m]);
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  const total = fatigue.systems.anaerobic + fatigue.systems.threshold + fatigue.systems.aerobic;
  const live = computeHpi(fatigue, bio, weights);
  const { strength: S, endurance: E, recovery: R } = live.components;
  const wSum = weights.strength + weights.endurance || 1;
  const base = (weights.strength * S + weights.endurance * E) / wSum;

  const gaps = { strength: 100 - S, endurance: 100 - E, recovery: R < 0 ? -R * 2 : 0 };

  return {
    id: "hpi",
    title: "HPI (Hybrid Performance Index)",
    result: `${live.score} / 100 (${live.band})`,
    steps: [
      {
        label: "Strength freshness S",
        math: `100 − round(${f1(avg)}) = ${S}`,
        note: "inverse of average muscle fatigue",
      },
      {
        label: "Endurance freshness E",
        math: `energy-system load ${f1(total)} → fatigue 100 × (1 − e^(−${f1(total)}/90)) = ${enduranceFatigue(fatigue)} → E = ${E}`,
      },
      {
        label: "Recovery nudge R",
        math: bio ? `wearable adjustment = ${sign(R)}` : "no signals → +0",
      },
      {
        label: "Weighted blend",
        math: `(${weights.strength} × ${S} + ${weights.endurance} × ${E}) / ${f2(wSum)} = ${f1(base)}`,
      },
      {
        label: "Final score",
        math: `clamp(round(${f1(base)} ${sign(R)}), 0, 100) = ${live.score}`,
      },
      {
        label: "Limiter",
        math: `gaps to fully-ready – strength ${f1(gaps.strength)}, endurance ${f1(gaps.endurance)}, recovery ${f1(gaps.recovery)} → ${live.limiter}`,
        note: "a recovery drag counts double; the largest gap is the limiter",
      },
    ],
  };
}

/** One tissue's injury risk, derived step by step. */
export function deriveTissueRisk(
  log: TrainingLog,
  tissue: MuscleGroup,
  bio?: Biometrics,
  coeffs: CalibrationCoeffs = PRIOR_COEFFS,
  spikeOnset = 1.3,
): Derivation {
  const live = computeInjuryRisk(log, bio, coeffs, { spikeOnset });
  const t = live.tissues.find((x) => x.tissue === tissue)!;
  const acute = tissueLoadWindow(log, 7)[tissue];
  const chronic = tissueLoadWindow(log, 28)[tissue];
  const chronicWeekly = chronic / 4;
  const fatigue = computeFatigue(log).muscles[tissue];
  const sat = spikeOnset + 0.9;

  const spike = t.drivers.find((d) => d.kind === "spike")?.contribution ?? 0;
  const load = t.drivers.find((d) => d.kind === "load")?.contribution ?? 0;
  const detrain = t.drivers.find((d) => d.kind === "detrain")?.contribution ?? 0;
  const recovery = t.drivers.find((d) => d.kind === "recovery")?.contribution ?? 0;

  const steps: DerivationStep[] = [
    {
      label: "Acute load (last 7 days)",
      math: `${f1(acute)} au`,
      note: "undecayed dose to this tissue: (hardSets × 4 or minutes × 0.9) × RPE/10",
    },
    {
      label: "Chronic weekly load (28-day average)",
      math: `${f1(chronic)} / 4 = ${f1(chronicWeekly)} au`,
    },
    t.enoughHistory
      ? { label: "ACWR", math: `${f1(acute)} / ${f1(chronicWeekly)} = ${f2(t.acwr)}` }
      : { label: "ACWR", math: "no chronic history → treated as 1 (not trusted)" },
    {
      label: `Workload spike (onset ${f2(spikeOnset)})`,
      math: `ramp(${f2(t.acwr)}, ${f2(spikeOnset)}, ${f2(sat)}) × 55 = ${spike}`,
      note: spikeOnset !== 1.3 ? "personal onset in effect (see the Personal model card)" : undefined,
    },
    {
      label: "Absolute load",
      math: `(${fatigue} / 100) × 28 = ${load}`,
    },
    {
      label: "Detraining",
      math: `ramp(0.8 − ${f2(t.acwr)}, 0, 0.6) × 18 = ${detrain}`,
    },
    {
      label: "Recovery suppression",
      math: recovery > 0 ? `max(0, −bioAdj) × 1.2 = ${recovery}` : "recovery not suppressed → 0",
    },
    {
      label: "Risk score",
      math: `clamp(${spike} + ${load} + ${detrain} + ${recovery}, 0, 100) = ${t.risk} (${t.band})`,
      note: "bands at 30 / 50 / 70",
    },
    {
      label: "Calibrated probability",
      math: `σ(${f2(coeffs.intercept)} + ${f2(coeffs.slope)} × ${t.risk}/100) = ${(t.prob * 100).toFixed(1)}%`,
    },
  ];

  return {
    id: `tissue-${tissue}`,
    title: `Injury risk – ${MUSCLE_LABEL[tissue]}`,
    result: `${t.risk} / 100 (${t.band}), p(injury) ${(t.prob * 100).toFixed(1)}%`,
    steps,
  };
}

// ---------------------------------------------------------------------------
// Feeling lab — the one-tap check-in made inspectable.
// ---------------------------------------------------------------------------

/** Rating → feeling thresholds (mirrors feelingFromRating; drift-guarded). */
export const FEELING_THRESHOLDS: { feeling: ReadinessFeeling; range: string }[] = [
  { feeling: "primed", range: "rating ≥ 4.5" },
  { feeling: "good", range: "3.5 ≤ rating < 4.5" },
  { feeling: "flat", range: "2.5 ≤ rating < 3.5" },
  { feeling: "wrecked", range: "rating < 2.5" },
];

/** What one feeling does to today's prescription for THIS athlete. */
export interface FeelingImpact {
  feeling: ReadinessFeeling;
  /** load multiplier from the check-in (1.05 / 1.0 / 0.94 / 0.85) */
  factor: number;
  /** sets shed by the check-in (wrecked → −1) */
  setAdj: number;
  /** the prescribed primary lift under this feeling */
  move: string;
  sets: number;
  reps: string;
  /** working load display ("BW" for bodyweight tiers) */
  load: string;
  /** true when the feeling actually moved the session vs neutral */
  moved: boolean;
}

/**
 * Run the REAL prescription engine once per feeling (plus neutral) so the
 * operator sees, in kilograms and sets, what each one-tap answer does to
 * today's session for the selected athlete.
 */
export function feelingImpacts(log: TrainingLog, bio?: Biometrics): FeelingImpact[] {
  const order: ReadinessFeeling[] = [...READINESS_FEELINGS].reverse(); // best → worst
  return order.map((feeling) => {
    const rx = prescribeSession(log, bio, { subjectiveReadiness: feeling });
    const strength = rx.blocks.find((b) => b.kind === "strength");
    const firstSet = strength?.kind === "strength" ? strength.sets[0] : undefined;
    return {
      feeling,
      factor: READINESS_LOAD_FACTOR[feeling],
      setAdj: feeling === "wrecked" ? -1 : 0,
      move: rx.primary.move,
      sets: strength?.kind === "strength" ? strength.sets.length : 0,
      reps: firstSet?.reps ?? "",
      load: firstSet?.load ?? "",
      moved: rx.readinessAdjust !== undefined,
    };
  });
}
