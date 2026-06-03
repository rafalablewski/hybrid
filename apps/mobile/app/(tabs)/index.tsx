import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import {
  prescribeSession,
  computePerformanceState,
  computeAccountability,
  habitStrength,
  projectLift,
  liftNames,
  velocityProfiles,
  toTrainingLog,
  SAMPLE_TRAINING_LOG,
  SAMPLE_BIOMETRICS,
  type LoggedSession,
} from "@hybrid/core";
import { fetchSessions } from "../../lib/api";
import { useSession } from "../../lib/session";
import { useLang } from "../../lib/i18n";
import { Screen, Card, Kicker, Mono, H1, Chip, Button, C, F } from "../../lib/ui";

const hpiColor = (b: string) =>
  b === "peak" || b === "primed" ? C.lime : b === "moderate" ? C.blue : b === "compromised" ? C.amber : C.red;

const bandColor = (b: string) =>
  b === "thriving" || b === "steady" ? C.lime : b === "wobbling" ? C.blue : b === "at-risk" ? C.amber : C.red;

export default function Home() {
  const router = useRouter();
  const { name, signOut } = useSession();
  const { lang, setLang, t } = useLang();
  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = () => {
    setRefreshing(true);
    fetchSessions().then(setSessions).finally(() => setRefreshing(false));
  };
  useEffect(load, []);

  const log = sessions.length ? toTrainingLog(sessions) : SAMPLE_TRAINING_LOG;
  const rx = useMemo(
    () => prescribeSession(log, SAMPLE_BIOMETRICS, { profiles: velocityProfiles(sessions) }),
    [log, sessions],
  );
  const state = useMemo(() => computePerformanceState(log, SAMPLE_BIOMETRICS), [log]);

  // Consumer engines run on REAL sessions (empty → honest "getting started").
  const acc = useMemo(() => computeAccountability(sessions, { targetPerWeek: 3 }), [sessions]);
  const strength = useMemo(() => habitStrength(sessions, 3), [sessions]);
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

      {/* ROUTE TODAY — what to do, why */}
      <Card style={{ borderLeftWidth: 3, borderLeftColor: C.lime, marginTop: 18 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Kicker color={C.lime}>Your route today</Kicker>
          <Mono color={C.ash}>readiness {rx.readiness}/100</Mono>
        </View>
        <Text style={{ fontFamily: F.black, fontSize: 22, color: C.chalk, marginVertical: 6 }}>
          {rx.blocks[0]?.name}{rx.blocks[1] ? ` + ${rx.blocks[1]?.name}` : ""}
        </Text>
        <Mono color={C.chalk} style={{ lineHeight: 20 }}>{rx.why}</Mono>
        <View style={{ marginTop: 14 }}>
          <Button label={t("home.startSession")} onPress={() => router.push("/(tabs)/log")} />
        </View>
      </Card>

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

      {/* FUTURE SELF */}
      {primaryLift && projection && !projection.insufficient && projGoal ? (
        <Card style={{ borderLeftWidth: 3, borderLeftColor: C.violet }}>
          <Kicker color={C.violet}>Future self · {primaryLift}</Kicker>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 8 }}>
            <Text style={{ fontFamily: F.black, fontSize: 28, color: C.chalk }}>{Math.round(projection.current)}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 14, color: C.ash }}>→</Text>
            <Text style={{ fontFamily: F.black, fontSize: 28, color: C.violet }}>
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

      {/* TWIN */}
      <Card style={{ borderLeftWidth: 3, borderLeftColor: C.blue }}>
        <Kicker color={C.blue}>Performance State · Athlete Twin</Kicker>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 6 }}>
          <Text style={{ fontFamily: F.black, fontSize: 36, color: hpiColor(state.hpi.band) }}>{state.hpi.score}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.ash }}>HPI · {state.hpi.band} · limiter {state.hpi.limiter}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 14, marginTop: 6 }}>
          <Mono color={C.lime}>STR {state.hpi.components.strength}</Mono>
          <Mono color={C.blue}>END {state.hpi.components.endurance}</Mono>
          <Mono color={C.violet}>REC {state.hpi.components.recovery >= 0 ? "+" : ""}{state.hpi.components.recovery}</Mono>
        </View>
      </Card>

      <Mono style={{ marginTop: 4 }}>{t("home.signedInAs")} {name}. Logged sessions sync with the web app.</Mono>
    </Screen>
  );
}
