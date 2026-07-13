/**
 * @hybrid/core — the encoded discipline-shaped programs + a tiny registry.
 *
 * First program: the Soviet 8-Week Olympic-weightlifting peaking block. Stored as
 * the coach's percentage shorthand per lift (verbatim from the source, obvious
 * OCR typos corrected) and parsed into structure by plan-program.ts, so the data
 * stays easy to verify against the original and the NL volume is derived (and
 * unit-checked against the source's own running totals).
 *
 * Source: Pendlay Forum, "Soviet 8 week weightlifting program".
 */

import {
  parsePercentSteps,
  type PlanProgram,
  type PlanDay,
  type PlanDayKind,
  type PlanLift,
  type PlanEntry,
  type PlanSession,
  type SessionTimeOfDay,
  type ConditioningEffort,
} from "./plan-program";

// ---- builder: terse raw data → structured PlanProgram ------------------------

// A lift is [name, notation] or [name, notation, tempo].
type RawLift = [string, string] | [string, string, string];
// An accessory: a name + a fixed sets×reps scheme + target RPE + a "best for" note.
type RawAcc = { name: string; scheme: string; rpe?: number; note?: string };
interface RawSession {
  label?: "AM" | "PM";
  lifts: RawLift[];
  /** classic gym accessories (sets×reps×…), rendered in their own block. */
  acc?: RawAcc[];
}
// A training day is an array of sessions; a non-training day is its kind.
type RawDay = RawSession[] | Exclude<PlanDayKind, "train">;

/** Infer which 1RM a lift's percentages are off, from its name. Classic lifts and
 *  their power/hang/extension/deadlift variants reference the competition lift;
 *  squats and presses reference their own max (which is why squat % can exceed 100). */
function refFor(name: string): string | undefined {
  const n = name.toLowerCase();
  if (n.includes("good morning")) return undefined; // bodyweight "X"
  if (n.includes("front squat")) return "frontSquat";
  if (n.includes("squat")) return "backSquat"; // back / eccentric / jumping back squat
  if (n.includes("snatch")) return "snatch"; // snatch, power/hang snatch, snatch ext/deadlift
  if (n.includes("clean") || n.includes("jerk")) return "cleanjerk"; // C&J + clean/jerk variants
  if (n.includes("press")) return "press";
  return undefined;
}

function buildLift([name, notation, tempo]: RawLift): PlanLift {
  const steps = parsePercentSteps(notation);
  const hasComplex = steps.some((s) => s.plus);
  return {
    name,
    ...(refFor(name) ? { ref: refFor(name) } : {}),
    steps,
    ...(hasComplex ? { complexWith: "jerk" } : {}),
    ...(tempo ? { tempo } : {}),
  };
}

function buildAcc(a: RawAcc): PlanEntry {
  return { label: a.name, detail: "", scheme: a.scheme, ...(a.rpe != null ? { rpe: a.rpe } : {}), ...(a.note ? { note: a.note } : {}) };
}

function buildDay(raw: RawDay, index: number): PlanDay {
  const title = `Day ${index}`;
  if (typeof raw === "string") return { index, kind: raw, title, sessions: [] };
  const sessions: PlanSession[] = raw.map((s) => ({
    ...(s.label ? { label: s.label } : {}),
    lifts: s.lifts.map(buildLift),
    ...(s.acc ? { entries: s.acc.map(buildAcc) } : {}),
  }));
  return { index, kind: "train", title, sessions };
}

function buildProgram(meta: Omit<PlanProgram, "weeks">, weeks: RawDay[][]): PlanProgram {
  return {
    ...meta,
    weeks: weeks.map((days, wi) => ({
      index: wi + 1,
      days: days.map((d, di) => buildDay(d, di + 1)),
    })),
  };
}

// ---- the Soviet 8-week program -----------------------------------------------

// AM/PM helpers keep the data readable.
const am = (lifts: RawLift[]): RawSession => ({ label: "AM", lifts });
const pm = (lifts: RawLift[], acc?: RawAcc[]): RawSession => ({ label: "PM", lifts, ...(acc ? { acc } : {}) });
const one = (lifts: RawLift[]): RawSession => ({ lifts }); // single daily session
const GM: RawLift = ["Good Morning", "(X/8)4"];

// Week-1-only accessory block (the "Accessory Selection Matrix") — rendered in
// its own Accessories block, separate from the % barbell work.
const WEEK1_ACC: RawAcc[] = [
  { name: "Clean Pull", scheme: "5×3", rpe: 8, note: "pulling power, @ 90–110% of clean" },
  { name: "Snatch Balance", scheme: "4×2", rpe: 7, note: "speed under bar" },
  { name: "Push Press", scheme: "5×5", rpe: 8, note: "jerk drive" },
  { name: "Front Squat", scheme: "5×3", rpe: 8, note: "clean recovery" },
  { name: "Chinese Plank", scheme: "3×45 s", rpe: 8, note: "core endurance" },
];

