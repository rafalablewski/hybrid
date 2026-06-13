import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  prescribeSession,
  prescribeForSport,
  reconcilePlan,
  buildTrainingWeek,
  trainingDaysPerWeek,
  weekNeedsResync,
  computePerformanceState,
  computeAccountability,
  habitStrength,
  projectLift,
  liftNames,
  velocityProfiles,
  toTrainingLog,
  toBiometrics,
  weeklyRecap,
  SPORTS,
  LEVELS,
  type LoggedSession,
  type Macrocycle,
} from "@hybrid/core";
import { fetchSessions, fetchAssignments, fetchSignals, fetchMacrocycle, createSelfAssignments, updateAssignment, type Assignment, type CoreSignal } from "../../lib/api";
import { RecapShareCard, shareWorkout, recapShareText } from "../../lib/share";
import { useSession } from "../../lib/session";
import { useDraft } from "../../lib/draft";
import { useLang } from "../../lib/i18n";
import { Screen, Card, Kicker, Mono, H1, Chip, Button, C, F } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";

const hpiColor = (b: string) =>
  b === "peak" || b === "primed" ? C.lime : b === "moderate" ? C.blue : b === "compromised" ? C.amber : C.red;

const bandColor = (b: string) =>
  b === "thriving" || b === "steady" ? C.lime : b === "wobbling" ? C.blue : b === "at-risk" ? C.amber : C.red;

