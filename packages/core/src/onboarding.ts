/**
 * Guided onboarding → a personalized first plan.
 *
 * Maps a handful of intake answers (goal, experience, days/week, equipment) onto
 * the shared plan library (GOAL_TREE) and picks the plan whose weekly frequency
 * best fits the athlete — so a beginner who can train 3 days gets a 3-day plan,
 * not a 6-day split they'll quit. Pure mapping logic; both clients render the
 * same recommendation and then enroll its macrocycle. No I/O.
 */

import { GOAL_TREE, GOAL_GROUPS, type GoalPlan, type GoalCategory } from "./plans";
import type { ClientPersona } from "./nav";

/** A main goal id — always one of the plan library's goal (GOAL_TREE) ids. */
export type OnboardingGoal = string;
export type Experience = "beginner" | "intermediate" | "advanced";
export type Equipment = "full" | "home" | "minimal";

export interface OnboardingAnswers {
  goal: OnboardingGoal;
  /** Optional since Aug 2026: setup no longer asks. It is measured from the log
   *  (engines/fitness-level.ts) and only ever narrows a tie here. */
  experience?: Experience;
  daysPerWeek: number;
  equipment?: Equipment;
  sessionMin?: number;
}

export interface OnboardingPlan {
  /** GOAL_TREE node id (e.g. "power") */
  goalId: string;
  /** goal display name — what gets enrolled as the macrocycle goal */
  goalLabel: string;
  planId: string;
  planName: string;
  weeks: number;
  /** the plan's weekly session count */
  weeklyTarget: number;
  focus: string[];
  why: string;
}

export interface OnboardingGoalOption {
  id: OnboardingGoal;
  label: string;
  blurb: string;
  category: GoalCategory;
}

// The onboarding main goal is chosen straight from the plan library's goals,
// so the two can never drift apart — add a goal to GOAL_TREE and it shows up here.
export const ONBOARDING_GOALS: OnboardingGoalOption[] =
  GOAL_TREE.map((g) => ({ id: g.id, label: g.name, blurb: g.blurb, category: g.category }));

export interface OnboardingGoalGroup {
  category: GoalCategory;
  goals: OnboardingGoalOption[];
}

/** The same goals, grouped by category in display order (empty groups dropped). */
export const ONBOARDING_GOAL_GROUPS: OnboardingGoalGroup[] = GOAL_GROUPS.map((group) => ({
  category: group.category,
  goals: group.goals.map((g) => ({ id: g.id, label: g.name, blurb: g.blurb, category: g.category })),
}));

// ============================================================
//  Dynamic, admin-editable questionnaire
// ============================================================
//
// The onboarding questionnaire is data, not hard-coded UI. Admins can reword,
// reorder, add, remove, enable/disable questions (web admin → Onboarding). The
// clients render whatever the server returns; engine-critical answers are keyed
// by `engineKey` so the recommendation engine reads the ones it understands and
// ignores the rest (a custom "How did you hear about us?" question is stored on
// the profile but never breaks plan matching). DEFAULT_ONBOARDING_QUESTIONS is
// the seed + the fallback when the DB table is empty/unmigrated, so onboarding
// always works even before the admin touches anything.

/** How a question is rendered + how its answer is shaped. */
export const ONBOARDING_QUESTION_KINDS = [
  "persona", // special: the casual/athlete cards (also sets the persona choice)
  "goal",    // special: the grouped goal-tree picker (answer is a GOAL_TREE id)
  "single",  // one choice from `choices` (answer: string)
  "multi",   // any number of `choices` (answer: string[])
  "number",  // a stepper or scrub between min/max (answer: number)
  "birth",   // a year and a month (answer: "YYYY-MM", or "YYYY" year-only)
  "text",    // free text (answer: string)
] as const;

/**
 * ONE LIST, and the type is derived from it — for the same reason
 * `ONBOARDING_ENGINE_KEYS` is. This was a union here and a hand-copied array
 * inside `normalizeOnboardingQuestion`, and that function is a validator that
 * does not reject an unrecognised kind: it returns NULL, dropping the whole
 * question. A kind added to the union and forgotten in the array would have
 * deleted its own question from every client's wizard, silently.
 */
export type OnboardingQuestionKind = (typeof ONBOARDING_QUESTION_KINDS)[number];

