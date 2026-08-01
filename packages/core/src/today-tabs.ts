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
 *  - PERFORMANCE — the analytical layer, all of it, as ONE page: the command
 *    centre, this week's volume and the eight-week trend read top to bottom in
 *    a single scroll (see the `performance-unified` capability). It was briefly
 *    three sub-views behind a chip rail; that made the athlete hunt for which
 *    tab held a number, and it duplicated work — Volume and Trends both drew
 *    the muscle breakdown off volumeStatus() and both printed the same
 *    add/ease-off advice off volumeAdvice(). One page, each fact once.
 *  - FEED — the social surface. Live today (posts, PR cards, kudos, comments)
 *    and the seat for the wider social product still to come.
 *
 * The registry lives here so web (aurora/today-tabs.tsx) and mobile
 * (aurora/today-tabs.tsx) render the SAME three tabs, in the same order, under
 * the same marks — the ids, glyphs and labelKeys cannot drift between the
 * clients. Labels reuse the existing shared `nav.*` strings rather than minting
 * a second copy of "Performance" / "Volume" / "Trends" / "Feed" / "Dashboard".
 *
 * The pills SHOW the glyph, not the label. Three words of three very different
 * lengths in three equal segments never look centred as a set; three marks of
 * matched optical weight do. The label is still what the tab is CALLED — it
 * stays the accessible name (and the web tooltip), so nothing is lost to
 * screen readers, voice control or translation.
 */
import type { HubGlyphName } from "./theme/icons";

export type TodayTabId = "dashboard" | "performance" | "feed";

export const TODAY_TABS: ReadonlyArray<{ id: TodayTabId; labelKey: string; glyph: HubGlyphName }> = [
  { id: "dashboard", labelKey: "nav.dashboard", glyph: "dashboard" },
  { id: "performance", labelKey: "nav.performance", glyph: "performance" },
  { id: "feed", labelKey: "nav.feed", glyph: "feed" },
];

/** Normalize a tab id from a link, a restored value or an unknown source.
 *  Anything we don't recognise falls back to the daily loop — Today's job. */
export const normalizeTodayTab = (v: unknown): TodayTabId =>
  TODAY_TABS.some((x) => x.id === v) ? (v as TodayTabId) : "dashboard";
