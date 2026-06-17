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
