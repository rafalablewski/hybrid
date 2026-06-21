import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import {
  weeklyVolumeTrend, weeklyMuscleSets, exerciseTable, volumeStatus, volumeAdvice, resolveLandmarks, fmtWeight,
  type LoggedSession, type ExercisePeriod, type TrendDir, type MuscleGroup, type ExerciseTableRow,
} from "@hybrid/core";
import { fetchSessions } from "../../lib/api";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, space, F } from "../../lib/ui";
import { AuroraScreen, ACard, AHeading, ASub, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";

const MUSCLE_KEY: Record<string, string> = { quads: "w.analyze.trends.muscleQuads", glutes: "w.analyze.trends.muscleGlutes", posterior: "w.analyze.trends.musclePosterior", back: "w.analyze.trends.muscleBack", chest: "w.analyze.trends.muscleChest", shoulders: "w.analyze.trends.muscleShoulders", triceps: "w.analyze.trends.muscleTriceps" };
const PERIODS: { id: ExercisePeriod; key: string }[] = [{ id: "8w", key: "w.analyze.trends.period8w" }, { id: "6m", key: "w.analyze.trends.period6m" }, { id: "1y", key: "w.analyze.trends.period1y" }, { id: "all", key: "w.analyze.trends.periodAll" }];

/** AURORA Trends — analytics hub (weekly volume, muscle breakdown, per-exercise
 *  table) reusing the exact engines. */
export default function AuroraTrends() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const ml = (m: string) => (MUSCLE_KEY[m] ? t(MUSCLE_KEY[m]) : m);
  const router = useRouter();
  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<ExercisePeriod>("all");
  const [sort, setSort] = useState<{ k: keyof ExerciseTableRow; dir: 1 | -1 }>({ k: "volume", dir: -1 });
  const [selMuscle, setSelMuscle] = useState<MuscleGroup | null>(null);

  const load = () => { setRefreshing(true); fetchSessions().then(setSessions).finally(() => setRefreshing(false)); };
  useEffect(load, []);

  const prefs = useLoggerPrefs();
  const iw = prefs.countWarmupsInVolume, units = prefs.units, fr = prefs.fractionalVolume;
  const lm = useMemo(() => resolveLandmarks(prefs.landmarkOverrides), [prefs.landmarkOverrides]);
  const weeks = useMemo(() => weeklyVolumeTrend(sessions, 8, Date.now(), iw), [sessions, iw]);
  const table = useMemo(() => exerciseTable(sessions, period, Date.now(), iw), [sessions, period, iw]);
  const muscles = useMemo(() => volumeStatus(sessions, { includeWarmups: iw, fractional: fr, landmarks: lm }), [sessions, iw, fr, lm]);
  const advice = useMemo(() => volumeAdvice(sessions, { includeWarmups: iw, fractional: fr, landmarks: lm }), [sessions, iw, fr, lm]);
  const trained = muscles.some((m) => m.sets > 0);
  const focusMuscle = selMuscle ?? advice[0]?.muscle ?? [...muscles].sort((a, b) => b.sets - a.sets)[0]?.muscle ?? "chest";
  const muscleWeeks = useMemo(() => weeklyMuscleSets(sessions, focusMuscle, 8, Date.now(), iw, fr), [sessions, focusMuscle, iw, fr]);
  const sortedTable = useMemo(() => {
    const arr = [...table]; const { k, dir } = sort;
    arr.sort((a, b) => (k === "name" ? dir * a.name.localeCompare(b.name) : dir * ((a[k] as number) - (b[k] as number))));
    return arr;
  }, [table, sort]);
  const sortBy = (k: keyof ExerciseTableRow) => setSort((s) => (s.k === k ? { k, dir: (s.dir * -1) as 1 | -1 } : { k, dir: k === "name" ? 1 : -1 }));

  const TREND: Record<TrendDir, { g: string; c: string }> = { up: { g: "▲", c: C.lime }, down: { g: "▼", c: C.amber }, flat: { g: "→", c: C.ash } };
  const maxSets = Math.max(...weeks.map((w) => w.sets), 1);

  return (
    <AuroraScreen refreshing={refreshing} onRefresh={load}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
        <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
          <AuroraIcon name="back" size={20} color={C.chalk} />
        </Pressable>
        <AHeading style={{ fontSize: fs.display }}>{t("w.analyze.trends.title")}</AHeading>
      </View>
      <ASub style={{ marginTop: 10 }}>{t("w.analyze.trends.subtitle")}</ASub>

      {!trained ? (
        <ACard style={{ marginTop: 16, alignItems: "center", paddingVertical: 30 }}>
          <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, textAlign: "center", lineHeight: 19 }}>{t("w.analyze.trends.empty")}</Text>
        </ACard>
      ) : (
        <>
          <ACard style={{ marginTop: 14 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>{t("w.analyze.trends.weeklySets")}</Text>
            <View style={{ flexDirection: "row", alignItems: "flex-end", height: 80, gap: 5, marginTop: 12 }}>
              {weeks.map((w, i) => <View key={i} style={{ flex: 1, height: 6 + (w.sets / maxSets) * 64, borderRadius: 3, backgroundColor: i === weeks.length - 1 ? C.lime : `${C.lime}66` }} />)}
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
              <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash }}>{t("w.analyze.trends.weeksAgo")}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash }}>{`${weeks[weeks.length - 1]!.sets} ${t("w.analyze.trends.setsThisWk")}`}</Text>
            </View>
          </ACard>

          <ACard style={{ marginTop: 14 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.blue) }}>{t("w.analyze.trends.muscleBreakdown")}</Text>
              <Pressable onPress={() => router.push("/volume")}><Text style={{ fontFamily: F.semi, fontSize: fs.caption, color: txt(C, C.lime) }}>{t("w.analyze.trends.volumeDetail")}</Text></Pressable>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 12 }}>
              {muscles.map((m) => {
                const c = m.zone === "overreaching" ? C.red : m.zone === "under" ? C.amber : m.zone === "peak" ? C.blue : C.lime;
                const on = m.muscle === focusMuscle;
                return (
                  <Pressable key={m.muscle} onPress={() => setSelMuscle(m.muscle)} style={{ flexDirection: "row", alignItems: "center", gap: space.xs, borderWidth: 1, borderColor: on ? c : `${c}55`, backgroundColor: `${c}${on ? "2e" : "14"}`, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 6 }}>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk }}>{ml(m.muscle)}</Text>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.caption, fontWeight: "700", color: txt(C, c) }}>{m.sets}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: C.ash, marginTop: 14 }}>{ml(focusMuscle)} · {t("w.analyze.trends.weeklySets8w")}</Text>
            <View style={{ flexDirection: "row", alignItems: "flex-end", height: 56, gap: 5, marginTop: 8 }}>
              {muscleWeeks.map((s, i) => { const mx = Math.max(...muscleWeeks, 1); return <View key={i} style={{ flex: 1, height: 4 + (s / mx) * 48, borderRadius: 3, backgroundColor: i === muscleWeeks.length - 1 ? C.blue : `${C.blue}66` }} />; })}
            </View>
            {advice.length > 0 && (
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 10, lineHeight: 17 }}>
                {advice.filter((a) => a.action === "add").length > 0 && `${t("w.analyze.trends.addVolume")} ${advice.filter((a) => a.action === "add").map((a) => ml(a.muscle)).join(", ")}. `}
                {advice.filter((a) => a.action === "reduce").length > 0 && `${t("w.analyze.trends.easeOff")} ${advice.filter((a) => a.action === "reduce").map((a) => ml(a.muscle)).join(", ")}.`}
              </Text>
            )}
          </ACard>

          <ACard style={{ marginTop: 14 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>{t("w.analyze.trends.exerciseAnalytics")}</Text>
            <View style={{ flexDirection: "row", backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, padding: 4, gap: space.xxs, marginTop: 12 }}>
              {PERIODS.map((p) => { const on = period === p.id; return (
                <Pressable key={p.id} onPress={() => setPeriod(p.id)} style={{ flex: 1, paddingVertical: 8, borderRadius: RADIUS.pill, backgroundColor: on ? C.lime : "transparent", alignItems: "center" }}>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.micro, color: on ? C.onAccent : C.ash }}>{t(p.key)}</Text>
                </Pressable>
              ); })}
            </View>
            <View style={{ flexDirection: "row", marginTop: 12, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.line }}>
              {([["w.analyze.trends.colExercise", "name", 2, "left"], ["w.analyze.trends.colFreq", "sessions", 1, "center"], ["w.analyze.trends.colBestE1rm", "bestE1rm", 1, "center"]] as const).map(([h, k, fl, al]) => (
                <Text key={h} onPress={() => sortBy(k)} style={{ flex: fl, textAlign: al, fontFamily: F.mono, fontSize: 9, color: sort.k === k ? txt(C, C.lime) : C.ash, letterSpacing: 1 }}>{t(h)}{sort.k === k ? (sort.dir === 1 ? " ↑" : " ↓") : ""}</Text>
              ))}
              <Text onPress={() => sortBy("volume")} style={{ width: 28, textAlign: "center", fontFamily: F.mono, fontSize: 9, color: sort.k === "volume" ? txt(C, C.lime) : C.ash }}>↗</Text>
            </View>
            {sortedTable.map((r) => { const tr = TREND[r.trend]; return (
              <Pressable key={r.name} onPress={() => router.push({ pathname: "/exercises", params: { name: r.name } })} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 9, borderTopWidth: 1, borderTopColor: C.line }}>
                <Text style={{ flex: 2, fontFamily: F.mono, fontSize: fs.body, color: txt(C, C.lime) }}>{r.name}</Text>
                <Text style={{ flex: 1, textAlign: "center", fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{r.sessions}×</Text>
                <Text style={{ flex: 1, textAlign: "center", fontFamily: F.mono, fontSize: fs.body, color: r.kind === "strength" ? C.chalk : C.ash }}>{r.kind === "strength" ? fmtWeight(r.bestE1rm, units) : `${r.volume}km`}</Text>
                <Text style={{ width: 28, textAlign: "center", fontFamily: F.mono, fontSize: fs.body, color: txt(C, tr.c) }}>{tr.g}</Text>
              </Pressable>
            ); })}
          </ACard>
        </>
      )}
    </AuroraScreen>
  );
}