/**
 * The engine fields a question's answer can feed. Undefined → informational.
 *
 * THE LAST THREE ARE QUESTIONNAIRE FIELDS, and they are here because setup is
 * the only moment an athlete expects to be asked about themselves. Sex, age and
 * body mass carry 38% of the volume/readiness estimate between them; asked at
 * first run they cost three taps, and asked later they are three rows on a
 * screen most people never open. `questionnaireFromAnswers` (questionnaire.ts)
 * is what projects them onto the profile — one mapping, both clients.
 */
export const ONBOARDING_ENGINE_KEYS = [
  "persona", "goal", "experience", "daysPerWeek", "equipment",
  "sex", "birthYear", "bodyweightKg",
  // BOTH REMAIN LEGAL KEYS, and only one is still shipped as a question.
  //
  // `sleep` is MEASURED from the daily check-in (sleepFromCheckins) and a typed
  // value outranks the measurement, so setup does not ask — the questionnaire
  // screen keeps the row for an athlete who wants to overrule it deliberately.
  // `stress` is the one recovery input nothing measures, so it is asked, of the
  // goal intake only.
  "sleep", "stress",
] as const;

/**
 * ONE LIST, and the type is derived from it.
 *
 * It was a union here and a hand-copied array inside
 * `normalizeOnboardingQuestion`, which is a validator: a key the array did not
 * name was not rejected, it was silently set to `undefined`. So the three body
 * questions type-checked, shipped, went through the normalizer every client
 * calls, and arrived with no engine key — answered by the athlete and connected
 * to nothing. Derived, the two cannot disagree.
 */
export type OnboardingEngineKey = (typeof ONBOARDING_ENGINE_KEYS)[number];

export interface OnboardingChoice {
  value: string;
  label: string;
  blurb?: string;
}

export interface OnboardingQuestion {
  /** Stable id — the default key for built-ins, the DB row id for custom ones. */
  id: string;
  /** The key this answer is stored under (in the saved answers map). */
  key: string;
  kind: OnboardingQuestionKind;
  title: string;
  subtitle?: string;
  /** Maps the answer onto a recommendation-engine field, when relevant. */
  engineKey?: OnboardingEngineKey;
  /** For single/multi. (The `goal`/`persona` kinds supply their own choices.) */
  choices?: OnboardingChoice[];
  /** For number. */
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: string | number;
  required?: boolean;
  enabled: boolean;
  /** Built-in question: protected from deletion; key/kind/engineKey are locked. */
  system?: boolean;
  /**
   * WHICH INTAKE THIS QUESTION BELONGS TO. Omitted means both.
   *
   * The first question asks which of two products the athlete wants — "Just
   * track my training" or "Train for a goal" — and until Aug 2026 the wizard
   * did not branch on the answer. Everyone was asked all eight questions, the
   * goal question was `required` with no skip, and the server enrolled a
   * periodised season for anyone with a goal. So both answers produced
   * IDENTICAL server state, and the only difference between the two products
   * was a flag in device storage that hid some menu rows. Someone who asked for
   * the simple tracker got a twelve-week programme laid across their calendar
   * and an upsell offering to make it adapt.
   *
   * A tracker needs to be asked who they are, because the volume and readiness
   * models read it. It does not need to be asked what it is training for.
   */
  personas?: ClientPersona[];
  /** Display order (ascending). */
  order: number;
}

/** The persona choices, shared by every client's persona card. */
export const ONBOARDING_PERSONA_CHOICES: OnboardingChoice[] = [
  { value: "casual", label: "Just track my training", blurb: "Log fast, review at home, share your wins. The clean, simple app — free." },
  { value: "athlete", label: "Train for a goal — give me the data", blurb: "Plans, sport S&C, velocity, performance & technique. The full toolkit — a paid upgrade." },
];

