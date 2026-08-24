import { describe, expect, it } from "vitest";
import {
  DEFAULT_ONBOARDING_QUESTIONS,
  ONBOARDING_ENGINE_KEYS,
  normalizeOnboardingQuestion,
  onboardingQuestionsForClient,
  questionnaireFromAnswers,
} from "@hybrid/core";

/**
 * WHAT AN ADMIN MAY AND MAY NOT DO TO THE QUESTIONNAIRE.
 *
 * The editor is genuinely powerful — it reworders, reorders, adds, removes,
 * enables and now SCOPES questions to an intake and keys them to an engine
 * field. Two things have to stay impossible through it, and neither is enforced
 * by a type:
 *
 *  1. WIDENING A BUILT-IN'S INTAKE SCOPE. Stored rows replace the defaults for
 *     the client whenever the table is non-empty, and those rows carry no scope
 *     until an admin sets one — so a scope read from the row would put every
 *     tracker back on the goal question, silently, the first time anyone edited
 *     any question. Persona scope is structural rather than copy, so it belongs
 *     to the code.
 *
 *  2. WRITING A MEASURED FIELD ONTO THE ATHLETE'S MODEL. Training age, sleep
 *     and training frequency are measured (off the bar, off the check-in, off
 *     the log) and each resolves stored-over-measured — so a value typed at
 *     setup suppresses the measurement rather than seeding it. An admin may
 *     re-add a question keyed to one of them; what they must not be able to do
 *     is make its answer reach the profile.
 */

const custom = (over: Record<string, unknown> = {}) =>
  normalizeOnboardingQuestion({
    key: "how-heard", kind: "single", title: "How did you hear about us?",
    choices: [{ value: "friend", label: "A friend" }], order: 20, ...over,
  })!;

describe("an admin can scope a custom question", () => {
  it("asks it of both intakes by default", () => {
    const q = custom();
    expect(q.personas).toBeUndefined();
  });

  it("can narrow it to one intake", () => {
    expect(custom({ personas: ["casual"] }).personas).toEqual(["casual"]);
    expect(custom({ personas: ["athlete"] }).personas).toEqual(["athlete"]);
  });

  it("reads both selected as both, not as a narrowing", () => {
    expect(custom({ personas: ["casual", "athlete"] }).personas).toEqual(["casual", "athlete"]);
  });

  it("reads an empty selection as both, never as nobody", () => {
    // A question no persona can see has deleted itself, which is the one
    // outcome the editor must not be able to produce by accident.
    expect(custom({ personas: [] }).personas).toBeUndefined();
  });

  it("drops a persona that is not a client persona", () => {
    expect(custom({ personas: ["casual", "coach", "admin"] }).personas).toEqual(["casual"]);
  });
});

describe("an admin cannot widen a built-in", () => {
  // The editor stores a row per question. This is that row for the goal
  // question, as the API would write it: no scope, because the API sends none
  // for a built-in.
  const storedRows = DEFAULT_ONBOARDING_QUESTIONS.map((q) => {
    const { personas: _dropped, ...rest } = q;
    return { ...rest, personas: [] };
  });

  it("keeps the goal question off the tracker intake even from a stored row", () => {
    const asked = onboardingQuestionsForClient(storedRows, "casual").map((q) => q.key);
    expect(asked).not.toContain("goal");
  });

  it("re-derives every built-in's scope from the code, not the row", () => {
    const fromRows = onboardingQuestionsForClient(storedRows, "casual").map((q) => q.key);
    const fromCode = onboardingQuestionsForClient(DEFAULT_ONBOARDING_QUESTIONS, "casual").map((q) => q.key);
    expect(fromRows).toEqual(fromCode);
  });
});

describe("an engine key on a custom question cannot reach the model", () => {
  it("re-adds a retired built-in as an askable question", () => {
    // `experience` and `sleep` stopped shipping when the app started measuring
    // them. They stay legal keys precisely so an operator can ask anyway.
    for (const k of ["experience", "sleep", "daysPerWeek"]) {
      expect(ONBOARDING_ENGINE_KEYS).toContain(k);
      expect(custom({ key: `ask-${k}`, engineKey: k }).engineKey).toBe(k);
    }
  });

  it("still writes nothing measured onto the profile", () => {
    // THE GUARANTEE THAT MAKES THE ABOVE SAFE. It is not that an admin is
    // trusted — it is that `questionnaireFromAnswers` names the fields it
    // writes, so no key set here can reach the volume model.
    const questions = [
      custom({ key: "ask-experience", engineKey: "experience", kind: "text" }),
      custom({ key: "ask-sleep", engineKey: "sleep", kind: "number" }),
      custom({ key: "ask-days", engineKey: "daysPerWeek", kind: "number" }),
    ];
    const profile = questionnaireFromAnswers(questions, {
      "ask-experience": "advanced", "ask-sleep": 5, "ask-days": 6,
    });
    expect(profile.experience).toBeUndefined();
    expect(profile.sleep).toBeUndefined();
    expect(profile.daysPerWeek).toBeUndefined();
    expect(profile).toEqual({});
  });
});
