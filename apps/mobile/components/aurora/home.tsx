import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl, Animated, Easing, Modal, useWindowDimensions, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  prescribeSession,
  prescribeForSport,
  reconcilePlan,
  buildTrainingWeek,
  trainingDaysPerWeek,
  weekNeedsResync,
  currentPhase,
  computeAccountability,
  weekAdherence,
  buildActivityFeed,
  planProgramToday,
  FUNNEL,
  toTrainingLog,
  toBiometrics,
  velocityProfiles,
  readinessRole,
  sessionsOnDay,
  sessionShape,
  sessionCardioTotals,
  sessionVolume,
  fmtTonnage,
  SECTION_COLOR,
  SPORTS,
  LEVELS,
  type LoggedSession,
  type Macrocycle,
  type Experience,
  type Equipment,
} from "@hybrid/core";
import { fetchAssignments, fetchMacrocycle, createSelfAssignments, updateAssignment, type Assignment, type CoreSignal } from "../../lib/api";
import { useSessionsQuery, useSignalsQuery } from "../../lib/queries";
import { useSession } from "../../lib/session";
import { usePersona, useHasActiveCoach } from "../../lib/persona";
import { usePlanMaxes } from "../../lib/plan-maxes";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, roleColor } from "../../lib/theme";
import { fs, space, F, serifIf } from "../../lib/ui";
import { track } from "../../lib/track";
import { ACard, AuroraField, RADIUS, Ring } from "./kit";
import { auroraScrollClearance } from "../../lib/layout";
import { AuroraIcon } from "./icons";
import AuroraAiCoach from "./ai-coach";
import CoachRail from "./coach-rail";
import FeedPreview from "./feed-preview";
import Stories from "./stories";
import TodayWidgets from "./today-quick";
import Tour, { FIRST_RUN_TOUR } from "../tour";
import QuickSportLog from "../quick-sport";
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
  const { t } = useLang();
  const router = useRouter();
  const { name } = useSession();
  const isAthlete = usePersona() !== "casual";
  // Coached (free) client: read-only view of the coach-assigned plan.
  const coached = useHasActiveCoach();
  const readOnlyPlan = coached && !isAthlete;
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Sessions + signals from the shared cache; the rest stay home-local.
  const { data: sessions = [], refetch: refetchSessions } = useSessionsQuery();
  const { data: signals = [], refetch: refetchSignals } = useSignalsQuery();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [macro, setMacro] = useState<Macrocycle | null>(null);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [planId, setPlanId] = useState<string | null>(null);
  const [sportSel, setSportSel] = useState<{ sport: string; levelIdx: number } | null>(null);
  const [prefDays, setPrefDays] = useState<number | undefined>(undefined);
  const [prefExp, setPrefExp] = useState<Experience | undefined>(undefined);
  const [prefEquip, setPrefEquip] = useState<Equipment | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);
  // TIER-2 glance strip modals: Quick Log (sport carousel) + Done today (a
  // pop-up list of everything logged today, with a link to the full calendar).
  const [quickOpen, setQuickOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);

  const load = useCallback(() => {
    setRefreshing(true);
    Promise.all([fetchAssignments(), fetchMacrocycle(), refetchSessions(), refetchSignals()])
      .then(([a, m]) => {
        setAssignments(a);
        setMacro(m?.macro ?? null); setCurrentWeek(m?.currentWeek ?? 1); setPlanId(m?.planId ?? null);
      })
      .catch((err) => console.error("Failed to load home data:", err))
      .finally(() => setRefreshing(false));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Subtle entrance — content fades + rises each time Today gains focus, matching
  // the AuroraScreen transition so the home doesn't hard-cut in.
  const enter = useRef(new Animated.Value(0)).current;
  useFocusEffect(
    useCallback(() => {
      enter.setValue(0);
      const anim = Animated.timing(enter, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true });
      anim.start();
      return () => anim.stop();
    }, [enter]),
  );
  const enterStyle = { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] };

  // Onboarding prefs that tailor the prescription (client-only).
  useEffect(() => {
    AsyncStorage.getItem("hybrid.sport").then((raw) => {
      if (!raw) return;
      try {
        const s = JSON.parse(raw) as { sport?: string; levelIdx?: number } | null;
        if (s?.sport && SPORTS[s.sport]) {
          const lvl = typeof s.levelIdx === "number" && s.levelIdx >= 0 && s.levelIdx < LEVELS.length ? s.levelIdx : 0;
          setSportSel({ sport: s.sport, levelIdx: lvl });
        }
      } catch { /* ignore */ }
    }).catch(() => {});
    AsyncStorage.getItem("hybrid.daysPerWeek").then((raw) => { const n = Number(raw); if (Number.isFinite(n) && n > 0) setPrefDays(n); }).catch(() => {});
    AsyncStorage.getItem("hybrid.experience").then((v) => { if (v === "beginner" || v === "intermediate" || v === "advanced") setPrefExp(v); }).catch(() => {});
    AsyncStorage.getItem("hybrid.equipment").then((v) => { if (v === "full" || v === "home" || v === "minimal") setPrefEquip(v); }).catch(() => {});
  }, []);

  const bio = useMemo(() => toBiometrics(signals as unknown as Parameters<typeof toBiometrics>[0]), [signals]);
  const log = useMemo(() => toTrainingLog(sessions), [sessions]);
  const rx = useMemo(
    () => prescribeSession(log, bio, { profiles: velocityProfiles(sessions), experience: prefExp, equipment: prefEquip }),
    [log, sessions, bio, prefExp, prefEquip],
  );
  const acc = useMemo(() => computeAccountability(sessions, { targetPerWeek: 3 }), [sessions]);
  // Target = the athlete's real weekly cadence (not a flat 3), floored at done.
  const adherence = useMemo(() => weekAdherence(sessions, trainingDaysPerWeek(sessions, { fallback: prefDays ?? 3 })), [sessions, prefDays]);
  const phase = useMemo(() => (macro ? currentPhase(macro, currentWeek) : null), [macro, currentWeek]);
  const planMaxes = usePlanMaxes();
  const plan = useMemo(() => planProgramToday(planId, sessions.length, planMaxes), [planId, sessions.length, planMaxes]);
  const hasData = sessions.length > 0;
  const units = useLoggerPrefs().units;
  // Sessions logged TODAY — the confirmation loop (a finished session OR a quick
  // sport log both land here the moment they save).
  const doneToday = useMemo(() => sessionsOnDay(sessions), [sessions]);
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

  // Reconciled "This week" — macrocycle phase arbitrates daily + sport transfer.
  const sportRx = useMemo(() => (sportSel ? prescribeForSport(sportSel.sport, sportSel.levelIdx, { sessions }) : undefined), [sportSel, sessions]);
  const reconciled = useMemo(() => (macro ? reconcilePlan({ macro, daily: rx, sport: sportRx, currentWeek }) : null), [macro, rx, sportRx, currentWeek]);
  // Coached read-only: the coach's plan AS WRITTEN (no readiness modulation).
  const rxAsWritten = useMemo(
    () => prescribeSession(log, undefined, { profiles: velocityProfiles(sessions), experience: prefExp, equipment: prefEquip }),
    [log, sessions, prefExp, prefEquip],
  );
  const reconciledView = useMemo(
    () => (macro ? (readOnlyPlan ? reconcilePlan({ macro, daily: rxAsWritten, sport: sportRx, currentWeek }) : reconciled) : null),
    [macro, readOnlyPlan, rxAsWritten, reconciled, sportRx, currentWeek],
  );
  const daysPerWeek = useMemo(() => trainingDaysPerWeek(sessions, { fallback: prefDays ?? 3 }), [sessions, prefDays]);

  const [scheduling, setScheduling] = useState(false);
  const [scheduled, setScheduled] = useState<string | null>(null);
  const autoSynced = useRef(0);
  const doSchedule = useCallback(async (auto: boolean) => {
    if (!reconciled || !macro || scheduling) return;
    setScheduling(true); setScheduled(null);
    const items = buildTrainingWeek({ macro, currentWeek, log, bio, profiles: velocityProfiles(sessions), sport: sportRx, daysPerWeek, experience: prefExp, equipment: prefEquip });
    const ok = await createSelfAssignments(items, true);
    setScheduled(ok ? `${auto ? t("w.home.recweek.autoResynced") : t("w.home.recweek.scheduled")} ${items.length} ${t("w.home.recweek.sessionsOffLogs")}` : t("w.home.recweek.couldntSchedule"));
    setScheduling(false);
    if (ok) load();
  }, [reconciled, macro, scheduling, currentWeek, log, bio, sessions, sportRx, daysPerWeek, prefExp, prefEquip, load]);

  // Auto re-sync once per newly-logged session (mirrors classic home).
  useEffect(() => {
    if (!reconciled || readOnlyPlan) return;
    const latest = sessions.reduce((m, s) => Math.max(m, Date.parse(s.startedAt) || 0), 0);
    if (!latest || latest <= autoSynced.current) return;
    autoSynced.current = latest;
    if (weekNeedsResync(assignments, sessions)) void doSchedule(true);
  }, [reconciled, assignments, sessions, doSchedule]);

  const upcoming = useMemo(
    () => assignments.filter((a) => a.status === "assigned").sort((x, y) => Date.parse(x.date) - Date.parse(y.date)).slice(0, 3),
    [assignments],
  );
  const markDone = async (id: string) => { await updateAssignment(id, "completed"); load(); };

  // Plan/AI-coach pager — track the active card so the dots signal the swipe.
  const cardW = width - 32; // 16px screen padding each side
  const [activeCard, setActiveCard] = useState(0);
  // THIS WEEK collapse — tap the Plan kicker to fold/unfold the reconciled plan.
  const [weekOpen, setWeekOpen] = useState(true);
  const onPagerScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setActiveCard(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, cardW + 12)));
  };

  const planReadiness = hasData || plan || phase;
  // The plan-card CTA follows YOUR PLAN when enrolled (source=plan prefills the
  // named plan's day), then the AI-prescribed session for PREMIUM athletes, then
  // an empty start. AI is paid-only, so casual/guests never get source=ai here.
  const startPrescribed = () =>
    router.push(plan ? "/workout?source=plan" : isAthlete && (hasData || phase) ? "/workout?source=ai" : "/workout?source=empty");

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
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: auroraScrollClearance(insets.bottom) }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={C.lime} />}>
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

        {/* STORIES — circle avatars (IG-style); leads with "Your story" */}
        <Stories name={name} youLabel={t("w.home.today.storyYou")} onOpen={() => router.push("/feed")} />

        {/* GREETING — the streak moved up to the header row, so this line breathes */}
        <View style={{ marginTop: 16 }}>
          <Text style={{ fontFamily: serifIf(scheme, F.bold), fontSize: 22, letterSpacing: -0.4, color: C.chalk }}>{greeting ? `${greeting}, ${firstName}` : " "}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ash }}>{dateStr || " "}</Text>
        </View>

        {/* ───── TRAIN ───── */}
        <Kicker C={C} k={t("w.home.today.kTrain")} h={t("w.home.today.kSession")} color={C[SECTION_COLOR.train]} />

        {/* PLAN TODAY ⇄ AI COACH — horizontal snapping pager + dots */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={cardW + 12}
          decelerationRate="fast"
          onMomentumScrollEnd={onPagerScroll}
          // align top so a shorter card (e.g. Plan today) keeps its NATURAL
          // height instead of stretching to match the taller AI-coach card —
          // otherwise the plan card renders mostly-empty tall whitespace.
          contentContainerStyle={{ gap: space.md, alignItems: "flex-start" }}
          style={{ marginTop: 14, marginHorizontal: -2 }}
        >
          {/* card 1 — plan today */}
          <ACard style={{ width: cardW }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1, color: C.ash, flex: 1 }}>
                {t("w.home.today.yourPlan")}{plan && !(isAthlete && planReadiness) ? t("w.home.today.asWritten") : ""}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
                {/* Readiness as a glanceable DIAL, not "95/100" digits to parse. */}
                {isAthlete && planReadiness ? (
                  <Ring value={rx.readiness} size={44} color={readyColor(rx.readiness, C)} track={C.line}>
                    <Text style={{ fontFamily: F.black, fontSize: fs.body, color: C.chalk }}>{rx.readiness}</Text>
                  </Ring>
                ) : null}
                <Pressable onPress={startPrescribed} style={{ backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingHorizontal: 14, paddingVertical: 8 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: C.onAccent }}>{t("w.home.today.start")}</Text>
                </Pressable>
              </View>
            </View>
            {plan ? (
              <>
                <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: 22, color: C.chalk, marginTop: 8 }}>{plan.planName}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginBottom: 8 }}>
                  {plan.day} · {t("w.home.today.day")} {plan.dayIndex + 1}/{plan.totalDays}{plan.kindLabel ? ` · ${plan.kindLabel}` : ""}{phase ? ` · ${phase.block.label} ${t("w.home.today.wk")} ${currentWeek}/${macro!.totalWeeks}` : ""}
                </Text>
                {plan.rows.map((r, i) => (
                  <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm, paddingTop: 6, marginTop: 6, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
                    <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk, flex: 1 }}>{r.name}{r.note ? <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}> · {r.note}</Text> : null}</Text>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, textAlign: "right", flexShrink: 0 }}>{r.detail}</Text>
                  </View>
                ))}
                {!isAthlete && (
                  <Pressable
                    onPress={() => { track(FUNNEL.upgradeEntryClick, { client: "mobile", source: "today-plan" }); router.push("/upgrade"); }}
                    style={{ marginTop: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.ms, padding: 10, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: `${C.lime}55`, backgroundColor: `${C.lime}14` }}
                  >
                    <Text style={{ fontFamily: F.mono, fontSize: 11.5, lineHeight: 16, color: C.chalk, flex: 1 }}>{t("w.home.today.followingAsWritten1")}{t("w.home.today.unlockFull")}{t("w.home.today.followingAsWritten2")}</Text>
                    <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: txt(C, C.lime) }}>→</Text>
                  </Pressable>
                )}
              </>
            ) : isAthlete && (hasData || phase) ? (
              /* PREMIUM only — the real readiness-driven AI prescription. Casual
                 and guests fall through to the encouraging chooser below (no
                 fabricated Back-Squat/Assault-Bike session presented as theirs). */
              <>
                <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: 22, color: C.chalk, marginTop: 8 }}>
                  {`${rx.blocks[0]?.name}${rx.blocks[1] ? ` + ${rx.blocks[1]?.name}` : ""}`}
                </Text>
                {phase && (
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 4 }}>
                    {t("w.home.today.goal")} {macro!.goalOrSport} · {phase.block.label} · {t("w.home.today.wk")} {currentWeek}/{macro!.totalWeeks}
                  </Text>
                )}
                <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, marginTop: 6, lineHeight: 19 }}>{rx.why}</Text>
              </>
            ) : (
              /* Not following a plan (or not premium) — an encouraging chooser:
                 enroll in a plan (free), build your own, or log a one-off. */
              <>
                <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: 22, color: C.chalk, marginTop: 8 }}>{t("w.home.today.howStart")}</Text>
                <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, marginTop: 6, lineHeight: 19 }}>
                  {t("w.home.today.howStartSub")}
                </Text>
                <View style={{ marginTop: 12, gap: space.sm }}>
                  <ChooserRow C={C} title={t("w.home.today.chooserFollowTitle")} sub={t("w.home.today.chooserFollowSub")} badge={t("w.home.today.badgeFree")} color={C.lime} onPress={() => router.push("/(tabs)/plans")} />
                  <ChooserRow C={C} title={t("w.home.today.chooserBuildTitle")} sub={t("w.home.today.chooserBuildSub")} badge={t("w.home.today.badgeFree")} color={C.lime} onPress={() => router.push("/builder")} />
                  <ChooserRow C={C} title={t("w.home.today.chooserLogTitle")} sub={t("w.home.today.chooserLogSub")} badge={t("w.home.today.badgeFree")} color={C.lime} onPress={() => router.push("/workout?source=empty")} />
                </View>
              </>
            )}
          </ACard>

          {/* card 2 — AI coach */}
          <ACard style={{ width: cardW }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1, color: C.ash }}>{t("w.home.today.aiCoach")}</Text>
            <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: 22, color: C.chalk, marginTop: 8 }}>{t("w.home.today.askCoach")}</Text>
            <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, marginTop: 6, marginBottom: 6, lineHeight: 19 }}>
              {t("w.home.today.aiCoachBlurb")}
            </Text>
            {/* Paid intelligence — casual sees the pitch + one upgrade tap.
                Athletes get the coach note INLINE (embedded — no nested screen
                /header/card, which previously double-wrapped this card). */}
            {isAthlete ? (
              <AuroraAiCoach embedded />
            ) : (
              <Pressable
                onPress={() => { track(FUNNEL.upgradeEntryClick, { client: "mobile", source: "today-aicoach" }); router.push("/upgrade"); }}
                style={{ marginTop: 6, backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingVertical: 11, alignItems: "center" }}
              >
                <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.onAccent }}>{t("w.home.today.unlockFullBtn")}</Text>
              </Pressable>
            )}
          </ACard>
        </ScrollView>

        {/* pager dots */}
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 7, marginTop: 10 }}>
          {[0, 1].map((i) => (
            <View key={i} style={{ width: activeCard === i ? 20 : 7, height: 7, borderRadius: 999, backgroundColor: activeCard === i ? C.lime : C.line }} />
          ))}
        </View>

        {/* TIER 2 — glanceable status strip: Quick Log · Readiness · Done today.
            Quick Log takes the day-streak's old slot (the streak lives in the header
            now); it opens the sport-log carousel, Readiness opens the daily check-in,
            and Done today opens a pop-up of everything logged today + the calendar. */}
        <View style={{ flexDirection: "row", backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 16, overflow: "hidden", marginTop: 16 }}>
          <Pressable onPress={() => setQuickOpen(true)} accessibilityRole="button" accessibilityLabel={t("w.home.today.glanceQuickLog")} style={{ flex: 1, paddingVertical: 13, alignItems: "center", borderRightWidth: 1, borderRightColor: C.line }}>
            <Text style={{ fontFamily: F.bold, fontSize: 15, color: txt(C, C.lime) }}>＋ {t("w.home.today.glanceLog")}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: C.ash, marginTop: 4 }}>{t("w.home.today.glanceQuickLog")}</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/checkin")} accessibilityRole="button" accessibilityLabel={t("w.home.today.glanceReadiness")} style={{ flex: 1, paddingVertical: 13, alignItems: "center", borderRightWidth: 1, borderRightColor: C.line }}>
            <Text style={{ fontFamily: F.bold, fontSize: 15, color: txt(C, C.blue) }}>{t("w.home.today.glanceReadinessCta")}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: C.ash, marginTop: 4 }}>{t("w.home.today.glanceReadiness")}</Text>
          </Pressable>
          <Pressable onPress={() => setDoneOpen(true)} accessibilityRole="button" accessibilityLabel={t("w.home.today.glanceDone")} style={{ flex: 1, paddingVertical: 13, alignItems: "center" }}>
            <Text style={{ fontFamily: F.bold, fontSize: 15, color: txt(C, C.amber) }}>✓ {doneToday.length}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: C.ash, marginTop: 4 }}>{t("w.home.today.glanceDone")}</Text>
          </Pressable>
        </View>

        {/* QUICK ACCESS — Cockpit (the command center, straight from Today) +
            Sport. Free users get an upgrade nudge in the SAME place (P1/P3): the
            Cockpit is Full-only, and sport-specific prescriptions unlock with Full
            (logging any sport stays free via the carousel below). */}
        <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
          <AccessCard C={C} title={t("w.home.today.cockpitTitle")} sub={isAthlete ? t("w.home.today.cockpitSub") : t("w.home.today.cockpitLockSub")} locked={!isAthlete} onPress={() => (isAthlete ? router.push("/(tabs)/cockpit") : goUpgrade("today-cockpit"))} />
          <AccessCard C={C} title={t("w.home.today.sportTitle")} sub={isAthlete ? t("w.home.today.sportSub") : t("w.home.today.sportLockSub")} locked={!isAthlete} onPress={() => (isAthlete ? router.push("/(tabs)/sport") : goUpgrade("today-sport"))} />
        </View>

        {/* Assigned by your coach */}
        {upcoming.length > 0 && (
          <View style={{ marginTop: 22 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash, marginBottom: 10 }}>{t("w.home.today.assignedByCoach")}</Text>
            {upcoming.map((a) => (
              <ACard key={a.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, marginBottom: 12 }}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{a.name}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 2 }}>{t("w.home.today.assigned")} · {new Date(a.date).toLocaleDateString()}</Text>
                </View>
                <View style={{ flexDirection: "row", gap: space.sm }}>
                  <Pressable onPress={() => markDone(a.id)} style={{ borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 8 }}>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("common.done")}</Text>
                  </Pressable>
                  <Pressable onPress={() => router.push("/workout?source=empty")} style={{ backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingHorizontal: 14, paddingVertical: 8 }}>
                    <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: C.onAccent }}>{t("common.start")}</Text>
                  </Pressable>
                </View>
              </ACard>
            ))}
          </View>
        )}

        {/* FOLLOW A PLAN — free users can enroll in a pre-built plan & follow it */}
        {!isAthlete && !plan && (
          <Pressable
            onPress={() => router.push("/(tabs)/plans")}
            style={{ marginTop: 16, borderWidth: 1, borderColor: `${C.lime}55`, borderRadius: RADIUS.card, padding: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: `${C.lime}12` }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: txt(C, C.lime) }}>{t("w.home.today.followPlanFree")}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 2 }}>{t("w.home.today.followPlanBlurb")}</Text>
            </View>
            <Text style={{ fontFamily: F.black, fontSize: fs.title, color: txt(C, C.lime) }}>→</Text>
          </Pressable>
        )}

        {/* (Quick Log now lives in the Tier-2 glance strip above — it opens the
            sport-log carousel in a modal, so it isn't duplicated as a section here.) */}

        {/* ───── RECOVER · FEEL ───── */}
        <Kicker C={C} k={t("w.home.today.kFeel")} h={t("w.home.today.kFeelH")} color={C[SECTION_COLOR.feel]} />

        {/* CHECK-IN + NUTRITION — square iPhone-style widgets (tap → full screen) */}
        <View style={{ marginTop: 12 }}>
          <TodayWidgets />
        </View>

        {/* ───── PLAN ───── (with a direct link to the full month Calendar) */}
        <Kicker C={C} k={t("w.home.today.kPlan")} h={t("w.home.today.kWeekH")} color={C[SECTION_COLOR.plan]} action={{ label: t("w.home.today.calOpen"), onPress: () => router.push("/calendar") }} />
        {/* WEEK ADHERENCE + CALENDAR — a swipeable pair: the glanceable Mon→Sun
            done-strip, then a calendar widget for easy day-by-day access (P2). */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={cardW + 12} decelerationRate="fast" contentContainerStyle={{ gap: space.md }} style={{ marginTop: 0, marginHorizontal: -2 }}>
          <View style={{ width: cardW }}>
            <WeekStrip
              C={C}
              title={phase ? `${t("w.home.today.week")} ${currentWeek} · ${phase.block.label}` : t("w.home.today.kWeekH")}
              doneLabel={`${adherence.done} ${t("w.home.today.of")} ${adherence.target} ${t("w.home.today.w.done")}`}
              days={adherence.days}
              open={weekOpen}
              onToggle={() => setWeekOpen((o) => !o)}
            />
          </View>
          <View style={{ width: cardW }}>
            <CalendarCard C={C} sessions={sessions} onOpen={() => router.push("/calendar")} openLabel={t("w.home.today.calOpen")} title={t("w.home.today.calTitle")} sub={t("w.home.today.calSub")} />
          </View>
        </ScrollView>
        {/* THIS WEEK — reconciled plan (always shown); coached read-only */}
        {(isAthlete || coached) && macro && reconciledView && (
          <ACard style={{ marginTop: 18 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: space.sm }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1, color: C.ash }}>
                {t("w.home.recweek.thisWeek")} {reconciledView.phase.label} · {t("w.home.recweek.week")} {reconciledView.phase.week}
              </Text>
              <View style={{ backgroundColor: `${reconciledView.phase.kind === "recovery" ? C.amber : C.lime}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 3 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, reconciledView.phase.kind === "recovery" ? C.amber : C.lime) }}>
                  {reconciledView.phase.kind === "recovery" ? t("w.home.recweek.deload") : t("w.home.recweek.load")}
                </Text>
              </View>
            </View>
            {readOnlyPlan ? (
              <View style={{ marginTop: 12, alignSelf: "flex-start", backgroundColor: `${C.lime}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 4 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.lime) }}>{t("w.home.recweek.assignedByCoach")}</Text>
              </View>
            ) : (
              <>
                <Pressable onPress={() => doSchedule(false)} disabled={scheduling} style={{ marginTop: 12, backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingVertical: 11, alignItems: "center", opacity: scheduling ? 0.6 : 1 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.onAccent }}>{scheduling ? t("w.home.recweek.scheduling") : `${t("w.home.recweek.scheduleResync")} ${daysPerWeek}d →`}</Text>
                </Pressable>
                {scheduled && <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.lime), marginTop: 8 }}>{scheduled}</Text>}
              </>
            )}
            <View style={{ flexDirection: "row", gap: 18, marginTop: 14 }}>
              <Metric label={t("w.home.recweek.intensity")} value={`${reconciledView.intensity}`} color={C.chalk} C={C} />
              <Metric label={t("w.home.recweek.volume")} value={`${reconciledView.volume}`} color={C.chalk} C={C} />
              <Metric label={t("w.home.recweek.loadX")} value={reconciledView.loadFactor.toFixed(2)} color={C.chalk} C={C} />
              <Metric label={t("w.home.recweek.volumeX")} value={reconciledView.volumeFactor.toFixed(2)} color={C.chalk} C={C} />
            </View>
            <View style={{ marginTop: 12 }}>
              {reconciledView.blocks.map((b, i) => (
                <View key={`${b.name}-${i}`} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 9, borderTopWidth: 1, borderTopColor: C.line }}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{b.name}</Text>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.5, color: b.source === "sport" ? txt(C, C.amber) : C.ash }}>
                      {b.source === "sport" ? `${t("w.home.recweek.sport")} ${b.demand ?? ""}` : b.kind === "conditioning" ? t("w.home.recweek.conditioning") : t("w.home.recweek.primaryLift")}
                    </Text>
                  </View>
                  <View style={{ backgroundColor: `${b.source === "sport" ? C.amber : C.lime}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 4 }}>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, b.source === "sport" ? C.amber : C.lime) }}>{b.scheme}</Text>
                  </View>
                </View>
              ))}
            </View>
            <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.chalk, lineHeight: 18, marginTop: 12 }}>{reconciledView.why}</Text>
          </ACard>
        )}


        {/* ───── CONNECT ───── — two labelled left/right sliders (Feed cards,
            then Coaches), each a horizontal rail, with an Explore action. */}
        <Kicker C={C} k={t("w.home.today.kConnect")} h={t("w.home.today.kConnectH")} color={C[SECTION_COLOR.connect]} />

        <SubRail C={C} label={t("w.home.today.connectFeed")} actionLabel={t("w.home.today.connectExplore")} onAction={() => router.push("/feed")} />
        <FeedPreview horizontal onOpen={() => router.push("/feed")} />

        <SubRail C={C} label={t("w.home.today.connectCoaches")} actionLabel={t("w.home.today.connectExplore")} onAction={() => router.push("/coaches")} />
        <CoachRail onOpen={() => router.push("/coaches")} />
        </Animated.View>
      </ScrollView>

      {/* QUICK LOG modal — the sport-log carousel, opened from the glance strip. */}
      <Modal visible={quickOpen} transparent animationType="slide" onRequestClose={() => setQuickOpen(false)}>
        <Pressable onPress={() => setQuickOpen(false)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: C.ink2, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderColor: C.line, padding: 20, paddingBottom: insets.bottom + 20, maxHeight: "82%" }}>
            <View style={{ width: 40, height: 4, borderRadius: 999, backgroundColor: C.line, alignSelf: "center", marginBottom: 16 }} />
            <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: 22, color: C.chalk }}>{t("w.home.quickSport.title")}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ash, marginTop: 4, marginBottom: 14 }}>{t("w.home.quickSport.sub")}</Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              <QuickSportLog sessions={sessions} onSaved={() => { load(); setQuickOpen(false); }} solid />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* DONE TODAY modal — a pop-up of everything logged today + the full calendar. */}
      <Modal visible={doneOpen} transparent animationType="slide" onRequestClose={() => setDoneOpen(false)}>
        <Pressable onPress={() => setDoneOpen(false)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: C.ink2, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderColor: C.line, padding: 20, paddingBottom: insets.bottom + 20, maxHeight: "80%" }}>
            <View style={{ width: 40, height: 4, borderRadius: 999, backgroundColor: C.line, alignSelf: "center", marginBottom: 16 }} />
            <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: 22, color: C.chalk }}>{t("w.home.today.doneModalTitle")}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ash, marginTop: 4, marginBottom: 12 }}>{dateStr}{acc.streak.current > 0 ? ` · 🔥 ${acc.streak.current}${t("w.home.today.dayStreak")}` : ""}</Text>
            <ScrollView style={{ maxHeight: 340 }}>
              {doneToday.length === 0 ? (
                <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.ash, lineHeight: 20, paddingVertical: 8 }}>{t("w.home.today.doneModalEmpty")}</Text>
              ) : doneToday.map((s) => (
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
                    <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 2 }}>{sessionMeta(s, units)}</Text>
                  </View>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.lime) }}>{t("w.home.today.doneView")} ›</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable onPress={() => { setDoneOpen(false); router.push("/calendar"); }} style={{ marginTop: 16, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingVertical: 14, alignItems: "center" }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>📅 {t("w.home.today.doneCalendar")}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function Metric({ label, value, color, C }: { label: string; value: string; color: string; C: P }) {
  const { scheme } = useTheme();
  return (
    <View>
      <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: 22, color }}>{value}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.6, color: C.ash }}>{label}</Text>
    </View>
  );
}

// A section kicker — guides the daily flow (Train → Feel → Plan → Connect). An
// optional trailing action puts a link on the right (e.g. Plan → full Calendar).
function Kicker({ C, k, h, color, action }: { C: P; k: string; h: string; color: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 26, marginBottom: 12, marginHorizontal: 2 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
        <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: color }} />
        {/* label + heading on ONE line, left-aligned, same font: "TRAIN · …" */}
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 1.6, textTransform: "uppercase", color: C.ash }}>{k} · {h}</Text>
      </View>
      {action && (
        <Pressable onPress={action.onPress} hitSlop={8}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

// WEEK ADHERENCE strip — a collapsible card with the Mon→Sun day cells (done /
// today / missed / future), summarising the week at a glance. The chevron folds
// just this card; the detailed reconciled plan below stays visible.
function WeekStrip({ C, title, doneLabel, days, open, onToggle }: { C: P; title: string; doneLabel: string; days: { label: string; state: "done" | "today" | "future" | "missed" }[]; open: boolean; onToggle: () => void }) {
  const mark = (s: string) => (s === "done" ? "✓" : s === "today" ? "•" : "—");
  return (
    <View style={{ backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card, padding: 18, marginTop: 12 }}>
      <Pressable onPress={onToggle} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
        <View>
          <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase", color: txt(C, C.amber) }}>{title}</Text>
          <Text style={{ fontFamily: F.black, fontSize: 16, color: C.chalk, marginTop: 4 }}>{doneLabel}</Text>
        </View>
        <Text style={{ fontFamily: F.bold, fontSize: 14, color: C.ash, transform: [{ rotate: open ? "180deg" : "0deg" }] }}>⌄</Text>
      </Pressable>
      {open && (
        <View style={{ flexDirection: "row", gap: 6, marginTop: 14 }}>
          {days.map((d, i) => {
            const done = d.state === "done", today = d.state === "today";
            return (
              <View key={i} style={{ flex: 1, aspectRatio: 1 / 1.4, borderRadius: 12, borderWidth: 1, borderColor: done ? `${C.lime}66` : today ? C.lime : C.line, backgroundColor: done ? `${C.lime}1f` : "transparent", alignItems: "center", justifyContent: "center", gap: 4 }}>
                <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.ash }}>{d.label}</Text>
                <Text style={{ fontFamily: F.bold, fontSize: 11, color: done || today ? txt(C, C.lime) : C.ash }}>{mark(d.state)}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// One row of the first-session chooser (#3): a tappable option with a title, a
// one-line sub, and a Free/Full badge.
function ChooserRow({ C, title, sub, badge, color, onPress }: { C: P; title: string; sub: string; badge: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.ms, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: `${color}14` }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{title}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 2 }}>{sub}</Text>
      </View>
      <View style={{ backgroundColor: `${color}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, color) }}>{badge}</Text>
      </View>
    </Pressable>
  );
}

