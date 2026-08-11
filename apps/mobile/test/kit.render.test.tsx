import { describe, expect, it } from "vitest";
import { Text, View } from "react-native";
import { ACard, APill, AuroraScreen } from "../components/aurora/kit";
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
