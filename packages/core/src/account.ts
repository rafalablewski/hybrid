// Account-settings section definitions — the SINGLE SOURCE OF TRUTH for the
// notification + privacy preference rows (and their defaults) surfaced in the
// account area. Both clients (web components/account-settings.tsx and mobile
// app/settings.tsx + components/aurora/settings.tsx) render these exact rows
// and persist the toggles to Supabase auth user_metadata, so the two clients
// can't drift on either the keys or the copy.

/** A togglable preference row: a stable storage key + the label/description. */
export type PrefRowDef = { key: string; title: string; desc: string };

/** Notification channels. Stored under user_metadata.notifications.{key}. */
export const ACCOUNT_NOTIF_DEFAULTS: Record<string, boolean> = {
  weeklyRecap: true,
  coachMessages: true,
  checkinReminders: true,
  productUpdates: false,
};

export const ACCOUNT_NOTIF_ROWS: PrefRowDef[] = [
  { key: "weeklyRecap", title: "Weekly recap", desc: "Your Sunday training summary." },
  { key: "coachMessages", title: "Coach messages", desc: "When your coach replies to a check-in or assigns work." },
  { key: "checkinReminders", title: "Check-in reminders", desc: "A nudge when your weekly check-in is due." },
  { key: "productUpdates", title: "Product updates", desc: "Occasional news about new features." },
];

/** Privacy switches. Stored under user_metadata.privacy.{key}. */
export const ACCOUNT_PRIVACY_DEFAULTS: Record<string, boolean> = {
  coachCanSeeDetail: true,
  discoverable: false,
  analyticsOptOut: false,
};

export const ACCOUNT_PRIVACY_ROWS: PrefRowDef[] = [
  { key: "coachCanSeeDetail", title: "Share detail with my coach", desc: "Let a linked coach see your full session detail, not just summaries." },
  { key: "discoverable", title: "Discoverable in Talent", desc: "Appear in coach talent searches (your benchmarks, never raw logs)." },
  { key: "analyticsOptOut", title: "Opt out of product analytics", desc: "Don't include my usage in aggregate product analytics." },
];
