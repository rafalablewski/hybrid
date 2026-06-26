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
 *  "3 miles easy", "Long run: 35'").
 *
 *  For hypertrophy exercises, supply the structured fields (`sets`, `reps`,
 *  `rpe`, `weightRef`) instead of writing prescription text into `detail` —
 *  `planProgramView` will derive the formatted prescription automatically and
 *  substitute the athlete's working weight when provided. */
export interface PlanEntry {
  /** workout type, e.g. "Tempo", "Intervals", "Long run", "Rest / cross-train". */
  label: string;
  /** the prescription as written, e.g. "3 × 1-mile tempo, 2' recovery".
   *  Ignored when `sets` is present — the prescription is computed instead. */
  detail: string;
  /** an alternative or cue, e.g. "or 30' cross-train", "jog down for recovery". */
  note?: string;

  // ── hypertrophy structured fields ───────────────────────────────────────
  /** Fixed set count. When present, `detail` is ignored and the prescription
   *  is derived from these fields. */
  sets?: number;
  /** Fixed rep target, or "AMRAP" for all-out sets. */
  reps?: number | "AMRAP";
  /** Target RPE (1–10). */
  rpe?: number;
  /** Key into the athlete's `maxes` / program inputs — when the athlete
   *  fills in a weight for this key, it appears in the prescription. */
  weightRef?: string;
  /** Free-text sets×reps scheme for an accessory whose volume is a RANGE or
   *  time (e.g. "3–5 × 3–5", "3 × 30–60 s"). When present the entry is a
   *  structured gym accessory: it shows in the Sets×Reps column / prescription
   *  and groups with the strength work, not the prose runs. */
  scheme?: string;
  /** Conditioning effort tier — the discipline's intensity signal (a circuit has
   *  no % or RPE), mapped to the shared intensity colour (conditioningColor). Lets
   *  a circuit show the same load/effort wave the % and RPE plans do: a warm-up
   *  reads cool, the work blocks build, the finisher peaks. */
  effort?: ConditioningEffort;
}

/** Conditioning intensity tiers, low→high — the circuit analogue of a % band or
 *  an RPE. Authored per block (warm-up = easy … finisher = max). */
export type ConditioningEffort = "recover" | "easy" | "moderate" | "hard" | "max";

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

/** Brand colour token keyed to lift intensity, shared so every client colours
 *  loads / RPE identically (web hex/CSS-var, mobile palette). */
export type LoadColor = "blue" | "lime" | "amber" | "red" | "ash";

/** Map a working % to its intensity colour. Bodyweight (`null`) → ash. Thresholds
 *  live here (not per-client) so the colour wave can't drift. */
export function loadColor(pct: number | null): LoadColor {
  if (pct == null) return "ash";
  if (pct < 65) return "blue";
  if (pct < 75) return "lime";
  if (pct < 85) return "amber";
  return "red";
}

/** Map a target RPE to its intensity colour (the bodybuilding heat column). */
export function rpeColor(rpe: number): LoadColor {
  if (rpe >= 10) return "red";
  if (rpe >= 9) return "amber";
  if (rpe >= 8) return "blue";
  return "ash";
}

/** Map an endurance workout label to a type colour (the running type-dot):
 *  rest → ash, long run → red, hard (tempo/intervals/hills/speed) → amber,
 *  everything else (easy/recovery) → blue. */
export function workoutColor(label: string): LoadColor {
  const s = label.toLowerCase();
  if (s.includes("rest")) return "ash";
  if (s.includes("long")) return "red";
  if (/tempo|interval|hill|speed|race|threshold|fartlek/.test(s)) return "amber";
  return "blue";
}

/** Map a conditioning effort tier to its intensity colour — the circuit's wave,
 *  on the SAME blue→lime→amber→red scale the % loads ride, with recover → ash.
 *  Thresholds live here (not per-client) so the wave can't drift. */
export function conditioningColor(effort: ConditioningEffort): LoadColor {
  switch (effort) {
    case "recover": return "ash";
    case "easy": return "blue";
    case "moderate": return "lime";
    case "hard": return "amber";
    case "max": return "red";
  }
}

/** Colour a sets×reps prescription by its TRAINING ZONE — the hypertrophy /
 *  kettlebell analogue of loadColor (the %-wave) and rpeColor (the heat bar):
 *  low reps lean strength, mid is hypertrophy, high reps / timed holds lean
 *  endurance. Derived from the prescription's OWN rep count — nothing invented —
 *  so a sets×reps plan rides the same coloured intensity wave the % and RPE plans
 *  do. Thresholds live here so the wave can't drift across clients. */
export function repZoneColor(reps: number): LoadColor {
  if (reps <= 6) return "amber"; // strength
  if (reps <= 12) return "lime"; // hypertrophy
  return "blue"; // endurance
}