/**
 * The built-in questions, in display order. Seed + fallback.
 *
 * THE FORK IS THE OUTCOME, NOT THE DATA — and the first cut of it got this
 * exactly backwards, so it is worth stating plainly.
 *
 * That cut marked the experience tier, days per week and equipment as
 * athlete-only, on the reasoning that all three "exist to match and shape a
 * plan". They do not. `questionnaireFromAnswers` maps experience and
 * daysPerWeek straight onto the volume profile, where experience is a STIMULUS
 * multiplier and training frequency is a RECOVERY factor, and both are counted
 * in `personalizeLandmarks`' confidence divisor. Dropping them did not shorten
 * a tracker's setup so much as permanently degrade their model: two of seven
 * confidence inputs gone, for every athlete who chose the simple product.
 *
 * The whole argument for this app is that it learns THIS person — that two
 * athletes doing twenty sets of chest a week are not the same athlete, and only
 * their own logged response can say which is which. An intake that collects
 * less from half the user base is an intake working against the engine.
 *
 * So: EVERY question about the person is asked of BOTH intakes. The only
 * athlete-only question is the GOAL, because a tracker has told us they are not
 * training for one — and the only thing the fork changes at the end is whether
 * a plan is recommended and a season enrolled.
 */
export const DEFAULT_ONBOARDING_QUESTIONS: OnboardingQuestion[] = [
  {
    id: "persona", key: "persona", kind: "persona", engineKey: "persona", system: true, enabled: true, order: 0,
    title: "How do you want to use HYBRID?", subtitle: "You can switch anytime in Settings.",
    // NO DEFAULT, and it is the only choice question without one. Every other
    // answer is seeded from its default so the recommender has a complete set
    // and a choice step opens with something shown as picked. This one decides
    // WHICH PRODUCT the athlete is in, so a seeded value would be the app
    // choosing for them and then reporting the choice back as theirs. It is
    // also the question the whole wizard forks on: leaving "casual" pre-selected
    // meant an athlete who never looked at this screen was silently placed in
    // the tracker. Unanswered has to stay unanswered until it is answered.
    choices: ONBOARDING_PERSONA_CHOICES,
    required: true,
  },
  {
    id: "goal", key: "goal", kind: "goal", engineKey: "goal", system: true, enabled: true, order: 1, required: true,
    personas: ["athlete"],
    title: "What's your main goal?", subtitle: "We'll shape your first plan around it.",
  },
  // NO EXPERIENCE QUESTION, and its absence is a decision worth reading.
  //
  // Training age is the strongest single input to the volume model — the only
  // one that scales the STIMULUS end, so it moves MEV as well as MRV — and it
  // came from one tap on this screen. Self-assessment is unreliable in both
  // directions: eight hard months reads as "intermediate", a decade of
  // unprogressive gym-going reads as "advanced".
  //
  // engines/fitness-level.ts already measures it instead, from relative
  // strength on five benchmark lifts against published standards, shifted for
  // sex and age. That estimator shipped, and it reached the model — but only
  // through `resolveExperience`, where the STATED answer always wins. So one
  // tap at setup permanently outranked the measurement, and the log's only
  // recourse was to report that it `disagrees` on a screen four taps deep. An
  // answer given once, before the athlete had logged anything, governed their
  // volume ceiling forever.
  //
  // The question is gone rather than demoted. With no answer, `resolveExperience`
  // returns the derived value; with no log to derive from, it returns nothing
  // and `personalizeLandmarks` simply omits the factor and reports lower
  // confidence — the population table, honestly labelled. That is the same rule
  // the body questions already keep: "we don't know" must stay distinguishable
  // from "we guessed", and a guess about this one is expensive.
  //
  // It remains an `engineKey`, so an operator can re-add it as an explicit
  // question, and it remains editable on the questionnaire screen where an
  // athlete who wants to overrule the estimate still can. What it no longer is
  // is something we ask for before we have any way to check it.
  // ── THE THREE BODY QUESTIONS ────────────────────────────────────────────
  // NONE OF THEM CARRIES A `defaultValue`, and that is the whole design. The
  // client seeds every answer from its default before the athlete touches
  // anything (see useOnboarding), so a default here would mean an athlete who
  // skipped the question had "80 kg" written down as their own body mass — a
  // fabricated measurement that the model then explains their recovery ceiling
  // with. Unanswered has to stay unanswered. The controls open at a plausible
  // figure; nothing is stored until it is moved.
  {
    id: "sex", key: "sex", kind: "single", engineKey: "sex", system: true, enabled: true, order: 2,
    title: "Male or female?",
    subtitle: "Every strength and pace standard is published for men. Without this we hold you to the men's bar.",
    choices: [
      { value: "F", label: "Female" },
      { value: "M", label: "Male" },
    ],
  },
  // ASKED AS A DATE, NOT AN AGE. An age is a number that stops being true the
  // day after it is given, and the recovery factor moves 1.2% for every year of
  // drift. Deriving the year from an age was the first fix and it was still a
  // derivation — accurate to ±1 depending on whether the birthday had passed,
  // which is the same size as the factor's own yearly step. The answer is
  // "YYYY-MM" — or "YYYY" while only the year has been given, since the month
  // is optional in the model; `questionnaireFromAnswers` parses both.
  {
    id: "birth", key: "birth", kind: "birth", engineKey: "birthYear", system: true, enabled: true, order: 3,
    title: "When were you born?", subtitle: "Recovery declines gently past thirty, and we'd rather not guess.",
  },
  {
    id: "bodyweight", key: "bodyweight", kind: "number", engineKey: "bodyweightKg", system: true, enabled: true, order: 4,
    title: "What do you weigh?", subtitle: "It sets how much you have to recover from per set — and your working loads.",
    min: 25, max: 300, step: 0.5,
  },
  // ── THE TWO RECOVERY QUESTIONS ──────────────────────────────────────────
  // Same 1-5 scale as the daily check-in, deliberately: the athlete meets the
  // question in the same shape wherever it is asked, and the engine reads one
  // scale. Both carry a default because mid-scale is an honest population prior
  // for them — unlike sex or body mass, where a default would be a fabricated
  // measurement — but the profile still records only what was TOUCHED, so a
  // skipped one stays unknown rather than becoming a 3 nobody chose.
  // NO SLEEP QUESTION, for the reason the training-age question went: the app
  // MEASURES it. `sleepFromCheckins` takes the mean of the daily check-in's own
  // sleep answer over a rolling window, and `withMeasured` resolves
  // `stored.sleep ?? measured.sleep` — the STORED value first. So a figure
  // typed once at setup would permanently suppress the mean of every check-in
  // the athlete ever gives, which is the same defect as a self-assessed
  // training age and costs more, because sleep is the largest recovery factor
  // in the table. It was briefly asked here and should not have been.
  //
  // The check-in asks it every day, of every persona, on this same 1-5 scale.
  // Nothing is lost by not asking it once, badly, on day zero.
  {
    id: "stress", key: "stress", kind: "number", engineKey: "stress", system: true, enabled: true, order: 5,
    // THE ONE RECOVERY INPUT NOTHING CAN MEASURE. The check-in captures mood and
    // energy and deliberately does not relabel either as life stress, so this
    // genuinely has to be asked or go unknown.
    //
    // Asked of the goal intake only. Someone who came to log their training
    // does not need a question about their job on the way in — the volume
    // ceiling it feeds is a thing they meet later, if at all, and it is a row on
    // the questionnaire screen whenever they want it.
    personas: ["athlete"],
    title: "How stressful is life right now?",
    subtitle: "1 is calm, 5 is very stressed. It costs recovery the same way a hard training week does.",
    min: 1, max: 5, step: 1, defaultValue: 3,
  },
  {
    id: "days", key: "days", kind: "number", engineKey: "daysPerWeek", system: true, enabled: true, order: 6,
    title: "How many days a week?", subtitle: "A plan you'll actually finish beats an ideal one.",
    min: 1, max: 7, step: 1, defaultValue: 3,
  },
  {
    id: "equipment", key: "equipment", kind: "single", engineKey: "equipment", system: true, enabled: true, order: 7,
    title: "What equipment do you have?", subtitle: "We'll only prescribe what you can do.",
    defaultValue: "full",
    choices: [
      { value: "full", label: "Full gym" },
      { value: "home", label: "Home" },
      { value: "minimal", label: "Minimal" },
    ],
  },
];

