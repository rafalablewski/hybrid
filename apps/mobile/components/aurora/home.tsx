import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl, Animated, StyleSheet, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  prescribeSession,
  computeAccountability,
  buildActivityFeed,
  planProgramToday,
  FUNNEL,
  toTrainingLog,
  toBiometrics,
  velocityProfiles,
  readinessRole,
  checkinFeeling,
  checkinCooldownRemainingMs,
  relativeTime,
  planSchedule,
  masthead,
  alsoTodayCopy,
  sessionClockTime,
  sessionIcon,
  READINESS_FEELINGS,
  READINESS_FACE,
  type ReadinessFeeling,
  sessionsOnDay,
  sessionShape,
  sessionCardioTotals,
  sessionVolume,
  fmtTonnage,
  type LoggedSession,
  type SessionBlock,
  type Experience,
  type Equipment,
  type AuroraIconName,
  type ScheduledDay,
  type LogbookDay,
} from "@hybrid/core";
import { fetchAssignments, fetchMacrocycle, fetchCheckins, createCheckin, fetchRoutines, favouriteRoutine, type Assignment, type Checkin } from "../../lib/api";
import { useBodyweightLookup } from "../../lib/use-bodyweight";
import { useSessionsQuery, useSignalsQuery, useRevalidate } from "../../lib/queries";
import { useSession } from "../../lib/session";
import { usePersona } from "../../lib/persona";
import { usePlanMaxes } from "../../lib/plan-maxes";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, roleColor } from "../../lib/theme";
import { usePremiumAccent } from "../../lib/premium-accent";
import { fs, space, F, serifIf, startGlow, useEntrance } from "../../lib/ui";
import { track } from "../../lib/track";
import { ACard, AuroraField, RADIUS, Ring, withAlpha } from "./kit";
import ExerciseWidgetRail from "./exercise-widget";
import { CtaLabel } from "./cta-label";
import { auroraScrollClearance } from "../../lib/layout";
import { useNavScrollProps } from "../../lib/nav-scroll";
import { AuroraIcon } from "./icons";
import Tour, { FIRST_RUN_TOUR } from "../tour";
import QuickSportLog from "../quick-sport";
import Sheet from "./sheet";
import QuickStartSheet, { type QuickRoutine } from "./quick-start";
import ReadinessFace from "./readiness-face";
import FetchError from "./fetch-error";
import AuroraNutrition from "./nutrition";
import AuroraFuel from "./fuel";
import CoachRail from "./coach-rail";
// The guided daily check-in, hosted INSIDE Today's feeling card (see FeelingCard)
// so the full ritual runs on Today — the /checkin screen is the same component.
import AuroraCheckin from "./checkin";
import AuroraWeekRail from "./week-rail";
import AuroraLogbookRail from "./logbook-rail";
import { CAME_FROM_GUEST_KEY } from "../../lib/guest";

type P = ReturnType<typeof useTheme>["palette"];
// State colours resolve through the SHARED semantic vocabulary (@hybrid/core
// semantic.ts) via theme.roleColor, so web + mobile can't drift on meaning.
const readyColor = (v: number, C: P) => roleColor(C, readinessRole(v));

/**
 * AURORA home — the rounded Aurora skin of the full classic Today cockpit, at
 * parity (no feature loss): a horizontally-swipeable Plan today + AI coach pair,
 * the season phase timeline, the reconciled "This week" plan (with schedule /
 * re-sync), accountability, the weekly recap, and the Performance State + injury-risk
 * panel. Runs the SAME engines as the classic home; casual users get the lean
 * subset (no season/Performance State), like classic.
 */
