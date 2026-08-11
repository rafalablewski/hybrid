import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { getLoggerPrefs } from "./logger-prefs";

/**
 * HAPTICS — the one gate.
 *
 * Every haptic in the app goes through here, for one reason: gating them
 * individually does not work. The audit found 4 of 17 call sites firing
 * regardless of `prefs.haptics` (the hub segmented control and three in the
 * Volume screen), and the capability register still claimed all of them were
 * gated — it had been true when written, and three ungated sites were added
 * afterwards. A rule enforced by remembering is a rule that decays. Import
 * `haptic` and the preference is honoured by construction.
 *
 * WHICH FEEDBACK, per Apple's own usage:
 *  - `selection` — moving through DISCRETE VALUES: a segmented control, a
 *    picker, a stepper detent, a drag crossing into the next slot.
 *  - `light`     — a control COMMITTING: a button's action firing, a switch
 *    flipping, a swipe action crossing its reveal threshold, a sheet snapping
 *    to a detent. (A switch is a commit, not a scrub — it wants this, not
 *    `selection`.)
 *  - `medium`    — something being PICKED UP or a surface presenting: drag
 *    pickup, a context menu opening.
 *  - `heavy`     — a hard arrival worth flinching at. The rest timer hitting
 *    zero, and effectively nothing else.
 *  - `rigid`     — a HARD STOP: something that will not go further. A stepper
 *    pressed at its maximum, a rubber-banded row at the end of its travel.
 *    Distinct from `light` on purpose — light says "that worked", rigid says
 *    "that is as far as it goes", and a control that answers both the same way
 *    is a control that cannot tell you it refused.
 *  - `soft`      — a SOFT LANDING rather than a click: a set banked. The audit
 *    asks for this by name, and it is the difference between logging a set and
 *    pressing a button that happens to log a set.
 *  - `success` / `warning` / `error` — outcomes, not interactions. `warning`
 *    is the destructive commit (a delete going through); `error` is a real
 *    failure the user needs to notice on a phone they may not be looking at.
 *
 * Everything is fire-and-forget: a haptic that fails must never surface as an
 * error, and Android/web simply have fewer of these than iOS does.
 */

/** Haptics are an iOS/Android affordance; expo-haptics is a no-op on web. */
const supported = Platform.OS !== "web";

const on = () => supported && getLoggerPrefs().haptics;

export const haptic = {
  /** Moving through discrete values — segmented control, picker, reorder slot. */
  selection(): void {
    if (on()) Haptics.selectionAsync().catch(() => {});
  },
  /** A control committing: button action, switch flip, swipe threshold, detent. */
  light(): void {
    if (on()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  /** Something picked up, or a surface presenting itself. */
  medium(): void {
    if (on()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  },
  /** A hard arrival — the rest timer reaching zero. Use sparingly. */
  heavy(): void {
    if (on()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  },
  /** A hard STOP: a clamp refusing to move, a rubber-band at its limit. */
  rigid(): void {
    if (on()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {});
  },
  /** A soft landing — a set banked. */
  soft(): void {
    if (on()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {});
  },
  /** An outcome landed: a PR, a finished workout. */
  success(): void {
    if (on()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  /** A destructive action went through. */
  warning(): void {
    if (on()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  },
  /** Something failed — a save, a sync. */
  error(): void {
    if (on()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  },
};