const SOVIET_WEEKS: RawDay[][] = [
  // ---------------- WEEK 1 ----------------
  [
    [
      am([
        ["Press", "(60%/4)3, (70%/4)2"],
        ["Snatch", "(60%/3)2, (70%/3)3, (75%/2)3"],
        ["Front Squat", "(60%/5)3, (70%/5)3"],
      ]),
      pm([
        ["Power Clean & Jerk", "(60%/4+1)4, (70%/3+1)4"],
        ["Clean Extension", "60%/5, (70%/4)2, (80%/4)2"],
        GM,
      ], WEEK1_ACC),
    ],
    [
      one([
        ["Hang Snatch", "(60%/3)4, (70%/3)4"],
        ["Hang Clean & Jerk", "(60%/3+1)4, (70%/3+1)4"],
        ["Jerk", "(60%/3)2, (70%/3)2, (80%/2)2"],
        ["Eccentric Back Squat", "(80%/3)6", "down in 12 s"],
        ["Clean Deadlift", "(80%/3)6", "up in 12 s"],
      ]),
    ],
    "active-rest",
    [
      am([
        ["Press", "(60%/4)2, (70%/4)2"],
        ["Power Snatch", "(60%/4)4, (70%/3)4"],
        ["Snatch Extension", "(70%/5)3, (80%/4)2"],
      ]),
      pm([
        ["Clean & Jerk", "(65%/3+1)4, (75%/3+1)4"],
        ["Back Squat", "(70%/5)3, (80%/5)3"],
        GM,
      ]),
    ],
    [
      one([
        ["Snatch", "(60%/3)2, (70%/3)3, (75%/2)3"],
        ["Power Clean & Jerk", "(60%/3+1)4, (70%/3+1)4"],
        ["Clean Extension", "60%/5, (70%/5)2, (80%/4)2"],
        ["Front Squat", "(60%/5)2, (70%/5)2, (80%/5)2"],
      ]),
    ],
    [
      am([
        ["Power Snatch", "(60%/3)3, (70%/3)4"],
        ["Snatch Extension", "60%/5, (70%/5)2, (80%/4)2"],
        ["Back Squat", "(60%/5)3, (70%/5)3"],
      ]),
      pm([
        ["Clean & Jerk", "(65%/3+1)4, (75%/3+1)4"],
        ["Jerk", "60%/3, (70%/3)2, (80%/3)2"],
      ]),
    ],
  ],
  // ---------------- WEEK 2 ----------------
  [
    [
      am([
        ["Press", "(60%/3)2, (70%/3)2"],
        ["Snatch", "(60%/3)2, (70%/3)3, (80%/2)2"],
        ["Front Squat", "(60%/4)2, (70%/4)2, (80%/4)2"],
      ]),
      pm([
        ["Hang Clean & Jerk", "(60%/3+1)3, (70%/3+1)2, (80%/3+1)3"],
        ["Clean Extension", "70%/4, (80%/4)2, (85%/4)2"],
        GM,
      ]),
    ],
    [
      one([
        ["Power Snatch", "(65%/3)3, (75%/3)2, (80%/2)2"],
        ["Power Clean & Jerk", "(60%/3+1)2, (70%/3+1)2, (80%/2+1)3"],
        ["Jerk", "(70%/3)2, (80%/2)2"],
        ["Eccentric Snatch Deadlift", "(80%/3)6", "down in 20 s"],
        ["Eccentric Clean Deadlift", "(90%/3)6", "down in 20 s"],
      ]),
    ],
    "active-rest",
    [
      am([
        ["Press", "60%/4, 70%/4, (80%/3)2"],
        ["Clean & Jerk", "(60%/3+1)2, (70%/3+1)2, 80%/3+1"],
        ["Back Squat", "(60%/5)2, (70%/5)2, (80%/5)2"],
      ]),
      pm([
        ["Hang Snatch", "(60%/3)2, (70%/3)3, (75%/2)3"],
        ["Snatch Extension", "(70%/4)2, 80%/4, (90%/4)2"],
        GM,
      ]),
    ],
    [
      one([
        ["Snatch", "(60%/3)3, (70%/3)2, (80%/2)2"],
        ["Hang Clean & Jerk", "(60%/3+1)2, (70%/3+1)2, (80%/1+1)3"],
        ["Snatch Extension", "(70%/4)2, (80%/4)2, (90%/3)2"],
        ["Front Squat", "(70%/5)2, (80%/4)2, (90%/3)2"],
      ]),
    ],
    [
      am([
        ["Power Clean & Jerk", "(60%/3+1)2, (70%/3+1)2, (80%/2+1)2"],
        ["Jerk", "70%/3, (80%/3)2, (90%/2)2"],
        ["Back Squat", "(70%/5)2, (80%/5)2, (90%/3)2"],
      ]),
      pm([
        ["Hang Snatch", "(60%/3)3, (70%/3)2, (80%/2)2"],
        ["Snatch Extension", "(60%/4)2, (70%/4)2, 80%/3"],
        ["Slow Snatch Deadlift", "(80%/3)6", "up in 10 s"],
      ]),
    ],
  ],
  // ---------------- WEEK 3 ----------------
  [
    [
      am([
        ["Press", "60%/4, (70%/4)2, (80%/2)2"],
        ["Snatch", "60%/3, (70%/3)2, (80%/2)2"],
        ["Back Squat", "(70%/5)2, (80%/4)2, (90%/3)2"],
      ]),
      pm([
        ["Power Clean & Jerk", "(60%/3+1)2, (70%/3+1)2, (80%/2+1)2, (90%/2+1)2"],
        ["Clean Extension", "(70%/4)2, 80%/3, (90%/4)2"],
        GM,
      ]),
    ],
    [
      one([
        ["Power Snatch", "(60%/3)2, (70%/3)3, (80%/2)3"],
        ["Hang Clean & Jerk", "(60%/3+1)2, (70%/3+1)2, (80%/2+1)2, 90%/2+1"],
        ["Jerk", "(70%/3)2, 80%/3, (90%/2)2"],
        ["Clean Deadlift", "(100%/3)3"],
      ]),
    ],
    "active-rest",
    [
      am([
        ["Press", "60%/4, (75%/3)2"],
        ["Power Clean & Jerk", "(60%/3+1)2, (70%/3+1)2, (80%/2+1)2"],
        ["Back Squat", "(70%/5)2, (80%/5)2, (90%/3)2"],
      ]),
      pm([
        ["Power Snatch", "(60%/3)2, (70%/3)2, 80%/1, 90%/1"],
        ["Snatch Extension", "70%/4, 80%/3, 90%/3, 100%/3"],
        GM,
      ]),
    ],
    [
      one([
        ["Hang Snatch", "(60%/3)2, (70%/3)2, (80%/2)3"],
        ["Power Clean & Jerk", "(65%/3+1)2, (75%/3+1)3, (85%/2+1)2"],
        ["Clean Extension", "70%/5, (80%/4)2, 90%/3"],
        ["Front Squat", "70%/4, (80%/3)2, 90%/3, 100%/3"],
      ]),
    ],
    [
      am([
        ["Snatch", "(60%/3)2, (70%/3)3, (80%/3)3"],
        ["Snatch Extension", "(70%/4)2, 80%/4, (90%/3)2"],
        ["Back Squat", "70%/4, 80%/4, (90%/3)2, 100%/3"],
      ]),
      pm([
        ["Clean & Jerk", "(60%/3+1)2, (70%/3+1)3, (80%/2+1)3"],
        ["Jerk", "70%/3, (80%/3)2, (90%/2)2"],
      ]),
    ],
  ],
  // ---------------- WEEK 4 ----------------
  [
    [
      am([
        ["Press", "50%/4, (65%/4)2"],
        ["Snatch", "70%/3, (80%/2)2, 90%/2, 95%/2, 100%/1"],
        ["Front Squat", "60%/5, 70%/5, (80%/4)2, (90%/3)2"],
      ]),
      pm([
        ["Hang Clean", "(65%/3)2, (75%/3)2, 85%/2"],
        ["Clean Extension", "70%/5, 80%/5, (90%/3)2, 100%/3"],
        GM,
      ]),
    ],
    [
      one([
        ["Power Snatch", "(60%/3)2, (70%/3)2, (80%/2)2"],
        ["Power Clean", "(60%/3)3, (70%/3)2, (80%/2)2, (90%/2)2"],
        ["Jerk", "(70%/3)2, (80%/3)2"],
        ["Snatch Extension", "(70%/3)2, (80%/3)2"],
      ]),
    ],
    "active-rest",
    [
      am([
        ["Press", "(60%/4)2, 70%/2, 85%/2"],
        ["Hang Snatch", "(60%/3)2, (70%/3)2, (80%/2)2"],
        ["Clean & Jerk", "65%/3+1, (75%/2+1)2, (85%/2+1)2, (95%/1+1)2"],
      ]),
      pm([
        ["Back Squat", "(80%/4)2, (90%/4)2, (100%/3)2, (110%/2)2"],
        ["Clean Extension", "70%/5, 80%/4, (90%/3)2"],
        GM,
      ]),
    ],
    [
      one([
        ["Snatch", "(65%/3)2, (75%/3)2, (85%/2)2"],
        ["Hang Clean", "(60%/3)2, (70%/3)2, (80%/2)2, (90%/2)2"],
        ["Clean Extension", "70%/4, (80%/3)2, 90%/3"],
        ["Front Squat", "70%/4, 80%/4, 90%/3, (100%/2)2, 110%/2"],
      ]),
    ],
    [
      am([
        ["Clean & Jerk", "(65%/3+1)3, (75%/3+1)3, (85%/2+1)3"],
        ["Jerk", "70%/3, 80%/3, 90%/2, 100%/2"],
        ["Back Squat", "(70%/5)2, (80%/4)2, (90%/3)2"],
      ]),
      pm([
        ["Hang Snatch", "(60%/3)2, (70%/3)2, (80%/2)2, (90%/2)2"],
        ["Snatch Extension", "(70%/5)2, (80%/5)2"],
      ]),
    ],
  ],
  // ---------------- WEEK 5 ----------------
  [
    [
      am([
        ["Snatch", "(70%/3)2, (80%/2)3, (90%/2)2"],
        ["Power Clean", "(60%/3)2, (70%/3)2, (80%/3)2"],
        ["Jerk", "(70%/3)2, (80%/3)2"],
        ["Snatch Extension", "80%/3, 90%/3, 100%/2, 110%/2"],
      ]),
      pm([
        ["Press", "(60%/5)2, (70%/3)2"],
        ["Front Squat", "(70%/3)2, 80%/4, 90%/3, (100%/2)2"],
      ]),
    ],
    [
      one([
        ["Power Snatch", "(60%/3)2, (70%/3)2, (80%/2)3"],
        ["Clean & Jerk", "(70%/3+1)2, (80%/3+1)3, (90%/1+1)2, 100%/1+1"],
        ["Snatch Extension", "70%/4, (80%/4)2, (90%/3)2"],
        ["Back Squat", "80%/4, 90%/3, (100%/2)2, 110%/2"],
      ]),
    ],
    "active-rest",
    [
      am([
        ["Power Snatch", "(70%/3)3, (80%/2)2, (90%/2)2"],
        ["Power Clean", "(65%/3)2, (75%/3)2, (85%/2)2"],
        ["Front Squat", "(70%/5)2, (80%/5)2, (90%/4)2"],
        GM,
      ]),
      pm([
        ["Press", "(60%/4)2, 70%/2"],
        ["Hang Snatch", "(60%/3)2, (70%/3)2, 80%/2"],
        ["Clean Extension", "70%/4, 80%/3, (90%/3)2"],
      ]),
    ],
    [
      one([
        ["Power Snatch", "(60%/3)2, (70%/2)2, (85%/2)2"],
        ["Clean & Jerk", "(60%/3+1)2, (70%/3+1)2, (80%/2+1)3"],
        ["Jerk", "70%/3, 80%/3, 90%/2"],
        ["Snatch Extension", "60%/4, 80%/3, 90%/2"],
        ["Back Squat", "(60%/4)2, (80%/3)2, (90%/2)2"],
      ]),
    ],
    [
      am([
        ["Hang Snatch", "60%/3, (70%/3)2, (80%/2)3, (90%/2)2"],
        ["Clean & Jerk", "(70%/3+1)2, (80%/2+1)3, (90%/2+1)2"],
        ["Hang Clean", "60%/2, (70%/2)2, (80%/2)2"],
      ]),
      pm([
        ["Snatch Extension", "70%/4, 80%/4, 90%/2"],
        GM,
        ["Slow Clean Deadlift", "(80%/3)6", "up in 20 s"],
      ]),
    ],
  ],
  // ---------------- WEEK 6 ----------------
  [
    [
      am([
        ["Snatch", "(70%/2)2, (80%/2)2, (90%/1)2"],
        ["Power Clean", "(60%/3)3, (70%/3)2, 80%/3"],
        ["Jerk", "70%/3, (80%/2)2, 90%/2"],
        ["Clean Extension", "70%/3, 80%/3, 90%/2"],
      ]),
      pm([
        ["Press", "(60%/3)2, (70%/3)2"],
        ["Front Squat", "80%/4, (90%/3)2, (100%/3)2, 110%/1"],
      ]),
    ],
    [
      one([
        ["Power Snatch", "(60%/3)2, (70%/2)3, 80%/1"],
        ["Clean & Jerk", "(70%/3+1)2, (80%/2+1)2, (90%/1+1)2, 100%/1+1"],
        ["Back Squat", "(60%/4)2, (70%/3)2, (80%/3)2"],
        GM,
      ]),
    ],
    [
      am([
        ["Snatch", "(70%/3)2, (80%/2)3, (90%/1)2"],
        ["Power Clean", "(70%/3)2, 80%/2, (90%/1)2"],
        ["Back Squat", "(70%/5)2, (80%/4)2, (90%/3)2"],
        GM,
      ]),
      pm([
        ["Hang Snatch", "(60%/3)2, (70%/3)2, (80%/2)3"],
        ["Clean Extension", "70%/4, 80%/5, 90%/4"],
      ]),
    ],
    "active-rest",
    [
      one([
        ["Power Snatch", "(60%/3)2, (70%/3)2, (80%/2)2"],
        ["Clean & Jerk", "(70%/3+1)3, (80%/2+1)2, (90%/2+1)2"],
        ["Jerk", "80%/3, 90%/2, 100%/1"],
        ["Snatch Extension", "60%/4, 80%/3, 90%/2"],
        ["Back Squat", "70%/4, 80%/4, 90%/3, (100%/2)1, 110%/2"],
      ]),
    ],
    [
      one([
        ["Press", "60%/5, (70%/4)2, 80%/2"],
        ["Hang Snatch", "(70%/3)2, (80%/2)2, (90%/2)2"],
        ["Hang Clean", "(70%/2)2, (80%/2)2, (90%/2)2"],
        ["Snatch Extension", "70%/5, (80%/5)2, 90%/4"],
      ]),
    ],
  ],
  // ---------------- WEEK 7 ----------------
  [
    [
      am([
        ["Snatch", "(70%/3)3, (80%/2)2, (90%/1)2"],
        ["Clean & Jerk", "(70%/2+1)3, (80%/2+1)2, (90%/1+1)2, (100%/1+1)2"],
        ["Jerk", "70%/2, 80%/2, 90%/2, 100%/2"],
      ]),
      pm([
        ["Front Squat", "(70%/3)3, (80%/3)2, (90%/3)2"],
        ["Snatch Extension", "60%/3, 70%/3, 80%/3, 90%/2"],
        GM,
      ]),
    ],
    [
      one([
        ["Power Snatch", "(60%/3)2, (70%/3)2, (80%/2)2"],
        ["Power Clean", "(60%/3)2, (70%/3)2, (80%/2)2"],
        ["Clean Extension", "(80%/3)3, 90%/3, (100%/2)2"],
        ["Back Squat", "70%/3, (80%/3)2, 90%/3"],
        ["Press", "60%/3, (70%/3)2"],
      ]),
    ],
    "active-rest",
    [
      am([
        ["Snatch", "(70%/2)2, (80%/2)2, 90%/1"],
        ["Clean & Jerk", "(70%/2+1)3, (80%/2+1)3, (90%/1+1)2"],
        ["Jerk", "70%/3, 80%/2, (90%/1)2"],
      ]),
      pm([
        ["Back Squat", "70%/3, (80%/2)2, (90%/2)3"],
        ["Snatch Extension", "60%/4, (70%/3)2, (80%/3)2"],
        GM,
      ]),
    ],
    [
      one([
        ["Hang Snatch", "60%/3, (70%/2)2, (80%/2)2, (90%/1)2"],
        ["Clean & Jerk", "60%/3+1, (70%/2+1)2, (80%/2+1)2"],
        ["Clean Extension", "70%/3, (80%/3)2, (90%/3)2"],
        ["Back Squat", "(70%/3)2, (80%/3)2, (90%/3)2"],
        ["Press", "(70%/3)2"],
      ]),
    ],
  ],
  // ---------------- WEEK 8 (taper → competition) ----------------
  [
    [
      one([
        ["Power Snatch", "60%/3, 70%/3, 80%/2, 90%/1"],
        ["Power Clean", "60%/3, 70%/3, 80%/2, 90%/2"],
        ["Snatch Extension", "60%/2, 70%/2, 80%/2, 90%/2"],
        ["Clean Extension", "(60%/3)2, (70%/2)2, (80%/2)2, 90%/2"],
        ["Front Squat", "(70%/3)2, 80%/3, 90%/3"],
      ]),
    ],
    "active-rest",
    [
      one([
        ["Snatch", "(60%/3)2, (70%/2)2, (80%/2)2"],
        ["Clean & Jerk", "(60%/3+1)2, (70%/2+1)2, (80%/2+1)2"],
        ["Clean Extension", "60%/3, 70%/3, 80%/2"],
        ["Back Squat", "60%/3, 70%/3, (80%/2)2"],
      ]),
    ],
    "active-rest",
    [
      one([
        ["Power Snatch", "(50%/3)2, (60%/3)2"],
        ["Power Clean", "(50%/3)2, (70%/3)2"],
        ["Snatch Extension", "(60%/2)2, (70%/2)2"],
        ["Jumping Back Squat", "(50%/4)3"],
      ]),
    ],
    "rest",
    "rest",
    "competition",
  ],
];

