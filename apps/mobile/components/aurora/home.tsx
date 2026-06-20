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
import { useTheme, txt, roleColor } from "../../lib/theme";
import { fs, space, F } from "../../lib/ui";
import { track } from "../../lib/track";
import { APill, RADIUS, Ring, Spark } from "./kit";
import { auroraScrollClearance } from "../../lib/layout";
import { AuroraIcon } from "./icons";
import AuroraAiCoach from "./ai-coach";

type P = ReturnType<typeof useTheme>["palette"];
// State colours resolve through the SHARED semantic vocabulary (@hybrid/core
// semantic.ts) via theme.roleColor, so web + mobile can't drift on meaning.
const readyColor = (v: number, C: P) => roleColor(C, readinessRole(v));
const hpiColor = (b: string, C: P) => roleColor(C, hpiRole(b));
const riskColor = (b: string, C: P) => roleColor(C, riskRole(b));
const bandColor = (b: string, C: P) => roleColor(C, accountabilityRole(b));
const bandLabel = (b: string) => (b === "new" ? "getting started" : b);
const MUSCLE_LABEL: Record<string, string> = { quads: "Quads", glutes: "Glutes", posterior: "Posterior chain", back: "Back", chest: "Chest", shoulders: "Shoulders", triceps: "Triceps" };

/**
 * AURORA home — the rounded Aurora skin of the full classic Today cockpit, at
 * parity (no feature loss): a horizontally-swipeable Plan today + AI coach pair,
 * the season phase timeline, the reconciled "This week" plan (with schedule /
 * re-sync), accountability, the weekly recap, and the Athlete Twin + injury-risk
 * panel. Runs the SAME engines as the classic home; casual users get the lean
 * subset (no season/Twin), like classic.
 */
