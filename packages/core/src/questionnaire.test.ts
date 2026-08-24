import { describe, expect, it } from "vitest";
import {
  QUESTIONNAIRE,
  QUESTIONS,
  isAsked,
  isScored,
  question,
  questionnaireProgress,
  questionnaireFromAnswers,
  bodyMassFromAnswers,
  birthYearBounds,
  MONTH_KEYS,
  parseBirth,
  formatBirth,
  type Question,
  type QuestionKey,
} from "./questionnaire";
import { VOLUME_PROFILE_FIELDS } from "./engines/athlete-profile";
import { DEFAULT_ONBOARDING_QUESTIONS, ONBOARDING_ENGINE_KEYS, onboardingQuestionsForClient } from "./onboarding";
import { personalizeLandmarks, sanitizeVolumeProfile, effectiveAgeYears, type AthleteVolumeProfile } from "./engines/landmark-profile";

/** A legal answer to any question, for the round-trip and factor checks. */
function sample(x: Question): unknown {
  if (x.kind === "choice") return x.choices![0]!.value;
  // The birth question stores a year and a month, not the age it is labelled
  // with — so the round-trip below tests the fields that are actually saved.
  if (x.kind === "birth") return BIRTH;
  // A value comfortably inside the bounds, and DIFFERENT from the model's
  // neutral point where one exists — a factor that only fires off the default
  // would pass a test written against the default and do nothing in the app.
  if (x.key === "bodyweightKg") return 110;
  if (x.key === "heightCm") return 178;
  if (x.key === "sleep") return 2;
  if (x.key === "stress") return 5;
  if (x.key === "daysPerWeek") return 2;
  if (x.key === "trainingYears") return 8;
  if (x.key === "heat") return 4;
  if (x.key === "proteinGPerKg") return 0.9;
  return x.min ?? 1;
}

/** A birth date well past the age reference, so it produces a real factor. */
const BIRTH = { birthYear: 1981, birthMonth: 4 };

/**
 * The question as it lands ON THE PROFILE. Almost always one field named by the
 * question's key — but the birth question is labelled `ageYears` (the weight
 * table and the label belong to the age it answers) and STORES a year and a
 * month, so the test has to write what the sanitizer will keep.
 */
const profileOf = (x: Question): AthleteVolumeProfile =>
  (x.kind === "birth" ? { ...BIRTH } : { [x.key]: sample(x) }) as AthleteVolumeProfile;