export default function AuroraHome() {
  const { palette: C, scheme } = useTheme();
  const pa = usePremiumAccent();
  const { t } = useLang();
  const router = useRouter();
  const { name } = useSession();
  const isAthlete = usePersona() !== "casual";
  const insets = useSafeAreaInsets();
  // Logbook mode's "Train your way" slider — one chooser card ≈ 72% of the
  // screen so the next card peeks in (the exercise-widget rail's idiom).
  const { width: winW } = useWindowDimensions();
  const structW = Math.min(300, Math.round(winW * 0.72));
  const navScroll = useNavScrollProps();

  // Sessions + signals from the shared cache; the rest stay home-local.
  const { data: sessions = [], refetch: refetchSessions, isError: sessionsError } = useSessionsQuery();
  const { data: signals = [], refetch: refetchSignals } = useSignalsQuery();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [planId, setPlanId] = useState<string | null>(null);
  const [planStartedAt, setPlanStartedAt] = useState<string | null>(null);
  const [prefExp, setPrefExp] = useState<Experience | undefined>(undefined);
  const [prefEquip, setPrefEquip] = useState<Equipment | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);
  // True until the FIRST home load (sessions + enrollment) settles. Gates the
  // plan hero so an already-enrolled athlete sees a skeleton — never the
  // first-run chooser — while planId is still null on cold start.
  const [initialLoad, setInitialLoad] = useState(true);
  // TIER-2 glance strip modals: Quick Log (sport carousel) + Done today (a
  // pop-up list of everything logged today, with a link to the full calendar).
  const [quickOpen, setQuickOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  // TIER-3 quick actions, now slide-up sheets (not full-screen routes): the
  // nutrition tracker and Follow-a-coach. (Readiness is now set inline on the
  // feeling card, so it no longer opens a sheet.)
  const [nutritionOpen, setNutritionOpen] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  // Quick-start: the fourth "Train your way" path — a sheet to re-launch a saved
  // routine (favourites rail + shuffle-able rest). `routines` stays null until the
  // first fetch resolves so the card doesn't flash before we know whether the
  // user has any saved routines.
  const [quickStartOpen, setQuickStartOpen] = useState(false);
  const [routines, setRoutines] = useState<QuickRoutine[] | null>(null);
  // Plan hero: lead with the first lift; the rest collapse behind a toggle so
  // the card reads at a glance instead of a wall of percentage schemes.
  const [liftsOpen, setLiftsOpen] = useState(false);
  // The readiness FEELING log — the emoji the athlete picked in the quick
  // check-in (primed/good/flat/wrecked), not a computed score. The raw list is
  // kept so the feeling card can be scoped to WHICHEVER day the week rail has
  // selected; refreshed on focus, pull-to-refresh, and after a face saves.
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const loadFeeling = useCallback(async () => {
    // Self-contained try/catch: this runs inside the home-load Promise.all, so a
    // throw here must never block sessions/assignments/macrocycle from loading.
    try {
      setCheckins(await fetchCheckins());
    } catch (err) {
      console.error("Failed to load readiness feeling:", err);
    }
  }, []);

  const load = useCallback(() => {
    setRefreshing(true);
    Promise.all([fetchAssignments(), fetchMacrocycle(), refetchSessions(), refetchSignals(), loadFeeling()])
      .then(([a, m]) => {
        setAssignments(a);
        setPlanId(m?.planId ?? null); setPlanStartedAt(m?.planStartedAt ?? null);
      })
      .catch((err) => console.error("Failed to load home data:", err))
      .finally(() => { setRefreshing(false); setInitialLoad(false); });
  }, [loadFeeling]);
  const loadRoutines = useCallback(() => {
    fetchRoutines().then((r) => setRoutines(r)).catch(() => setRoutines([]));
  }, []);
  useFocusEffect(useCallback(() => { load(); loadRoutines(); }, [load, loadRoutines]));

  // Optimistic favourite toggle — flip locally, then PATCH; revert on failure.
  const toggleFavourite = useCallback((r: QuickRoutine) => {
    const next = !r.favourite;
    setRoutines((cur) => cur?.map((x) => (x.id === r.id ? { ...x, favourite: next } : x)) ?? cur);
    favouriteRoutine(r.id, next).then((ok) => {
      if (!ok) setRoutines((cur) => cur?.map((x) => (x.id === r.id ? { ...x, favourite: r.favourite } : x)) ?? cur);
    });
  }, []);
  const launchRoutine = useCallback((r: QuickRoutine) => {
    setQuickStartOpen(false);
    router.push(`/workout?source=template&templateId=${r.id}`);
  }, [router]);

  // Subtle entrance — content fades + rises each time Today gains focus, matching
  // the AuroraScreen transition so the home doesn't hard-cut in. Shared hook
  // (lib/ui): same Reduce-Motion guard + JS-driver blank-screen fix as the shell.
  const enterStyle = useEntrance();

  // Onboarding prefs that tailor the prescription (client-only).
  useEffect(() => {
    AsyncStorage.getItem("hybrid.experience").then((v) => { if (v === "beginner" || v === "intermediate" || v === "advanced") setPrefExp(v); }).catch(() => {});
    AsyncStorage.getItem("hybrid.equipment").then((v) => { if (v === "full" || v === "home" || v === "minimal") setPrefEquip(v); }).catch(() => {});
  }, []);

  const bio = useMemo(() => toBiometrics(signals as unknown as Parameters<typeof toBiometrics>[0]), [signals]);
  const log = useMemo(() => toTrainingLog(sessions), [sessions]);
  // TODAY's readiness feeling (independent of the rail's selected day) → feeds
  // the prescription so the one-tap check-in mechanically scales today's load.
  const todayFeeling = useMemo(() => {
    const today = new Date().toDateString();
    const c = checkins.find((x) => x && x.weekOf && new Date(x.weekOf).toDateString() === today);
    return c ? checkinFeeling(c) : null;
  }, [checkins]);
  const rx = useMemo(
    () => prescribeSession(log, bio, { profiles: velocityProfiles(sessions), experience: prefExp, equipment: prefEquip, subjectiveReadiness: todayFeeling ?? undefined }),
    [log, sessions, bio, prefExp, prefEquip, todayFeeling],
  );
  const acc = useMemo(() => computeAccountability(sessions, { targetPerWeek: 3 }), [sessions]);
  const planMaxes = usePlanMaxes();
  const plan = useMemo(() => planProgramToday(planId, sessions.length, planMaxes), [planId, sessions.length, planMaxes]);
  const hasData = sessions.length > 0;
  const units = useLoggerPrefs().units;
  const bw = useBodyweightLookup();
  // The date-anchored WEEK RAIL replaces the count-based plan hero whenever an
  // enrolled program + a start date resolve (parity with web home). The shared
  // engine (planSchedule) reconciles each calendar date against logged sessions
  // and skips; the classic "Your plan today" card stays the fallback otherwise.
  const useRail = !!(plan && planId && planStartedAt);
  // LOGBOOK MODE ("The Constant", concept C1) — no plan but real logged
  // history: the SAME week-rail object mounts in logbook mode, so the calendar
  // exists from the first logged session instead of the chooser repeating
  // forever; the chooser demotes to slim "Add structure" rows below the rail.
  // This holds for EVERYONE with history and no plan — premium included: Today's
  // hero is your plan/calendar (or a path to one), never a fabricated AI session
  // presented as "yours". The readiness-driven daily prescription lives on the
  // Cockpit (the analytical layer), not spliced into Today as a hardcoded lift.
  const logbookMode = !initialLoad && !plan && hasData;
  // The DAY the screen is scoped to. The week rail's tapped chip lifts up here
  // so the Also-today and feeling cards follow the viewed day instead of
  // staying pinned to the real today; null (or tapping today's chip) = today.
  // Re-anchors to today whenever the enrolled plan changes (the rail resets its
  // own selection the same way), and is ignored entirely once the rail is gone
  // (un-enrolled) — a stale day must never scope the cards with no rail visible.
  const [railDay, setRailDay] = useState<ScheduledDay | LogbookDay | null>(null);
  useEffect(() => { setRailDay(null); }, [planId, planStartedAt]);
  const dayIsToday = !(useRail || logbookMode) || !railDay || railDay.isToday;
  // undefined lets every core day-helper fall through to its Date.now() default.
  const dayTs = dayIsToday ? undefined : railDay!.ts;
  const dayLabel = dayIsToday ? null : `${railDay!.weekdayShort} ${railDay!.dayOfMonth} ${railDay!.monthShort}`;
  const dayIsFuture = !dayIsToday && railDay!.ts > Date.now();
  // LIVING MASTHEAD — the headline names the VIEWED day ("Today" until the
  // rail is scrubbed, "Yesterday"/"Tomorrow" at ±1, the weekday name beyond;
  // never "2 days ago" — clumsy as a headline, worse inflected in PL/DE).
  // The naming rule lives in @hybrid/core masthead.ts so web can't drift.
  const mast = masthead(dayTs);
  // "Back to today" re-anchors BOTH the lifted day scope and the rail's own
  // internal selection (via resetToken) in one tap.
  const [railResetToken, setRailResetToken] = useState(0);
  const backToToday = () => { setRailDay(null); setRailResetToken((n) => n + 1); };
  // Sessions logged on the VIEWED day — the confirmation loop (a finished
  // session OR a quick sport log both land here the moment they save).
  const doneOnDay = useMemo(() => sessionsOnDay(sessions, dayTs), [sessions, dayTs]);
  // The date-anchored schedule (no overrides — status colouring lives in the
  // rail; here we only need today's prescription + which sessions fulfilled it).
  const sched = useMemo(
    () => (planId && planStartedAt ? planSchedule({ planId, startedAt: planStartedAt, sessions }) : null),
    [planId, planStartedAt, sessions],
  );
  // Sessions the schedule claimed for SOME plan day — the Done-Today card tags
  // those rows "Plan" so the plan workout and the off-plan extras (the tennis
  // match, a freestyle lift) read apart while ALL of them stay listed.
  const fulfilledIds = useMemo(() => new Set(sched?.fulfilledSessionIds ?? []), [sched]);
  // The viewed day's check-in (if any) → its feeling + logged-at time, plus the
  // most recent check-in WRITE anywhere (createdAt) — that mirrors the server's
  // global 6h re-log cooldown, which also holds when back-logging a past day.
  const dayCheckin = useMemo(() => {
    const dstr = new Date(dayTs ?? Date.now()).toDateString();
    return checkins.find((c) => c && c.weekOf && new Date(c.weekOf).toDateString() === dstr) ?? null;
  }, [checkins, dayTs]);
  const feeling = dayCheckin ? checkinFeeling(dayCheckin) : null;
  const feelingAt = dayCheckin?.weekOf ? new Date(dayCheckin.weekOf).getTime() : null;
  const lastCheckinAt = useMemo(
    () =>
      checkins.reduce<number | null>((m, c) => {
        const ts = Date.parse(c?.createdAt ?? c?.weekOf ?? "");
        return Number.isFinite(ts) && (m == null || ts > m) ? ts : m;
      }, null),
    [checkins],
  );
  const goUpgrade = (source: string) => { track(FUNNEL.upgradeEntryClick, { client: "mobile", source }); router.push("/upgrade"); };

  // TODAY HEADER (step-1 redesign) — profile initials + a real notifications
  // count (the shared activity feed; never a fabricated number).
  const initials = useMemo(() => {
    const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "·";
    return (parts[0]![0]! + (parts[1]?.[0] ?? "")).toUpperCase();
  }, [name]);
  const notifCount = useMemo(() => buildActivityFeed({ sessions, assignments }).length, [sessions, assignments]);

  // Time-of-day greeting + date for the daily header.
  const [greeting, setGreeting] = useState("");
  const [dateStr, setDateStr] = useState("");
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(t(h < 12 ? "w.home.today.greetMorning" : h < 18 ? "w.home.today.greetAfternoon" : "w.home.today.greetEvening"));
    setDateStr(new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }));
  }, [t]);
  const firstName = (name ?? "").trim().split(/\s+/)[0] ?? "";
  // FIRST-RUN CHOOSER state (new user: no plan, no history) — hoisted because
  // the masthead's caption line says "Free" when the chooser (or its demoted
  // logbook-mode form) renders. With history the logbook rail takes over.
  const firstRun = !initialLoad && !plan && !hasData;
  // Masthead strings for the viewed day: headline, caption date, and (beyond
  // ±1 day, where the headline stops saying it) the scrub-distance tag.
  const mastTitle =
    mast.kind === "today" ? t("w.home.today.mastToday")
    : mast.kind === "yesterday" ? t("w.home.today.mastYesterday")
    : mast.kind === "tomorrow" ? t("w.home.today.mastTomorrow")
    : new Date(dayTs!).toLocaleDateString(undefined, { weekday: "long" });
  const mastCaption = dayIsToday ? dateStr : new Date(dayTs!).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const mastTag =
    Math.abs(mast.diffDays) >= 2
      ? t(mast.diffDays < 0 ? "w.home.today.daysBack" : "w.home.today.daysOut").replace("{n}", String(Math.abs(mast.diffDays)))
      : null;

  // Readiness (and the AI prescription it feeds) is only real when there's
  // logged history — a bare macrocycle phase (auto-created at onboarding) must
  // never surface a fabricated score/session, so this gates on hasData alone.
  const planReadiness = hasData;
  // The plan-card CTA follows YOUR PLAN when enrolled (source=plan prefills the
  // named plan's day), then the AI-prescribed session for PREMIUM athletes, then
  // an empty start. AI is paid-only, so casual/guests never get source=ai here.
  const startPrescribed = () =>
    router.push(plan ? "/workout?source=plan" : isAthlete && hasData ? "/workout?source=ai" : "/workout?source=empty");

  // Start a SPECIFIC rail day: stash its exact (date-anchored) blocks so the
  // logger prefills the day you tapped — not the count-based today. The rail
  // passes the plan-composed title ("<plan> – Week N, <day>") so the saved
  // session is recognisably the plan's own day, not just the plan. Falls back
  // to the plan start when no blocks are supplied.
  const startPlanDay = useCallback((blocks?: SessionBlock[], title?: string) => {
    if (blocks && blocks.length) {
      AsyncStorage.setItem("hybrid.pendingPlanSession", JSON.stringify({ title: title ?? plan?.planName ?? "Plan", blocks }))
        .then(() => router.push("/workout?source=plan-day"))
        .catch(() => startPrescribed());
      return;
    }
    startPrescribed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.planName]);

  // First-run guided tutorial (#2): shown once after a fresh account onboards.
  // Guest-first rule — if the user logged a guest workout before signing up,
  // that workout lands first; the tutorial steps aside for one open, then shows.
  const [showTour, setShowTour] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        if (await AsyncStorage.getItem("hybrid.tourSeen")) return;
        if (!(await AsyncStorage.getItem("hybrid.pendingTour"))) return;
        // Guest-first: a one-shot marker (set at sign-in flush) means a guest
        // workout is landing — let it show first; defer the tutorial one open
        // and clear the marker so it shows next time. Keyed off the marker, NOT
        // a live session count, so a lingering failed upload can't suppress the
        // tutorial forever.
        if (await AsyncStorage.getItem(CAME_FROM_GUEST_KEY)) {
          await AsyncStorage.removeItem(CAME_FROM_GUEST_KEY).catch(() => {});
          return;
        }
        await AsyncStorage.removeItem("hybrid.pendingTour").catch(() => {});
        setShowTour(true);
      } catch { /* ignore */ }
    })();
  }, []);
  const finishTour = () => {
    setShowTour(false);
    AsyncStorage.setItem("hybrid.tourSeen", "1").catch(() => {});
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.ink }} edges={["top"]}>
      {/* Ambient Aurora gradient backdrop — Today owns its own shell (custom
          entrance + horizontal pager) rather than AuroraScreen, so render the
          same field here so it isn't the one flat tab next to History/More/You. */}
      <AuroraField />
      {showTour && <Tour steps={FIRST_RUN_TOUR} onDone={finishTour} />}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: auroraScrollClearance(insets.bottom) }} {...navScroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={C.lime} />}>
        <Animated.View style={enterStyle}>
        {/* TODAY HEADER (step-1 redesign) — profile · HYBRID wordmark · bell.
            Replaces the old greeting + search/bell row: the brand sits centre
            with a lime accent rule, the avatar opens the profile, the bell
            carries a live activity count. */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          {/* profile — avatar opens the You / account tab */}
          <Pressable onPress={() => router.push("/(tabs)/you")} accessibilityRole="button" accessibilityLabel={t("w.home.today.profileAria")} style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: `${C.lime}22`, borderWidth: 1, borderColor: C.lime, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: F.black, fontSize: fs.note, color: txt(C, C.lime) }}>{initials}</Text>
            {/* live dot */}
            <View style={{ position: "absolute", bottom: -2, right: -2, width: 12, height: 12, borderRadius: 6, backgroundColor: C.lime, borderWidth: 2.5, borderColor: C.ink }} />
          </Pressable>
          {/* centred wordmark + lime accent rule */}
          <View style={{ alignItems: "center", gap: 5 }}>
            <Text style={{ fontFamily: F.black, fontSize: 19, letterSpacing: -0.5, color: C.chalk }}>
              HYBRID<Text style={{ color: txt(C, C.lime) }}>.</Text>
            </Text>
            <View style={{ width: 26, height: 3, borderRadius: 2, backgroundColor: C.lime }} />
          </View>
          {/* right group — the day-streak pill (moved up here so the greeting
              line breathes) + the notifications bell */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {acc.streak.current > 0 && (
              // SPECTRUM: the streak wears the warm terracotta accent (Connect),
              // pairing with the 🔥 and keeping chartreuse for the primary action.
              <Pressable onPress={() => setDoneOpen(true)} style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: `${C.red}24`, borderWidth: 1, borderColor: `${C.red}66`, borderRadius: RADIUS.pill, paddingHorizontal: 11, height: 42, justifyContent: "center" }}>
                <Text style={{ fontFamily: F.mono, fontSize: 11, color: txt(C, C.red) }}>🔥 {acc.streak.current}{t("w.home.today.dayStreak")}</Text>
              </Pressable>
            )}
            <Pressable onPress={() => router.push("/notifications")} accessibilityRole="button" accessibilityLabel={t("w.home.today.notificationsAria")} style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
              <AuroraIcon name="bell" size={20} color={C.ash} />
              {notifCount > 0 && (
                <View style={{ position: "absolute", top: -5, right: -5, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: C.red, borderWidth: 2, borderColor: C.ink, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontFamily: F.mono, fontSize: 10, color: "#fff" }}>{notifCount > 9 ? "9+" : notifCount}</Text>
                </View>
              )}
            </Pressable>
          </View>
        </View>

        {/* MASTHEAD ("Today" redesign) — caption date + right meta (the
            chooser's "Free", or the scrub-distance tag), ONE big headline, and
            the greeting demoted to a single warm sentence beneath it. The old
            layout stacked two near-equal bold headlines (greeting 22 + "How do
            you want to start?" 18) four lines apart; now the page has one. The
            headline NAMES THE VIEWED DAY (masthead() in @hybrid/core): "Today"
            until the week rail is scrubbed, "Yesterday"/"Tomorrow" at ±1, the
            weekday name beyond — a static "Today" over Friday's session would
            lie in the largest type on screen. Off today, the greeting line
            becomes the "Back to today" return affordance, teal, in the same
            spot every time. Mirrors web today.tsx. */}
        <View style={{ marginTop: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: C.ash }}>{mastCaption || " "}</Text>
            {firstRun || (logbookMode && !mastTag) ? (
              <Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: C.ash }}>{t("w.home.today.badgeFree")}</Text>
            ) : mastTag ? (
              <Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: txt(C, C.amber) }}>{mastTag}</Text>
            ) : null}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 2 }}>
            <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: 34, letterSpacing: -1, color: C.chalk }}>{mastTitle}</Text>
            {/* Kyoto Hour hanko — the vermilion seal beside the true "Today" only
                (never the scrubbed days); Aurora (dark) hides it. Decorative,
                hence no a11y label. Mirrors web today.tsx + globals.css
                .hanko-seal. */}
            {scheme === "light" && dayIsToday && (
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: C.accentText.red, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-3deg" }] }}
              >
                <Text style={{ fontFamily: serifIf(scheme, F.semi), fontSize: 13, color: C.ink }}>力</Text>
              </View>
            )}
          </View>
          {dayIsToday ? (
            <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.ash, marginTop: 2 }}>{greeting ? `${greeting}, ${firstName}.` : " "}</Text>
          ) : (
            <Pressable onPress={backToToday} accessibilityRole="button" hitSlop={8} style={{ alignSelf: "flex-start", marginTop: 4 }}>
              <Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: txt(C, C.blue) }}>{t("w.home.today.backToToday")} →</Text>
            </Pressable>
          )}
        </View>

        {/* PLAN TODAY — the single focused hero (your one job today). No kicker or
            eyebrow: the screen is already today's training and the plan names
            itself — the interface shouldn't narrate what the athlete can see.
            When enrolled in a dated program the count-based hero gives way to the
            date-anchored WEEK RAIL (parity with web). */}
        {sessionsError && sessions.length === 0 ? (
          /* SESSIONS FAILED TO LOAD — with no cached data we can't tell an
             enrolled athlete from a first-run one, so the chooser here would be
             a lie ("looks like a new user" when really the network dropped).
             Show the honest retry card instead of the empty-state chooser. */
          <View style={{ marginTop: 14 }}>
            <FetchError onRetry={load} />
          </View>
        ) : useRail ? (
          <View style={{ marginTop: 14 }}>
            <AuroraWeekRail
              planId={planId!}
              planStartedAt={planStartedAt!}
              sessions={sessions}
              maxes={planMaxes}
              onStart={(blocks, title) => startPlanDay(blocks, title)}
              onNavigate={(screen) => { if (screen === "history") router.push("/(tabs)/history"); }}
              onSelectDay={setRailDay}
              resetToken={railResetToken}
            />
          </View>
        ) : logbookMode ? (
          /* LOGBOOK MODE ("The Constant") — the same week-rail object, in
             logbook mode: the last seven days with the athlete's real logged
             training, so a plan-less regular gets the calendar from their
             first session instead of the chooser forever. The chooser demotes
             to slim rows under an Explore-standard "Add structure" head. */
          <View style={{ marginTop: 14 }}>
            <AuroraLogbookRail
              sessions={sessions}
              onLog={() => router.push("/workout?source=empty")}
              onNavigate={(screen) => { if (screen === "history") router.push("/(tabs)/history"); }}
              onSelectDay={setRailDay}
              resetToken={railResetToken}
            />
            <View style={{ marginTop: 24, marginBottom: 12, marginHorizontal: 2, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
              <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: 18, color: C.chalk }}>{t("w.home.logbook.trainYourWay")}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: C.ash }}>{t("w.home.logbook.optional")}</Text>
            </View>
            {/* the chooser as a snap slider — the exercise-widget rail's idiom:
                one card ≈ 72% wide so the next path peeks in from the right,
                FULL-BLEED like every screen-level rail: negative margins the
                width of AuroraScreen's 16dp gutter pull the scroll clip to the
                true screen edge, matching internal padding keeps resting cards
                on the column. */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={structW + 12}
              decelerationRate="fast"
              style={{ marginHorizontal: -16 }}
              contentContainerStyle={{ gap: 12, paddingVertical: 4, paddingHorizontal: 16 }}
            >
              <StructureCard C={C} width={structW} glyph="▤" accent={C.lime} title={t("w.home.today.chooserFollowTitle")} sub={t("w.home.logbook.slimFollowSub")} cta={t("w.home.today.chooserFollowCta")} onPress={() => router.push("/(tabs)/plans")} />
              <StructureCard C={C} width={structW} glyph="⌗" accent={C.blue} title={t("w.home.today.chooserBuildTitle")} sub={t("w.home.logbook.slimBuildSub")} cta={t("w.home.today.chooserBuildCta")} onPress={() => router.push("/builder")} />
              <StructureCard C={C} width={structW} glyph="↯" accent={C.amber} title={t("w.home.today.chooserLogTitle")} sub={t("w.home.logbook.slimLogSub")} cta={t("w.home.today.chooserLogCta")} onPress={() => router.push("/workout?source=empty")} />
              {/* The fourth path — always present (like the other three). With no
                  saved routines the sheet shows its build-first empty state, so
                  it's a prompt, not a dead door. */}
              <StructureCard C={C} width={structW} glyph="⚡" accent={C.violet} title={t("w.home.today.chooserQuickTitle")} sub={t("w.home.logbook.slimQuickSub")} cta={t("w.home.today.chooserQuickCta")} onPress={() => setQuickStartOpen(true)} />
            </ScrollView>
          </View>
        ) : firstRun ? (
          /* FIRST-RUN CHOOSER — "Three Materials", sitting DIRECTLY on the
             page: no wrapper ACard (a box around three cards reads as chrome)
             and one stacked column. NO section head — the "How do you want to
             start?" question was retired with the masthead redesign (the page
             already opens with "Today" + the greeting, and three cards titled
             Follow a plan / Build your own / Log a workout need no sentence
             announcing that a choice is available); "Free" is said ONCE on the
             masthead's caption line. Each full-width card wears the Go-Full
             anatomy with its corner glow, the hue confined to glyph + CTA,
             and IS the start — no separate Start pill. Mirrors web today.tsx. */
          <View style={{ marginTop: 16 }}>
            <View style={{ gap: space.sm }}>
              <ChooserCard C={C} glyph="▤" accent={C.lime} title={t("w.home.today.chooserFollowTitle")} sub={t("w.home.today.chooserFollowSub")} cta={t("w.home.today.chooserFollowCta")} onPress={() => router.push("/(tabs)/plans")} />
              <ChooserCard C={C} glyph="⌗" accent={C.blue} title={t("w.home.today.chooserBuildTitle")} sub={t("w.home.today.chooserBuildSub")} cta={t("w.home.today.chooserBuildCta")} onPress={() => router.push("/builder")} />
              <ChooserCard C={C} glyph="↯" accent={C.amber} title={t("w.home.today.chooserLogTitle")} sub={t("w.home.today.chooserLogSub")} cta={t("w.home.today.chooserLogCta")} onPress={() => router.push("/workout?source=empty")} />
              <ChooserCard C={C} glyph="⚡" accent={C.violet} title={t("w.home.today.chooserQuickTitle")} sub={t("w.home.today.chooserQuickSub")} cta={t("w.home.today.chooserQuickCta")} onPress={() => setQuickStartOpen(true)} />
            </View>
          </View>
        ) : (
        <ACard style={{ marginTop: 14 }}>
            {/* On a plan, Start is the full-width action anchored BELOW the lifts;
                the only thing riding the top row is the readiness dial, and only
                once there's logged history — a bare onboarding macrocycle must
                never surface a fabricated readiness score. (Plan-less athletes
                with history land in logbook mode, so this card only ever renders
                the plan hero or the cold-start skeleton.) */}
            {!initialLoad && isAthlete && planReadiness && plan ? (
              <View style={{ flexDirection: "row", justifyContent: "flex-end", alignItems: "center" }}>
                <Ring value={rx.readiness} size={44} color={readyColor(rx.readiness, C)} track={C.line}>
                  <Text style={{ fontFamily: F.black, fontSize: fs.body, color: C.chalk }}>{rx.readiness}</Text>
                </Ring>
              </View>
            ) : null}
            {plan ? (
              <>
                <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: 22, color: C.chalk, marginTop: 8 }}>{plan.planName}</Text>
                {/* One anchor — "how far in" — carried by a thin bar, not four
                    overlapping restatements of the same position. */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("w.home.today.day")} {plan.dayIndex + 1} / {plan.totalDays}</Text>
                  <View style={{ flex: 1, height: 2, backgroundColor: C.line, borderRadius: 2, overflow: "hidden" }}>
                    <View style={{ height: "100%", width: `${Math.min(100, Math.round(((plan.dayIndex + 1) / plan.totalDays) * 100))}%`, backgroundColor: C.lime }} />
                  </View>
                </View>
                {/* Lift reveal: the first lift reads clear; the rest stay sharp but
                    dissolve — a transparent→card gradient melts them into the card
                    (no blur), so it teases "there's more" at a fixed height.
                    Expanding clears the dissolve and unfolds the rest. Mirrors web
                    today.tsx (which uses an alpha mask for the same effect). */}
                {(() => {
                  const rows = plan.rows;
                  const many = rows.length > 1;
                  const LiftRow = ({ r, i }: { r: (typeof rows)[number]; i: number }) => (
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm, paddingTop: 6, marginTop: 6, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
                      <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk, flex: 1 }}>{r.session ? <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{r.session}  </Text> : null}{r.name}{r.note ? <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}> ({r.note})</Text> : null}</Text>
                      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, textAlign: "right", flexShrink: 0 }}>{r.detail}</Text>
                    </View>
                  );
                  return (
                    <>
                      {rows[0] && <LiftRow r={rows[0]} i={0} />}
                      {many && !liftsOpen && (
                        <View style={{ position: "relative" }}>
                          {rows.slice(1, 4).map((r, i) => (
                            <LiftRow key={i} r={r} i={i + 1} />
                          ))}
                          <LinearGradient colors={["transparent", "transparent", C.ink2]} locations={[0, 0.16, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
                          <Pressable onPress={() => setLiftsOpen(true)} hitSlop={6} style={{ position: "absolute", bottom: 0, alignSelf: "center", backgroundColor: `${C.lime}24`, borderWidth: 1, borderColor: `${C.lime}66`, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 }}>
                            <Text style={{ fontFamily: F.mono, fontSize: 11.5, fontWeight: "600", color: txt(C, C.lime) }}>{t("w.home.today.showAllLifts")} {rows.length} {t("w.home.today.liftsWord")} →</Text>
                          </Pressable>
                        </View>
                      )}
                      {liftsOpen && rows.slice(1).map((r, i) => <LiftRow key={i} r={r} i={i + 1} />)}
                      {many && liftsOpen && (
                        <Pressable onPress={() => setLiftsOpen(false)} hitSlop={6} style={{ marginTop: 12, alignSelf: "center" }}>
                          <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ash }}>{t("w.home.today.hideLifts")}</Text>
                        </Pressable>
                      )}
                    </>
                  );
                })()}
                {!isAthlete && (
                  <Pressable
                    onPress={() => { track(FUNNEL.upgradeEntryClick, { client: "mobile", source: "today-plan" }); router.push("/upgrade"); }}
                    style={{ marginTop: 12, padding: 11, borderRadius: 0, borderWidth: 1, borderStyle: "dashed", borderColor: `${pa.fill}66` }}
                  >
                    <Text style={{ fontFamily: F.mono, fontSize: 11.5, lineHeight: 16, color: C.ash }}><Text style={{ color: pa.text }}>[note]</Text> {t("w.home.today.followingAsWritten1")}{t("w.home.today.unlockFull")}{t("w.home.today.followingAsWritten2")}</Text>
                  </Pressable>
                )}
                {/* Primary action anchored at the BOTTOM of the plan card, below the note. */}
                <Pressable onPress={startPrescribed} style={({ pressed }) => ({ marginTop: 14, backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingVertical: 13, alignItems: "center", ...startGlow(C.lime, pressed) })}>
                  <CtaLabel label={t("w.home.today.start")} color={C.onAccent} fontSize={fs.bodyLg} />
                </Pressable>
                {/* Quiet secondary — reach the Quick-start sheet without leaving the
                    plan: on a plan the four "Train your way" cards aren't shown, so
                    this is the on-plan door to a saved routine (a session off-plan). */}
                <Pressable onPress={() => setQuickStartOpen(true)} style={{ marginTop: 10, paddingVertical: 2, alignItems: "center" }}>
                  <Text style={{ fontFamily: F.mono, fontSize: 11.5, color: txt(C, C.violet) }}>⚡ {t("w.home.today.quickStartLink")}</Text>
                </Pressable>
              </>
            ) : initialLoad ? (
              /* Cold start — sessions AND enrollment are still loading, so we
                 can't yet tell an enrolled athlete from a first-run one. Show a
                 skeleton (not the chooser) so the plan simply appears once it
                 resolves, with no first-run-chooser flash between. */
              <>
                <View style={{ height: 24, width: "60%", borderRadius: 8, backgroundColor: C.line, opacity: 0.5, marginTop: 8, marginBottom: 10 }} />
                <View style={{ height: 12, width: "90%", borderRadius: 6, backgroundColor: C.line, opacity: 0.35 }} />
              </>
            ) : (
              /* Every other state renders OUTSIDE this card: the first-run
                 chooser and logbook mode (plan-less history, premium included)
                 sit directly on the page above. This card only carries the plan
                 hero + the cold-start skeleton. */
              null
            )}
          </ACard>
        )}

        {/* EXERCISES — the favourites widget rail (free for everyone):
            swipeable full-bleed cards, one favourite per purpose, stock-ticker
            deltas; tap opens that movement's own stats page. Hidden until
            there's history — an empty rail would just be chrome. */}
        {sessions.length > 0 && (
          <ExerciseWidgetRail
            sessions={sessions}
            onOpen={(name) => router.push(`/exercise?name=${encodeURIComponent(name)}`)}
            onAll={() => router.push("/exercises")}
          />
        )}

        {/* DONE TODAY — every session logged on the VIEWED day, one row each:
            the plan's workout (wearing a Plan tag, lime tile) AND the off-plan
            extras (teal tile — quick sport logs, freestyle sessions). The card
            above is the SCHEDULED day (Start / Skip / Postpone); this one is
            what was actually done, complete — the count and the rows always
            agree. Always rendered — empty it explains itself — and it leads
            with the day's done count as its display-weight stat (moved in from
            the feeling card). Follows the week rail's selected day (dayTs) —
            on another day the label carries the date and the log row hides
            (quick logs save at "now"). Hidden only for a true first run (no
            plan, nothing ever logged): the first-run chooser
            above already owns that state, and a 0-count card under it would be
            a second competing log CTA. */}
        {(!!sched || sessions.length > 0) && (
          <AlsoTodayCard
            C={C}
            rows={doneOnDay}
            planIds={fulfilledIds}
            doneCount={doneOnDay.length}
            isToday={dayIsToday}
            dayLabel={dayLabel}
            units={units}
            bw={bw}
            onOpen={(id) => router.push(`/session/${id}`)}
            onLog={() => setQuickOpen(true)}
            onDone={() => setDoneOpen(true)}
          />
        )}

        {/* TIER 2 — the feeling-led card: the daily check-in IS the ritual. The
            four faces set the day's readiness inline (one tap, no sheet) —
            nothing else; the done count + log action live on the Also Today card
            above. Follows the rail's selected day: a past day shows (and can
            back-log) THAT day's feeling; a future day is read-only. */}
        <FeelingCard
          C={C}
          feeling={feeling}
          loggedAt={feelingAt}
          cooldownFrom={lastCheckinAt}
          isToday={dayIsToday}
          isFuture={dayIsFuture}
          dayTs={railDay?.ts ?? null}
          dayLabel={dayLabel}
          onPicked={loadFeeling}
        />

        {/* ───── GO FULL — Cockpit + Sport premium baits (sand = premium upsell).
            Explore-standard section head (bold display title); the ✦ stays —
            it's the semantic premium signifier, not a decorative marker. ───── */}
        <View style={{ marginTop: 24, marginBottom: 12, marginHorizontal: 2 }}>
          <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: 18, color: C.chalk }}><Text style={{ color: pa.text }}>✦</Text> {t("w.home.today.goFull")}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <AccessCard C={C} title={t("w.home.today.cockpitTitle")} sub={isAthlete ? t("w.home.today.cockpitSub") : t("w.home.today.cockpitLockSub")} locked={!isAthlete} onPress={() => (isAthlete ? router.push("/(tabs)/cockpit") : goUpgrade("today-cockpit"))} />
          <AccessCard C={C} title={t("w.home.today.sportTitle")} sub={isAthlete ? t("w.home.today.sportSub") : t("w.home.today.sportLockSub")} locked={!isAthlete} onPress={() => (isAthlete ? router.push("/(tabs)/sport") : goUpgrade("today-sport"))} />
        </View>

        {/* ───── RECOVER & MORE — the nutrition Fuel summary + deferred rows
            (coaches). Explore-standard section head — no marker dot. ───── */}
        <View style={{ marginTop: 24, marginBottom: 12, marginHorizontal: 2 }}>
          <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: 18, color: C.chalk }}>{t("w.home.today.recoverMore")}</Text>
        </View>
        {/* FUEL — the nutrition summary widget (one calendar-style stateful
            surface: empty → refuel / on-track / over → goal-hit, with a
            persistent quick-log rail). Real today only; nutrition targets are
            always today's. State + macros come from @hybrid/core fuelToday() so
            web matches. Tapping opens the same quick-add sheet the rows use. */}
        {dayIsToday && <AuroraFuel sessions={sessions} onOpen={() => setNutritionOpen(true)} />}
        <View style={{ gap: 10, marginTop: 10 }}>
          <DeferRow C={C} icon="user" tint={C.ash} title={t("w.home.today.rowCoach")} sub={t("w.home.today.rowCoachSub")} onPress={() => setCoachOpen(true)} />
        </View>

        </Animated.View>
      </ScrollView>

      {/* QUICK LOG sheet — the sport-log carousel, opened from the glance strip. */}
      <Sheet visible={quickOpen} onClose={() => setQuickOpen(false)} title={t("w.home.quickSport.title")} sub={t("w.home.quickSport.sub")}>
        <View style={{ marginTop: 14 }}>
          <QuickSportLog sessions={sessions} onSaved={() => { load(); setQuickOpen(false); }} solid />
        </View>
      </Sheet>

      {/* NUTRITION sheet — the compact "Add a meal" quick-add + premade meals. */}
      <Sheet visible={nutritionOpen} onClose={() => setNutritionOpen(false)}>
        <AuroraNutrition
          compact
          onNavigateFull={() => { setNutritionOpen(false); router.push("/nutrition"); }}
          onUpgrade={() => { setNutritionOpen(false); goUpgrade("today-nutrition-sheet"); }}
        />
      </Sheet>

      {/* FOLLOW A COACH sheet — the coach rail (renders its own header). */}
      <Sheet visible={coachOpen} onClose={() => setCoachOpen(false)}>
        <CoachRail onOpen={() => { setCoachOpen(false); router.push("/coaches"); }} />
      </Sheet>

      {/* QUICK START sheet — re-launch a saved routine (favourites + rediscover). */}
      <QuickStartSheet
        visible={quickStartOpen}
        onClose={() => setQuickStartOpen(false)}
        routines={routines ?? []}
        onLaunch={launchRoutine}
        onToggleFavourite={toggleFavourite}
        onBuildNew={() => router.push("/builder")}
      />

      {/* DONE TODAY sheet — everything logged on the viewed day + the calendar. */}
      <Sheet
        visible={doneOpen}
        onClose={() => setDoneOpen(false)}
        title={dayIsToday ? t("w.home.today.doneModalTitle") : t("w.home.today.glanceDoneOn").replace("{d}", dayLabel ?? "")}
        sub={dayIsToday ? `${dateStr}${acc.streak.current > 0 ? ` – 🔥 ${acc.streak.current}${t("w.home.today.dayStreak")}` : ""}` : dayLabel ?? ""}
      >
        <View style={{ marginTop: 12 }}>
          {doneOnDay.length === 0 ? (
            <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.ash, lineHeight: 20, paddingVertical: 8 }}>{t(dayIsToday ? "w.home.today.doneModalEmpty" : "w.home.today.doneModalEmptyDay")}</Text>
          ) : doneOnDay.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => { setDoneOpen(false); router.push(`/session/${s.id}`); }}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line }}
            >
              <View style={{ width: 30, height: 30, borderRadius: 999, backgroundColor: `${C.lime}2e`, borderWidth: 1, borderColor: C.lime, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontFamily: F.black, fontSize: 14, color: txt(C, C.lime) }}>✓</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{s.title}</Text>
                <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 2 }}>{sessionMeta(s, units, bw(s.startedAt))}</Text>
              </View>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.lime) }}>{t("w.home.today.doneView")} ›</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => { setDoneOpen(false); router.push("/calendar"); }} style={{ marginTop: 16, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingVertical: 14, alignItems: "center" }}>
            <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>📅 {t("w.home.today.doneCalendar")}</Text>
          </Pressable>
        </View>
      </Sheet>
    </SafeAreaView>
  );
}


