import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl, Animated, Easing } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  prescribeSession,
  currentPhase,
  computeAccountability,
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
  type LoggedSession,
  type Macrocycle,
  type Experience,
  type Equipment,
  type AuroraIconName,
} from "@hybrid/core";
import { fetchAssignments, fetchMacrocycle, type Assignment } from "../../lib/api";
import { useSessionsQuery, useSignalsQuery } from "../../lib/queries";
import { useSession } from "../../lib/session";
import { usePersona } from "../../lib/persona";
import { usePlanMaxes } from "../../lib/plan-maxes";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, roleColor } from "../../lib/theme";
import { fs, space, F, serifIf } from "../../lib/ui";
import { track } from "../../lib/track";
import { ACard, AuroraField, RADIUS, Ring } from "./kit";
import { auroraScrollClearance } from "../../lib/layout";
import { AuroraIcon } from "./icons";
import Tour, { FIRST_RUN_TOUR } from "../tour";
import QuickSportLog from "../quick-sport";
import Sheet from "./sheet";
import ReadinessPicker from "./readiness-picker";
import AuroraNutrition from "./nutrition";
import CoachRail from "./coach-rail";
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
  const insets = useSafeAreaInsets();

  // Sessions + signals from the shared cache; the rest stay home-local.
  const { data: sessions = [], refetch: refetchSessions } = useSessionsQuery();
  const { data: signals = [], refetch: refetchSignals } = useSignalsQuery();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [macro, setMacro] = useState<Macrocycle | null>(null);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [planId, setPlanId] = useState<string | null>(null);
  const [prefExp, setPrefExp] = useState<Experience | undefined>(undefined);
  const [prefEquip, setPrefEquip] = useState<Equipment | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);
  // TIER-2 glance strip modals: Quick Log (sport carousel) + Done today (a
  // pop-up list of everything logged today, with a link to the full calendar).
  const [quickOpen, setQuickOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  // TIER-3 quick actions, now slide-up sheets (not full-screen routes): the
  // readiness check-in, the nutrition tracker, and Follow-a-coach.
  const [readyOpen, setReadyOpen] = useState(false);
  const [nutritionOpen, setNutritionOpen] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  // Plan hero: lead with the first lift; the rest collapse behind a toggle so
  // the card reads at a glance instead of a wall of percentage schemes.
  const [liftsOpen, setLiftsOpen] = useState(false);

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

        {/* GREETING — the streak moved up to the header row, so this line breathes */}
        <View style={{ marginTop: 16 }}>
          <Text style={{ fontFamily: serifIf(scheme, F.bold), fontSize: 22, letterSpacing: -0.4, color: C.chalk }}>{greeting ? `${greeting}, ${firstName}` : " "}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ash }}>{dateStr || " "}</Text>
        </View>

        {/* PLAN TODAY — the single focused hero (your one job today). No kicker or
            eyebrow: the screen is already today's training and the plan names
            itself — the interface shouldn't narrate what the athlete can see. */}
        <ACard style={{ marginTop: 14 }}>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", alignItems: "center" }}>
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
                {/* One anchor — "how far in" — carried by a thin bar, not four
                    overlapping restatements of the same position. */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("w.home.today.day")} {plan.dayIndex + 1} / {plan.totalDays}</Text>
                  <View style={{ flex: 1, height: 2, backgroundColor: C.line, borderRadius: 2, overflow: "hidden" }}>
                    <View style={{ height: "100%", width: `${Math.min(100, Math.round(((plan.dayIndex + 1) / plan.totalDays) * 100))}%`, backgroundColor: C.lime }} />
                  </View>
                </View>
                {(liftsOpen ? plan.rows : plan.rows.slice(0, 1)).map((r, i) => (
                  <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm, paddingTop: 6, marginTop: 6, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
                    <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk, flex: 1 }}>{r.session ? <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{r.session}  </Text> : null}{r.name}{r.note ? <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}> ({r.note})</Text> : null}</Text>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, textAlign: "right", flexShrink: 0 }}>{r.detail}</Text>
                  </View>
                ))}
                {plan.rows.length > 1 && (
                  <Pressable onPress={() => setLiftsOpen((o) => !o)} hitSlop={6} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 }}>
                    <Text style={{ fontFamily: F.mono, fontSize: 11.5, color: txt(C, C.lime) }}>{liftsOpen ? "▴" : "▾"}</Text>
                    <Text style={{ fontFamily: F.mono, fontSize: 11.5, color: txt(C, C.lime) }}>{liftsOpen ? t("w.home.today.hideLifts") : `${t("w.home.today.showAllLifts")} ${plan.rows.length} ${t("w.home.today.liftsWord")}`}</Text>
                  </Pressable>
                )}
                {!isAthlete && (
                  <Pressable
                    onPress={() => { track(FUNNEL.upgradeEntryClick, { client: "mobile", source: "today-plan" }); router.push("/upgrade"); }}
                    style={{ marginTop: 12, padding: 11, borderRadius: 0, borderWidth: 1, borderStyle: "dashed", borderColor: `${C.lime}66` }}
                  >
                    <Text style={{ fontFamily: F.mono, fontSize: 11.5, lineHeight: 16, color: C.ash }}><Text style={{ color: txt(C, C.lime) }}>[note]</Text> {t("w.home.today.followingAsWritten1")}{t("w.home.today.unlockFull")}{t("w.home.today.followingAsWritten2")}</Text>
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

        {/* TIER 2 — glanceable status strip: Quick Log · Readiness · Done today.
            Quick Log takes the day-streak's old slot (the streak lives in the header
            now); it opens the sport-log carousel, Readiness opens the daily check-in,
            and Done today opens a pop-up of everything logged today + the calendar. */}
        <View style={{ flexDirection: "row", backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 16, overflow: "hidden", marginTop: 16 }}>
          <Pressable onPress={() => setQuickOpen(true)} accessibilityRole="button" accessibilityLabel={t("w.home.today.glanceQuickLog")} style={{ flex: 1, paddingVertical: 13, alignItems: "center", borderRightWidth: 1, borderRightColor: C.line }}>
            <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.chalk }}>＋ {t("w.home.today.glanceLog")}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: C.ash, marginTop: 4 }}>{t("w.home.today.glanceQuickLog")}</Text>
          </Pressable>
          <Pressable onPress={() => setReadyOpen(true)} accessibilityRole="button" accessibilityLabel={t("w.home.today.glanceReadiness")} style={{ flex: 1, paddingVertical: 13, alignItems: "center", borderRightWidth: 1, borderRightColor: C.line }}>
            <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.chalk }}>{t("w.home.today.glanceReadinessCta")}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: C.ash, marginTop: 4 }}>{t("w.home.today.glanceReadiness")}</Text>
          </Pressable>
          <Pressable onPress={() => setDoneOpen(true)} accessibilityRole="button" accessibilityLabel={t("w.home.today.glanceDone")} style={{ flex: 1, paddingVertical: 13, alignItems: "center" }}>
            <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.chalk }}>✓ {doneToday.length}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: C.ash, marginTop: 4 }}>{t("w.home.today.glanceDone")}</Text>
          </Pressable>
        </View>

        {/* ───── GO FULL — Cockpit + Sport premium baits (violet = premium) ───── */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 24, marginBottom: 12, marginHorizontal: 2 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 1.6, textTransform: "uppercase", color: C.ash }}><Text style={{ color: txt(C, C.violet) }}>✦</Text> {t("w.home.today.goFull")}</Text>
          <Pressable onPress={() => router.push("/(tabs)/plans")} hitSlop={8}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, letterSpacing: 0.6, textTransform: "uppercase", color: C.ash }}>{t("w.home.today.seePlans")} →</Text>
          </Pressable>
        </View>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <AccessCard C={C} title={t("w.home.today.cockpitTitle")} sub={isAthlete ? t("w.home.today.cockpitSub") : t("w.home.today.cockpitLockSub")} locked={!isAthlete} onPress={() => (isAthlete ? router.push("/(tabs)/cockpit") : goUpgrade("today-cockpit"))} />
          <AccessCard C={C} title={t("w.home.today.sportTitle")} sub={isAthlete ? t("w.home.today.sportSub") : t("w.home.today.sportLockSub")} locked={!isAthlete} onPress={() => (isAthlete ? router.push("/(tabs)/sport") : goUpgrade("today-sport"))} />
        </View>

        {/* ───── RECOVER & MORE — deferred rows (nutrition · coaches) ───── */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 24, marginBottom: 12, marginHorizontal: 2 }}>
          <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: C.ash }} />
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 1.6, textTransform: "uppercase", color: C.ash }}>
            {t("w.home.today.recoverMore")}
          </Text>
        </View>
        <View style={{ gap: 10 }}>
          <DeferRow C={C} icon="heart" tint={C.ash} title={t("w.home.today.w.nutrition")} sub={t("w.home.today.rowNutritionSub")} onPress={() => setNutritionOpen(true)} />
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

      {/* READINESS sheet — the compact "How ready do you feel?" quick picker. */}
      <Sheet visible={readyOpen} onClose={() => setReadyOpen(false)} title={t("w.recovery.readiness.title")} sub={t("w.recovery.readiness.sub")}>
        <ReadinessPicker onDone={() => setReadyOpen(false)} />
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

      {/* DONE TODAY sheet — everything logged today + the full calendar. */}
      <Sheet visible={doneOpen} onClose={() => setDoneOpen(false)} title={t("w.home.today.doneModalTitle")} sub={`${dateStr}${acc.streak.current > 0 ? ` · 🔥 ${acc.streak.current}${t("w.home.today.dayStreak")}` : ""}`}>
        <View style={{ marginTop: 12 }}>
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

