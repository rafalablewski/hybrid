import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * Tracks the OS "Reduce Motion" accessibility setting (iOS: Settings →
 * Accessibility → Motion; Android: Remove animations). Unlike the web, RN does
 * NOT honour this automatically, so animated surfaces must opt in. Mirrors the
 * web client's `@media (prefers-reduced-motion: reduce)` coverage so the two
 * stay in parity. Updates live if the user toggles the setting.
 *
 * WHAT TO DO WITH IT: substitute, don't delete. A POSITIONAL animation (slide,
 * rise, scale) should be replaced by a short cross-dissolve — `durations.reduced`
 * in @hybrid/core — never removed outright, because the user still needs to
 * perceive that the screen changed. Snapping straight to the end state removes
 * that signal entirely. Purely decorative motion (ambient drift, looping
 * flourishes) is the one case that should simply stop.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduced(v);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  return reduced;
}
