"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { fs, space, INK, INK2, CARD, LINE, LIME, CHALK, ASH, AMBER, disp, cond, mono, Mono, txt, GlassField } from "@/lib/ui";
import { useCollapsible } from "@/lib/use-collapsible";
import { useIsMobile } from "@/lib/use-media-query";
import { useTemplate } from "@/lib/use-template";
import { AuroraIcon } from "@/components/aurora/icons";
import type { AuroraIconName } from "@hybrid/core";
import AdminOverview from "./overview";
import AdminUsers from "./users";
import AdminDirectory from "./directory";
import AdminModeration from "./moderation";
import AdminAnnouncements from "./announcements";
import AdminOnboarding from "./onboarding";
import AdminExercises from "./exercises";
import AdminMedia from "./media";
import AdminTranslations from "./translations";
import AdminFlags from "./flags";
import AdminContent from "./content";
import AdminAuditLog from "./audit";
import AdminSystem from "./system";
import AdminSecurity from "./security";
import AdminAccess from "./access";
import CoachApplications from "./coach-applications";
import AdminGuidance from "./guidance";
import AdminFinancials from "./financials";
import AdminEmail from "./email";
import AdminAgents from "./agents";
import AgentHQ from "./agent-hq";
import EngineRoom from "./engine-room";

type SectionId = "overview" | "users" | "directory" | "moderation" | "financials" | "email" | "hq" | "agents" | "engine" | "announcements" | "onboarding" | "exercises" | "media" | "translations" | "flags" | "content" | "access" | "security" | "audit" | "system" | "guidance";

const SECTIONS: { id: SectionId; label: string; icon: string; auroraIcon: AuroraIconName; group: string }[] = [
  { id: "overview", label: "Overview", icon: "◆", auroraIcon: "info", group: "Platform" },
  { id: "users", label: "Users", icon: "⦿", auroraIcon: "user", group: "Platform" },
  { id: "directory", label: "Orgs & coaching", icon: "⬡", auroraIcon: "globe", group: "Platform" },
  { id: "moderation", label: "Moderation", icon: "⚖", auroraIcon: "check-circle", group: "Platform" },
  { id: "financials", label: "Financials", icon: "💰", auroraIcon: "offer", group: "Business" },
  { id: "email", label: "Email & marketing", icon: "✉", auroraIcon: "mail", group: "Business" },
  { id: "hq", label: "Agent HQ", icon: "◳", auroraIcon: "navigation", group: "AI" },
  { id: "agents", label: "AI agents", icon: "🤖", auroraIcon: "user-square", group: "AI" },
  { id: "engine", label: "Engine room", icon: "ƒ", auroraIcon: "grid", group: "AI" },
  { id: "announcements", label: "Announcements", icon: "📣", auroraIcon: "bell", group: "Content" },
  { id: "onboarding", label: "Onboarding", icon: "🧭", auroraIcon: "navigation", group: "Content" },
  { id: "exercises", label: "Exercise library", icon: "🏋", auroraIcon: "list-check", group: "Content" },
  { id: "media", label: "Media library", icon: "🖼", auroraIcon: "copy", group: "Content" },
  { id: "translations", label: "Localization", icon: "🌐", auroraIcon: "share", group: "Content" },
  { id: "flags", label: "Feature flags", icon: "⚑", auroraIcon: "bookmark", group: "Content" },
  { id: "content", label: "Capabilities & data", icon: "⊞", auroraIcon: "download", group: "Content" },
  { id: "access", label: "Access control", icon: "⚿", auroraIcon: "lock", group: "Governance" },
  { id: "security", label: "Security", icon: "🛡", auroraIcon: "verified", group: "Governance" },
  { id: "audit", label: "Audit log", icon: "❑", auroraIcon: "search", group: "Governance" },
  { id: "system", label: "System", icon: "⚙", auroraIcon: "settings", group: "Governance" },
  { id: "guidance", label: "Guidance", icon: "📖", auroraIcon: "calendar-event", group: "Governance" },
];

