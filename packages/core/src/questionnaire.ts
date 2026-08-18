import type { Sex } from "./benchmarks";
import type { OnboardingAnswerMap, OnboardingEngineKey, OnboardingQuestion } from "./onboarding";
import {
  sanitizeVolumeProfile, effectiveAgeYears,
  type AthleteVolumeProfile, type LandmarkFactor,
} from "./engines/landmark-profile";
import {
  VOLUME_PROFILE_FIELDS,
  VOLUME_PROFILE_FIELD_KEY,
  type FullAthleteProfile,
  type VolumeProfileFieldKey,
} from "./engines/athlete-profile";

/**
 * THE QUESTIONNAIRE.
 *
 * What the app knows about the athlete, as one declared thing.
 *
 * It used to be called "the volume model", and the name was the first problem:
 * a screen titled after the machine, presenting fifty controls of which about a
 * dozen were questions about a person and the rest were the machine's own
 * internals. The athlete could not tell which was which, so the questions —
 * the part that actually makes freshness, readiness, recovery and every
 * prescription theirs rather than a textbook's — read as one more row of
 * settings. THE QUESTIONS ARE THE PRODUCT. The landmark table is an output.
 *
 * So the questions live here, as DATA, in four sections that name what they are
 * asking about (your body, your training, your recovery, your fuel) rather than
 * what the engine does with them. A section is not decoration: it is the unit
 * the athlete answers in and the unit the progress is reported in, because "you
 * have answered Recovery" is a thing a person can act on and "62% complete" is
 * not.
 *
 * ── THE ONE RULE THIS FILE ENFORCES ────────────────────────────────────────
 *
 * EVERY QUESTION HERE IS READ BY AN ENGINE, and `feeds` names which one. A
 * questionnaire is the easiest surface in an app to pad — a dozen plausible
 * questions about chronotype and caffeine and shoe size would make it FEEL like
 * it knows you — and every padded question is a promise the numbers do not
 * keep. `questionnaire.test.ts` holds the line: a key that no factor consumes
 * cannot be added here, and a profile field the engines DO read cannot be left
 * out.
 *
 * Fields the app can answer for itself are marked `derivable`, and the two it
 * answers ENTIRELY for itself (`measuredOnly`: heat exposure and protein) are
 * declared as questions anyway, deliberately — they move the athlete's ceiling,
 * so they belong on the page that says what moved it. They are rendered as
 * readings, never as blanks to fill: asking someone to type an answer the log
 * already holds is how a form loses the person filling it in.
 */

/** Every key the questionnaire can carry. A superset of `VolumeProfileFieldKey`
 *  by exactly the fields that are refinements or pure measurements. */
export type QuestionKey = VolumeProfileFieldKey | "trainingYears" | "heat" | "proteinGPerKg";

export type QuestionKind =
  /** One of a small, named set — rendered as a segmented control. */
  | "choice"
  /** 1–5, with both ends named — rendered as five marks, not a slider. */
  | "scale"
  /** A quantity with a unit — rendered as a scrubbable figure. */
  | "number"
  /** A year and a month — the one date the questionnaire asks for. */
  | "birth";

export interface QuestionChoice<T extends string = string> {
  value: T;
  labelKey: string;
}

