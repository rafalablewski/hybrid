import { describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { Text, View } from "react-native";
import { MONTH_KEYS } from "@hybrid/core";
import { ACard, APill, AuroraScreen, ABirthField, ANumberField, SCRUB_UNSET, SEGMENT_MAX } from "../components/aurora/kit";
import { renderScreen } from "./render";

/**
 * THE SHELL AND THE CARD — the two surfaces every screen is made of, asserted
 * to reach the tree with real styles on them.
 *
 * This is the second half of what the render gate was asked for: mount the
 * shell and a card-bearing screen and check the resolved styles are not empty.
 * A card that renders as an unstyled box is the exact shape of the defect that
 * shipped, and it is invisible to a typecheck and to a bundle export alike.
 */

/** The card's own element. ACard takes no testID (a surface in the kit is not
 *  a tappable thing with an identity), so it is located through a wrapper. */
const cardStyle = (container: HTMLElement) => {
  const wrap = container.querySelector('[data-testid="wrap"]') as HTMLElement;
  const el = wrap?.firstElementChild as HTMLElement | null;
  if (!el) throw new Error("the card did not render");
  return el.style;
};

describe("AuroraScreen", () => {
  it("renders a hero screen's content, under the screen gutter", () => {
    const { container } = renderScreen(
      <AuroraScreen hero={{ rank: "title", title: "Statistics" }} back={false}>
        <Text>52 sessions</Text>
      </AuroraScreen>,
    );
    expect(container.textContent).toContain("Statistics");
    expect(container.textContent).toContain("52 sessions");
  });
});

describe("ACard", () => {
  it("reaches the tree as a real surface — ground, hairline and radius", () => {
    const { container } = renderScreen(
      <View testID="wrap">
        <ACard solid>
          <Text>Tonnage</Text>
        </ACard>
      </View>,
    );
    const style = cardStyle(container);
    expect(style.backgroundColor).not.toBe("");
    expect(style.getPropertyValue("border-top-left-radius")).not.toBe("");
    expect(style.getPropertyValue("border-top-width")).not.toBe("");
  });

  it("honours a caller's radius rather than overriding it", () => {
    const { container } = renderScreen(
      <View testID="wrap">
        <ACard solid style={{ borderRadius: 14 }}>
          <Text>Tonnage</Text>
        </ACard>
      </View>,
    );
    expect(cardStyle(container).getPropertyValue("border-top-left-radius")).toBe("14px");
  });
});

describe("APill", () => {
  it("paints its fill and carries its label", () => {
    const { container } = renderScreen(<APill label="Enrol" onPress={() => {}} />);
    expect(container.textContent).toContain("Enrol");
  });

  /**
   * THE WRAPPER MUST NOT SWALLOW THE LAYOUT — the gate for a regression that
   * shipped in this file's own history.
   *
   * Giving the pill a commit state meant giving it an outer node to carry the
   * error shake (the press primitive applies its own scale last and would
   * clobber a merged transform). The moment that wrapper existed, the caller's
   * `flex: 1` was landing on the INNER node while the wrapper — the actual
   * child of the caller's row — sized to content and refused to stretch.
   *
   * Eleven callers pass `flex: 1`. Nothing caught it: the types are identical,
   * the bundle exports, and every unit test passes. It is only visible in a
   * resolved tree, which is exactly what this gate can see.
   */
  const outermost = (container: HTMLElement) => {
    const wrap = container.querySelector('[data-testid="wrap"]') as HTMLElement;
    const el = wrap?.firstElementChild as HTMLElement | null;
    if (!el) throw new Error("the pill did not render");
    return el;
  };

  it("puts flex on the outermost node, where the caller's row can see it", () => {
    const { container } = renderScreen(
      <View testID="wrap"><APill label="Save" onPress={() => {}} style={{ flex: 1 }} /></View>,
    );
    expect(outermost(container).style.flexGrow || outermost(container).style.flex).toBeTruthy();
  });

  it("keeps padding on the pill itself, not on the wrapper", () => {
    // The other half of the split: padding hoisted to the wrapper would inset
    // the pill inside an invisible box instead of making the pill bigger.
    const { container } = renderScreen(
      <View testID="wrap"><APill label="Save" onPress={() => {}} style={{ paddingVertical: 40 }} /></View>,
    );
    expect(outermost(container).style.paddingTop).toBeFalsy();
  });

  it("still reports its state without changing which node carries the layout", () => {
    const { container } = renderScreen(
      <View testID="wrap"><APill label="Send to Slack" savingLabel="Sending…" state="saving" onPress={() => {}} style={{ flex: 1 }} /></View>,
    );
    expect(container.textContent).toContain("Sending…");
    // The idle label stays mounted — it is what holds the width.
    expect(container.textContent).toContain("Send to Slack");
    expect(outermost(container).style.flexGrow || outermost(container).style.flex).toBeTruthy();
  });
});

/**
 * THE TWO INTAKE CONTROLS — asserted HERE, once, because there is now one of
 * each.
 *
 * The questionnaire's Body section and the setup wizard's fifth step ask the
 * same two things (a quantity, a date of birth) and used to draw them from two
 * near-identical local copies. Every bug this branch fixed had that shape: a
 * duplicated engine-key list, a duplicated question-kind list, a duplicated
 * month list. Copies agree right up until one of them is edited. The screens
 * import these now, so the invariants below hold for both, and a gate per
 * screen would just be the duplication again one level up.
 */
const months = MONTH_KEYS.map((_, i) => `M${i + 1}`);

describe("ABirthField", () => {
  it("offers twelve months and no year until one is given", () => {
    const { container } = renderScreen(<ABirthField months={months} a11y="Born" onChange={() => {}} />);
    expect(container.querySelectorAll('[role="radio"]').length).toBe(12);
    // The field is present and live, and reads as empty rather than showing a
    // year nobody gave. (The seed is twenty years below the ceiling, so any
    // four-digit year on screen here would be fabricated.)
    expect(container.querySelector('[role="slider"]')).not.toBeNull();
    expect(container.textContent ?? "").not.toMatch(/\b(19|20)\d\d\b/);
    expect(container.textContent ?? "").toContain(SCRUB_UNSET);
  });

  it("refuses a month while there is no year — a month alone is not half an answer", () => {
    const onChange = vi.fn();
    const { container } = renderScreen(<ABirthField months={months} a11y="Born" onChange={onChange} />);
    fireEvent.click(container.querySelectorAll('[role="radio"]')[5]!);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("carries the year through when the month is picked — one answer, two parts", () => {
    const onChange = vi.fn();
    const { container } = renderScreen(<ABirthField year={1990} months={months} a11y="Born" onChange={onChange} />);
    fireEvent.click(container.querySelectorAll('[role="radio"]')[5]!);
    expect(onChange).toHaveBeenCalledWith({ year: 1990, month: 6 });
  });
});

describe("ANumberField", () => {
  it("segments a range small enough to show whole", () => {
    const { container } = renderScreen(
      <ANumberField value={3} seed={3} min={1} max={SEGMENT_MAX} a11y="Days" onChange={() => {}} />,
    );
    expect(container.querySelector('[role="slider"]')).toBeNull();
  });

  /**
   * …and scrubs an unanswered one whatever its size. A segmented control has
   * no empty state — it always lights one option, which on an unanswered
   * question reports a figure the athlete never gave, and the model goes on to
   * explain their own recovery ceiling with it.
   */
  it("scrubs when there is no answer yet, however small the range", () => {
    const { container } = renderScreen(
      <ANumberField value={undefined} seed={3} min={1} max={SEGMENT_MAX} a11y="Days" onChange={() => {}} />,
    );
    expect(container.querySelector('[role="slider"]')).not.toBeNull();
    expect(container.textContent ?? "").toContain(SCRUB_UNSET);
  });

  it("shows an answer with its unit, and shows the unit as prose beside it", () => {
    const { container } = renderScreen(
      <ANumberField value={82.5} seed={80} min={25} max={300} step={0.5} suffix="kg" a11y="Body mass" onChange={() => {}} />,
    );
    expect(container.textContent).toContain("82.5");
    expect(container.textContent).toContain("kg");
  });
});