export default function AdminPanel() {
  const router = useRouter();
  const { session, ready, logout } = useSession();
  const [section, setSection] = useState<SectionId>("overview");
  const { collapsed, toggle: toggleCollapsed } = useCollapsible("hybrid-admin-sidebar");
  // On a phone/tablet the fixed sidebar becomes an off-canvas drawer (hamburger
  // + scrim); on desktop it stays the sticky rail with the collapse control.
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // The drawer is a transient overlay — never leave it open when we switch to
  // the desktop layout, and lock body scroll while it's open on mobile.
  useEffect(() => {
    if (!isMobile) setDrawerOpen(false);
  }, [isMobile]);
  useEffect(() => {
    if (!isMobile || !drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isMobile, drawerOpen]);
  // Aurora rounds the console chrome too (pill nav + softer cards); the section
  // bodies pick up the skin via the shared template-aware lib/ui primitives.
  const aurora = useTemplate().template === "aurora";
  const navRadius = aurora ? 999 : 9;

  // The operator console is admin-only. The `/api/admin/*` routes already
  // enforce this server-side (requireAdmin), but the UI shell must not render
  // for a non-admin (or signed-out) visitor — bounce them to login. Hooks above
  // run unconditionally; this guard is the first early return.
  const allowed = ready && session?.role === "admin";
  useEffect(() => {
    if (ready && session?.role !== "admin") router.replace("/login");
  }, [ready, session, router]);
  if (!allowed) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: INK }}>
        <Mono c={ASH}>{ready ? "Restricted – admin only — redirecting…" : "Checking access…"}</Mono>
      </main>
    );
  }

  const active = SECTIONS.find((s) => s.id === section)!;
  const groups = [...new Set(SECTIONS.map((s) => s.group))];
  // The collapse-to-rail affordance is desktop-only; in the mobile drawer the
  // sidebar is always shown expanded.
  const railCollapsed = collapsed && !isMobile;
  const pick = (id: SectionId) => {
    setSection(id);
    setDrawerOpen(false);
  };

  return (
    <div style={{ ...disp, background: INK, color: CHALK, minHeight: "100vh", display: "flex", position: "relative" }}>
      {/* ambient field — drifting accent blobs the glass surfaces refract */}
      <GlassField />

      {/* scrim — only on mobile while the drawer is open; taps close it */}
      {isMobile && drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          aria-hidden
          style={{ position: "fixed", inset: 0, zIndex: 59, background: "rgba(0,0,0,.5)", backdropFilter: "blur(2px)" }}
        />
      )}

      {/* ---- sidebar (sticky rail on desktop, off-canvas drawer on mobile) ---- */}
      <aside
        className="lg-sidebar"
        style={
          isMobile
            ? {
                width: 264,
                maxWidth: "85vw",
                borderRight: `1px solid ${LINE}`,
                padding: "22px 14px",
                position: "fixed",
                top: 0,
                left: 0,
                height: "100vh",
                display: "flex",
                flexDirection: "column",
                zIndex: 60,
                transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
                transition: "transform .28s cubic-bezier(.22,1,.36,1)",
                boxShadow: drawerOpen ? "0 24px 60px -20px rgba(0,0,0,.7)" : "none",
              }
            : {
                width: railCollapsed ? 72 : 250,
                borderRight: `1px solid ${LINE}`,
                padding: railCollapsed ? "22px 10px" : "22px 14px",
                position: "sticky",
                top: 0,
                height: "100vh",
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                zIndex: 1,
                transition: "width .28s cubic-bezier(.22,1,.36,1), padding .28s cubic-bezier(.22,1,.36,1)",
              }
        }
      >
        <div style={{ padding: railCollapsed ? "0 0 4px" : "0 8px 4px", textAlign: railCollapsed ? "center" : "left" }}>
          <div style={{ ...disp, fontWeight: 900, fontSize: 21, letterSpacing: "-.03em" }}>
            {railCollapsed ? "H" : "HYBRID"}<span style={{ color: txt(AMBER) }}>.</span>
          </div>
          {!railCollapsed && (
            <Mono s={{ fontSize: fs.nano, letterSpacing: ".12em", textTransform: "uppercase" }} c={AMBER}>
              Admin console
            </Mono>
          )}
        </div>

        <nav style={{ flex: 1, overflowY: "auto", minHeight: 0, marginTop: 22 }}>
          {groups.map((g) => (
            <div key={g} style={{ marginBottom: 16 }}>
              {!railCollapsed && (
                <Mono
                  s={{ fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase", padding: "0 10px", display: "block", marginBottom: 6 }}
                  c={ASH}
                >
                  {g}
                </Mono>
              )}
              {SECTIONS.filter((s) => s.group === g).map((s) => (
                <button className="pressable"
                  key={s.id}
                  onClick={() => pick(s.id)}
                  title={railCollapsed ? s.label : undefined}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: railCollapsed ? "center" : "flex-start",
                    gap: railCollapsed ? 0 : 11,
                    padding: railCollapsed ? "9px 0" : "9px 11px",
                    marginBottom: 2,
                    borderRadius: navRadius,
                    cursor: "pointer",
                    border: "none",
                    background: section === s.id ? `${AMBER}1c` : "transparent",
                    color: txt(section === s.id ? AMBER : ASH),
                    ...disp,
                    fontSize: fs.bodyLg,
                    fontWeight: 600,
                    textAlign: "left",
                  }}
                >
                  <span style={{ fontSize: fs.bodyLg, width: 18, display: "grid", placeItems: "center" }}>
                    {aurora ? <AuroraIcon name={s.auroraIcon} size={18} strokeWidth={2.6} /> : s.icon}
                  </span>
                  {!railCollapsed && s.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div style={{ flexShrink: 0, paddingTop: 14, borderTop: `1px solid ${LINE}` }}>
          {!railCollapsed && (
            <div style={{ padding: "8px 10px" }}>
              <div style={{ ...disp, fontWeight: 600, fontSize: fs.body, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {session?.name ?? "—"}
              </div>
              <Mono s={{ fontSize: fs.nano, textTransform: "uppercase" }} c={AMBER}>
                {session?.role ?? "admin"}
              </Mono>
            </div>
          )}
          <button className="pressable" onClick={() => router.push("/app")} title={railCollapsed ? "Back to app" : undefined} style={navBtn(false)}>
            {railCollapsed ? "←" : "← Back to app"}
          </button>
          {!isMobile && (
            <button className="pressable"
              onClick={toggleCollapsed}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              style={{ ...navBtn(false) }}
            >
              {collapsed ? "»" : "« Collapse"}
            </button>
          )}
          <button className="pressable"
            onClick={() => {
              logout();
              router.replace("/login");
            }}
            title={railCollapsed ? "Sign out" : undefined}
            style={navBtn(true)}
          >
            {railCollapsed ? "⏻" : "Sign out"}
          </button>
        </div>
      </aside>

      {/* ---- main ----
          The admin console is its own shell, and it keeps its own 16px mobile
          gutter — it is a desktop-first tool at maxWidth 1280, not the athlete
          app's 12. But it must PUBLISH that gutter the way the app shell does:
          a shared component with a full-bleed rail resolves --page-pad-x from
          whatever shell it lands in, and an unset variable sent it to the
          fallback instead of to the padding actually in force here. */}
      <main style={{ flex: 1, minWidth: 0, padding: isMobile ? "16px 16px 40px" : "24px 32px", maxWidth: 1280, margin: "0 auto", width: "100%", position: "relative", zIndex: 1, ...({ "--page-pad-x": isMobile ? "16px" : "32px", "--page-pad-top": isMobile ? "16px" : "24px" } as Record<string, string>) }}>
        {/* mobile top bar — hamburger opens the drawer */}
        {isMobile && (
          <div style={{ display: "flex", alignItems: "center", gap: space.md, marginBottom: 16 }}>
            <button className="pressable"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open admin menu"
              style={{
                width: 40,
                height: 40,
                flexShrink: 0,
                display: "grid",
                placeItems: "center",
                borderRadius: navRadius,
                border: `1px solid ${LINE}`,
                background: INK2,
                color: CHALK,
                fontSize: fs.title,
                cursor: "pointer",
              }}
            >
              ☰
            </button>
            <div style={{ ...disp, fontWeight: 900, fontSize: fs.title, letterSpacing: "-.03em" }}>
              HYBRID<span style={{ color: txt(AMBER) }}>.</span>
            </div>
          </div>
        )}

        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: space.md, marginBottom: 24, flexWrap: "wrap" }}>
          <div>
            <Mono s={{ fontSize: fs.micro, letterSpacing: ".12em", textTransform: "uppercase" }} c={AMBER}>
              admin.hybrid.app
            </Mono>
            <h1 style={{ ...disp, fontWeight: 900, fontSize: isMobile ? 24 : 30, letterSpacing: "-.03em", marginTop: 2 }}>
              {active.label}
            </h1>
          </div>
          {!isMobile && (
            <div
              style={{
                ...mono,
                fontSize: fs.micro,
                color: txt(ASH),
                border: `1px solid ${LINE}`,
                borderRadius: 999,
                padding: "6px 12px",
                background: CARD,
              }}
            >
              Restricted – admin only
            </div>
          )}
        </header>

        {section === "overview" && <AdminOverview />}
        {section === "users" && <AdminUsers />}
        {section === "directory" && <AdminDirectory />}
        {section === "moderation" && <AdminModeration />}
        {section === "financials" && <AdminFinancials />}
        {section === "email" && <AdminEmail />}
        {section === "hq" && <AgentHQ />}
        {section === "agents" && <AdminAgents />}
        {section === "engine" && <EngineRoom />}
        {section === "announcements" && <AdminAnnouncements />}
        {section === "onboarding" && <AdminOnboarding />}
        {section === "exercises" && <AdminExercises />}
        {section === "media" && <AdminMedia />}
        {section === "translations" && <AdminTranslations />}
        {section === "flags" && <AdminFlags />}
        {section === "content" && <AdminContent />}
        {section === "access" && <><CoachApplications /><AdminAccess /></>}
        {section === "security" && <AdminSecurity />}
        {section === "audit" && <AdminAuditLog />}
        {section === "system" && <AdminSystem />}
        {section === "guidance" && <AdminGuidance />}
      </main>
    </div>
  );

  function navBtn(danger: boolean) {
    return {
      width: "100%",
      marginTop: 6,
      ...cond,
      fontSize: fs.caption,
      fontWeight: 700,
      textTransform: "uppercase" as const,
      letterSpacing: ".08em",
      color: txt(danger ? ASH : CHALK),
      background: danger ? "transparent" : INK2,
      border: `1px solid ${LINE}`,
      borderRadius: navRadius,
      padding: "8px 0",
      cursor: "pointer",
    };
  }
}
