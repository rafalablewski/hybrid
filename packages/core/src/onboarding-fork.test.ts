import { describe, it, expect } from "vitest";
import {
  DEFAULT_ONBOARDING_QUESTIONS,
  onboardingQuestionsForClient,
  normalizeOnboardingQuestion,
  questionAppliesTo,
  recommendFromAnswers,
} from "./onboarding";

/**
 * THE FORK — AND WHAT IT IS A FORK IN.
 *
 * The first question asks which of two products the athlete wants. Until this
 * existed the wizard did not branch on the answer at all: everyone got every
 * question, the goal step was `required` with no skip, and the server enrolled
 * a periodised season for anyone with a goal. Both answers produced identical
 * server state.
 *
 * The first correction over-corrected. It forked the DATA — dropping the
 * experience tier, days per week and equipment from the tracker — which made
 * the engine measurably worse for every athlete who chose the simple product,
 * because those answers feed the volume model rather than the plan matcher.
 *
 * What the fork is actually in is the OUTCOME: whether a plan is recommended
 * and a season enrolled. Everything the app can learn about the person is asked
 * of both.
 */

const keys = (persona?: "casual" | "athlete") =>
  onboardingQuestionsForClient(DEFAULT_ONBOARDING_QUESTIONS, persona).map((q) => q.key);

describe("which questions each intake is asked", () => {
  it("shows everything before the persona is answered, so persona is always first", () => {
    expect(keys()[0]).toBe("persona");
    expect(keys().length).toBe(DEFAULT_ONBOARDING_QUESTIONS.length);
  });

  it("asks a tracker only for what nothing else can supply", () => {
    // THE RULE, arrived at over four passes: setup asks for what the app cannot
    // find out on its own, of the intake that has a consumer for it. Three
    // things about a body are the whole of what a tracker can uniquely answer.
    expect(keys("casual")).toEqual(["persona", "sex", "birth", "bodyweight"]);
  });

  it("skips four questions, each for its own stated reason", () => {
    // GOAL — a tracker said they are not training for one.
    // DAYS — a plan question: the recommender picks the plan closest to the
    //   answer. It stopped being a profile field (frequency is measured from
    //   the log), so with no plan to match there is nothing left to read it.
    // EQUIPMENT — decides which movements may be PRESCRIBED, and a tracker is
    //   never prescribed anything: with no plan, Today's quick start opens the
    //   empty logger. The answer would have no reader.
    // STRESS — a friction call rather than a principle, and named as one: it
    //   does feed a tracker's ceiling, and someone who came to log their
    //   training does not need a question about their job on the way in. It is
    //   a row on the questionnaire screen whenever they want it.
    const athleteOnly = DEFAULT_ONBOARDING_QUESTIONS.filter((q) => q.personas).map((q) => q.key);
    expect(athleteOnly).toEqual(["goal", "stress", "days", "equipment"]);
    expect(keys("casual")).toEqual(keys("athlete").filter((k) => !athleteOnly.includes(k)));
  });

  it("asks an athlete everything", () => {
    expect(keys("athlete")).toEqual(DEFAULT_ONBOARDING_QUESTIONS.map((q) => q.key));
  });

  it("never asks a tracker for a goal", () => {
    // The specific defect: `required: true` with no skip control, on the screen
    // after the one where they declined the goal product.
    expect(keys("casual")).not.toContain("goal");
  });

  it("costs a tracker four questions fewer than an athlete", () => {
    expect(keys("athlete").length - keys("casual").length).toBe(4);
  });

  it("asks every intake for the model inputs it can only be TOLD", () => {
    const asked = new Set(
      onboardingQuestionsForClient(DEFAULT_ONBOARDING_QUESTIONS, "casual").map((q) => q.engineKey),
    );
    for (const k of ["sex", "birthYear", "bodyweightKg"]) {
      expect(asked, `the model reads ${k} and setup never asks for it`).toContain(k);
    }
  });

  it("asks NEITHER intake to self-assess something the app measures", () => {
    // THREE MEASURED INPUTS, AND THE RULE IS ABOUT WRITING, NOT ASKING.
    // Training age is read off the bar (fitness-level.ts), sleep is the mean of
    // the daily check-in (sleepFromCheckins) and training frequency is the
    // median of the last four weeks' training days (habits.ts). Each resolves
    // stored-over-measured, so a value written from setup does not duplicate
    // the measurement — it SUPPRESSES it, using an answer given before there
    // was anything to measure. None of the three reaches the profile from here
    // (questionnaire.test.ts holds that).
    //
    // Two are not asked at all, because the profile was their only reader.
    // FREQUENCY still is asked, of the goal intake, because it has a SECOND
    // reader that cannot measure anything yet: the plan recommender picks the
    // plan whose weekly frequency is closest to the answer. Asking a question
    // whose answer goes to a plan and not to the model is fine; the defect was
    // ever letting it reach the model.
    for (const persona of ["casual", "athlete"] as const) {
      const asked = new Set(
        onboardingQuestionsForClient(DEFAULT_ONBOARDING_QUESTIONS, persona).map((q) => q.engineKey),
      );
      for (const k of ["experience", "sleep"]) {
        expect(asked, `${persona} is asked to self-assess ${k}`).not.toContain(k);
      }
    }
    expect(keys("casual"), "a tracker has no plan to match").not.toContain("days");
    expect(keys("athlete"), "the recommender reads it").toContain("days");
  });
});