// One row of the first-session chooser (#3): a tappable option with a title, a
// one-line sub, and a Free/Full badge.
// One card of the first-run chooser — the Go-Full AccessCard anatomy (corner
// glow, title, body, CTA at the bottom in mono uppercase) turned toward the
// beginner, tinted by the path's accent. Full-width in a stacked column at
// natural height; the hue lives in the small glyph + CTA only — title and
// body stay neutral. Mirrored on web (aurora/today.tsx ChooserCard).
function ChooserCard({ C, glyph, accent, title, sub, cta, onPress }: { C: P; glyph: string; accent: string; title: string; sub: string; cta: string; onPress: () => void }) {
  const { scheme } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={{ backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 24, padding: 20, overflow: "hidden" }}>
      {/* path-accent glow blooming from the top-right corner (Go-Full anatomy) */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: `${accent}0d` }]} />
      <LinearGradient pointerEvents="none" colors={[`${accent}2b`, `${accent}00`]} start={{ x: 1, y: 0 }} end={{ x: 0.25, y: 0.8 }} style={StyleSheet.absoluteFill} />
      <Text style={{ fontSize: 18, lineHeight: 20, color: txt(C, accent) }}>{glyph}</Text>
      <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: 19, letterSpacing: -0.3, color: C.chalk, marginTop: 10 }}>{title}</Text>
      <Text style={{ fontFamily: F.reg, fontSize: fs.note, color: C.ash, marginTop: 6, lineHeight: 18 }}>{sub}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1.3, textTransform: "uppercase", color: txt(C, accent), marginTop: 14 }}>{cta} →</Text>
    </Pressable>
  );
}