export interface Question {
  key: QuestionKey;
  kind: QuestionKind;
  /** The short name, on the answered row. Reuses the labels the Volume screen's
   *  factor list already carries, so a factor and its question are never two
   *  different words for one input. */
  labelKey: string;
  /** What answering it BUYS, in the athlete's terms. */
  whyKey: string;
  /** Which landmark factor consumes it — or `standards`, for the one input that
   *  moves the published thresholds rather than a multiplier. */
  feeds: LandmarkFactor["key"] | "standards";
  /** How much of the estimate rests on this one, 0…1. Zero means it refines
   *  another answer rather than standing on its own, and it is deliberately NOT
   *  counted in progress — see `refines`. */
  weight: number;
  /** True when the app can fill it from data it already holds. */
  derivable: boolean;
  /** The app answers this one outright. Rendered as a reading, never a blank. */
  measuredOnly?: boolean;
  /**
   * The answer is a DATED MEASUREMENT and belongs in the body log, not on the
   * profile. Still asked, still edited here — but writing it appends a weigh-in
   * rather than setting a standing field, so it can never go stale and the
   * scale, the tonnage maths and the maintenance fit all see the same number.
   */
  logged?: boolean;
  /**
   * The question this one SHARPENS rather than answers on its own.
   *
   * A refinement produces no factor of its own — it changes what another
   * answer means. Height does not move a multiplier; it makes body mass read
   * against the frame carrying it (`frameAdjustedMassKg`), so a tall lifter is
   * not docked for being tall. Years lifting does not move one either; it
   * overrules the self-described training-age tier when the two disagree.
   *
   * It is not the same thing as being unscored — height carries real weight in
   * the completeness table and years does not. `weight` decides that; this
   * decides how the row is presented (under the answer it sharpens) and what
   * the factor test asserts about it.
   */
  refines?: QuestionKey;
  /** choice */
  choices?: readonly QuestionChoice[];
  /** number + scale */
  min?: number;
  max?: number;
  step?: number;
  /**
   * WHERE A NUMBER STARTS WHEN THE ATHLETE FIRST REACHES FOR IT.
   *
   * Not a default and never displayed as one — an unanswered question shows as
   * unanswered, because a body mass the app guessed and presented as the
   * athlete's would be a fabricated measurement feeding a model that then
   * explains itself with it. This is only the value the control opens AT once
   * they have said they want to answer, so setting 82 kg is a short drag from a
   * plausible place rather than fifty-seven taps up from the floor.
   */
  seed?: number;
  /** The unit shown beside a number's figure. */
  unitKey?: string;
  /** scale: what 1 and 5 mean. A 1–5 with unnamed ends is a number the athlete
   *  has to guess the direction of, and half of them guess wrong. */
  lowKey?: string;
  highKey?: string;
}

export interface QuestionnaireSection {
  id: "body" | "training" | "recovery" | "fuel";
  titleKey: string;
  /** One line on what this section is for — shown under the title. */
  blurbKey: string;
  questions: Question[];
}

const EXPERIENCE_CHOICES = [
  { value: "beginner", labelKey: "w.analyze.vol.expBeginner" },
  { value: "intermediate", labelKey: "w.analyze.vol.expIntermediate" },
  { value: "advanced", labelKey: "w.analyze.vol.expAdvanced" },
] as const satisfies readonly QuestionChoice[];

const SEX_CHOICES = [
  { value: "F", labelKey: "w.analyze.vol.sexF" },
  { value: "M", labelKey: "w.analyze.vol.sexM" },
] as const satisfies readonly QuestionChoice<Sex>[];

const NUTRITION_CHOICES = [
  { value: "deficit", labelKey: "w.analyze.vol.nutDeficit" },
  { value: "maintenance", labelKey: "w.analyze.vol.nutMaintenance" },
  { value: "surplus", labelKey: "w.analyze.vol.nutSurplus" },
] as const satisfies readonly QuestionChoice[];

/** The weight `athlete-profile.ts` assigns a field, so the two files cannot
 *  disagree about what matters. A refinement is not in that table and gets 0. */
const weightOf = (key: QuestionKey): number =>
  VOLUME_PROFILE_FIELDS.find((f) => f.key === key)?.weight ?? 0;

const derivableOf = (key: QuestionKey): boolean =>
  VOLUME_PROFILE_FIELDS.find((f) => f.key === key)?.derivable ?? true;

const unlocksOf = (key: QuestionKey, fallback: string): string =>
  VOLUME_PROFILE_FIELDS.find((f) => f.key === key)?.unlocksKey ?? fallback;

