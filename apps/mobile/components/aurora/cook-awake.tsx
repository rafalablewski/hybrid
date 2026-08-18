import { useKeepAwake } from "expo-keep-awake";

/**
 * KEEP THE SCREEN AWAKE WHILE COOKING — mounted by the cook step-through and
 * by nothing else.
 *
 * The app already refuses to sleep during a live workout (app/workout.tsx), and
 * for the same reason: a screen you are working in front of, glancing at with
 * busy hands, is a screen the display timeout has no business turning off.
 * Cooking is the other one, and it was missed — `expo-keep-awake` was installed
 * and imported in exactly one file.
 *
 * IT IS A COMPONENT, not a call in the screen. `useKeepAwake` is a hook, the
 * cook view is one branch inside a component that renders sixteen of them, and
 * a hook cannot be called for one branch. A child that only mounts on that
 * branch scopes the effect exactly — and unmounting it (Back, Finish, or the
 * step-through ending) releases the lock without anybody having to remember to.
 */
export function CookAwake(): null {
  useKeepAwake();
  return null;
}