// The chooser, demoted — once real history exists the three full onboarding
// cards become a horizontal snap slider under a quiet "Train your way" head
// (logbook mode): each card keeps the ChooserCard's Go-Full anatomy (corner
// glow, glyph, title, sub, mono CTA) at rail width, so the options stay
// reachable without re-onboarding a regular every day.
// Mirrored on web (aurora/today.tsx StructureCard).
function StructureCard({ C, width, glyph, accent, title, sub, cta, onPress }: { C: P; width: number; glyph: string; accent: string; title: string; sub: string; cta: string; onPress: () => void }) {
  const { scheme } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={{ width, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 24, padding: 18, overflow: "hidden" }}>
      {/* path-accent glow blooming from the top-right corner (ChooserCard anatomy) */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: `${accent}0d` }]} />
      <LinearGradient pointerEvents="none" colors={[`${accent}2b`, `${accent}00`]} start={{ x: 1, y: 0 }} end={{ x: 0.25, y: 0.8 }} style={StyleSheet.absoluteFill} />
      <Text style={{ fontSize: 15, lineHeight: 17, color: txt(C, accent) }}>{glyph}</Text>
      <Text numberOfLines={1} style={{ fontFamily: serifIf(scheme, F.black), fontSize: 18, letterSpacing: -0.3, color: C.chalk, marginTop: 10 }}>{title}</Text>
      <Text numberOfLines={1} style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, marginTop: 4 }}>{sub}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: txt(C, accent), marginTop: 12 }}>{cta} →</Text>
    </Pressable>
  );
}

