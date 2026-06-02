"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, type Role } from "@/lib/session";
import {
  INK2,
  LINE,
  LIME,
  CHALK,
  ASH,
  VIOLET,
  AMBER,
  disp,
  cond,
  mono,
  Mono,
  Card,
} from "@/lib/ui";
import {
  AthleteAnalytics,
  CoachAnalytics,
  OperatorAnalytics,
  DashboardMirror,
  PeriodizeScreen,
  HistoryScreen,
  RolesScreen,
} from "./screens";
import Logger from "./logger";
import PlansScreen from "./plans";
import SportScreen from "./sports";
import CoachScreen from "./coach";
import CapabilitiesScreen from "./capabilities";
import { useSessions } from "@/lib/use-sessions";
import { useMacrocycle } from "@/lib/use-macrocycle";
import { useRoster } from "@/lib/use-roster";
import { useLang } from "@/lib/i18n";

const NAV: [string, string, string][] = [
  ["dashboard", "Dashboard", "◆"],
  ["log", "Log session", "✎"],
  ["analytics", "Analytics", "◷"],
  ["periodize", "Periodize", "◰"],
  ["plans", "Plans", "▤"],
  ["sport", "Sport", "◎"],
  ["history", "History", "≣"],
  ["coach", "Coach", "✦"],
  ["roles", "Roles & access", "⚿"],
  ["capabilities", "Capabilities", "⊞"],
];

type Scope = "athlete" | "coach" | "operator";

// A role only sees the dashboards it's authorized for. Admin is the god view —
// it can toggle all three. Client and Coach are locked to their own.
const SCOPES_FOR: Record<Role, Scope[]> = {
  client: ["athlete"],
  coach: ["coach"],
  admin: ["athlete", "coach", "operator"],
};

