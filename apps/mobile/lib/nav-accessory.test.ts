import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * THE ACCESSORY SLOT IS THE BAR — a ratchet, not a unit test.
 *
 * `<NativeTabs.BottomAccessory>` is not a container that happens to hold the
 * session strip: UIKit builds the accessory FROM ITS PRESENCE. react-native-
 * screens sets `UITabAccessory` the moment the child view mounts and clears it
 * the moment it unmounts (RNSTabsHostComponentView's applyBottomAccessoryVisi-
 * bility), so a slot whose child renders null is still a glass bar hovering
 * over the nav pill with nothing in it — which is exactly what shipped, on
 * every screen, until the slot was gated on the draft.
 *
 * That makes "render null inside it" the obvious and WRONG fix, and it is the
 * one a later reader reaches for when the gate looks redundant beside
 * SessionAccessory's own `if (!draft) return null`. Both are needed: the inner
 * one for the frame between mount and the first draft read, the outer one for
 * the bar itself. This reads the layout as TEXT (the file cannot be rendered
 * here — the render project aliases `expo-router` wholesale, native tabs
 * included), and fails if the slot is ever mounted unconditionally.
 */

const read = (p: string) => readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), "utf8");
// Comments would otherwise count as matches — the file header explains this
// very rule and names the tag while doing it, and a JSX comment sits between
// the gate and the tag.
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("the session accessory slot", () => {
  const layout = stripComments(read("app/(tabs)/_layout.tsx"));

  it("is mounted only while a workout is minimized", () => {
    expect(layout.match(/<NativeTabs\.BottomAccessory>/g) ?? []).toHaveLength(1);
    // `{draft ? (` / `{draft && (` immediately before the slot — a gate on the
    // draft itself, not on anything the slot's child decides.
    expect(layout).toMatch(/\{\s*draft\s*(\?|&&)\s*\(?\s*<NativeTabs\.BottomAccessory>/);
  });

  it("takes the draft from the store the accessory itself reads", () => {
    // A second source of truth here (a local useState, a fresh loadDraft) would
    // let the slot and its content disagree about whether there is a session.
    expect(layout).toMatch(/import\s+SessionAccessory,\s*\{\s*useSessionDraft\s*\}/);
    expect(layout).toMatch(/const\s+draft\s*=\s*useSessionDraft\(\)/);
  });

  it("keeps the clock in the store, not in the copies", () => {
    // The accessory renders TWICE (regular + inline placement). An interval
    // inside the component is therefore two intervals, a second apart, each
    // waking every subscriber — for one figure. The draft owns the tick.
    const accessory = read("components/aurora/session-accessory.tsx");
    const intervals = accessory.match(/setInterval\(/g) ?? [];
    expect(intervals).toHaveLength(1);
    expect(accessory.indexOf("setInterval(")).toBeLessThan(accessory.indexOf("export default function SessionAccessory"));
  });

  it("hands the layout the draft alone, not the ticking snapshot", () => {
    // useSyncExternalStore re-renders on snapshot IDENTITY, and the snapshot's
    // changes once a second while a workout runs. Subscribing the layout to the
    // whole thing would rebuild the tab bar's children every tick of a clock
    // the layout does not render.
    const accessory = read("components/aurora/session-accessory.tsx");
    const hook = accessory.slice(accessory.indexOf("export function useSessionDraft"));
    expect(hook).toMatch(/useSyncExternalStore\(subscribe,\s*getDraft,\s*getDraft\)/);
  });

  it("carries the route-change re-read, since the accessory cannot", () => {
    // The accessory is unmounted exactly when a NEW draft would need to be
    // noticed, so the refresh has to live in the always-mounted layout.
    const accessory = read("components/aurora/session-accessory.tsx");
    const hook = accessory.slice(accessory.indexOf("export function useSessionDraft"));
    expect(hook).toMatch(/usePathname\(\)/);
    expect(hook).toMatch(/refreshSessionAccessory\(\)/);
    // …and nowhere else: two subscribers re-reading on every route change is a
    // double read that only looks harmless.
    expect(accessory.match(/(?<!function )refreshSessionAccessory\(\)/g) ?? []).toHaveLength(1);
  });
});