describe("the questionnaire is only questions the engines read", () => {
  /**
   * THE PADDING GUARD. A questionnaire is the easiest surface in an app to pad,
   * and every padded question is a promise the numbers do not keep. A question
   * earns its row by moving a multiplier the athlete can see — so each one
   * declares which factor it feeds, and this asserts the factor actually fires.
   */
  it("every question that names a landmark factor produces that factor", () => {
    for (const x of QUESTIONS) {
      if (x.feeds === "standards" || x.refines) continue; // covered by their own cases below
      const { factors } = personalizeLandmarks(profileOf(x));
      expect(factors.map((f) => f.key), `${x.key} → ${x.feeds}`).toContain(x.feeds);
    }
  });

  /**
   * A refinement produces no factor of its own — it changes what another answer
   * MEANS. That is a weaker claim than "it moves a multiplier" and it still has
   * to be true: a refinement that changed nothing would be a question asked for
   * decoration, which is the thing this file exists to prevent.
   */
  it("every refinement changes the answer it sharpens", () => {
    for (const x of QUESTIONS.filter((y) => y.refines)) {
      const target = question(x.refines!)!;
      const alone = personalizeLandmarks(profileOf(target));
      const both = personalizeLandmarks({ ...profileOf(target), ...profileOf(x) });
      const of = (r: typeof alone) => r.factors.find((f) => f.key === x.feeds);
      expect(of(both), `${x.key} sharpening ${target.key}`).toBeDefined();
      expect(of(both)!.multiplier, `${x.key} changed nothing`).not.toBe(of(alone)?.multiplier);
    }
  });

  /** `sex` is the one input that moves the published thresholds rather than a
   *  multiplier (engines/fitness-level.ts shifts every strength and pace bar by
   *  it), so it is the only question allowed to name `standards`. */
  it("only sex feeds the standards", () => {
    expect(QUESTIONS.filter((x) => x.feeds === "standards").map((x) => x.key)).toEqual(["sex"]);
  });

  it("covers every weighted field the completeness model scores", () => {
    const asked = new Set(QUESTIONS.filter(isAsked).map((x) => x.key as string));
    for (const f of VOLUME_PROFILE_FIELDS) expect(asked, f.key).toContain(f.key);
  });

  it("scores exactly the weighted fields, and no refinement", () => {
    expect(QUESTIONS.filter(isScored).map((x) => x.key).sort()).toEqual(
      VOLUME_PROFILE_FIELDS.map((f) => f.key).sort(),
    );
    // An unweighted question must never be scored: adding one would otherwise
    // drop every athlete who had answered everything back below complete.
    for (const x of QUESTIONS) if (x.weight === 0) expect(isScored(x)).toBe(false);
  });

  it("keys are unique and every refinement points at a real question", () => {
    const keys = QUESTIONS.map((x) => x.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const x of QUESTIONS) if (x.refines) expect(question(x.refines)).toBeDefined();
  });

  it("declares bounds for every number and scale, and choices for every choice", () => {
    for (const x of QUESTIONS) {
      if (x.kind === "birth") {
        // A date carries no min/max of its own: the bounds move with the clock,
        // so they are computed (`birthYearBounds`) rather than frozen here.
        const { min, max } = birthYearBounds(Date.UTC(2026, 7, 18));
        expect(max - min, "a hundred years of birth dates").toBe(90);
        continue;
      }
      if (x.kind === "choice") {
        expect(x.choices?.length, x.key).toBeGreaterThan(1);
      } else {
        expect(typeof x.min, x.key).toBe("number");
        expect(x.max!, x.key).toBeGreaterThan(x.min!);
      }
      // Every number opens SOMEWHERE when first reached for, and that somewhere
      // has to be legal — a seed outside the bounds would be clamped on the
      // first tap, so the control would move before the athlete touched it.
      if (x.kind !== "choice" && !x.measuredOnly) {
        expect(x.seed, `${x.key} has no seed`).toBeGreaterThanOrEqual(x.min!);
        expect(x.seed!, x.key).toBeLessThanOrEqual(x.max!);
      }
      // A 1–5 with unnamed ends is a number the athlete has to guess the
      // direction of, and half of them guess wrong.
      if (x.kind === "scale") {
        expect(x.lowKey, x.key).toBeTruthy();
        expect(x.highKey, x.key).toBeTruthy();
      }
    }
  });
});

