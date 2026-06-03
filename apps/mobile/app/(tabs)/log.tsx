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
import { useDraft } from "../../lib/draft";
import { useLang } from "../../lib/i18n";
import { Screen, Card, Kicker, Mono, H1, C, F } from "../../lib/ui";

export default function Train() {
  const router = useRouter();
  const { t } = useLang();
  const { draft, discard } = useDraft();
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
  const start = (source: "empty" | "ai" | "last" | "new") => router.push(`/workout?source=${source}`);

  return (
    <Screen>
      <Kicker>{t("nav.log")}</Kicker>
      <H1>{t("train.title")}</H1>
      <Mono style={{ marginTop: 6 }}>{t("train.intro")}</Mono>

      {/* Resume — an in-progress workout that was interrupted */}
      {draft && (
        <Card style={{ borderLeftWidth: 3, borderLeftColor: C.amber, marginTop: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Kicker color={C.amber}>{t("train.resume")}</Kicker>
            <Pressable onPress={discard} hitSlop={8}>
              <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.ash }}>{t("train.discard")}</Text>
            </Pressable>
          </View>
          <Text style={{ fontFamily: F.bold, fontSize: 16, color: C.chalk, marginTop: 8 }}>{draft.title || "Workout"}</Text>
          <Mono style={{ marginTop: 2 }}>{draft.exercises.length} {t("workout.exercises")} · {t("train.inProgress")}</Mono>
          <Pressable
            onPress={() => start("empty")}
            style={{ backgroundColor: C.amber, borderRadius: 12, paddingVertical: 13, alignItems: "center", marginTop: 12 }}
          >
            <Text style={{ fontFamily: F.black, fontSize: 15, color: C.ink }}>▶  {t("train.resume")}</Text>
          </Pressable>
        </Card>
      )}

      {/* The one-tap hero — start a session right now (fresh if a draft exists) */}
      <Pressable
        onPress={() => start(draft ? "new" : "empty")}
        style={{ backgroundColor: C.lime, borderRadius: 18, paddingVertical: 26, alignItems: "center", marginTop: 16 }}
      >
        <Text style={{ fontFamily: F.black, fontSize: 22, color: C.ink }}>▶  {draft ? t("train.startFresh") : t("train.startWorkout")}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ink, opacity: 0.7, marginTop: 4 }}>{t("train.emptySub")}</Text>
      </Pressable>

      {/* AI-prescribed start */}
      <Pressable onPress={() => start("ai")}>
        <Card style={{ borderLeftWidth: 3, borderLeftColor: C.violet, marginTop: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Kicker color={C.violet}>{sessions.length > 0 ? `${t("train.aiReadiness")} ${rx.readiness}/100` : "AI coach"}</Kicker>
            <Text style={{ fontFamily: F.black, fontSize: 16, color: C.violet }}>{t("train.start")}</Text>
          </View>
          <Text style={{ fontFamily: F.black, fontSize: 18, color: C.chalk, marginTop: 8 }}>
            {sessions.length > 0 ? `${rx.blocks[0]?.name}${rx.blocks[1] ? ` + ${rx.blocks[1]?.name}` : ""}` : "Smart starter session"}
          </Text>
          <Mono color={C.chalk} style={{ marginTop: 6, lineHeight: 19 }}>
            {sessions.length > 0 ? rx.why : "Log a few sessions and the coach prescribes from your real readiness, fatigue and velocity. For now this is a balanced starter you can edit."}
          </Mono>
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
