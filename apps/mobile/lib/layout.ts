import { Platform } from "react-native";

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

/** Bottom clearance a scrollable Aurora screen must reserve for the system tab
 *  bar, given the device's bottom safe-area inset. */
export const auroraScrollClearance = (insetBottom: number) =>
  AURORA_NAV_BAR_HEIGHT + (Platform.OS === "android" ? 0 : insetBottom) + 12;
