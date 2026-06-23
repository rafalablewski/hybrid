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
    label: "How you use HYBRID",
    categories: [
      { id: "account", icon: "user", title: "Account & profile", subtitle: "Name, email, account type" },
      { id: "preferences", icon: "settings", title: "Preferences", subtitle: "Appearance, language, units" },
      { id: "logger", icon: "play", title: "Workout logger", subtitle: "Detail, volume counting" },
      { id: "notifications", icon: "bell", title: "Notifications", subtitle: "Recaps, coach, reminders" },
    ],
  },
  {
    id: "reach",
    label: "Who can see & reach you",
    categories: [
      { id: "privacy", icon: "eye", title: "Privacy", subtitle: "Sharing, discoverability, analytics" },
      { id: "coaching", icon: "user-add", title: "Coaching & access", subtitle: "Become a coach, request access" },
    ],
  },
  {
    id: "login",
    label: "Login & billing",
    categories: [
      { id: "security", icon: "lock", title: "Security", subtitle: "Password, sessions" },
      { id: "subscription", icon: "offer", title: "Subscription", subtitle: "Your plan & billing" },
    ],
  },
  {
    id: "data",
    label: "Your data & support",
    categories: [
      { id: "data", icon: "download", title: "Your data", subtitle: "Export everything" },
      { id: "danger", icon: "logout", title: "Danger zone", subtitle: "Sign out, erase account", danger: true },
    ],
  },
];

/** Flat lookup of every category by id (handy for per-client renderers). */
export const SETTINGS_CATEGORIES: Record<SettingsCategoryId, SettingsCategory> =
  SETTINGS_GROUPS.reduce((acc, g) => {
    for (const c of g.categories) acc[c.id] = c;
    return acc;
  }, {} as Record<SettingsCategoryId, SettingsCategory>);