/** The rep number a scheme prescribes (e.g. 20 from "3 × 20"; reps should be single
 *  numbers per the project rule), or "time" for a duration/hold ("4 × 30 s"), or
 *  null when none is parseable. Reads only the rep side (after the ×), so per-side
 *  notes ("10/leg") survive. If a range ever slips through, takes the LAST number
 *  (the top of the range) to honour the collapse-to-top rule. */
function schemeRepCount(scheme: string): number | "time" | null {
  const after = scheme.split(/[×x]/i).pop()?.trim() ?? "";
  if (!after) return null;
  if (/\d+\s*(s|sec|secs|min|mins)\b/i.test(after)) return "time";
  const m = after.match(/\d+/g);
  return m ? parseInt(m[m.length - 1]!, 10) : null;
}

/** Training-zone colour for a sets×reps scheme (timed holds → endurance/blue). */
function schemeZoneColor(scheme: string): LoadColor | undefined {
  const r = schemeRepCount(scheme);
  if (r === "time") return "blue";
  return typeof r === "number" ? repZoneColor(r) : undefined;
}

/** One step of a strength-percent lift's ramp, render-ready for the coloured
 *  prescription (the load is coloured by intensity; the rest stays muted). */
export interface ProgramStepView {
  /** "60%" or "BW". */
  load: string;
  /** the % number (null for bodyweight) — used to order the matrix columns. */
  pct: number | null;
  /** intensity colour for the load token. */
  color: LoadColor;
  /** the reps×sets tail, e.g. "×4×3", "×4+1×4" (complex kept). */
  detail: string;
  /** derived working weight ("95kg") when a 1RM is known, else null. */
  kg: string | null;
}

