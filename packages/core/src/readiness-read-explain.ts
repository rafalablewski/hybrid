import {
  CLEARANCE_KEY,
  READ_BOUNDS,
  RECALL_FROM_H,
  RESIDUAL_TAU_H,
  expectedResidual,
  readinessContext,
  readinessNoteKey,
  reportWeight,
  type ReadinessContext,
  type RecoveryCurve,
} from "./feel-timing";
import {
  READINESS_FACE,
  READINESS_LOAD_FACTOR,
  ratingForFeeling,
  type ReadinessAccent,
  type ReadinessFeeling,
} from "./readiness-feeling";
import {
  MAX_READS_PER_DAY,
  MIN_RELOG_GAP_H,
  POST_SESSION_LOCK_H,
  decisiveRead,
  readClearance,
  spentFromReadiness,
  type PlacedRead,
  type ReadGate,
} from "./readiness-reads";

/**
 * WHAT ONE READINESS ANSWER IS ACTUALLY WORTH.
 *
 * The Recover cluster's card leads with one word — "Flat", at display weight —
 * and that word governs the day: it scales the prescribed load, it decides
 * whether a second read is wanted, and it is the input the clearance pair is
 * measured from. Behind it sat a single toggled grey sentence. The Performance
 * tab, meanwhile, puts every figure it prints behind a door that shows the
 * measured inputs, the arithmetic and the caveat (`freshness-explain.ts`,
 * `wearable-explain.ts`) — so the app explained a component of a component of
 * Freshness in full, and explained the answer the athlete actually gave in one
 * line. This module closes that: the SAME treatment, for the reading in
 * Recover.
 *
 * It answers, in the order an athlete asks:
 *
 *   WHAT IS IT     — a subjective report about you right now, on a four-face
 *                    scale, not a computed score. It is the other instrument
 *                    beside Freshness, never a second reading of it.
 *   WHAT'S IN IT   — the measured context: how long after training it was
 *                    given, which lag class that puts it in, how much of the
 *                    session's disturbance the residual model still expects to
 *                    be present at that lag, and what the answer is therefore
 *                    weighted at.
 *   WHAT IT MOVES  — the load ledger, ending on the very percentage the
 *                    prescription applies (and the set a wrecked day sheds).
 *   WHAT IT ISN'T  — the caveat, per feeling, and the clock's own effect.
 *
 * THE LAW, and the reason this has tests: `loadPct` and `setAdj` are the SAME
 * numbers `prescribeSession` applies — both read `READINESS_LOAD_FACTOR` and the
 * wrecked set rule from one place. A sheet that opens onto different arithmetic
 * than the session it explains is worse than no sheet.
 *
 * KEYS, NOT PROSE — every label is an i18n key, so the explanation speaks Polish
 * and German, exactly as the freshness explainer does.
 */

/** How to print a figure. The clients own the glyphs; core owns the meaning. */
export type ReadingUnit =
  /** A bare figure. */
  | "none"
  /** Hours, with the client's own "h". */
  | "hours"
  /** A whole percent. */
  | "percent"
  /** A multiplier — ×0.94. */
  | "factor"
  /** A count that must keep its sign — −1 set. */
  | "signed";

/** One measured input behind the reading. */
export interface ReadingInput {
  /** i18n key for the row's label. */
  key: string;
  /** The figure, or null when `valueKey` names the value instead. */
  value: number | null;
  /** i18n key for a worded value (the lag class, "no session"), or null. */
  valueKey: string | null;
  unit: ReadingUnit;
  /** The row this reading actually turns on. Exactly one row, or none. */
  top: boolean;
}

/** One line of the load arithmetic, in the order it is performed. */
export interface ReadingStep {
  key: string;
  value: number;
  unit: ReadingUnit;
  /** The result line — what the prescription applies. Exactly one step has it. */
  total: boolean;
}

