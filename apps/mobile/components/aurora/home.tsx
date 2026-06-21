import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl, Animated, Easing, useWindowDimensions, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
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
  computePerformanceState,
  performanceTrajectory,
  computeInjuryRisk,
  computeAccountability,
  habitStrength,
  weeklyRecap,
  planToday,
  FUNNEL,
  toTrainingLog,
  toBiometrics,
  velocityProfiles,
  readinessRole,
  hpiRole,
  riskRole,
  accountabilityRole,
  SPORTS,
  LEVELS,
  type LoggedSession,
  type Macrocycle,
  type Experience,
  type Equipment,
} from "@hybrid/core";
import { fetchSessions, fetchAssignments, fetchSignals, fetchMacrocycle, createSelfAssignments, updateAssignment, type Assignment, type CoreSignal } from "../../lib/api";
import { useSession } from "../../lib/session";
import { usePersona, useHasActiveCoach } from "../../lib/persona";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, roleColor } from "../../lib/theme";
import { fs, space, F } from "../../lib/ui";
import { track } from "../../lib/track";
import { APill, RADIUS, Ring, Spark } from "./kit";
import { auroraScrollClearance } from "../../lib/layout";
import { AuroraIcon } from "./icons";
import AuroraAiCoach from "./ai-coach";
import Tour, { FIRST_RUN_TOUR } from "../tour";
import QuickSportLog from "../quick-sport";
import { CAME_FROM_GUEST_KEY } from "../../lib/guest";

type P = ReturnType<typeof useTheme>["palette"];
// State colours resolve through the SHARED semantic vocabulary (@hybrid/core
// semantic.ts) via theme.roleColor, so web + mobile can't drift on meaning.
const readyColor = (v: number, C: P) => roleColor(C, readinessRole(v));
const hpiColor = (b: string, C: P) => roleColor(C, hpiRole(b));
const riskColor = (b: string, C: P) => roleColor(C, riskRole(b));
const bandColor = (b: string, C: P) => roleColor(C, accountabilityRole(b));
const bandLabel = (b: string, t: (k: string) => string) => (b === "new" ? t("w.home.today.gettingStarted") : b);
const muscleLabel = (m: string, t: (k: string) => string): string => {
  const map: Record<string, string> = {
    quads: t("w.home.today.muscle.quads"),
    glutes: t("w.home.today.muscle.glutes"),
    posterior: t("w.home.today.muscle.posterior"),
    back: t("w.home.today.muscle.back"),
    chest: t("w.home.today.muscle.chest"),
    shoulders: t("w.home.today.muscle.shoulders"),
    triceps: t("w.home.today.muscle.triceps"),
  };
  return map[m] ?? m;
};

/**
 * AURORA home — the rounded Aurora skin of the full classic Today cockpit, at
 * parity (no feature loss): a horizontally-swipeable Plan today + AI coach pair,
 * the season phase timeline, the reconciled "This week" plan (with schedule /
 * re-sync), accountability, the weekly recap, and the Performance State + injury-risk
 * panel. Runs the SAME engines as the classic home; casual users get the lean
 * subset (no season/Performance State), like classic.
 */
