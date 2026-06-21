"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { groupedNav, navForPersona, sanitizePersonaAccess, AURORA_NAV_ICONS, FUNNEL, type Persona, type PersonaAccess, type SessionBlock } from "@hybrid/core";
import { AuroraIcon } from "./aurora/icons";
import { useSession, type Role } from "@/lib/session";
import { usePersona } from "@/lib/persona";
import { track } from "@/lib/track";
import { fs, space,
  INK,
  INK2,
  LINE,
  LIME,
  CHALK,
  ASH,
  VIOLET,
  AMBER,
  LIME_T,
  ON_ACCENT,
  txt,
  disp,
  cond,
  mono,
  Mono,
  Card,
  Select,
  GlassField,
} from "@/lib/ui";
import { useCollapsible } from "@/lib/use-collapsible";
import { useIsMobile } from "@/lib/use-media-query";
import {
  AthleteAnalytics,
  CoachAnalytics,
  OperatorAnalytics,
  PeriodizeScreen,
  HistoryScreen,
} from "./screens";
import AuroraHistory from "./aurora/history";
import Logger from "./logger";
import PlansScreen from "./plans";
import AuroraPlans from "./aurora/plans";
import AuroraSport from "./aurora/sport";
import AuroraCompetition from "./aurora/competition";
import AuroraPeriodize from "./aurora/periodize";
import AuroraBuilder from "./aurora/builder";
import AuroraLogger from "./aurora/logger";
import RunTrack from "./run-track";
import AuroraRunTrack from "./aurora/run-track";
import AuroraCoach from "./aurora/coach";
import AuroraUpgrade from "./aurora/upgrade";
import AuroraOrg from "./aurora/org";
import { AuroraAthleteAnalytics, AuroraCoachAnalytics, AuroraOperatorAnalytics } from "./aurora/analytics";
import AuroraTalent from "./aurora/talent";
import AuroraTactical from "./aurora/tactical";
import AuroraTeamCompare from "./aurora/team-compare";
import AuroraTeamMonitor from "./aurora/team-monitor";
import SportScreen from "./sports";
import CoachScreen from "./coach";
import Connections from "./connections";
import AuroraConnections from "./aurora/connections";
import Performance from "./performance";
import AuroraPerformance from "./aurora/performance";
import Org from "./org";
import VideoScreen from "./video-screen";
import AuroraVideo from "./aurora/video";
import Competition from "./competition";
import Talent from "./talent";
import Tactical from "./tactical";
import Longevity from "./longevity";
import AuroraLongevity from "./aurora/longevity";
import Velocity from "./velocity";
import AuroraVelocity from "./aurora/velocity";
import Running from "./running";
import AuroraRunning from "./aurora/running";
import Volume from "./volume";
import AuroraVolume from "./aurora/volume";
import Exercises from "./exercises";
import AuroraExercises from "./aurora/exercises";
import Trends from "./trends";
import AuroraTrends from "./aurora/trends";
import TeamCompare from "./team-compare";
import TeamMonitor from "./team-monitor";
import Today from "./today";
import AuroraToday from "./aurora/today";
import AuroraProfile from "./aurora/profile";
import AuroraPillNav from "./aurora/pill-nav";
import { useTemplate } from "@/lib/use-template";
import Cockpit from "./cockpit";
import AuroraCockpit from "./aurora/cockpit";
import Nutrition from "./nutrition";
import AuroraNutrition from "./aurora/nutrition";
import Onboarding from "./onboarding";
import AuroraOnboarding from "./aurora/onboarding";
import Upgrade from "./upgrade";
import Checkins from "./checkins";
import AuroraCheckins from "./aurora/checkins";
import Calendar from "./calendar";
import AuroraCalendar from "./aurora/calendar";
import Builder from "./builder";
import ForcePlate from "./forceplate";
import AuroraForcePlate from "./aurora/forceplate";
import Progress from "./progress";
import AuroraProgress from "./aurora/progress";
import AccountSettings from "./account-settings";
import IntervalTimerScreen from "./interval-timer";
import NotificationsScreen from "./notifications";
import StatisticsScreen from "./statistics";
import AnnouncementBanner from "./announcement-banner";
import CoachInviteBanner from "./coach-invite-banner";
import { useTheme } from "@/lib/use-theme";
import { useFlags } from "@/lib/use-flags";
import { useSessions } from "@/lib/use-sessions";
import { useMacrocycle } from "@/lib/use-macrocycle";
import { useRoster } from "@/lib/use-roster";
import { useLang } from "@/lib/i18n";
import { useBiometrics } from "@/lib/use-biometrics";
import { useSignals } from "@/lib/use-signals";

