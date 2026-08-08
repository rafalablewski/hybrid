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
});
