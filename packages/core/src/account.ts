// Account-settings section definitions — the SINGLE SOURCE OF TRUTH for the
// notification + privacy preference rows (and their defaults) surfaced in the
// account area. Both clients (web components/account-settings.tsx and mobile
// app/settings.tsx + components/aurora/settings.tsx) render these exact rows
// and persist the toggles to Supabase auth user_metadata, so the two clients
// can't drift on either the keys or the copy.

/** A togglable preference row: a stable storage key + the label/description +
 *  the section it belongs to (rows sharing a `group`, kept contiguous, render
 *  under one sub-header on both clients). */
export type PrefRowDef = { key: string; title: string; desc: string; group: string };

/**
 * Notification channels. Stored under user_metadata.notifications.{key}.
 *
 * ONE ROW PER NOTIFICATION THAT EXISTS — no more. These four rows used to
 * include a weekly recap and product news, neither of which the app has ever
 * been able to send: there was no delivery channel at all until push shipped
 * (core/push.ts). A switch that governs nothing is the same lie as a badge that
 * cannot reach zero, so the two undeliverable rows were retired with that
 * change and the remaining three are exactly the three notifications push
 * sends. `PUSH_PREF_KEY` maps each kind to its key here, and the server honours
 * it — the sender reads the mirror of these switches on the device row, so an
 * athlete who turns one off stops receiving it rather than stops seeing it.
 *
 * Add a row here only alongside the notification it turns off.
 */
export const ACCOUNT_NOTIF_DEFAULTS: Record<string, boolean> = {
  checkinReminders: true,
  coachMessages: true,
  cosignRequests: true,
};

export const ACCOUNT_NOTIF_ROWS: PrefRowDef[] = [
  { key: "checkinReminders", title: "Morning readiness nudge", desc: "A reminder at 07:00 when today's readiness read is still open.", group: "Training" },
  { key: "coachMessages", title: "Coach assignments", desc: "When your coach assigns you a session.", group: "Coaching" },
  { key: "cosignRequests", title: "Co-sign requests", desc: "When somebody asks you to witness a lift they claim.", group: "Records" },
];

/** Privacy switches. Stored under user_metadata.privacy.{key}. */
export const ACCOUNT_PRIVACY_DEFAULTS: Record<string, boolean> = {
  coachCanSeeDetail: true,
  analyticsOptOut: false,
};

export const ACCOUNT_PRIVACY_ROWS: PrefRowDef[] = [
  { key: "coachCanSeeDetail", title: "Share detail with my coach", desc: "Let a linked coach see your full session detail, not just summaries.", group: "Coaching" },
  { key: "analyticsOptOut", title: "Opt out of product analytics", desc: "Don't include my usage in aggregate product analytics.", group: "Data & analytics" },
];