export default function AuroraHome() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const { name } = useSession();
  const isAthlete = usePersona() !== "casual";
  // Coached (free) client: read-only view of the coach-assigned plan.
  const coached = useHasActiveCoach();
  const readOnlyPlan = coached && !isAthlete;
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [signals, setSignals] = useState<CoreSignal[]>([]);
  const [macro, setMacro] = useState<Macrocycle | null>(null);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [planId, setPlanId] = useState<string | null>(null);
  const [sportSel, setSportSel] = useState<{ sport: string; levelIdx: number } | null>(null);
  const [prefDays, setPrefDays] = useState<number | undefined>(undefined);
  const [prefExp, setPrefExp] = useState<Experience | undefined>(undefined);
  const [prefEquip, setPrefEquip] = useState<Equipment | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    setRefreshing(true);
    Promise.all([fetchSessions(), fetchAssignments(), fetchSignals(), fetchMacrocycle()])
      .then(([s, a, sig, m]) => {
        setSessions(s); setAssignments(a); setSignals(sig);
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
  const state = useMemo(() => computePerformanceState(log, bio), [log, bio]);
  // 14-day HPI trajectory (oldest→today) for the Performance State sparkline.
  const hpiSeries = useMemo(
    () => [...performanceTrajectory(log, 14)].sort((a, b) => b.daysAgo - a.daysAgo).map((p) => p.hpi),
    [log],
  );
  const risk = useMemo(() => computeInjuryRisk(log, bio), [log, bio]);
  const acc = useMemo(() => computeAccountability(sessions, { targetPerWeek: 3 }), [sessions]);
  const strength = useMemo(() => habitStrength(sessions, 3), [sessions]);
  const recap = useMemo(() => weeklyRecap(sessions), [sessions]);
  const phase = useMemo(() => (macro ? currentPhase(macro, currentWeek) : null), [macro, currentWeek]);
  const plan = useMemo(() => planToday(planId, sessions.length), [planId, sessions.length]);
  const hasData = sessions.length > 0;

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
  const cardW = width - 48; // 24px screen padding each side
  const [activeCard, setActiveCard] = useState(0);
  const onPagerScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setActiveCard(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, cardW + 12)));
  };

  const planReadiness = hasData || plan || phase;
  const startPrescribed = () => router.push("/workout?source=ai");

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
      {showTour && <Tour steps={FIRST_RUN_TOUR} onDone={finishTour} />}
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: auroraScrollClearance(insets.bottom) }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={C.lime} />}>
        <Animated.View style={enterStyle}>
        {/* Greeting + search/bell — the greeting is one quiet line so the PLAN
            (the reason you opened the app), not your own name, is the hero. */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontFamily: F.reg, fontSize: fs.note, color: C.ash }}>
            {t("w.home.today.hi")} <Text style={{ fontFamily: F.bold, color: C.chalk }}>{name.split(" ")[0]}</Text>
          </Text>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            {/* Was a bare View — looked tappable but did nothing. Wire it to the
                searchable Exercises browser so the magnifier actually searches. */}
            <Pressable onPress={() => router.push("/exercises")} accessibilityRole="button" accessibilityLabel="Search exercises" style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
              <AuroraIcon name="search" size={20} color={C.ash} />
            </Pressable>
            <Pressable onPress={() => router.push("/notifications")} accessibilityRole="button" accessibilityLabel="Notifications" style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
              <AuroraIcon name="bell" size={20} color={C.ash} />
            </Pressable>
          </View>
        </View>

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
          <View style={{ width: cardW, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3, padding: 20 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1, color: txt(C, C.lime), flex: 1 }}>
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
                <Text style={{ fontFamily: F.black, fontSize: 22, color: C.chalk, marginTop: 8 }}>{plan.planName}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.violet), marginBottom: 8 }}>
                  {plan.day} · {t("w.home.today.day")} {plan.dayIndex + 1}/{plan.totalDays}{phase ? ` · ${phase.block.label} ${t("w.home.today.wk")} ${currentWeek}/${macro!.totalWeeks}` : ""}
                </Text>
                {plan.items.map((it, i) => (
                  <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingTop: 6, marginTop: 6, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
                    <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk, flex: 1 }}>{it.name}</Text>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{it.sr}{it.rpe && it.rpe !== "—" ? ` · RPE ${it.rpe}` : ""}</Text>
                  </View>
                ))}
                {!isAthlete && (
                  <Pressable
                    onPress={() => { track(FUNNEL.upgradeEntryClick, { client: "mobile", source: "today-plan" }); router.push("/upgrade"); }}
                    style={{ marginTop: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.ms, padding: 10, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: `${C.violet}55`, backgroundColor: `${C.violet}14` }}
                  >
                    <Text style={{ fontFamily: F.mono, fontSize: 11.5, lineHeight: 16, color: C.chalk, flex: 1 }}>{t("w.home.today.followingAsWritten1")}{t("w.home.today.unlockFull")}{t("w.home.today.followingAsWritten2")}</Text>
                    <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: txt(C, C.violet) }}>→</Text>
                  </Pressable>
                )}
              </>
            ) : hasData || phase ? (
              <>
                <Text style={{ fontFamily: F.black, fontSize: 22, color: C.chalk, marginTop: 8 }}>
                  {`${rx.blocks[0]?.name}${rx.blocks[1] ? ` + ${rx.blocks[1]?.name}` : ""}`}
                </Text>
                {phase && (
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.violet), marginTop: 4 }}>
                    {t("w.home.today.goal")} {macro!.goalOrSport} · {phase.block.label} · {t("w.home.today.wk")} {currentWeek}/{macro!.totalWeeks}
                  </Text>
                )}
                <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, marginTop: 6, lineHeight: 19 }}>{rx.why}</Text>
              </>
            ) : (
              /* Brand-new and not enrolled — first-session chooser (#3):
                 follow a plan (free), build your own (Full), or log a one-off. */
              <>
                <Text style={{ fontFamily: F.black, fontSize: 22, color: C.chalk, marginTop: 8 }}>{t("w.home.today.howStart")}</Text>
                <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, marginTop: 6, lineHeight: 19 }}>
                  {t("w.home.today.howStartSub")}
                </Text>
                <View style={{ marginTop: 12, gap: space.sm }}>
                  <ChooserRow C={C} title={t("w.home.today.chooserFollowTitle")} sub={t("w.home.today.chooserFollowSub")} badge={t("w.home.today.badgeFree")} color={C.lime} onPress={() => router.push("/(tabs)/plans")} />
                  <ChooserRow C={C} title={t("w.home.today.chooserBuildTitle")} sub={t("w.home.today.chooserBuildSub")} badge={t("w.home.today.badgeFull")} color={C.violet} onPress={() => { track(FUNNEL.upgradeEntryClick, { client: "mobile", source: "today-build" }); router.push("/upgrade"); }} />
                  <ChooserRow C={C} title={t("w.home.today.chooserLogTitle")} sub={t("w.home.today.chooserLogSub")} badge={t("w.home.today.badgeFree")} color={C.lime} onPress={() => router.push("/workout?source=empty")} />
                </View>
              </>
            )}
          </View>

          {/* card 2 — AI coach */}
          <View style={{ width: cardW, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3, padding: 20 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1, color: txt(C, C.violet) }}>{t("w.home.today.aiCoach")}</Text>
            <Text style={{ fontFamily: F.black, fontSize: 22, color: C.chalk, marginTop: 8 }}>{t("w.home.today.askCoach")}</Text>
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
                style={{ marginTop: 6, backgroundColor: C.violet, borderRadius: RADIUS.pill, paddingVertical: 11, alignItems: "center" }}
              >
                <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.onAccent }}>{t("w.home.today.unlockFullBtn")}</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>

        {/* pager dots */}
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 7, marginTop: 10 }}>
          {[0, 1].map((i) => (
            <View key={i} style={{ width: activeCard === i ? 20 : 7, height: 7, borderRadius: 999, backgroundColor: activeCard === i ? C.lime : C.line }} />
          ))}
        </View>

        {/* Start workout */}
        <APill label={hasData ? t("w.home.today.startTodaySession") : t("welcome.start")} onPress={() => router.push("/workout?source=empty")} style={{ marginTop: 18 }} />

        {/* Assigned by your coach */}
        {upcoming.length > 0 && (
          <View style={{ marginTop: 22 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash, marginBottom: 10 }}>{t("w.home.today.assignedByCoach")}</Text>
            {upcoming.map((a) => (
              <View key={a.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3, padding: 16, marginBottom: 12 }}>
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
              </View>
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

        {/* QUICK SPORT LOG — back from a run/match? log it right here, no gear. */}
        <QuickSportLog onSaved={load} />

        {/* SEASON — phase timeline (athlete, or coached read-only) */}
        {(isAthlete || coached) && macro && phase && (
          <View style={{ marginTop: 18, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3, padding: 20 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1, color: txt(C, C.lime) }}>
              {t("w.home.today.trainingFor")} {macro.goalOrSport} · {phase.block.label} {t("w.home.today.phase")}
            </Text>
            <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk, marginTop: 8, marginBottom: 4 }}>
              {t("w.home.today.week")} {currentWeek} {t("w.home.today.of")} {macro.totalWeeks} · {phase.micro.kind} {t("w.home.today.weekWord")} · {phase.block.focus.toLowerCase()}
            </Text>
            <View style={{ flexDirection: "row", gap: 3, height: 8, borderRadius: 4, overflow: "hidden", marginTop: 12 }}>
              {macro.blocks.map((b) => (
                <View key={b.key} style={{ flex: b.weeks, backgroundColor: b.key === phase.block.key ? b.color : `${b.color}33` }} />
              ))}
            </View>
          </View>
        )}

        {/* SEASON BRIEF (free) — periodization is Full, so an enrolled free user
            gets only this read-only glimpse here (the one place they can see it),
            with the full Periodize screen behind the upgrade. (#5 / #7) */}
        {!isAthlete && macro && phase && (
          <View style={{ marginTop: 18, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3, padding: 20 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1, color: txt(C, C.violet), flex: 1 }}>
                {t("w.home.today.yourSeason")} {macro.goalOrSport}
              </Text>
              <View style={{ backgroundColor: `${C.violet}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 3 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.violet) }}>{t("w.home.today.badgeFull")}</Text>
              </View>
            </View>
            <Text style={{ fontFamily: F.black, fontSize: 20, color: C.chalk, marginTop: 8, marginBottom: 4 }}>
              {phase.block.label} {t("w.home.today.phaseWeek")} {currentWeek}/{macro.totalWeeks}
            </Text>
            <View style={{ flexDirection: "row", gap: 3, height: 8, borderRadius: 4, overflow: "hidden", marginTop: 12 }}>
              {macro.blocks.map((b) => (
                <View key={b.key} style={{ flex: b.weeks, backgroundColor: b.key === phase.block.key ? b.color : `${b.color}33` }} />
              ))}
            </View>
            <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, marginTop: 12, lineHeight: 17 }}>
              {t("w.home.today.seasonBriefBody")}
            </Text>
            <Pressable onPress={() => { track(FUNNEL.upgradeEntryClick, { client: "mobile", source: "today-season" }); router.push("/upgrade"); }} style={{ marginTop: 14, backgroundColor: C.violet, borderRadius: RADIUS.pill, paddingVertical: 11, alignItems: "center" }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.onAccent }}>{t("w.home.today.unlockPeriodization")}</Text>
            </Pressable>
          </View>
        )}

        {/* SELL FULL — what a free user unlocks: Performance State + the rest of
            the intelligence layer. The Today upsell (#8). */}
        {!isAthlete && (
          <View style={{ marginTop: 18, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3, padding: 20 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.ms }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1, color: txt(C, C.blue), flex: 1 }}>{t("w.home.today.unlockWithFull")}</Text>
              <Pressable onPress={() => { track(FUNNEL.upgradeEntryClick, { client: "mobile", source: "today-perfstate" }); router.push("/upgrade"); }} style={{ backgroundColor: C.blue, borderRadius: RADIUS.pill, paddingHorizontal: 14, paddingVertical: 8 }}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: C.onAccent }}>{t("w.home.today.unlockFullBtn")}</Text>
              </Pressable>
            </View>
            <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk, marginTop: 8 }}>{t("w.home.today.seePerfState")}</Text>
            <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, marginTop: 6, lineHeight: 19 }}>
              {t("w.home.today.sellFullBody")}
            </Text>
          </View>
        )}

        {/* THIS WEEK — reconciled plan; coached clients see it read-only */}
        {(isAthlete || coached) && macro && reconciledView && (
          <View style={{ marginTop: 18, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3, padding: 20 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: space.sm }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1, color: txt(C, C.violet) }}>
                {t("w.home.recweek.thisWeek")} {reconciledView.phase.label} · {t("w.home.recweek.week")} {reconciledView.phase.week}
              </Text>
              <View style={{ backgroundColor: `${reconciledView.phase.kind === "recovery" ? C.amber : C.lime}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 3 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, reconciledView.phase.kind === "recovery" ? C.amber : C.lime) }}>
                  {reconciledView.phase.kind === "recovery" ? t("w.home.recweek.deload") : t("w.home.recweek.load")}
                </Text>
              </View>
            </View>
            {readOnlyPlan ? (
              <View style={{ marginTop: 12, alignSelf: "flex-start", backgroundColor: `${C.violet}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 4 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.violet) }}>{t("w.home.recweek.assignedByCoach")}</Text>
              </View>
            ) : (
              <>
                <Pressable onPress={() => doSchedule(false)} disabled={scheduling} style={{ marginTop: 12, backgroundColor: C.violet, borderRadius: RADIUS.pill, paddingVertical: 11, alignItems: "center", opacity: scheduling ? 0.6 : 1 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.onAccent }}>{scheduling ? t("w.home.recweek.scheduling") : `${t("w.home.recweek.scheduleResync")} ${daysPerWeek}d →`}</Text>
                </Pressable>
                {scheduled && <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.lime), marginTop: 8 }}>{scheduled}</Text>}
              </>
            )}
            <View style={{ flexDirection: "row", gap: 18, marginTop: 14 }}>
              <Metric label={t("w.home.recweek.intensity")} value={`${reconciledView.intensity}`} color={C.chalk} C={C} />
              <Metric label={t("w.home.recweek.volume")} value={`${reconciledView.volume}`} color={C.chalk} C={C} />
              <Metric label={t("w.home.recweek.loadX")} value={reconciledView.loadFactor.toFixed(2)} color={txt(C, C.violet)} C={C} />
              <Metric label={t("w.home.recweek.volumeX")} value={reconciledView.volumeFactor.toFixed(2)} color={txt(C, C.violet)} C={C} />
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
          </View>
        )}

        {/* ON TRACK? — accountability */}
        <View style={{ marginTop: 18, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3, padding: 20 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: space.sm }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1, color: txt(C, bandColor(acc.band, C)) }}>{t("w.home.today.onTrack")} {bandLabel(acc.band, t)}</Text>
            <View style={{ backgroundColor: `${bandColor(acc.band, C)}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 3 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, bandColor(acc.band, C)) }}>{acc.streak.current ? `${acc.streak.current}${t("w.home.today.dayStreak")}` : t("w.home.today.noStreak")}</Text>
            </View>
          </View>
          <Text style={{ fontFamily: F.bold, fontSize: 17, color: C.chalk, marginTop: 10 }}>{acc.intervention.headline}</Text>
          <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, marginTop: 4, lineHeight: 19 }}>{acc.intervention.message}</Text>
          <View style={{ flexDirection: "row", gap: 18, marginTop: 12 }}>
            <Metric label={t("w.home.today.risk")} value={`${acc.risk}`} color={txt(C, bandColor(acc.band, C))} C={C} />
            <Metric label={t("w.home.today.habitStrength")} value={`${strength}`} color={C.chalk} C={C} />
            <Metric label={t("w.home.today.thisWeek")} value={`${acc.sessionsLast7}/3`} color={C.chalk} C={C} />
          </View>
        </View>

        {/* YOUR WEEK — recap (tap → Statistics) */}
        {hasData && (
          <Pressable onPress={() => router.push("/statistics")} style={{ marginTop: 18, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3, padding: 20 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1, color: txt(C, C.lime) }}>{t("w.home.today.yourWeek")}</Text>
              <View style={{ flexDirection: "row", gap: space.sm }}>
                {recap.prs.length > 0 && <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: `${C.lime}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 3 }}><AuroraIcon name="arrow-up" size={11} color={txt(C, C.lime)} /><Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.lime) }}>{recap.prs.length} PR</Text></View>}
                {recap.cardioPrs.length > 0 && <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: `${C.blue}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 3 }}><AuroraIcon name="location" size={11} color={txt(C, C.blue)} /><Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.blue) }}>{recap.cardioPrs.length} PR</Text></View>}
              </View>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 22, marginTop: 12 }}>
              <Metric label={t("w.home.today.sessions")} value={`${recap.sessions}`} color={C.chalk} C={C} />
              <Metric label={t("w.home.today.volume")} value={`${recap.volume.toLocaleString()} kg`} color={txt(C, C.lime)} C={C} />
              <Metric label={t("w.home.today.sets")} value={`${recap.sets}`} color={C.chalk} C={C} />
              {recap.distanceKm > 0 && <Metric label={t("w.home.today.distance")} value={`${recap.distanceKm} km`} color={txt(C, C.blue)} C={C} />}
              <Metric label={t("w.home.today.activeDays")} value={`${recap.activeDays}`} color={C.chalk} C={C} />
              {recap.topMuscle && <Metric label={t("w.home.today.topMuscle")} value={muscleLabel(recap.topMuscle.muscle, t)} color={txt(C, C.blue)} C={C} />}
            </View>
            {recap.prs.length > 0 && (
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk, marginTop: 8 }}>
                {recap.prs.slice(0, 4).map((p) => `${p.lift} ${p.e1rm}kg${p.previous == null ? ` (${t("w.home.today.first")})` : ` (+${p.e1rm - p.previous})`}`).join(" · ")}
              </Text>
            )}
          </Pressable>
        )}

        {/* PERFORMANCE STATE + injury risk */}
        {isAthlete && hasData && (
          <View style={{ marginTop: 18, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3, padding: 20 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1, color: txt(C, C.blue) }}>{t("w.home.today.perfState")}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, marginTop: 6 }}>
              <Text style={{ fontFamily: F.black, fontSize: 36, color: txt(C, hpiColor(state.hpi.band, C)) }}>{state.hpi.score}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginBottom: 4 }}>HPI · {state.hpi.band} · {t("w.home.today.limiter")} {state.hpi.limiter}</Text>
                {/* 14-day trend — direction at a glance, not just today's number. */}
                <Spark series={hpiSeries} color={hpiColor(state.hpi.band, C)} height={22} />
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: space.lg, marginTop: 4 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>STR {state.hpi.components.strength}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.blue) }}>END {state.hpi.components.endurance}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.violet) }}>REC {state.hpi.components.recovery >= 0 ? "+" : ""}{state.hpi.components.recovery}</Text>
            </View>
            <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 1, color: C.ash }}>{t("w.home.today.injuryRisk")}</Text>
              {risk.flagged.length === 0 ? (
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime), marginTop: 6 }}>{t("w.home.today.noTissues")} {risk.overall}/100 ({risk.band})</Text>
              ) : (
                <View style={{ marginTop: 8, gap: space.xs }}>
                  {risk.flagged.map((t) => (
                    <View key={t.tissue} style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm }}>
                      <View style={{ backgroundColor: `${riskColor(t.band, C)}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 9, paddingVertical: 2 }}><Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, riskColor(t.band, C)) }}>{t.risk}</Text></View>
                      <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: C.chalk, textTransform: "capitalize" }}>{t.tissue}</Text>
                      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, flex: 1 }}>{t.drivers[0]?.label ?? ""}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        )}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value, color, C }: { label: string; value: string; color: string; C: P }) {
  return (
    <View>
      <Text style={{ fontFamily: F.black, fontSize: 22, color }}>{value}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.6, color: C.ash }}>{label}</Text>
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
