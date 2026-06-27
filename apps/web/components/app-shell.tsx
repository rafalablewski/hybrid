"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { groupedNav, navForPersona, sanitizePersonaAccess, AURORA_NAV_ICONS, FUNNEL, type SessionBlock } from "@hybrid/core";
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
  Mono,
  Select,
  GlassField,
} from "@/lib/ui";
import { useCollapsible } from "@/lib/use-collapsible";
import { useIsMobile } from "@/lib/use-media-query";
const AuroraHistory = dynamic(() => import("./aurora/history"), { ssr: false });
const AuroraPlans = dynamic(() => import("./aurora/plans"), { ssr: false });
const AuroraSport = dynamic(() => import("./aurora/sport"), { ssr: false });
const AuroraCompetition = dynamic(() => import("./aurora/competition"), { ssr: false });
const AuroraPeriodize = dynamic(() => import("./aurora/periodize"), { ssr: false });
const AuroraBuilder = dynamic(() => import("./aurora/builder"), { ssr: false });
const AuroraLogger = dynamic(() => import("./aurora/logger"), { ssr: false });
const AuroraRunTrack = dynamic(() => import("./aurora/run-track"), { ssr: false });
const AuroraCoach = dynamic(() => import("./aurora/coach"), { ssr: false });
const AuroraUpgrade = dynamic(() => import("./aurora/upgrade"), { ssr: false });
const AuroraOrg = dynamic(() => import("./aurora/org"), { ssr: false });
const AuroraAthleteAnalytics = dynamic(() => import("./aurora/analytics").then((m) => ({ default: m.AuroraAthleteAnalytics })), { ssr: false });
const AuroraCoachAnalytics = dynamic(() => import("./aurora/analytics").then((m) => ({ default: m.AuroraCoachAnalytics })), { ssr: false });
const AuroraOperatorAnalytics = dynamic(() => import("./aurora/analytics").then((m) => ({ default: m.AuroraOperatorAnalytics })), { ssr: false });
const AuroraTalent = dynamic(() => import("./aurora/talent"), { ssr: false });
const AuroraTactical = dynamic(() => import("./aurora/tactical"), { ssr: false });
const AuroraTeamCompare = dynamic(() => import("./aurora/team-compare"), { ssr: false });
const AuroraTeamMonitor = dynamic(() => import("./aurora/team-monitor"), { ssr: false });
const AuroraConnections = dynamic(() => import("./aurora/connections"), { ssr: false });
const AuroraPerformance = dynamic(() => import("./aurora/performance"), { ssr: false });
const AuroraVideo = dynamic(() => import("./aurora/video"), { ssr: false });
const AuroraLongevity = dynamic(() => import("./aurora/longevity"), { ssr: false });
const AuroraVelocity = dynamic(() => import("./aurora/velocity"), { ssr: false });
const AuroraRunning = dynamic(() => import("./aurora/running"), { ssr: false });
const AuroraVolume = dynamic(() => import("./aurora/volume"), { ssr: false });
const AuroraExercises = dynamic(() => import("./aurora/exercises"), { ssr: false });
const AuroraTrends = dynamic(() => import("./aurora/trends"), { ssr: false });
import { FIRST_RUN_TOUR } from "./tour";
const Tour = dynamic(() => import("./tour"), { ssr: false });
import AuroraToday from "./aurora/today";
const AuroraProfile = dynamic(() => import("./aurora/profile"), { ssr: false });
import AuroraPillNav from "./aurora/pill-nav";
import { useTemplate } from "@/lib/use-template";
const AuroraCockpit = dynamic(() => import("./aurora/cockpit"), { ssr: false });
const AuroraNutrition = dynamic(() => import("./aurora/nutrition"), { ssr: false });
const AuroraOnboarding = dynamic(() => import("./aurora/onboarding"), { ssr: false });
const AuroraCheckins = dynamic(() => import("./aurora/checkins"), { ssr: false });
const AuroraCalendar = dynamic(() => import("./aurora/calendar"), { ssr: false });
const AuroraForcePlate = dynamic(() => import("./aurora/forceplate"), { ssr: false });
const AuroraProgress = dynamic(() => import("./aurora/progress"), { ssr: false });
const AccountSettings = dynamic(() => import("./account-settings"), { ssr: false });
const IntervalTimerScreen = dynamic(() => import("./interval-timer"), { ssr: false });
const NotificationsScreen = dynamic(() => import("./notifications"), { ssr: false });
const StatisticsScreen = dynamic(() => import("./statistics"), { ssr: false });
const SocialFeed = dynamic(() => import("./social-feed"), { ssr: false });
const SocialDiscover = dynamic(() => import("./social-discover"), { ssr: false });
const SocialLeaderboard = dynamic(() => import("./social-leaderboard"), { ssr: false });
const CoachesScreen = dynamic(() => import("./coaches"), { ssr: false });
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
  const { sessions, loading: sessionsLoading, refresh } = useSessions();
  const { macro, currentWeek, planId, refresh: refreshMacro } = useMacrocycle();
  const { roster } = useRoster();
  const { lang, setLang, t } = useLang();
  const { bio: bioFromBiometrics } = useBiometrics();
  const { bio: bioFromSignals } = useSignals();
  // A check-in / weigh-in / nutrition log writes the recovery + body-mass signals
  // that drive the shell's Performance State on Today. Those screens now
  // invalidate the signals/biometrics queries directly (useRevalidate), so the
  // shared cache revalidates here automatically — no prop plumbing needed.
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
  // legacy biometrics path so historical readings still drive the Performance State.
  const bio = bioFromSignals ?? bioFromBiometrics;
  const [screen, setScreen] = useState("today");
  // First-run guided tour (#2): shown once, right after a fresh account finishes
  // onboarding. (Web has no guest mode, so there's no guest-workout to save
  // first — that ordering only applies on mobile.)
  const [showTour, setShowTour] = useState(false);
  const startTourIfUnseen = () => {
    try {
      if (localStorage.getItem("hybrid.tourSeen")) return;
    } catch { /* ignore */ }
    setShowTour(true);
  };
  const finishTour = () => {
    setShowTour(false);
    try { localStorage.setItem("hybrid.tourSeen", "1"); } catch { /* ignore */ }
  };
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

  // Mark onboarding finished (same-device fallback flag) + advance to Today,
  // then kick off the one-time first-run tutorial (#2).
  const finishOnboarding = () => {
    try { localStorage.setItem("hybrid.onboarded", "1"); } catch { /* ignore */ }
    refreshMacro();
    setScreen("today");
    startTourIfUnseen();
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
      {/* Skip link — first focusable element, lets keyboard/SR users jump past
          the sidebar nav straight to the screen content (visually hidden until
          focused; see .skip-link in globals.css). */}
      <a href="#main" className="skip-link">{t("nav.skipToContent")}</a>

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
        <nav aria-label={t("nav.primary")} style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
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
                      data-tour={`nav-${id}`}
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
                        background: screen === id ? `color-mix(in srgb, var(--color-lime) 10%, transparent)` : "transparent",
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
                border: `1px solid color-mix(in srgb, var(--color-lime) 50%, transparent)`,
                background: `linear-gradient(135deg, color-mix(in srgb, var(--color-lime) 14%, transparent), transparent)`,
                color: txt(CHALK),
                textAlign: "left",
              }}
            >
              <span style={{ fontSize: fs.subtitle }}>✦</span>
              {!railCollapsed && (
                <span style={{ flex: 1 }}>
                  <span style={{ ...disp, fontWeight: 800, fontSize: fs.bodyLg, display: "block" }}>Unlock Full</span>
                  <Mono s={{ fontSize: 10.5, lineHeight: 1.4 }} c={ASH}>Plans, analytics, your Performance State, the Cockpit &amp; 12+ tools.</Mono>
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
                background: `color-mix(in srgb, var(--color-lime) 13%, transparent)`,
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
      <main id="main" tabIndex={-1} style={{ flex: 1, padding: isMobile ? (aurora ? "16px 16px 120px" : "16px 16px 40px") : (aurora ? "24px 32px 120px" : "24px 32px"), maxWidth: 1180, margin: "0 auto", width: "100%", position: "relative", zIndex: 1, outline: "none" }}>
        {isEnabled("app.announcements") && <AnnouncementBanner />}
        <CoachInviteBanner />
        {/* Desktop-only utility header (Classic shows the app kicker + screen
            title; theme/lang controls sit on the right). The responsive/mobile
            web view drops this whole bar entirely — matching the native mobile
            app, which has no top header: navigation is the bottom pill nav /
            command orb and theme + language live in Settings. */}
        {!isMobile && (
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: space.md, marginBottom: 24, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: space.md, minWidth: 0 }} />
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
        )}

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
            {scope === "athlete" && <AuroraAthleteAnalytics sessions={sessions} />}
            {scope === "coach" && <AuroraCoachAnalytics roster={roster} />}
            {scope === "operator" && <AuroraOperatorAnalytics />}
          </>
        )}

        {screen === "today" && (
          <AuroraToday sessions={sessions} bio={bio ?? undefined} macro={macro} currentWeek={currentWeek} planId={planId} onStart={(planBlocks) => { setPendingBlocks(planBlocks); setScreen("log"); }} onNavigate={(s) => { setPendingBlocks(undefined); setScreen(s); }} onSaved={refresh} loading={sessionsLoading} />
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

        {screen === "upgrade" && <AuroraUpgrade onUpgraded={() => setScreen("today")} />}

        {screen === "cockpit" && (
          <AuroraCockpit sessions={sessions} bio={bio ?? undefined} macro={macro} currentWeek={currentWeek} setScreen={setScreen} onEnrolled={() => { refreshMacro(); setScreen("today"); }} />
        )}

        {screen === "onboarding" && (
          <AuroraOnboarding onEnrolled={finishOnboarding} />
        )}

        {screen === "performance" && <AuroraPerformance sessions={sessions} bio={bio} />}

        {screen === "velocity" && <AuroraVelocity sessions={sessions} />}

        {screen === "running" && <AuroraRunning sessions={sessions} />}

        {screen === "volume" && <AuroraVolume sessions={sessions} />}

        {screen === "exercises" && <AuroraExercises sessions={sessions} focus={exerciseFocus} />}

        {screen === "trends" && <AuroraTrends sessions={sessions} onOpenExercise={openExercise} onOpenVolume={() => setScreen("volume")} />}

        {screen === "forceplate" && <AuroraForcePlate />}

        {screen === "nutrition" && <AuroraNutrition onNavigate={(s) => { setPendingBlocks(undefined); setScreen(s); }} />}

        {screen === "progress" && <AuroraProgress />}

        {screen === "checkin" && <AuroraCheckins sessions={sessions} />}

        {screen === "calendar" && <AuroraCalendar sessions={sessions} />}

        {screen === "builder" && <AuroraBuilder />}

        {screen === "squad" && <AuroraTeamMonitor />}

        {screen === "teamcompare" && <AuroraTeamCompare />}

        {/* Periodization is a Full feature. Free (casual) users never have it in
            nav and aren't redirected here after enrolling (they get the season
            BRIEF on Today instead); if one still lands here, show the upgrade. */}
        {screen === "periodize" && (
          persona === "casual"
            ? <AuroraUpgrade onUpgraded={() => setScreen("today")} />
            : <AuroraPeriodize macro={macro} currentWeek={currentWeek} sessions={sessions} bio={bio ?? undefined} />)}

        {screen === "competition" && <AuroraCompetition />}

        {screen === "plans" && (
          <AuroraPlans
            onEnrolled={() => {
              refreshMacro();
              // Free users land back on Today (their season brief lives there);
              // only paid athletes go to the full Periodize screen. (#5)
              setScreen(persona === "casual" ? "today" : "periodize");
            }}
          />
        )}

        {screen === "sport" && (
          <AuroraSport onLogSession={(blocks) => { setPendingBlocks(blocks); setScreen("log"); }} />
        )}

        {screen === "runtrack" && <AuroraRunTrack onSaved={refresh} />}

        {screen === "video" && <AuroraVideo />}

        {screen === "log" && (
          <AuroraLogger
            sessions={sessions}
            initialBlocks={pendingBlocks}
            onSaved={() => {
              setPendingBlocks(undefined);
              refresh();
              setScreen("history");
            }}
            onHome={() => {
              setPendingBlocks(undefined);
              refresh();
              setScreen("today");
            }}
          />
        )}

        {screen === "history" && <AuroraHistory sessions={sessions} onOpenExercise={openExercise} onChanged={refresh} />}

        {screen === "coach" && <AuroraCoach />}

        {screen === "connections" && <AuroraConnections />}

        {screen === "org" && <AuroraOrg />}

        {screen === "talent" && <AuroraTalent />}

        {screen === "tactical" && <AuroraTactical />}

        {screen === "longevity" && <AuroraLongevity />}

        {/* Social + coach marketplace — template-aware single components (radii
            soften under Aurora), like the tools below. Everyone (casual+). */}
        {screen === "feed" && <SocialFeed />}
        {screen === "discover" && <SocialDiscover />}
        {screen === "leaderboard" && <SocialLeaderboard />}
        {screen === "coaches" && <CoachesScreen />}

        {/* Tools available in BOTH templates (Aurora-styled when active, classic
            otherwise) — embedded in the shell so the sidebar + ⌘K reach them. */}
        {screen === "notifications" && <NotificationsScreen embedded />}
        {screen === "timer" && <IntervalTimerScreen embedded />}
        {screen === "statistics" && <StatisticsScreen embedded />}

        {screen === "settings" && <AccountSettings />}
        </div>
      </main>

      {/* The floating pill bottom nav (coexists with the sidebar). */}
      <AuroraPillNav activeId={screen} onSelect={(id) => { setPendingBlocks(undefined); setScreen(id); }} />

      {/* First-run guided tour overlay (#2) — only on Today so its anchors exist. */}
      {showTour && screen === "today" && <Tour steps={FIRST_RUN_TOUR} onDone={finishTour} />}
    </div>
  );
}