export const SOVIET_OWL_8WK: PlanProgram = buildProgram(
  {
    id: "oly-soviet-8wk",
    discipline: "strength-percent",
    anchor: "competition",
    peakLabel: "Competition",
    inputsTitle: "Your maxes (kg) — optional, to see working weights",
    inputs: [
      { key: "snatch", label: "Snatch", kind: "number", derives: true },
      { key: "cleanjerk", label: "Clean & Jerk", kind: "number", derives: true },
      { key: "frontSquat", label: "Front Squat", kind: "number", derives: true },
      { key: "backSquat", label: "Back Squat", kind: "number", derives: true },
      { key: "press", label: "Press", kind: "number", derives: true },
    ],
    progression:
      "An 8-week peaking block driven by % of 1RM, not reps to failure. Volume is " +
      "counted as NL (number of lifts) and intensity waves up — weeks 1–3 build NL " +
      "at 60–90%, week 4 spikes toward maximal singles, weeks 5–7 hold high intensity " +
      "as volume drops, and week 8 tapers into a competition. Classic-lift % are off " +
      "your snatch / clean & jerk max; squat and press % are off their own max (so " +
      "squats can exceed 100%). Enter your maxes to see the working kg next to each %.",
    source: "Pendlay Forum — Soviet 8 week weightlifting program.",
  },
  SOVIET_WEEKS,
);

// ============================================================
//  ENDURANCE — the running shape: weekday grid, prose workouts, goal paces.
//  Same PlanProgram model + planProgramView as the OWL block, so it renders in
//  the identical HYBRID plan UI — just paces instead of %, miles/min instead of
//  lifts. Source: Hansons 5K Beginner 9-week plan (miles).
// ============================================================

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// A weekday cell: a list of workouts, or a rest/race day. A workout is either a
// prose run ([label, detail, note?]) or a structured gym item ({ gym, sets, … })
// so a running day can carry a strength block (the hybrid-athlete case).
type RunProse = [string, string] | [string, string, string];
type RunGym = { gym: string; sets: number; reps: number | "AMRAP"; rpe: number; note?: string };
type RunItem = RunProse | RunGym;
type RunCell = "off" | "race" | RunItem[];

/** Rest-or-cross-train cell (Mon/Wed/some Sun). */
const ct = (min: number): RunCell => [["Rest / cross-train", `Rest, or ${min}' cross-train`]];

function buildRunDay(cell: RunCell, index: number): PlanDay {
  const title = WEEKDAYS[index - 1] ?? `Day ${index}`;
  if (cell === "off") return { index, kind: "rest", title, sessions: [] };
  if (cell === "race") return { index, kind: "competition", title, sessions: [] };
  return {
    index,
    kind: "train",
    title,
    sessions: [
      {
        entries: cell.map((it) =>
          Array.isArray(it)
            ? { label: it[0], detail: it[1], ...(it[2] ? { note: it[2] } : {}) }
            : { label: it.gym, detail: "", sets: it.sets, reps: it.reps, rpe: it.rpe, ...(it.note ? { note: it.note } : {}) },
        ),
      },
    ],
  };
}

function buildRunProgram(meta: Omit<PlanProgram, "weeks">, weeks: RunCell[][]): PlanProgram {
  return {
    ...meta,
    weeks: weeks.map((cells, wi) => ({ index: wi + 1, days: cells.map((c, di) => buildRunDay(c, di + 1)) })),
  };
}

