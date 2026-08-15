/**
 * Shared analytics event names, so web + mobile instrument the SAME funnel and
 * can't drift. The transport is per-client (lib/track.ts), but the event names
 * and the meaning live here.
 *
 * The freemium upgrade funnel:
 *   entry click → upgrade page view → CTA click   (→ purchase, tracked by billing)
 */
export const FUNNEL = {
  /** A casual user tapped the single "Unlock Full" entry. props: { client, source } */
  upgradeEntryClick: "upgrade_entry_click",
  /** The Unlock Full bundle page was viewed. props: { client } */
  upgradePageView: "upgrade_page_view",
  /** The upgrade CTA on the bundle page was pressed. props: { client, paid } */
  upgradeCtaClick: "upgrade_cta_click",
} as const;

export type FunnelEvent = (typeof FUNNEL)[keyof typeof FUNNEL];

/**
 * Search events. These exist to answer ONE question the app cannot otherwise
 * see: which words do athletes use that the search does not know? A query that
 * finds nothing looks, from the outside, exactly like a query for something
 * that does not exist — and the athlete's next move (typing a custom exercise
 * name) is where their own history quietly splits in two.
 *
 * Both carry the raw query, trimmed. They are the only events in the app that
 * do, and it is deliberate: the words ARE the finding. The local backlog
 * (@hybrid/core search-misses) is what makes this useful before a provider is
 * wired, since track() no-ops until then.
 */
export const SEARCH = {
  /** A real query matched nothing. props: { client, query } */
  miss: "search_miss",
  /** A movement was created by hand instead of picked. props: { client, query } */
  customAdd: "search_custom_add",
  /** The cross-app search ran. props: { client, results } */
  global: "search_global",
} as const;

export type SearchEvent = (typeof SEARCH)[keyof typeof SEARCH];