export default function Home() {
  const C = useTheme().palette;
  const router = useRouter();
  const { name, signOut } = useSession();
  const { draft } = useDraft();
  const { lang, setLang, t } = useLang();
  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [signals, setSignals] = useState<CoreSignal[]>([]);
  const [macro, setMacro] = useState<Macrocycle | null>(null);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [sportSel, setSportSel] = useState<{ sport: string; levelIdx: number } | null>(null);
  const [prefDays, setPrefDays] = useState<number | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);

  const load = () => {
    setRefreshing(true);
    Promise.all([fetchSessions(), fetchAssignments(), fetchSignals(), fetchMacrocycle()])
      .then(([s, a, sig, m]) => {
        setSessions(s); setAssignments(a); setSignals(sig);
        setMacro(m?.macro ?? null); setCurrentWeek(m?.currentWeek ?? 1);
      })
      .finally(() => setRefreshing(false));
  };
  // Reload whenever the Today tab gains focus — so returning here after logging
  // a workout refreshes sessions/assignments and the auto re-sync can fire.
  useFocusEffect(useCallback(() => { load(); }, []));

  // the athlete's saved sport selection, so the day's plan folds in transfer work
  useEffect(() => {
    AsyncStorage.getItem("hybrid.sport")
      .then((raw) => {
        if (!raw) return;
        const s = JSON.parse(raw) as { sport?: string; levelIdx?: number } | null;
        if (s?.sport && SPORTS[s.sport]) {
          const lvl = typeof s.levelIdx === "number" && s.levelIdx >= 0 && s.levelIdx < LEVELS.length ? s.levelIdx : 0;
          setSportSel({ sport: s.sport, levelIdx: lvl });
        }
      })
      .catch(() => {});
    AsyncStorage.getItem("hybrid.daysPerWeek")
      .then((raw) => { const n = Number(raw); if (Number.isFinite(n) && n > 0) setPrefDays(n); })
      .catch(() => {});
  }, []);

  // Real biometrics from the Signal ontology (check-in + wearables) — undefined
  // when nothing's logged, so readiness/HPI never run on fabricated data.
  const bio = useMemo(
    () => toBiometrics(signals as unknown as Parameters<typeof toBiometrics>[0]),
    [signals],
  );

  const upcoming = assignments
    .filter((a) => a.status === "assigned")
    .sort((x, y) => Date.parse(x.date) - Date.parse(y.date))
    .slice(0, 3);
  const markDone = async (id: string) => { await updateAssignment(id, "completed"); load(); };

  const log = toTrainingLog(sessions);
  const rx = useMemo(
    () => prescribeSession(log, bio, { profiles: velocityProfiles(sessions) }),
    [log, sessions, bio],
  );
  const state = useMemo(() => computePerformanceState(log, bio), [log, bio]);

  // The reconciled week: the macrocycle phase arbitrates the daily route + sport
  // transfer into one session (overlap deduped, deload weeks trimmed).
  const sportRx = useMemo(
    () => (sportSel ? prescribeForSport(sportSel.sport, sportSel.levelIdx, { sessions }) : undefined),
    [sportSel, sessions],
  );
  const reconciled = useMemo(() => {
    if (!macro || sessions.length === 0) return null;
    return reconcilePlan({ macro, daily: rx, sport: sportRx, currentWeek });
  }, [macro, rx, sportRx, sessions, currentWeek]);

  const daysPerWeek = useMemo(
    () => trainingDaysPerWeek(sessions, { fallback: prefDays ?? 3 }),
    [sessions, prefDays],
  );
  const [scheduling, setScheduling] = useState(false);
  const [scheduled, setScheduled] = useState<string | null>(null);
  const autoSynced = useRef(0);
  const doSchedule = async (auto: boolean) => {
    if (!reconciled || !macro || scheduling) return;
    setScheduling(true);
    setScheduled(null);
    const items = buildTrainingWeek({
      macro,
      currentWeek,
      log,
      bio,
      profiles: velocityProfiles(sessions),
      sport: sportRx,
      daysPerWeek,
    });
    const ok = await createSelfAssignments(items, true);
    setScheduled(ok ? `${auto ? "Auto re-synced" : "Scheduled"} ${items.length} sessions off your latest logs — see your Calendar.` : "Couldn't schedule — try again.");
    setScheduling(false);
    if (ok) load();
  };
  const scheduleThisWeek = () => doSchedule(false);

  // Auto re-sync, event-driven: when a NEWER session lands (you just logged a
  // day — picked up by the focus reload), re-check the self-scheduled week and
  // regenerate the rest off that real result. The ref tracks the latest session
  // already handled, so it fires once per new session, not in a loop.
  useEffect(() => {
    if (!reconciled) return;
    const latest = sessions.reduce((m, s) => Math.max(m, Date.parse(s.startedAt) || 0), 0);
    if (!latest || latest <= autoSynced.current) return;
    autoSynced.current = latest;
    if (weekNeedsResync(assignments, sessions)) void doSchedule(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reconciled, assignments, sessions]);

  // Consumer engines run on REAL sessions (empty → honest "getting started").
  const acc = useMemo(() => computeAccountability(sessions, { targetPerWeek: 3 }), [sessions]);
  const strength = useMemo(() => habitStrength(sessions, 3), [sessions]);
  const recap = useMemo(() => weeklyRecap(sessions), [sessions]);
  const recapRef = useRef<View>(null);
  const primaryLift = useMemo(() => liftNames(sessions)[0], [sessions]);
  const projection = useMemo(
    () => (primaryLift ? projectLift(sessions, primaryLift, { horizonWeeks: 12 }) : null),
    [sessions, primaryLift],
  );
  const goal = projection && !projection.insufficient ? Math.round(projection.current * 1.1) : null;
  const projGoal = useMemo(
    () => (primaryLift && goal ? projectLift(sessions, primaryLift, { horizonWeeks: 12, goal }) : null),
    [sessions, primaryLift, goal],
  );

  return (
    <Screen refreshing={refreshing} onRefresh={load}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Kicker>Fitness GPS · today</Kicker>
          <H1>{t("home.ready")}</H1>
        </View>
        <View style={{ alignItems: "flex-end", gap: 8 }}>
          <View style={{ flexDirection: "row", gap: 4 }}>
            {(["en", "pl", "de"] as const).map((l) => (
              <Pressable
                key={l}
                onPress={() => setLang(l)}
                style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: lang === l ? C.lime : C.line, backgroundColor: lang === l ? C.lime : "transparent" }}
              >
                <Text style={{ fontFamily: F.mono, fontSize: 11, color: lang === l ? C.ink : C.ash }}>{l.toUpperCase()}</Text>
              </Pressable>
            ))}
          </View>
          <Text onPress={signOut} style={{ fontFamily: F.mono, fontSize: 11, color: C.ash }}>{t("common.signout")}</Text>
        </View>
      </View>

      {/* START NOW — the one tap that matters in the gym */}
      <Pressable
        onPress={() => router.push("/workout?source=empty")}
        style={{ backgroundColor: C.lime, borderRadius: 18, paddingVertical: 22, alignItems: "center", marginTop: 16 }}
      >
        <Text style={{ fontFamily: F.black, fontSize: 20, color: C.ink }}>▶  {draft ? t("train.resume") : t("home.startWorkout")}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ink, opacity: 0.7, marginTop: 4 }}>
          {draft ? `${draft.exercises.length} ${t("workout.exercises")} · ${t("train.inProgress")}` : t("home.startWorkoutSub")}
        </Text>
      </Pressable>

      {/* personalize */}
      <Pressable
        onPress={() => router.push("/onboarding")}
        style={{ marginTop: 16, backgroundColor: `${C.violet}14`, borderWidth: 1, borderColor: `${C.violet}55`, borderRadius: 14, padding: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.bold, fontSize: 14, color: txt(C, C.violet) }}>✨ Set up your plan</Text>
          <Mono style={{ marginTop: 2, fontSize: 11 }}>4 questions → a plan you&apos;ll finish</Mono>
        </View>
        <Text style={{ fontFamily: F.black, fontSize: 18, color: txt(C, C.violet) }}>→</Text>
      </Pressable>

      {/* ASSIGNED — workouts the coach scheduled */}
      {upcoming.length > 0 && (
        <Card style={{ borderLeftWidth: 3, borderLeftColor: C.violet, marginTop: 16 }}>
          <Kicker color={C.violet}>Assigned by your coach</Kicker>
          {upcoming.map((a, i) => (
            <View key={a.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: i ? 10 : 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.chalk }}>{a.name}</Text>
                <Mono style={{ fontSize: 11 }}>{new Date(a.date).toLocaleDateString()}</Mono>
              </View>
              <Pressable onPress={() => router.push("/workout?source=empty")} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: `${C.lime}55`, backgroundColor: `${C.lime}1f`, marginRight: 8 }}>
                <Text style={{ fontFamily: F.semi, fontSize: 12, color: txt(C, C.lime) }}>Start</Text>
              </Pressable>
              <Pressable onPress={() => markDone(a.id)}>
                <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.ash }}>done</Text>
              </Pressable>
            </View>
          ))}
        </Card>
      )}

      {/* ROUTE TODAY — what to do, why */}
      <Card style={{ borderLeftWidth: 3, borderLeftColor: C.lime, marginTop: 18 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Kicker color={C.lime}>Your route today</Kicker>
          {sessions.length > 0 && <Mono color={C.ash}>readiness {rx.readiness}/100</Mono>}
        </View>
        <Text style={{ fontFamily: F.black, fontSize: 22, color: C.chalk, marginVertical: 6 }}>
          {sessions.length > 0 ? `${rx.blocks[0]?.name}${rx.blocks[1] ? ` + ${rx.blocks[1]?.name}` : ""}` : "Start your first session"}
        </Text>
        <Mono color={C.chalk} style={{ lineHeight: 20 }}>
          {sessions.length > 0 ? rx.why : "Log a workout and your route, readiness and Athlete Twin build from your real training — nothing here is pre-filled."}
        </Mono>
        <View style={{ marginTop: 14 }}>
          <Button label={t("home.startSession")} onPress={() => router.push(sessions.length > 0 ? "/workout?source=ai" : "/workout?source=empty")} />
        </View>
      </Card>

      {/* THIS WEEK — reconciled plan (macrocycle phase arbitrates route + sport) */}
      {reconciled && (
        <Card style={{ borderLeftWidth: 3, borderLeftColor: C.violet, marginTop: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Kicker color={C.violet}>This week · {reconciled.phase.label} · wk {reconciled.phase.week}</Kicker>
            <Chip color={reconciled.phase.kind === "recovery" ? C.amber : C.lime}>
              {reconciled.phase.kind === "recovery" ? "deload" : "load"}
            </Chip>
          </View>
          <View style={{ flexDirection: "row", gap: 16, marginTop: 10 }}>
            <Mono color={C.ash}>intensity {reconciled.intensity}</Mono>
            <Mono color={C.ash}>load ×{reconciled.loadFactor.toFixed(2)}</Mono>
            <Mono color={C.ash}>vol ×{reconciled.volumeFactor.toFixed(2)}</Mono>
          </View>
          {reconciled.blocks.map((b, i) => (
            <View key={`${b.name}-${i}`} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.chalk }}>{b.name}</Text>
                <Mono color={b.source === "sport" ? C.amber : C.ash} style={{ fontSize: 11 }}>
                  {b.source === "sport" ? `sport · ${b.demand ?? ""}` : b.kind === "conditioning" ? "conditioning" : "primary lift"}
                </Mono>
              </View>
              <Chip color={b.source === "sport" ? C.amber : C.lime}>{b.scheme}</Chip>
            </View>
          ))}
          <Mono color={C.chalk} style={{ marginTop: 10, lineHeight: 19 }}>{reconciled.why}</Mono>
          <Pressable
            onPress={scheduleThisWeek}
            disabled={scheduling}
            style={{ marginTop: 14, backgroundColor: C.violet, borderRadius: 12, paddingVertical: 12, alignItems: "center", opacity: scheduling ? 0.6 : 1 }}
          >
            <Text style={{ fontFamily: F.black, fontSize: 14, color: C.ink }}>{scheduling ? "Scheduling…" : `Schedule / re-sync week · ${daysPerWeek}d →`}</Text>
          </Pressable>
          {scheduled && <Mono color={C.lime} style={{ marginTop: 8, textAlign: "center" }}>{scheduled}</Mono>}
        </Card>
      )}

      {/* quick links */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Pressable
          onPress={() => router.push("/nutrition")}
          style={{ width: "48%", flexGrow: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 14 }}
        >
          <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.chalk }}>Nutrition →</Text>
          <Mono style={{ marginTop: 2, fontSize: 11 }}>log macros · adaptive targets</Mono>
        </Pressable>
        <Pressable
          onPress={() => router.push("/checkin")}
          style={{ width: "48%", flexGrow: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 14 }}
        >
          <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.chalk }}>Check-in →</Text>
          <Mono style={{ marginTop: 2, fontSize: 11 }}>weekly review · coach reply</Mono>
        </Pressable>
        <Pressable
          onPress={() => router.push("/calendar")}
          style={{ width: "48%", flexGrow: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 14 }}
        >
          <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.chalk }}>Calendar →</Text>
          <Mono style={{ marginTop: 2, fontSize: 11 }}>month view · load</Mono>
        </Pressable>
        <Pressable
          onPress={() => router.push("/progress")}
          style={{ width: "48%", flexGrow: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 14 }}
        >
          <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.chalk }}>Progress →</Text>
          <Mono style={{ marginTop: 2, fontSize: 11 }}>photos · timeline</Mono>
        </Pressable>
      </View>

      {/* ON TRACK? — accountability engine */}
      <Card style={{ borderLeftWidth: 3, borderLeftColor: bandColor(acc.band) }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Kicker color={bandColor(acc.band)}>On track? · {acc.band}</Kicker>
          <Chip color={bandColor(acc.band)}>{acc.streak.current ? `${acc.streak.current}-day streak` : "no streak yet"}</Chip>
        </View>
        <Text style={{ fontFamily: F.bold, fontSize: 16, color: C.chalk, marginTop: 8 }}>{acc.intervention.headline}</Text>
        <Mono color={C.chalk} style={{ marginTop: 4, lineHeight: 19 }}>{acc.intervention.message}</Mono>
        <View style={{ flexDirection: "row", gap: 16, marginTop: 10 }}>
          <Mono color={C.ash}>habit strength {strength}/100</Mono>
          <Mono color={C.ash}>this week {acc.sessionsLast7}/3</Mono>
        </View>
      </Card>

      {/* YOUR WEEK — recap + share (only once there's something to recap) */}
      {sessions.length > 0 && (
        <View style={{ marginBottom: 12 }}>
          <RecapShareCard ref={recapRef} recap={recap} t={t} />
          {recap.sessions > 0 ? (
            <Pressable
              onPress={() => shareWorkout(recapRef, recapShareText(recap, t), t("recap.share"))}
              style={{ backgroundColor: C.lime, borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 10 }}
            >
              <Text style={{ fontFamily: F.black, fontSize: 15, color: C.ink }}>{t("recap.share")}</Text>
            </Pressable>
          ) : (
            <Mono style={{ marginTop: 10, textAlign: "center" }}>{t("recap.noneThisWeek")}</Mono>
          )}
        </View>
      )}

      {/* FUTURE SELF */}
      {primaryLift && projection && !projection.insufficient && projGoal ? (
        <Card style={{ borderLeftWidth: 3, borderLeftColor: C.violet }}>
          <Kicker color={C.violet}>Future self · {primaryLift}</Kicker>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 8 }}>
            <Text style={{ fontFamily: F.black, fontSize: 28, color: C.chalk }}>{Math.round(projection.current)}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 14, color: C.ash }}>→</Text>
            <Text style={{ fontFamily: F.black, fontSize: 28, color: txt(C, C.violet) }}>
              {Math.round(projection.series[projection.series.length - 1]!.value)}
            </Text>
            <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.ash }}>kg in 12 wks</Text>
          </View>
          <Mono color={C.chalk} style={{ marginTop: 6, lineHeight: 19 }}>
            At your current pace (+{projection.ratePerWeek}kg/wk) you reach {goal}kg
            {projGoal.etaWeeks ? ` in ~${Math.round(projGoal.etaWeeks)} weeks` : ""} ·{" "}
            {projGoal.goalProbability != null ? `${Math.round(projGoal.goalProbability * 100)}% likely` : ""}
          </Mono>
          <Mono color={C.ash} style={{ marginTop: 6 }}>
            Consistency ×{projection.adherenceFactor} — train more often and this curve steepens.
          </Mono>
        </Card>
      ) : (
        <Card style={{ borderLeftWidth: 3, borderLeftColor: C.violet }}>
          <Kicker color={C.violet}>Future self</Kicker>
          <Mono color={C.chalk} style={{ marginTop: 8, lineHeight: 19 }}>
            Log a lift across a few sessions and we'll project where you're headed — your 12-week
            strength, your goal ETA, and how likely you are to hit it.
          </Mono>
        </Card>
      )}

      {/* TWIN — only once there's real training to compute it from */}
      {sessions.length > 0 && (
        <Card style={{ borderLeftWidth: 3, borderLeftColor: C.blue }}>
          <Kicker color={C.blue}>Performance State · Athlete Twin</Kicker>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 6 }}>
            <Text style={{ fontFamily: F.black, fontSize: 36, color: txt(C, hpiColor(state.hpi.band)) }}>{state.hpi.score}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.ash }}>HPI · {state.hpi.band} · limiter {state.hpi.limiter}</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 14, marginTop: 6 }}>
            <Mono color={C.lime}>STR {state.hpi.components.strength}</Mono>
            <Mono color={C.blue}>END {state.hpi.components.endurance}</Mono>
            <Mono color={C.violet}>REC {state.hpi.components.recovery >= 0 ? "+" : ""}{state.hpi.components.recovery}</Mono>
          </View>
        </Card>
      )}

      <Mono style={{ marginTop: 4 }}>{t("home.signedInAs")} {name}. Logged sessions sync with the web app.</Mono>
    </Screen>
  );
}