const q = (key: QuestionKey, rest: Omit<Question, "key" | "weight" | "derivable" | "labelKey" | "whyKey"> & {
  labelKey?: string;
  whyKey?: string;
}): Question => ({
  key,
  labelKey: rest.labelKey ?? VOLUME_PROFILE_FIELD_KEY[key as VolumeProfileFieldKey] ?? `w.quiz.field.${key}`,
  whyKey: rest.whyKey ?? unlocksOf(key, `w.quiz.why.${key}`),
  weight: weightOf(key),
  derivable: derivableOf(key),
  ...rest,
});

/**
 * THE SECTIONS, in the order they are asked.
 *
 * Body first because it is the section every athlete can answer from memory in
 * fifteen seconds, and a form whose first question needs thinking about is a
 * form that gets abandoned on question one. Training second because it carries
 * the single heaviest input. Recovery and Fuel last because they are the two
 * the app can increasingly answer for itself — by the time an athlete has been
 * logging a month, most of those rows are already filled in.
 */
export const QUESTIONNAIRE: QuestionnaireSection[] = [
  {
    id: "body",
    titleKey: "w.quiz.body.title",
    blurbKey: "w.quiz.body.blurb",
    questions: [
      q("sex", { kind: "choice", choices: SEX_CHOICES, feeds: "standards" }),
      // ASKED AS A DATE. An age is a number that stops being true the day after
      // it is given; deriving the year from one was better and still ±1,
      // because `currentYear − age` is only right once the birthday has passed
      // — an error the same size as the factor's own yearly step. The bounds
      // are computed from the clock (`birthYearBounds`) rather than frozen into
      // this table at import time, which in a long-lived process would pin them
      // to the year the module was first loaded.
      q("ageYears", { kind: "birth", feeds: "age", labelKey: "w.quiz.field.birth", whyKey: "w.quiz.why.birth" }),
      q("heightCm", { kind: "number", min: 120, max: 230, step: 1, seed: 175, unitKey: "w.quiz.unit.cm", feeds: "bodyweight", refines: "bodyweightKg" }),
      // ── THE ONE QUESTION THAT IS A MEASUREMENT ────────────────────────
      // Body mass is not a standing claim about the athlete, it is a reading
      // with a date, and they take a new one every time they step on a scale.
      // The answer therefore lives in the BODY LOG rather than on the profile,
      // and this row edits that log — which is why the value shows as measured
      // the moment a weigh-in exists. See `withMeasured` for the precedence
      // inversion that makes the newest reading win over anything typed.
      q("bodyweightKg", {
        kind: "number", min: 25, max: 300, step: 0.5, seed: 80,
        unitKey: "w.quiz.unit.kg", feeds: "bodyweight", logged: true,
      }),
    ],
  },
  {
    id: "training",
    titleKey: "w.quiz.training.title",
    blurbKey: "w.quiz.training.blurb",
    questions: [
      q("experience", { kind: "choice", choices: EXPERIENCE_CHOICES, feeds: "experience", labelKey: "w.analyze.vol.factorExperience" }),
      // THE ONE QUESTION THAT WAS SANITIZED, STORED, READ BY THE ENGINE AND
      // NEVER ASKED. `effectiveExperience` overrules the self-described tier
      // from it — under a year reads as beginner however you describe yourself,
      // five years reads as advanced — so an athlete who called themselves
      // intermediate after six months was being taken at their word by a model
      // that had a better answer and no way to hear it.
      q("trainingYears", {
        kind: "number", min: 0, max: 60, step: 1, seed: 3, unitKey: "w.quiz.unit.years",
        feeds: "experience", refines: "experience",
        labelKey: "w.quiz.field.trainingYears", whyKey: "w.quiz.why.trainingYears",
      }),
      q("daysPerWeek", { kind: "number", min: 1, max: 14, step: 1, seed: 4, unitKey: "w.quiz.unit.perWeek", feeds: "frequency" }),
    ],
  },
  {
    id: "recovery",
    titleKey: "w.quiz.recovery.title",
    blurbKey: "w.quiz.recovery.blurb",
    questions: [
      q("sleep", {
        kind: "scale", min: 1, max: 5, step: 1, seed: 3, feeds: "sleep",
        lowKey: "w.quiz.scale.sleepLow", highKey: "w.quiz.scale.sleepHigh",
        labelKey: "w.analyze.vol.factorSleep",
      }),
      q("stress", {
        kind: "scale", min: 1, max: 5, step: 1, seed: 3, feeds: "stress",
        lowKey: "w.quiz.scale.stressLow", highKey: "w.quiz.scale.stressHigh",
        labelKey: "w.analyze.vol.factorStress",
      }),
      q("heat", {
        kind: "number", min: 0, max: 14, step: 1, unitKey: "w.quiz.unit.perWeek",
        feeds: "heat", measuredOnly: true,
        labelKey: "w.analyze.vol.factorHeat", whyKey: "w.quiz.why.heat",
      }),
    ],
  },
  {
    id: "fuel",
    titleKey: "w.quiz.fuel.title",
    blurbKey: "w.quiz.fuel.blurb",
    questions: [
      q("nutrition", { kind: "choice", choices: NUTRITION_CHOICES, feeds: "nutrition", labelKey: "w.analyze.vol.factorNutrition" }),
      q("proteinGPerKg", {
        kind: "number", min: 0, max: 5, step: 0.1, unitKey: "w.quiz.unit.gPerKg",
        feeds: "protein", measuredOnly: true,
        labelKey: "w.analyze.vol.factorProtein", whyKey: "w.quiz.why.protein",
      }),
    ],
  },
];

