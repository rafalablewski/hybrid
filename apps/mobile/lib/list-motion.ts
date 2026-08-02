import { LayoutAnimation, Platform, UIManager } from "react-native";
import { durations, springs, springToRN } from "@hybrid/core";

/**
 * LIST MOTION (mobile) — insertions, deletions, sorts and reorders that MOVE
 * instead of teleporting. The twin of apps/web/lib/list-motion.ts.
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

// Android needs this opted into explicitly; on iOS (and on Fabric) it is on.
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
