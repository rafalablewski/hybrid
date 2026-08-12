import type { AuroraIconName } from "./theme/icons";

/**
 * THE BOTTOM-NAV CONTRACT — shared by both clients so the bar cannot drift.
 *
 * Anatomy: a SPLIT bar. The capsule carries the four PLACES — destinations you
 * go to and come back to — and the app's one VERB rides beside it as a detached
 * circle of the same glass (AURORA_NAV_ACTIONS). Train left the capsule for
 * that circle: it is the thing this app exists to make you do, and inside the
 * capsule it was one grey glyph among five, indistinguishable from the places
 * around it.
 *
 * The detached-circle slot beside an iOS 26 tab bar is the platform's SEARCH
 * role, and spending it on an action is a DELIBERATE trade recorded here so it
 * is never re-litigated by accident: HYBRID has no cross-app search to put
 * there, so the slot carries the app's VERB in the accent colour — the "go"
 * colour, which the grammar reserves for things that act. The action is
 * CONTEXTUAL by design (auroraNavAction): Train everywhere, Add post on the
 * feed, Find a food on the add-to-meal picker — each surface's own primary
 * verb, and on two of the three that verb is not training.
 *
 * The circle DOES wear a magnifier on the picker, and that is not the trade
 * being reversed: it is not a cross-app search destination, it is that
 * screen's verb (see AURORA_NAV_ACTIONS). The slot is still never spent on a
 * search we do not have.
 *
 * Persistent session state does NOT go in the bar either — it belongs in the
 * tab-bar accessory (the system home for players and active orders, i.e. the
 * mini-player slot). See the session accessory in each client's nav.
 */

/**
 * The four capsule destinations, in order.
 *
 * NUTRITION holds the second slot, where Explore used to sit. Explore was a
 * DISCOVERY surface — a coach rail, a plan cover flow, a community preview —
 * and discovery is not a daily destination: every one of those blocks was a
 * preview of a screen that still lives in the side menu (Plans, Feed, Find
 * friends), and the one piece with a daily job, "Follow a coach", now sits on
 * Today next to the training it applies to. Eating is the opposite kind of
 * thing: it happens several times a day, every day, and a tracker you must dig
 * for is a tracker you stop using.
 *
 * MESSAGES holds the third slot, where More used to sit. More was a
 * SPRINGBOARD — ~40 launcher tiles grouped by cluster — and a directory is not
 * a destination: nobody's daily loop includes "open the list of screens". It
 * has moved into the side menu behind the Today header's avatar (side-menu.ts),
 * one gesture from every hub tab, costing the bar nothing. What a tab slot IS
 * for is a place with its own state that you come back to — which is exactly
 * what a conversation is.
 */
export type AuroraNavTabId = "today" | "nutrition" | "messages" | "profile";

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
  { id: "messages", glyph: "mail", labelKey: "nav.messages", label: "Messages" },
  { id: "profile", glyph: "user-circle", labelKey: "nav.profile", label: "Profile" },
] as const;

/**
 * THE ACTION — the detached circle beside the capsule. One verb at a time,
 * resolved per surface by auroraNavAction(): TRAIN by default (it opens the
 * Train launcher, exactly what the retired Train tab did), ADD POST on the
 * feed, where the composer — not the gym — is the thing the athlete came to
 * do, and FIND A FOOD on the add-to-meal picker. The morph is a glyph
 * crossfade inside the same circle, never a second button. Glyphs are the
 * kit's own: the shared inline dumbbell, the `list-add` compose mark the
 * quick-log already wears, and the `search` magnifier.
 *
 * ── TWO KINDS OF ACTION, AND THE DIFFERENCE IS LOAD-BEARING ────────────────
 * Train and Add post are DESTINATIONS: the circle goes somewhere. Find a food
 * is a SCREEN ACTION: the circle acts on the surface already in front of you —
 * it puts the cursor in the picker's field and brings that field back under
 * your thumb, which is the one thing the picker could not do once the list had
 * scrolled the field off the top. On the native bar those are implemented
 * differently (a trigger is a route, so a screen action has to be a `disabled`
 * trigger whose `tabPress` we handle), so the kind is declared here rather than
 * inferred at the call site.
 *
 * WHY THE MAGNIFIER IS ALLOWED HERE, when the rule below says the circle never
 * wears one: the rule is about the SLOT never being spent on a cross-app search
 * we do not have. On the picker the magnifier is not a search destination — it
 * is that screen's own verb, in the same sense Add post is the feed's. The
 * circle still carries "the thing you came here to do", which is the whole
 * contract; it is simply that on the one screen whose job IS finding a food,
 * the verb happens to be a search.
 */
export type AuroraNavActionId = "train" | "post" | "search";

export type AuroraNavAction = {
  id: AuroraNavActionId;
  /** Kit glyph name, or "train" for the inline dumbbell (AURORA_TRAIN_GLYPH). */
  glyph: AuroraIconName | "train";
  /** i18n key, with `label` as the fallback when the key is missing. */
  labelKey: string;
  label: string;
  /**
   * `route` — the circle NAVIGATES, and the native trigger can be an ordinary
   * route trigger. `screen` — the circle ACTS on the surface in front of you,
   * so the native trigger is marked `disabled` (which still emits `tabPress`)
   * and the screen handles the press itself.
   */
  kind: "route" | "screen";
};

export const AURORA_NAV_ACTIONS: Record<AuroraNavActionId, AuroraNavAction> = {
  train: { id: "train", glyph: "train", labelKey: "nav.train", label: "Train", kind: "route" },
  post: { id: "post", glyph: "list-add", labelKey: "nav.addPost", label: "Add post", kind: "route" },
  search: { id: "search", glyph: "search", labelKey: "nav.findFood", label: "Find a food", kind: "screen" },
} as const;

/** The surface id the add-to-meal picker publishes while it is the visible
 *  screen — Snacks, Breakfast, whichever meal it was opened for. One constant
 *  so the screen and the bar cannot disagree about the spelling. */
export const NAV_SURFACE_FOOD_PICKER = "food-picker";

/**
 * Which action the circle carries on a given surface. `surface` is the visible
 * screen id, with the Today hub's inner tab folded in by the caller (the hub
 * renders Feed inside the `today` screen, so the shell passes "feed" while that
 * hub tab is up) and the nutrition hub's inner view folded in the same way (it
 * renders the picker inside the `nutrition` screen). Everywhere else the app's
 * verb is training.
 */
export function auroraNavAction(surface: string | null | undefined): AuroraNavActionId {
  if (surface === "feed") return "post";
  if (surface === NAV_SURFACE_FOOD_PICKER) return "search";
  return "train";
}

/**
 * Bar geometry. Concentric by construction: the capsule's padding is what
 * leaves a visible glass margin around the selection lens, so the bar reads as
 * a container HOLDING a pill rather than pinching it. The action circle's
 * diameter is the capsule's full height (slotH + 2·padV — 56 full, 48 mini),
 * so the split bar reads as one bar in two pieces, never a bar and a button.
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
  /** The gap between the capsule and the detached action circle. */
  actionGap: 10,
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
 * drift apart. The action circle wears the SAME material as the capsule — the
 * accent lives in its glyph, never in its glass (the old solid-lime circle is
 * the retired look).
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