/** The lag class, as a NAME rather than a sentence — the sentence is `noteKey`. */
export const READINESS_CONTEXT_KEY: Record<ReadinessContext, string> = {
  rested: "w.home.read.ctx.rested",
  postSession: "w.home.read.ctx.postSession",
  settling: "w.home.read.ctx.settling",
  recovered: "w.home.read.ctx.recovered",
};

/** The caveat, per feeling: what THIS answer does not claim. Keys, so both
 *  clients say the same thing in every language. */
export const READINESS_LIMIT_KEY: Record<ReadinessFeeling, string> = {
  primed: "w.home.read.limit.primed",
  good: "w.home.read.limit.good",
  flat: "w.home.read.limit.flat",
  wrecked: "w.home.read.limit.wrecked",
};

export interface ReadinessReadExplain {
  feeling: ReadinessFeeling;
  /** The 1–5 as written into the check-in (the picker writes 2…5). */
  value: number;
  /** The face's own accent — read from READINESS_FACE so the sheet's figure and
   *  the card's word can never be painted two different colours. */
  accent: ReadinessAccent;
  /** Epoch ms the answer was given; null when the reading has no read behind it
   *  (a legacy row, or the optimistic tap before the refetch lands). */
  at: number | null;
  /** Hours since the session before it; null when the athlete hadn't trained. */
  hoursSinceSession: number | null;
  context: ReadinessContext;
  /** What the clock does to THIS answer — the sentence the ⓘ used to toggle
   *  inline. Null when there is no recent session to read it against. */
  noteKey: string | null;
  /** The session itself is still the loudest thing in the answer. */
  confounded: boolean;
  /** The measured context, itemised. */
  rows: ReadingInput[];
  /** The load arithmetic, ending on `loadPct`. */
  steps: ReadingStep[];
  /** Whole percent the working load is scaled to. 100 = untouched. */
  loadPct: number;
  /** Work sets added or shed — −1 on a wrecked day, 0 otherwise. */
  setAdj: number;
  /** This is the read today's training is prescribed off. */
  decisive: boolean;
  /** How many reads the day carries. */
  reads: number;
  /** What the day's own pair measured about this athlete's clearance rate, when
   *  the pair can support a verdict at all (which is most days: it can't). */
  clearance: RecoveryCurve | null;
  /** i18n key for that verdict, or null when there is no pair. */
  clearanceKey: string | null;
  /** When another read may be taken, and why not yet. Null off today. */
  gate: ReadGate | null;
  /** The constants the copy names, never hard-coded in a string. */
  consts: {
    /** Hours below which a read still describes the session. */
    immediateH: number;
    /** The residual model's fast time-constant, in hours. */
    tauH: number;
    /** The lag past which a report is recall rather than measurement. */
    recallFromH: number;
    /** The floor between two reads. */
    gapH: number;
    /** How long after a session the next read is held back. */
    lockH: number;
    /** Reads per day, capped. */
    maxReads: number;
  };
}

/**
 * Explain one readiness reading — the answer on the card, not a re-derivation
 * of it.
 *
 * `read` is the placed read being explained (the card's decisive one); when the
 * day carries reads but none was named, the decisive one is used. A reading with
 * NO read behind it is still explainable — the feeling alone determines what the
 * prescription does with it — so the lag-dependent rows simply drop out rather
 * than the sheet refusing to open.
 */