/** A map of answers, keyed by question key. Values are kind-dependent. */
export type OnboardingAnswerMap = Record<string, string | number | string[] | null | undefined>;

/** Clamp/validate a raw question (e.g. from the DB) into a usable shape, or
 *  return null if it can't be rendered. Defends the clients against bad data. */
export function normalizeOnboardingQuestion(raw: unknown): OnboardingQuestion | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const kind = String(r.kind ?? "") as OnboardingQuestionKind;
  if (!ONBOARDING_QUESTION_KINDS.includes(kind)) return null;
  const key = String(r.key ?? "").trim();
  const title = String(r.title ?? "").trim();
  if (!key || !title) return null;
  const engineKey = ONBOARDING_ENGINE_KEYS.includes(r.engineKey as OnboardingEngineKey)
    ? (r.engineKey as OnboardingEngineKey)
    : undefined;
  const choices = Array.isArray(r.choices)
    ? (r.choices as unknown[])
        .map((c) => (c && typeof c === "object" ? (c as Record<string, unknown>) : null))
        .filter((c): c is Record<string, unknown> => !!c && typeof c.value === "string" && typeof c.label === "string")
        .map((c) => ({ value: String(c.value), label: String(c.label), blurb: c.blurb ? String(c.blurb) : undefined }))
    : undefined;
  return {
    id: String(r.id ?? key),
    key,
    kind,
    title,
    subtitle: r.subtitle ? String(r.subtitle) : undefined,
    engineKey,
    choices,
    min: typeof r.min === "number" ? r.min : undefined,
    max: typeof r.max === "number" ? r.max : undefined,
    step: typeof r.step === "number" ? r.step : undefined,
    defaultValue: typeof r.defaultValue === "string" || typeof r.defaultValue === "number" ? r.defaultValue : undefined,
    required: !!r.required,
    enabled: r.enabled === undefined ? true : !!r.enabled,
    system: !!r.system,
    // WHICH INTAKE, and for a BUILT-IN this is locked to the code default the
    // same way `kind` and `engineKey` are.
    //
    // It has to be. The admin editor stores rows that REPLACE the defaults
    // wholesale — `onboardingQuestionsForClient` prefers the DB set whenever it
    // is non-empty — and those rows have no persona column. So an admin who had
    // ever touched the questionnaire would have silently un-forked the wizard:
    // every athlete asked for a goal again, and every tracker enrolled in a
    // season again, with nothing in the editor to show why. Persona scope is
    // structural rather than copy, so it belongs to the code, not the row.
    //
    // An unrecognised entry is dropped, and an EMPTY result becomes undefined
    // ("both") rather than "nobody" — a question no persona can see is a
    // question that has deleted itself, which is the failure mode `kind` and
    // `engineKey` each shipped with once already.
    personas: normalizePersonas(r.personas) ?? DEFAULT_PERSONAS_BY_KEY[key],
    order: typeof r.order === "number" ? r.order : 0,
  };
}

