import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import {
  prescribeSession,
  toTrainingLog,
  velocityProfiles,
  SAMPLE_TRAINING_LOG,
  SAMPLE_BIOMETRICS,
  type LoggedSession,
} from "@hybrid/core";
import { fetchSessions } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { Screen, Card, Kicker, Mono, H1, C, F } from "../../lib/ui";

export default function Train() {
  const router = useRouter();
  const { t } = useLang();
  const [sessions, setSessions] = useState<LoggedSession[]>([]);

  useEffect(() => {
    fetchSessions().then(setSessions);
  }, []);

  const rx = useMemo(
    () =>
      prescribeSession(sessions.length ? toTrainingLog(sessions) : SAMPLE_TRAINING_LOG, SAMPLE_BIOMETRICS, {
        profiles: velocityProfiles(sessions),
      }),
    [sessions],
  );

  const last = sessions[0];
  const start = (source: "empty" | "ai" | "last") => router.push(`/workout?source=${source}`);

  return (
    <Screen>
      <Kicker>{t("nav.log")}</Kicker>
      <H1>{t("train.title")}</H1>
      <Mono style={{ marginTop: 6 }}>{t("train.intro")}</Mono>

      {/* The one-tap hero — start an empty session right now */}
      <Pressable
        onPress={() => start("empty")}
        style={{ backgroundColor: C.lime, borderRadius: 18, paddingVertical: 26, alignItems: "center", marginTop: 18 }}
      >
        <Text style={{ fontFamily: F.black, fontSize: 22, color: C.ink }}>▶  {t("train.startWorkout")}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ink, opacity: 0.7, marginTop: 4 }}>{t("train.emptySub")}</Text>
      </Pressable>

      {/* AI-prescribed start */}
      <Pressable onPress={() => start("ai")}>
        <Card style={{ borderLeftWidth: 3, borderLeftColor: C.violet, marginTop: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Kicker color={C.violet}>{t("train.aiReadiness")} {rx.readiness}/100</Kicker>
            <Text style={{ fontFamily: F.black, fontSize: 16, color: C.violet }}>{t("train.start")}</Text>
          </View>
          <Text style={{ fontFamily: F.black, fontSize: 18, color: C.chalk, marginTop: 8 }}>
            {rx.blocks[0]?.name}{rx.blocks[1] ? ` + ${rx.blocks[1]?.name}` : ""}
          </Text>
          <Mono color={C.chalk} style={{ marginTop: 6, lineHeight: 19 }}>{rx.why}</Mono>
        </Card>
      </Pressable>

      {/* Repeat last — fastest path to a known session */}
      {last && (
        <Pressable onPress={() => start("last")}>
          <Card style={{ borderLeftWidth: 3, borderLeftColor: C.blue }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Kicker color={C.blue}>{t("train.repeatLast")}</Kicker>
              <Text style={{ fontFamily: F.black, fontSize: 16, color: C.blue }}>{t("train.start")}</Text>
            </View>
            <Text style={{ fontFamily: F.bold, fontSize: 16, color: C.chalk, marginTop: 8 }}>{last.title}</Text>
            <Mono style={{ marginTop: 4 }}>
              {last.blocks.map((b) => b.name).slice(0, 3).join(" · ")}
            </Mono>
          </Card>
        </Pressable>
      )}

      <Mono style={{ marginTop: 8, lineHeight: 19 }}>{t("train.finishedNote")}</Mono>
    </Screen>
  );
}
