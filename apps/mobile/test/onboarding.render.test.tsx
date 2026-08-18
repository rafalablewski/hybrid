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

/** The birth question, as the app ships it — asked fifth, and a DATE rather
 *  than an age, so it cannot go stale the day after it is answered. */
const AGE_Q = DEFAULT_ONBOARDING_QUESTIONS.find((q) => q.engineKey === "birthYear")!;

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
 * THE BIRTH STEP SHOWS NO DATE IT WAS NEVER GIVEN — AND COSTS NO TAP.
 *
 * Two invariants that pull in opposite directions until you separate the value
 * from the control, which is what this asserts.
 *
 * NO FABRICATED FIGURE. The intake asks for age and body mass, and neither
 * ships a `defaultValue` — deliberately, because the client seeds every answer
 * from its default, so a default would mean an athlete who stepped past the
 * screen had "80 kg" written down as their own body mass. The model then goes
 * on to explain their recovery ceiling with it. The guard is on the RENDER
 * because that is where it would be given away: a screen showing "80" over a
 * Next button has told the athlete they answered, whatever the map holds.
 *
 * AND NO TOLL. The first cut satisfied the above with an "Answer" button — one
 * tap to reveal a field that could have been there all along, on a screen whose
 * whole purpose is to be answered. The field is present and live now, and only
 * empty; the seed is where it starts when touched, not something to ask for.
 */
describe("a date the athlete has not answered", () => {
  const next = (container: HTMLElement) => {
    const btn = Array.from(container.querySelectorAll('[role="button"]')).find(
      (b) => (b as HTMLElement).getAttribute("aria-label")?.toLowerCase().includes("next"),
    ) as HTMLElement | undefined;
    if (!btn) throw new Error("no Next control");
    fireEvent.click(btn);
  };

  it("offers a year and twelve months, with no figure until touched", () => {
    const { container } = render(<Onboarding />);
    // persona → goal → experience → sex → BORN. Only the goal is `required`, so
    // it is the one step Next will not leave until something is picked; the
    // rest carry defaults or are deliberately skippable.
    next(container);
    fireEvent.click(row(container, ONBOARDING_GOAL_GROUPS[0]!.goals[0]!.label));
    next(container); // → experience
    next(container); // → sex
    next(container); // → born
    const body = container.textContent ?? "";
    // Non-vacuity: the assertions below are trivially true on any screen that
    // is not this one, so prove we arrived. The title is core's own — the mock
    // returns null questions, so the wizard runs the shipped set.
    expect(body).toContain(AGE_Q.title);
    // No year may be on screen: the question is unanswered and has to look it.
    // (The seed is twenty years below the ceiling, so any four-digit year here
    // would be one the athlete never gave.)
    expect(body, "a year nobody gave is on screen").not.toMatch(/\b(19|20)\d\d\b/);
    // …but the control IS on screen, ready, with nothing standing in front of
    // it. AScrubField declares `adjustable`, which react-native-web renders as
    // a slider. The field is empty, not absent, and the dash is what says so.
    expect(container.querySelector('[role="slider"]'), "the field is gated").not.toBeNull();
    expect(body, "the empty field must read as empty").toContain("—");
    // TWELVE MONTHS, and exactly twelve. The month is what makes the age exact
    // rather than ±1 — and a `number` question of this range used to draw one
    // segment per step, which for the age it replaced would have been ninety.
    expect(container.querySelectorAll('[role="radio"]').length).toBe(12);
  });
});
