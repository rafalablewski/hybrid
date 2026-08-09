"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { groupedNavWithLocks, sanitizePersonaAccess, analyticsScopesFor, resolveAnalyticsScope, analyticsScopeLabelKey, analyticsScopePrivacyKey, normalizeAuthRole, feedSubjectKey, seedPerson, parseFeedSubjectKey, sportFromSlug, sportSlug, AURORA_NAV_ICONS, FUNNEL, type FeedItemView, type SessionBlock, type AnalyticsScope } from "@hybrid/core";
// The AI coach screen, reached from the Cockpit module tile (see below).
const AuroraAskCoach = dynamic(() => import("./aurora/ai-coach"), { ssr: false });
import { AuroraIcon } from "./aurora/icons";
import { useSession } from "@/lib/session";
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
import { useScreenTransition } from "@/lib/use-screen-transition";
import { readDeepLink, writeDeepLink, onDeepLinkChange, currentDeepLinkIndex } from "@/lib/deep-link";
import { useScrollCollapse } from "@/lib/use-scroll-collapse";
import { useIsMobile } from "@/lib/use-media-query";
const AuroraHistory = dynamic(() => import("./aurora/history"), { ssr: false });
const AuroraPlans = dynamic(() => import("./aurora/plans"), { ssr: false });
const AuroraSport = dynamic(() => import("./aurora/sport"), { ssr: false });
const AuroraSportPage = dynamic(() => import("./aurora/sport-page"), { ssr: false });
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
const AuroraEndurance = dynamic(() => import("./aurora/endurance"), { ssr: false });
const AuroraTalent = dynamic(() => import("./aurora/talent"), { ssr: false });
const AuroraTactical = dynamic(() => import("./aurora/tactical"), { ssr: false });
const AuroraTeamCompare = dynamic(() => import("./aurora/team-compare"), { ssr: false });
const AuroraTeamMonitor = dynamic(() => import("./aurora/team-monitor"), { ssr: false });
const AuroraConnections = dynamic(() => import("./aurora/connections"), { ssr: false });
const AuroraPerformance = dynamic(() => import("./aurora/performance"), { ssr: false });
const AuroraVideo = dynamic(() => import("./aurora/video"), { ssr: false });
const AuroraLongevity = dynamic(() => import("./aurora/longevity"), { ssr: false });
const AuroraVelocity = dynamic(() => import("./aurora/velocity"), { ssr: false });
const AuroraVolume = dynamic(() => import("./aurora/volume"), { ssr: false });
const AuroraVolumeModel = dynamic(() => import("./aurora/volume-model"), { ssr: false });
const AuroraTrends = dynamic(() => import("./aurora/trends"), { ssr: false });
const AuroraExercises = dynamic(() => import("./aurora/exercises"), { ssr: false });
const AuroraExercisePage = dynamic(() => import("./aurora/exercise-page"), { ssr: false });
import { FIRST_RUN_TOUR } from "./tour";
const Tour = dynamic(() => import("./tour"), { ssr: false });
import AuroraToday from "./aurora/today";
const AuroraProfile = dynamic(() => import("./aurora/profile"), { ssr: false });
import AuroraPillNav from "./aurora/pill-nav";
import { useTemplate } from "@/lib/use-template";
const AuroraNutrition = dynamic(() => import("./aurora/nutrition"), { ssr: false });
const AuroraOnboarding = dynamic(() => import("./aurora/onboarding"), { ssr: false });
const AuroraCheckins = dynamic(() => import("./aurora/checkins"), { ssr: false });
const AuroraCalendar = dynamic(() => import("./aurora/calendar"), { ssr: false });
const AuroraForcePlate = dynamic(() => import("./aurora/forceplate"), { ssr: false });
const AuroraProgress = dynamic(() => import("./aurora/progress"), { ssr: false });
const AccountSettings = dynamic(() => import("./account-settings"), { ssr: false });
const AuroraMessages = dynamic(() => import("./aurora/messages"), { ssr: false });
const AuroraHelpCenter = dynamic(() => import("./aurora/help-center"), { ssr: false });
const IntervalTimerScreen = dynamic(() => import("./interval-timer"), { ssr: false });
const NotificationsScreen = dynamic(() => import("./notifications"), { ssr: false });
const StatisticsScreen = dynamic(() => import("./statistics"), { ssr: false });
const SocialFeed = dynamic(() => import("./social-feed"), { ssr: false });
const FeedPost = dynamic(() => import("./feed-post"), { ssr: false });
const SocialDiscover = dynamic(() => import("./social-discover"), { ssr: false });
const SocialSaved = dynamic(() => import("./social-saved"), { ssr: false });
const SocialLeaderboard = dynamic(() => import("./social-leaderboard"), { ssr: false });
const CoachesScreen = dynamic(() => import("./coaches"), { ssr: false });
const UserPage = dynamic(() => import("./user-page"), { ssr: false });
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

