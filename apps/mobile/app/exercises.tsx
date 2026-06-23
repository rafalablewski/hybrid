import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { useLocalSearchParams } from "expo-router";
import {
  exerciseHistory,
  exerciseDashboard,
  paceClock,
  fmtWeight,
  fmtTonnage,
  kgToUnit,
  type LoggedSession,
  type ExercisePeriod,
  type ExerciseStats,
  type WeightUnit,
} from "@hybrid/core";
import { useSessionsQuery } from "../lib/queries";
import { useRefreshOnFocus } from "../lib/query";
import { useLoggerPrefs } from "../lib/logger-prefs";
import { useLang } from "../lib/i18n";
import { fs, space, Screen, Card, Kicker, H1, Mono, F } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";
import { useTemplate } from "../lib/template";
import AuroraExercises from "../components/aurora/exercises";

const PERIODS: { id: ExercisePeriod; label: string }[] = [
  { id: "8w", label: "8 wk" },
  { id: "6m", label: "6 mo" },
  { id: "1y", label: "1 yr" },
  { id: "all", label: "All" },
];

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });

/** Per-exercise dashboard — open any movement for its full progress history.
 *  Mobile port of the web Exercises screen on the same pure engine. */
export default function Exercises() {
  if (useTemplate().template === "aurora") return <AuroraExercises />;
  return <ClassicExercises />;
}

