import { describe, it, expect } from "vitest";
import {
  DEFAULT_ONBOARDING_QUESTIONS,
  onboardingQuestionsForClient,
  normalizeOnboardingQuestion,
  questionAppliesTo,
  recommendFromAnswers,
} from "./onboarding";

/**
 * THE FORK.
 *
 * The first question asks which of two products the athlete wants. Until this
 * existed the wizard did not branch on the answer: everyone got all eight
 * questions, the goal question was `required` with no skip, and the server
 * enrolled a periodised season for anyone with a goal. Both answers produced
 * identical server state.
 */

const keys = (persona?: "casual" | "athlete") =>
  onboardingQuestionsForClient(DEFAULT_ONBOARDING_QUESTIONS, persona).map((q) => q.key);

describe("which questions each intake is asked", () => {
  it("shows everything before the persona is answered, so persona is always first", () => {
    expect(keys()[0]).toBe("persona");
    expect(keys().length).toBe(DEFAULT_ONBOARDING_QUESTIONS.length);
  });

  it("asks a tracker who they are, and nothing about a plan", () => {
    // The volume and readiness models read sex, birth and body mass for
    // everybody. Nothing else in this intake has a consumer.
    expect(keys("casual")).toEqual(["persona", "sex", "birth", "bodyweight"]);
  });

  it("asks an athlete everything", () => {
    expect(keys("athlete")).toEqual(DEFAULT_ONBOARDING_QUESTIONS.map((q) => q.key));
  });

  it("never asks a tracker for a goal", () => {
    // The specific defect: `required: true` with no skip control, on the screen
    // after the one where they declined the goal product.
    expect(keys("casual")).not.toContain("goal");
  });

  it("halves the tracker's setup — four questions instead of eight", () => {
    expect(keys("casual").length).toBe(4);
    expect(keys("athlete").length).toBe(8);
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
    expect(forked).toEqual(["persona", "sex", "birth", "bodyweight"]);
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
