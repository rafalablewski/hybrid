/**
 * TODAY HUB — the three top-level views Today switches between.
 *
 * Today is no longer one screen; it is the athlete's home HUB, and the pill row
 * that sits directly under the profile header (above the calendar/week rail)
 * picks which of three it shows:
 *
 *  - DASHBOARD — the daily guided loop (today's session, feel, this week). The
 *    screen Today has always been, and the default every visit opens on: it
 *    answers "what do I do today?", which is the reason the tab exists.
 *  - PERFORMANCE — the analytical layer, all of it in one place: the
 *    Performance command centre, Volume, and Trends behind a secondary chip
 *    rail (PERFORMANCE_VIEWS below).
 *  - FEED — the social surface. Live today (posts, PR cards, kudos, comments)
 *    and the seat for the wider social product still to come.
 *
 * The registry lives here so web (aurora/today-tabs.tsx) and mobile
 * (aurora/today-tabs.tsx) render the SAME three tabs, in the same order, under
 * the same labels — the ids and labelKeys cannot drift between the clients.
 * Labels reuse the existing shared `nav.*` strings rather than minting a second
 * copy of "Performance" / "Volume" / "Trends" / "Feed" / "Dashboard".
 */

export type TodayTabId = "dashboard" | "performance" | "feed";

export const TODAY_TABS: ReadonlyArray<{ id: TodayTabId; labelKey: string }> = [
  { id: "dashboard", labelKey: "nav.dashboard" },
  { id: "performance", labelKey: "nav.performance" },
  { id: "feed", labelKey: "nav.feed" },
];

/** Normalize a tab id from a link, a restored value or an unknown source.
 *  Anything we don't recognise falls back to the daily loop — Today's job. */
export const normalizeTodayTab = (v: unknown): TodayTabId =>
  TODAY_TABS.some((x) => x.id === v) ? (v as TodayTabId) : "dashboard";

/**
 * The Performance tab's own three views. A SECONDARY switcher (the small mono
 * chip rail History already uses), never a second row of the big pills: the
 * hierarchy has to stay readable — three tabs up top, three chips inside one of
 * them. Each view is the existing full screen, rendered in place, so nothing
 * about Performance / Volume / Trends is re-implemented or forked here.
 */
export type PerformanceViewId = "performance" | "volume" | "trends";

export const PERFORMANCE_VIEWS: ReadonlyArray<{ id: PerformanceViewId; labelKey: string }> = [
  { id: "performance", labelKey: "nav.performance" },
  { id: "volume", labelKey: "nav.volume" },
  { id: "trends", labelKey: "nav.trends" },
];

export const normalizePerformanceView = (v: unknown): PerformanceViewId =>
  PERFORMANCE_VIEWS.some((x) => x.id === v) ? (v as PerformanceViewId) : "performance";
