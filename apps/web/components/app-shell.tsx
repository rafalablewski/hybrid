"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { groupedNavWithLocks, sanitizePersonaAccess, AURORA_NAV_ICONS, FUNNEL, type SessionBlock } from "@hybrid/core";
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
  BLUE,
  VIOLET,
  AMBER,
  RED,
  LIME_T,
  ON_ACCENT,
  txt,
  disp,
  cond,
  mono,
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
const AuroraTrainWeb = dynamic(() => import("./aurora/train"), { ssr: false });
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
const AuroraExercisePage = dynamic(() => import("./aurora/exercise-page"), { ssr: false });
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
const AuroraExplore = dynamic(() => import("./aurora/explore"), { ssr: false });
import AnnouncementBanner from "./announcement-banner";
import PremiumAccentStyle from "./premium-accent-style";
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
  const { macro, currentWeek, planId, planStartedAt, loading: macroLoading, refresh: refreshMacro } = useMacrocycle();
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
  // Springboard parity: on the mobile drawer the nav is a searchable GRID of
  // feature launcher tiles (the same "Springboard" as the mobile app's More tab)
  // instead of one long grouped scroll; the desktop rail keeps every group
  // expanded (it has the room). `moreSearch` filters the tiles by label.
  const [moreSearch, setMoreSearch] = useState("");
  const railCollapsed = collapsed && !isMobile;
  useEffect(() => {
    if (!isMobile) setDrawerOpen(false);
  }, [isMobile]);
  // Reset the springboard search each time the drawer closes.
  useEffect(() => {
    if (!drawerOpen) setMoreSearch("");
  }, [drawerOpen]);
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
  // The plan-composed title a plan-seeded session saves under ("<plan> – Week N,
  // <day>") so the schedule engine recognises it as the plan's own — set only
  // by plan starts, alongside pendingBlocks (mobile-parity title stamping).
  const [pendingTitle, setPendingTitle] = useState<string | undefined>(undefined);
  // Today's "Also today" card deep-links one logged session's breakdown on the
  // History screen (parity with mobile's /session/{id}); consumed on mount.
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const openSession = (id: string) => { setPendingSessionId(id); setScreen("history"); };
  // ONE canonical route for an individual movement: the exercise page (variant
  // B). Every entry point — the Today widget, the Exercises picker, Trends,
  // History/session detail — lands here; back returns to wherever you came from.
  const [exerciseFocus, setExerciseFocus] = useState("");
  const [exerciseReturn, setExerciseReturn] = useState("today");
  const openExercisePage = (name: string) => {
    if (screen !== "exercise") setExerciseReturn(screen);
    setExerciseFocus(name);
    setScreen("exercise");
  };

  // The upgrade paywall is a slide-up sheet OVERLAY (not a screen), so it appears
  // over whatever you're on. `navigate` centralises the intercept so any
  // onNavigate("upgrade") opens the sheet instead of switching to a screen.
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const openUpgrade = () => { setPendingBlocks(undefined); setUpgradeOpen(true); };
  const navigate = (s: string) => { if (s === "upgrade") { openUpgrade(); return; } setPendingBlocks(undefined); setPendingTitle(undefined); setPendingSessionId(null); setScreen(s); };
  // A casual user should never sit on the Full-only Periodize screen; if they
  // land there, bounce home and pop the upgrade sheet.
  useEffect(() => {
    if (screen === "periodize" && persona === "casual") { setScreen("today"); setUpgradeOpen(true); }
  }, [screen, persona]);

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
    <>
    <PremiumAccentStyle />
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
          {(() => {
            const groupLabel = (g: string) => (t(`nav.group.${g}`) === `nav.group.${g}` ? g : t(`nav.group.${g}`));
            // Premium (Full) items a free user hasn't unlocked show LOCKED (🔒)
            // in the sidebar rather than hidden, so the whole toolkit is visible;
            // a locked item routes to the upgrade screen.
            const navGroups = groupedNavWithLocks(persona, navAccess)
              .map(({ group, items }) => ({ group, items: items.filter((x) => isEnabled(`nav.${x.item.id}`)) }))
              .filter((g) => g.items.length > 0);

            // One nav destination button — used by the desktop rail groups (the
            // mobile drawer renders the springboard grid below instead).
            const itemBtn = ({ item: { id, label: fallback }, locked }: { item: { id: string; label: string }; locked: boolean }) => {
              const label = t(`nav.${id}`) === `nav.${id}` ? fallback : t(`nav.${id}`);
              const auroraIcon = aurora ? AURORA_NAV_ICONS[id] : undefined;
              // The "log" (Train) nav item opens the Train LAUNCHER, not the
              // logger directly — the launcher is screen "train"; highlight it too.
              const active = screen === id || (id === "log" && screen === "train");
              const onClick = () => {
                setPendingBlocks(undefined);
                if (locked) { track(FUNNEL.upgradeEntryClick, { client: "web", source: `sidebar-${id}` }); setUpgradeOpen(true); }
                else setScreen(id === "log" ? "train" : id);
                setDrawerOpen(false);
              };
              return (
                <button
                  key={id}
                  data-tour={`nav-${id}`}
                  onClick={onClick}
                  title={railCollapsed ? (locked ? `${label} – Full` : label) : undefined}
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
                    background: active ? `color-mix(in srgb, var(--color-lime) 10%, transparent)` : "transparent",
                    color: txt(active ? LIME : ASH),
                    ...disp,
                    fontSize: fs.bodyLg,
                    fontWeight: 600,
                    textAlign: "left",
                  }}
                >
                  <span style={{ fontSize: fs.subtitle, display: "grid", placeItems: "center", width: 18, height: 18, opacity: locked ? 0.7 : 1 }}>
                    <AuroraIcon name={auroraIcon ?? "info"} size={18} strokeWidth={2.6} />
                  </span>
                  {!railCollapsed && <span style={{ flex: 1 }}>{label}</span>}
                  {!railCollapsed && locked && <span aria-hidden title="Full" style={{ fontSize: 11, opacity: 0.8 }}>🔒</span>}
                </button>
              );
            };

            // MOBILE DRAWER — the Springboard: a searchable grid of launcher
            // tiles grouped by cluster (parity with the mobile app's More tab).
            if (isMobile) {
              const navName = (id: string, fb: string) => (t(`nav.${id}`) === `nav.${id}` ? fb : t(`nav.${id}`));
              const goItem = (id: string, locked: boolean) => {
                setPendingBlocks(undefined);
                if (locked) { track(FUNNEL.upgradeEntryClick, { client: "web", source: `more-${id}` }); setUpgradeOpen(true); }
                else setScreen(id === "log" ? "train" : id);
                setDrawerOpen(false);
              };
              const qy = moreSearch.trim().toLowerCase();
              const totalTools = navGroups.reduce((n, g) => n + g.items.length, 0);
              const springboard = navGroups
                .map(({ group, items }) => ({ group, items: items.filter(({ item }) => !qy || navName(item.id, item.label).toLowerCase().includes(qy)) }))
                .filter((g) => g.items.length > 0);
              return (
                <div>
                  {/* Unlock Full — the accent membership CARD (kicker → title →
                      blurb → Go Full pill), matching the mobile More tab + pill-nav
                      sheet. Casual only; the plain sidebar entry is desktop-only. */}
                  {showUpgradeEntry && isEnabled("nav.upgrade") && (
                    <button
                      onClick={() => { track(FUNNEL.upgradeEntryClick, { client: "web", source: "more" }); openUpgrade(); setDrawerOpen(false); }}
                      style={{ position: "relative", overflow: "hidden", display: "block", width: "100%", textAlign: "left", cursor: "pointer", marginBottom: 18, padding: 18, borderRadius: 22, background: INK, border: `1px solid color-mix(in srgb, var(--color-lime) 50%, transparent)`, boxShadow: "0 10px 26px -10px color-mix(in srgb, var(--color-lime) 32%, transparent)" }}
                    >
                      <span aria-hidden style={{ position: "absolute", top: -54, right: -44, width: 168, height: 168, borderRadius: 84, background: "color-mix(in srgb, var(--color-lime) 16%, transparent)", pointerEvents: "none" }} />
                      <span style={{ ...mono, display: "block", fontSize: fs.nano, letterSpacing: ".2em", color: LIME_T }}>{t("w.home.pillnav.upgradeKicker")}</span>
                      <span style={{ ...disp, display: "block", fontWeight: 900, fontSize: 22, color: CHALK, marginTop: 8, letterSpacing: "-.02em" }}>{t("nav.upgrade")}</span>
                      <span style={{ ...mono, display: "block", fontSize: fs.micro, color: ASH, marginTop: 5, maxWidth: 240 }}>{t("w.home.pillnav.upgradeBlurb")}</span>
                      <span style={{ ...disp, display: "inline-flex", alignItems: "center", gap: space.sm, marginTop: 14, background: LIME, color: ON_ACCENT, borderRadius: 999, padding: "9px 18px", fontWeight: 700, fontSize: fs.body }}>{t("w.home.pillnav.goFull")}</span>
                    </button>
                  )}

                  {/* Search — filters the tiles below by label. */}
                  <div style={{ display: "flex", alignItems: "center", gap: 9, background: INK2, border: `1px solid ${LINE}`, borderRadius: 15, padding: "11px 13px" }}>
                    {aurora ? <AuroraIcon name="search" size={17} strokeWidth={2.6} /> : <span style={{ ...mono, color: ASH }}>⌕</span>}
                    <input
                      value={moreSearch}
                      onChange={(e) => setMoreSearch(e.target.value)}
                      placeholder={`Search ${totalTools} tools & screens`}
                      aria-label="Search tools"
                      style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: CHALK, ...disp, fontSize: fs.body }}
                    />
                    {moreSearch && (
                      <button onClick={() => setMoreSearch("")} aria-label="Clear search" style={{ background: "none", border: "none", cursor: "pointer", color: ASH, ...mono, fontSize: fs.body }}>✕</button>
                    )}
                  </div>

                  {springboard.map(({ group, items }) => {
                    return (
                      <div key={group} style={{ marginTop: 18 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 2px", marginBottom: 10 }}>
                          <Mono s={{ fontSize: 9, letterSpacing: ".16em", textTransform: "uppercase" }} c={ASH}>{groupLabel(group)}</Mono>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
                          {items.map(({ item, locked }) => {
                            const label = navName(item.id, item.label);
                            const ic = aurora ? AURORA_NAV_ICONS[item.id] : undefined;
                            const iconColor = locked ? ASH : "var(--color-chalk)";
                            return (
                              <button
                                key={item.id}
                                data-tour={`nav-${item.id}`}
                                onClick={() => goItem(item.id, locked)}
                                title={locked ? `${label} (Full)` : label}
                                aria-label={locked ? `${label} (Full)` : label}
                                style={{ position: "relative", minHeight: 80, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 7, background: INK2, border: `1px solid ${LINE}`, borderRadius: 14, padding: "12px 4px", cursor: "pointer", opacity: locked ? 0.6 : 1 }}
                              >
                                <AuroraIcon name={ic ?? "info"} size={22} color={iconColor} strokeWidth={2.4} />
                                <span style={{ ...disp, fontSize: 10.5, fontWeight: 600, lineHeight: 1.15, textAlign: "center", color: iconColor, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{label}</span>
                                {locked && (
                                  <span aria-hidden style={{ position: "absolute", top: 6, right: 6, display: "grid", placeItems: "center" }}>
                                    <AuroraIcon name="lock" size={11} color="var(--premium-accent-text)" strokeWidth={2.4} />
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  {qy && springboard.length === 0 && (
                    <Mono s={{ display: "block", marginTop: 16, padding: "0 2px" }} c={ASH}>No tools match “{moreSearch}”.</Mono>
                  )}
                </div>
              );
            }

            // DESKTOP RAIL — every group expanded (there's room).
            return navGroups.map(({ group, items }) => (
              <div key={group} style={{ marginBottom: 14 }}>
                {!railCollapsed && (
                  <Mono
                    s={{ fontSize: 9, letterSpacing: ".16em", textTransform: "uppercase", padding: "0 12px", display: "block", marginBottom: 6 }}
                    c={ASH}
                  >
                    {groupLabel(group)}
                  </Mono>
                )}
                {items.map(itemBtn)}
              </div>
            ));
          })()}

          {/* ONE upgrade entry — value-labeled, not a feature tab. Casual only;
              opens the single Full bundle page. Keeps the nav clean (no locks).
              Desktop rail only — the mobile drawer shows the accent membership
              CARD version inside its springboard branch above. */}
          {!isMobile && showUpgradeEntry && isEnabled("nav.upgrade") && (
            <button
              onClick={() => { track(FUNNEL.upgradeEntryClick, { client: "web", source: "sidebar" }); openUpgrade(); setDrawerOpen(false); }}
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
              title={railCollapsed ? `${session.name} – ${session.role}` : undefined}
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
      {/* minWidth:0 lets this flex child shrink past its content's intrinsic
          width instead of forcing the shell wider than the sidebar leaves room
          for (which pushed the page into horizontal scroll in the 900–1180px
          band). overflowX:clip is the belt-and-suspenders guard — the shell
          never scrolls sideways; wide tables/carousels scroll in their own
          containers, mirroring the native app. */}
      {/* --page-pad-x publishes main's horizontal padding so full-bleed rails
          (coach/feed sliders) can pull themselves out to the true screen edge
          with a matching negative margin — otherwise their scroll clip ends at
          the content column and cards vanish 16px before the bezel. */}
      <main id="main" tabIndex={-1} style={{ flex: 1, minWidth: 0, overflowX: "clip", padding: isMobile ? (aurora ? "16px 16px 120px" : "16px 16px 40px") : (aurora ? "24px 32px 120px" : "24px 32px"), maxWidth: 1180, margin: "0 auto", position: "relative", zIndex: 1, outline: "none", ...({ "--page-pad-x": isMobile ? "16px" : "32px" } as Record<string, string>) }}>
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
                  ? "Operator scope – platform aggregates only — MAU, retention, content. No access to any individual's private training data."
                  : scope === "coach"
                    ? "Coach scope – only athletes who accepted you (mutual consent). Aggregate roster view; private athlete notes excluded."
                    : "Client scope – your own training data only. Nothing here is visible to other athletes.";
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
          <AuroraToday sessions={sessions} bio={bio ?? undefined} macro={macro} currentWeek={currentWeek} planId={planId} planStartedAt={planStartedAt} onStart={(planBlocks, title) => { setPendingBlocks(planBlocks); setPendingTitle(title); setScreen("log"); }} onNavigate={navigate} onOpenSession={openSession} onOpenExercise={openExercisePage} onSaved={refresh} loading={sessionsLoading || macroLoading} />
        )}

        {screen === "profile" && (
          <AuroraProfile
            sessions={sessions}
            bio={bio ?? undefined}
            macro={macro}
            currentWeek={currentWeek}
            onNavigate={navigate}
          />
        )}

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

        {screen === "exercises" && <AuroraExercises sessions={sessions} onOpen={openExercisePage} />}

        {screen === "exercise" && exerciseFocus && <AuroraExercisePage sessions={sessions} name={exerciseFocus} onBack={() => setScreen(exerciseReturn)} />}

        {screen === "trends" && <AuroraTrends sessions={sessions} onOpenExercise={openExercisePage} onOpenVolume={() => setScreen("volume")} />}

        {screen === "forceplate" && <AuroraForcePlate />}

        {screen === "nutrition" && <AuroraNutrition onNavigate={navigate} />}

        {screen === "progress" && <AuroraProgress />}

        {screen === "checkin" && <AuroraCheckins />}

        {screen === "calendar" && <AuroraCalendar sessions={sessions} />}

        {screen === "builder" && <AuroraBuilder onUpgrade={openUpgrade} />}

        {screen === "squad" && <AuroraTeamMonitor />}

        {screen === "teamcompare" && <AuroraTeamCompare />}

        {/* Periodization is a Full feature. Free (casual) users never have it in
            nav and aren't redirected here after enrolling (they get the season
            BRIEF on Today instead); if one still lands here, show the upgrade. */}
        {screen === "periodize" && persona !== "casual" && (
          <AuroraPeriodize macro={macro} currentWeek={currentWeek} sessions={sessions} bio={bio ?? undefined} />)}

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

        {/* Train LAUNCHER — the middle-button screen (mobile parity): the
            adaptive prescribed-session slot + the minimal list of ways to start.
            Each option seeds the logger (screen "log") via onStart. */}
        {screen === "train" && (
          <AuroraTrainWeb
            sessions={sessions}
            bio={bio ?? undefined}
            onStart={(blocks) => { setPendingBlocks(blocks); setScreen("log"); }}
            onNavigate={navigate}
          />
        )}

        {screen === "log" && (
          <AuroraLogger
            sessions={sessions}
            initialBlocks={pendingBlocks}
            initialTitle={pendingTitle}
            onSaved={() => {
              setPendingBlocks(undefined);
              setPendingTitle(undefined);
              refresh();
              setScreen("history");
            }}
            onHome={() => {
              setPendingBlocks(undefined);
              setPendingTitle(undefined);
              refresh();
              setScreen("today");
            }}
            onUpgrade={openUpgrade}
          />
        )}

        {screen === "history" && <AuroraHistory sessions={sessions} planId={planId} planStartedAt={planStartedAt} initialOpenId={pendingSessionId} onOpenExercise={openExercisePage} onChanged={refresh} />}

        {screen === "coach" && <AuroraCoach />}

        {screen === "connections" && <AuroraConnections />}

        {screen === "org" && <AuroraOrg />}

        {screen === "talent" && <AuroraTalent />}

        {screen === "tactical" && <AuroraTactical />}

        {screen === "longevity" && <AuroraLongevity />}

        {/* Social + coach marketplace — template-aware single components (radii
            soften under Aurora), like the tools below. Everyone (casual+). */}
        {screen === "explore" && <AuroraExplore onNavigate={navigate} />}

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

      {/* Upgrade paywall — a slide-up sheet OVERLAY (renders its own scrim), so it
          floats over whatever screen is active. */}
      <AuroraUpgrade open={upgradeOpen} onClose={() => setUpgradeOpen(false)} onUpgraded={() => { setUpgradeOpen(false); setScreen("today"); }} />

      {/* The floating pill bottom nav (coexists with the sidebar). */}
      <AuroraPillNav activeId={screen} onSelect={navigate} />

      {/* First-run guided tour overlay (#2) — only on Today so its anchors exist. */}
      {showTour && screen === "today" && <Tour steps={FIRST_RUN_TOUR} onDone={finishTour} />}
    </div>
    </>
  );
}

