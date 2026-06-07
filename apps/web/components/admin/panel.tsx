"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { INK, INK2, CARD, LINE, LIME, CHALK, ASH, AMBER, disp, cond, mono, Mono } from "@/lib/ui";
import AdminOverview from "./overview";
import AdminUsers from "./users";
import AdminDirectory from "./directory";
import AdminModeration from "./moderation";
import AdminAnnouncements from "./announcements";
import AdminExercises from "./exercises";
import AdminMedia from "./media";
import AdminTranslations from "./translations";
import AdminFlags from "./flags";
import AdminContent from "./content";
import AdminAuditLog from "./audit";
import AdminSystem from "./system";
import AdminSecurity from "./security";
import AdminFinancials from "./financials";
import AdminAgents from "./agents";
import AgentHQ from "./agent-hq";

type SectionId = "overview" | "users" | "directory" | "moderation" | "financials" | "hq" | "agents" | "announcements" | "exercises" | "media" | "translations" | "flags" | "content" | "security" | "audit" | "system";

const SECTIONS: { id: SectionId; label: string; icon: string; group: string }[] = [
  { id: "overview", label: "Overview", icon: "◆", group: "Platform" },
  { id: "users", label: "Users", icon: "⦿", group: "Platform" },
  { id: "directory", label: "Orgs & coaching", icon: "⬡", group: "Platform" },
  { id: "moderation", label: "Moderation", icon: "⚖", group: "Platform" },
  { id: "financials", label: "Financials", icon: "💰", group: "Business" },
  { id: "hq", label: "Agent HQ", icon: "◳", group: "AI" },
  { id: "agents", label: "AI agents", icon: "🤖", group: "AI" },
  { id: "announcements", label: "Announcements", icon: "📣", group: "Content" },
  { id: "exercises", label: "Exercise library", icon: "🏋", group: "Content" },
  { id: "media", label: "Media library", icon: "🖼", group: "Content" },
  { id: "translations", label: "Localization", icon: "🌐", group: "Content" },
  { id: "flags", label: "Feature flags", icon: "⚑", group: "Content" },
  { id: "content", label: "Capabilities & data", icon: "⊞", group: "Content" },
  { id: "security", label: "Security", icon: "🛡", group: "Governance" },
  { id: "audit", label: "Audit log", icon: "❑", group: "Governance" },
  { id: "system", label: "System", icon: "⚙", group: "Governance" },
];

export default function AdminPanel() {
  const router = useRouter();
  const { session, logout } = useSession();
  const [section, setSection] = useState<SectionId>("overview");

  const active = SECTIONS.find((s) => s.id === section)!;
  const groups = [...new Set(SECTIONS.map((s) => s.group))];

  return (
    <div style={{ ...disp, background: INK, color: CHALK, minHeight: "100vh", display: "flex" }}>
      {/* ---- sidebar ---- */}
      <aside
        style={{
          width: 250,
          background: "#0a0b0a",
          borderRight: `1px solid ${LINE}`,
          padding: "22px 14px",
          position: "sticky",
          top: 0,
          height: "100vh",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: "0 8px 4px" }}>
          <div style={{ ...disp, fontWeight: 900, fontSize: 21, letterSpacing: "-.04em" }}>
            HYBRID<span style={{ color: AMBER }}>.</span>
          </div>
          <Mono s={{ fontSize: 10, letterSpacing: ".18em", textTransform: "uppercase" }} c={AMBER}>
            Admin console
          </Mono>
        </div>

        <nav style={{ flex: 1, overflowY: "auto", minHeight: 0, marginTop: 22 }}>
          {groups.map((g) => (
            <div key={g} style={{ marginBottom: 16 }}>
              <Mono
                s={{ fontSize: 9, letterSpacing: ".16em", textTransform: "uppercase", padding: "0 10px", display: "block", marginBottom: 6 }}
                c={ASH}
              >
                {g}
              </Mono>
              {SECTIONS.filter((s) => s.group === g).map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 11,
                    padding: "9px 11px",
                    marginBottom: 2,
                    borderRadius: 9,
                    cursor: "pointer",
                    border: "none",
                    background: section === s.id ? `${AMBER}1c` : "transparent",
                    color: section === s.id ? AMBER : ASH,
                    ...disp,
                    fontSize: 14,
                    fontWeight: 600,
                    textAlign: "left",
                  }}
                >
                  <span style={{ fontSize: 14, width: 16, textAlign: "center" }}>{s.icon}</span>
                  {s.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div style={{ flexShrink: 0, paddingTop: 14, borderTop: `1px solid ${LINE}` }}>
          <div style={{ padding: "8px 10px" }}>
            <div style={{ ...disp, fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {session?.name ?? "—"}
            </div>
            <Mono s={{ fontSize: 10, textTransform: "uppercase" }} c={AMBER}>
              {session?.role ?? "admin"}
            </Mono>
          </div>
          <button
            onClick={() => router.push("/app")}
            style={navBtn(false)}
          >
            ← Back to app
          </button>
          <button
            onClick={() => {
              logout();
              router.replace("/login");
            }}
            style={navBtn(true)}
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ---- main ---- */}
      <main style={{ flex: 1, minWidth: 0, padding: "24px 32px", maxWidth: 1280, margin: "0 auto", width: "100%" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <Mono s={{ fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase" }} c={AMBER}>
              admin.hybrid.app
            </Mono>
            <h1 style={{ ...disp, fontWeight: 900, fontSize: 30, letterSpacing: "-.03em", marginTop: 2 }}>
              {active.label}
            </h1>
          </div>
          <div
            style={{
              ...mono,
              fontSize: 11,
              color: ASH,
              border: `1px solid ${LINE}`,
              borderRadius: 999,
              padding: "6px 12px",
              background: CARD,
            }}
          >
            Restricted · admin only
          </div>
        </header>

        {section === "overview" && <AdminOverview />}
        {section === "users" && <AdminUsers />}
        {section === "directory" && <AdminDirectory />}
        {section === "moderation" && <AdminModeration />}
        {section === "financials" && <AdminFinancials />}
        {section === "hq" && <AgentHQ />}
        {section === "agents" && <AdminAgents />}
        {section === "announcements" && <AdminAnnouncements />}
        {section === "exercises" && <AdminExercises />}
        {section === "media" && <AdminMedia />}
        {section === "translations" && <AdminTranslations />}
        {section === "flags" && <AdminFlags />}
        {section === "content" && <AdminContent />}
        {section === "security" && <AdminSecurity />}
        {section === "audit" && <AdminAuditLog />}
        {section === "system" && <AdminSystem />}
      </main>
    </div>
  );

  function navBtn(danger: boolean) {
    return {
      width: "100%",
      marginTop: 6,
      ...cond,
      fontSize: 12,
      fontWeight: 700,
      textTransform: "uppercase" as const,
      letterSpacing: ".05em",
      color: danger ? ASH : CHALK,
      background: danger ? "transparent" : INK2,
      border: `1px solid ${LINE}`,
      borderRadius: 9,
      padding: "8px 0",
      cursor: "pointer",
    };
  }
}