// Mon, Tue, Wed, Thu, Fri, Sat, Sun
const RUN_WEEKS: RunCell[][] = [
  [
    ct(30),
    [["Hills", "5 × 1' hills", "Jog down for recovery"]],
    ct(30),
    [["Tempo", "3 'up/down' miles", "Alternate: up miles at tempo pace, down miles at moderate effort. Or 30' cross-train"]],
    // Fri — an easy run + a runner's strength block (the hybrid day).
    [
      ["Easy", "3 miles", "or 30' cross-train"],
      { gym: "Goblet Squat", sets: 3, reps: 12, rpe: 7 },
      { gym: "Romanian Deadlift", sets: 3, reps: 10, rpe: 7 },
      { gym: "Walking Lunge", sets: 3, reps: 10, rpe: 8, note: "per leg" },
      { gym: "Standing Calf Raise", sets: 3, reps: 15, rpe: 8 },
    ],
    [["Easy", "30' easy"]],
    "off",
  ],
  [
    ct(30),
    [["Intervals", "3 × 1' hard / 1' easy", "or 3 × 1' hills"]],
    ct(35),
    [["Tempo", "3 × 1-mile tempo", "2' recovery"]],
    [["Easy", "3 miles easy"]],
    [["Long run", "35'"]],
    "off",
  ],
  [
    ct(30),
    [["Intervals", "3 × 2' hard / 1' easy", "or 3 × 1' hills"]],
    ct(30),
    [["Progressive tempo", "3-mile progressive tempo", "Start moderate and cut down 5\" each mile"]],
    [["Easy", "3 miles easy"]],
    [["Long run", "40'"]],
    "off",
  ],
  [
    ct(35),
    [["Intervals", "3 × 3' hard / 90\" off", "or 3 × 45\" hills"]],
    ct(35),
    [["Aerobic tempo", "3-mile aerobic tempo at tempo pace + 20\"", "Then 3 × 100m hard with 3' recovery"]],
    [["Easy", "3 miles easy", "or 30' cross-train"]],
    [["Long run", "35'"]],
    "off",
  ],
  [
    ct(35),
    [["Intervals", "4 × 600m at Goal Pace", "with equal rest"]],
    ct(35),
    [["Hills", "3/2/1' hills", "Increasing effort as the intervals get shorter. Or 30' cross-train"]],
    [["Easy", "4 miles easy", "or 30' cross-train"]],
    [["Long run", "40'"]],
    "off",
  ],
  [
    ct(35),
    [["Intervals", "3 × 1k at 10k pace +5\", 2' rest", "Then 4 × 400m at 5k pace, 90\" rest"]],
    ct(35),
    [["Tempo", "2 × 2-mile tempo, 3' rest between", "Then 3 × 100m hard, 4' recovery. Or 30' cross-train"]],
    [["Easy", "3 miles easy", "or 30' cross-train"]],
    [["Long run", "45'"]],
    "off",
  ],
  [
    ct(35),
    [["Intervals", "3 × 800m at 5k pace, then 250m even faster", "1' recovery after 800, 4' recovery after 250"]],
    ct(40),
    [["Progressive tempo", "4-mile progressive tempo", "Start moderate and cut down 5\" each mile. Or 35' cross-train"]],
    [["Easy", "4 miles easy", "or 35' cross-train"]],
    [["Long run", "50'"]],
    [["Rest / cross-train", "Rest, or easy cross-train"]],
  ],
  [
    ct(35),
    [["Fartlek", "40' run as you feel", "Then 5 × 100m quick"]],
    ct(40),
    [["Intervals", "1200 / 800 / 400 / 200m", "Rest 3'/2'/2'/2'. Pace: GP+2\" / 5k / 5k−3\" / hard. Or 35' cross-train"]],
    [["Easy", "4 miles easy", "or 35' cross-train"]],
    [["Long run", "45'"]],
    "off",
  ],
  [
    ct(35),
    [["Tempo", "2-mile tempo", "4' recovery"]],
    ct(30),
    [["Intervals", "3 × 400m at GP", "60\" rest"]],
    [["Easy", "Rest, or 3 miles easy"]],
    [["Pre-race shakeout", "3 miles + 3 × 150m at GP"]],
    "race",
  ],
];

export const RUN_5K_BEGINNER_9WK: PlanProgram = buildRunProgram(
  {
    id: "run-5k-beginner-9wk",
    discipline: "endurance",
    anchor: "competition",
    peakLabel: "Race day",
    inputsTitle: "Your goal paces — optional, for reference (use a pace calculator)",
    inputs: [
      { key: "goal", label: "Goal finish", kind: "text", placeholder: "25:00" },
      { key: "gp", label: "Goal pace (GP)", kind: "text", placeholder: "min/mi" },
      { key: "long", label: "Long run", kind: "text", placeholder: "min/mi" },
      { key: "tenk", label: "10k pace", kind: "text", placeholder: "min/mi" },
    ],
    progression:
      "A 9-week build to a 5K. Tuesday is the hard interval/hills session and Thursday is the tempo session — " +
      "include a 1-mile warm-up and 1-mile cool-down on BOTH. Friday is easy miles (or cross-train), Saturday is " +
      "the long run, and Monday/Wednesday/Sunday are rest or cross-train. PACES: tempo = hard to hold a " +
      "conversation but sustainable ~45–60 min; recovery = easy jog between intervals; cross-train = any non-running " +
      "activity (weights, yoga, cycling). NOTATION: ' = minutes, \" = seconds (3' = 3 min, 45\" = 45 sec). Volume " +
      "waves up to weeks 7–8, then tapers into race week. Fill in your goal paces above from a pace calculator and " +
      "run each workout at the right effort.",
    source: "Hansons 5K Beginner 9-week training plan (miles).",
  },
  RUN_WEEKS,
);

// ============================================================
//  HYPERTROPHY — the bodybuilding shape: a weekday split of exercises with
//  sets × reps ranges. Same PlanProgram model + planProgramView, so it renders in
//  the identical HYBRID plan UI — sets/reps instead of % or paces, and an
//  exercise count instead of NL. One repeating week (run it for as long as you
//  like, adding weight/reps each cycle). Source: a 6-day Push/Pull/Legs split.
// ============================================================

// A structured exercise: fixed sets, fixed reps (or AMRAP), target RPE, and an
// optional weight reference key (maps to a program input so the athlete's
// working weight appears in the prescription).
interface BBExercise {
  name: string;
  sets: number;
  reps: number | "AMRAP";
  rpe: number;
  weightRef?: string;
}
// A focused training day: a weekday + a focus label + its exercises.
interface BBDay {
  day: string;
  focus: string;
  exercises: BBExercise[];
}

function buildBBDay(d: BBDay, index: number): PlanDay {
  return {
    index,
    kind: "train",
    title: `${d.day}, ${d.focus}`,
    sessions: [
      {
        entries: d.exercises.map((ex, i) => ({
          label: ex.name,
          detail: `${ex.sets}×${ex.reps === "AMRAP" ? "AMRAP" : ex.reps}`,
          sets: ex.sets,
          reps: ex.reps,
          rpe: ex.rpe,
          ...(ex.weightRef ? { weightRef: ex.weightRef } : {}),
          ...(i === 0 ? { note: "Main lift — progressive overload" } : {}),
        })),
      },
    ],
  };
}

// RPE guide (from the progression note):
//   Main lift (index 0): RPE 9 — 1 rep in reserve; don't grind the last rep.
//   Accessory work:      RPE 8 — 2 reps in reserve; controlled effort.
//   Final exercise:      RPE 10 — push to technical failure on the last set.
const BB_DAYS: BBDay[] = [
  {
    day: "Mon",
    focus: "Push (Bench)",
    exercises: [
      { name: "Bench Press",             sets: 4, reps: 6,       rpe: 9, weightRef: "bench" },
      { name: "Incline Bench Press",     sets: 3, reps: 8,       rpe: 8 },
      { name: "Overhead Dumbbell Press", sets: 3, reps: 10,      rpe: 8 },
      { name: "Skull Crushers",          sets: 3, reps: 10,      rpe: 8 },
      { name: "Lateral Raises",          sets: 3, reps: 12,      rpe: 10 },
    ],
  },
  {
    day: "Tue",
    focus: "Pull (Chin-Up)",
    exercises: [
      { name: "Chin-Up",           sets: 4, reps: 6,       rpe: 9 },
      { name: "Seated Cable Row",  sets: 4, reps: 8,       rpe: 8 },
      { name: "Lat Pulldown",      sets: 4, reps: 10,      rpe: 8 },
      { name: "Lying Biceps Curl", sets: 3, reps: 10,      rpe: 8 },
      { name: "Forearm Curl",      sets: 3, reps: 12,      rpe: 10 },
    ],
  },
  {
    day: "Wed",
    focus: "Legs (Squat)",
    exercises: [
      { name: "Squat",               sets: 3, reps: 6,  rpe: 9, weightRef: "squat" },
      { name: "Romanian Deadlift",   sets: 2, reps: 8,  rpe: 8 },
      { name: "Leg Extension",       sets: 3, reps: 10, rpe: 8 },
      { name: "Hamstring Curl",      sets: 3, reps: 10, rpe: 8 },
      { name: "Standing Calf Raise", sets: 3, reps: 12, rpe: 10 },
    ],
  },
  {
    day: "Thu",
    focus: "Push (Overhead Press)",
    exercises: [
      { name: "Overhead Press",      sets: 4, reps: 6,       rpe: 9, weightRef: "ohp" },
      { name: "Dips",                sets: 4, reps: "AMRAP", rpe: 10 },
      { name: "Chest Fly",           sets: 3, reps: 10,      rpe: 8 },
      { name: "Overhead Extensions", sets: 3, reps: 10,      rpe: 8 },
      { name: "Lateral Raises",      sets: 3, reps: 12,      rpe: 10 },
    ],
  },
  {
    day: "Fri",
    focus: "Pull (Pull-Up)",
    exercises: [
      { name: "Pull-Up",       sets: 4, reps: "AMRAP", rpe: 10 },
      { name: "T-Bar Row",     sets: 4, reps: 8,       rpe: 8 },
      { name: "Pullover",      sets: 3, reps: 10,      rpe: 8 },
      { name: "Dumbbell Curl", sets: 3, reps: 10,      rpe: 8 },
      { name: "Hammer Curl",   sets: 3, reps: 10,      rpe: 10 },
    ],
  },
  {
    day: "Sat",
    focus: "Legs (Deadlift)",
    exercises: [
      { name: "Deadlift",          sets: 3, reps: 6,       rpe: 9, weightRef: "deadlift" },
      { name: "Leg Press",         sets: 3, reps: 8,       rpe: 8 },
      { name: "Back Extensions",   sets: 3, reps: 10,      rpe: 8 },
      { name: "Reverse Crunches",  sets: 3, reps: "AMRAP", rpe: 10 },
    ],
  },
];