// One-line meta for a session logged today — sport-adaptive so a run/match reads
// as distance·time (not the gym Sets/Volume framing) and a lift reads as tonnage.
function sessionMeta(s: LoggedSession, units: "kg" | "lb"): string {
  if (sessionShape(s) !== "strength") {
    const ct = sessionCardioTotals(s.blocks);
    const p: string[] = [];
    if (ct.distanceKm) p.push(`${ct.distanceKm.toFixed(1)} km`);
    if (ct.minutes) p.push(`${ct.minutes} min`);
    if (p.length) return p.join(" · ");
    return s.blocks.map((b) => b.name).join(" · ");
  }
  const vol = sessionVolume(s.blocks);
  const names = s.blocks.map((b) => b.name).join(" · ");
  return vol > 0 ? `${fmtTonnage(vol, units)} · ${names}` : names;
}

// A compact quick-access tile (Cockpit / Sport). A `locked` tile carries the ✦
// Full accent + a lime rim; an unlocked one shows the → chevron.
function AccessCard({ C, title, sub, locked, onPress }: { C: P; title: string; sub: string; locked: boolean; onPress: () => void }) {
  const { scheme } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={{ flex: 1, backgroundColor: C.ink2, borderWidth: 1, borderColor: locked ? `${C.lime}66` : C.line, borderRadius: 22, padding: 16 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: 18, color: C.chalk }}>{title}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: locked ? txt(C, C.lime) : C.ash }}>{locked ? "✦" : "→"}</Text>
      </View>
      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 4 }}>{sub}</Text>
    </Pressable>
  );
}

