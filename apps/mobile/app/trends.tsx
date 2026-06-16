import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import {
  weeklyVolumeTrend,
  weeklyMuscleSets,
  exerciseTable,
  volumeStatus,
  volumeAdvice,
  resolveLandmarks,
  type LoggedSession,
  type ExercisePeriod,
  type TrendDir,
  type MuscleGroup,
  type ExerciseTableRow,
} from "@hybrid/core";
import { fetchSessions } from "../lib/api";
import { useLoggerPrefs } from "../lib/logger-prefs";
import { useLang } from "../lib/i18n";
import { Screen, Card, Kicker, H1, Mono, F } from "../lib/ui";
import { useTheme } from "../lib/theme";

const MUSCLE_LABEL: Record<string, string> = {
  quads: "Quads", glutes: "Glutes", posterior: "Posterior", back: "Back", chest: "Chest", shoulders: "Shoulders", triceps: "Triceps",
};
const PERIODS: { id: ExercisePeriod; label: string }[] = [
  { id: "8w", label: "8 wk" },
  { id: "6m", label: "6 mo" },
  { id: "1y", label: "1 yr" },
  { id: "all", label: "All" },
];

/** Training analytics hub — volume trends, muscle breakdown, and a per-exercise
 *  table that drills into each movement's dashboard. Mobile port of web Trends. */