/**
 * The years a birth date may fall in, against the same 10–100 age bounds every
 * other surface uses. Computed on demand: a constant evaluated at import time
 * would freeze the range to whenever the module was first loaded.
 */
export function birthYearBounds(now: number = Date.now()): { min: number; max: number } {
  const y = new Date(now).getUTCFullYear();
  return { min: y - 100, max: y - 10 };
}

/**
 * THE TWELVE MONTHS, as i18n keys.
 *
 * In core because BOTH surfaces that ask for a birth date render them — the
 * setup wizard and the questionnaire itself — and a list copied into two
 * screens is the shape three separate bugs took on this branch already. Keys
 * rather than locale month names on purpose: the row reads in the app's
 * language, which is a different setting from the device's.
 */
export const MONTH_KEYS: readonly string[] = [
  "w.quiz.mon.1", "w.quiz.mon.2", "w.quiz.mon.3", "w.quiz.mon.4",
  "w.quiz.mon.5", "w.quiz.mon.6", "w.quiz.mon.7", "w.quiz.mon.8",
  "w.quiz.mon.9", "w.quiz.mon.10", "w.quiz.mon.11", "w.quiz.mon.12",
];

/** Every question, flat, in section order. */
export const QUESTIONS: Question[] = QUESTIONNAIRE.flatMap((s) => s.questions);

/**
 * THE ANSWERS SETUP ALREADY COLLECTED, ON THE QUESTIONNAIRE'S TERMS.
 *
 * Setup is the only moment an athlete expects to be asked about themselves, and
 * the intake already asks five questions — of which training age, sessions per
 * week and (since Aug 2026) sex, age and body mass are questionnaire answers.
 * This is the ONE mapping from one to the other.
 *
 * ── WHY IT HAD TO EXIST ────────────────────────────────────────────────────
 *
 * There was no mapping at all. The intake's answers went to the server and
 * stopped there, while three consumers read them from device keys —
 * `hybrid.experience`, `hybrid.daysPerWeek`, `hybrid.equipment` — that NOTHING
 * on either client has ever written. `git log -S` finds no writer in the whole
 * history. So the volume model's intake fallback was always empty, and, worse,
 * `prescribeSession` on Today has always run with `experience: undefined` and
 * `equipment: undefined`: the athlete answered, and every engine downstream was
 * told nothing. It is the same defect as the dropped `sex` field, three more
 * times, and it is why the answers now go to ONE destination that is read
 * rather than three keys that are not.
 *
 * Everything lands through `sanitizeVolumeProfile` — the same validator the
 * clients and the API save through — so an intake answer cannot enter the
 * profile by a route with looser bounds than a typed one.
 */
