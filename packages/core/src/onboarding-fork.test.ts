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

  it("asks a tracker EVERYTHING about themselves, and only skips the goal", () => {
    // THE FORK IS THE OUTCOME, NOT THE DATA, and the first cut of it had this
    // backwards: it marked experience, days per week and equipment athlete-only
    // on the reasoning that they exist to shape a plan. They do not.
    // questionnaireFromAnswers maps experience and daysPerWeek onto the volume
    // profile, where one is a stimulus multiplier and the other a recovery
    // factor, and both are counted in the model's confidence divisor — so
    // skipping them permanently degraded every tracker's model.
    expect(keys("casual")).toEqual(keys("athlete").filter((k) => k !== "goal"));
  });

  it("makes the goal the ONLY question an intake can skip", () => {
    const athleteOnly = DEFAULT_ONBOARDING_QUESTIONS.filter((q) => q.personas).map((q) => q.key);
    expect(athleteOnly).toEqual(["goal"]);
  });

  it("asks an athlete everything", () => {
    expect(keys("athlete")).toEqual(DEFAULT_ONBOARDING_QUESTIONS.map((q) => q.key));
  });

  it("never asks a tracker for a goal", () => {
    // The specific defect: `required: true` with no skip control, on the screen
    // after the one where they declined the goal product.
    expect(keys("casual")).not.toContain("goal");
  });

  it("costs a tracker exactly one question fewer than an athlete", () => {
    expect(keys("athlete").length - keys("casual").length).toBe(1);
  });

  it("asks every intake for all seven inputs the recovery model scales by", () => {
    // personalizeLandmarks multiplies the athlete's ceiling by seven supplied
    // inputs and divides its confidence by the same seven. Setup asked for five
    // of them until sleep and stress were added, so nobody could reach a
    // confident model without finding the questionnaire screen on their own.
    const asked = new Set(
      onboardingQuestionsForClient(DEFAULT_ONBOARDING_QUESTIONS, "casual").map((q) => q.engineKey),
    );
    for (const k of ["experience", "birthYear", "bodyweightKg", "sleep", "stress", "daysPerWeek"]) {
      expect(asked, `the model reads ${k} and setup never asks for it`).toContain(k);
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