const CLIENT_PERSONAS: ClientPersona[] = ["casual", "athlete"];

/** Persona scope of each BUILT-IN question, by key — the code-owned default a
 *  stored row inherits. */
const DEFAULT_PERSONAS_BY_KEY: Record<string, ClientPersona[] | undefined> = Object.fromEntries(
  DEFAULT_ONBOARDING_QUESTIONS.map((q) => [q.key, q.personas]),
);

function normalizePersonas(raw: unknown): ClientPersona[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const list = raw.filter((v): v is ClientPersona => CLIENT_PERSONAS.includes(v as ClientPersona));
  return list.length ? [...new Set(list)] : undefined;
}

/** Whether `q` is asked of `persona`. No `personas` means both, and no persona
 *  chosen yet means show everything — the wizard re-filters as soon as the
 *  first question is answered. */
export const questionAppliesTo = (q: OnboardingQuestion, persona?: ClientPersona | null): boolean =>
  !persona || !q.personas || q.personas.includes(persona);

/** The list a client should render: enabled questions, ascending order. Falls
 *  back to the built-in defaults when `rows` is empty (table empty/unmigrated). */
export function onboardingQuestionsForClient(
  rows: unknown[] | null | undefined,
  /** The persona chosen so far. Omitted → every question, which is the state
   *  before the first answer. */
  persona?: ClientPersona | null,
): OnboardingQuestion[] {
  const list = (rows ?? [])
    .map(normalizeOnboardingQuestion)
    .filter((q): q is OnboardingQuestion => !!q);
  const usable = list.length ? list : DEFAULT_ONBOARDING_QUESTIONS;
  return usable
    .filter((q) => q.enabled && questionAppliesTo(q, persona))
    .sort((a, b) => a.order - b.order);
}

/** Pull the engine-relevant answers out of a raw answer map, applying defaults
 *  from the questions so the recommendation engine always has what it needs. */
