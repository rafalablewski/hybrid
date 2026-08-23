import type { AuroraIconName } from "./theme/icons";

/**
 * THE HELP CENTER — the third row in the side menu's footer, and the one place
 * the app answers "how does this work?" and "how do I reach a human?".
 *
 * The rows are DATA here so both clients render the same help, in the same
 * order, with the same words. Each client maps a row's `action` onto its own
 * plumbing (a screen switch on web, a route push on mobile, `Linking`/`href`
 * for the mail and legal links), because those differ; WHAT the help offers
 * cannot.
 *
 * Every row is something that actually exists today — the first-run tour, a
 * mailbox that receives mail, the request-access flow inside Settings, and the
 * published legal pages. Nothing here promises an article library we have not
 * written.
 */

/** The mailbox behind "Contact support".
 *
 * hybriddomain.xyz is the domain HYBRID currently runs on and this mailbox is a
 * real Google Workspace address (see guidance.ts, ACCOUNTS & IDENTITY). The
 * agreed end state is support@hybrid.app once that domain is acquired; when it
 * is, change it HERE and both clients follow. */
export const SUPPORT_EMAIL = "contact@hybriddomain.xyz";

export type HelpAction =
  /** Re-arm the first-run guided tour, then send the athlete to Today. */
  | { kind: "tour" }
  /** Open the mail client with a pre-addressed support message. */
  | { kind: "mail" }
  /** Jump to a screen (a canonical nav id). */
  | { kind: "screen"; screen: string }
  /** Open a public page on the web app (path, e.g. "/privacy"). */
  | { kind: "web"; path: string };

export interface HelpRow {
  id: string;
  icon: AuroraIconName;
  /** i18n key for the row title. */
  titleKey: string;
  /** i18n key for the one-line description under it. */
  bodyKey: string;
  action: HelpAction;
}

export const HELP_ROWS: readonly HelpRow[] = [
  { id: "tour", icon: "play", titleKey: "help.tourTitle", bodyKey: "help.tourBody", action: { kind: "tour" } },
  { id: "contact", icon: "mail", titleKey: "help.contactTitle", bodyKey: "help.contactBody", action: { kind: "mail" } },
  { id: "feature", icon: "add-square", titleKey: "help.featureTitle", bodyKey: "help.featureBody", action: { kind: "screen", screen: "settings" } },
  { id: "legal", icon: "lock", titleKey: "help.legalTitle", bodyKey: "help.legalBody", action: { kind: "web", path: "/privacy" } },
] as const;

/** The `mailto:` a "Contact support" row opens, subject pre-filled so the
 *  mailbox can route it without the sender having to explain where they were. */
export function supportMailto(subject = "HYBRID support"): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

/** Storage key for "the first-run tour has been taken". A fact about the
 *  PERSON, not the handset — re-teaching the app to someone on their second
 *  device is exactly what synced preferences exist to stop — so it rides
 *  synced-prefs.ts rather than sitting in device storage. */
export const TOUR_SEEN_KEY = "hybrid.tourSeen";