function ClassicExercises() {
  const C = useTheme().palette;
  const { t } = useLang();
  const params = useLocalSearchParams<{ name?: string }>();
  const { data: sessions = [], isFetching: refreshing, refetch } = useSessionsQuery();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [period, setPeriod] = useState<ExercisePeriod>("all");

  // Preselect a lift when the Trends hub deep-links into a movement.
  useEffect(() => {
    if (params.name) setSelected(params.name);
  }, [params.name]);

  const load = () => refetch();
  useRefreshOnFocus(refetch);

  const history = useMemo(() => exerciseHistory(sessions), [sessions]);
  const active = selected || history[0]?.name || "";
  const filtered = history.filter((e) => e.name.toLowerCase().includes(query.toLowerCase()));
  const { countWarmupsInVolume: iw, units } = useLoggerPrefs();
  const stats = useMemo(() => (active ? exerciseDashboard(sessions, active, period, Date.now(), iw) : null), [sessions, active, period, iw]);

  return (
    <Screen refreshing={refreshing} onRefresh={load}>
      <Kicker>{t("nav.exercises")}</Kicker>
      <H1>Exercises</H1>

      {history.length === 0 ? (
        <Card style={{ marginTop: 14, alignItems: "center", paddingVertical: 30 }}>
          <Mono color={C.chalk} style={{ textAlign: "center", lineHeight: 19 }}>
            No exercises logged yet. Log a workout and every movement gets its own progress dashboard here.
          </Mono>
        </Card>
      ) : (
        <>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search exercises…"
            placeholderTextColor={C.ash}
            style={{ marginTop: 12, fontFamily: F.mono, fontSize: fs.bodyLg, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 }}
          />

          {/* Exercise chips */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: 10 }}>
            {filtered.slice(0, 24).map((e) => {
              const on = e.name === active;
              return (
                <Pressable
                  key={e.name}
                  onPress={() => setSelected(e.name)}
                  style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: on ? C.lime : C.line, backgroundColor: on ? `${C.lime}1a` : "transparent" }}
                >
                  <Text style={{ fontFamily: F.semi, fontSize: fs.caption, color: on ? C.lime : C.ash }}>{e.name}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Period selector */}
          <View style={{ flexDirection: "row", gap: space.xs, marginTop: 14 }}>
            {PERIODS.map((p) => {
              const on = period === p.id;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => setPeriod(p.id)}
                  style={{ flex: 1, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: on ? C.lime : C.line, backgroundColor: on ? `${C.lime}1a` : "transparent", alignItems: "center" }}
                >
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: on ? C.lime : C.ash }}>{p.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {stats && <Dashboard stats={stats} units={units} />}
        </>
      )}
    </Screen>
  );
}

function Dashboard({ stats, units }: { stats: ExerciseStats; units: WeightUnit }) {
  const C = useTheme().palette;

  if (stats.kind === "cardio") {
    if (stats.efforts === 0)
      return (
        <Card style={{ marginTop: 14 }}>
          <Mono color={C.chalk}>No runs of this movement in this period.</Mono>
        </Card>
      );
    return (
      <>
        <View style={{ flexDirection: "row", gap: space.ms, marginTop: 14 }}>
          <Metric label="RUNS" value={String(stats.efforts)} />
          <Metric label="KM" value={String(stats.distanceKm)} color={C.blue} />
          <Metric label="LONGEST" value={String(stats.longestKm)} />
          <Metric label="BEST" value={stats.bestPaceSecPerKm != null ? paceClock(stats.bestPaceSecPerKm) : "–"} color={C.blue} />
        </View>
        <Card style={{ marginTop: 14 }}>
          <Kicker color={C.blue}>Pace · lower is faster</Kicker>
          <TrendBars series={stats.pace.map((p) => p.secPerKm)} color={C.blue} lowerIsBetter unit="pace" />
        </Card>
      </>
    );
  }

  if (stats.workingSets === 0)
    return (
      <Card style={{ marginTop: 14 }}>
        <Mono color={C.chalk}>No working sets of this lift in this period.</Mono>
      </Card>
    );

  return (
    <>
      <View style={{ flexDirection: "row", gap: space.ms, marginTop: 14 }}>
        <Metric label="BEST e1RM" value={fmtWeight(stats.bestE1rm, units)} color={C.lime} />
        <Metric label="SETS" value={String(stats.workingSets)} />
        <Metric label="VOLUME" value={fmtTonnage(stats.volume, units)} />
        <Metric label="SESSIONS" value={String(stats.sessions)} />
      </View>
      <Card style={{ marginTop: 14 }}>
        <Kicker color={C.lime}>Estimated 1RM · warm-ups excluded</Kicker>
        <TrendBars series={stats.e1rm.map((p) => Math.round(kgToUnit(p.e1rm, units)))} color={C.lime} unit={units} />
      </Card>
      {stats.bestSet && (
        <Card style={{ marginTop: 14 }}>
          <Kicker color={C.lime}>Best set</Kicker>
          <Text style={{ fontFamily: F.mono, fontSize: fs.note, color: C.chalk, marginTop: 8 }}>
            {fmtWeight(stats.bestSet.load, units)} × {stats.bestSet.reps}
            <Text style={{ color: C.ash }}> · e1RM {fmtWeight(stats.bestSet.e1rm, units)} · {fmtDate(stats.bestSet.when)}</Text>
          </Text>
          <Mono style={{ fontSize: fs.micro, marginTop: 8 }}>
            {stats.totalReps} reps · heaviest {fmtWeight(stats.heaviestLoad, units)} · all-time best {fmtWeight(stats.bestE1rmAllTime, units)}
          </Mono>
        </Card>
      )}
      {stats.velocity && (
        <Card style={{ marginTop: 14 }}>
          <Kicker color={C.blue}>Velocity profile</Kicker>
          <Text style={{ fontFamily: F.black, fontSize: 22, color: txt(C, C.blue), marginTop: 6 }}>{fmtWeight(stats.velocity.e1rm, units)}</Text>
          <Mono style={{ fontSize: fs.micro, marginTop: 4 }}>
            velocity-estimated 1RM · fit r² {stats.velocity.r2} · {stats.velocity.n} loads
          </Mono>
        </Card>
      )}
    </>
  );
}

// Dependency-free trend bars. For kg, taller = bigger; for pace, lower = taller.
function TrendBars({ series, color, lowerIsBetter = false, unit }: { series: number[]; color: string; lowerIsBetter?: boolean; unit: WeightUnit | "pace" }) {
  const C = useTheme().palette;
  if (series.length < 2) return <Mono style={{ marginTop: 12 }}>Log this a few times to see a trend.</Mono>;
  const max = Math.max(...series);
  const min = Math.min(...series);
  const range = max - min || 1;
  const latest = series[series.length - 1]!;
  const delta = latest - series[0]!;
  const fmt = (v: number) => (unit === "pace" ? `${paceClock(v)} /km` : `${v} ${unit}`);
  const good = lowerIsBetter ? delta <= 0 : delta >= 0;
  return (
    <View style={{ marginTop: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
        <Mono color={C.chalk}>{fmt(latest)}</Mono>
        <Mono color={good ? C.lime : C.amber}>
          {`${delta >= 0 ? "+" : "−"}${unit === "pace" ? paceClock(Math.abs(delta)) : Math.abs(delta)} · ${series.length}×`}
        </Mono>
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: 44, gap: 3 }}>
        {series.map((v, i) => {
          const h = 8 + ((lowerIsBetter ? max - v : v - min) / range) * 34;
          return <View key={i} style={{ flex: 1, height: h, borderRadius: 2, backgroundColor: i === series.length - 1 ? color : `${color}55` }} />;
        })}
      </View>
    </View>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  const C = useTheme().palette;
  return (
    <View style={{ flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingVertical: 12, alignItems: "center" }}>
      <Text style={{ fontFamily: F.black, fontSize: fs.title, color: color ?? C.chalk }}>{value}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: 8, color: C.ash, letterSpacing: 0.8, marginTop: 2 }}>{label}</Text>
    </View>
  );
}