// One-line meta for a session logged today — sport-adaptive so a run/match reads
// as distance·time (not the gym Sets/Volume framing) and a lift reads as tonnage.
function sessionMeta(s: LoggedSession, units: "kg" | "lb", bw?: number | null): string {
  if (sessionShape(s) !== "strength") {
    const ct = sessionCardioTotals(s.blocks);
    const p: string[] = [];
    if (ct.distanceKm) p.push(`${ct.distanceKm.toFixed(1)} km`);
    if (ct.minutes) p.push(`${ct.minutes} min`);
    if (p.length) return p.join(" – ");
    return s.blocks.map((b) => b.name).join(" – ");
  }
  const vol = sessionVolume(s.blocks, false, bw);
  const names = s.blocks.map((b) => b.name).join(" – ");
  return vol > 0 ? `${fmtTonnage(vol, units)} – ${names}` : names;
}

// The "Also today" card, "number is the card" redesign: the day's TOTAL done
// count (plan + off-plan) is the card's display-weight headline — the whole
// stat strip taps through to the Done-Today sheet — with EVERY done session as
// a row beneath it (the count and the rows always agree: a plan-claimed row
// wears a lime tile + Plan tag, an off-plan one the teal tile) and the log
// action as a ghost row in the same vocabulary. Always rendered: empty, the
// numeral reads 0 and the sub-line does the inviting. Line-free inside
// (surface fills + spacing, no hairlines/outlines/chips/pills) — the card's
// own edge is the only border, with one deliberate exception: the ghost ＋
// tile wears a dashed outline (the add affordance).
// Rows open the session's breakdown. Mirrored on web (aurora/today.tsx).
function AlsoTodayCard({ C, rows, planIds, doneCount, isToday, dayLabel, units, bw, onOpen, onLog, onDone }: {
  C: P;
  rows: LoggedSession[];
  planIds: Set<string>;
  doneCount: number;
  /** false when the week rail has another day selected — the label carries the
   *  date and the log row hides (a quick log always saves at "now"). */
  isToday: boolean;
  dayLabel: string | null;
  units: "kg" | "lb";
  bw: (isoDate?: string) => number | null;
  onOpen: (sessionId: string) => void;
  onLog: () => void;
  onDone: () => void;
}) {
  const { t } = useLang();
  const quiet = withAlpha(C.ash, 0.6);
  // caption + log-label state machine lives in core so the web twin can't drift
  const copy = alsoTodayCopy({ doneCount, isToday });
  const logLabel = t(copy.logKey);
  const doneLabel = isToday ? t("w.home.today.glanceDone") : t("w.home.today.glanceDoneOn").replace("{d}", dayLabel ?? "");
  return (
    <View style={{ marginTop: 16, borderWidth: 1, borderColor: C.line, borderRadius: 22, padding: 18, backgroundColor: C.ink2 }}>
      {/* stat strip — the number IS the card (tap = the Done-Today sheet) */}
      <Pressable onPress={onDone} accessibilityRole="button" accessibilityLabel={`${doneCount} ${doneLabel}${copy.subKey ? `, ${t(copy.subKey)}` : ""}`} style={{ flexDirection: "row", alignItems: "center", gap: 16, paddingTop: 6, paddingBottom: 4 }}>
        <Text style={{ fontFamily: F.black, fontSize: 44, letterSpacing: -2, lineHeight: 44, color: doneCount > 0 ? C.chalk : quiet }}>{doneCount}</Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.6, textTransform: "uppercase", color: C.ash }}>{doneLabel}</Text>
          {copy.subKey ? <Text style={{ fontFamily: F.mono, fontSize: 11, lineHeight: 16, color: quiet, marginTop: 6 }}>{t(copy.subKey)}</Text> : null}
        </View>
        <Text style={{ fontFamily: F.mono, fontSize: 16, color: quiet }}>→</Text>
      </Pressable>
      {/* rows + the ghost action row — one vocabulary, separated by space alone */}
      <View style={{ marginTop: 14, gap: 4 }}>
        {rows.map((s) => {
          const onPlanRow = planIds.has(s.id);
          return (
            <Pressable key={s.id} onPress={() => onOpen(s.id)} accessibilityRole="button" accessibilityLabel={s.title} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 }}>
              <View style={{ width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: withAlpha(onPlanRow ? C.lime : C.blue, 0.16) }}>
                <Text style={{ fontSize: 18 }}>{sessionIcon(s)}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{s.title}</Text>
                <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 2 }}>{[sessionMeta(s, units, bw(s.startedAt)), sessionClockTime(s.startedAt)].filter(Boolean).join(" – ")}</Text>
              </View>
              {onPlanRow ? (
                <Text style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: 1, textTransform: "uppercase", color: txt(C, C.lime) }}>{t("w.home.today.kPlan")}</Text>
              ) : null}
            </Pressable>
          );
        })}
        {isToday ? (
          <Pressable onPress={onLog} accessibilityRole="button" accessibilityLabel={logLabel} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 }}>
            <View style={{ width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", borderWidth: 1, borderStyle: "dashed", borderColor: withAlpha(C.ash, 0.4) }}>
              <Text style={{ fontSize: 17, color: C.ash }}>＋</Text>
            </View>
            <Text style={{ fontFamily: F.monoBold, fontSize: 12, color: txt(C, C.lime) }}>{logLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

// A deferred row (Tier 3) — a slim tap-through to a secondary surface
// (Nutrition, Coaches) as an "airy band": a roomy tap-target on the real palette
// surface (ink2 + hairline), with a crafted icon tile drawn on the darker ink so
// it lifts off the row, a display title and a mono descriptor. Same material
// vocabulary as the cards above it, just laid out with more air.
function DeferRow({ C, icon, tint, title, sub, onPress }: { C: P; icon: AuroraIconName; tint: string; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 18 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14, flex: 1 }}>
        <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
          <AuroraIcon name={icon} size={20} color={txt(C, tint)} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{title}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 3 }}>{sub}</Text>
        </View>
      </View>
      <Text style={{ fontFamily: F.mono, fontSize: fs.subtitle, color: `${C.ash}8c` }}>›</Text>
    </Pressable>
  );
}

