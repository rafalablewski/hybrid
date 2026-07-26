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

/** A session's time-of-day band. "AM" / "MID" / "PM" for a two- or three-a-day;
 *  omitted when the plan doesn't split a day by clock (an untimed day's sessions
 *  are distinguished by ORDINAL instead — "Training 1 / 2 / 3"). */
export type SessionTimeOfDay = "AM" | "MID" | "PM";

export interface PlanSession {
  /** "AM" / "MID" / "PM" — omitted for a single daily session, or for an untimed
   *  multi-session day (which the UI numbers "Training 1/2/3" from the ordinal). */
  label?: SessionTimeOfDay;
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
  return kg != null ? `${base} (${kg}kg)` : base;
}

/** Format a lift's whole ramped prescription, joining ramp steps with a comma
 *  (a sequence of working sets — no middot separators). */
export function formatLift(lift: PlanLift, maxes?: Record<string, number>): string {
  const oneRm = lift.ref ? maxes?.[lift.ref] : undefined;
  return lift.steps.map((s) => formatStep(s, oneRm)).join(", ");
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

/** The accent colour for a day's session marker — so the SAME session reads in
 *  the same hue on every surface (the Plans program table + the Today week-rail
 *  can't drift). AM/MID/PM get fixed hues; an untimed session cycles by ordinal
 *  so a "Training 1 / 2 / 3" day still reads as three distinct blocks. */
export function sessionColor(label: string | null | undefined, index: number): LoadColor {
  if (label === "AM") return "lime";
  if (label === "MID") return "amber";
  if (label === "PM") return "blue";
  return (["lime", "amber", "blue"] as const)[index % 3]!;
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
  /** the reps token alone ("4", "4+1") — the quiet-notation cell leads with it. */
  reps: string;
  /** set count (1 when the term had no set multiplier). */
  sets: number;
  /** lifts in this step — (reps + plus) × sets, the NL share of the step. */
  nl: number;
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
  /** the athlete's 1RM this lift's percentages are off ("98 kg"), when known —
   *  surfaced by the exercise sheet so a % row can state its reference. */
  oneRm?: string | null;
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
  return parts.join(", ") || null;
}

/** Format a hypertrophy (or prose) entry's prescription.
 *  Structured hypo entries → "4×6 · 80 kg · @9" (or without kg when unknown).
 *  Prose entries (endurance / conditioning) → detail string unchanged. */
function formatEntry(e: PlanEntry, maxes?: Record<string, number>): string {
  if (e.scheme != null) return e.rpe != null ? `${e.scheme} @${e.rpe}` : e.scheme;
  if (e.sets == null) return e.detail;
  const reps = e.reps === "AMRAP" ? "AMRAP" : `${e.reps ?? ""}`;
  const parts: string[] = [`${e.sets}×${reps}`];
  const kg = e.weightRef ? maxes?.[e.weightRef] : undefined;
  if (kg) parts.push(`${kg} kg`);
  if (e.rpe != null) parts.push(`@${e.rpe}`);
  return parts.join(" ");
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
      reps,
      sets: s.sets,
      nl: (s.reps + (s.plus ?? 0)) * s.sets,
      kg: kg != null ? `${kg}kg` : null,
    };
  });
}