export default function AppShell() {
  const router = useRouter();
  const { session, ready, logout } = useSession();
  const { sessions, refresh } = useSessions();
  const { macro, refresh: refreshMacro } = useMacrocycle();
  const { roster } = useRoster();
  const { lang, setLang, t } = useLang();
  const [screen, setScreen] = useState("analytics");

  const allowedScopes = useMemo<Scope[]>(
    () => (session ? SCOPES_FOR[session.role] : ["athlete"]),
    [session],
  );
  const [scope, setScope] = useState<Scope>("athlete");

  // Land an admin straight on the operator (admin) dashboard.
  useEffect(() => {
    if (session) setScope(allowedScopes[allowedScopes.length - 1]!);
  }, [session, allowedScopes]);

  // Auth guard — bounce to /login when there's no session.
  useEffect(() => {
    if (ready && !session) router.replace("/login");
  }, [ready, session, router]);

  if (!ready || !session) return null;

  const initial = session.name.charAt(0).toUpperCase();

  return (
    <div
      style={{
        ...disp,
        background: "#0c0d0c",
        color: CHALK,
        minHeight: "100vh",
        display: "flex",
      }}
    >
      {/* sidebar */}
      <aside
        style={{
          width: 240,
          borderRight: `1px solid ${LINE}`,
          padding: "24px 16px",
          position: "sticky",
          top: 0,
          height: "100vh",
          flexShrink: 0,
        }}
      >
        <div style={{ ...disp, fontWeight: 900, fontSize: 22, letterSpacing: "-.04em", padding: "0 8px 24px" }}>
          HYBRID<span style={{ color: LIME }}>.</span>
        </div>
        {NAV.filter(([id]) => id !== "capabilities" || session.role === "admin").map(([id, l, ic]) => (
          <button
            key={id}
            onClick={() => setScreen(id)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "11px 12px",
              marginBottom: 4,
              borderRadius: 10,
              cursor: "pointer",
              border: "none",
              background: screen === id ? `${LIME}1a` : "transparent",
              color: screen === id ? LIME : ASH,
              ...disp,
              fontSize: 14,
              fontWeight: 600,
              textAlign: "left",
            }}
          >
            <span style={{ fontSize: 16 }}>{ic}</span>
            {t(`nav.${id}`) === `nav.${id}` ? l : t(`nav.${id}`)}
          </button>
        ))}
        <div style={{ position: "absolute", bottom: 24, left: 16, right: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, background: INK2 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                background: `${LIME}22`,
                border: `1px solid ${LIME}`,
                display: "grid",
                placeItems: "center",
                ...disp,
                fontWeight: 700,
                color: LIME,
                fontSize: 14,
              }}
            >
              {initial}
            </div>
            <div style={{ overflow: "hidden" }}>
              <div style={{ ...disp, fontWeight: 600, fontSize: 13, whiteSpace: "nowrap" }}>
                {session.name}
              </div>
              <Mono s={{ fontSize: 10, textTransform: "uppercase" }} c={ASH}>
                {session.role}
              </Mono>
            </div>
          </div>
          <button
            onClick={() => {
              logout();
              router.replace("/login");
            }}
            style={{
              width: "100%",
              marginTop: 8,
              ...cond,
              fontSize: 12,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: ".05em",
              color: ASH,
              background: "transparent",
              border: `1px solid ${LINE}`,
              borderRadius: 10,
              padding: "8px 0",
              cursor: "pointer",
            }}
          >
            {t("common.signout")}
          </button>
        </div>
      </aside>

      {/* main */}
      <main style={{ flex: 1, padding: "24px 32px", maxWidth: 1180, margin: "0 auto", width: "100%" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <Mono s={{ fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase" }} c={LIME}>
              app.hybrid.app
            </Mono>
            <h1 style={{ ...disp, fontWeight: 900, fontSize: 30, letterSpacing: "-.03em", marginTop: 2, textTransform: "capitalize" }}>
              {screen}
            </h1>
          </div>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as "en" | "pl" | "de")}
            style={{ ...cond, fontSize: 13, fontWeight: 700, background: INK2, color: CHALK, border: `1px solid ${LINE}`, borderRadius: 999, padding: "8px 14px", cursor: "pointer" }}
          >
            <option value="en">EN</option>
            <option value="pl">PL</option>
            <option value="de">DE</option>
          </select>
        </header>

        {screen === "analytics" && (
          <>
            {allowedScopes.length > 1 && (
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {(
                [
                  ["athlete", "Client", LIME],
                  ["coach", "Coach", VIOLET],
                  ["operator", "Admin", AMBER],
                ] as const
              )
                .filter(([id]) => allowedScopes.includes(id))
                .map(([id, l, c]) => (
                  <button
                    key={id}
                    onClick={() => setScope(id)}
                    style={{
                      ...cond,
                      fontSize: 14,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: ".04em",
                      padding: "9px 18px",
                      borderRadius: 10,
                      cursor: "pointer",
                      border: `1px solid ${scope === id ? c : LINE}`,
                      background: scope === id ? c : "transparent",
                      color: scope === id ? "#0c0d0c" : ASH,
                    }}
                  >
                    {l}
                  </button>
                ))}
              </div>
            )}
            {(() => {
              const acc = scope === "operator" ? AMBER : scope === "coach" ? VIOLET : LIME;
              const txt =
                scope === "operator"
                  ? "Operator scope · platform aggregates only — MAU, retention, content. No access to any individual's private training data."
                  : scope === "coach"
                    ? "Coach scope · only athletes who accepted you (mutual consent). Aggregate roster view; private athlete notes excluded."
                    : "Client scope · your own training data only. Nothing here is visible to other athletes.";
              return (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 14px",
                    borderRadius: 10,
                    background: `${acc}12`,
                    border: `1px solid ${acc}40`,
                    marginBottom: 20,
                  }}
                >
                  <span style={{ color: acc, fontSize: 14 }}>
                    {scope === "operator" ? "⚙" : scope === "coach" ? "◆" : "●"}
                  </span>
                  <Mono s={{ fontSize: 12, lineHeight: 1.3 }} c={CHALK}>
                    {txt}
                  </Mono>
                </div>
              );
            })()}
            {scope === "athlete" && <AthleteAnalytics sessions={sessions} />}
            {scope === "coach" && <CoachAnalytics roster={roster} />}
            {scope === "operator" && <OperatorAnalytics />}
          </>
        )}

        {screen === "dashboard" && <DashboardMirror />}

        {screen === "periodize" && <PeriodizeScreen macro={macro} />}

        {screen === "plans" && (
          <PlansScreen
            onEnrolled={() => {
              refreshMacro();
              setScreen("periodize");
            }}
          />
        )}

        {screen === "sport" && <SportScreen />}

        {screen === "log" && (
          <Logger
            sessions={sessions}
            onSaved={() => {
              refresh();
              setScreen("history");
            }}
          />
        )}

        {screen === "history" && <HistoryScreen sessions={sessions} />}

        {screen === "coach" && <CoachScreen />}

        {screen === "roles" && <RolesScreen />}

        {screen === "capabilities" && session.role === "admin" && <CapabilitiesScreen />}

        {screen !== "analytics" &&
          screen !== "dashboard" &&
          screen !== "periodize" &&
          screen !== "plans" &&
          screen !== "sport" &&
          screen !== "log" &&
          screen !== "history" &&
          screen !== "coach" &&
          screen !== "roles" &&
          screen !== "capabilities" && (
          <Card style={{ textAlign: "center", padding: 60 }}>
            <div style={{ ...disp, fontWeight: 800, fontSize: 22 }}>
              {screen[0]!.toUpperCase() + screen.slice(1)}
            </div>
            <Mono s={{ fontSize: 14, display: "block", marginTop: 10 }}>
              Desktop mirror of the mobile {screen} screen — wider, multi-column layout. Wired up in
              a later sprint; the mobile app is the source of truth.
            </Mono>
          </Card>
        )}
      </main>
    </div>
  );
}