// The calendar quick-access widget — the current week's dates (today ringed,
// logged days lime-filled) + a button through to the full Calendar screen.
function CalendarCard({ C, sessions, onOpen, openLabel, title, sub }: { C: P; sessions: LoggedSession[]; onOpen: () => void; openLabel: string; title: string; sub: string }) {
  const now = new Date();
  const month = now.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  const dow = ["S", "M", "T", "W", "T", "F", "S"];
  const todayStr = now.toDateString();
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  return (
    <View style={{ backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card, padding: 18 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase", color: txt(C, C.amber) }}>{title}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{month}</Text>
      </View>
      <View style={{ flexDirection: "row", gap: 6, marginTop: 12 }}>
        {days.map((d, i) => {
          const logged = sessionsOnDay(sessions, d.getTime()).length > 0;
          const isToday = d.toDateString() === todayStr;
          return (
            <View key={i} style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash }}>{dow[d.getDay()]}</Text>
              <View style={{ marginTop: 5, width: "100%", height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: isToday ? C.lime : logged ? `${C.lime}66` : C.line, backgroundColor: logged ? `${C.lime}1f` : "transparent" }}>
                <Text style={{ fontFamily: F.bold, fontSize: 13, color: logged || isToday ? txt(C, C.lime) : C.chalk }}>{d.getDate()}</Text>
              </View>
            </View>
          );
        })}
      </View>
      <Pressable onPress={onOpen} style={{ marginTop: 14, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, paddingVertical: 11, alignItems: "center" }}>
        <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{openLabel}</Text>
      </Pressable>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 8, textAlign: "center" }}>{sub}</Text>
    </View>
  );
}

// A CONNECT sub-rail label — the small "Feed" / "Coaches" heading above each
// horizontal slider, with an Explore action link on the right.
function SubRail({ C, label, actionLabel, onAction }: { C: P; label: string; actionLabel: string; onAction: () => void }) {
  const { scheme } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 14, marginBottom: 10, marginHorizontal: 2 }}>
      <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: 17, color: C.chalk }}>{label}</Text>
      <Pressable onPress={onAction} hitSlop={8}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}
