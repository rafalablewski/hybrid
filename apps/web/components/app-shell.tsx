"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  Select,
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
import Connections from "./connections";
import Performance from "./performance";
import Org from "./org";
import VideoScreen from "./video-screen";
import Competition from "./competition";
import Talent from "./talent";
import DataNet from "./datanet";
import Tactical from "./tactical";
import Longevity from "./longevity";
import Velocity from "./velocity";
import TeamCompare from "./team-compare";
import TeamMonitor from "./team-monitor";
import Today from "./today";
import Nutrition from "./nutrition";
import Onboarding from "./onboarding";
import Checkins from "./checkins";
import Calendar from "./calendar";
import Builder from "./builder";
import ForcePlate from "./forceplate";
import Progress from "./progress";
import { useSessions } from "@/lib/use-sessions";
import { useMacrocycle } from "@/lib/use-macrocycle";
import { useRoster } from "@/lib/use-roster";
import { useLang } from "@/lib/i18n";
import { useBiometrics } from "@/lib/use-biometrics";
import { useSignals } from "@/lib/use-signals";

const NAV: [string, string, string][] = [
  ["today", "Today", "➤"],
  ["onboarding", "Get started", "✦"],
  ["dashboard", "Dashboard", "◆"],
  ["performance", "Performance", "◈"],
  ["velocity", "Velocity (VBT)", "⚡"],
  ["forceplate", "Force plate", "◇"],
  ["log", "Log session", "✎"],
  ["nutrition", "Nutrition", "🍎"],
  ["progress", "Progress photos", "📸"],
  ["checkin", "Check-in", "✓"],
  ["calendar", "Calendar", "▦"],
  ["builder", "Builder", "⊕"],
  ["analytics", "Analytics", "◷"],
  ["periodize", "Periodize", "◰"],
  ["competition", "Competition", "▲"],
  ["plans", "Plans", "▤"],
  ["sport", "Sport", "◎"],
  ["video", "Video", "▷"],
  ["history", "History", "≣"],
  ["coach", "Coach", "✦"],
  ["squad", "Squad monitor", "◫"],
  ["teamcompare", "Team compare", "⚖"],
  ["org", "Organization", "⬡"],
  ["talent", "Talent", "✸"],
  ["tactical", "Tactical", "▰"],
  ["longevity", "Longevity", "❤"],
  ["connections", "Connections", "⌁"],
  ["roles", "Roles & access", "⚿"],
  ["datanet", "Data network", "⊟"],
  ["capabilities", "Capabilities", "⊞"],
];

// admin-only screens
const ADMIN_ONLY = new Set(["capabilities", "datanet"]);

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
  const { bio: bioFromBiometrics, refresh: refreshBiometrics } = useBiometrics();
  const { bio: bioFromSignals, refresh: refreshSignals } = useSignals();
  // Prefer the Signal ontology when it has recovery data; fall back to the
  // legacy biometrics path so historical readings still drive the Twin.
  const bio = bioFromSignals ?? bioFromBiometrics;
  const refreshBio = useCallback(() => {
    refreshBiometrics();
    refreshSignals();
  }, [refreshBiometrics, refreshSignals]);
  const [screen, setScreen] = useState("today");

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
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ ...disp, fontWeight: 900, fontSize: 22, letterSpacing: "-.04em", padding: "0 8px 24px", flexShrink: 0 }}>
          HYBRID<span style={{ color: LIME }}>.</span>
        </div>
        <nav style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {NAV.filter(([id]) => !ADMIN_ONLY.has(id) || session.role === "admin").map(([id, l, ic]) => (
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
        </nav>
        <div style={{ flexShrink: 0, paddingTop: 16 }}>
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
              {t(`nav.${screen}`) === `nav.${screen}` ? screen : t(`nav.${screen}`)}
            </h1>
          </div>
          <Select
            value={lang}
            onChange={(e) => setLang(e.target.value as "en" | "pl" | "de")}
            variant="pill"
            style={{ ...cond, fontWeight: 700 }}
          >
            <option value="en">EN</option>
            <option value="pl">PL</option>
            <option value="de">DE</option>
          </Select>
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

        {screen === "dashboard" && (
          <DashboardMirror sessions={sessions} bio={bio} onCheckin={refreshBio} />
        )}

        {screen === "today" && (
          <Today sessions={sessions} bio={bio ?? undefined} onStart={() => setScreen("log")} />
        )}

        {screen === "onboarding" && (
          <Onboarding onEnrolled={() => { refreshMacro(); setScreen("periodize"); }} />
        )}

        {screen === "performance" && <Performance sessions={sessions} bio={bio} />}

        {screen === "velocity" && <Velocity sessions={sessions} />}

        {screen === "forceplate" && <ForcePlate />}

        {screen === "nutrition" && <Nutrition />}

        {screen === "progress" && <Progress />}

        {screen === "checkin" && <Checkins sessions={sessions} />}

        {screen === "calendar" && <Calendar sessions={sessions} />}

        {screen === "builder" && <Builder />}

        {screen === "squad" && <TeamMonitor />}

        {screen === "teamcompare" && <TeamCompare />}

        {screen === "periodize" && <PeriodizeScreen macro={macro} />}

        {screen === "competition" && <Competition />}

        {screen === "plans" && (
          <PlansScreen
            onEnrolled={() => {
              refreshMacro();
              setScreen("periodize");
            }}
          />
        )}

        {screen === "sport" && <SportScreen />}

        {screen === "video" && <VideoScreen />}

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

        {screen === "connections" && <Connections />}

        {screen === "org" && <Org />}

        {screen === "talent" && <Talent />}

        {screen === "tactical" && <Tactical />}

        {screen === "longevity" && <Longevity />}

        {screen === "roles" && <RolesScreen />}

        {screen === "datanet" && session.role === "admin" && <DataNet />}

        {screen === "capabilities" && session.role === "admin" && <CapabilitiesScreen />}
      </main>
    </div>
  );
}
