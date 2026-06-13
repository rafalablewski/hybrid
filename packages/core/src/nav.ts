/**
 * Canonical navigation map — the single source of truth for nav item ids,
 * icons and grouping, shared by the web sidebar + ⌘K command hub and the mobile
 * command sheet so the two can't drift. Labels are localized per client via
 * i18n (`nav.<id>`); `label` here is the English fallback.
 *
 * Each client maps an item `id` to its own destination (web: an app-shell
 * screen id — the id IS the screen; mobile: an expo-router href) and may show a
 * subset (filtered by feature flags on web, by available routes on mobile).
 */
export type NavGroup = "home" | "train" | "analyze" | "recovery" | "teams" | "account";

export interface NavItem {
  /** stable id — also the web screen id, and the i18n key suffix (nav.<id>) */
  id: string;
  /** English fallback label (clients prefer the localized nav.<id>) */
  label: string;
  /** glyph icon */
  icon: string;
  group: NavGroup;
}

/** Render order of the groups. */
export const NAV_GROUP_ORDER: NavGroup[] = ["home", "train", "analyze", "recovery", "teams", "account"];

export const NAV_ITEMS: NavItem[] = [
  { id: "today", label: "Today", icon: "➤", group: "home" },
  { id: "dashboard", label: "Dashboard", icon: "◆", group: "home" },
  { id: "onboarding", label: "Get started", icon: "✦", group: "home" },

  { id: "log", label: "Log session", icon: "✎", group: "train" },
  { id: "calendar", label: "Calendar", icon: "▦", group: "train" },
  { id: "builder", label: "Builder", icon: "⊕", group: "train" },
  { id: "plans", label: "Plans", icon: "▤", group: "train" },
  { id: "periodize", label: "Periodize", icon: "◰", group: "train" },
  { id: "sport", label: "Sport", icon: "◎", group: "train" },
  { id: "competition", label: "Competition", icon: "▲", group: "train" },

  { id: "performance", label: "Performance", icon: "◈", group: "analyze" },
  { id: "analytics", label: "Analytics", icon: "◷", group: "analyze" },
  { id: "velocity", label: "Velocity (VBT)", icon: "⚡", group: "analyze" },
  { id: "running", label: "Running", icon: "🏃", group: "analyze" },
  { id: "forceplate", label: "Force plate", icon: "◇", group: "analyze" },
  { id: "video", label: "Video", icon: "▷", group: "analyze" },
  { id: "history", label: "History", icon: "≣", group: "analyze" },

  { id: "checkin", label: "Check-in", icon: "✓", group: "recovery" },
  { id: "nutrition", label: "Nutrition", icon: "🍎", group: "recovery" },
  { id: "progress", label: "Progress photos", icon: "📸", group: "recovery" },
  { id: "longevity", label: "Longevity", icon: "❤", group: "recovery" },

  { id: "coach", label: "Coach", icon: "✦", group: "teams" },
  { id: "squad", label: "Squad monitor", icon: "◫", group: "teams" },
  { id: "teamcompare", label: "Team compare", icon: "⚖", group: "teams" },
  { id: "org", label: "Organization", icon: "⬡", group: "teams" },
  { id: "talent", label: "Talent", icon: "✸", group: "teams" },
  { id: "tactical", label: "Tactical", icon: "▰", group: "teams" },

  { id: "connections", label: "Connections", icon: "⌁", group: "account" },
  { id: "roles", label: "Roles & access", icon: "⚿", group: "account" },
  { id: "settings", label: "Settings", icon: "⚙", group: "account" },
];

/** Group the items (optionally a filtered subset) in canonical group order. */
export function groupedNav(items: NavItem[] = NAV_ITEMS): { group: NavGroup; items: NavItem[] }[] {
  return NAV_GROUP_ORDER.map((group) => ({ group, items: items.filter((i) => i.group === group) })).filter(
    (g) => g.items.length > 0,
  );
}
