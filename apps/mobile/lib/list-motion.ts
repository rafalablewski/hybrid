import { useCallback } from "react";
import { LayoutAnimation, Platform, UIManager } from "react-native";
import { useReducedMotion } from "./use-reduced-motion";
import { durations, springs, springToRN } from "@hybrid/core";

/**
 * LIST MOTION (mobile) — insertions, deletions, sorts and reorders that MOVE
 * instead of teleporting.
 *
 * The audit found zero LayoutAnimation calls in the app: deleting a set removed
 * the row and every row below jumped up by its height, inserting one popped it
 * in fully formed, and a reorder commit swapped positions with no travel. Those
 * are the moments the USER caused — where motion is doing its actual job of
 * explaining what changed — and they had none.
 *
 * LayoutAnimation rather than a Reanimated layout: it is core RN, it needs no
 * per-row wrapper component, and one call before a `setState` animates every
 * consequence of that commit — the row leaving AND the rows below closing the
 * gap. The web twin reaches the same result with FLIP because the browser has
 * no equivalent.
 *
 * The spring is `springs.slide` converted through the same springToRN both
 * clients use, so a row closing a gap travels on the curve a screen does.
 */

// WHERE THIS ACTUALLY RUNS, checked against the installed RN (0.85.3) rather
// than assumed, because a no-op here is invisible and this file's whole job is
// motion the user is supposed to notice:
//
//   iOS + Fabric — ON. Two gates, both defaulting true: the JS flag
//     `ReactNativeFeatureFlags.isLayoutAnimationEnabled` (LayoutAnimation.js
//     returns early without it) and the C++ `enableLayoutAnimationsOnIOS`.
//     RN's own source still calls iOS Fabric support "conditionally enabled
//     (pending fully shipping; this is a temporary state)", so treat it as a
//     thing to re-check when `expo` moves, not as a permanent guarantee.
//   Android + Fabric — OFF, and the call below does not change that:
//     `setLayoutAnimationEnabledExperimental` is the pre-Fabric switch, and the
//     flag that decides it now is C++ `enableLayoutAnimationsOnAndroid`, which
//     defaults FALSE in 0.85.3. The call is kept because it is still correct on
//     a non-Fabric Android build and costs nothing on a Fabric one. The product
//     ships to the App Store, so this is a note, not a blocker — but list
//     motion should not be described as cross-platform until it is.
//
// Also: do NOT reach for `LayoutAnimation.setEnabled()` to force this. In
// 0.85.3 its body is `isLayoutAnimationEnabled = isLayoutAnimationEnabled` —
// an upstream self-assignment that does nothing at all.
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { stiffness, damping } = springToRN(springs.slide);

/**
 * Animate the next layout commit.
 *
 * Call it immediately BEFORE the state update that changes the list:
 *
 *   animateListChange();
 *   setSets((s) => s.filter((x) => x.id !== id));
 *
 * `reduced` comes from the caller (useReducedMotion) rather than being read
 * here, because this is not a hook and Reduce Motion must still be honoured:
 * pass `true` and the commit is instant, which is the correct substitution for
 * a layout change — there is no position left to cross-dissolve.
 */
export function animateListChange(reduced = false): void {
  if (reduced) return;
  LayoutAnimation.configureNext({
    duration: durations.collapse,
    // Rows that stay put but move: ride the shared slide spring.
    update: { type: LayoutAnimation.Types.spring, springDamping: damping / (2 * Math.sqrt(stiffness)) },
    // An arriving row grows into place and fades up; a leaving one does the
    // reverse. `scaleY` rather than opacity alone so the gap opens and closes
    // rather than a row materialising into space already made for it.
    create: { type: LayoutAnimation.Types.easeOut, property: LayoutAnimation.Properties.scaleY, duration: durations.collapse },
    delete: { type: LayoutAnimation.Types.easeIn, property: LayoutAnimation.Properties.scaleY, duration: durations.collapse },
  });
}

/**
 * The same thing as a hook, for the common shape: a control that changes what a
 * list contains.
 *
 *   const refilter = useListMotion();
 *   <ASearch onChange={(v) => refilter(() => setQuery(v))} />
 *
 * It exists because the call sites were all writing the identical two lines —
 * read Reduce Motion, call `animateListChange`, then apply — and a filter that
 * animates on one screen and not the next is exactly the inconsistency the
 * audit was about.
 */
export function useListMotion(): (apply: () => void) => void {
  const reduced = useReducedMotion();
  return useCallback((apply: () => void) => {
    animateListChange(reduced);
    apply();
  }, [reduced]);
}