function liftNote(lift: PlanLift): string | null {
  const bits: string[] = [];
  if (lift.complexWith) bits.push(`+ ${lift.complexWith}`);
  if (lift.tempo) bits.push(lift.tempo);
  return bits.length ? bits.join(", ") : null;
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
          ...(s.lifts ?? []).map((l) => {
            const oneRm = l.ref ? maxes?.[l.ref] : undefined;
            return {
              name: l.name,
              prescription: formatLift(l, maxes),
              nl: liftNL(l),
              note: liftNote(l),
              steps: liftStepViews(l, maxes),
              ...(oneRm ? { oneRm: `${oneRm} kg` } : {}),
            };
          }),
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

// ============================================================
//  Schedule table — the quiet-matrix view (shared by both clients)
// ============================================================
//
// The programme day table's redesign logic lives HERE so web and mobile cannot
// drift: which columns a % matrix has (and which lifts fall out of the grid as
// full-width outlier rows), how intensity maps to ink, the day-header pulse,
// the accordion row's plain-words summary, and the exercise sheet's wording.

/** One column of the % matrix — the load token and its order key. */
export interface MatrixColumn {
  load: string;
  pct: number | null;
  color: LoadColor;
}

/**
 * The % matrix, with phantom columns removed. A lift is an OUTLIER when the
 * group has other lifts and NONE of its loads is shared with any other lift —
 * keeping it in the grid would add lanes only it uses (the lone bodyweight
 * Good Morning stretching an empty BW column across every row). Outliers drop
 * out of the grid and render as full-width prose rows; `before` holds the ones
 * authored ahead of the first grid lift, `after` the rest, so the authored
 * exercise order survives as closely as one contiguous grid allows.
 * If EVERY lift would be an outlier (no shared loads at all) none are pulled —
 * a grid is still the honest shape for a single lift or a fully-shared ramp.
 */
export interface PercentMatrixView {
  cols: MatrixColumn[];
  rows: ProgramLiftView[];
  before: ProgramLiftView[];
  after: ProgramLiftView[];
}

export function percentMatrixView(lifts: ProgramLiftView[]): PercentMatrixView {
  const users = new Map<string, number>();
  for (const l of lifts) {
    const loads = new Set((l.steps ?? []).map((st) => st.load));
    for (const load of loads) users.set(load, (users.get(load) ?? 0) + 1);
  }
  const isOutlier = (l: ProgramLiftView) =>
    lifts.length > 1 && (l.steps ?? []).length > 0 && (l.steps ?? []).every((st) => (users.get(st.load) ?? 0) <= 1);
  let out = lifts.map(isOutlier);
  if (out.every(Boolean)) out = out.map(() => false);
  const rows = lifts.filter((_, i) => !out[i]);
  const firstRow = lifts.findIndex((_, i) => !out[i]);
  const before = lifts.filter((_, i) => out[i] && i < firstRow);
  const after = lifts.filter((_, i) => out[i] && i > firstRow);
  const colMap = new Map<string, MatrixColumn>();
  for (const l of rows)
    for (const st of l.steps ?? [])
      if (!colMap.has(st.load)) colMap.set(st.load, { load: st.load, pct: st.pct, color: st.color });
  const cols = [...colMap.values()].sort((a, b) => (a.pct ?? 1e9) - (b.pct ?? 1e9));
  return { cols, rows, before, after };
}

/** An outlier's full-width prescription, in words: "bodyweight 8 ×4",
 *  "90% 1 ×3". Steps join with a comma; the renderer styles the × dim. */
export function outlierPrescription(lift: ProgramLiftView): string {
  return (lift.steps ?? [])
    .map((st) => `${st.load === "BW" ? "bodyweight" : st.load} ${st.reps}${st.sets > 1 ? ` ×${st.sets}` : ""}`)
    .join(", ");
}

/** The heaviest % prescribed anywhere in the day, or null when the day holds
 *  no %-work. The ink ramp accents exactly this load. */
export function dayMaxPct(day: ProgramDayView): number | null {
  let max: number | null = null;
  for (const s of day.sessions)
    for (const l of s.lifts)
      for (const st of l.steps ?? [])
        if (st.pct != null && (max == null || st.pct > max)) max = st.pct;
  return max;
}

/** Ink tier for a load within its day — the monochrome intensity ramp that
 *  replaces the per-column rainbow. `top` is the day's heaviest % (the one
 *  accent); the rest step down in ink weight by distance from it. Bodyweight
 *  and unknown loads sit at `low`. */
export type InkTier = "top" | "high" | "mid" | "low";
export function loadTier(pct: number | null, dayMax: number | null): InkTier {
  if (pct == null || dayMax == null) return pct == null ? "low" : "mid";
  if (pct >= dayMax) return "top";
  if (pct >= dayMax - 10) return "high";
  if (pct >= dayMax - 20) return "mid";
  return "low";
}

/** One bar of the day-header pulse. `h` is 0..1 (already normalised, floored so
 *  the lightest touch still registers); `hot` marks the day's top-% work. */
export interface PulseBar {
  h: number;
  hot: boolean;
}

/**
 * The day's load shape — one bar per prescription (load × volume), the day-level
 * echo of the plan's week waveform. Strictly semantic: every bar is a real
 * step; delete a set and the pulse changes. Percent steps weigh load × NL; RPE
 * work weighs effort × volume; prose entries (runs) carry no bar. When a long
 * day would exceed `cap` bars, bars aggregate to one per lift so the pulse
 * never turns into noise. Returns [] for days with nothing to draw.
 */
export function dayPulse(day: ProgramDayView, cap = 14): PulseBar[] {
  const max = dayMaxPct(day);
  type Raw = { v: number; hot: boolean; lift: number };
  const raw: Raw[] = [];
  let liftIx = 0;
  for (const s of day.sessions)
    for (const l of s.lifts) {
      if (l.steps && l.steps.length) {
        for (const st of l.steps)
          raw.push({ v: ((st.pct ?? 40) / 100) * st.nl, hot: st.pct != null && st.pct === max, lift: liftIx });
      } else if (l.rpe != null || l.setsReps != null) {
        const nums = (l.setsReps ?? "").match(/\d+/g)?.map(Number) ?? [];
        const vol = nums.length >= 2 ? nums[0]! * nums[1]! : (nums[0] ?? 1) * 10;
        raw.push({ v: ((l.rpe ?? 7) / 10) * vol, hot: false, lift: liftIx });
      }
      liftIx += 1;
    }
  if (raw.length === 0) return [];
  let bars: { v: number; hot: boolean }[] = raw;
  if (raw.length > cap) {
    const byLift = new Map<number, { v: number; hot: boolean }>();
    for (const r of raw) {
      const b = byLift.get(r.lift);
      if (b) {
        b.v += r.v;
        b.hot = b.hot || r.hot;
      } else byLift.set(r.lift, { v: r.v, hot: r.hot });
    }
    bars = [...byLift.values()];
  }
  const top = Math.max(...bars.map((b) => b.v));
  if (top <= 0) return [];
  return bars.map((b) => ({ h: 0.15 + 0.85 * (b.v / top), hot: b.hot }));
}

/** The accordion row's plain-words summary — what the day IS, before what it
 *  contains: the first three distinct exercise names, joined with " + "
 *  ("Press + Snatch + Front Squat"). Falls back to prose workout labels for
 *  endurance days; null for a day with nothing to say (renderer shows the
 *  kind label instead). */
export function dayLeadWords(day: ProgramDayView): string | null {
  const lifts = day.sessions.flatMap((s) => s.lifts);
  const pick = (xs: ProgramLiftView[]) => {
    const names: string[] = [];
    for (const l of xs) {
      if (/rest/i.test(l.name)) continue;
      if (!names.some((n) => n.toLowerCase() === l.name.toLowerCase())) names.push(l.name);
      if (names.length === 3) break;
    }
    return names;
  };
  const gym = pick(lifts.filter(isGymLift));
  const names = gym.length ? gym : pick(lifts.filter(isProseLift));
  return names.length ? names.join(" + ") : null;
}

/** A step's volume in words for the exercise sheet — "3 reps × 2 sets",
 *  "4+1 reps × 4 sets", "1 rep × 1 set". */
export function stepWords(step: ProgramStepView): string {
  const one = !step.reps.includes("+") && step.reps === "1";
  return `${step.reps} rep${one ? "" : "s"} × ${step.sets} set${step.sets === 1 ? "" : "s"}`;
}

/** What a target RPE means, in words — the sheet's one-line explanation of the
 *  heat number ("2 reps in reserve"). */
export function rpeMeaning(rpe: number): string {
  const left = Math.max(0, Math.round(10 - rpe));
  if (left === 0) return "nothing in reserve";
  return `${left} rep${left === 1 ? "" : "s"} in reserve`;
}

// ============================================================
//  Hero — the plan page's editorial opening ("The Columns")
// ============================================================

/** One rule-topped stat column in the plan hero ("8 weeks", "6/wk sessions",
 *  "656 lifts in wk 1"). */
export interface PlanHeroStat {
  value: string;
  /** small suffix rendered tight after the value ("/wk"), or null. */
  unit: string | null;
  label: string;
}

/** The plan-detail hero: a gradient panel (goal chip + plan title, with the
 *  loading tag opposite the back button) over three editorial stat columns and
 *  a one-line blurb. Derived, never authored per-plan: the stats come from the
 *  plan meta + the program's own week-1 volume, and the blurb is the first
 *  sentence of the plan description — so every discipline gets the same hero
 *  for free. Shared here so web and mobile render identical content. */
export interface PlanHeroView {
  /** mono label opposite the back button — the plan's loading tag ("% of 1RM"). */
  navLabel: string;
  /** always exactly three columns: duration, frequency, volume. */
  stats: PlanHeroStat[];
  /** first sentence of the plan description. */
  blurb: string;
}

export function planHeroView(
  plan: { weeks: number; sessions: number; tag: string; desc: string },
  /** Omitted for classic (non-program) plans — the volume column then falls
   *  back to total sessions, so every plan detail gets the same hero. */
  program?: PlanProgram,
): PlanHeroView {
  const stats: PlanHeroStat[] = [
    { value: String(plan.weeks), unit: null, label: plan.weeks === 1 ? "week" : "weeks" },
    { value: String(plan.sessions), unit: "/wk", label: "sessions" },
  ];
  // Third column: the discipline's own volume metric for week 1 (NL for
  // strength-percent, exercise count for hypertrophy/conditioning). Endurance —
  // and a classic plan with no program — has no comparable count → total
  // sessions across the plan.
  const wk1 = program?.weeks[0];
  const nl = wk1 ? weekNL(wk1) : 0;
  const items = wk1 ? wk1.days.reduce((n, d) => n + d.sessions.reduce((m, s) => m + sessionItems(s), 0), 0) : 0;
  const inWk1 = program && program.weeks.length > 1 ? " in wk 1" : "";
  if (program?.discipline === "strength-percent" && nl > 0) {
    stats.push({ value: String(nl), unit: null, label: `lifts${inWk1}` });
  } else if ((program?.discipline === "hypertrophy" || program?.discipline === "conditioning") && items > 0) {
    stats.push({ value: String(items), unit: null, label: `exercises${inWk1}` });
  } else {
    stats.push({ value: String(plan.weeks * plan.sessions), unit: null, label: "sessions total" });
  }
  const dot = plan.desc.indexOf(". ");
  return { navLabel: plan.tag, stats, blurb: dot === -1 ? plan.desc : plan.desc.slice(0, dot + 1) };
}

// ============================================================
//  Cover — the full-bleed plan cover (Explore card ↔ detail hero)
// ============================================================

/** One bar of the schedule waveform — a week and its relative volume. */
export interface PlanWeekBar {
  week: number;
  /** the discipline's volume count for the week (NL for strength-percent, item
   *  count otherwise) — clients normalise against the max to draw bar heights. */
  value: number;
}

/** The cover view model shared by the Explore PlanCover and the plan-detail
 *  hero, so both render the SAME cover at two scales and cannot drift. */
export interface PlanCoverView extends PlanHeroView {
  /** the goal's accent — drives the duotone wash. */
  accent: string;
  /** the goal's glyph — the oversized ghost cover art. */
  glyph: string;
  /** the discipline chip label (the goal name). */
  chip: string;
  /** top-right duration label, e.g. "8 WEEKS". */
  duration: string;
  title: string;
  /** meta-line parts (clients join with their MetaLine — spaced en dashes). */
  metaParts: (string | null)[];
  /** per-week volume for the schedule waveform; [] for single-week plans or
   *  when the discipline has no comparable count (endurance). */
  weekBars: PlanWeekBar[];
}

export function planCoverView(
  goal: { name: string; icon: string; color: string },
  plan: { name: string; weeks: number; sessions: number; tag: string; desc: string; hot?: boolean },
  program?: PlanProgram,
): PlanCoverView {
  const hero = planHeroView(plan, program);
  const weekBars: PlanWeekBar[] = [];
  if (program && program.weeks.length > 1) {
    for (const w of program.weeks) {
      const nl = weekNL(w);
      const items = w.days.reduce((n, d) => n + d.sessions.reduce((m, s) => m + sessionItems(s), 0), 0);
      weekBars.push({ week: w.index, value: nl > 0 ? nl : items });
    }
    // No signal at all (every week zero) → no waveform; clients fall back to
    // plain week labels.
    if (!weekBars.some((b) => b.value > 0)) weekBars.length = 0;
  }
  return {
    ...hero,
    accent: goal.color,
    glyph: goal.icon,
    chip: goal.name,
    duration: `${plan.weeks} ${plan.weeks === 1 ? "WEEK" : "WEEKS"}`,
    title: plan.name,
    metaParts: [`${plan.sessions}×/wk`, plan.tag, plan.hot ? "★ Popular" : null],
    weekBars,
  };
}

/** The GOAL-level cover — the plan cover recipe one level up, so the category
 *  screen (goal → plan list) opens with the SAME full-bleed collapsing cover as
 *  the plan detail: accent wash + ghost glyph from the goal, the discipline
 *  category as the chip, and the plan count as the top-right label. Shared by
 *  web + mobile so the two goal heroes cannot drift. Deliberately NO aggregate
 *  hem: ranges mushed across a full category ("6–16 weeks", "3–6/wk") say
 *  nothing — the numbers live on each plan card instead (planHeroView per
 *  plan), where they actually differentiate. */
export interface GoalCoverView {
  /** the goal's accent — drives the duotone wash. */
  accent: string;
  /** the goal's glyph — the oversized ghost cover art. */
  glyph: string;
  /** the discipline chip label (the goal's category, e.g. "Strength"). */
  chip: string;
  /** top-right label — the plan count ("3 PLANS" / "1 PLAN"), or "COMING SOON"
   *  for a goal whose programs aren't authored yet (never "0 PLANS"). */
  count: string;
  /** the goal name — the bottom-anchored display title. */
  title: string;
  /** the goal blurb — rendered on the cover face (the emblem variant). */
  blurb: string;
  /** meta-line parts — the plans' loading tags (unique, first three). */
  metaParts: (string | null)[];
}

export function goalCoverView(goal: {
  name: string;
  icon: string;
  color: string;
  category: string;
  blurb: string;
  plans: { weeks: number; sessions: number; tag: string }[];
}): GoalCoverView {
  const n = goal.plans.length;
  return {
    accent: goal.color,
    glyph: goal.icon,
    chip: goal.category,
    count: n === 0 ? "COMING SOON" : `${n} ${n === 1 ? "PLAN" : "PLANS"}`,
    title: goal.name,
    blurb: goal.blurb,
    metaParts: [...new Set(goal.plans.map((p) => p.tag))].slice(0, 3),
  };
}

/** Split a program's authored inputs title ("Your maxes (kg) — optional, to see
 *  working weights") into a SectionHead title + right-side mono meta. */
export function splitInputsTitle(t: string): { title: string; meta: string | null } {
  const i = t.indexOf(" — ");
  if (i === -1) return { title: t, meta: null };
  return { title: t.slice(0, i), meta: t.slice(i + 3) };
}

/** The first working weight a just-typed max unlocks — "59 kg @ 60%" for the
 *  lowest-% step of the first lift referencing `key` — so the maxes ledger can
 *  echo what the number means the moment it's entered. Null when the program
 *  has no %-work on that ref. */
export function inputEcho(program: PlanProgram, key: string, max: number): string | null {
  if (!Number.isFinite(max) || max <= 0) return null;
  for (const w of program.weeks)
    for (const d of w.days)
      for (const s of d.sessions)
        for (const l of s.lifts ?? []) {
          if (l.ref !== key) continue;
          const step = [...l.steps].filter((st) => st.pct != null).sort((a, b) => a.pct! - b.pct!)[0];
          if (!step) continue;
          const kg = stepKg(step, max);
          if (kg == null) continue;
          return `${kg} kg @ ${step.pct}%`;
        }
  return null;
}
