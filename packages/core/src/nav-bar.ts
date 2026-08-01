import type { AuroraIconName } from "./theme/icons";

/**
 * THE BOTTOM-NAV CONTRACT — shared by both clients so the bar cannot drift.
 *
 * Anatomy follows Apple's tab-bar guidance rather than an approximation of it:
 * a tab bar carries NAVIGATION, and "avoid placing screen-specific actions in
 * the tab bar". So Train is a TAB (it opens the Train launcher — a destination,
 * which is what it always was) and not a detached circular button beside the
 * capsule.
 *
 * That detached-circle geometry was the deeper mistake in the previous build:
 * on iOS 26 a separated circle beside the tab bar is the SEARCH ROLE, which
 * morphs into a search field on tap. Parking a training CTA there reads as
 * "search" to anyone fluent in the platform. The slot is left unused here, so
 * it stays available if HYBRID ever adds cross-app search.
 *
 * Persistent session state does NOT go in the tab bar either — it belongs in
 * the tab-bar accessory (the system home for players and active orders, i.e.
 * the mini-player slot). See the session accessory in each client's nav.
 */

/**
 * The five bar destinations, in order. Five is Apple's ceiling for iPhone.
 *
 * NUTRITION holds the second slot, where Explore used to sit. Explore was a
 * DISCOVERY surface — a coach rail, a plan cover flow, a community preview —
 * and discovery is not a daily destination: every one of those blocks was a
 * preview of a screen that still lives in More (Plans, Feed, Find friends), and
 * the one piece with a daily job, "Follow a coach", now sits on Today next to
 * the training it applies to. Eating is the opposite kind of thing: it happens
 * several times a day, every day, and a tracker you must dig for is a tracker
 * you stop using. So the bar spends its scarcest slot on the loop the user is
 * actually in.
 */
export type AuroraNavTabId = "today" | "nutrition" | "train" | "more" | "profile";

export type AuroraNavTab = {
  id: AuroraNavTabId;
  /** Kit glyph name, or "train" for the inline dumbbell (AURORA_TRAIN_GLYPH). */
  glyph: AuroraIconName | "train";
  /** i18n key, with `label` as the fallback when the key is missing. */
  labelKey: string;
  label: string;
};

export const AURORA_NAV_TABS: readonly AuroraNavTab[] = [
  { id: "today", glyph: "village", labelKey: "nav.today", label: "Today" },
  { id: "nutrition", glyph: "fork-knife", labelKey: "nav.nutrition", label: "Nutrition" },
  { id: "train", glyph: "train", labelKey: "nav.train", label: "Train" },
  { id: "more", glyph: "grid", labelKey: "nav.more", label: "More" },
  { id: "profile", glyph: "user-circle", labelKey: "nav.profile", label: "Profile" },
] as const;

/**
 * Bar geometry. Concentric by construction: the capsule's padding is what
 * leaves a visible glass margin around the selection lens, so the bar reads as
 * a container HOLDING a pill rather than pinching it.
 */
export const AURORA_NAV_GEOMETRY = {
  /** Full size — icon + label. */
  slotH: 42,
  lensW: 58,
  padV: 7,
  padH: 10,
  /** Minimized (icon-only) size, past the scroll threshold. */
  miniSlotH: 34,
  miniLensW: 46,
  /** Label row: the 12px line + the 2px gap under the glyph. Animates to 0. */
  labelH: 14,
  /** Collapse progress that flips the bar to icon-only, with hysteresis. */
  miniOn: 0.6,
  miniOff: 0.25,
  /** The session accessory strip that rides above the capsule. */
  accessoryH: 42,
  accessoryGap: 8,
} as const;

/**
 * Material constants. Liquid Glass is a nearly CLEAR body whose identity lives
 * at the rim — not a tinted film under a heavy blur. The previous build used a
 * 40% ink film at blur(24), which is the frosted-glass recipe from iOS 7-18:
 * opaque enough that nothing behind survives, so the edge had nothing to bend.
 *
 * On iOS 26 the real system material supersedes all of this (see the native
 * glassEffect path in the mobile nav); these numbers drive the WEB bar and the
 * Android / iOS < 26 fallback, which is exactly where the two clients used to
 * drift apart.
 */
export const AURORA_NAV_MATERIAL = {
  /** Body: a light film, not a dark one — glass brightens what it covers. */
  filmOpacity: 0.06,
  blur: 14,
  saturate: 1.8,
  brightness: 1.08,
  /** The travelling selection lens is THINNER glass than the bar carrying it. */
  lensOpacity: 0.1,
  lensBlur: 6,
  lensBrightness: 1.25,
  /** Edge refraction: content bends and saturates in the last band before the rim. */
  refractBand: 11,
  refractScale: 1.055,
  refractSaturate: 2.5,
} as const;

/** Elapsed time for the session accessory: "24:11", or "1:24:11" past an hour. */
export function formatSessionElapsed(startedAt: string | number | Date, now: number = Date.now()): string {
  const start = startedAt instanceof Date ? startedAt.getTime() : new Date(startedAt).getTime();
  if (!Number.isFinite(start)) return "0:00";
  const total = Math.max(0, Math.floor((now - start) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
