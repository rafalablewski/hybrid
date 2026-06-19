/**
 * Shared layout constants for the Aurora shell.
 *
 * The floating pill nav (components/aurora/global-nav.tsx) sits OVER every
 * screen, so scrollable content must reserve room at the bottom or its last row
 * hides under the bar. That clearance was a hand-copied magic number (132) in
 * three files — the exact kind of guess that silently re-breaks the moment the
 * bar changes height (e.g. when we added text labels under the glyphs). This is
 * the ONE place that knows the bar's size; the screen primitives derive their
 * bottom padding from it, so changing the bar here updates every screen.
 */

/** Height of the floating pill bar itself (icon + label + vertical padding),
 *  WITHOUT the device safe-area inset (which the primitives add separately). */
export const AURORA_NAV_BAR_HEIGHT = 72;

/** Bottom clearance a scrollable Aurora screen must reserve for the floating nav,
 *  given the device's bottom safe-area inset. */
export const auroraScrollClearance = (insetBottom: number) =>
  AURORA_NAV_BAR_HEIGHT + insetBottom + 20;