export default function AppShell() {
  const router = useRouter();
  const { session, ready, logout } = useSession();
  // SAFE CACHE (lib/read.ts): `loading` here means UNKNOWN — no server answer
  // yet — not "a fetch is in flight". Screens gate every CLAIM about the
  // athlete on it, so a cold start shows a skeleton instead of asserting the
  // zero-case ("log a session", "No season yet") and retracting it a second
  // later. A background revalidate no longer flips content back to a skeleton.
  const { sessions, loading: sessionsLoading, ready: sessionsReady, error: sessionsError, refresh } = useSessions();
  const { macro, currentWeek, planId, planStartedAt, loading: macroLoading, ready: macroReady, settled: macroSettled, refresh: refreshMacro } = useMacrocycle();
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
  // The sidebar is the DESKTOP rail and nothing else now. On phones it used to
  // become an off-canvas springboard drawer — a second, hidden copy of the nav
  // that no control could actually open (the hamburger that opened it went with
  // the mobile header, and nothing replaced it). Mobile navigation is the pill
  // bar plus the SIDE MENU behind the Today header's avatar
  // (aurora/side-menu.tsx), which is where the springboard lives now, so the
  // rail simply does not render below the breakpoint.
  const isMobile = useIsMobile();
  const railCollapsed = collapsed && !isMobile;
  // Prefer the Signal ontology when it has recovery data; fall back to the
  // legacy biometrics path so historical readings still drive the Performance State.
  const bio = bioFromSignals ?? bioFromBiometrics;
  // Screen state. `setScreen` is the TRANSITIONING setter — every call site
  // (including the ones handed to children) runs the paired, directional
  // transition rather than a hard cut. Direction comes from the shared
  // hierarchy in @hybrid/core, so mobile can't drift. See use-screen-transition.
  const [screen, setScreenRaw] = useState("today");
  // Monotonic position in OUR navigation, stamped onto each pushed entry so a
  // popstate can tell a Back from a Forward (see lib/deep-link.ts).
  const navIdx = useRef(0);
  const { setScreen, popTo } = useScreenTransition(screen, setScreenRaw, (to) => {
    navIdx.current += 1;
    writeDeepLink({ s: to === "today" ? undefined : to }, { push: true, state: { hybridIdx: navIdx.current } });
  });
  // DEEP LINKS. The screen is mirrored into `?s=`, so a screen finally has an
  // address: it can be bookmarked, sent to someone, or landed on from an email,
  // and a refresh no longer dumps you back on Today. The URL MIRRORS the state
  // rather than driving it — we read it on mount and on Back/Forward, and write
  // it after the fact with replaceState so tapping through five tabs doesn't
  // cost five Back presses to leave. See lib/deep-link.ts.
  useEffect(() => {
    const p = readDeepLink();
    // setScreenRaw, not setScreen: landing on a link should not play a
    // directional transition from a screen the user was never on.
    const to = p.s ? landing(p) : undefined;
    if (to) setScreenRaw(to);
    // Seed the landing entry with our index so the FIRST Back is measurable
    // against it (a fresh entry carries no state, which would read as 0 and be
    // indistinguishable from the root).
    navIdx.current = currentDeepLinkIndex();
    // `to`, not `p.s`: a link that degraded (a sport page with no resolvable
    // sport) must leave the URL saying where the user actually is.
    writeDeepLink({ s: to || undefined }, { state: { hybridIdx: navIdx.current } });
    // Back/Forward: apply the screen WITH a transition, in the direction the
    // browser travelled. `popTo` deliberately does not re-push.
    return onDeepLinkChange((next, idx) => {
      const back = idx < navIdx.current;
      navIdx.current = idx;
      popTo(landing(next) || "today", back);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // ONE scroll signal for the whole shell, published as a CSS custom property.
  // The web twin of the mobile NavScrollProvider; see lib/use-scroll-collapse.
  useScrollCollapse();
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
  // REPLAY — the Help center's first row. The tour only renders on Today (its
  // anchors live there), so this clears the seen-flag, arms it, and navigates,
  // rather than trying to draw it over the Help screen.
  const replayTour = () => {
    try { localStorage.removeItem("hybrid.tourSeen"); } catch { /* ignore */ }
    setShowTour(true);
    setScreen("today");
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

  // The same shape for a SPORT: one canonical page per catalog sport, reached
  // from the Sport index (and, in time, from Today's sport blocks); back returns
  // to wherever you came from.
  const [sportFocus, setSportFocus] = useState("");
  const [sportReturn, setSportReturn] = useState("sport");
  // THE POST — one shared workout on its own page, addressed by the same
  // (subjectType:subjectId) key kudos, comments and saves use. A row hands over
  // what it already loaded so the page paints before the fetch returns; landing
  // cold from a link, `postItem` is null and the page fetches the post itself.
  const [postFocus, setPostFocus] = useState("");
  const [postItem, setPostItem] = useState<FeedItemView | null>(null);
  const [postReturn, setPostReturn] = useState("feed");
  const openPost = (key: string, item?: FeedItemView) => {
    if (screen !== "post") setPostReturn(screen);
    setPostFocus(key);
    setPostItem(item ?? null);
    // The sub-target is written BEFORE the screen (see openSportPage below for
    // why), so the pushed history entry carries the post with it.
    writeDeepLink({ post: key });
    setScreen("post");
  };

  // THE PERSON — one page per human, coach or not (components/user-page.tsx).
  // Every place that used to peek at somebody in a drawer now goes here, so
  // there is one surface for a person and it has an address.
  const [userFocus, setUserFocus] = useState("");
  const [userReturn, setUserReturn] = useState("feed");
  const openUser = (handle: string, card?: { handle: string; displayName?: string | null; avatarUrl?: string | null; coachVerified?: boolean }) => {
    if (!handle) return;
    // Hand over what the row already knows, so the page paints the person on
    // its first frame instead of a spinner (core/person-seed.ts).
    if (card?.handle) seedPerson(card);
    if (screen !== "user") setUserReturn(screen);
    // The sub-target is written BEFORE the screen, so the pushed history entry
    // carries the handle with it (same reason as the post and the sport page).
    writeDeepLink({ u: handle.toLowerCase() });
    setUserFocus(handle.toLowerCase());
    setScreen("user");
  };

  /** Which screen a deep link actually resolves to. A `sportpage` link carries
   *  the sport as a slug; one that names no catalog sport (an older build, a
   *  mangled paste) lands on the sport INDEX rather than on an empty page. A
   *  `post` link carries the post's key; one that names no readable subject
   *  lands on the FEED rather than on an empty page. */
  const landing = (p: { s?: string; sport?: string; post?: string; u?: string }): string => {
    if (p.s === "user") {
      // A person link that names nobody lands on Find friends rather than on an
      // empty page — the same degradation rule the sport and post links follow.
      if (!p.u) return "discover";
      setUserFocus(p.u.toLowerCase());
      return "user";
    }
    if (p.s === "post") {
      const ref = parseFeedSubjectKey(p.post);
      if (!ref) return "feed";
      setPostFocus(feedSubjectKey(ref));
      setPostItem(null); // a cold landing has no row to borrow
      return "post";
    }
    if (p.s !== "sportpage") return p.s ?? "today";
    const name = sportFromSlug(p.sport);
    if (!name) return "sport";
    setSportFocus(name);
    return "sportpage";
  };
  const openSportPage = (name: string) => {
    if (screen !== "sportpage") setSportReturn(screen);
    setSportFocus(name);
    // Write the sub-target BEFORE the screen: `setScreen` pushes a history
    // entry, and applyDeepLink patches only the keys it is given, so the
    // pushed entry carries the sport with it. Land on that URL later and the
    // page opens on the same sport.
    writeDeepLink({ sport: sportSlug(name) });
    setScreen("sportpage");
  };
  // A sport page's address is `?s=sportpage&sport=<slug>`; leaving it drops the
  // slug, so a stale link can never point at a sport you are no longer on.
  //
  // The ref is load-bearing: effects run in declaration order, so on a cold
  // landing this one fires BEFORE the state set by the deep-link effect above
  // has re-rendered — an unguarded `else` branch would wipe the very slug the
  // link arrived with. It only ever clears a param this effect itself wrote.
  const sportParamWritten = useRef(false);
  useEffect(() => {
    if (screen === "sportpage") {
      if (sportFocus) {
        writeDeepLink({ sport: sportSlug(sportFocus) });
        sportParamWritten.current = true;
      }
    } else if (sportParamWritten.current) {
      writeDeepLink({ sport: undefined });
      sportParamWritten.current = false;
    }
  }, [screen, sportFocus]);

  // A post's address is `?s=post&post=<type>:<id>`; leaving it drops the key,
  // so a stale link can never point at a post you are no longer on. Same
  // ref-guard as the sport param above, and for the same reason.
  const postParamWritten = useRef(false);
  useEffect(() => {
    if (screen === "post") {
      if (postFocus) {
        writeDeepLink({ post: postFocus });
        postParamWritten.current = true;
      }
    } else if (postParamWritten.current) {
      writeDeepLink({ post: undefined });
      postParamWritten.current = false;
    }
  }, [screen, postFocus]);

  // A person's address is `?s=user&u=<handle>`; leaving it drops the handle, so
  // a stale link can never point at someone you are no longer looking at. Same
  // ref-guard as the sport and post params above, and for the same reason.
  const userParamWritten = useRef(false);
  useEffect(() => {
    if (screen === "user") {
      if (userFocus) {
        writeDeepLink({ u: userFocus });
        userParamWritten.current = true;
      }
    } else if (userParamWritten.current) {
      writeDeepLink({ u: undefined });
      userParamWritten.current = false;
    }
  }, [screen, userFocus]);

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

  // Analytics scope — which of the three dashboards is showing. Availability
  // comes from the SHARED resolver in @hybrid/core (role-derived, never persona-
  // derived), the same one the mobile screen uses, so the two clients can never
  // disagree about who may see whose data. Land on the highest scope the role
  // holds (an admin opens on the platform view).
  const authRole = normalizeAuthRole(session?.role);
  const allowedScopes = useMemo(() => analyticsScopesFor(authRole), [authRole]);
  const [scope, setScope] = useState<AnalyticsScope>("athlete");
  useEffect(() => {
    setScope(allowedScopes[allowedScopes.length - 1]!);
  }, [allowedScopes]);
  // A demotion mid-session must not leave the user on a scope they've lost.
  const activeScope = resolveAnalyticsScope(authRole, scope);

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
    {/* motion-recede-host — the surface that scales back while a sheet is up
        (globals.css). NOTE: it is transformed, so anything position:fixed
        inside it would be trapped; modals must portal to <body>. */}
    <div
      className="motion-recede-host"
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

      {/* sidebar — the DESKTOP rail. Below the breakpoint it is not rendered at
          all: mobile navigation is the pill bar plus the side menu behind the
          Today header's avatar. */}
      {!isMobile && (
      <aside
        className="lg-sidebar"
        style={
            {
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
            letterSpacing: "-.03em",
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
              };
              return (
                <button className="pressable"
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

            // DESKTOP RAIL — every group expanded (there's room).
            return navGroups.map(({ group, items }) => (
              <div key={group} style={{ marginBottom: 14 }}>
                {!railCollapsed && (
                  <Mono
                    s={{ fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase", padding: "0 12px", display: "block", marginBottom: 6 }}
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
            <button className="pressable"
              onClick={() => { track(FUNNEL.upgradeEntryClick, { client: "web", source: "sidebar" }); openUpgrade(); }}
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
                  <Mono s={{ fontSize: 11, lineHeight: 1.4 }} c={ASH}>Plans, analytics, your Performance State, the Cockpit &amp; 12+ tools.</Mono>
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
            <button className="pressable"
              onClick={() => router.push("/admin")}
              title={railCollapsed ? "Admin console" : undefined}
              style={{
                width: "100%",
                marginTop: 8,
                ...cond,
                fontSize: fs.caption,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: ".08em",
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
            <button className="pressable"
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
                letterSpacing: ".08em",
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
          <button className="pressable"
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
              letterSpacing: ".08em",
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
      )}

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
          the content column and cards vanish a gutter-width before the bezel. */}
      {/* Mobile side gutter is 12px — matches the native app's GUTTER (12dp)
          so content fills the same share of the screen on both clients.
          Vertical rhythm stays 16. */}
      <main id="main" tabIndex={-1} style={{ flex: 1, minWidth: 0, overflowX: "clip", padding: isMobile ? (aurora ? "16px 12px 120px" : "16px 12px 40px") : (aurora ? "24px 32px 120px" : "24px 32px"), maxWidth: 1180, margin: "0 auto", position: "relative", zIndex: 1, outline: "none", ...({ "--page-pad-x": isMobile ? "12px" : "32px", "--page-pad-top": isMobile ? "16px" : "24px" } as Record<string, string>) }}>
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
            <button className="pressable"
              onClick={toggle}
              title="Toggle theme"
              aria-label="Toggle light/dark theme"
              style={{
                ...cond,
                fontWeight: 700,
                fontSize: fs.body,
                textTransform: "uppercase",
                letterSpacing: ".08em",
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

        {/* The screen surface. `view-transition-name: hybrid-screen` (globals.css
            .motion-screen) makes this the ONLY thing that travels, so the
            sidebar, header and banners stay put while the content moves. The
            paired exit + direction are driven by setScreen — see
            lib/use-screen-transition.ts. Aurora only; Classic keeps its
            one-sided entrance. */}
        <div key={screen} className={aurora ? "motion-screen" : undefined}>
        {/* ANALYTICS — the 3-scope dashboard. Ships on BOTH clients (parity rule);
            the mobile twin is components/aurora/analytics.tsx and reads the same
            engines + endpoints. Scope tabs appear only when the role holds more
            than one, and each scope states what it can and cannot see. */}
        {screen === "analytics" && (
          <>
            {allowedScopes.length > 1 && (
              <div style={{ display: "flex", gap: space.sm, marginBottom: 12, flexWrap: "wrap" }}>
                {allowedScopes.map((id) => {
                  const on = activeScope === id;
                  const c = id === "operator" ? AMBER : id === "coach" ? VIOLET : LIME;
                  return (
                    <button className="pressable"
                      key={id}
                      onClick={() => setScope(id)}
                      aria-pressed={on}
                      style={{ ...cond, fontSize: fs.bodyLg, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", padding: "9px 18px", borderRadius: aurora ? 999 : 10, cursor: "pointer", border: `1px solid ${on ? c : LINE}`, background: on ? c : "transparent", color: on ? ON_ACCENT : ASH }}
                    >
                      {t(analyticsScopeLabelKey(id))}
                    </button>
                  );
                })}
              </div>
            )}
            {(() => {
              const acc = activeScope === "operator" ? AMBER : activeScope === "coach" ? VIOLET : LIME;
              return (
                <div style={{ padding: "10px 14px", borderRadius: aurora ? 18 : 10, background: `${acc}12`, borderLeft: `3px solid ${acc}`, marginBottom: 20 }}>
                  <Mono s={{ fontSize: fs.caption, lineHeight: 1.4 }} c={CHALK}>{t(analyticsScopePrivacyKey(activeScope))}</Mono>
                </div>
              );
            })()}
            {activeScope === "athlete" && <AuroraAthleteAnalytics sessions={sessions} />}
            {activeScope === "coach" && <AuroraCoachAnalytics roster={roster} />}
            {activeScope === "operator" && <AuroraOperatorAnalytics />}
          </>
        )}

        {/* AI COACH — reached from the Cockpit module tile, mirroring mobile's
            /ai-coach route. Deliberately NOT a NAV_ITEMS destination on either
            client, so it stays out of the sidebar and the More hub alike. */}
        {screen === "aicoach" && <AuroraAskCoach />}

        {screen === "today" && (
          <AuroraToday sessions={sessions} bio={bio ?? undefined} macro={macro} currentWeek={currentWeek} planId={planId} planStartedAt={planStartedAt} onStart={(planBlocks, title) => { setPendingBlocks(planBlocks); setPendingTitle(title); setScreen("log"); }} onNavigate={navigate} onOpenSession={openSession} onOpenPost={openPost} onOpenExercise={openExercisePage} onOpenSport={openSportPage} onSaved={refresh} onEnrolled={refreshMacro} loading={sessionsLoading || macroLoading} fetchError={!!sessionsError} onRetry={refresh} sessionsReady={sessionsReady} macroReady={macroReady} macroSettled={macroSettled} />
        )}

        {screen === "profile" && (
          <AuroraProfile
            sessions={sessions}
            bio={bio ?? undefined}
            macro={macro}
            currentWeek={currentWeek}
            onNavigate={navigate} onOpenUser={openUser}
          />
        )}

        {/* The Performance page — ex-Cockpit and the analyze Performance
            screen, merged. `cockpit` still resolves here so ⌘K entries and
            saved deep links keep working.

            Volume and Trends NO LONGER resolve here. They were folded in as
            sections of this page and between them took roughly two thirds of
            its scroll; they are their own destinations again, reached from the
            page's volume block and its exit rows. See the audit at
            audit/10-performance-tab-element-audit-2026-08.md. */}
        {(screen === "performance" || screen === "cockpit") && (
          <AuroraPerformance sessions={sessions} bio={bio ?? undefined} macro={macro} currentWeek={currentWeek} sessionsReady={sessionsReady} macroSettled={macroSettled} setScreen={setScreen} onOpenSport={openSportPage} onEnrolled={() => { refreshMacro(); setScreen("today"); }} />
        )}

        {screen === "volume" && <AuroraVolume sessions={sessions} onOpenModel={() => setScreen("volume-model")} />}
        {screen === "volume-model" && <AuroraVolumeModel sessions={sessions} />}
        {screen === "trends" && <AuroraTrends sessions={sessions} onOpenExercise={openExercisePage} />}

        {screen === "onboarding" && (
          <AuroraOnboarding onEnrolled={finishOnboarding} />
        )}

        {screen === "velocity" && <AuroraVelocity sessions={sessions} />}

        {screen === "endurance" && <AuroraEndurance sessions={sessions} onOpenSport={openSportPage} />}

        {screen === "exercises" && <AuroraExercises sessions={sessions} onOpen={openExercisePage} />}

        {screen === "exercise" && exerciseFocus && <AuroraExercisePage sessions={sessions} name={exerciseFocus} onBack={() => setScreen(exerciseReturn)} />}

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

        {screen === "sport" && <AuroraSport onOpen={openSportPage} />}

        {screen === "sportpage" && sportFocus && (
          <AuroraSportPage
            name={sportFocus}
            onBack={() => setScreen(sportReturn)}
            onLogSession={(blocks) => { setPendingBlocks(blocks); setScreen("log"); }}
            onOpenSession={openSession}
          />
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
            // Minimize: same destination as onHome, but the seeded blocks are
            // dropped rather than the session — the running draft stays in
            // localStorage, so the nav accessory picks it up and re-entering the
            // logger restores it. Clearing the pending seed is what makes that
            // restore win over a stale plan/AI hand-off on the way back in.
            onMinimize={() => {
              setPendingBlocks(undefined);
              setPendingTitle(undefined);
              setScreen("today");
            }}
            onUpgrade={openUpgrade}
          />
        )}

        {screen === "history" && <AuroraHistory sessions={sessions} planId={planId} planStartedAt={planStartedAt} initialOpenId={pendingSessionId} onOpenExercise={openExercisePage} onNavigate={navigate} onChanged={refresh} fetchError={!!sessionsError} onRetry={refresh} />}

        {screen === "coach" && <AuroraCoach />}

        {screen === "connections" && <AuroraConnections />}

        {screen === "org" && <AuroraOrg />}

        {screen === "talent" && <AuroraTalent />}

        {screen === "tactical" && <AuroraTactical />}

        {screen === "longevity" && <AuroraLongevity />}

        {/* Social + coach marketplace — template-aware single components (radii
            soften under Aurora), like the tools below. Everyone (casual+). The
            Explore screen that used to front these is gone: its coach rail sits
            on Today and each destination below is reached from More. */}
        {screen === "feed" && <SocialFeed onNavigate={setScreen} onOpenPost={openPost} onOpenUser={openUser} />}
        {/* ONE PERSON, on their own page — who they are, how they train, and,
            if they coach, what they coach. `?s=user&u=<handle>` is its address,
            so a profile can be shared the way a post can. */}
        {screen === "user" && <UserPage handle={userFocus} onBack={() => popTo(userReturn, true)} onOpenUser={openUser} onOpenPost={openPost} />}
        {/* ONE POST, on its own page — a workout with every figure, the records
            it set and its thread. `?s=post&post=<type>:<id>` is its address, so
            a shared link lands here rather than at the top of the stream. */}
        {screen === "post" && <FeedPost postKey={postFocus} initial={postItem} onBack={() => popTo(postReturn, true)} onOpenSession={openSession} onOpenProfile={openUser} />}
        {/* MESSAGES — the bottom bar's fourth destination (it took More's slot;
            see @hybrid/core nav-bar.ts). A placeholder that says so — direct
            messages are tracked as `direct-messages` (planned). */}
        {screen === "messages" && <AuroraMessages />}
        {screen === "discover" && <SocialDiscover onOpenUser={openUser} />}
        {screen === "saved" && <SocialSaved onNavigate={setScreen} onOpenPost={openPost} onOpenUser={openUser} />}
        {screen === "leaderboard" && <SocialLeaderboard onOpenUser={openUser} />}
        {screen === "coaches" && <CoachesScreen onOpenUser={openUser} />}

        {/* Tools available in BOTH templates (Aurora-styled when active, classic
            otherwise) — embedded in the shell so the sidebar + ⌘K reach them. */}
        {screen === "notifications" && <NotificationsScreen embedded onNavigate={navigate} onOpenSession={openSession} onOpenUser={openUser} />}
        {screen === "timer" && <IntervalTimerScreen embedded />}
        {screen === "statistics" && <StatisticsScreen embedded />}

        {screen === "settings" && <AccountSettings />}

        {/* HELP CENTER — the side menu's last footer row. */}
        {screen === "help" && <AuroraHelpCenter onNavigate={navigate} onReplayTour={replayTour} />}
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

