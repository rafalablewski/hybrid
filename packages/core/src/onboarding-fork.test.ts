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

  it("asks a tracker for everything that shapes their own model", () => {
    // THE FORK IS THE OUTCOME, NOT THE DATA, and the first cut of it had this
    // backwards: it marked experience, days per week and equipment athlete-only
    // on the reasoning that they exist to shape a plan. They do not —
    // daysPerWeek is a recovery factor and is counted in the model's confidence
    // divisor, so skipping it degraded every tracker's ceiling.
    for (const k of ["sex", "birth", "bodyweight", "days", "equipment"]) {
      expect(keys("casual"), k).toContain(k);
    }
  });

  it("skips exactly two questions, each for its own stated reason", () => {
    // GOAL — a tracker has said they are not training for one, so there is
    //   nothing for the answer to shape.
    // STRESS — a friction call rather than a principle, and worth naming as
    //   one: it does feed a tracker's volume ceiling, and someone who came to
    //   log their training does not need a question about their job on the way
    //   in. It is a row on the questionnaire screen for anyone who wants it.
    const athleteOnly = DEFAULT_ONBOARDING_QUESTIONS.filter((q) => q.personas).map((q) => q.key);
    expect(athleteOnly).toEqual(["goal", "stress"]);
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

  it("costs a tracker two questions fewer than an athlete", () => {
    expect(keys("athlete").length - keys("casual").length).toBe(2);
  });

  it("asks every intake for the model inputs it can only be TOLD", () => {
    const asked = new Set(
      onboardingQuestionsForClient(DEFAULT_ONBOARDING_QUESTIONS, "casual").map((q) => q.engineKey),
    );
    for (const k of ["birthYear", "bodyweightKg", "daysPerWeek"]) {
      expect(asked, `the model reads ${k} and setup never asks for it`).toContain(k);
    }
  });

  it("does not ask for anything it can MEASURE", () => {
    // TWO INPUTS, ONE RULE. Training age is read off the bar
    // (engines/fitness-level.ts) and sleep is the mean of the daily check-in's
    // own answer (sleepFromCheckins). In BOTH cases a stated value takes
    // permanent priority over the measured one — `resolveExperience` prefers
    // the stated tier, `withMeasured` resolves `stored.sleep ?? measured.sleep`
    // — so asking at setup does not merely duplicate the measurement, it
    // suppresses it, using an answer given before there was anything to
    // measure. Both stay legal engine keys and both stay rows on the
    // questionnaire screen, where overruling an estimate is a deliberate act.
    for (const persona of ["casual", "athlete"] as const) {
      const asked = new Set(
        onboardingQuestionsForClient(DEFAULT_ONBOARDING_QUESTIONS, persona).map((q) => q.engineKey),
      );
      expect(asked, persona).not.toContain("experience");
      expect(asked, persona).not.toContain("sleep");
    }
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