describe("every asked answer survives being saved", () => {
  /**
   * THE REGRESSION THIS FILE EXISTS FOR.
   *
   * `sanitizeVolumeProfile` is the save. A key it does not name is discarded on
   * the next write, silently — which is what happened to `sex` from the day the
   * toggle shipped: tapped, stored, dropped, and read back as undefined, so the
   * control never even lit and every female athlete kept the men's bar.
   */
  it("round-trips each asked question through the sanitizer", () => {
    for (const x of QUESTIONS.filter(isAsked)) {
      const written = profileOf(x);
      const saved = sanitizeVolumeProfile(written);
      // Every field the question writes has to survive — for the birth question
      // that is two of them, which is precisely the shape a `sex`-style drop
      // would hide in.
      for (const [key, value] of Object.entries(written)) {
        expect(saved[key as keyof AthleteVolumeProfile], `${x.key}.${key} was dropped on save`).toBe(value);
      }
    }
  });

  it("keeps sex specifically — the field that was being dropped", () => {
    expect(sanitizeVolumeProfile({ sex: "F" }).sex).toBe("F");
    expect(sanitizeVolumeProfile({ sex: "M" }).sex).toBe("M");
    expect(sanitizeVolumeProfile({ sex: "other" }).sex).toBeUndefined();
  });

  /** The measured pair is deliberately NOT storable: they are read from the log
   *  on every resolve, so a stale copy on the profile could outlive the data it
   *  was derived from and contradict the panel beside it. */
  it("does not store the measured answers", () => {
    const saved = sanitizeVolumeProfile({ heat: 4, proteinGPerKg: 1.9 });
    expect(saved.heat).toBeUndefined();
    expect(saved.proteinGPerKg).toBeUndefined();
    for (const x of QUESTIONS.filter((y) => y.measuredOnly)) expect(x.derivable).toBe(true);
  });

  it("refuses values outside the bounds it advertises", () => {
    for (const x of QUESTIONS.filter(isAsked)) {
      if (x.kind === "choice") continue;
      if (x.kind === "birth") continue; // bounds move with the clock; covered above
      const over = sanitizeVolumeProfile({ [x.key]: x.max! + 1 });
      const under = sanitizeVolumeProfile({ [x.key]: x.min! - 1 });
      expect(over[x.key as keyof AthleteVolumeProfile], `${x.key} accepted ${x.max! + 1}`).toBeUndefined();
      expect(under[x.key as keyof AthleteVolumeProfile], `${x.key} accepted ${x.min! - 1}`).toBeUndefined();
    }
  });
});

describe("progress", () => {
  it("is zero on an empty profile and complete on a full one", () => {
    expect(questionnaireProgress({}).score).toBe(0);
    expect(questionnaireProgress({}).complete).toBe(false);

    const full: Record<string, unknown> = {};
    for (const x of QUESTIONS.filter(isScored)) Object.assign(full, profileOf(x));
    const done = questionnaireProgress(full);
    expect(done.score).toBe(1);
    expect(done.complete).toBe(true);
    expect(done.next).toBeNull();
    expect(done.nextSection).toBeNull();
    expect(done.sections.every((s) => s.complete)).toBe(true);
  });

  it("names the heaviest gap next, and the section it lives in", () => {
    const p = questionnaireProgress({});
    // Training age leads by a distance — it is the only input that scales the
    // stimulus end, so it is what the form should ask for first.
    expect(p.next?.key).toBe("experience");
    expect(p.nextSection).toBe("training");

    const withExp = questionnaireProgress({ experience: "intermediate" });
    expect(withExp.next?.key).toBe("bodyweightKg");
    expect(withExp.nextSection).toBe("body");
  });

  it("reports a section as answered-of-total, not just a percentage", () => {
    const body = questionnaireProgress({ sex: "F", ageYears: 30 }).sections.find((s) => s.id === "body")!;
    expect(body.answered).toBe(2);
    expect(body.total).toBe(4);
    expect(body.complete).toBe(false);
  });

  it("weights within a section rather than counting boxes", () => {
    const heavy = questionnaireProgress({ bodyweightKg: 80 }).sections.find((s) => s.id === "body")!;
    const light = questionnaireProgress({ heightCm: 180 }).sections.find((s) => s.id === "body")!;
    expect(heavy.answered).toBe(light.answered);
    expect(heavy.score).toBeGreaterThan(light.score);
  });

  it("counts a measured answer as answered, and says which were measured", () => {
    const p = questionnaireProgress({ bodyweightKg: 82, sleep: 4 }, ["bodyweightKg"]);
    expect(p.measured).toEqual(["bodyweightKg"]);
    expect(p.sections.find((s) => s.id === "body")!.answered).toBe(1);
  });

  it("ignores a refinement in the score", () => {
    const bare = questionnaireProgress({ experience: "advanced" });
    const refined = questionnaireProgress({ experience: "advanced", trainingYears: 9 });
    expect(refined.score).toBe(bare.score);
    expect(refined.sections.find((s) => s.id === "training")!.total)
      .toBe(bare.sections.find((s) => s.id === "training")!.total);
  });

  it("survives a null profile", () => {
    expect(questionnaireProgress(null).score).toBe(0);
    expect(questionnaireProgress(undefined).next?.key).toBe("experience");
  });
});

