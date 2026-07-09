// Settings information architecture — the SINGLE SOURCE OF TRUTH for how the
// account/settings area is categorised and ordered on BOTH clients. The web
// (apps/web/components/account-settings.tsx) and mobile
// (apps/mobile/components/aurora/settings.tsx) render the SAME groups, in the
// same order, with the same titles/subtitles/icons — an Instagram-style
// grouped hub (group label → list of categories → each category expands to its
// controls). The actual control widgets stay per-client (React DOM vs React
// Native), but the hierarchy can't drift because it lives here.

import type { AuroraIconName } from "./theme/icons";

/** A settings category — one expandable/navigable row in the hub. */
export type SettingsCategoryId =
  | "account"
  | "social"
  | "preferences"
  | "logger"
  | "notifications"
  | "privacy"
  | "coaching"
  | "security"
  | "subscription"
  | "data"
  | "danger";

export interface SettingsCategory {
  id: SettingsCategoryId;
  /** Aurora line-icon glyph (shared icon set). */
  icon: AuroraIconName;
  /** Row title. */
  title: string;
  /** One-line description shown under the title. */
  subtitle: string;
  /** Extra search terms — the names of the controls inside this category — so a
   *  settings search finds e.g. "password" → Security, "units" → Preferences.
   *  (Kept alongside title + subtitle, which are also searched.) */
  keywords?: string[];
  /** A destructive category gets the alert (red) treatment. */
  danger?: boolean;
}

export interface SettingsGroup {
  id: "usage" | "reach" | "login" | "data";
  /** Uppercase section header above the list (Instagram-style). */
  label: string;
  categories: SettingsCategory[];
}

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    id: "usage",
    label: "General",
    categories: [
      { id: "account", icon: "user", title: "Account & profile", subtitle: "Name, email, account type", keywords: ["name", "email", "display name", "profile"] },
      { id: "preferences", icon: "settings", title: "Preferences", subtitle: "Appearance, language, units", keywords: ["theme", "appearance", "dark", "light", "language", "english", "polish", "german", "units", "kg", "lb", "liquid glass"] },
      { id: "logger", icon: "play", title: "Workout logger", subtitle: "Detail, volume, rest timer", keywords: ["warmups", "volume", "fractional", "plate", "rest timer", "rpe", "rir", "haptics", "increment"] },
      { id: "notifications", icon: "bell", title: "Notifications", subtitle: "Recaps, coach, reminders", keywords: ["weekly recap", "coach messages", "check-in reminders", "product updates", "push"] },
    ],
  },
  {
    id: "reach",
    label: "Visibility & reach",
    categories: [
      { id: "social", icon: "user-circle", title: "Public profile", subtitle: "Handle, bio, photo, who can see your results", keywords: ["handle", "bio", "avatar", "photo", "public"] },
      { id: "privacy", icon: "eye", title: "Privacy", subtitle: "Sharing, discoverability, analytics", keywords: ["coach", "discoverable", "talent", "analytics", "opt out"] },
      { id: "coaching", icon: "user-add", title: "Coaching & access", subtitle: "Become a coach, request access", keywords: ["become a coach", "apply", "credentials", "roster"] },
    ],
  },
  {
    id: "login",
    label: "Account & billing",
    categories: [
      { id: "security", icon: "lock", title: "Security", subtitle: "Password, 2FA, sessions", keywords: ["password", "mfa", "2fa", "two factor", "sign out everywhere", "sessions"] },
      { id: "subscription", icon: "offer", title: "Subscription", subtitle: "Your plan & billing", keywords: ["upgrade", "full", "billing", "manage subscription", "stripe", "plan", "cancel"] },
    ],
  },
  {
    id: "data",
    label: "Data & danger zone",
    categories: [
      { id: "data", icon: "download", title: "Your data", subtitle: "Export everything", keywords: ["export", "download", "gdpr"] },
      { id: "danger", icon: "logout", title: "Danger zone", subtitle: "Sign out, erase account", danger: true, keywords: ["sign out", "log out", "delete account", "erase", "reset"] },
    ],
  },
];

/** Flat lookup of every category by id (handy for per-client renderers). */
export const SETTINGS_CATEGORIES: Record<SettingsCategoryId, SettingsCategory> =
  SETTINGS_GROUPS.reduce((acc, g) => {
    for (const c of g.categories) acc[c.id] = c;
    return acc;
  }, {} as Record<SettingsCategoryId, SettingsCategory>);

/** Flat, ordered list of every category (search results, "jump to" lists). */
export const SETTINGS_ALL: SettingsCategory[] = SETTINGS_GROUPS.flatMap((g) => g.categories);

/**
 * Filter the settings categories by a free-text query, matching the title,
 * subtitle AND keywords (case-insensitive, all query words must hit somewhere).
 * Powers the settings search box on both clients. An empty query returns [].
 */
export function matchSettings(query: string): SettingsCategory[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/\s+/);
  return SETTINGS_ALL.filter((c) => {
    const hay = `${c.title} ${c.subtitle} ${(c.keywords ?? []).join(" ")}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
