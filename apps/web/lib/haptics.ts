"use client";

import { getLoggerPrefs } from "./logger-prefs";

/**
 * HAPTICS (web) — the twin of apps/mobile/lib/haptics.ts.
 *
 * The Vibration API is all a browser gives us, so every pattern here is an
 * approximation of the iOS feedback of the same name — but the CALL SITES are
 * identical across the two clients, which is the point: a haptic added on one
 * client is a one-line addition on the other, and neither can drift into
 * firing something the user turned off.
 *
 * That gate is the reason this file exists. `prefs.haptics` has been in shared
 * core all along (with copy in three languages), mobile honoured it, and the
 * web logger called `navigator.vibrate` in three places without ever reading
 * it — so the setting was real, visible, and did nothing on this client.
 *
 * Vibration is unsupported on desktop and on iOS Safari; every call is a no-op
 * there rather than a feature check the caller has to write.
 */

function buzz(pattern: number | number[]): void {
  if (typeof navigator === "undefined" || !getLoggerPrefs().haptics) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported, or blocked by a user-gesture requirement */
  }
}

export const haptic = {
  /** Moving through discrete values — segmented control, picker, reorder slot. */
  selection: () => buzz(8),
  /** A control committing: button action, switch flip, swipe threshold, detent. */
  light: () => buzz(10),
  /** Something picked up, or a surface presenting itself. */
  medium: () => buzz(16),
  /** A hard arrival — the rest timer reaching zero. Use sparingly. */
  heavy: () => buzz(26),
  /** An outcome landed: a PR, a finished workout. */
  success: () => buzz([12, 40, 18]),
  /** A destructive action went through. */
  warning: () => buzz([18, 60, 18]),
  /** Something failed — a save, a sync. */
  error: () => buzz([24, 70, 24, 70, 24]),
};