describe("what setup already asked", () => {
  const qs = onboardingQuestionsForClient(DEFAULT_ONBOARDING_QUESTIONS);

  const NOW = Date.UTC(2026, 7, 18);

  it("carries the intake's answers onto the profile", () => {
    const p = questionnaireFromAnswers(qs, {
      persona: "athlete", goal: "hybrid", experience: "advanced",
      sex: "F", birth: "1992-04", bodyweight: 61.5, days: 5, equipment: "full",
      sleep: 4, stress: 2,
    }, { now: NOW });
    // The date is stored as given; body mass is not here at all (a dated
    // measurement, so it goes to the body log); and neither is TRAINING AGE,
    // even though an answer for it was passed in — setup does not ask for one,
    // and the profile takes it from the log rather than from a tap.
    expect(p).toEqual({
      sex: "F", birthYear: 1992, birthMonth: 4, daysPerWeek: 5, sleep: 4, stress: 2,
    });
    expect(effectiveAgeYears(p, NOW)).toBe(34);
    expect(bodyMassFromAnswers(qs, { bodyweight: 61.5 })).toBe(61.5);
  });

  /** A stored age is the same number five years later, while the recovery
   *  factor moves 1.2% for every one of them. The year is what stays true. */
  it("ages with the athlete instead of freezing at setup", () => {
    const p = questionnaireFromAnswers(qs, { birth: "1996-04" }, { now: NOW });
    expect(effectiveAgeYears(p, NOW)).toBe(30);
    expect(effectiveAgeYears(p, Date.UTC(2031, 7, 18))).toBe(35);
    // …and the factor follows it, which is the whole point.
    const then = personalizeLandmarks(p, undefined, { now: Date.UTC(2031, 7, 18) });
    const now = personalizeLandmarks(p, undefined, { now: NOW });
    expect(then.recovery).toBeLessThan(now.recovery);
  });

  it("still reads a legacy profile that only has an age", () => {
    expect(effectiveAgeYears({ ageYears: 41 }, NOW)).toBe(41);
    // …and prefers the year when a profile carries both.
    expect(effectiveAgeYears({ ageYears: 41, birthYear: 1990 }, NOW)).toBe(36);
  });

  /**
   * THE MONTH IS WHAT MAKES THIS EXACT. Deriving a year from an age was right
   * only once the birthday had passed, so it carried a ±1-year error — the same
   * size as the factor's own yearly step, which is to say the correction could
   * be as large as the thing it corrected.
   */
  it("does not count a birthday that has not happened yet", () => {
    // In August 2026: born April 1996 is 30, born December 1996 is still 29.
    expect(effectiveAgeYears({ birthYear: 1996, birthMonth: 4 }, NOW)).toBe(30);
    expect(effectiveAgeYears({ birthYear: 1996, birthMonth: 12 }, NOW)).toBe(29);
    // …and the birthday month itself counts as passed.
    expect(effectiveAgeYears({ birthYear: 1996, birthMonth: 8 }, NOW)).toBe(30);
  });

  /** A profile written before the month was asked keeps the honest ±1 reading
   *  rather than having a month invented to sharpen it. */
  it("falls back to the year alone when no month was given", () => {
    expect(effectiveAgeYears({ birthYear: 1996 }, NOW)).toBe(30);
    expect(sanitizeVolumeProfile({ birthMonth: 4 }).birthMonth).toBeUndefined();
    expect(sanitizeVolumeProfile({ birthYear: 1996, birthMonth: 13 }).birthMonth).toBeUndefined();
  });

  /** Both surfaces that ask for a date render these, so they live in core —
   *  a list copied into two screens is the shape three bugs took on this
   *  branch already. */
  it("names twelve months, once", () => {
    expect(MONTH_KEYS).toHaveLength(12);
    expect(new Set(MONTH_KEYS).size).toBe(12);
    MONTH_KEYS.forEach((k, i) => expect(k).toBe(`w.quiz.mon.${i + 1}`));
  });

  it("refuses a half-parsed date rather than inventing a year", () => {
    for (const bad of ["96-04", "1996-13", "1996-", "", "banana", 1996, null]) {
      expect(parseBirth(bad), String(bad)).toBeUndefined();
    }
    expect(parseBirth("1996-4")).toEqual({ year: 1996, month: 4 });
    expect(formatBirth(1996, 4)).toBe("1996-04");
  });

  /**
   * A YEAR WITH NO MONTH IS A REAL ANSWER — the partial the model is built to
   * take. `birthMonth` is optional so a year alone keeps the honest ±1 reading
   * rather than having a month invented; the wizard used to store January for
   * an untouched month, which is that invention happening where the athlete
   * cannot see it, and out of step with the questionnaire's own birth row.
   */
  it("keeps a year that has no month, on both sides of the round trip", () => {
    expect(formatBirth(1996)).toBe("1996");
    expect(parseBirth("1996")).toEqual({ year: 1996 });
    expect(parseBirth(formatBirth(1996))?.month).toBeUndefined();
    const p = questionnaireFromAnswers(qs, { birth: "1996" });
    expect(p.birthYear).toBe(1996);
    expect(p.birthMonth).toBeUndefined();
  });

  it("skips the body mass rather than inventing one", () => {
    expect(bodyMassFromAnswers(qs, {})).toBeUndefined();
    expect(bodyMassFromAnswers(qs, { bodyweight: 4 })).toBeUndefined();
  });

  /**
   * THE REGRESSION THAT MOTIVATED THE MAPPING. The intake's answers used to
   * reach the server and stop: three consumers read them from device keys no
   * writer on either client has ever set, so `prescribeSession` ran with
   * `experience: undefined` for every athlete who had just answered it.
   */
  it("reaches the estimate — an intake answer moves the multipliers", () => {
    const bare = personalizeLandmarks({});
    const fromIntake = personalizeLandmarks(
      questionnaireFromAnswers(qs, { days: 5, sleep: 5, birth: "1998-04" }, { now: NOW }),
    );
    expect(fromIntake.recovery).toBeGreaterThan(bare.recovery);
  });

  /**
   * TRAINING AGE IS NOT ONE OF THE ANSWERS ANY MORE, and this is the guard.
   *
   * It is the strongest single input to the model — the only one that scales
   * the STIMULUS end — and it used to come from one tap at setup. Self
   * assessment is unreliable in both directions, engines/fitness-level.ts
   * measures it from the log instead, and `resolveExperience` gives a STATED
   * answer permanent priority over that measurement. So an answer typed before
   * the athlete had logged anything outranked their own training forever.
   *
   * Setup no longer asks. The questionnaire screen still lets someone overrule
   * the estimate deliberately; what is gone is the version of that override
   * given by an athlete with no evidence either way.
   */
  it("never writes a training age onto the profile", () => {
    expect(questionnaireFromAnswers(qs, { experience: "advanced" }).experience).toBeUndefined();
    expect(qs.some((q) => q.engineKey === "experience")).toBe(false);
  });

  it("takes an athlete most of the way before their first session", () => {
    const answers = { sex: "M", birth: "1998-04", bodyweight: 79, days: 4, sleep: 4, stress: 2 };
    const p = questionnaireFromAnswers(qs, answers, { now: NOW });
    // Body mass reaches the profile the way it does in the app: setup logs a
    // weigh-in, and the measured layer merges the newest one back in.
    const resolved = { ...p, bodyweightKg: bodyMassFromAnswers(qs, answers) };
    // TRAINING AGE (.27) IS DELIBERATELY MISSING HERE and the figure is lower
    // for it. That is the honest reading of what the athlete has TOLD us — and
    // it is not what the Volume screen shows, because `useVolumeModel` measures
    // completeness on the profile it hands the model, which carries the
    // log-derived training age as soon as there is a log to derive one from.
    const score = questionnaireProgress(resolved, [], { now: NOW }).score;
    expect(score).toBeGreaterThan(0.6);
    // …and it climbs the rest of the way once the log can speak for it.
    expect(questionnaireProgress({ ...resolved, experience: "intermediate" }, [], { now: NOW }).score)
      .toBeGreaterThan(score);
  });

  /** The age question counts as answered from the birth year alone — the form
   *  and the Profile card must not disagree about whether it is done. */
  it("counts a birth date as an answered age", () => {
    const p = questionnaireFromAnswers(qs, { birth: "1998-04" }, { now: NOW });
    expect(p.ageYears).toBeUndefined();
    expect(questionnaireProgress(p, [], { now: NOW }).score).toBe(0.13);
  });

  /** A default written into the profile is an answer nobody gave. The three
   *  body questions therefore ship WITHOUT one — a skipped question has to stay
   *  visibly unanswered rather than silently become 80 kg. */
  it("stores nothing for a question the athlete skipped", () => {
    expect(questionnaireFromAnswers(qs, {})).toEqual({});
    for (const key of ["sex", "age", "bodyweight"]) {
      expect(qs.find((q) => q.key === key)?.defaultValue, key).toBeUndefined();
    }
  });

  it("refuses an intake answer that a typed one would also be refused", () => {
    const p = questionnaireFromAnswers(qs, { age: 4, bodyweight: 0.5, sex: "yes" });
    expect(p.ageYears).toBeUndefined();
    expect(p.bodyweightKg).toBeUndefined();
    expect(p.sex).toBeUndefined();
  });

  it("asks every question whose engine key is a questionnaire field", () => {
    const asked = new Set(qs.map((q) => q.engineKey).filter(Boolean));
    for (const k of ["sex", "birthYear", "bodyweightKg", "daysPerWeek", "sleep", "stress"]) {
      expect(asked, k).toContain(k);
    }
    // …and NOT training age, which the log measures. It stays a legal engine
    // key so an operator can re-add the question; it is simply not shipped.
    expect(asked).not.toContain("experience");
    expect(ONBOARDING_ENGINE_KEYS).toContain("experience");
  });

  /**
   * The normalizer is a VALIDATOR, and an engine key it does not name is not
   * rejected — it is silently set to undefined. It held a hand-copied duplicate
   * of the union, which is how three questions shipped answered and connected
   * to nothing. Both now derive from ONBOARDING_ENGINE_KEYS; this is the guard
   * that keeps a fourth from doing it again.
   */
  it("survives the normalizer with its engine key intact", () => {
    for (const q of DEFAULT_ONBOARDING_QUESTIONS) {
      if (!q.engineKey) continue;
      const seen = qs.find((x) => x.key === q.key);
      expect(seen?.engineKey, `${q.key} lost its engine key`).toBe(q.engineKey);
    }
  });
});

describe("the sections", () => {
  it("are the four named buckets, each with questions", () => {
    expect(QUESTIONNAIRE.map((s) => s.id)).toEqual(["body", "training", "recovery", "fuel"]);
    for (const s of QUESTIONNAIRE) expect(s.questions.length, s.id).toBeGreaterThan(0);
  });

  it("puts every question in exactly one section", () => {
    const seen = new Set<QuestionKey>();
    for (const s of QUESTIONNAIRE) {
      for (const x of s.questions) {
        expect(seen.has(x.key)).toBe(false);
        seen.add(x.key);
      }
    }
    expect(seen.size).toBe(QUESTIONS.length);
  });
});
