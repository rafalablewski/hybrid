/**
 * @hybrid/core — discipline-shaped training plans.
 *
 * The legacy PlanDetail (a gym session of exercise · sets×reps · rest · RPE) was
 * ONE rigid shape. This models plans whose STRUCTURE, LOADING, VOLUME METRIC and
 * PROGRESSION differ by discipline. First discipline implemented:
 * `strength-percent` (Olympic weightlifting / powerlifting) — % of 1RM, ramped
 * sets, complexes, tempo, AM/PM sessions, NL (number-of-lifts) volume counting,
 * and date-anchored peaking. Other disciplines are typed for later (see the
 * `plans-lib` capability + reference/plan-model-redesign.md).
 *
 * Pure: no React, no I/O. Both clients render the SAME planProgramView().
 */

export type PlanDiscipline =
  | "strength-percent" // Olympic WL / Powerlifting — % of 1RM, ramped, NL counting
  | "hypertrophy" // Bodybuilding — sets × reps × load/RPE
  | "endurance" // Running / cycling / swimming — distance / pace / mileage
  | "conditioning"; // Hyrox / CrossFit / circuits

/** One step of a ramped percentage prescription: `(70%/3)3` → 70% × 3 reps × 3 sets. */
export interface PercentStep {
  /** % of the reference lift's 1RM. May exceed 100 (e.g. back squat off the squat
   *  max). `null` = bodyweight / unloaded (the "X" loads, e.g. Good Morning). */
  pct: number | null;
  reps: number;
  sets: number;
  /** complex add-on reps per set — the "+1" jerk in a `4+1` clean & jerk. Omitted when none. */
  plus?: number;
}

export interface PlanLift {
  name: string;
  /** Which 1RM the percentages are off (e.g. "snatch", "backSquat"). Undefined for
   *  bodyweight / "X" lifts (no kg can be derived). */
  ref?: string;
  steps: PercentStep[];
  /** The add-on movement in a complex (e.g. "jerk" for a clean & jerk). */
  complexWith?: string;
  /** Tempo cue, e.g. "down in 12 s". */
  tempo?: string;
  note?: string;
}

/** A prose workout item — the endurance/conditioning analogue of a PlanLift.
 *  No % or sets; the prescription is written text (e.g. "5 × 1' hills",
 *  "3 miles easy", "Long run: 35'"). */
export interface PlanEntry {
  /** workout type, e.g. "Tempo", "Intervals", "Long run", "Rest / cross-train". */
  label: string;
  /** the prescription as written, e.g. "3 × 1-mile tempo, 2' recovery". */
  detail: string;
  /** an alternative or cue, e.g. "or 30' cross-train", "jog down for recovery". */
  note?: string;
}

export type PlanDayKind = "train" | "active-rest" | "rest" | "competition";

export interface PlanSession {
  /** "AM" / "PM" — omitted for a single daily session. */
  label?: "AM" | "PM";
  /** strength-percent content (% of 1RM lifts). */
  lifts?: PlanLift[];
  /** endurance / conditioning content (prose workouts). */
  entries?: PlanEntry[];
}

export interface PlanDay {
  /** 1-based day within the microcycle (week). */
  index: number;
  kind: PlanDayKind;
  title: string;
  sessions: PlanSession[];
}

export interface PlanWeek {
  /** 1-based week. */
  index: number;
  days: PlanDay[];
  note?: string;
}

/** A "fill in your numbers" field — the strength maxes (numeric, derive kg) or the
 *  endurance goal paces (text, reference only). Generalizes the OWL maxes panel so
 *  every discipline shows the same worksheet, appropriately typed. */
export interface ProgramInput {
  key: string;
  label: string;
  kind: "number" | "text";
  /** numeric inputs that derive working load (the strength maxes). */
  derives?: boolean;
  placeholder?: string;
}

