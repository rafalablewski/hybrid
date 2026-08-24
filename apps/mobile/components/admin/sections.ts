import type { AuroraIconName } from "@hybrid/core";

// The mobile admin section registry. It mirrors the web console nav
// (apps/web/components/admin/panel.tsx SECTIONS) so the two admin surfaces
// can't drift on what they contain — with ONE deliberate, recorded exception.
// The home springboard renders these grouped; app/admin/[section].tsx maps the
// id → its screen component.
//
// ── THE EXCEPTION: THE AI GROUP IS WEB-ONLY ────────────────────────────────
// "Agent HQ" and "AI agents" — an executive-agent org chart, its run history,
// prompt editing, approvals and delegation, ~1,550 lines — used to render here
// too. They are gone from this client and stay on the web operator panel.
//
// The rule that admin capabilities are two-sided (CLAUDE.md) is about not
// letting the two panels disagree on a feature both have. This is a different
// question: WHICH BINARY the code ships in. Everything in this folder is
// compiled into the consumer app that every athlete downloads from the App
// Store, gated at runtime by a role check — and an agent-operations console is
// not a thing a fitness app should contain at all, gated or not. The operator
// panel is a web page behind an admin login; that is the right home for
// operating the company, and it is one URL away from the same person.
//
// The rule this exception is written against: if a section is on both, keep the
// two in step. If a section is web-only, it must say so here, with why.
//
// WEB-ONLY, DECLARED:
//   • The AI group (Agent HQ, AI agents) — an agent-operations console has no
//     business compiled into the app an athlete downloads, role gate or not.
//   • ONBOARDING QUESTIONS (/admin → Onboarding). Authoring the questionnaire
//     is a desk task: it is long-form copy in three locales, per-question
//     options, an order, an intake scope and an engine key, and every edit
//     changes the first thing every new athlete sees. It wants a keyboard and a
//     wide screen, and it is one URL away from the same operator. Nothing about
//     it is time-critical in the way moderation or a feature flag can be, which
//     is the test the sections below are chosen by.
export type AdminSectionId =
  | "overview"
  | "users"
  | "directory"
  | "moderation"
  | "announcements"
  | "exercises"
  | "media"
  | "translations"
  | "flags"
  | "content"
  | "access"
  | "security"
  | "audit"
  | "system"
  | "guidance";

export type AdminSection = { id: AdminSectionId; label: string; icon: AuroraIconName; group: string };

export const ADMIN_SECTIONS: AdminSection[] = [
  { id: "overview", label: "Overview", icon: "info", group: "Platform" },
  { id: "users", label: "Users", icon: "user", group: "Platform" },
  { id: "directory", label: "Coaching", icon: "globe", group: "Platform" },
  { id: "moderation", label: "Moderation", icon: "check-circle", group: "Platform" },
  // No "AI" group — see the exception at the top of this file.
  { id: "announcements", label: "Announcements", icon: "bell", group: "Content" },
  { id: "exercises", label: "Exercise library", icon: "list-check", group: "Content" },
  { id: "media", label: "Media library", icon: "copy", group: "Content" },
  { id: "translations", label: "Localization", icon: "share", group: "Content" },
  { id: "flags", label: "Feature flags", icon: "bookmark", group: "Content" },
  { id: "content", label: "Capabilities & data", icon: "download", group: "Content" },
  { id: "access", label: "Access control", icon: "lock", group: "Governance" },
  { id: "security", label: "Security", icon: "verified", group: "Governance" },
  { id: "audit", label: "Audit log", icon: "search", group: "Governance" },
  { id: "system", label: "System", icon: "settings", group: "Governance" },
  { id: "guidance", label: "Guidance", icon: "calendar-event", group: "Governance" },
];

export const ADMIN_GROUPS = [...new Set(ADMIN_SECTIONS.map((s) => s.group))];
