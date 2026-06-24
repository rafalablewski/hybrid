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
  type PlanSession,
} from "./plan-program";

// ---- builder: terse raw data → structured PlanProgram ------------------------

// A lift is [name, notation] or [name, notation, tempo].
type RawLift = [string, string] | [string, string, string];
interface RawSession {
  label?: "AM" | "PM";
  lifts: RawLift[];
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

function buildDay(raw: RawDay, index: number): PlanDay {
  const title = `Day ${index}`;
  if (typeof raw === "string") return { index, kind: raw, title, sessions: [] };
  const sessions: PlanSession[] = raw.map((s) => ({
    ...(s.label ? { label: s.label } : {}),
    lifts: s.lifts.map(buildLift),
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
const pm = (lifts: RawLift[]): RawSession => ({ label: "PM", lifts });
const one = (lifts: RawLift[]): RawSession => ({ lifts }); // single daily session
const GM: RawLift = ["Good Morning", "(X/8)4"];

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
      ]),
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

// A weekday cell: a list of [label, detail, note?] workouts, or a rest/race day.
type RunEntry = [string, string] | [string, string, string];
type RunCell = "off" | "race" | RunEntry[];

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
    sessions: [{ entries: cell.map(([label, detail, note]) => ({ label, detail, ...(note ? { note } : {}) })) }],
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
    [["Easy", "3 miles", "or 30' cross-train"]],
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

// An exercise row: [name, sets, reps] (sets/reps are ranges, e.g. "4–5", "6–12").
type BBExercise = [string, string, string];
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
    title: `${d.day} · ${d.focus}`,
    sessions: [
      {
        entries: d.exercises.map(([name, sets, reps], i) => ({
          label: name,
          detail: `${sets} × ${reps}`,
          ...(i === 0 ? { note: "Main lift — progressive overload" } : {}),
        })),
      },
    ],
  };
}

const BB_DAYS: BBDay[] = [
  {
    day: "Mon",
    focus: "Push (Bench)",
    exercises: [
      ["Bench Press", "4–5", "6–12 reps"],
      ["Incline Bench Press", "3–4", "8–12 reps"],
      ["Overhead Dumbbell Press", "3", "10–15 reps"],
      ["Skull Crushers", "3", "10–15 reps"],
      ["Lateral Raises", "3", "12–15 reps"],
    ],
  },
  {
    day: "Tue",
    focus: "Pull (Chin-Up)",
    exercises: [
      ["Chin-Up", "4–5", "6–12 reps"],
      ["Seated Cable Row", "4–5", "8–12 reps"],
      ["Lat Pulldown", "4", "10–15 reps"],
      ["Lying Biceps Curl", "3", "10–15 reps"],
      ["Forearm Curl", "3", "12–15 reps"],
    ],
  },
  {
    day: "Wed",
    focus: "Legs (Squat)",
    exercises: [
      ["Squat", "3–4", "6–10 reps"],
      ["Romanian Deadlift", "2–3", "8–12 reps"],
      ["Leg Extension", "3", "10–15 reps"],
      ["Hamstring Curl", "3", "10–15 reps"],
      ["Standing Calf Raise", "3", "12–15 reps"],
    ],
  },
  {
    day: "Thu",
    focus: "Push (Overhead Press)",
    exercises: [
      ["Overhead Press", "4–5", "6–10 reps"],
      ["Dips", "4–5", "AMRAP"],
      ["Chest Fly", "3", "10–15 reps"],
      ["Overhead Extensions", "3", "10–15 reps"],
      ["Lateral Raises", "3", "12–15 reps"],
    ],
  },
  {
    day: "Fri",
    focus: "Pull (Pull-Up)",
    exercises: [
      ["Pull-Up", "4–5", "AMRAP"],
      ["T-Bar Row", "4–5", "8–12 reps"],
      ["Pullover", "3", "10–15 reps"],
      ["Dumbbell Curl", "3", "10–15 reps"],
      ["Hammer Curl", "3", "10–15 reps"],
    ],
  },
  {
    day: "Sat",
    focus: "Legs (Deadlift)",
    exercises: [
      ["Deadlift", "3–5", "6–12 reps"],
      ["Leg Press", "3–5", "8–12 reps"],
      ["Back Extensions", "3", "10–15 reps"],
      ["Reverse Crunches", "3", "AMRAP"],
    ],
  },
];

export const BB_PPL_6DAY: PlanProgram = {
  id: "bb-ppl-6day",
  discipline: "hypertrophy",
  inputsTitle: "Your working weights (kg) — optional, jot what you lifted last time",
  inputs: [
    { key: "bench", label: "Bench Press", kind: "number" },
    { key: "ohp", label: "Overhead Press", kind: "number" },
    { key: "squat", label: "Squat", kind: "number" },
    { key: "deadlift", label: "Deadlift", kind: "number" },
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
  weeks: [{ index: 1, days: [...BB_DAYS.map((d, i) => buildBBDay(d, i + 1)), { index: 7, kind: "rest", title: "Sun · Rest", sessions: [] }] }],
};

// ---- registry ----------------------------------------------------------------

/** Every encoded program, keyed by the GoalPlan id that surfaces it. */
export const PLAN_PROGRAMS: Record<string, PlanProgram> = {
  [SOVIET_OWL_8WK.id]: SOVIET_OWL_8WK,
  [RUN_5K_BEGINNER_9WK.id]: RUN_5K_BEGINNER_9WK,
  [BB_PPL_6DAY.id]: BB_PPL_6DAY,
};

/** The rich, discipline-shaped program behind a plan id (null when the plan uses
 *  the legacy gym shape or has none). */
export function programFor(planId: string | null | undefined): PlanProgram | null {
  if (!planId) return null;
  return PLAN_PROGRAMS[planId] ?? null;
}