export interface PlanProgram {
  id: string;
  discipline: PlanDiscipline;
  /** The athlete's reference inputs (strength maxes → kg, or goal paces). */
  inputs: ProgramInput[];
  /** Heading for the inputs panel. */
  inputsTitle: string;
  /** "competition" → the plan peaks toward a meet/race on the final day. */
  anchor?: "competition";
  /** Word for the peak day + the "peaks to …" note (e.g. "Competition", "Race day"). */
  peakLabel?: string;
  weeks: PlanWeek[];
  progression: string;
  source?: string;
}

// ============================================================
//  Notation parser — the coach's shorthand → structured steps
// ============================================================

// One term, captured in order: optional "(", load (X or NN%), "/", reps, optional
// "+J" complex, optional ")", optional trailing sets. Spaces tolerated throughout.
const TERM = /^\(?\s*(X|\d+)%?\s*\/\s*(\d+)(?:\s*\+\s*(\d+))?\s*\)?\s*(\d+)?$/i;

/**
 * Parse a percentage-notation prescription into ramped steps. Grammar
 * (comma-separated terms):
 *   `(P%/R)S` | `P%/R` | `(P%/R+J)S` | `P%/R+J` | `(X/R)S` | `X/R`
 * where P = percent, R = reps, J = complex add-on reps, S = sets (default 1).
 * Unparseable terms are skipped (defensive against source typos).
 */
export function parsePercentSteps(notation: string): PercentStep[] {
  const steps: PercentStep[] = [];
  for (const raw of notation.split(",")) {
    const term = raw.trim();
    if (!term) continue;
    const m = TERM.exec(term);
    if (!m) continue;
    const pct = /x/i.test(m[1]!) ? null : parseInt(m[1]!, 10);
    const reps = parseInt(m[2]!, 10);
    const plus = m[3] ? parseInt(m[3], 10) : 0;
    const sets = m[4] ? parseInt(m[4], 10) : 1;
    if (!Number.isFinite(reps) || !Number.isFinite(sets) || reps <= 0 || sets <= 0) continue;
    steps.push({ pct, reps, sets, ...(plus ? { plus } : {}) });
  }
  return steps;
}

// ============================================================
//  Volume — NL (number of lifts), the Soviet counting metric
// ============================================================

/** Lifts in a single prescription: Σ (reps + complex add-on) × sets. */
export function liftNL(lift: PlanLift): number {
  return lift.steps.reduce((n, s) => n + (s.reps + (s.plus ?? 0)) * s.sets, 0);
}
export function sessionNL(s: PlanSession): number {
  return (s.lifts ?? []).reduce((n, l) => n + liftNL(l), 0);
}
export function dayNL(d: PlanDay): number {
  return d.sessions.reduce((n, s) => n + sessionNL(s), 0);
}
export function weekNL(w: PlanWeek): number {
  return w.days.reduce((n, d) => n + dayNL(d), 0);
}

// ============================================================
//  Loading — % kept; kg derived from the athlete's 1RM when known
// ============================================================

/** A step's working weight (kg) from the ref lift's 1RM, or null when the load is
 *  bodyweight or the athlete has no max for that lift. Rounded to the nearest kg. */
export function stepKg(step: PercentStep, oneRm: number | undefined | null): number | null {
  if (step.pct == null || !oneRm || oneRm <= 0) return null;
  return Math.round((step.pct / 100) * oneRm);
}

/** Format ONE step, %-first: "70%×3×3", "60%×4+1×4" (complex), "BW×8×4". Appends
 *  the derived kg when a 1RM is supplied ("70%×3 · 95kg"). */
export function formatStep(step: PercentStep, oneRm?: number | null): string {
  const load = step.pct == null ? "BW" : `${step.pct}%`;
  const reps = step.plus ? `${step.reps}+${step.plus}` : `${step.reps}`;
  const base = `${load}×${reps}${step.sets > 1 ? `×${step.sets}` : ""}`;
  const kg = stepKg(step, oneRm);
  return kg != null ? `${base} · ${kg}kg` : base;
}

/** Format a lift's whole ramped prescription, joining steps with " · ". */
export function formatLift(lift: PlanLift, maxes?: Record<string, number>): string {
  const oneRm = lift.ref ? maxes?.[lift.ref] : undefined;
  return lift.steps.map((s) => formatStep(s, oneRm)).join(" · ");
}

