import { describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { DEFAULT_ONBOARDING_QUESTIONS, ONBOARDING_GOAL_GROUPS, ONBOARDING_PERSONA_CHOICES } from "@hybrid/core";
import { renderScreen as render } from "./render";
import Onboarding from "../components/aurora/onboarding";

/**
 * THE WIZARD'S OPTION ROW MUST NOT RESHAPE WHEN IT IS PICKED.
 *
 * The row drew its tick only while selected, so choosing an option INSERTED a
 * 22dp glyph into the row — under the finger that had just landed on it, and
 * with every word in the row shifting sideways to make space. It is the app's
 * documented standard for a wizard row (nutrition-panels cites this component
 * by name), so the defect was in the thing other screens copy.
 *
 * This is the half of the onboarding motion pass a render gate can actually
 * hold: the mark is always laid out, so the row's TREE is identical selected
 * and not. The travel either side of it is time-based, and time is the one
 * thing this gate cannot see — react-native-web has no animation driver, so
 * every `Animated.timing` here completes inside the same commit that starts it
 * (the same class of blind spot as the missing layout engine; see
 * vitest.config.ts). Asserting the exchange would assert the stand-in.
 */

vi.mock(import("../lib/api"), async (importOriginal) => ({
  ...(await importOriginal()),
  // null → the wizard falls back to core's built-in question set, so the
  // labels below are the ones the app ships rather than a fixture.
  fetchOnboardingQuestions: () => Promise.resolve(null),
  fetchTranslationOverrides: () => Promise.resolve({}),
  submitOnboarding: () => Promise.resolve(true),
}));

/** The second persona card — the one that starts UNSELECTED (the answer map is
 *  seeded with the question's `casual` default). */
const UNPICKED = ONBOARDING_PERSONA_CHOICES[1]!.label;

/** The age question, as the app ships it — asked fifth, unanswerable by default. */
const AGE_Q = DEFAULT_ONBOARDING_QUESTIONS.find((q) => q.engineKey === "ageYears")!;

/** The row as the user sees it: everything inside the pressable it lives in. */
function row(container: HTMLElement, label: string): HTMLElement {
  const text = Array.from(container.querySelectorAll("div")).find((d) => d.textContent === label && !d.children.length);
  const el = text?.closest('[role="button"]') as HTMLElement | null;
  if (!el) throw new Error(`no option row for "${label}"`);
  return el;
}

/** The row's own surface — the node carrying the border and the wash. */
const surface = (el: HTMLElement) => el.firstElementChild as HTMLElement;

describe("the onboarding wizard's option row", () => {
  it("draws the same tree picked and unpicked", () => {
    const { container } = render(<Onboarding />);
    const idle = row(container, UNPICKED);
    const nodes = idle.querySelectorAll("*").length;
    const restColour = surface(idle).style.borderTopColor;
    // A row is a label, a blurb and a mark — if this is 3 the query found a
    // wrapper rather than the row, and the comparison below proves nothing.
    expect(nodes).toBeGreaterThan(3);

    fireEvent.click(idle);

    const picked = row(container, UNPICKED);
    expect(picked.querySelectorAll("*").length).toBe(nodes);
    // …and it genuinely picked, rather than the count holding still for the
    // uninteresting reason. The accent reached the rendered surface, which is
    // the same invariant press-scale.render asserts one primitive down: what a
    // component declares survives to the DOM.
    expect(surface(picked).style.borderTopColor).not.toBe(restColour);
  });
});

/**
 * A NUMBER QUESTION MUST NOT SHOW A FIGURE IT WAS NEVER GIVEN.
 *
 * The intake asks for age and body mass now, and neither ships a
 * `defaultValue` — deliberately, because the client seeds every answer from its
 * default, so a default here would mean an athlete who stepped past the screen
 * had "80 kg" written down as their own body mass. That is a fabricated
 * measurement, and the volume model goes on to explain the athlete's recovery
 * ceiling with it.
 *
 * The guard is on the RENDER because that is where it would be given away: a
 * screen showing "80" over a "Next" button has told the athlete they answered,
 * whatever the answer map holds.
 */
describe("a number the athlete has not answered", () => {
  const next = (container: HTMLElement) => {
    const btn = Array.from(container.querySelectorAll('[role="button"]')).find(
      (b) => (b as HTMLElement).getAttribute("aria-label")?.toLowerCase().includes("next"),
    ) as HTMLElement | undefined;
    if (!btn) throw new Error("no Next control");
    fireEvent.click(btn);
  };

  it("offers a control to start one instead of a seeded figure", () => {
    const { container } = render(<Onboarding />);
    // persona → goal → experience → sex → AGE. Only the goal is `required`, so
    // it is the one step Next will not leave until something is picked; the
    // rest carry defaults or are deliberately skippable.
    next(container);
    fireEvent.click(row(container, ONBOARDING_GOAL_GROUPS[0]!.goals[0]!.label));
    next(container); // → experience
    next(container); // → sex
    next(container); // → age
    const body = container.textContent ?? "";
    // Non-vacuity: the assertions below are trivially true on any screen that
    // is not this one, so prove we arrived. The title is core's own — the mock
    // returns null questions, so the wizard runs the shipped set.
    expect(body).toContain(AGE_Q.title);
    // The seed is 30 and the range starts at 10. Neither may be on screen: the
    // question is unanswered and has to look it.
    expect(body).not.toMatch(/\b30\b/);
    // Ninety segments is the failure this control replaced — a `number`
    // question used to draw one option per step.
    expect(container.querySelectorAll('[role="radio"]').length).toBeLessThan(10);
  });
});
