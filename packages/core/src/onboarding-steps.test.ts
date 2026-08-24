import { describe, it, expect } from "vitest";
import {
  DEFAULT_ONBOARDING_QUESTIONS,
  onboardingQuestionsForClient,
  onboardingSteps,
  normalizeOnboardingQuestion,
  type OnboardingQuestion,
} from "./onboarding";

/**
 * A QUESTION IS NOT A SCREEN.
 *
 * The wizard stepped over the question list directly, which made the two the
 * same thing and left no way to say otherwise. Sex, birth date and body mass
 * are three questions and one screen — three parts of asking who this body is —
 * and on the intake most people walk, that is the whole intake.
 */

const q = (over: Partial<OnboardingQuestion> & { key: string }): OnboardingQuestion => ({
  id: over.key, kind: "text", title: over.key, enabled: true, order: 0, ...over,
});

const steps = (persona?: "casual" | "athlete") =>
  onboardingSteps(
    onboardingQuestionsForClient(DEFAULT_ONBOARDING_QUESTIONS, persona).filter(
      (x) => x.engineKey !== "persona",
    ),
  );

describe("the shipped intake", () => {
  it("asks a tracker on ONE screen after the fork", () => {
    const s = steps("casual");
    expect(s).toHaveLength(1);
    expect(s[0]!.grouped).toBe(true);
    expect(s[0]!.questions.map((x) => x.key)).toEqual(["sex", "birth", "bodyweight"]);
    expect(s[0]!.title).toBe("A little about you");
  });

  it("keeps every question — the screens got fewer, the asking did not", () => {
    const asked = onboardingQuestionsForClient(DEFAULT_ONBOARDING_QUESTIONS, "casual")
      .filter((x) => x.engineKey !== "persona")
      .map((x) => x.key);
    expect(steps("casual").flatMap((s) => s.questions.map((x) => x.key))).toEqual(asked);
  });

  it("groups the same three for an athlete, and leaves the rest alone", () => {
    const s = steps("athlete");
    expect(s.map((x) => x.key)).toEqual(["goal", "body", "stress", "days", "equipment"]);
    expect(s.find((x) => x.key === "body")!.questions).toHaveLength(3);
  });

  it("takes the athlete from seven screens to five", () => {
    const asked = onboardingQuestionsForClient(DEFAULT_ONBOARDING_QUESTIONS, "athlete")
      .filter((x) => x.engineKey !== "persona");
    expect(asked).toHaveLength(7);
    expect(steps("athlete")).toHaveLength(5);
  });
});

describe("grouping rules", () => {
  it("leaves an ungrouped list one screen per question", () => {
    const s = onboardingSteps([q({ key: "a" }), q({ key: "b" })]);
    expect(s).toHaveLength(2);
    expect(s.every((x) => !x.grouped)).toBe(true);
  });

  it("merges only ADJACENT members", () => {
    // A group is a screen, and a screen cannot be assembled out of questions
    // with something else between them. Two screens is the honest reading of
    // the order this was given — silently reordering it would not be.
    const s = onboardingSteps([
      q({ key: "a", group: "g", groupTitle: "G" }),
      q({ key: "mid" }),
      q({ key: "b", group: "g" }),
    ]);
    expect(s).toHaveLength(3);
    expect(s.flatMap((x) => x.questions.map((y) => y.key))).toEqual(["a", "mid", "b"]);
    // And each half, being one question, is asked AS that question rather than
    // under a heading written for a set it no longer has — the un-grouping rule
    // below, reached from the other direction.
    expect(s.map((x) => x.grouped)).toEqual([false, false, false]);
    expect(s.map((x) => x.key)).toEqual(["a", "mid", "b"]);
  });

  it("takes the heading from the first member and ignores the others'", () => {
    const s = onboardingSteps([
      q({ key: "a", title: "First", group: "g", groupTitle: "The group" }),
      q({ key: "b", title: "Second", group: "g", groupTitle: "Ignored" }),
    ]);
    expect(s[0]!.title).toBe("The group");
  });

  it("falls back to the first member's own title when a group has no heading", () => {
    const s = onboardingSteps([q({ key: "a", title: "First", group: "g" }), q({ key: "b", group: "g" })]);
    expect(s[0]!.title).toBe("First");
  });

  it("carries no subtitle on a grouped screen", () => {
    // Each member keeps its own beside its own control; one at the top would be
    // describing whichever question happened to be first.
    const s = onboardingSteps([
      q({ key: "a", subtitle: "about a", group: "g", groupTitle: "G" }),
      q({ key: "b", subtitle: "about b", group: "g" }),
    ]);
    expect(s[0]!.subtitle).toBeUndefined();
    expect(s[0]!.questions.map((x) => x.subtitle)).toEqual(["about a", "about b"]);
  });

  it("un-groups a group left with one member", () => {
    // Reachable whenever a persona filter or a disabled row leaves one standing:
    // a lone question should not be asked under a heading written for a set.
    const s = onboardingSteps([q({ key: "a", title: "Only one", subtitle: "sub", group: "g", groupTitle: "G" })]);
    expect(s[0]!.grouped).toBe(false);
    expect(s[0]!.key).toBe("a");
    expect(s[0]!.title).toBe("Only one");
    expect(s[0]!.subtitle).toBe("sub");
  });
});

describe("what a stored row may change", () => {
  const stored = (over: Record<string, unknown>) =>
    normalizeOnboardingQuestion({ key: "sex", kind: "single", title: "Male or female?", order: 2, ...over })!;

  it("inherits the code's grouping when the row says nothing", () => {
    // A row written before grouping existed, or by an editor that omits the
    // field, must not silently un-group the intake.
    expect(stored({}).group).toBe("body");
    expect(stored({}).groupTitle).toBe("A little about you");
  });

  it("lets an admin regroup a built-in, because grouping is presentation", () => {
    expect(stored({ group: "elsewhere" }).group).toBe("elsewhere");
  });

  it("reads an empty string as an explicit ungrouping", () => {
    // The one case that cannot be collapsed with "said nothing": this is how an
    // admin takes a built-in off its shared screen.
    expect(stored({ group: "" }).group).toBeUndefined();
  });
});
