import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { AccessibilityInfo } from "react-native";

/**
 * The render gate's runtime: the `__DEV__` flag Metro injects, and the two
 * places react-native-web expects a browser React Native would have given it.
 * Nothing here is app behaviour — if a stub in this file ever has to make a
 * decision, the gate has drifted from the thing it is standing in for.
 */

// Metro defines this; the hero's placement guard reads it.
(globalThis as { __DEV__?: boolean }).__DEV__ = true;

// react-native-web's onLayout rides a ResizeObserver. jsdom has none, and
// there is no layout engine behind it either — so this is a stub that never
// fires rather than a polyfill. Anything depending on a MEASURED position is
// therefore invisible to this gate, by construction.
if (!("ResizeObserver" in globalThis)) {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// react-native-web's AccessibilityInfo.addEventListener returns nothing, where
// React Native's returns an EventSubscription the caller removes on unmount.
// That is a difference between the stand-in and the real renderer, not an app
// bug, so it is reconciled HERE rather than by teaching app code to expect a
// listener registration that might not have happened.
const addListener = AccessibilityInfo.addEventListener.bind(AccessibilityInfo);
AccessibilityInfo.addEventListener = ((...args: Parameters<typeof addListener>) =>
  addListener(...args) ?? { remove() {} }) as typeof AccessibilityInfo.addEventListener;

afterEach(() => cleanup());