// ============================================================
//  View model — one render-ready shape for ALL clients
// ============================================================

export interface ProgramLiftView {
  name: string;
  prescription: string;
  nl: number;
  /** complex / tempo / alternative annotation, or null. */
  note: string | null;
}
export interface ProgramSessionView {
  label: string | null;
  nl: number;
  /** discipline-aware volume label (e.g. "71 lifts"), or null. */
  volume: string | null;
  lifts: ProgramLiftView[];
}
export interface ProgramDayView {
  title: string;
  /** null for an ordinary training day; the label for rest/active-rest/competition. */
  kindLabel: string | null;
  nl: number;
  volume: string | null;
  sessions: ProgramSessionView[];
}
export interface ProgramView {
  /** every week number, for the selector. */
  weeks: number[];
  week: number;
  weekNL: number;
  /** discipline-aware weekly volume label (e.g. "988 lifts"), or null. */
  weekVolume: string | null;
  /** "Peaks to competition" / "Peaks to race day", or null. */
  peakNote: string | null;
  inputs: ProgramInput[];
  inputsTitle: string;
  days: ProgramDayView[];
  progression: string;
}

function liftNote(lift: PlanLift): string | null {
  const bits: string[] = [];
  if (lift.complexWith) bits.push(`+ ${lift.complexWith}`);
  if (lift.tempo) bits.push(lift.tempo);
  return bits.length ? bits.join(" · ") : null;
}

function kindLabelFor(program: PlanProgram, kind: PlanDayKind): string | null {
  if (kind === "train") return null;
  if (kind === "active-rest") return "Active rest";
  if (kind === "rest") return "Rest";
  return program.peakLabel ?? "Competition"; // competition
}

// Volume is discipline-specific: the Soviet plan counts NL (number of lifts);
// endurance/conditioning have no comparable per-day count, so no label is shown
// (the layout stays identical — the counter chip is simply absent).
function volumeLabel(program: PlanProgram, nl: number): string | null {
  if (program.discipline === "strength-percent" && nl > 0) return `${nl} lifts`;
  return null;
}

/**
 * Build the render-ready view for one week of a program — the SAME shape for every
 * discipline, so all clients render any plan identically. `maxes` (numeric inputs
 * keyed by ProgramInput.key) is optional: when present, strength prescriptions also
 * show the derived kg. Clamps the week into range.
 */
export function planProgramView(
  program: PlanProgram,
  opts: { week?: number; maxes?: Record<string, number> } = {},
): ProgramView {
  const weeks = program.weeks.map((w) => w.index);
  const wanted = opts.week ?? weeks[0] ?? 1;
  const week = program.weeks.find((w) => w.index === wanted) ?? program.weeks[0]!;
  const maxes = opts.maxes;

  const days: ProgramDayView[] = week.days.map((d) => {
    const nl = dayNL(d);
    return {
      title: d.title,
      kindLabel: kindLabelFor(program, d.kind),
      nl,
      volume: volumeLabel(program, nl),
      sessions: d.sessions.map((s) => {
        const snl = sessionNL(s);
        const lifts: ProgramLiftView[] = [
          ...(s.lifts ?? []).map((l) => ({
            name: l.name,
            prescription: formatLift(l, maxes),
            nl: liftNL(l),
            note: liftNote(l),
          })),
          ...(s.entries ?? []).map((e) => ({
            name: e.label,
            prescription: e.detail,
            nl: 0,
            note: e.note ?? null,
          })),
        ];
        return { label: s.label ?? null, nl: snl, volume: volumeLabel(program, snl), lifts };
      }),
    };
  });

  const wnl = weekNL(week);
  return {
    weeks,
    week: week.index,
    weekNL: wnl,
    weekVolume: volumeLabel(program, wnl),
    peakNote: program.anchor === "competition" ? `Peaks to ${(program.peakLabel ?? "competition").toLowerCase()}` : null,
    inputs: program.inputs,
    inputsTitle: program.inputsTitle,
    days,
    progression: program.progression,
  };
}