// A compact quick-access tile (Cockpit / Sport). A `locked` tile carries the ✦
// Full accent + a lime rim; an unlocked one shows the → chevron.
// The feeling-led daily card — "How ready do you feel?" with the four faces set
// the day's readiness inline (one tap → createCheckin, the same write the full
// check-in makes). Single-purpose: the done count + log action moved up into the
// Also Today card. The picked face lights in its own semantic feeling colour.
// Day-scoped via the week rail: a past day shows THAT day's feeling and a tap
// back-logs it (weekOf = that day); a future day is read-only. The 6h re-log
// cooldown mirrors the server's — global across days (keyed on the last WRITE),
// so `cooldownFrom` is the newest check-in's createdAt, not the viewed day's.
function FeelingCard({ C, feeling, loggedAt, cooldownFrom, isToday, isFuture, dayTs, dayLabel, onPicked }: {
  C: P;
  feeling: ReadinessFeeling | null;
  loggedAt: number | null;
  cooldownFrom: number | null;
  isToday: boolean;
  isFuture: boolean;
  dayTs: number | null;
  dayLabel: string | null;
  onPicked: () => void;
}) {
  const { t } = useLang();
  const revalidate = useRevalidate();
  const [busy, setBusy] = useState(false);
  // The guided rest of the check-in, expanded IN PLACE. The one-tap face above
  // answers Energy (step 1); opening this walks Sleep → Soreness → Mood →
  // details without ever leaving Today.
  const [logMoreOpen, setLogMoreOpen] = useState(false);
  // The 6h re-log window: while open, show "next in Xh Ym". The faces lock
  // while cooling (the server would reject the write anyway) and on future days.
  const coolMs = cooldownFrom != null ? checkinCooldownRemainingMs(cooldownFrom) : 0;
  const cooling = coolMs > 0;
  // A day that ALREADY has a check-in can be re-tapped to adjust it — the server
  // upserts the same day (cooldown-exempt). The 6h cooldown only locks STARTING
  // a fresh check-in on a day that has none yet (a new-day create would 429).
  const blockingCooldown = cooling && !feeling;
  const locked = busy || isFuture || blockingCooldown;
  const coolMin = Math.ceil(coolMs / 60000);
  const coolH = Math.floor(coolMin / 60);
  const coolM = coolMin % 60;
  const pick = async (rating: number) => {
    if (locked) return;
    setBusy(true);
    // Back-logging a past day stamps that day's noon (local) so the check-in
    // lands on the viewed date regardless of timezone; today logs "now".
    const weekOf = isToday || dayTs == null ? new Date().toISOString() : new Date(dayTs + 12 * 3600 * 1000).toISOString();
    const r = await createCheckin({
      weekOf,
      bodyMassKg: null,
      energy: rating, sleep: rating, soreness: rating, mood: rating,
      adherencePct: null, note: null, sharedWithCoach: false,
    });
    setBusy(false);
    if (r.ok) {
      // Re-answering the headline question invalidates an open guided flow — its
      // prefill was read from the PREVIOUS row, so submitting it would write the
      // old values back. Collapse; re-opening re-reads the row.
      setLogMoreOpen(false);
      revalidate.recovery();
      onPicked();
    }
  };
  return (
    <View style={{ marginTop: 16, borderWidth: 1, borderColor: C.line, borderRadius: 22, padding: 18, backgroundColor: C.ink2 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, letterSpacing: -0.2, color: C.chalk }}>{t("w.recovery.readiness.title")}</Text>
        {/* viewing another day — the date names the scope, no extra copy */}
        {!isToday && dayLabel ? <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{dayLabel}</Text> : null}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 16, marginBottom: 2 }}>
        {READINESS_FEELINGS.map((key, i) => {
          const on = feeling === key;
          const accent = txt(C, C[READINESS_FACE[key].accent]);
          return (
            <Pressable key={key} onPress={() => pick(i + 2)} disabled={locked} accessibilityRole="button" accessibilityState={{ selected: on, disabled: locked }} accessibilityLabel={t(`w.recovery.readiness.${key}`)}
              style={{ flex: 1, alignItems: "center", gap: 8, paddingVertical: 10, marginHorizontal: 2, borderRadius: 16, borderWidth: 1, borderColor: on ? `${accent}66` : "transparent", backgroundColor: on ? `${accent}1f` : "transparent", opacity: locked && !on ? 0.45 : 1 }}>
              <ReadinessFace feeling={key} />
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.6, textTransform: "uppercase", color: on ? accent : C.ash }}>{t(`w.recovery.readiness.${key}`)}</Text>
            </Pressable>
          );
        })}
      </View>
      {/* the day's logged feeling + the re-log cooldown chip. The chip also shows
          alone while cooling (it explains why the faces are locked on a day
          without its own check-in). */}
      {(feeling && loggedAt != null) || blockingCooldown ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 }}>
          {feeling && loggedAt != null ? (
            <Text style={{ flexShrink: 1, fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>
              {t("w.home.today.feelLogged")} <Text style={{ fontFamily: F.bold, color: C.chalk }}>{t(`w.recovery.readiness.${feeling}`)}</Text>, {relativeTime(loggedAt)}
            </Text>
          ) : null}
          {blockingCooldown ? (
            <View style={{ marginLeft: "auto", borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: 0.8, textTransform: "uppercase", color: C.ash }}>{t("w.home.today.feelNextIn")} {coolH}h {coolM}m</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      {/* Once today's readiness is set, nudge the athlete to log the fuller
          picture — and run that guided check-in RIGHT HERE. The one-tap face is
          step 1 (Energy); the expansion walks the remaining four cards (Sleep,
          Soreness, Mood, then weight/adherence/note) and refines TODAY's row, so
          the whole ritual lives on Today — no trip to the More tab, no second
          entry, no cooldown block. */}
      {isToday && feeling ? (
        <>
          <Pressable
            onPress={() => setLogMoreOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: logMoreOpen }}
            accessibilityLabel={t("w.recovery.readiness.logMore")}
            style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: `${txt(C, C.lime)}12`, borderWidth: 1, borderColor: `${txt(C, C.lime)}42` }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{t("w.recovery.readiness.logMore")}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 3 }}>{logMoreOpen ? t("w.recovery.readiness.logMoreOpenSub") : t("w.recovery.readiness.logMoreSub")}</Text>
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: fs.subtitle, color: txt(C, C.lime), transform: [{ rotate: logMoreOpen ? "90deg" : "0deg" }] }}>→</Text>
          </Pressable>
          {logMoreOpen ? (
            <View style={{ marginTop: 14, paddingTop: 16, borderTopWidth: 1, borderTopColor: C.line }}>
              <AuroraCheckin
                embedded
                startStep={1}
                onDone={() => { setLogMoreOpen(false); onPicked(); }}
              />
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function AccessCard({ C, title, sub, locked, onPress }: { C: P; title: string; sub: string; locked: boolean; onPress: () => void }) {
  const { scheme } = useTheme();
  const pa = usePremiumAccent();
  const { t } = useLang();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={{ flex: 1, minHeight: 220, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 24, padding: 20, overflow: "hidden" }}>
      {/* premium-accent glow (admin-set) blooming from the top-right corner */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: `${pa.fill}0d` }]} />
      <LinearGradient pointerEvents="none" colors={[`${pa.fill}2b`, `${pa.fill}00`]} start={{ x: 1, y: 0 }} end={{ x: 0.25, y: 0.8 }} style={StyleSheet.absoluteFill} />
      <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: 24, letterSpacing: -0.4, color: C.chalk }}>{title}</Text>
      {/* body grows so the CTA pins to the bottom — both cards stretch to equal
          height (row alignItems:stretch), so title, body-start and CTA line up
          across the pair regardless of how many lines the copy runs. Body is the
          display face (per tokens: display = headings + body, mono = labels). */}
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash, marginTop: 10, lineHeight: 20 }}>{sub}</Text>
      </View>
      <Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1.3, textTransform: "uppercase", color: pa.text, marginTop: 18 }}>{locked ? t("w.home.today.cardUnlock") : t("w.home.today.cardOpen")} →</Text>
    </Pressable>
  );
}


