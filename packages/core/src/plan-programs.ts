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
    refLifts: [
      { key: "snatch", label: "Snatch" },
      { key: "cleanjerk", label: "Clean & Jerk" },
      { key: "frontSquat", label: "Front Squat" },
      { key: "backSquat", label: "Back Squat" },
      { key: "press", label: "Press" },
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

// ---- registry ----------------------------------------------------------------

/** Every encoded program, keyed by the GoalPlan id that surfaces it. */
export const PLAN_PROGRAMS: Record<string, PlanProgram> = {
  [SOVIET_OWL_8WK.id]: SOVIET_OWL_8WK,
};

/** The rich, discipline-shaped program behind a plan id (null when the plan uses
 *  the legacy gym shape or has none). */
export function programFor(planId: string | null | undefined): PlanProgram | null {
  if (!planId) return null;
  return PLAN_PROGRAMS[planId] ?? null;
}
