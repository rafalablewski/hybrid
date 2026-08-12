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

/** Notification channels. Stored under user_metadata.notifications.{key}. */
export const ACCOUNT_NOTIF_DEFAULTS: Record<string, boolean> = {
  weeklyRecap: true,
  coachMessages: true,
  checkinReminders: true,
  productUpdates: false,
};

export const ACCOUNT_NOTIF_ROWS: PrefRowDef[] = [
  { key: "weeklyRecap", title: "Weekly recap", desc: "Your Sunday training summary.", group: "Training" },
  { key: "checkinReminders", title: "Check-in reminders", desc: "A nudge when your weekly check-in is due.", group: "Training" },
  { key: "coachMessages", title: "Coach messages", desc: "When your coach replies to a check-in or assigns work.", group: "Coaching" },
  { key: "productUpdates", title: "Product updates", desc: "Occasional news about new features.", group: "Product" },
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