export function questionnaireFromAnswers(
  questions: OnboardingQuestion[],
  answers: OnboardingAnswerMap,
  opts: { now?: number } = {},
): AthleteVolumeProfile {
  const read = (k: OnboardingEngineKey): unknown => {
    const q = questions.find((x) => x.engineKey === k);
    if (!q) return undefined;
    const v = answers[q.key];
    // NOTE the deliberate absence of a `?? q.defaultValue` fallback, which
    // `extractEngineAnswers` does have and needs — it must always hand the plan
    // recommender a complete set. This one must not: a default written into the
    // profile is an answer the athlete never gave, and the profile is where
    // "we don't know" has to stay distinguishable from "we guessed".
    return v === undefined || v === null || v === "" ? undefined : v;
  };
  const n = (v: unknown): number | undefined => {
    const x = typeof v === "number" ? v : Number(v);
    return Number.isFinite(x) ? x : undefined;
  };
  // The birth question's answer is a "YYYY-MM" string — one answer-map slot for
  // a two-part value, so the admin-editable question schema needs no new value
  // type to carry it.
  const birth = parseBirth(read("birthYear"));
  return sanitizeVolumeProfile({
    experience: read("experience"),
    sex: read("sex"),
    birthYear: birth?.year,
    birthMonth: birth?.month,
    daysPerWeek: n(read("daysPerWeek")),
    // BODY MASS IS DELIBERATELY ABSENT. It is a reading with a date, not a
    // standing answer, so setup writes it to the BODY LOG — the same store the
    // scale, the nutrition maintenance fit and every bodyweight-aware tonnage
    // already read. `bodyMassFromAnswers` below is what the caller posts.
  }, { now: opts.now });
}

/**
 * Parse the birth question's answer — `"YYYY-MM"`, or `"YYYY"` while only the
 * year has been given. Anything else is no answer: a half-parsed date would put
 * a year nobody gave into the recovery factor.
 *
 * THE YEAR-ONLY FORM IS NOT A LOOSE END, it is the partial answer the model
 * already supports. `birthMonth` is optional precisely so a year alone keeps
 * the honest ±1 reading (`effectiveAgeYears`) rather than having a month
 * invented for it — and a wizard that stored January for an untouched month
 * would be inventing one, in the one place the athlete cannot see it happen.
 */
export function parseBirth(v: unknown): { year: number; month?: number } | undefined {
  if (typeof v !== "string") return undefined;
  const m = /^(\d{4})(?:-(\d{1,2}))?$/.exec(v.trim());
  if (!m) return undefined;
  const year = Number(m[1]);
  if (m[2] === undefined) return { year };
  const month = Number(m[2]);
  return month >= 1 && month <= 12 ? { year, month } : undefined;
}

/** Format a birth date back into the answer the question stores. The month is
 *  omitted when there isn't one — see `parseBirth`. */
export function formatBirth(year: number, month?: number): string {
  return month == null ? String(year) : `${year}-${String(month).padStart(2, "0")}`;
}

/** The body mass setup collected, for the caller to log as a dated weigh-in.
 *  Undefined when the athlete skipped it — nothing is invented. */
export function bodyMassFromAnswers(
  questions: OnboardingQuestion[],
  answers: OnboardingAnswerMap,
): number | undefined {
  const q = questions.find((x) => x.engineKey === "bodyweightKg");
  const v = q ? answers[q.key] : undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 25 && n <= 300 ? n : undefined;
}

/** One question by key — the lookup both clients would otherwise hand-roll. */
export function question(key: QuestionKey): Question | undefined {
  return QUESTIONS.find((x) => x.key === key);
}