export default function AuroraHome() {
  const { palette: C } = useTheme();
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
  // 14-day HPI trajectory (oldest→today) for the Twin sparkline.
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
    setScheduled(ok ? `${auto ? "Auto re-synced" : "Scheduled"} ${items.length} sessions off your latest logs — see your Calendar.` : "Couldn't schedule — try again.");
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.ink }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: auroraScrollClearance(insets.bottom) }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={C.lime} />}>
        <Animated.View style={enterStyle}>
        {/* Greeting + search/bell — the greeting is one quiet line so the PLAN
            (the reason you opened the app), not your own name, is the hero. */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontFamily: F.reg, fontSize: fs.note, color: C.ash }}>
            Hi, <Text style={{ fontFamily: F.bold, color: C.chalk }}>{name.split(" ")[0]}</Text>
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
                Your plan today{plan && !(isAthlete && planReadiness) ? " · as written" : ""}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
                {/* Readiness as a glanceable DIAL, not "95/100" digits to parse. */}
                {isAthlete && planReadiness ? (
                  <Ring value={rx.readiness} size={44} color={readyColor(rx.readiness, C)} track={C.line}>
                    <Text style={{ fontFamily: F.black, fontSize: fs.body, color: C.chalk }}>{rx.readiness}</Text>
                  </Ring>
                ) : null}
                <Pressable onPress={startPrescribed} style={{ backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingHorizontal: 14, paddingVertical: 8 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: C.onAccent }}>Start →</Text>
                </Pressable>
              </View>
            </View>
            {plan ? (
              <>
                <Text style={{ fontFamily: F.black, fontSize: 22, color: C.chalk, marginTop: 8 }}>{plan.planName}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.violet), marginBottom: 8 }}>
                  {plan.day} · day {plan.dayIndex + 1}/{plan.totalDays}{phase ? ` · ${phase.block.label} wk ${currentWeek}/${macro!.totalWeeks}` : ""}
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
                    <Text style={{ fontFamily: F.mono, fontSize: 11.5, lineHeight: 16, color: C.chalk, flex: 1 }}>✦ Following as written. Unlock Full to auto-adjust loads to your recovery.</Text>
                    <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: txt(C, C.violet) }}>→</Text>
                  </Pressable>
                )}
              </>
            ) : (
              <>
                <Text style={{ fontFamily: F.black, fontSize: 22, color: C.chalk, marginTop: 8 }}>
                  {hasData || phase ? `${rx.blocks[0]?.name}${rx.blocks[1] ? ` + ${rx.blocks[1]?.name}` : ""}` : "Start your first session"}
                </Text>
                {phase && (
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.violet), marginTop: 4 }}>
                    Goal: {macro!.goalOrSport} · {phase.block.label} · wk {currentWeek}/{macro!.totalWeeks}
                  </Text>
                )}
                <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, marginTop: 6, lineHeight: 19 }}>
                  {hasData || phase ? rx.why : "Log a workout and your plan, readiness, Athlete Twin and trends all build from your real training — nothing here is pre-filled."}
                </Text>
              </>
            )}
          </View>

          {/* card 2 — AI coach */}
          <View style={{ width: cardW, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3, padding: 20 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1, color: txt(C, C.violet) }}>AI coach</Text>
            <Text style={{ fontFamily: F.black, fontSize: 22, color: C.chalk, marginTop: 8 }}>Ask your coach</Text>
            <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, marginTop: 6, marginBottom: 6, lineHeight: 19 }}>
              Claude reads your real readiness, fatigue and velocity and writes you a personalized note for the day.
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
                <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.onAccent }}>✦ Unlock Full →</Text>
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
        <APill label={hasData ? "Start today's session" : "Start your first workout"} onPress={() => router.push("/workout?source=empty")} style={{ marginTop: 18 }} />

        {/* Assigned by your coach */}
        {upcoming.length > 0 && (
          <View style={{ marginTop: 22 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash, marginBottom: 10 }}>Assigned by your coach</Text>
            {upcoming.map((a) => (
              <View key={a.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3, padding: 16, marginBottom: 12 }}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{a.name}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 2 }}>Assigned · {new Date(a.date).toLocaleDateString()}</Text>
                </View>
                <View style={{ flexDirection: "row", gap: space.sm }}>
                  <Pressable onPress={() => markDone(a.id)} style={{ borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 8 }}>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>Done</Text>
                  </Pressable>
                  <Pressable onPress={() => router.push("/workout?source=empty")} style={{ backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingHorizontal: 14, paddingVertical: 8 }}>
                    <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: C.onAccent }}>Start</Text>
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
              <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: txt(C, C.lime) }}>▤ Follow a plan — free</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 2 }}>Browse the library &amp; enroll. Following is free.</Text>
            </View>
            <Text style={{ fontFamily: F.black, fontSize: fs.title, color: txt(C, C.lime) }}>→</Text>
          </Pressable>
        )}

        {/* SEASON — phase timeline (athlete, or coached read-only) */}
        {(isAthlete || coached) && macro && phase && (
          <View style={{ marginTop: 18, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3, padding: 20 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1, color: txt(C, C.lime) }}>
              Training for · {macro.goalOrSport} · {phase.block.label} phase
            </Text>
            <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk, marginTop: 8, marginBottom: 4 }}>
              Week {currentWeek} of {macro.totalWeeks} · {phase.micro.kind} week · {phase.block.focus.toLowerCase()}
            </Text>
            <View style={{ flexDirection: "row", gap: 3, height: 8, borderRadius: 4, overflow: "hidden", marginTop: 12 }}>
              {macro.blocks.map((b) => (
                <View key={b.key} style={{ flex: b.weeks, backgroundColor: b.key === phase.block.key ? b.color : `${b.color}33` }} />
              ))}
            </View>
          </View>
        )}

        {/* THIS WEEK — reconciled plan; coached clients see it read-only */}
        {(isAthlete || coached) && macro && reconciledView && (
          <View style={{ marginTop: 18, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3, padding: 20 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: space.sm }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1, color: txt(C, C.violet) }}>
                This week · {reconciledView.phase.label} · week {reconciledView.phase.week}
              </Text>
              <View style={{ backgroundColor: `${reconciledView.phase.kind === "recovery" ? C.amber : C.lime}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 3 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, reconciledView.phase.kind === "recovery" ? C.amber : C.lime) }}>
                  {reconciledView.phase.kind === "recovery" ? "deload week" : "load week"}
                </Text>
              </View>
            </View>
            {readOnlyPlan ? (
              <View style={{ marginTop: 12, alignSelf: "flex-start", backgroundColor: `${C.violet}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 4 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.violet) }}>assigned by your coach · read-only</Text>
              </View>
            ) : (
              <>
                <Pressable onPress={() => doSchedule(false)} disabled={scheduling} style={{ marginTop: 12, backgroundColor: C.violet, borderRadius: RADIUS.pill, paddingVertical: 11, alignItems: "center", opacity: scheduling ? 0.6 : 1 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.onAccent }}>{scheduling ? "Scheduling…" : `Schedule / re-sync week · ${daysPerWeek}d →`}</Text>
                </Pressable>
                {scheduled && <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.lime), marginTop: 8 }}>{scheduled}</Text>}
              </>
            )}
            <View style={{ flexDirection: "row", gap: 18, marginTop: 14 }}>
              <Metric label="Intensity" value={`${reconciledView.intensity}`} color={C.chalk} C={C} />
              <Metric label="Volume" value={`${reconciledView.volume}`} color={C.chalk} C={C} />
              <Metric label="Load ×" value={reconciledView.loadFactor.toFixed(2)} color={txt(C, C.violet)} C={C} />
              <Metric label="Volume ×" value={reconciledView.volumeFactor.toFixed(2)} color={txt(C, C.violet)} C={C} />
            </View>
            <View style={{ marginTop: 12 }}>
              {reconciledView.blocks.map((b, i) => (
                <View key={`${b.name}-${i}`} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 9, borderTopWidth: 1, borderTopColor: C.line }}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{b.name}</Text>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.5, color: b.source === "sport" ? txt(C, C.amber) : C.ash }}>
                      {b.source === "sport" ? `sport · ${b.demand ?? ""}` : b.kind === "conditioning" ? "conditioning" : "primary lift"}
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
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1, color: txt(C, bandColor(acc.band, C)) }}>On track? · {bandLabel(acc.band)}</Text>
            <View style={{ backgroundColor: `${bandColor(acc.band, C)}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 3 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, bandColor(acc.band, C)) }}>{acc.streak.current ? `${acc.streak.current}-day streak` : "no streak yet"}</Text>
            </View>
          </View>
          <Text style={{ fontFamily: F.bold, fontSize: 17, color: C.chalk, marginTop: 10 }}>{acc.intervention.headline}</Text>
          <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, marginTop: 4, lineHeight: 19 }}>{acc.intervention.message}</Text>
          <View style={{ flexDirection: "row", gap: 18, marginTop: 12 }}>
            <Metric label="Risk" value={`${acc.risk}`} color={txt(C, bandColor(acc.band, C))} C={C} />
            <Metric label="Habit strength" value={`${strength}`} color={C.chalk} C={C} />
            <Metric label="This week" value={`${acc.sessionsLast7}/3`} color={C.chalk} C={C} />
          </View>
        </View>

        {/* YOUR WEEK — recap (tap → Statistics) */}
        {hasData && (
          <Pressable onPress={() => router.push("/statistics")} style={{ marginTop: 18, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3, padding: 20 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1, color: txt(C, C.lime) }}>Your week</Text>
              <View style={{ flexDirection: "row", gap: space.sm }}>
                {recap.prs.length > 0 && <View style={{ backgroundColor: `${C.lime}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 3 }}><Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.lime) }}>🏆 {recap.prs.length} PR</Text></View>}
                {recap.cardioPrs.length > 0 && <View style={{ backgroundColor: `${C.blue}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 3 }}><Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.blue) }}>🏃 {recap.cardioPrs.length} PR</Text></View>}
              </View>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 22, marginTop: 12 }}>
              <Metric label="Sessions" value={`${recap.sessions}`} color={C.chalk} C={C} />
              <Metric label="Volume" value={`${recap.volume.toLocaleString()} kg`} color={txt(C, C.lime)} C={C} />
              <Metric label="Sets" value={`${recap.sets}`} color={C.chalk} C={C} />
              {recap.distanceKm > 0 && <Metric label="Distance" value={`${recap.distanceKm} km`} color={txt(C, C.blue)} C={C} />}
              <Metric label="Active days" value={`${recap.activeDays}`} color={C.chalk} C={C} />
              {recap.topMuscle && <Metric label="Top muscle" value={MUSCLE_LABEL[recap.topMuscle.muscle] ?? recap.topMuscle.muscle} color={txt(C, C.blue)} C={C} />}
            </View>
            {recap.prs.length > 0 && (
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk, marginTop: 8 }}>
                {recap.prs.slice(0, 4).map((p) => `${p.lift} ${p.e1rm}kg${p.previous == null ? " (first!)" : ` (+${p.e1rm - p.previous})`}`).join(" · ")}
              </Text>
            )}
          </Pressable>
        )}

        {/* PERFORMANCE STATE · ATHLETE TWIN + injury risk */}
        {isAthlete && hasData && (
          <View style={{ marginTop: 18, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3, padding: 20 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1, color: txt(C, C.blue) }}>Performance State · Athlete Twin</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, marginTop: 6 }}>
              <Text style={{ fontFamily: F.black, fontSize: 36, color: txt(C, hpiColor(state.hpi.band, C)) }}>{state.hpi.score}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginBottom: 4 }}>HPI · {state.hpi.band} · limiter {state.hpi.limiter}</Text>
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
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 1, color: C.ash }}>Injury risk · by tissue</Text>
              {risk.flagged.length === 0 ? (
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime), marginTop: 6 }}>No tissues flagged · overall {risk.overall}/100 ({risk.band})</Text>
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
