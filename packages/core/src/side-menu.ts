import type { AuroraIconName, HubGlyphName } from "./theme/icons";
import type { TodayTabId } from "./today-tabs";

/**
 * THE SIDE MENU — the drawer behind the Today header's profile avatar.
 *
 * Tapping the avatar in the top-left of the hub header slides a menu in from
 * the left edge (the idiom X uses): identity at the top, the destinations a
 * person actually navigates BY NAME in the middle, and the account/support
 * exits smaller at the bottom.
 *
 * WHY THIS EXISTS. The bottom bar can hold five things, and four of them are
 * the daily loop (Today, Nutrition, Train, Profile). The fifth used to be
 * "More" — a springboard of ~40 launcher tiles, which is a directory, not a
 * destination: nobody's daily loop includes "open the directory". The drawer
 * takes that job (it is one gesture from every hub tab and costs the bar
 * nothing), which frees the fifth slot for Messages — a real destination with
 * unread state.
 *
 * The rows here are the SINGLE SOURCE OF TRUTH for both clients (web
 * components/aurora/side-menu.tsx, mobile components/aurora/side-menu.tsx), so
 * the two menus cannot drift in contents or order. Each client maps a row's
 * target onto its own navigation:
 *   • `screen` — a canonical nav id (web: the app-shell screen id; mobile: the
 *     route in lib/nav-href.ts).
 *   • `hub` — one of Today's three hub tabs, selected in place (the drawer
 *     lives inside the hub, so this never leaves the screen).
 *
 * Everything NOT listed here is still reachable: the drawer ends the primary
 * list with an "All tools" expander carrying the full persona-filtered nav
 * (the springboard that used to be the More tab).
 */

export type SideMenuTarget =
  | { kind: "screen"; screen: string }
  | { kind: "hub"; tab: TodayTabId };

export interface SideMenuRow {
  /** Stable id — also the i18n key suffix used for the label (`nav.<id>`). */
  id: string;
  /** i18n key for the row label. */
  labelKey: string;
  /** English fallback when the key is missing. */
  label: string;
  /** Kit line-icon glyph. Mutually exclusive with `hub`. */
  icon?: AuroraIconName;
  /** Hub glyph (the bento / bars / figures the hub pills draw), for hub rows. */
  hub?: HubGlyphName;
  target: SideMenuTarget;
}

/**
 * THE PRIMARY LIST — big rows, icon + label.
 *
 * Profile first (the drawer opened from the avatar, so the person is the
 * subject), then History — the two things the avatar's own header used to be
 * the only door to. Then the three hub views by name: the pills above the
 * calendar show glyphs only, so this list is where Dashboard / Performance /
 * Feed are actually SPELLED, and picking one here switches the hub in place.
 * Nutrition closes the list — it is on the bar too, but a drawer that names
 * five of the six places you go and silently omits the sixth reads as an
 * oversight.
 */
export const SIDE_MENU_PRIMARY: readonly SideMenuRow[] = [
  { id: "profile", labelKey: "nav.profile", label: "Profile", icon: "user-circle", target: { kind: "screen", screen: "profile" } },
  { id: "history", labelKey: "nav.history", label: "History", icon: "copy", target: { kind: "screen", screen: "history" } },
  { id: "dashboard", labelKey: "nav.dashboard", label: "Dashboard", hub: "dashboard", target: { kind: "hub", tab: "dashboard" } },
  { id: "performance", labelKey: "nav.performance", label: "Performance", hub: "performance", target: { kind: "hub", tab: "performance" } },
  { id: "feed", labelKey: "nav.feed", label: "Feed", hub: "feed", target: { kind: "hub", tab: "feed" } },
  { id: "nutrition", labelKey: "nav.nutrition", label: "Nutrition", icon: "fork-knife", target: { kind: "screen", screen: "nutrition" } },
] as const;

/**
 * THE FOOTER — the same rows at a smaller size, at the bottom of the panel.
 *
 * These are the "about the account" exits rather than places you train: where
 * your devices connect, where the switches live, and where to get help. Small
 * type is the whole signal that they are a different class of thing — there is
 * no divider rule and no cluster label, because a hairline between two lists of
 * rows is the label-plus-rule divider the design deliberately retired.
 */
export const SIDE_MENU_FOOTER: readonly SideMenuRow[] = [
  { id: "connections", labelKey: "nav.connections", label: "Connections", icon: "share", target: { kind: "screen", screen: "connections" } },
  { id: "settings", labelKey: "nav.settingsPrivacy", label: "Settings and privacy", icon: "settings", target: { kind: "screen", screen: "settings" } },
  { id: "help", labelKey: "nav.help", label: "Help center", icon: "info", target: { kind: "screen", screen: "help" } },
] as const;

/** Every row the menu renders, primary then footer (handy for tests/audits). */
export const SIDE_MENU_ROWS: readonly SideMenuRow[] = [...SIDE_MENU_PRIMARY, ...SIDE_MENU_FOOTER];

/** The `screen` targets only — the canonical nav ids the drawer routes to. */
export const SIDE_MENU_SCREEN_IDS: readonly string[] = SIDE_MENU_ROWS
  .filter((r) => r.target.kind === "screen")
  .map((r) => (r.target as { kind: "screen"; screen: string }).screen);

/**
 * Everything the drawer already names, so the "All tools" expander below it
 * never offers the same destination twice. This is the ROW IDS, not just the
 * screen targets, and the difference is not academic: PERFORMANCE and FEED are
 * hub rows here AND canonical nav ids, and both the hub tab and the nav id
 * render the very same component (AuroraPerformance, SocialFeed). Filtering on
 * screen targets alone printed each of them twice in one panel — once at the
 * top as a hub row, once again under Analyze/Social — which reads as two
 * different places and is exactly the duplication the drawer was meant to end.
 *
 * DASHBOARD is a row id with no nav id (it is a view of Today, not a screen);
 * it simply matches nothing, which is correct.
 */
export const SIDE_MENU_NAMED_IDS: readonly string[] = SIDE_MENU_ROWS.map((r) => r.id);

/** Panel width, in px/dp, capped to a share of the viewport by each client. */
export const SIDE_MENU_WIDTH = 300;