export const BB_PPL_6DAY: PlanProgram = {
  id: "bb-ppl-6day",
  discipline: "hypertrophy",
  inputsTitle: "Your working weights (kg) — fills into the prescription",
  inputs: [
    { key: "bench",    label: "Bench Press",      kind: "number", derives: true },
    { key: "ohp",      label: "Overhead Press",   kind: "number", derives: true },
    { key: "squat",    label: "Squat",             kind: "number", derives: true },
    { key: "deadlift", label: "Deadlift",          kind: "number", derives: true },
  ],
  progression:
    "A 6-day Push/Pull/Legs split built on progressive overload. Each day opens with a big compound (the MAIN LIFT) " +
    "and fills in with complementary work. Run this week on repeat. PROGRESSION: fight to outlift yourself every " +
    "session, especially on the first exercise — if you hit your rep targets, add a little weight; if not, beat last " +
    "time's total reps (e.g. 9/8/7/6 = 30 → aim for 31+). VOLUME: 4–5 exercises per day is the default; for a " +
    "minimalist day keep the main lift + 1–2 more. REST: 3 min between sets on the first exercise, 2 min after that, " +
    "1 min on the final exercise. EFFORT (RIR): 0–1 in reserve on the main lift (don't fail the last rep), 0–2 on the " +
    "rest, last exercise to failure. SWAPS: pick variations that suit you (dips for bench, front squats for high-bar, " +
    "pulldowns for pull-ups). DIET: eat enough to fuel growth — lean trainees need to gain weight.",
  source: "6-day Push/Pull/Legs bodybuilding split.",
  weeks: [{ index: 1, days: [...BB_DAYS.map((d, i) => buildBBDay(d, i + 1)), { index: 7, kind: "rest", title: "Sun, Rest", sessions: [] }] }],
};

// ============================================================
//  CONDITIONING — the circuit shape: ONE session broken into blocks (a warm-up,
//  five work blocks, a finisher and a cool-down), each block its own card of
//  exercises whose prescription is a sets×reps scheme OR a time/hold, with the
//  round count carried in the card title. Same PlanProgram model + planProgramView
//  as the OWL / running / bodybuilding plans, so it renders in the identical
//  HYBRID plan UI — circuit blocks instead of %-ramps or weekday runs, and NO
//  volume counter (conditioning has no comparable count). One repeating Saturday
//  session; the 4-week emphasis rotation + recovery routine live in the
//  progression note. Source: a Saturday Kettlebell + Fat-Loss program (~90 min).
// ============================================================

// A circuit exercise: [name, prescription] or [name, prescription, note], where
// the prescription is a sets×reps scheme ("3 × 10") or a duration/hold ("30s").
type CircuitItem = [string, string] | [string, string, string];
// A block of the session: a titled card of exercises with one effort tier (the
// circuit's intensity signal → the shared colour wave). `prose` blocks (the
// cool-down stretches) render as plain prose rows; the rest are structured
// circuit items (the scheme shows in the prescription column).
interface CircuitBlock {
  title: string;
  effort: ConditioningEffort;
  prose?: boolean;
  items: CircuitItem[];
}

function buildCircuitBlock(b: CircuitBlock, index: number): PlanDay {
  return {
    index,
    kind: "train",
    title: b.title,
    sessions: [
      {
        entries: b.items.map(([name, presc, note]) => ({
          label: name,
          detail: b.prose ? presc : "",
          effort: b.effort,
          ...(b.prose ? {} : { scheme: presc }),
          ...(note ? { note } : {}),
        })),
      },
    ],
  };
}

function buildCircuitProgram(meta: Omit<PlanProgram, "weeks">, blocks: CircuitBlock[]): PlanProgram {
  return { ...meta, weeks: [{ index: 1, days: blocks.map((b, i) => buildCircuitBlock(b, i + 1)) }] };
}

// Effort tiers ride the shared colour wave (easy→blue, moderate→lime, hard→amber,
// max→red, recover→ash): the session warms up cool, the work blocks build, the
// no-rest finisher peaks red, and the cool-down flushes out — the conditioning
// analogue of the OWL %-wave and the bodybuilding RPE heat.
const FATLOSS_BLOCKS: CircuitBlock[] = [
  {
    title: "Warm-Up, 10 min",
    effort: "easy",
    items: [
      ["Jumping Jacks", "2 min"],
      ["Hip Circles", "1 min/side"],
      ["Arm Swings + Shoulder Rolls", "2 min"],
      ["Bodyweight Squats", "2 × 10"],
      ["KB Deadlift", "2 × 8", "Light"],
    ],
  },
  {
    title: "Block 1, Core & Stability, 2 rounds",
    effort: "moderate",
    items: [
      ["KB Halo", "2 × 12"],
      ["KB Figure 8", "2 × 12"],
      ["Plank", "30s hold"],
    ],
  },
  {
    title: "Block 2, Leg + Glutes, 3 rounds",
    effort: "hard",
    items: [
      ["Goblet Squat", "3 × 10"],
      ["KB Swing", "3 × 15"],
      ["Walking Lunges", "3 × 10/leg", "Bodyweight or with KB"],
    ],
  },
  {
    title: "Block 3, Push & Pull, 3 rounds",
    effort: "moderate",
    items: [
      ["Single-Arm Floor Press", "3 × 12/side"],
      ["KB Row", "3 × 12/side"],
      ["Push-Up", "3 × 10", "Incline if needed"],
    ],
  },
  {
    title: "Block 4, Balance & Core Burn, 2 rounds",
    effort: "hard",
    items: [
      ["Single-Leg Deadlift", "2 × 10/side"],
      ["KB Slingshot", "2 × 12"],
      ["Russian Twist", "30s", "With or without KB"],
    ],
  },
  {
    title: "Block 5, Finisher, 2–3 rounds, no rest between",
    effort: "max",
    items: [
      ["Goblet Squat Hold", "20s"],
      ["KB Swing", "20s"],
      ["High Knees", "20s", "No KB, then 1 min rest, repeat"],
    ],
  },
  {
    title: "Cool-Down, 10 min",
    effort: "recover",
    prose: true,
    items: [
      ["Forward Fold", "Hamstring stretch"],
      ["Child's Pose", "Hold and breathe"],
      ["Seated Twist", "Each side"],
      ["Deep Belly Breathing", "3 min"],
    ],
  },
];

export const FATLOSS_KB_SATURDAY: PlanProgram = buildCircuitProgram(
  {
    id: "fatloss-kb-saturday",
    discipline: "conditioning",
    inputsTitle: "Your kettlebells (kg) — optional, for reference",
    inputs: [
      { key: "kb", label: "Working bell", kind: "text", placeholder: "e.g. 16" },
      { key: "light", label: "Light bell", kind: "text", placeholder: "warm-up" },
    ],
    progression:
      "A single ~90-minute kettlebell session for fat loss, core tightening and full-body conditioning — run it " +
      "once a week, ideally fasted if you follow 16:8. Work the blocks in order: warm up, then the five work blocks " +
      "(rest 30–60 s between rounds, keep moving between exercises within a round), then the finisher (no rest between " +
      "the three moves, 1 min rest, repeat 2–3×) and the cool-down. WEEKLY ROTATION — keep the same session but shift " +
      "the emphasis each week: Week 1 Strength & Form (controlled reps, perfect technique), Week 2 Speed & Flow (move " +
      "faster, shorter rests), Week 3 Reps & Volume (add a round or 2–3 reps per set), Week 4 Heavier Kettlebell if " +
      "ready — then restart the cycle. RECOVERY: hydrate well after the session, break your fast with a high-protein " +
      "meal (~9 AM), use magnesium spray or a soak for sore muscles, and take a light walk or stretch on Sunday morning.",
    source: "Saturday Kettlebell + Fat-Loss program (~90 min).",
  },
  FATLOSS_BLOCKS,
);

// ============================================================
//  KETTLEBELL — a 12-week strength/muscle program (hypertrophy shape): a weekday
//  split of kettlebell exercises with sets × reps, the split ROTATING every week
//  — weeks 1/4/7/10 FULL BODY, weeks 2/5/8/11 PUSH/PULL/LEGS (+ a core day),
//  weeks 3/6/9/12 UPPER/LOWER. Same PlanProgram model + planProgramView as the
//  bodybuilding split, so it renders in the identical sets×reps table with a
//  12-week selector and an exercise counter. Reps are SINGLE numbers (per the
//  project rule — source ranges collapsed to the top, e.g. 15-20 → 20), with
//  per-side "10/leg" and holds "30 s" kept as-is, via the free-text scheme — no
//  RPE is invented (the source prescribes sets × reps + rest, not effort).
//  Source: thefitnessphantom.com — 12-Week Kettlebell Program (Murshid Akram).
// ============================================================

// A kettlebell day: a weekday + a focus + its exercises ([name, "sets × reps", note?]).
type KBItem = [string, string] | [string, string, string];
interface KBDay {
  day: string;
  focus: string;
  items: KBItem[];
}