// Sidebar nav comes from the shared canonical map (@hybrid/core `groupedNav`),
// so web + mobile can't drift. Items stay gated per-item by the nav.<id> feature
// flag; a group with no enabled items is hidden entirely. Group labels are i18n
// keys (nav.group.*); item labels are i18n (nav.<id>) with the core fallback.
// Operator-only tools (Capabilities, Data network) live in the /admin console.

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
  const { macro, currentWeek, planId, refresh: refreshMacro } = useMacrocycle();
  const { roster } = useRoster();
  const { lang, setLang, t } = useLang();
  const { bio: bioFromBiometrics } = useBiometrics();
  const { bio: bioFromSignals } = useSignals();
  // Runtime feature flags — gate nav items + the announcement banner. Fail-open
  // (isEnabled returns true until loaded), so a flag hiccup never hides defaults.
  const { isEnabled, value } = useFlags();
  // Persona shapes the nav surface (casual ⊂ athlete ⊂ coach ⊂ admin); items are
  // still additionally gated by their feature flag. The admin can override which
  // persona sees each item (Access control → the access.personaNav flag value).
  const persona = usePersona();
  const navAccess = sanitizePersonaAccess(value("access.personaNav"));
  // Freemium funnel: a casual (free) user keeps a CLEAN nav (no scattered
  // padlocks). The whole paid toolkit is sold on ONE "Unlock Full" page reached
  // from a single pinned entry — so the upgrade's full value is clear without
  // cluttering the lean app. Shown only to the casual persona.
  const showUpgradeEntry = persona === "casual";
  const { theme, toggle } = useTheme();
  const aurora = useTemplate().template === "aurora";
  const { collapsed, toggle: toggleCollapsed } = useCollapsible("hybrid-sidebar");
  // On phones/tablets the fixed sidebar becomes an off-canvas drawer (hamburger
  // + scrim); on desktop it stays the sticky collapsible rail. Mirrors the admin
  // console shell (components/admin/panel.tsx).
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const railCollapsed = collapsed && !isMobile;
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
  // Prefer the Signal ontology when it has recovery data; fall back to the
  // legacy biometrics path so historical readings still drive the Twin.
  const bio = bioFromSignals ?? bioFromBiometrics;
  const [screen, setScreen] = useState("today");
  // Seed blocks for the logger when "Start" comes from an enrolled named plan
  // (the plan day prefills the session). Cleared on any manual nav so a normal
  // Log entry starts empty.
  const [pendingBlocks, setPendingBlocks] = useState<SessionBlock[] | undefined>(undefined);
  // When the Trends hub opens a specific lift, focus it on the Exercises screen.
  const [exerciseFocus, setExerciseFocus] = useState("");
  const openExercise = (name: string) => { setExerciseFocus(name); setScreen("exercises"); };

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

  // Pick the LANDING screen once, in priority order: a client who hasn't
  // onboarded → the questionnaire (persona/goal/prefs → enroll); otherwise a
  // coach persona (role OR self-serve opt-in) lands on their Coach screen
  // (roster + invite); everyone else keeps the default Today.
  //
  // Onboarding now gates on the server-side `onboardedAt` (from /api/me) rather
  // than a fragile localStorage flag set only at signup — so it reliably appears
  // once and survives the email-confirm round-trip and device changes. A local
  // "done" flag is the same-device fallback before sql-onboarding.sql is applied.
  const landed = useRef(false);
  useEffect(() => {
    if (!ready || !session || landed.current) return;
    landed.current = true;
    let localDone = false;
    try {
      localStorage.removeItem("hybrid.pendingOnboarding"); // retire the old flag
      localDone = localStorage.getItem("hybrid.onboarded") === "1";
    } catch {
      /* ignore */
    }
    if (session.role === "client" && !session.onboardedAt && !localDone) {
      setScreen("onboarding");
      return;
    }
    if (persona === "coach") setScreen("coach");
  }, [ready, session, persona]);

  // Mark onboarding finished (same-device fallback flag) + advance to Today.
  const finishOnboarding = () => {
    try { localStorage.setItem("hybrid.onboarded", "1"); } catch { /* ignore */ }
    refreshMacro();
    setScreen("today");
  };

  if (!ready || !session) return null;

  const initial = session.name.charAt(0).toUpperCase();

  return (
    <div
      style={{
        ...disp,
        background: INK,
        color: CHALK,
        minHeight: "100vh",
        display: "flex",
        position: "relative",
      }}
    >
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

      {/* sidebar — sticky rail on desktop, off-canvas drawer on mobile */}
      <aside
        className="lg-sidebar"
        style={
          isMobile
            ? {
                width: 256,
                maxWidth: "85vw",
                borderRight: `1px solid ${LINE}`,
                padding: "24px 16px",
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
                width: railCollapsed ? 72 : 240,
                borderRight: `1px solid ${LINE}`,
                padding: railCollapsed ? "24px 10px" : "24px 16px",
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
        {/* brand */}
        <div
          style={{
            ...disp,
            fontWeight: 900,
            fontSize: 22,
            letterSpacing: "-.04em",
            padding: railCollapsed ? "0 0 22px" : "0 4px 22px",
            textAlign: railCollapsed ? "center" : "left",
            flexShrink: 0,
          }}
        >
          {railCollapsed ? "H" : "HYBRID"}
          <span style={{ color: LIME_T }}>.</span>
        </div>
        <nav style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {groupedNav(navForPersona(persona, undefined, navAccess)).map(({ group, items }) => {
            const visible = items.filter((it) => isEnabled(`nav.${it.id}`));
            if (visible.length === 0) return null;
            return (
              <div key={group} style={{ marginBottom: 14 }}>
                {!railCollapsed && (
                  <Mono
                    s={{ fontSize: 9, letterSpacing: ".16em", textTransform: "uppercase", padding: "0 12px", display: "block", marginBottom: 6 }}
                    c={ASH}
                  >
                    {t(`nav.group.${group}`) === `nav.group.${group}` ? group : t(`nav.group.${group}`)}
                  </Mono>
                )}
                {visible.map(({ id, label: fallback, icon: ic }) => {
                  const label = t(`nav.${id}`) === `nav.${id}` ? fallback : t(`nav.${id}`);
                  // Aurora: use the uploaded design-kit line icon where one maps;
                  // fitness-specific items (no kit glyph) keep their unicode glyph.
                  const auroraIcon = aurora ? AURORA_NAV_ICONS[id] : undefined;
                  return (
                    <button
                      key={id}
                      onClick={() => { setPendingBlocks(undefined); setScreen(id); setDrawerOpen(false); }}
                      title={railCollapsed ? label : undefined}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: railCollapsed ? "center" : "flex-start",
                        gap: railCollapsed ? 0 : 12,
                        padding: railCollapsed ? "10px 0" : "10px 12px",
                        marginBottom: 2,
                        borderRadius: 10,
                        cursor: "pointer",
                        border: "none",
                        background: screen === id ? `${LIME}1a` : "transparent",
                        color: txt(screen === id ? LIME : ASH),
                        ...disp,
                        fontSize: fs.bodyLg,
                        fontWeight: 600,
                        textAlign: "left",
                      }}
                    >
                      <span style={{ fontSize: fs.subtitle, display: "grid", placeItems: "center", width: 18, height: 18 }}>
                        {auroraIcon ? <AuroraIcon name={auroraIcon} size={18} strokeWidth={2.6} /> : ic}
                      </span>
                      {!railCollapsed && label}
                    </button>
                  );
                })}
              </div>
            );
          })}

          {/* ONE upgrade entry — value-labeled, not a feature tab. Casual only;
              opens the single Full bundle page. Keeps the nav clean (no locks). */}
          {showUpgradeEntry && isEnabled("nav.upgrade") && (
            <button
              onClick={() => { track(FUNNEL.upgradeEntryClick, { client: "web", source: "sidebar" }); setPendingBlocks(undefined); setScreen("upgrade"); setDrawerOpen(false); }}
              title={railCollapsed ? "Unlock Full" : undefined}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: railCollapsed ? "center" : "flex-start",
                gap: railCollapsed ? 0 : 11,
                padding: railCollapsed ? "12px 0" : "12px",
                marginTop: 8,
                borderRadius: 12,
                cursor: "pointer",
                border: `1px solid ${LIME}80`,
                background: `linear-gradient(135deg, ${LIME}24, ${VIOLET}1a)`,
                color: txt(CHALK),
                textAlign: "left",
              }}
            >
              <span style={{ fontSize: fs.subtitle }}>✦</span>
              {!railCollapsed && (
                <span style={{ flex: 1 }}>
                  <span style={{ ...disp, fontWeight: 800, fontSize: fs.bodyLg, display: "block" }}>Unlock Full</span>
                  <Mono s={{ fontSize: 10.5, lineHeight: 1.4 }} c={ASH}>Plans, analytics, your Twin, the Cockpit &amp; 12+ tools.</Mono>
                </span>
              )}
            </button>
          )}
        </nav>
        <div style={{ flexShrink: 0, paddingTop: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: railCollapsed ? "center" : "flex-start",
              gap: space.ms,
              padding: railCollapsed ? "8px 0" : "10px 12px",
              borderRadius: 10,
              background: railCollapsed ? "transparent" : INK2,
            }}
          >
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
                color: LIME_T,
                fontSize: fs.bodyLg,
                flexShrink: 0,
              }}
              title={railCollapsed ? `${session.name} · ${session.role}` : undefined}
            >
              {initial}
            </div>
            {!railCollapsed && (
              <div style={{ overflow: "hidden" }}>
                <div style={{ ...disp, fontWeight: 600, fontSize: fs.body, whiteSpace: "nowrap" }}>
                  {session.name}
                </div>
                <Mono s={{ fontSize: fs.nano, textTransform: "uppercase" }} c={ASH}>
                  {session.role}
                </Mono>
              </div>
            )}
          </div>
          {session.role === "admin" && (
            <button
              onClick={() => { setDrawerOpen(false); router.push("/admin"); }}
              title={railCollapsed ? "Admin console" : undefined}
              style={{
                width: "100%",
                marginTop: 8,
                ...cond,
                fontSize: fs.caption,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: ".05em",
                color: ON_ACCENT,
                background: AMBER,
                border: `1px solid ${AMBER}`,
                borderRadius: 10,
                padding: "8px 0",
                cursor: "pointer",
              }}
            >
              {railCollapsed ? "⬡" : "Admin console ↗"}
            </button>
          )}
          {!isMobile && (
            <button
              onClick={toggleCollapsed}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              style={{
                width: "100%",
                marginTop: 8,
                ...cond,
                fontSize: fs.caption,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: ".05em",
                color: txt(ASH),
                background: INK2,
                border: `1px solid ${LINE}`,
                borderRadius: 10,
                padding: "8px 0",
                cursor: "pointer",
              }}
            >
              {collapsed ? "»" : "« Collapse"}
            </button>
          )}
          <button
            onClick={() => {
              logout();
              router.replace("/login");
            }}
            title={railCollapsed ? t("common.signout") : undefined}
            style={{
              width: "100%",
              marginTop: 8,
              ...cond,
              fontSize: fs.caption,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: ".05em",
              color: txt(ASH),
              background: "transparent",
              border: `1px solid ${LINE}`,
              borderRadius: 10,
              padding: "8px 0",
              cursor: "pointer",
            }}
          >
            {railCollapsed ? "⏻" : t("common.signout")}
          </button>
        </div>
      </aside>

      {/* main — extra bottom room in Aurora so the floating pill nav never overlaps */}
      <main style={{ flex: 1, padding: isMobile ? (aurora ? "16px 16px 120px" : "16px 16px 40px") : (aurora ? "24px 32px 120px" : "24px 32px"), maxWidth: 1180, margin: "0 auto", width: "100%", position: "relative", zIndex: 1 }}>
        {isEnabled("app.announcements") && <AnnouncementBanner />}
        <CoachInviteBanner />
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: space.md, marginBottom: 24, flexWrap: "wrap" }}>
          {/* Classic shows the app kicker + screen title here. Aurora screens
              render their own bespoke header, so we drop this to avoid a doubled
              page title — but keep the theme/lang controls (right). On mobile a
              hamburger opens the nav drawer. */}
          <div style={{ display: "flex", alignItems: "center", gap: space.md, minWidth: 0 }}>
            {isMobile && (
              <button
                onClick={() => setDrawerOpen(true)}
                aria-label="Open menu"
                style={{ width: 40, height: 40, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: 10, border: `1px solid ${LINE}`, background: INK2, color: CHALK, fontSize: fs.title, cursor: "pointer" }}
              >
                ☰
              </button>
            )}
            {aurora ? <div /> : (
            <div style={{ minWidth: 0 }}>
              <Mono s={{ fontSize: fs.caption, letterSpacing: ".1em", textTransform: "uppercase" }} c={LIME}>
                app.hybrid.app
              </Mono>
              <h1 style={{ ...disp, fontWeight: 900, fontSize: isMobile ? 22 : 30, letterSpacing: "-.03em", marginTop: 2, textTransform: "capitalize" }}>
                {t(`nav.${screen}`) === `nav.${screen}` ? screen : t(`nav.${screen}`)}
              </h1>
            </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: space.sm }}>
            <button
              onClick={toggle}
              title="Toggle theme"
              aria-label="Toggle light/dark theme"
              style={{
                ...cond,
                fontWeight: 700,
                fontSize: fs.body,
                textTransform: "uppercase",
                letterSpacing: ".04em",
                color: CHALK,
                background: INK2,
                border: `1px solid ${LINE}`,
                borderRadius: 999,
                padding: "8px 14px",
                cursor: "pointer",
              }}
            >
              {theme === "dark" ? "◐ Light" : "◑ Dark"}
            </button>
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
          </div>
        </header>

        {/* Keyed wrapper → a fresh fade/rise entrance each time the screen
            changes (Aurora only). The banners/header above stay put. */}
        <div key={screen} className={aurora ? "aurora-enter" : undefined}>
        {screen === "analytics" && (
          <>
            {allowedScopes.length > 1 && (
              <div style={{ display: "flex", gap: space.sm, marginBottom: 12 }}>
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
                      fontSize: fs.bodyLg,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: ".04em",
                      padding: "9px 18px",
                      borderRadius: aurora ? 999 : 10,
                      cursor: "pointer",
                      border: `1px solid ${scope === id ? c : LINE}`,
                      background: scope === id ? c : "transparent",
                      color: scope === id ? ON_ACCENT : ASH,
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
                    gap: space.ms,
                    padding: "10px 14px",
                    borderRadius: aurora ? 18 : 10,
                    background: `${acc}12`,
                    border: `1px solid ${acc}40`,
                    marginBottom: 20,
                  }}
                >
                  <span style={{ color: acc, fontSize: fs.bodyLg }}>
                    {scope === "operator" ? "⚙" : scope === "coach" ? "◆" : "●"}
                  </span>
                  <Mono s={{ fontSize: fs.caption, lineHeight: 1.3 }} c={CHALK}>
                    {txt}
                  </Mono>
                </div>
              );
            })()}
            {scope === "athlete" && (aurora ? <AuroraAthleteAnalytics sessions={sessions} /> : <AthleteAnalytics sessions={sessions} />)}
            {scope === "coach" && (aurora ? <AuroraCoachAnalytics roster={roster} /> : <CoachAnalytics roster={roster} />)}
            {scope === "operator" && (aurora ? <AuroraOperatorAnalytics /> : <OperatorAnalytics />)}
          </>
        )}

        {screen === "today" && (
          aurora ? (
            <AuroraToday sessions={sessions} bio={bio ?? undefined} macro={macro} currentWeek={currentWeek} planId={planId} onStart={(planBlocks) => { setPendingBlocks(planBlocks); setScreen("log"); }} onNavigate={(s) => { setPendingBlocks(undefined); setScreen(s); }} />
          ) : (
            <Today sessions={sessions} bio={bio ?? undefined} macro={macro} currentWeek={currentWeek} planId={planId} onStart={(planBlocks) => { setPendingBlocks(planBlocks); setScreen("log"); }} onNavigate={(s) => { setPendingBlocks(undefined); setScreen(s); }} />
          )
        )}

        {screen === "profile" && (
          <AuroraProfile
            sessions={sessions}
            bio={bio ?? undefined}
            macro={macro}
            currentWeek={currentWeek}
            onNavigate={(s) => { setPendingBlocks(undefined); setScreen(s); }}
          />
        )}

        {screen === "upgrade" && (aurora ? <AuroraUpgrade onUpgraded={() => setScreen("today")} /> : <Upgrade onUpgraded={() => setScreen("today")} />)}

        {screen === "cockpit" && (
          aurora
            ? <AuroraCockpit sessions={sessions} bio={bio ?? undefined} macro={macro} currentWeek={currentWeek} setScreen={setScreen} onEnrolled={() => { refreshMacro(); setScreen("today"); }} />
            : <Cockpit sessions={sessions} bio={bio ?? undefined} macro={macro} currentWeek={currentWeek} setScreen={setScreen} onEnrolled={() => { refreshMacro(); setScreen("today"); }} />
        )}

        {screen === "onboarding" && (
          aurora
            ? <AuroraOnboarding onEnrolled={finishOnboarding} />
            : <Onboarding onEnrolled={finishOnboarding} />
        )}

        {screen === "performance" && (aurora ? <AuroraPerformance sessions={sessions} bio={bio} /> : <Performance sessions={sessions} bio={bio} />)}

        {screen === "velocity" && (aurora ? <AuroraVelocity sessions={sessions} /> : <Velocity sessions={sessions} />)}

        {screen === "running" && (aurora ? <AuroraRunning sessions={sessions} /> : <Running sessions={sessions} />)}

        {screen === "volume" && (aurora ? <AuroraVolume sessions={sessions} /> : <Volume sessions={sessions} />)}

        {screen === "exercises" && (aurora ? <AuroraExercises sessions={sessions} focus={exerciseFocus} /> : <Exercises sessions={sessions} focus={exerciseFocus} />)}

        {screen === "trends" && (aurora ? <AuroraTrends sessions={sessions} onOpenExercise={openExercise} onOpenVolume={() => setScreen("volume")} /> : <Trends sessions={sessions} onOpenExercise={openExercise} onOpenVolume={() => setScreen("volume")} />)}

        {screen === "forceplate" && (aurora ? <AuroraForcePlate /> : <ForcePlate />)}

        {screen === "nutrition" && (aurora ? <AuroraNutrition /> : <Nutrition />)}

        {screen === "progress" && (aurora ? <AuroraProgress /> : <Progress />)}

        {screen === "checkin" && (aurora ? <AuroraCheckins sessions={sessions} /> : <Checkins sessions={sessions} />)}

        {screen === "calendar" && (aurora ? <AuroraCalendar sessions={sessions} /> : <Calendar sessions={sessions} />)}

        {screen === "builder" && (aurora ? <AuroraBuilder /> : <Builder />)}

        {screen === "squad" && (aurora ? <AuroraTeamMonitor /> : <TeamMonitor />)}

        {screen === "teamcompare" && (aurora ? <AuroraTeamCompare /> : <TeamCompare />)}

        {screen === "periodize" && (aurora ? <AuroraPeriodize macro={macro} currentWeek={currentWeek} sessions={sessions} bio={bio ?? undefined} /> : <PeriodizeScreen macro={macro} currentWeek={currentWeek} sessions={sessions} bio={bio ?? undefined} />)}

        {screen === "competition" && (aurora ? <AuroraCompetition /> : <Competition />)}

        {screen === "plans" &&
          (aurora ? (
            <AuroraPlans
              onEnrolled={() => {
                refreshMacro();
                setScreen("periodize");
              }}
            />
          ) : (
            <PlansScreen
              onEnrolled={() => {
                refreshMacro();
                setScreen("periodize");
              }}
            />
          ))}

        {screen === "sport" && (aurora ? <AuroraSport /> : <SportScreen />)}

        {screen === "runtrack" && (aurora ? <AuroraRunTrack onSaved={refresh} /> : <RunTrack onSaved={refresh} />)}

        {screen === "video" && (aurora ? <AuroraVideo /> : <VideoScreen />)}

        {screen === "log" &&
          (aurora ? (
            <AuroraLogger
              sessions={sessions}
              initialBlocks={pendingBlocks}
              onSaved={() => {
                setPendingBlocks(undefined);
                refresh();
                setScreen("history");
              }}
            />
          ) : (
            <Logger
              sessions={sessions}
              initialBlocks={pendingBlocks}
              onSaved={() => {
                setPendingBlocks(undefined);
                refresh();
                setScreen("history");
              }}
            />
          ))}

        {screen === "history" && (aurora ? <AuroraHistory sessions={sessions} onOpenExercise={openExercise} onChanged={refresh} /> : <HistoryScreen sessions={sessions} onOpenExercise={openExercise} onChanged={refresh} />)}

        {screen === "coach" && (aurora ? <AuroraCoach /> : <CoachScreen />)}

        {screen === "connections" && (aurora ? <AuroraConnections /> : <Connections />)}

        {screen === "org" && (aurora ? <AuroraOrg /> : <Org />)}

        {screen === "talent" && (aurora ? <AuroraTalent /> : <Talent />)}

        {screen === "tactical" && (aurora ? <AuroraTactical /> : <Tactical />)}

        {screen === "longevity" && (aurora ? <AuroraLongevity /> : <Longevity />)}

        {/* Tools available in BOTH templates (Aurora-styled when active, classic
            otherwise) — embedded in the shell so the sidebar + ⌘K reach them. */}
        {screen === "notifications" && <NotificationsScreen embedded />}
        {screen === "timer" && <IntervalTimerScreen embedded />}
        {screen === "statistics" && <StatisticsScreen embedded />}

        {screen === "settings" && <AccountSettings />}
        </div>
      </main>

      {/* Aurora: the floating pill bottom nav (coexists with the sidebar) — the
          ⌘K orb is Classic-only. */}
      {aurora ? (
        <AuroraPillNav activeId={screen} onSelect={(id) => { setPendingBlocks(undefined); setScreen(id); }} />
      ) : (
        <CommandMenu screen={screen} setScreen={setScreen} isEnabled={isEnabled} persona={persona} access={navAccess} t={t} />
      )}
    </div>
  );
}