describe("no plan for a tracker", () => {
  // A null plan is what stops the client sending a goal, which is what stops
  // the server enrolling a season.
  const answered = {
    persona: "casual",
    goal: "hybrid",
    experience: "intermediate",
    days: 3,
    equipment: "full",
  };

  it("recommends nothing from the questions a tracker is actually asked", () => {
    const asked = onboardingQuestionsForClient(DEFAULT_ONBOARDING_QUESTIONS, "casual");
    expect(recommendFromAnswers(asked, answered)).toBeNull();
  });

  it("still recommends for an athlete", () => {
    const asked = onboardingQuestionsForClient(DEFAULT_ONBOARDING_QUESTIONS, "athlete");
    expect(recommendFromAnswers(asked, { ...answered, persona: "athlete" })).not.toBeNull();
  });
});

describe("the admin editor cannot silently un-fork the wizard", () => {
  // Stored rows REPLACE the defaults wholesale, and they have no persona
  // column. An admin who had ever touched the questionnaire would otherwise
  // have put every tracker back on the goal question with nothing in the editor
  // to show why. Persona scope is structural, so it is code-owned.
  const storedRows = DEFAULT_ONBOARDING_QUESTIONS.map((q) => {
    const { personas: _dropped, ...rest } = q;
    return rest;
  });

  it("re-derives a built-in's persona scope from the code default", () => {
    const forked = onboardingQuestionsForClient(storedRows, "casual").map((q) => q.key);
    expect(forked).toEqual(keys("casual"));
    expect(forked).not.toContain("goal");
  });

  it("treats a custom admin-added question as applying to both", () => {
    const custom = normalizeOnboardingQuestion({
      key: "how-heard", kind: "single", title: "How did you hear about us?",
      choices: [{ value: "friend", label: "A friend" }], order: 9,
    })!;
    expect(custom.personas).toBeUndefined();
    expect(questionAppliesTo(custom, "casual")).toBe(true);
    expect(questionAppliesTo(custom, "athlete")).toBe(true);
  });

  it("reads an empty persona list as both, never as nobody", () => {
    // A question no persona can see is a question that has deleted itself.
    const q = normalizeOnboardingQuestion({
      key: "custom", kind: "text", title: "Anything else?", personas: [], order: 9,
    })!;
    expect(q.personas).toBeUndefined();
    expect(questionAppliesTo(q, "casual")).toBe(true);
  });

  it("drops an unrecognised persona rather than trusting it", () => {
    const q = normalizeOnboardingQuestion({
      key: "custom", kind: "text", title: "Anything else?",
      personas: ["casual", "coach", "nonsense"], order: 9,
    })!;
    expect(q.personas).toEqual(["casual"]);
  });
});