function buildKBDay(d: KBDay, index: number): PlanDay {
  return {
    index,
    kind: "train",
    title: `${d.day}, ${d.focus}`,
    sessions: [
      {
        entries: d.items.map(([name, scheme, note]) => ({
          label: name,
          detail: "",
          scheme,
          ...(note ? { note } : {}),
        })),
      },
    ],
  };
}

function buildKBProgram(meta: Omit<PlanProgram, "weeks">, weeks: KBDay[][]): PlanProgram {
  return { ...meta, weeks: weeks.map((days, wi) => ({ index: wi + 1, days: days.map((d, di) => buildKBDay(d, di + 1)) })) };
}

const KB_WEEKS: KBDay[][] = [
  // ---------------- WEEK 1 — Full Body (run 2–3 rounds; sets shown as the top, 3) ----------------
  [
    { day: "Mon", focus: "Full Body", items: [
      ["KB Lunges", "3 × 10/leg"],
      ["KB Squat", "3 × 15"],
      ["Deficit Pushup", "3 × 10"],
      ["KB Overhead Press", "3 × 10"],
      ["KB Bent Over Row", "3 × 10"],
      ["Kneeling Low-to-High Chop", "3 × 10/side"],
    ] },
    { day: "Wed", focus: "Full Body", items: [
      ["KB Farmer's Walk", "3 × 30 s"],
      ["Dual-arm KB Swing", "3 × 15"],
      ["Turkish Get-up", "3 × 5/side"],
      ["KB Deadlift", "3 × 10"],
      ["KB Windmill", "3 × 10"],
      ["Good Morning", "3 × 10"],
    ] },
    { day: "Fri", focus: "Full Body", items: [
      ["KB Floor Press", "3 × 15"],
      ["Crush Grip KB Pushup", "3 × 10"],
      ["KB Clean and Press", "3 × 10"],
      ["KB Lunges to Curl", "3 × 10"],
      ["KB Gorilla Row", "3 × 15"],
    ] },
  ],
  // ---------------- WEEK 2 — Push / Pull / Leg / Abs ----------------
  [
    { day: "Mon", focus: "Push", items: [
      ["KB Bench Press", "3 × 20"],
      ["KB Crush Grip Pushup", "3 × 20"],
      ["Seesaw KB Press", "3 × 10/arm"],
      ["KB Push Press", "3 × 15"],
      ["Sit and Press", "3 × 15"],
    ] },
    { day: "Wed", focus: "Pull", items: [
      ["KB Deadlift", "3 × 15"],
      ["Single-arm Gorilla Row", "3 × 10/side"],
      ["KB High Pull", "3 × 20"],
      ["Single-arm Swing", "3 × 10/arm"],
      ["Single-arm Clean", "3 × 10/arm"],
    ] },
    { day: "Thu", focus: "Legs", items: [
      ["KB Step-up", "3 × 20"],
      ["KB Lunges", "3 × 10/leg"],
      ["KB Cossack Squat", "3 × 20"],
      ["Romanian Deadlift", "3 × 12"],
      ["KB Glute Bridge", "3 × 15"],
    ] },
    { day: "Fri", focus: "Abs", items: [
      ["KB Swing", "3 × 15"],
      ["KB Lunge Twist", "3 × 10/side"],
      ["Weighted Sit-up", "4 × 15"],
      ["KB Dead Bug", "4 × 5/side"],
    ] },
  ],
  // ---------------- WEEK 3 — Upper / Lower ----------------
  [
    { day: "Mon", focus: "Upper", items: [
      ["Deficit Pushup", "3 × 20"],
      ["Push Press", "3 × 15"],
      ["Single-arm Gorilla Row", "3 × 10/side"],
      ["KB Z Press", "3 × 15"],
      ["KB Renegade Row", "3 × 6/side"],
    ] },
    { day: "Tue", focus: "Lower", items: [
      ["Front Squat", "3 × 20"],
      ["Front Racked Lunges", "3 × 10/leg"],
      ["KB Single-Leg RDL", "3 × 8/leg"],
      ["Frog Pump", "3 × 12"],
      ["Single-leg Calf Raises", "3 × 10/leg"],
    ] },
    { day: "Thu", focus: "Upper", items: [
      ["Single-arm Swing", "3 × 15/arm"],
      ["KB Snatch", "3 × 10/arm"],
      ["KB Slingshot", "3 × 20"],
      ["Single-arm High Pulls", "3 × 10/side"],
      ["KB Bench Press", "3 × 20"],
    ] },
    { day: "Fri", focus: "Lower", items: [
      ["Sumo Squat", "3 × 20"],
      ["Reverse Lunges", "3 × 10/leg"],
      ["Step-up", "3 × 10/leg"],
      ["Good Morning", "3 × 12"],
      ["Lateral Squat", "3 × 10/leg"],
    ] },
  ],
  // ---------------- WEEK 4 — Full Body ----------------
  [
    { day: "Mon", focus: "Full Body", items: [
      ["Single-arm KB Swing", "3 × 20/arm"],
      ["KB Turkish Get-up", "3 × 10/side"],
      ["KB Z Press", "3 × 20"],
      ["Single-arm Row", "3 × 15/arm"],
      ["Weighted Sit-up", "3 × 15"],
    ] },
    { day: "Wed", focus: "Full Body", items: [
      ["Single-arm Squat to Press", "3 × 10/side"],
      ["Pushup to Renegade Row", "3 × 10"],
      ["KB Windmill", "3 × 6/side"],
      ["Mountain Climber", "4 × 30 s"],
      ["Half-Kneeling KB Chop", "3 × 10/side"],
    ] },
    { day: "Fri", focus: "Full Body", items: [
      ["KB Deadlift", "3 × 15"],
      ["Seesaw Press", "3 × 10/arm"],
      ["Lunge with Rotation", "3 × 10/side"],
      ["KB Swing Changing Hands", "3 × 20"],
      ["KB Thruster", "3 × 20"],
      ["KB Crunches", "3 × 15"],
    ] },
  ],
  // ---------------- WEEK 5 — Push / Pull / Leg / Core ----------------
  [
    { day: "Mon", focus: "Push", items: [
      ["KB Bench Press", "3 × 20"],
      ["Deficit Push-ups", "3 × 20"],
      ["Seesaw KB Press", "3 × 15/arm"],
      ["Close Grip Push-up", "3 × 20"],
      ["KB Overhead Triceps Extension", "3 × 15"],
      ["KB Dips", "3 × 15"],
    ] },
    { day: "Tue", focus: "Pull", items: [
      ["KB Deadlift", "3 × 20"],
      ["Gorilla Row", "3 × 15/side"],
      ["Dual-arm Russian Swing", "3 × 20"],
      ["KB Reverse Curl", "3 × 20"],
      ["High Pulls", "3 × 20"],
      ["Superman Pull", "3 × 20"],
    ] },
    { day: "Thu", focus: "Lower", items: [
      ["KB Front Squat", "3 × 20"],
      ["Curtsy Lunges", "3 × 10/leg"],
      ["KB Cossack Squat", "3 × 10/leg"],
      ["Romanian Deadlift", "3 × 12"],
      ["Glute Bridge", "3 × 20"],
      ["Single-arm Calf Raises", "3 × 20"],
    ] },
    { day: "Fri", focus: "Core", items: [
      ["Standing Oblique Chop", "3 × 10/side"],
      ["Straight-arm Crunches", "3 × 15"],
      ["KB Russian Twist", "3 × 30 s"],
      ["KB Dead Bug", "3 × 5 s/side"],
      ["Mountain Climber", "3 × 30 s"],
    ] },
  ],
  // ---------------- WEEK 6 — Upper / Lower ----------------
  [
    { day: "Mon", focus: "Upper", items: [
      ["Deficit Pushup", "4 × 20"],
      ["1-arm Clean and Press", "4 × 10/arm"],
      ["Single-arm Gorilla Row", "4 × 10/arm"],
      ["KB Renegade Row", "4 × 10/side"],
      ["Lateral KB Swings", "4 × 10/side"],
    ] },
    { day: "Tue", focus: "Lower", items: [
      ["Front Racked Squat", "4 × 20"],
      ["Front Racked Lunges", "3 × 10/leg"],
      ["KB Single-Leg RDL", "3 × 10/leg"],
      ["Lateral Squat", "3 × 10/leg"],
      ["KB Step-up", "3 × 10/leg"],
    ] },
    { day: "Thu", focus: "Upper", items: [
      ["KB Swing", "4 × 25"],
      ["KB Push Press", "4 × 15"],
      ["KB Slingshot", "4 × 10/side"],
      ["High Pull", "4 × 15"],
      ["KB Halo", "4 × 10/side"],
    ] },
    { day: "Fri", focus: "Legs", items: [
      ["Sumo Squat", "4 × 15"],
      ["Reverse Lunges", "3 × 10/side"],
      ["KB Pistol Squat", "3 × 5/leg"],
      ["Suitcase Deadlift", "4 × 15"],
      ["KB Calf Raises", "4 × 15/leg"],
    ] },
  ],
  // ---------------- WEEK 7 — Full Body ----------------
  [
    { day: "Mon", focus: "Full Body", items: [
      ["Both-arm KB Swing", "4 × 25"],
      ["Turkish Get-up", "3 × 6/side"],
      ["Bob and Weave", "3 × 8/side"],
      ["KB Windmill", "3 × 10/side"],
      ["Man Maker", "3 × 10"],
    ] },
    { day: "Tue", focus: "Full Body", items: [
      ["Front Racked Lunges", "3 × 10/leg"],
      ["Squat to Overhead Press", "3 × 12"],
      ["Pushup to Renegade Row", "3 × 8/side"],
      ["Single-arm KB Clean", "3 × 10/side"],
      ["Gorilla Row", "3 × 15"],
      ["Half-Kneeling KB Chop", "3 × 10/side"],
    ] },
    { day: "Thu", focus: "Full Body", items: [
      ["Side KB Swing", "3 × 10/side"],
      ["Deficit Pushup", "3 × 15"],
      ["1-arm KB Snatch", "3 × 10/side"],
      ["KB High Pull", "3 × 15"],
      ["Romanian Deadlift", "3 × 12"],
      ["KB Z Press", "3 × 12"],
    ] },
    { day: "Fri", focus: "Full Body", items: [
      ["Thruster", "3 × 15"],
      ["Pistol Squat", "4 × 5/leg"],
      ["Crush Grip Push-up", "3 × 8/side"],
      ["Bottoms-Up Press", "3 × 10/arm"],
      ["Overhead Swings", "3 × 15"],
    ] },
  ],
  // ---------------- WEEK 8 — Push / Pull / Leg / Core ----------------
  [
    { day: "Mon", focus: "Push", items: [
      ["KB Floor Press", "4 × 15"],
      ["Deficit Pushup", "4 × 15"],
      ["Seesaw KB Press", "4 × 10/side"],
      ["KB Arm Bar", "4 × 5/side"],
      ["Bridge Press", "4 × 15"],
    ] },
    { day: "Tue", focus: "Pull", items: [
      ["KB Deadlift", "4 × 12"],
      ["Gorilla Row", "4 × 12"],
      ["KB High Pull", "4 × 12"],
      ["Dual-arm Russian Swing", "4 × 25"],
      ["KB Curl", "4 × 15"],
    ] },
    { day: "Thu", focus: "Lower", items: [
      ["Front Squat", "4 × 20"],
      ["Reverse Lunges", "4 × 10/leg"],
      ["Cossack Squat", "4 × 10/leg"],
      ["Single Straight-Leg Deadlift", "4 × 10/leg"],
      ["Step-up", "4 × 10/leg"],
    ] },
    { day: "Fri", focus: "Core", items: [
      ["Kneeling KB Low-to-High Chop", "4 × 10/side"],
      ["Straight-arm Crunches", "4 × 15"],
      ["Russian Twist", "4 × 10/side"],
      ["Side Plank Dips", "4 × 10/side"],
      ["KB Dead Bug", "4 × 10/side"],
    ] },
  ],
  // ---------------- WEEK 9 — Upper / Lower ----------------
  [
    { day: "Mon", focus: "Upper", items: [
      ["Deficit Pushup", "4 × 20"],
      ["1-arm Clean and Press", "4 × 10/arm"],
      ["Single-arm Gorilla Row", "4 × 10/arm"],
      ["KB Renegade Row", "4 × 10/side"],
      ["Lateral KB Swings", "4 × 10/side"],
    ] },
    { day: "Tue", focus: "Lower", items: [
      ["Front Racked Squat", "4 × 20"],
      ["Front Racked Lunges", "3 × 10/leg"],
      ["KB Single-Leg RDL", "3 × 10/leg"],
      ["Lateral Squat", "3 × 10/leg"],
      ["KB Step-up", "3 × 10/leg"],
    ] },
    { day: "Thu", focus: "Upper", items: [
      ["KB Swing", "4 × 25"],
      ["KB Push Press", "4 × 15"],
      ["KB Slingshot", "4 × 10/side"],
      ["High Pull", "4 × 15"],
      ["KB Superman", "4 × 10/side"],
    ] },
    { day: "Fri", focus: "Legs", items: [
      ["Sumo Squat", "4 × 15"],
      ["Reverse Lunges", "3 × 10/side"],
      ["KB Pistol Squat", "3 × 5/leg"],
      ["Suitcase Deadlift", "4 × 15"],
      ["KB Calf Raises", "4 × 15/leg"],
    ] },
  ],
  // ---------------- WEEK 10 — Full Body ----------------
  [
    { day: "Mon", focus: "Full Body", items: [
      ["KB Swing Gorilla Deadlift", "4 × 12"],
      ["Turkish Get-up", "3 × 6/side"],
      ["Bob and Weave", "3 × 8/side"],
      ["Hyperextension", "3 × 10/side"],
      ["KB Power Maker", "3 × 10"],
    ] },
    { day: "Tue", focus: "Full Body", items: [
      ["KB Lunge with Rotation", "3 × 10/side"],
      ["Squat to Overhead Press", "3 × 12"],
      ["Pushup to Renegade Row", "3 × 8/side"],
      ["Single-arm KB Clean", "3 × 10/side"],
      ["Gorilla Row", "3 × 15"],
      ["Half-Kneeling KB Chop", "3 × 10/side"],
    ] },
    { day: "Thu", focus: "Full Body", items: [
      ["Side KB Swing", "3 × 10/side"],
      ["Deficit Pushup", "3 × 15"],
      ["1-arm KB Snatch", "3 × 10/side"],
      ["KB High Pull", "3 × 15"],
      ["Romanian Deadlift", "3 × 12"],
      ["KB Z Press", "3 × 12"],
    ] },
    { day: "Fri", focus: "Full Body", items: [
      ["Thruster", "3 × 15"],
      ["Lying KB T-Raises", "4 × 5/side"],
      ["Pushup to Renegade Row", "3 × 8/side"],
      ["Bottoms-Up Press", "3 × 10/arm"],
      ["Overhead Swings", "3 × 15"],
    ] },
  ],
  // ---------------- WEEK 11 — Push / Pull / Leg / Core ----------------
  [
    { day: "Mon", focus: "Push", items: [
      ["Sit and Press", "4 × 12"],
      ["Deficit Pushup", "4 × 15"],
      ["Seesaw KB Press", "4 × 10/side"],
      ["Staggered Pushup", "3 × 10/side"],
      ["Bridge Press", "4 × 15"],
    ] },
    { day: "Tue", focus: "Pull", items: [
      ["KB Deadlift", "4 × 12"],
      ["Gorilla Row", "4 × 12"],
      ["KB High Pull", "4 × 12"],
      ["Dual-arm Russian Swing", "4 × 25"],
      ["Incline Plank Rowing", "4 × 15"],
    ] },
    { day: "Thu", focus: "Lower", items: [
      ["Front Squat", "4 × 20"],
      ["Reverse Lunges", "4 × 10/leg"],
      ["Cossack Squat", "4 × 10/leg"],
      ["Single Straight-Leg Deadlift", "4 × 10/leg"],
      ["Step-up", "4 × 10/leg"],
    ] },
    { day: "Fri", focus: "Core", items: [
      ["Kneeling KB Low-to-High Chop", "4 × 10/side"],
      ["KB V-Ups", "4 × 12"],
      ["KB Hollow Body Hold", "4 × 15 s"],
      ["Side Plank Dips", "4 × 10/side"],
      ["KB Dead Bug", "4 × 10/side"],
    ] },
  ],
  // ---------------- WEEK 12 — Upper / Lower ----------------
  [
    { day: "Mon", focus: "Upper", items: [
      ["KB Spin Press", "3 × 10/side"],
      ["1-arm Clean and Press", "4 × 10/arm"],
      ["Single-arm Gorilla Row", "4 × 10/arm"],
      ["KB Renegade Row", "4 × 10/side"],
      ["Lateral KB Swings", "4 × 10/side"],
    ] },
    { day: "Tue", focus: "Lower", items: [
      ["Goblet Curtsy Step-Down", "3 × 10/side"],
      ["Front Racked Lunges", "3 × 10/leg"],
      ["KB Single-Leg RDL", "3 × 10/leg"],
      ["Shrimp Squats", "3 × 10/leg"],
      ["KB Step-up", "3 × 10/leg"],
    ] },
    { day: "Thu", focus: "Upper", items: [
      ["KB Swing", "4 × 25"],
      ["KB Push Press", "4 × 15"],
      ["KB Chainsaw Row", "3 × 10/side"],
      ["High Pull", "4 × 15"],
      ["KB Halo", "4 × 10/side"],
    ] },
    { day: "Fri", focus: "Legs", items: [
      ["Reverse Lunge to Step-up", "3 × 10/leg"],
      ["KB Squat Jump", "3 × 12"],
      ["KB Pistol Squat", "3 × 5/leg"],
      ["Suitcase Deadlift", "4 × 15"],
      ["KB Calf Raises", "4 × 15/leg"],
    ] },
  ],
];

