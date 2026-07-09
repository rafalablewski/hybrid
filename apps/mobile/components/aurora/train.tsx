import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import {
  prescribeSession,
  toTrainingLog,
  velocityProfiles,
  type LoggedSession,
} from "@hybrid/core";
import { FUNNEL } from "@hybrid/core";
import { fetchSessions, fetchRoutines, type Routine } from "../../lib/api";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useDraft } from "../../lib/draft";
import { useLang } from "../../lib/i18n";
import { useSession } from "../../lib/session";
import { usePersona } from "../../lib/persona";
import { track } from "../../lib/track";
import { fs, F } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { AuroraScreen, ACard, AHeading, RADIUS } from "./kit";

/** AURORA Train launcher — start a session (one-tap / AI / repeat-last /
 *  routine), resume a draft. Reuses prescribeSession + sessions/routines APIs. */
export default function AuroraTrain() {
  const { palette: C } = useTheme();
  const router = useRouter();
  const { t } = useLang();
  const { draft, discard } = useDraft();
  const { defaultStart } = useLoggerPrefs();
  const { session } = useSession();
  // AI-prescribed sessions are premium (paid) only — casual/guest are funnelled.
  const isAthlete = usePersona() !== "casual";
  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);

  useEffect(() => {
    fetchSessions().then(setSessions);
    fetchRoutines().then(setRoutines);
  }, []);

  const rx = useMemo(
    () =>
      prescribeSession(toTrainingLog(sessions), undefined, {
        profiles: velocityProfiles(sessions),
      }),
    [sessions],
  );

  const last = sessions[0];
  const start = (source: "empty" | "ai" | "last" | "new") => router.push(`/workout?source=${source}`);
  // Premium gate for the AI-prescribed start: guests register, free users upgrade.
  const startAI = () => {
    if (isAthlete) return start("ai");
    track(FUNNEL.upgradeEntryClick, { client: "mobile", source: "train-ai" });
    router.push(session ? "/upgrade" : "/login?mode=signup");
  };

  return (
    <AuroraScreen>
      <AHeading style={{ fontSize: 28 }}>{t("train.title")}</AHeading>
      <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash, marginTop: 8, lineHeight: 20 }}>{t("train.intro")}</Text>

      {draft && (
        <ACard style={{ marginTop: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{t("train.resume")}</Text>
            <Pressable onPress={discard} hitSlop={8}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("train.discard")}</Text>
            </Pressable>
          </View>
          <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk, marginTop: 8 }}>{draft.title || "Workout"}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 2 }}>{draft.exercises.length} {t("workout.exercises")} · {t("train.inProgress")}</Text>
          <Pressable onPress={() => start("empty")} style={{ backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingVertical: 15, alignItems: "center", marginTop: 12 }}>
            <Text style={{ fontFamily: F.black, fontSize: fs.note, color: C.ink }}>▶  {t("train.resume")}</Text>
          </Pressable>
        </ACard>
      )}

      {/* One-tap hero start */}
      <Pressable
        onPress={() => start(draft ? "new" : defaultStart)}
        style={{ backgroundColor: C.lime, borderRadius: RADIUS.card, paddingVertical: 28, alignItems: "center", marginTop: 16 }}
      >
        <Text style={{ fontFamily: F.black, fontSize: 22, color: C.ink }}>▶  {draft ? t("train.startFresh") : t("train.startWorkout")}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ink, opacity: 0.7, marginTop: 4 }}>{t("train.emptySub")}</Text>
      </Pressable>

      {/* AI-prescribed start — a PREMIUM feature. Paid athletes see their real
          readiness-driven prescription; casual/guests see the pitch + a single
          upgrade tap (no fabricated numbers). */}
      <Pressable onPress={startAI}>
        <ACard style={{ marginTop: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>
              {!isAthlete ? `AI coach · ${t("train.premium")}` : sessions.length > 0 ? `${t("train.aiReadiness")} ${rx.readiness}/100` : "AI coach"}
            </Text>
            <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: txt(C, C.lime) }}>{!isAthlete ? t("w.home.today.unlockFullBtn") : t("train.start")}</Text>
          </View>
          <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk, marginTop: 8 }}>
            {!isAthlete ? t("train.aiLockedTitle") : sessions.length > 0 ? `${rx.blocks[0]?.name}${rx.blocks[1] ? ` + ${rx.blocks[1]?.name}` : ""}` : t("train.aiEmptyTitle")}
          </Text>
          <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, marginTop: 6, lineHeight: 19 }}>
            {!isAthlete ? t("train.aiLockedBlurb") : sessions.length > 0 ? rx.why : t("train.aiEmptyBlurb")}
          </Text>
        </ACard>
      </Pressable>

      {/* Repeat last */}
      {last && (
        <Pressable onPress={() => start("last")}>
          <ACard style={{ marginTop: 16 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{t("train.repeatLast")}</Text>
              <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: txt(C, C.lime) }}>{t("train.start")}</Text>
            </View>
            <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk, marginTop: 8 }}>{last.title}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 4 }}>
              {last.blocks.map((b) => b.name).slice(0, 3).join(" · ")}
            </Text>
          </ACard>
        </Pressable>
      )}

      {/* Routines */}
      {routines.length > 0 && (
        <ACard style={{ marginTop: 16 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>{t("train.routines")}</Text>
          {routines.map((r, i) => (
            <Pressable
              key={r.id}
              onPress={() => router.push(`/workout?source=template&templateId=${r.id}`)}
              style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: i ? 10 : 8, paddingTop: i ? 10 : 0, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{r.name}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 2 }}>{r.blocks.map((b) => b.name).slice(0, 3).join(" · ")}</Text>
              </View>
              <Text style={{ fontFamily: F.black, fontSize: fs.note, color: txt(C, C.lime) }}>{t("train.start")}</Text>
            </Pressable>
          ))}
        </ACard>
      )}

      {/* Build a reusable routine */}
      <Pressable onPress={() => router.push("/builder")} style={{ borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, paddingVertical: 15, alignItems: "center", marginTop: 16 }}>
        <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>＋ Build a routine</Text>
      </Pressable>

      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 12, lineHeight: 19 }}>{t("train.finishedNote")}</Text>
    </AuroraScreen>
  );
}