// Central "control center" command menu: a floating orb (bottom-centre) and a
// ⌘K / Ctrl-K bloom hub that mirrors the sidebar nav (same NAV_GROUPS, same
// per-item flag gating). Liquid Glass treatment lives in globals.css (.cmd-*).
function CommandMenu({
  screen,
  setScreen,
  isEnabled,
  persona,
  access,
  t,
}: {
  screen: string;
  setScreen: (id: string) => void;
  isEnabled: (flag: string) => boolean;
  persona: Persona;
  access: PersonaAccess;
  t: (key: string) => string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Flatten the shared canonical nav into persona-shaped, flag-enabled tiles.
  const tiles = groupedNav(navForPersona(persona, undefined, access)).flatMap(({ group, items }) =>
    items.filter((it) => isEnabled(`nav.${it.id}`)).map((it) => ({ ...it, group })),
  );

  const label = (id: string, fallback: string) =>
    t(`nav.${id}`) === `nav.${id}` ? fallback : t(`nav.${id}`);
  const groupLabel = (g: string) =>
    t(`nav.group.${g}`) === `nav.group.${g}` ? g : t(`nav.group.${g}`);
  // Force monochrome (text) rendering on single-unit symbol glyphs so they
  // never fall back to dark emoji presentation; true emoji are left alone.
  const glyph = (ic: string) => (Array.from(ic).length === 1 ? `${ic}︎` : ic);

  return (
    <>
      <button className="cmd-orb liquid-glass" aria-label="Open menu (⌘K)" onClick={() => setOpen(true)}>
        <span className="lg-sheen" aria-hidden />
        <span className="cmd-dot" />
      </button>

      <div
        className={`cmd-scrim${open ? " is-open" : ""}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false);
        }}
      >
        <div className="cmd-hub liquid-glass lg-thick" role="dialog" aria-modal="true" aria-label="Quick menu">
          <span className="lg-sheen" aria-hidden />
          <div className="cmd-head">
            <div>
              <Mono s={{ fontSize: fs.nano, letterSpacing: ".14em", textTransform: "uppercase" }} c={ASH}>
                app.hybrid.app
              </Mono>
              <div style={{ ...disp, fontWeight: 800, fontSize: fs.subtitle, marginTop: 2 }}>Jump to…</div>
            </div>
            <button className="cmd-close" aria-label="Close" onClick={() => setOpen(false)}>
              ✕
            </button>
          </div>
          <div className="cmd-tiles">
            {tiles.map((tile, i) => (
              <button
                key={tile.id}
                className={`cmd-tile liquid-glass${screen === tile.id ? " is-active" : ""}`}
                style={{ ["--i" as string]: i }}
                onClick={() => {
                  setScreen(tile.id);
                  setOpen(false);
                }}
              >
                <span className="lg-sheen" aria-hidden />
                <span className="cmd-ic">{glyph(tile.icon)}</span>
                <span className="cmd-lb" style={disp}>
                  {label(tile.id, tile.label)}
                </span>
                <span className="cmd-gp" style={mono}>
                  {groupLabel(tile.group)}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