export const KB_12WK_STRONG: PlanProgram = buildKBProgram(
  {
    id: "kb-12wk-strong",
    discipline: "hypertrophy",
    inputsTitle: "Your kettlebells (kg) — optional, for reference",
    inputs: [
      { key: "bell", label: "Your bell", kind: "text", placeholder: "e.g. 16" },
      { key: "heavy", label: "Heavier bell", kind: "text", placeholder: "e.g. 24" },
    ],
    progression:
      "A 12-week kettlebell program that builds strength, muscle, endurance and mobility by ROTATING the split every " +
      "week: weeks 1/4/7/10 train the FULL BODY each session, weeks 2/5/8/11 run PUSH / PULL / LEGS (plus a core day), " +
      "and weeks 3/6/9/12 run an UPPER / LOWER split — so every pattern gets hit from several angles across the block. " +
      "Do 5–7 exercises a day, 3–5 days a week, resting 30–45 s between sets and 2–3 min between rounds (keep the rests " +
      "short to push endurance). WARM UP first with a few minutes of light aerobic work. WEEK 1 is round-based — run it " +
      "as a circuit (one set of each exercise per round) or standard (all sets of a lift before the next), 2 rounds for " +
      "beginners and 3 if experienced; from week 2 each exercise lists its own sets. HOW IT BUILDS: from fundamentals " +
      "(wk 1) to more reps & sets (wk 4), shorter rests for endurance (wk 7), heavier load for strength (wk 9), and the " +
      "heaviest loads at the end (wk 11–12). Pick a bell you can move with good form and add load as the weeks get harder.",
    source: "thefitnessphantom.com — The Complete 12-Week Kettlebell Program (Murshid Akram).",
  },
  KB_WEEKS,
);

