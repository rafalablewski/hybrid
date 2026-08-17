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

/** A main goal id — always one of the plan library's goal (GOAL_TREE) ids. */
export type OnboardingGoal = string;
export type Experience = "beginner" | "intermediate" | "advanced";
export type Equipment = "full" | "home" | "minimal";

export interface OnboardingAnswers {
  goal: OnboardingGoal;
  experience: Experience;
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
export type OnboardingQuestionKind =
  | "persona" // special: the casual/athlete cards (also sets the persona choice)
  | "goal"    // special: the grouped goal-tree picker (answer is a GOAL_TREE id)
  | "single"  // one choice from `choices` (answer: string)
  | "multi"   // any number of `choices` (answer: string[])
  | "number"  // a stepper between min/max (answer: number)
  | "text";   // free text (answer: string)

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
  "sex", "ageYears", "bodyweightKg",
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
  /** Display order (ascending). */
  order: number;
}

/** The persona choices, shared by every client's persona card. */
export const ONBOARDING_PERSONA_CHOICES: OnboardingChoice[] = [
  { value: "casual", label: "Just track my training", blurb: "Log fast, review at home, share your wins. The clean, simple app — free." },
  { value: "athlete", label: "Train for a goal — give me the data", blurb: "Plans, sport S&C, velocity, performance & technique. The full toolkit — a paid upgrade." },
];

/** The five built-in questions, in display order. Seed + fallback. */
export const DEFAULT_ONBOARDING_QUESTIONS: OnboardingQuestion[] = [
  {
    id: "persona", key: "persona", kind: "persona", engineKey: "persona", system: true, enabled: true, order: 0,
    title: "How do you want to use HYBRID?", subtitle: "You can switch anytime in Settings.",
    choices: ONBOARDING_PERSONA_CHOICES, defaultValue: "casual",
  },
  {
    id: "goal", key: "goal", kind: "goal", engineKey: "goal", system: true, enabled: true, order: 1, required: true,
    title: "What's your main goal?", subtitle: "We'll shape your first plan around it.",
  },
  {
    id: "experience", key: "experience", kind: "single", engineKey: "experience", system: true, enabled: true, order: 2,
    title: "What's your experience?", subtitle: "So we set the right starting load.",
    defaultValue: "beginner",
    choices: [
      { value: "beginner", label: "Beginner" },
      { value: "intermediate", label: "Intermediate" },
      { value: "advanced", label: "Advanced" },
    ],
  },
  // ── THE THREE BODY QUESTIONS ────────────────────────────────────────────
  // NONE OF THEM CARRIES A `defaultValue`, and that is the whole design. The
  // client seeds every answer from its default before the athlete touches
  // anything (see useOnboarding), so a default here would mean an athlete who
  // skipped the question had "80 kg" written down as their own body mass — a
  // fabricated measurement that the model then explains their recovery ceiling
  // with. Unanswered has to stay unanswered. The controls open at a plausible
  // figure; nothing is stored until it is moved.
  {
    id: "sex", key: "sex", kind: "single", engineKey: "sex", system: true, enabled: true, order: 3,
    title: "Male or female?",
    subtitle: "Every strength and pace standard is published for men. Without this we hold you to the men's bar.",
    choices: [
      { value: "F", label: "Female" },
      { value: "M", label: "Male" },
    ],
  },
  {
    id: "age", key: "age", kind: "number", engineKey: "ageYears", system: true, enabled: true, order: 4,
    title: "How old are you?", subtitle: "Recovery declines gently past thirty, and we'd rather not guess.",
    min: 10, max: 100, step: 1,
  },
  {
    id: "bodyweight", key: "bodyweight", kind: "number", engineKey: "bodyweightKg", system: true, enabled: true, order: 5,
    title: "What do you weigh?", subtitle: "It sets how much you have to recover from per set — and your working loads.",
    min: 25, max: 300, step: 0.5,
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
  const kinds: OnboardingQuestionKind[] = ["persona", "goal", "single", "multi", "number", "text"];
  if (!kinds.includes(kind)) return null;
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
    order: typeof r.order === "number" ? r.order : 0,
  };
}

/** The list a client should render: enabled questions, ascending order. Falls
 *  back to the built-in defaults when `rows` is empty (table empty/unmigrated). */
export function onboardingQuestionsForClient(rows: unknown[] | null | undefined): OnboardingQuestion[] {
  const list = (rows ?? [])
    .map(normalizeOnboardingQuestion)
    .filter((q): q is OnboardingQuestion => !!q);
  const usable = list.length ? list : DEFAULT_ONBOARDING_QUESTIONS;
  return usable.filter((q) => q.enabled).sort((a, b) => a.order - b.order);
}

/** Pull the engine-relevant answers out of a raw answer map, applying defaults
 *  from the questions so the recommendation engine always has what it needs. */
export function extractEngineAnswers(
  questions: OnboardingQuestion[],
  answers: OnboardingAnswerMap,
): { goal?: string; experience: Experience; daysPerWeek: number; equipment: Equipment } {
  const byEngine = (k: OnboardingEngineKey) => questions.find((q) => q.engineKey === k);
  const read = (k: OnboardingEngineKey): unknown => {
    const q = byEngine(k);
    if (!q) return undefined;
    const v = answers[q.key];
    return v === undefined || v === null || v === "" ? q.defaultValue : v;
  };
  const exps: Experience[] = ["beginner", "intermediate", "advanced"];
  const equips: Equipment[] = ["full", "home", "minimal"];
  const rawExp = String(read("experience") ?? "beginner");
  const rawEquip = String(read("equipment") ?? "full");
  const rawGoal = read("goal");
  const days = Number(read("daysPerWeek"));
  return {
    goal: typeof rawGoal === "string" && rawGoal ? rawGoal : undefined,
    experience: exps.includes(rawExp as Experience) ? (rawExp as Experience) : "beginner",
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
    return expRank[a.experience] >= 2 ? y.sessions - x.sessions : x.sessions - y.sessions;
  })[0] as GoalPlan | undefined;

  if (!pick) return null;

  const why =
    `For ${node.name.toLowerCase()}, training ${days}×/week as ${a.experience === "advanced" ? "an" : "a"} ${a.experience} — ` +
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
