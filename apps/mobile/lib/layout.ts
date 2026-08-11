import { Platform } from "react-native";
import { initialWindowMetrics } from "react-native-safe-area-context";

/**
 * Shared layout constants for the Aurora shell.
 *
 * The bottom nav is the SYSTEM tab bar now (app/(tabs)/_layout.tsx, expo-router
 * native tabs), not the app-rendered floating capsule it used to be. On iOS 26
 * that bar is translucent Liquid Glass which content scrolls UNDER — the whole
 * point of the material — but a screen's LAST row still has to clear it, or it
 * sits permanently behind glass.
 *
 * Platform split, because native tabs treat insets differently on each side:
 *  - iOS applies NO automatic bottom inset to native-tab content, so a screen
 *    reserves the bar height AND the safe-area inset itself.
 *  - Android wraps native-tab content in a SafeAreaView with the bottom inset
 *    already applied, so adding it again would double-pad. Bar height only.
 *
 * This stays the ONE place that knows the clearance; the screen primitives
 * derive their bottom padding from it. It used to be a hand-copied 132 across
 * three files, the exact kind of guess that silently re-breaks whenever the bar
 * changes height.
 *
 * NEEDS A DEVICE: these are sized for the iOS 26 floating tab bar rather than
 * measured against it — there is no simulator in the build sandbox. They err
 * high on purpose, because over-padding fails as a small gap and under-padding
 * fails as a hidden row. Confirm on the next TestFlight build and tighten if
 * there is a visible gap.
 */

/** Height of the system tab bar, including the gap a floating iOS 26 bar leaves
 *  beneath itself, WITHOUT the device safe-area inset. */
export const AURORA_NAV_BAR_HEIGHT = 64;

/**
 * The bottom inset a SHEET should honour — the window's home indicator, never
 * the enclosing screen's.
 *
 * A sheet is presented in a Modal that COVERS the tab bar (the project rule:
 * "a sheet never reserves clearance for the tab bar or the pill nav"). But the
 * inset it reads comes from React context, not from the window it renders in,
 * and a screen sitting inside the iOS 26 native tab bar reports a bottom inset
 * with the BAR FOLDED INTO IT — bar plus its bottom accessory plus the home
 * indicator, a hundred points or more. Fed to `sheetPadBottom`, that reserved
 * the whole bar underneath every sheet: a dead black band roughly five rows
 * tall, eating the end of the reading area on every sheet in the app. The rule
 * was written and could not be obeyed, because the number it was given already
 * had the bar in it.
 *
 * `initialWindowMetrics` is captured from the ROOT window before any navigator
 * exists, so its bottom inset is the home indicator and nothing else. Taking
 * the SMALLER of the two is safe in both directions: where the ambient inset is
 * already the window's, this changes nothing.
 */
export const sheetInsetBottom = (screenInsetBottom: number) => {
  const windowInset = initialWindowMetrics?.insets.bottom;
  return windowInset == null ? screenInsetBottom : Math.min(screenInsetBottom, windowInset);
};

/**
 * THE SAFE-AREA INSETS A FULL-SCREEN COVER STANDS IN.
 *
 * A cover (`presentation: "fullScreenModal"` — @hybrid/core COVER_SCREENS, which
 * on mobile is the live logger and nothing else) is presented in its OWN view
 * controller, outside the tree the provider measured. The native `SafeAreaView`
 * mounted inside it never applies its top edge: the logger's header drew its
 * clock and its glass capsule ACROSS the status bar, and not for a frame — for
 * the whole session. Seeding `initialWindowMetrics` on the provider fixed what
 * the HOOK reports (the dock's bottom pad has been right ever since); the native
 * view has no such seed, so a cover pads itself from the hook instead.
 *
 * TOP takes the LARGER of the two. The window's inset is the status bar the
 * cover has to clear, and a screen's own reading can only be bigger than it (an
 * in-call bar, a rotation the launch metrics predate) — never smaller. A zero
 * there is the bug, not a measurement.
 *
 * BOTTOM is the window's, for the same reason `sheetInsetBottom` takes the
 * smaller of the two: a cover COVERS the tab bar, so the only thing under it is
 * the home indicator, never a screen inset with the bar folded into it.
 */
export const coverInsets = (screen: { top: number; bottom: number }) => {
  const w = initialWindowMetrics?.insets;
  return w ? { top: Math.max(screen.top, w.top), bottom: w.bottom } : screen;
};

/** Bottom clearance a scrollable Aurora screen must reserve for the system tab
 *  bar, given the device's bottom safe-area inset.
 *
 *  MAX, not PLUS, on iOS. The inset a tab screen reports may ALREADY have the
 *  bar in it (see `sheetInsetBottom`), and adding the bar height on top of that
 *  reserves it twice — 174pt of dead screen under the last row instead of 110.
 *  Taking the larger of "bar + home indicator" and "whatever the screen was
 *  told to clear" is correct under either reading and can never under-pad. */
export const auroraScrollClearance = (insetBottom: number) =>
  (Platform.OS === "android"
    ? AURORA_NAV_BAR_HEIGHT
    : Math.max(AURORA_NAV_BAR_HEIGHT + sheetInsetBottom(insetBottom), insetBottom)) + 12;