export interface ProgramLiftView {
  name: string;
  /** Combined prescription string — always set; used as the single-column
   *  fallback for strength-percent and endurance entries. */
  prescription: string;
  nl: number;
  /** complex / tempo / alternative annotation, or null. */
  note: string | null;
  /** Per-step ramp for strength-percent lifts (coloured loads). Absent for
   *  prose / hypertrophy entries. */
  steps?: ProgramStepView[];
  // ── hypertrophy structured fields (present when the entry has sets/rpe) ──
  /** "4×6" or "4×AMRAP" — split from prescription for tabular display. */
  setsReps?: string;
  /** "80 kg" when the athlete's weight is known, null otherwise. */
  weight?: string | null;
  /** Target RPE (8 / 9 / 10). Presence signals that tabular columns apply. */
  rpe?: number;
  /** Conditioning intensity colour (from the entry's effort tier) — the circuit's
   *  load-wave equivalent. Present only on conditioning entries; the renderer
   *  colours the prescription / dot with it, the way % loads and RPE are coloured. */
  intensity?: LoadColor;
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
  /** the plan's discipline — informational (the renderer now chooses its layout
   *  from CONTENT: an all-prose week → one week card; any gym work → per-day
   *  cards, hybrid days split into Run/Strength blocks). */
  discipline: PlanDiscipline;
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

/** A lift is "gym" when it carries structured loading (a %-ramp, sets×reps, or
 *  RPE); otherwise it's a prose workout (a run / cross-train). Shared so every
 *  client groups a day's content identically. */
export const isGymLift = (l: ProgramLiftView): boolean => !!(l.steps && l.steps.length) || l.rpe != null || l.setsReps != null;
export const isProseLift = (l: ProgramLiftView): boolean => !isGymLift(l);

/** The three content kinds a day can mix, each rendered in its own block so the
 *  formats never collide: `percent` (%-of-1RM barbell work — the %-ramp), `rpe`
 *  (classic sets×reps×RPE accessory — the heat table), `run` (prose workout). */
export type LiftKind = "run" | "percent" | "rpe";
export function liftKind(l: ProgramLiftView): LiftKind {
  if (l.steps && l.steps.length) return "percent";
  if (l.rpe != null || l.setsReps != null) return "rpe";
  return "run";
}

/** Day-header summary: the discipline volume when present ("160 lifts",
 *  "5 exercises"), else a run/lift breakdown for a hybrid day ("1 run · 3 lifts"). */
export function dayContentSummary(day: ProgramDayView): string | null {
  if (day.volume) return day.volume;
  const lifts = day.sessions.flatMap((s) => s.lifts);
  const runs = lifts.filter((l) => isProseLift(l) && !/rest/i.test(l.name)).length;
  const gym = lifts.filter(isGymLift).length;
  const parts: string[] = [];
  if (runs) parts.push(`${runs} run${runs === 1 ? "" : "s"}`);
  if (gym) parts.push(`${gym} lift${gym === 1 ? "" : "s"}`);
  return parts.join(" · ") || null;
}

/** Format a hypertrophy (or prose) entry's prescription.
 *  Structured hypo entries → "4×6 · 80 kg · @9" (or without kg when unknown).
 *  Prose entries (endurance / conditioning) → detail string unchanged. */
function formatEntry(e: PlanEntry, maxes?: Record<string, number>): string {
  if (e.scheme != null) return e.rpe != null ? `${e.scheme} · @${e.rpe}` : e.scheme;
  if (e.sets == null) return e.detail;
  const reps = e.reps === "AMRAP" ? "AMRAP" : `${e.reps ?? ""}`;
  const parts: string[] = [`${e.sets}×${reps}`];
  const kg = e.weightRef ? maxes?.[e.weightRef] : undefined;
  if (kg) parts.push(`${kg} kg`);
  if (e.rpe != null) parts.push(`@${e.rpe}`);
  return parts.join(" · ");
}

/** Render-ready per-step breakdown for a strength-percent lift — the load token
 *  carries its intensity colour; the reps×sets tail + derived kg stay separate. */
function liftStepViews(lift: PlanLift, maxes?: Record<string, number>): ProgramStepView[] {
  const oneRm = lift.ref ? maxes?.[lift.ref] : undefined;
  return lift.steps.map((s) => {
    const reps = s.plus ? `${s.reps}+${s.plus}` : `${s.reps}`;
    const kg = stepKg(s, oneRm);
    return {
      load: s.pct == null ? "BW" : `${s.pct}%`,
      pct: s.pct,
      color: loadColor(s.pct),
      detail: `×${reps}${s.sets > 1 ? `×${s.sets}` : ""}`,
      kg: kg != null ? `${kg}kg` : null,
    };
  });
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
// hypertrophy AND conditioning count movements/exercises (a circuit's natural
// unit); endurance has no comparable count, so no label is shown (the layout
// stays identical — the chip is simply absent).
function volumeLabel(program: PlanProgram, nl: number, items: number): string | null {
  if (program.discipline === "strength-percent") return nl > 0 ? `${nl} lifts` : null;
  if (program.discipline === "hypertrophy" || program.discipline === "conditioning")
    return items > 0 ? `${items} exercise${items === 1 ? "" : "s"}` : null;
  return null;
}

/** Count of prescribed items (lifts + prose entries) in a session. */
function sessionItems(s: PlanSession): number {
  return (s.lifts?.length ?? 0) + (s.entries?.length ?? 0);
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
    const dItems = d.sessions.reduce((n, s) => n + sessionItems(s), 0);
    return {
      title: d.title,
      kindLabel: kindLabelFor(program, d.kind),
      nl,
      volume: volumeLabel(program, nl, dItems),
      sessions: d.sessions.map((s) => {
        const snl = sessionNL(s);
        const lifts: ProgramLiftView[] = [
          ...(s.lifts ?? []).map((l) => ({
            name: l.name,
            prescription: formatLift(l, maxes),
            nl: liftNL(l),
            note: liftNote(l),
            steps: liftStepViews(l, maxes),
          })),
          ...(s.entries ?? []).map((e) => {
            const kg = e.weightRef ? maxes?.[e.weightRef] : undefined;
            const setsReps =
              e.scheme != null
                ? e.scheme
                : e.sets != null
                  ? `${e.sets}×${e.reps === "AMRAP" ? "AMRAP" : (e.reps ?? "")}`
                  : undefined;
            // Intensity colour: an explicit conditioning effort tier wins; else a
            // sets×reps scheme without an RPE rides the training-zone wave.
            const intensity = e.effort
              ? conditioningColor(e.effort)
              : e.rpe == null && e.scheme != null
                ? schemeZoneColor(e.scheme)
                : undefined;
            return {
              name: e.label,
              prescription: formatEntry(e, maxes),
              nl: 0,
              note: e.note ?? null,
              ...(setsReps != null ? { setsReps } : {}),
              ...(setsReps != null ? { weight: kg ? `${kg} kg` : null } : {}),
              ...(e.rpe != null ? { rpe: e.rpe } : {}),
              ...(intensity ? { intensity } : {}),
            };
          }),
        ];
        return { label: s.label ?? null, nl: snl, volume: volumeLabel(program, snl, sessionItems(s)), lifts };
      }),
    };
  });

  const wnl = weekNL(week);
  const wItems = week.days.reduce((n, d) => n + d.sessions.reduce((m, s) => m + sessionItems(s), 0), 0);
  return {
    discipline: program.discipline,
    weeks,
    week: week.index,
    weekNL: wnl,
    weekVolume: volumeLabel(program, wnl, wItems),
    peakNote: program.anchor === "competition" ? `Peaks to ${(program.peakLabel ?? "competition").toLowerCase()}` : null,
    inputs: program.inputs,
    inputsTitle: program.inputsTitle,
    days,
    progression: program.progression,
  };
}