// A deferred row (Tier 3) — a slim tap-through to a secondary surface
// (Nutrition, Coaches), with a tinted glyph, title + sub, and a chevron.
function DeferRow({ C, icon, tint, title, sub, onPress }: { C: P; icon: AuroraIconName; tint: string; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 13, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
        <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: `${tint}26`, alignItems: "center", justifyContent: "center" }}>
          <AuroraIcon name={icon} size={15} color={txt(C, tint)} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{title}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 1 }}>{sub}</Text>
        </View>
      </View>
      <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>›</Text>
    </Pressable>
  );
}

// A compact quick-access tile (Cockpit / Sport). A `locked` tile carries the ✦
// Full accent + a lime rim; an unlocked one shows the → chevron.
function AccessCard({ C, title, sub, locked, onPress }: { C: P; title: string; sub: string; locked: boolean; onPress: () => void }) {
  const { scheme } = useTheme();
  const { t } = useLang();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={{ flex: 1, backgroundColor: C.ink2, borderWidth: 1, borderColor: `${C.violet}3d`, borderRadius: 22, padding: 16, overflow: "hidden" }}>
      {/* soft violet fill (premium accent) under the content */}
      <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: `${C.violet}12` }} />
      <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: 18, color: C.chalk }}>{title}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 6, lineHeight: 16 }}>{sub}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 0.6, textTransform: "uppercase", color: txt(C, C.violet), marginTop: 10 }}>{locked ? t("w.home.today.cardUnlock") : t("w.home.today.cardOpen")} →</Text>
    </Pressable>
  );
}