/** A question is ASKED when the athlete can answer it. The measured ones are
 *  shown, not asked, and progress must not count what it never offered. */
export const isAsked = (x: Question): boolean => !x.measuredOnly;

/** Counts toward progress. The weight table in `athlete-profile.ts` is the sole
 *  authority: a question it does not weigh (a pure refinement like years
 *  lifting) is askable and useful but cannot hold an athlete below complete. */
export const isScored = (x: Question): boolean => isAsked(x) && x.weight > 0;

const has = (v: unknown): boolean =>
  v !== undefined && v !== null && v !== "" && !(typeof v === "number" && !Number.isFinite(v));

export interface SectionProgress {
  id: QuestionnaireSection["id"];
  /** 0…1, weighted by how much each answer moves the estimate. */
  score: number;
  /** How many of the section's scored questions are answered, and out of how
   *  many — the figure a person can actually act on ("2 of 4"). */
  answered: number;
  total: number;
  complete: boolean;
}

export interface QuestionnaireProgress {
  /** 0…1 across every scored question. */
  score: number;
  sections: SectionProgress[];
  /** The most valuable unanswered question, or null when everything is in. */
  next: Question | null;
  /** The section `next` lives in — so a "carry on" control can open the right
   *  one rather than the top of the form. */
  nextSection: QuestionnaireSection["id"] | null;
  complete: boolean;
  /** Keys the app answered for itself, of those that are answered at all. */
  measured: QuestionKey[];
}

/**
 * How far through the questionnaire the athlete is — overall and per section.
 *
 * Weighted, not counted, for the reason `volumeProfileCompleteness` gives: a
 * missing training age matters ten times more than a missing stress rating, and
 * a bar that treats them equally lies about where the effort pays off. A field
 * the app MEASURED counts as answered — it is answered, just not by them — and
 * is reported in `measured` so the UI can say which.
 */
export function questionnaireProgress(
  profile: FullAthleteProfile | null | undefined,
  measuredKeys: Iterable<string> = [],
  opts: { now?: number } = {},
): QuestionnaireProgress {
  // AGE IS DERIVED, so a profile carrying only a birth year has answered it.
  // Resolving here rather than at every call site is what stops the form and
  // the Profile card disagreeing about whether the question is done.
  const resolved: FullAthleteProfile | null | undefined = profile
    ? { ...profile, ageYears: effectiveAgeYears(profile, opts.now) }
    : profile;
  const measuredSet = new Set(measuredKeys);
  const measured: QuestionKey[] = [];
  const gaps: Question[] = [];
  const sections: SectionProgress[] = [];
  let score = 0;
  let total = 0;

  for (const section of QUESTIONNAIRE) {
    let sScore = 0;
    let sTotal = 0;
    let sAnswered = 0;
    let sCount = 0;
    for (const x of section.questions) {
      if (measuredSet.has(x.key) && has(resolved?.[x.key as keyof FullAthleteProfile])) measured.push(x.key);
      if (!isScored(x)) continue;
      sTotal += x.weight;
      sCount += 1;
      if (has(resolved?.[x.key as keyof FullAthleteProfile])) {
        sScore += x.weight;
        sAnswered += 1;
      } else {
        gaps.push(x);
      }
    }
    score += sScore;
    total += sTotal;
    sections.push({
      id: section.id,
      score: sTotal > 0 ? Math.round((sScore / sTotal) * 100) / 100 : 1,
      answered: sAnswered,
      total: sCount,
      complete: sAnswered === sCount,
    });
  }

  gaps.sort((a, b) => b.weight - a.weight);
  const next = gaps[0] ?? null;
  return {
    score: total > 0 ? Math.round((score / total) * 100) / 100 : 0,
    sections,
    next,
    nextSection: next ? (QUESTIONNAIRE.find((s) => s.questions.includes(next))?.id ?? null) : null,
    complete: gaps.length === 0,
    measured,
  };
}