export function extractEngineAnswers(
  questions: OnboardingQuestion[],
  answers: OnboardingAnswerMap,
): { goal?: string; experience?: Experience; daysPerWeek: number; equipment: Equipment } {
  const byEngine = (k: OnboardingEngineKey) => questions.find((q) => q.engineKey === k);
  const read = (k: OnboardingEngineKey): unknown => {
    const q = byEngine(k);
    if (!q) return undefined;
    const v = answers[q.key];
    return v === undefined || v === null || v === "" ? q.defaultValue : v;
  };
  const exps: Experience[] = ["beginner", "intermediate", "advanced"];
  const equips: Equipment[] = ["full", "home", "minimal"];
  // UNDEFINED WHEN NOT ASKED, rather than "beginner". This function's job is to
  // hand the recommender a usable set, and a fabricated tier is not usable — it
  // is the same claim the removed question used to make, restated as a default.
  const rawExp = read("experience");
  const rawEquip = String(read("equipment") ?? "full");
  const rawGoal = read("goal");
  const days = Number(read("daysPerWeek"));
  return {
    goal: typeof rawGoal === "string" && rawGoal ? rawGoal : undefined,
    experience: exps.includes(rawExp as Experience) ? (rawExp as Experience) : undefined,
    daysPerWeek: Number.isFinite(days) && days > 0 ? days : 3,
    equipment: equips.includes(rawEquip as Equipment) ? (rawEquip as Equipment) : "full",
  };
}

/** Recommend a plan from a dynamic answer map (null if no goal chosen yet or the
 *  matched goal has no plans). Wraps recommendPlan with engine-key extraction. */
export function recommendFromAnswers(
  questions: OnboardingQuestion[],
  answers: OnboardingAnswerMap,
): OnboardingPlan | null {
  const e = extractEngineAnswers(questions, answers);
  if (!e.goal) return null;
  return recommendPlan({ goal: e.goal, experience: e.experience, daysPerWeek: e.daysPerWeek, equipment: e.equipment });
}

const expRank: Record<Experience, number> = { beginner: 0, intermediate: 1, advanced: 2 };

/**
 * Recommend a first plan from intake answers (pure).
 * Returns null when the matched goal has no plans yet (the library is empty
 * until real plans are uploaded).
 */
export function recommendPlan(a: OnboardingAnswers): OnboardingPlan | null {
  const node = GOAL_TREE.find((g) => g.id === a.goal) ?? GOAL_TREE.find((g) => g.id === "hybrid")!;
  const days = Math.max(1, Math.min(7, Math.round(a.daysPerWeek)));

  // Pick the plan whose weekly frequency is closest to what they can commit to;
  // break ties toward more sessions for advanced athletes, fewer for beginners.
  const pick = [...node.plans].sort((x, y) => {
    const dx = Math.abs(x.sessions - days);
    const dy = Math.abs(y.sessions - days);
    if (dx !== dy) return dx - dy;
    // THE TIE-BREAK, and it is all `experience` was ever used for here. With no
    // stated tier — which is now the normal case at setup — it breaks toward
    // FEWER sessions, which is this screen's own stated principle ("a plan
    // you'll actually finish beats an ideal one") rather than a guess that the
    // athlete is a beginner.
    return a.experience && expRank[a.experience] >= 2
      ? y.sessions - x.sessions
      : x.sessions - y.sessions;
  })[0] as GoalPlan | undefined;

  if (!pick) return null;

  // The sentence NAMES A TIER ONLY IF ONE WAS GIVEN. It used to assert one
  // unconditionally, which — with the question gone and `extractEngineAnswers`
  // defaulting to "beginner" — would have told every athlete in the app that
  // they were a beginner, in the one paragraph they read before starting.
  const asTier = a.experience ? ` as ${a.experience === "advanced" ? "an" : "a"} ${a.experience}` : "";
  const why =
    `For ${node.name.toLowerCase()}, training ${days}×/week${asTier} — ` +
    `${pick.name} (${pick.sessions}×/wk) fits best: ${pick.desc}`;

  return {
    goalId: node.id,
    goalLabel: node.name,
    planId: pick.id,
    planName: pick.name,
    weeks: pick.weeks,
    weeklyTarget: pick.sessions,
    focus: pick.focus,
    why,
  };
}
