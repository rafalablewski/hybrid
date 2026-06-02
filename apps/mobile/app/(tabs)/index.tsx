import { useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import {
  prescribeSession,
  computePerformanceState,
  toTrainingLog,
  buildMacrocycle,
  currentPhase,
  SAMPLE_TRAINING_LOG,
  SAMPLE_BIOMETRICS,
  type LoggedSession,
} from "@hybrid/core";
import { fetchSessions } from "../../lib/api";
import { useSession } from "../../lib/session";
import { useLang } from "../../lib/i18n";
import { Screen, Card, Kicker, Mono, H1, Button, C, F } from "../../lib/ui";

const hpiColor = (b: string) =>
  b === "peak" || b === "primed" ? C.lime : b === "moderate" ? C.blue : b === "compromised" ? C.amber : C.red;

export default function Home() {
  const router = useRouter();
  const { name, signOut } = useSession();
  const { lang, setLang, t } = useLang();
  const [sessions, setSessions] = useState<LoggedSession[]>([]);

  useEffect(() => {
    fetchSessions().then(setSessions);
  }, []);

  const log = sessions.length ? toTrainingLog(sessions) : SAMPLE_TRAINING_LOG;
  const rx = prescribeSession(log, SAMPLE_BIOMETRICS);
  const state = computePerformanceState(log, SAMPLE_BIOMETRICS);
  const macro = buildMacrocycle("Hybrid");
  const { block, micro } = currentPhase(macro, 5);

  return (
    <Screen>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Kicker>Today · week 5</Kicker>
          <H1>{t("home.ready")}</H1>
        </View>
        <View style={{ alignItems: "flex-end", gap: 8 }}>
          <View style={{ flexDirection: "row", gap: 4 }}>
            {(["en", "pl", "de"] as const).map((l) => (
              <Pressable
                key={l}
                onPress={() => setLang(l)}
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: lang === l ? C.lime : C.line,
                  backgroundColor: lang === l ? C.lime : "transparent",
                }}
              >
                <Text style={{ fontFamily: F.mono, fontSize: 11, color: lang === l ? C.ink : C.ash }}>
                  {l.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text onPress={signOut} style={{ fontFamily: F.mono, fontSize: 11, color: C.ash }}>
            {t("common.signout")}
          </Text>
        </View>
      </View>

      <Card style={{ borderLeftWidth: 3, borderLeftColor: C.lime, marginTop: 18 }}>
        <Kicker color={C.lime}>
          {macro.goalOrSport} · {block.label} phase
        </Kicker>
        <Text style={{ fontFamily: F.black, fontSize: 22, color: C.chalk, marginVertical: 6 }}>
          Today · {rx.blocks[0]?.name} + Engine
        </Text>
        <Mono>
          Week 5 of {macro.totalWeeks} · {micro.kind} week · {block.focus.toLowerCase()}
        </Mono>
        <View style={{ marginTop: 14 }}>
          <Button label={t("home.startSession")} onPress={() => router.push("/(tabs)/log")} />
        </View>
      </Card>

      <Card style={{ borderLeftWidth: 3, borderLeftColor: C.violet }}>
        <Kicker color={C.violet}>
          {t("home.aiCoach")} · {t("home.readiness")} {rx.readiness}/100
        </Kicker>
        <Mono color={C.chalk} style={{ marginTop: 8, lineHeight: 20 }}>
          {rx.why}
        </Mono>
        <Mono style={{ marginTop: 8 }}>
          confidence {Math.round(rx.confidence * 100)}% · grows as you log
        </Mono>
      </Card>

      <Card style={{ borderLeftWidth: 3, borderLeftColor: C.blue }}>
        <Kicker color={C.blue}>Performance State · Athlete Twin</Kicker>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 6 }}>
          <Text style={{ fontFamily: F.black, fontSize: 36, color: hpiColor(state.hpi.band) }}>
            {state.hpi.score}
          </Text>
          <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.ash }}>
            HPI · {state.hpi.band} · limiter {state.hpi.limiter}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 14, marginTop: 6 }}>
          <Mono color={C.lime}>STR {state.hpi.components.strength}</Mono>
          <Mono color={C.blue}>END {state.hpi.components.endurance}</Mono>
          <Mono color={C.violet}>REC {state.hpi.components.recovery >= 0 ? "+" : ""}{state.hpi.components.recovery}</Mono>
        </View>
        {state.drivers[0] && (
          <Mono color={C.chalk} style={{ marginTop: 8, lineHeight: 18 }}>
            {state.drivers[0].impact === "positive" ? "+ " : "− "}
            {state.drivers[0].factor}: {state.drivers[0].detail}
          </Mono>
        )}
      </Card>

      <Mono style={{ marginTop: 4 }}>
        {t("home.signedInAs")} {name}. Logged sessions sync with the web app.
      </Mono>
    </Screen>
  );
}