export default function Trends() {
  const C = useTheme().palette;
  const { t } = useLang();
  const router = useRouter();
  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<ExercisePeriod>("all");
  const [sort, setSort] = useState<{ k: keyof ExerciseTableRow; dir: 1 | -1 }>({ k: "volume", dir: -1 });
  const [selMuscle, setSelMuscle] = useState<MuscleGroup | null>(null);

  const load = () => {
    setRefreshing(true);
    fetchSessions().then(setSessions).finally(() => setRefreshing(false));
  };
  useEffect(load, []);

  const prefs = useLoggerPrefs();
  const iw = prefs.countWarmupsInVolume;
  const lm = useMemo(() => resolveLandmarks(prefs.landmarkOverrides), [prefs.landmarkOverrides]);
  const weeks = useMemo(() => weeklyVolumeTrend(sessions, 8, Date.now(), iw), [sessions, iw]);
  const table = useMemo(() => exerciseTable(sessions, period, Date.now(), iw), [sessions, period, iw]);
  const muscles = useMemo(() => volumeStatus(sessions, { includeWarmups: iw, landmarks: lm }), [sessions, iw, lm]);
  const advice = useMemo(() => volumeAdvice(sessions, { includeWarmups: iw, landmarks: lm }), [sessions, iw, lm]);
  const trained = muscles.some((m) => m.sets > 0);

  const focusMuscle = selMuscle ?? advice[0]?.muscle ?? [...muscles].sort((a, b) => b.sets - a.sets)[0]?.muscle ?? "chest";
  const muscleWeeks = useMemo(() => weeklyMuscleSets(sessions, focusMuscle, 8, Date.now(), iw), [sessions, focusMuscle, iw]);
  const sortedTable = useMemo(() => {
    const arr = [...table];
    const { k, dir } = sort;
    arr.sort((a, b) => (k === "name" ? dir * a.name.localeCompare(b.name) : dir * ((a[k] as number) - (b[k] as number))));
    return arr;
  }, [table, sort]);
  const sortBy = (k: keyof ExerciseTableRow) => setSort((s) => (s.k === k ? { k, dir: (s.dir * -1) as 1 | -1 } : { k, dir: k === "name" ? 1 : -1 }));

  const TREND: Record<TrendDir, { g: string; c: string }> = {
    up: { g: "▲", c: C.lime },
    down: { g: "▼", c: C.amber },
    flat: { g: "→", c: C.ash },
  };
  const maxSets = Math.max(...weeks.map((w) => w.sets), 1);

  return (
    <Screen refreshing={refreshing} onRefresh={load}>
      <Kicker>{t("nav.trends")}</Kicker>
      <H1>Trends</H1>
      <Mono style={{ marginTop: 6, lineHeight: 18 }}>
        Volume over time, muscle breakdown and per-exercise analytics — tap a lift for its full dashboard.
      </Mono>

      {!trained ? (
        <Card style={{ marginTop: 14, alignItems: "center", paddingVertical: 30 }}>
          <Mono color={C.chalk} style={{ textAlign: "center", lineHeight: 19 }}>
            No strength training logged yet. Log some lifts and your volume trends, muscle breakdown and per-exercise
            analytics show up here.
          </Mono>
        </Card>
      ) : (
        <>
          {/* Weekly working-set bars */}
          <Card style={{ marginTop: 14 }}>
            <Kicker color={C.lime}>Weekly working sets · 8 wk</Kicker>
            <View style={{ flexDirection: "row", alignItems: "flex-end", height: 80, gap: 5, marginTop: 12 }}>
              {weeks.map((w, i) => (
                <View key={i} style={{ flex: 1, height: 6 + (w.sets / maxSets) * 64, borderRadius: 3, backgroundColor: i === weeks.length - 1 ? C.lime : `${C.lime}66` }} />
              ))}
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
              <Mono style={{ fontSize: 9 }}>8 wk ago</Mono>
              <Mono style={{ fontSize: 9 }}>{`${weeks[weeks.length - 1]!.sets} sets · this wk`}</Mono>
            </View>
          </Card>

          {/* Muscle breakdown */}
          <Card style={{ marginTop: 14 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Kicker color={C.blue}>Muscle breakdown · this week</Kicker>
              <Pressable onPress={() => router.push("/volume")}>
                <Text style={{ fontFamily: F.semi, fontSize: 12, color: C.lime }}>Volume detail →</Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 12 }}>
              {muscles.map((m) => {
                const c = m.zone === "overreaching" ? C.red : m.zone === "under" ? C.amber : m.zone === "peak" ? C.blue : C.lime;
                const on = m.muscle === focusMuscle;
                return (
                  <Pressable key={m.muscle} onPress={() => setSelMuscle(m.muscle)} style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: on ? c : `${c}55`, backgroundColor: `${c}${on ? "2e" : "14"}`, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5 }}>
                    <Mono color={C.chalk} style={{ fontSize: 12 }}>{MUSCLE_LABEL[m.muscle] ?? m.muscle}</Mono>
                    <Text style={{ fontFamily: F.mono, fontSize: 12, fontWeight: "700", color: c }}>{m.sets}</Text>
                  </Pressable>
                );
              })}
            </View>
            {/* Per-muscle 8-week trend */}
            <Mono style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", marginTop: 14 }}>{MUSCLE_LABEL[focusMuscle] ?? focusMuscle} · weekly sets · 8 wk</Mono>
            <View style={{ flexDirection: "row", alignItems: "flex-end", height: 56, gap: 5, marginTop: 8 }}>
              {muscleWeeks.map((s, i) => {
                const mx = Math.max(...muscleWeeks, 1);
                return <View key={i} style={{ flex: 1, height: 4 + (s / mx) * 48, borderRadius: 3, backgroundColor: i === muscleWeeks.length - 1 ? C.blue : `${C.blue}66` }} />;
              })}
            </View>
            {advice.length > 0 && (
              <Mono style={{ fontSize: 12, marginTop: 10, lineHeight: 17 }}>
                {advice.filter((a) => a.action === "add").length > 0 && `Add: ${advice.filter((a) => a.action === "add").map((a) => MUSCLE_LABEL[a.muscle]).join(", ")}. `}
                {advice.filter((a) => a.action === "reduce").length > 0 && `Ease off: ${advice.filter((a) => a.action === "reduce").map((a) => MUSCLE_LABEL[a.muscle]).join(", ")}.`}
              </Mono>
            )}
          </Card>

          {/* Exercise analytics table */}
          <Card style={{ marginTop: 14 }}>
            <Kicker color={C.lime}>Exercise analytics</Kicker>
            <View style={{ flexDirection: "row", gap: 6, marginTop: 10 }}>
              {PERIODS.map((p) => {
                const on = period === p.id;
                return (
                  <Pressable key={p.id} onPress={() => setPeriod(p.id)} style={{ flex: 1, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: on ? C.lime : C.line, backgroundColor: on ? `${C.lime}1a` : "transparent", alignItems: "center" }}>
                    <Text style={{ fontFamily: F.mono, fontSize: 11, color: on ? C.lime : C.ash }}>{p.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={{ flexDirection: "row", marginTop: 12, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.line }}>
              {([["EXERCISE", "name", 2, "left"], ["FREQ", "sessions", 1, "center"], ["BEST", "bestE1rm", 1, "center"]] as const).map(([h, k, fl, al]) => (
                <Text key={h} onPress={() => sortBy(k)} style={{ flex: fl, textAlign: al, fontFamily: F.mono, fontSize: 9, color: sort.k === k ? C.lime : C.ash, letterSpacing: 1 }}>
                  {h}{sort.k === k ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
                </Text>
              ))}
              <Text onPress={() => sortBy("volume")} style={{ width: 28, textAlign: "center", fontFamily: F.mono, fontSize: 9, color: sort.k === "volume" ? C.lime : C.ash, letterSpacing: 1 }}>↗</Text>
            </View>
            {sortedTable.map((r) => {
              const tr = TREND[r.trend];
              return (
                <Pressable key={r.name} onPress={() => router.push({ pathname: "/exercises", params: { name: r.name } })} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 9, borderTopWidth: 1, borderTopColor: C.line }}>
                  <Mono color={C.lime} style={{ flex: 2, fontSize: 13 }}>{r.name}</Mono>
                  <Mono style={{ flex: 1, textAlign: "center", fontSize: 13 }}>{r.sessions}×</Mono>
                  <Mono color={r.kind === "strength" ? C.chalk : C.ash} style={{ flex: 1, textAlign: "center", fontSize: 13 }}>
                    {r.kind === "strength" ? `${r.bestE1rm}` : `${r.volume}km`}
                  </Mono>
                  <Text style={{ width: 28, textAlign: "center", fontFamily: F.mono, fontSize: 13, color: tr.c }}>{tr.g}</Text>
                </Pressable>
              );
            })}
          </Card>
        </>
      )}
    </Screen>
  );
}
