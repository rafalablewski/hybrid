import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * Tracks the OS "Reduce Motion" accessibility setting (iOS: Settings →
 * Accessibility → Motion; Android: Remove animations). Unlike the web, RN does
 * NOT honour this automatically, so animated surfaces must opt in: gate the
 * animation on this flag and render the resting/end state instead. Mirrors the
 * web client's `@media (prefers-reduced-motion: reduce)` coverage so the two
 * stay in parity. Updates live if the user toggles the setting.
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
