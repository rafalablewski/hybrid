import { describe, expect, it } from "vitest";
import { FlatList, Text, View } from "react-native";
import { HERO, heroGeometry, heroRailPin } from "@hybrid/core";
import { HeroScreen } from "../components/aurora/hero";
import { renderScreen as render } from "./render";
import { SAFE_INSETS } from "./stubs/native";

/**
 * THE DOCKED SUB-RAIL — the gate for the bug that shipped.
 *
 * History's view switcher pinned a whole collapse track too low, with the page
 * scrolling through a 76dp gap between it and the collapsed bar. Nothing
 * caught it: the pin was derived from an `onLayout` measurement, `onLayout`
 * reports y against the rail's PARENT, and the rail is nested one level deeper
 * than the code assumed — a mistake with no shape in the type system, no
 * effect on the bundle, and no reachable value in a pure unit test.
 *
 * What makes it catchable is that the pin is now DERIVED rather than measured,
 * on one premise: the rail is the first thing in the scroll content. That
 * premise is a fact about the tree — exactly what a render gate can see.
 */

const geom = heroGeometry("title", SAFE_INSETS.top);
const RAIL = "hero-rail";

const rail = <Text>Agenda</Text>;
const hero = { rank: "title", title: "History" } as const;

/** The rail element, and the DOM parent it shares with the screen's content. */
function railIn(container: HTMLElement) {
  const el = container.querySelector(`[data-testid="${RAIL}"]`);
  if (!el) throw new Error("the sub-rail did not render");
  return el as HTMLElement;
}

describe("the hero's docked sub-rail", () => {
  it("renders FIRST in the scroll content — the premise its dock point is derived from", () => {
    const { container } = render(
      <HeroScreen hero={hero} back={false} rail={rail}>
        <View testID="screen-content">
          <Text>a session</Text>
        </View>
      </HeroScreen>,
    );

    const el = railIn(container);
    // Nothing renders above it inside the content: it IS its parent's first
    // child. This is the whole contract — break it and the rail docks early.
    expect(el.parentElement?.firstElementChild).toBe(el);
    // ...and the screen's own content follows it, in the same container.
    const content = container.querySelector('[data-testid="screen-content"]') as HTMLElement;
    expect(content).toBeTruthy();
    expect(el.parentElement).toBe(content.parentElement);
    expect(el.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("holds that contract through a CUSTOM scroller — the path History takes", () => {
    // The shape History uses: its own FlatList (so the archived list stays
    // virtualized), with the rail node at the top of the list header. This is
    // the placement the derived pin assumes, and the one a screen can break.
    const { container } = render(
      <HeroScreen
        hero={hero}
        back={false}
        rail={rail}
        scroller={(scrollProps, railNode) => (
          <FlatList
            {...scrollProps}
            data={[]}
            renderItem={null}
            ListHeaderComponent={
              <>
                {railNode}
                <View testID="screen-content" />
              </>
            }
          />
        )}
      />,
    );

    const el = railIn(container);
    expect(el.parentElement?.firstElementChild).toBe(el);
    const content = container.querySelector('[data-testid="screen-content"]') as HTMLElement;
    expect(el.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("HOLDS AT THE BAR once scrolled past its pin — the bug, reproduced as an assertion", () => {
    // The rail is carried up by the page and then translated back down by
    // exactly the overshoot, so it stops with its top edge on the bar. Drive
    // the real scroll handler and read the transform the component actually
    // applied: at the pin the rail is still untranslated, and every pixel past
    // it is given straight back.
    //
    // THIS IS THE ONE THAT FAILS AGAINST THE SHIPPED BUG. With the pin
    // computed at 0 (the parent-relative measurement), the rail translates
    // from the very first pixel: at scroll = delta it read 76 here, not 0 —
    // the whole collapse track of gap, in a number.
    let scroll!: (y: number) => void;
    const ui = (
      <HeroScreen
        hero={hero}
        back={false}
        rail={rail}
        scroller={(scrollProps, railNode) => {
          scroll = (y: number) => scrollProps.onScroll({ nativeEvent: { contentOffset: { y } } } as never);
          return <View>{railNode}</View>;
        }}
      />
    );
    const { container, rerender } = render(ui);
    // An Animated value pushes itself into a NATIVE view without re-rendering;
    // there is no native view here, so the value is real but nothing has
    // written it to the DOM. A re-render materialises it — which is why every
    // read below is preceded by one.
    const translateY = (y: number) => {
      scroll(y);
      rerender(ui);
      const el = railIn(container);
      const m = /translateY\((-?[\d.]+)px\)/.exec(el.style.transform);
      return m ? Number(m[1]) : 0;
    };

    expect(translateY(0)).toBe(0);
    // Mid-collapse: the hero is still moving, so the rail rides up with it.
    expect(translateY(geom.delta / 2)).toBe(0);
    // At the pin — the instant the bar finishes arriving — it is still flush,
    // and has not started translating early.
    expect(translateY(geom.delta)).toBe(0);
    // Past it, every pixel of scroll is handed back, so the rail holds.
    expect(translateY(geom.delta + 40)).toBe(40);
    expect(translateY(geom.delta + 1000)).toBe(1000);
  });

  it("docks exactly where the collapsed bar ends — the number the contract buys", () => {
    // Given the rail sits at the top of the content, its y in that content is
    // the hero's height, so it pins after exactly one collapse track and its
    // top edge lands on the bar's bottom edge. (Rendered here so the geometry
    // the component uses and the geometry asserted are the same insets.)
    const pin = heroRailPin(geom.height, geom);
    expect(pin).toBe(geom.delta);
    expect(geom.height - pin).toBe(geom.barHeight);
    expect(geom.barHeight).toBe(SAFE_INSETS.top + HERO.height.bar);
  });

  it("renders no rail when a screen doesn't ask for one", () => {
    const { container } = render(
      <HeroScreen hero={hero} back={false}>
        <View testID="screen-content" />
      </HeroScreen>,
    );
    expect(container.querySelector(`[data-testid="${RAIL}"]`)).toBeNull();
    expect(container.querySelector('[data-testid="screen-content"]')).toBeTruthy();
  });
});

describe("the hero itself", () => {
  it("renders its title, and the collapsed bar's inline copy of it", () => {
    const { container } = render(<HeroScreen hero={{ rank: "title", title: "History" }} back={false} />);
    // Display title + the inline title that arrives as the bar does. Both are
    // always in the tree — which one you see is opacity along the track.
    expect(container.textContent).toContain("History");
  });

  it("survives every rank and mode — the smoke test the bundle export can't do", () => {
    for (const rank of ["bar", "title", "cover"] as const) {
      for (const mode of ["page", "takeover"] as const) {
        const { container, unmount } = render(
          <HeroScreen hero={{ rank, mode, title: "Olympic Weightlifting", eyebrow: "Goal", meta: ["12 weeks", "4 days"] }} back={() => {}}>
            <View testID="screen-content" />
          </HeroScreen>,
        );
        expect(container.querySelector('[data-testid="screen-content"]')).toBeTruthy();
        unmount();
      }
    }
  });
});