// ============================================================
//  HYBRID ATHLETE — a strength + engine base. The hybrid case the other four
//  plans don't cover: a single week that carries BOTH heavy barbell work and an
//  aerobic engine, run on repeat. Its point of difference is the DAY SHAPE — the
//  two key days are THREE-A-DAY (AM strength / MID conditioning / PM easy run)
//  and Saturday is a two-a-day (AM long run / PM full-body). Each session is a
//  single content kind, so a day reads as clean, separately-startable blocks —
//  and it exercises the AM/MID/PM session model end to end. Built as a direct
//  PlanProgram (mixed content per session, so no single %/circuit/run builder
//  fits); discipline `hypertrophy` for the working-weight worksheet + exercise
//  count. Reps are single numbers (project rule); kettlebell work uses the KB
//  prefix. Source: a general hybrid strength-and-conditioning template.
// ============================================================

// A day's strength lift (fills the athlete's working kg when `ref` is set), a
// conditioning item (carries an effort tier → the shared intensity colour), or a
// prose run (label + written prescription). Each maps to a PlanEntry.
type HybStrength = { name: string; sets: number; reps: number; rpe: number; ref?: string; note?: string };
type HybCond = { name: string; scheme: string; effort: ConditioningEffort; note?: string };
type HybProse = { name: string; detail: string; note?: string };

const hStr = (x: HybStrength): PlanEntry => ({ label: x.name, detail: "", sets: x.sets, reps: x.reps, rpe: x.rpe, ...(x.ref ? { weightRef: x.ref } : {}), ...(x.note ? { note: x.note } : {}) });
const hCond = (x: HybCond): PlanEntry => ({ label: x.name, detail: "", scheme: x.scheme, effort: x.effort, ...(x.note ? { note: x.note } : {}) });
const hRun = (x: HybProse): PlanEntry => ({ label: x.name, detail: x.detail, ...(x.note ? { note: x.note } : {}) });
const hSess = (label: SessionTimeOfDay | undefined, entries: PlanEntry[]): PlanSession => ({ ...(label ? { label } : {}), entries });
const hTrain = (index: number, title: string, sessions: PlanSession[]): PlanDay => ({ index, kind: "train", title, sessions });
const hRest = (index: number, title: string, kind: Extract<PlanDayKind, "rest" | "active-rest"> = "rest"): PlanDay => ({ index, kind, title, sessions: [] });

const HYBRID_WEEK: PlanDay[] = [
  // Mon — three-a-day: heavy lower, a short erg/KB engine, an easy shakeout run.
  hTrain(1, "Mon, Lower + Engine", [
    hSess("AM", [
      hStr({ name: "Back Squat", sets: 4, reps: 5, rpe: 7, ref: "squat" }),
      hStr({ name: "Romanian Deadlift", sets: 3, reps: 8, rpe: 8, ref: "deadlift" }),
      hStr({ name: "Walking Lunge", sets: 3, reps: 10, rpe: 7, note: "per leg" }),
    ]),
    hSess("MID", [
      hCond({ name: "KB Swing", scheme: "5 × 20", effort: "hard" }),
      hCond({ name: "Row Erg", scheme: "5 × 250 m", effort: "hard", note: "90 s rest between" }),
      hCond({ name: "Hollow Hold", scheme: "3 × 30 s", effort: "moderate" }),
    ]),
    hSess("PM", [
      hRun({ name: "Easy Run", detail: "30 min zone 2", note: "conversational pace" }),
    ]),
  ]),
  // Tue — a single running quality session (speed).
  hTrain(2, "Tue, Intervals", [
    hSess(undefined, [
      hRun({ name: "Intervals", detail: "6 × 400 m at 5K pace", note: "90 s jog recovery" }),
      hRun({ name: "Strides", detail: "4 × 20 s", note: "relaxed and fast" }),
    ]),
  ]),
  hRest(3, "Wed, Active recovery", "active-rest"),
  // Thu — three-a-day: heavy upper, a hard interval engine, an easy run.
  hTrain(4, "Thu, Upper + Engine", [
    hSess("AM", [
      hStr({ name: "Bench Press", sets: 4, reps: 6, rpe: 7, ref: "bench" }),
      hStr({ name: "Weighted Pull-Up", sets: 4, reps: 6, rpe: 8 }),
      hStr({ name: "Overhead Press", sets: 3, reps: 8, rpe: 7, ref: "ohp" }),
    ]),
    hSess("MID", [
      hCond({ name: "Assault Bike", scheme: "6 × 20 s", effort: "max", note: "100 s easy spin between" }),
      hCond({ name: "KB Clean & Press", scheme: "4 × 8", effort: "hard", note: "per side" }),
      hCond({ name: "Plank", scheme: "3 × 45 s", effort: "moderate" }),
    ]),
    hSess("PM", [
      hRun({ name: "Easy Run", detail: "25 min zone 2" }),
    ]),
  ]),
  // Fri — a single tempo run.
  hTrain(5, "Fri, Tempo", [
    hSess(undefined, [
      hRun({ name: "Tempo Run", detail: "20 min tempo", note: "comfortably hard" }),
    ]),
  ]),
  // Sat — two-a-day: the long run in the morning, full-body strength later.
  hTrain(6, "Sat, Long + Full Body", [
    hSess("AM", [
      hRun({ name: "Long Run", detail: "60 min easy", note: "flat or rolling" }),
    ]),
    hSess("PM", [
      hStr({ name: "Deadlift", sets: 3, reps: 5, rpe: 7, ref: "deadlift" }),
      hStr({ name: "Push Press", sets: 3, reps: 6, rpe: 8, ref: "ohp" }),
      hStr({ name: "Chin-Up", sets: 3, reps: 8, rpe: 8 }),
      hStr({ name: "Ab Wheel", sets: 3, reps: 12, rpe: 8 }),
    ]),
  ]),
  hRest(7, "Sun, Rest"),
];

export const HYBRID_ENGINE_BASE: PlanProgram = {
  id: "hybrid-engine-base",
  discipline: "hypertrophy",
  inputsTitle: "Your working weights (kg) — fills into the strength prescriptions",
  inputs: [
    { key: "squat", label: "Back Squat", kind: "number", derives: true },
    { key: "bench", label: "Bench Press", kind: "number", derives: true },
    { key: "deadlift", label: "Deadlift", kind: "number", derives: true },
    { key: "ohp", label: "Overhead Press", kind: "number", derives: true },
  ],
  progression:
    "A hybrid base week — heavy strength AND an aerobic engine in the same seven days, run on repeat. The two key days are " +
    "THREE-A-DAY: a morning STRENGTH session (AM), a short CONDITIONING piece a few hours later (MID), and an easy RUN in the " +
    "evening (PM), spaced out so the hard work doesn't bleed together. Tuesday and Friday are single running days (speed, then " +
    "tempo), Saturday pairs a long run with full-body lifting, and the week has two rest points (Wed active recovery, Sun off). " +
    "PROGRESSION: keep the lifts at the listed RPE and add a little weight whenever a session feels easier than its target; hold " +
    "the runs at an easy, conversational effort except the marked interval and tempo work, and stretch the long run by 5 to 10 " +
    "minutes every couple of weeks. Spread the three-a-day sessions across the day when you can; if you can only train once, do " +
    "the AM strength and tack the easy run onto another day. Fuel and sleep are the real progression driver here.",
  source: "A general hybrid strength-and-conditioning base template.",
  weeks: [{ index: 1, days: HYBRID_WEEK }],
};

// ---- registry ----------------------------------------------------------------

/** Every encoded program, keyed by the GoalPlan id that surfaces it. */
export const PLAN_PROGRAMS: Record<string, PlanProgram> = {
  [SOVIET_OWL_8WK.id]: SOVIET_OWL_8WK,
  [RUN_5K_BEGINNER_9WK.id]: RUN_5K_BEGINNER_9WK,
  [BB_PPL_6DAY.id]: BB_PPL_6DAY,
  [FATLOSS_KB_SATURDAY.id]: FATLOSS_KB_SATURDAY,
  [KB_12WK_STRONG.id]: KB_12WK_STRONG,
  [HYBRID_ENGINE_BASE.id]: HYBRID_ENGINE_BASE,
};

/** The rich, discipline-shaped program behind a plan id (null when the plan uses
 *  the legacy gym shape or has none). */
export function programFor(planId: string | null | undefined): PlanProgram | null {
  if (!planId) return null;
  return PLAN_PROGRAMS[planId] ?? null;
}
