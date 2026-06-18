import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  exerciseHistory, exerciseDashboard, paceClock, fmtWeight, fmtTonnage, kgToUnit,
  type LoggedSession, type ExercisePeriod, type ExerciseStats, type WeightUnit,
} from "@hybrid/core";
import { fetchSessions } from "../../lib/api";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useTheme, txt } from "../../lib/theme";
import { F } from "../../lib/ui";
import { AuroraScreen, ACard, AHeading, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";

const PERIODS: { id: ExercisePeriod; label: string }[] = [
  { id: "8w", label: "8 wk" }, { id: "6m", label: "6 mo" }, { id: "1y", label: "1 yr" }, { id: "all", label: "All" },
];
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });

/** AURORA Exercises — per-movement progress dashboard reusing the exact engine
 *  (exerciseHistory / exerciseDashboard). */
export default function AuroraExercises() {
  const { palette: C } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ name?: string }>();
  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [period, setPeriod] = useState<ExercisePeriod>("all");

  useEffect(() => { if (params.name) setSelected(params.name); }, [params.name]);
  const load = () => { setRefreshing(true); fetchSessions().then(setSessions).finally(() => setRefreshing(false)); };
  useEffect(load, []);

  const history = useMemo(() => exerciseHistory(sessions), [sessions]);
  const active = selected || history[0]?.name || "";
  const filtered = history.filter((e) => e.name.toLowerCase().includes(query.toLowerCase()));
  const { countWarmupsInVolume: iw, units } = useLoggerPrefs();
  const stats = useMemo(() => (active ? exerciseDashboard(sessions, active, period, Date.now(), iw) : null), [sessions, active, period, iw]);

  return (
    <AuroraScreen refreshing={refreshing} onRefresh={load}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
          <AuroraIcon name="back" size={20} color={C.chalk} />
        </Pressable>
        <AHeading style={{ fontSize: 26 }}>Exercises</AHeading>
      </View>

      {history.length === 0 ? (
        <ACard style={{ marginTop: 16, alignItems: "center", paddingVertical: 30 }}>
          <Text style={{ fontFamily: F.reg, fontSize: 14, color: C.chalk, textAlign: "center", lineHeight: 19 }}>No exercises logged yet. Log a workout and every movement gets its own progress dashboard here.</Text>
        </ACard>
      ) : (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 16 }}>
            <AuroraIcon name="search" size={20} color={C.ash} />
            <TextInput value={query} onChangeText={setQuery} placeholder="Search exercises…" placeholderTextColor={C.ash} style={{ flex: 1, fontFamily: F.reg, fontSize: 14, color: C.chalk, paddingVertical: 14 }} />
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 12 }}>
            {filtered.slice(0, 24).map((e) => {
              const on = e.name === active;
              return (
                <Pressable key={e.name} onPress={() => setSelected(e.name)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: on ? C.lime : C.line, backgroundColor: on ? C.lime : "transparent" }}>
                  <Text style={{ fontFamily: F.semi, fontSize: 12, color: on ? C.onAccent : C.ash }}>{e.name}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={{ flexDirection: "row", backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, padding: 4, gap: 4, marginTop: 14 }}>
            {PERIODS.map((p) => {
              const on = period === p.id;
              return (
                <Pressable key={p.id} onPress={() => setPeriod(p.id)} style={{ flex: 1, paddingVertical: 9, borderRadius: RADIUS.pill, backgroundColor: on ? C.lime : "transparent", alignItems: "center" }}>
                  <Text style={{ fontFamily: F.bold, fontSize: 12, color: on ? C.onAccent : C.ash }}>{p.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {stats && <Dashboard stats={stats} units={units} />}
        </>
      )}
    </AuroraScreen>
  );
}

function Dashboard({ stats, units }: { stats: ExerciseStats; units: WeightUnit }) {
  const { palette: C } = useTheme();
  if (stats.kind === "cardio") {
    if (stats.efforts === 0) return <ACard style={{ marginTop: 14 }}><Text style={{ fontFamily: F.reg, fontSize: 14, color: C.chalk }}>No runs of this movement in this period.</Text></ACard>;
    return (
      <>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
          <Metric label="RUNS" value={String(stats.efforts)} />
          <Metric label="KM" value={String(stats.distanceKm)} color={C.blue} />
          <Metric label="LONGEST" value={String(stats.longestKm)} />
          <Metric label="BEST" value={stats.bestPaceSecPerKm != null ? paceClock(stats.bestPaceSecPerKm) : "–"} color={C.blue} />
        </View>
        <ACard style={{ marginTop: 14 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.blue) }}>Pace · lower is faster</Text>
          <TrendBars series={stats.pace.map((p) => p.secPerKm)} color={C.blue} lowerIsBetter unit="pace" />
        </ACard>
      </>
    );
  }
  if (stats.workingSets === 0) return <ACard style={{ marginTop: 14 }}><Text style={{ fontFamily: F.reg, fontSize: 14, color: C.chalk }}>No working sets of this lift in this period.</Text></ACard>;
  return (
    <>
      <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
        <Metric label="BEST e1RM" value={fmtWeight(stats.bestE1rm, units)} color={C.lime} />
        <Metric label="SETS" value={String(stats.workingSets)} />
        <Metric label="VOLUME" value={fmtTonnage(stats.volume, units)} />
        <Metric label="SESSIONS" value={String(stats.sessions)} />
      </View>
      <ACard style={{ marginTop: 14 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>Estimated 1RM · warm-ups excluded</Text>
        <TrendBars series={stats.e1rm.map((p) => Math.round(kgToUnit(p.e1rm, units)))} color={C.lime} unit={units} />
      </ACard>
      {stats.bestSet && (
        <ACard style={{ marginTop: 14 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>Best set</Text>
          <Text style={{ fontFamily: F.mono, fontSize: 15, color: C.chalk, marginTop: 8 }}>{fmtWeight(stats.bestSet.load, units)} × {stats.bestSet.reps}<Text style={{ color: C.ash }}> · e1RM {fmtWeight(stats.bestSet.e1rm, units)} · {fmtDate(stats.bestSet.when)}</Text></Text>
          <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ash, marginTop: 8 }}>{stats.totalReps} reps · heaviest {fmtWeight(stats.heaviestLoad, units)} · all-time best {fmtWeight(stats.bestE1rmAllTime, units)}</Text>
        </ACard>
      )}
      {stats.velocity && (
        <ACard style={{ marginTop: 14 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.blue) }}>Velocity profile</Text>
          <Text style={{ fontFamily: F.black, fontSize: 22, color: txt(C, C.blue), marginTop: 6 }}>{fmtWeight(stats.velocity.e1rm, units)}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ash, marginTop: 4 }}>velocity-estimated 1RM · fit r² {stats.velocity.r2} · {stats.velocity.n} loads</Text>
        </ACard>
      )}
    </>
  );
}

function TrendBars({ series, color, lowerIsBetter = false, unit }: { series: number[]; color: string; lowerIsBetter?: boolean; unit: WeightUnit | "pace" }) {
  const { palette: C } = useTheme();
  if (series.length < 2) return <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ash, marginTop: 12 }}>Log this a few times to see a trend.</Text>;
  const max = Math.max(...series), min = Math.min(...series), range = max - min || 1;
  const latest = series[series.length - 1]!, delta = latest - series[0]!;
  const fmt = (v: number) => (unit === "pace" ? `${paceClock(v)} /km` : `${v} ${unit}`);
  const good = lowerIsBetter ? delta <= 0 : delta >= 0;
  return (
    <View style={{ marginTop: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.chalk }}>{fmt(latest)}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: 13, color: txt(C, good ? C.lime : C.amber) }}>{`${delta >= 0 ? "+" : "−"}${unit === "pace" ? paceClock(Math.abs(delta)) : Math.abs(delta)} · ${series.length}×`}</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: 44, gap: 3 }}>
        {series.map((v, i) => {
          const h = 8 + ((lowerIsBetter ? max - v : v - min) / range) * 34;
          return <View key={i} style={{ flex: 1, height: h, borderRadius: 3, backgroundColor: i === series.length - 1 ? color : `${color}55` }} />;
        })}
      </View>
    </View>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  const { palette: C } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card, paddingVertical: 14, alignItems: "center" }}>
      <Text style={{ fontFamily: F.black, fontSize: 18, color: color ? txt(C, color) : C.chalk }}>{value}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: 8, color: C.ash, letterSpacing: 0.8, marginTop: 2 }}>{label}</Text>
    </View>
  );
}
