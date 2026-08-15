import { describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { ONBOARDING_PERSONA_CHOICES } from "@hybrid/core";
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