export function readinessReadExplain(opts: {
  feeling: ReadinessFeeling;
  /** The read being explained. Omitted → the day's decisive read. */
  read?: PlacedRead | null;
  /** Every read on the viewed day, in time order. */
  reads?: PlacedRead[];
  /** Today's gate, when the viewed day is today. */
  gate?: ReadGate | null;
  /**
   * Hours since the last session, for a reading with NO read behind it — the
   * fallback the card itself used before this sheet existed. It classifies the
   * reading (and so picks the note), but it is deliberately NOT printed as this
   * answer's lag: we know when the athlete last trained, not when they answered.
   */
  hoursSinceSession?: number | null;
}): ReadinessReadExplain {
  const { feeling } = opts;
  const reads = opts.reads ?? [];
  const read = opts.read ?? decisiveRead(reads);
  const lag = read?.hoursSinceSession ?? null;
  const context: ReadinessContext = read?.context ?? readinessContext(opts.hoursSinceSession ?? null);
  const value = read?.value ?? ratingForFeeling(feeling);
  const spent = spentFromReadiness(value);
  // The residual model's own figures. Both come from feel-timing rather than
  // being recomputed here: `reading.weight` IS `reportWeight(lag)`, and asking
  // for it through the read keeps a stored reading authoritative over a fresh
  // call if the two ever diverge.
  const residual = lag == null ? null : expectedResidual(lag);
  const weight = read?.reading.weight ?? reportWeight(lag);
  const factor = READINESS_LOAD_FACTOR[feeling];
  const setAdj = feeling === "wrecked" ? -1 : 0;
  const decisive = decisiveRead(reads);

  const rows: ReadingInput[] = [];
  // THE LAG, only when a real read carries one. A reading with no read behind it
  // has no clock of its own (see `hoursSinceSession` above), and printing the
  // time since training as though it were this answer's lag would invent the one
  // fact the sheet exists to be honest about.
  if (read) {
    rows.push({
      key: "w.home.read.rowLag",
      value: lag == null ? null : Math.round(lag),
      valueKey: lag == null ? "w.home.today.readNoSession" : null,
      unit: "hours",
      // The lag is what everything else on this list is derived from, so it is
      // the row the reading turns on — unless there was no session to lag from.
      top: lag != null,
    });
  }
  rows.push(
    {
      key: "w.home.read.rowContext",
      value: null,
      valueKey: READINESS_CONTEXT_KEY[context],
      unit: "none",
      top: false,
    },
    {
      key: "w.home.read.rowSpent",
      value: spent,
      valueKey: null,
      unit: "none",
      top: false,
    },
  );
  if (residual != null) {
    rows.push({
      key: "w.home.read.rowResidual",
      value: Math.round(residual * 100),
      valueKey: null,
      unit: "percent",
      top: false,
    });
  }
  rows.push({
    key: "w.home.read.rowWeight",
    value: Math.round(weight * 100),
    valueKey: null,
    unit: "percent",
    top: false,
  });
  if (reads.length > 0) {
    rows.push({
      key: "w.home.read.rowReads",
      value: reads.length,
      valueKey: null,
      unit: "none",
      top: false,
    });
  }

  const steps: ReadingStep[] = [
    { key: "w.home.read.stepBase", value: 100, unit: "percent", total: false },
    { key: "w.home.read.stepFeeling", value: factor, unit: "factor", total: false },
  ];
  if (setAdj !== 0) {
    steps.push({ key: "w.home.read.stepSets", value: setAdj, unit: "signed", total: false });
  }
  steps.push({ key: "w.home.read.stepResult", value: Math.round(factor * 100), unit: "percent", total: true });

  const clearance = readClearance(reads);
  return {
    feeling,
    value,
    accent: READINESS_FACE[feeling].accent,
    at: read?.at ?? null,
    hoursSinceSession: lag,
    context,
    // The two negative feelings are the only ones whose meaning genuinely turns
    // on the clock — the same `low` rule the card's inline note used.
    noteKey: readinessNoteKey(context, feeling === "flat" || feeling === "wrecked"),
    confounded: read?.confounded ?? false,
    rows,
    steps,
    loadPct: Math.round(factor * 100),
    setAdj,
    decisive: read != null && decisive != null && read.at === decisive.at,
    reads: reads.length,
    clearance,
    clearanceKey: clearance ? CLEARANCE_KEY[clearance.clearance] : null,
    gate: opts.gate ?? null,
    consts: {
      immediateH: READ_BOUNDS.immediate,
      tauH: RESIDUAL_TAU_H,
      recallFromH: RECALL_FROM_H,
      gapH: MIN_RELOG_GAP_H,
      lockH: POST_SESSION_LOCK_H,
      maxReads: MAX_READS_PER_DAY,
    },
  };
}
