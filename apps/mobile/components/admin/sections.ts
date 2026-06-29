import type { AuroraIconName } from "@hybrid/core";

// The mobile admin section registry — mirrors the web console nav
// (apps/web/components/admin/panel.tsx SECTIONS) one-for-one so the two clients
// can't drift on what the admin surface contains. The home springboard renders
// these grouped; app/admin/[section].tsx maps the id → its screen component.
export type AdminSectionId =
  | "overview"
  | "users"
  | "directory"
  | "moderation"
  | "financials"
  | "email"
  | "hq"
  | "agents"
  | "announcements"
  | "onboarding"
  | "exercises"
  | "media"
  | "translations"
  | "flags"
  | "content"
  | "access"
  | "security"
  | "audit"
  | "anon"
  | "system"
  | "guidance";

export type AdminSection = { id: AdminSectionId; label: string; icon: AuroraIconName; group: string };

export const ADMIN_SECTIONS: AdminSection[] = [
  { id: "overview", label: "Overview", icon: "info", group: "Platform" },
  { id: "users", label: "Users", icon: "user", group: "Platform" },
  { id: "directory", label: "Orgs & coaching", icon: "globe", group: "Platform" },
  { id: "moderation", label: "Moderation", icon: "check-circle", group: "Platform" },
  { id: "financials", label: "Financials", icon: "offer", group: "Business" },
  { id: "email", label: "Email & marketing", icon: "mail", group: "Business" },
  { id: "hq", label: "Agent HQ", icon: "navigation", group: "AI" },
  { id: "agents", label: "AI agents", icon: "user-square", group: "AI" },
  { id: "announcements", label: "Announcements", icon: "bell", group: "Content" },
  { id: "onboarding", label: "Onboarding", icon: "navigation", group: "Content" },
  { id: "exercises", label: "Exercise library", icon: "list-check", group: "Content" },
  { id: "media", label: "Media library", icon: "copy", group: "Content" },
  { id: "translations", label: "Localization", icon: "share", group: "Content" },
  { id: "flags", label: "Feature flags", icon: "bookmark", group: "Content" },
  { id: "content", label: "Capabilities & data", icon: "download", group: "Content" },
  { id: "access", label: "Access control", icon: "lock", group: "Governance" },
  { id: "security", label: "Security", icon: "verified", group: "Governance" },
  { id: "audit", label: "Audit log", icon: "search", group: "Governance" },
  { id: "anon", label: "Guest workouts", icon: "user-circle", group: "Governance" },
  { id: "system", label: "System", icon: "settings", group: "Governance" },
  { id: "guidance", label: "Guidance", icon: "calendar-event", group: "Governance" },
];

export const ADMIN_GROUPS = [...new Set(ADMIN_SECTIONS.map((s) => s.group))];
