import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import {
  prescribeSession,
  toTrainingLog,
  buildMacrocycle,
  currentPhase,
  SAMPLE_TRAINING_LOG,
  SAMPLE_BIOMETRICS,
  type LoggedSession,
} from "@hybrid/core";
import { fetchSessions } from "../../lib/api";
import { useSession } from "../../lib/session";
import { Screen, Card, Kicker, Mono, H1, Button, C, F } from "../../lib/ui";

export default function Home() {
  const router = useRouter();
  const { name, signOut } = useSession();
  const [sessions, setSessions] = useState<LoggedSession[]>([]);

  useEffect(() => {
    fetchSessions().then(setSessions);
  }, []);

  const log = sessions.length ? toTrainingLog(sessions) : SAMPLE_TRAINING_LOG;
  const rx = prescribeSession(log, SAMPLE_BIOMETRICS);
  const macro = buildMacrocycle("Hybrid");
  const { block, micro } = currentPhase(macro, 5);

  return (
    <Screen>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View>
          <Kicker>Today · week 5</Kicker>
          <H1>Ready to{"\n"}train.</H1>
        </View>
        <Text onPress={signOut} style={{ fontFamily: F.mono, fontSize: 11, color: C.ash, padding: 6 }}>
          sign out
        </Text>
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
          <Button label="Start session →" onPress={() => router.push("/(tabs)/log")} />
        </View>
      </Card>

      <Card style={{ borderLeftWidth: 3, borderLeftColor: C.violet }}>
        <Kicker color={C.violet}>AI Coach · readiness {rx.readiness}/100</Kicker>
        <Mono color={C.chalk} style={{ marginTop: 8, lineHeight: 20 }}>
          {rx.why}
        </Mono>
        <Mono style={{ marginTop: 8 }}>
          confidence {Math.round(rx.confidence * 100)}% · grows as you log
        </Mono>
      </Card>

      <Mono style={{ marginTop: 4 }}>
        Signed in as {name}. Logged sessions sync with the web app.
      </Mono>
    </Screen>
  );
}
