import { describe, expect, it } from "vitest";
import { Text, View } from "react-native";
import { PressScale } from "../lib/ui";
import { renderScreen } from "./render";

/**
 * PRESSSCALE — the primitive whose render-only defect shipped in build
 * 81628102, and the coverage the render gate was asked for by name.
 *
 * Every tappable surface in the app lost its background, border, radius, width
 * and flexDirection, because the style prop reached an animated wrapper as a
 * FUNCTION: React Native's AnimatedProps gates on `typeof value === "object"`,
 * so a function skipped the branch entirely and the caller's declarations never
 * became styles. `tsc` passed (Pressable's type accepts both forms) and
 * `expo export` passed (bundling is not rendering). The invariant is simply
 * that WHAT A CALLER DECLARES SURVIVES TO THE RENDERED SURFACE — which needs a
 * rendered surface to check.
 *
 * (lib/ui.test.ts guards the same thing one level lower, by evaluating
 * resolvePressStyle against RN's actual gate condition. That guard is source
 * analysis; this one is the tree.)
 */

const SURFACE = { backgroundColor: "rgb(18, 20, 18)", borderRadius: 28, width: 240, flexDirection: "row" } as const;

/** The styles the DOM actually ended up with for the pressable's own element.
 *  `radius` reads a LONGHAND: react-native-web writes the four corners, and
 *  jsdom does not synthesise the shorthand back from them. */
function surfaceStyle(container: HTMLElement) {
  const el = container.querySelector('[data-testid="surface"]') as HTMLElement;
  if (!el) throw new Error("the pressable did not render");
  const style = el.style;
  return {
    backgroundColor: style.backgroundColor,
    width: style.width,
    flexDirection: style.flexDirection,
    opacity: style.opacity,
    radius: style.getPropertyValue("border-top-left-radius"),
  };
}

describe("PressScale", () => {
  it("keeps a caller's style OBJECT on the rendered surface", () => {
    const { container } = renderScreen(
      <PressScale testID="surface" style={SURFACE}>
        <Text>Enrol</Text>
      </PressScale>,
    );
    const style = surfaceStyle(container);
    expect(style.backgroundColor).toBe(SURFACE.backgroundColor);
    expect(style.radius).toBe("28px");
    expect(style.width).toBe("240px");
    expect(style.flexDirection).toBe("row");
  });

  it("keeps a caller's style ARRAY, including the overriding tail", () => {
    const { container } = renderScreen(
      <PressScale testID="surface" style={[SURFACE, { borderRadius: 12 }]}>
        <View />
      </PressScale>,
    );
    const style = surfaceStyle(container);
    expect(style.backgroundColor).toBe(SURFACE.backgroundColor);
    // last declaration wins, exactly as StyleSheet.flatten would
    expect(style.radius).toBe("12px");
  });

  it("keeps a caller's style FUNCTION — Pressable's own form, and the shipped bug", () => {
    // The 83-file sweep aliased `Pressable -> PressScale`, so every call site
    // that used the function form went through this path. It must resolve to a
    // style, never be handed onward as a function.
    const { container } = renderScreen(
      <PressScale testID="surface" style={({ pressed }: { pressed: boolean }) => [SURFACE, { opacity: pressed ? 0.6 : 1 }]}>
        <View />
      </PressScale>,
    );
    const style = surfaceStyle(container);
    expect(style.backgroundColor).toBe(SURFACE.backgroundColor);
    expect(style.radius).toBe("28px");
    expect(style.width).toBe("240px");
    expect(style.flexDirection).toBe("row");
  });

  it("renders its children, including the render-prop form", () => {
    const { container } = renderScreen(
      <PressScale testID="surface">{({ pressed }: { pressed: boolean }) => <Text>{pressed ? "held" : "tap me"}</Text>}</PressScale>,
    );
    expect(container.textContent).toContain("tap me");
  });
});
