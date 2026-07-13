import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  exerciseHistory, exerciseDashboard, paceClock, fmtWeight, fmtTonnage, kgToUnit,
  type LoggedSession, type ExercisePeriod, type ExerciseStats, type WeightUnit,
} from "@hybrid/core";
import { useSessionsQuery } from "../../lib/queries";
import { useBodyweightLookup } from "../../lib/use-bodyweight";
import { useRefreshOnFocus } from "../../lib/query";
import { useLang } from "../../lib/i18n";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useTheme, txt } from "../../lib/theme";
import { fs, space, F } from "../../lib/ui";
import { ABack, AuroraScreen, ACard, AHeading, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";

const PERIODS: { id: ExercisePeriod; key: string }[] = [
  { id: "8w", key: "w.analyze.ex.period8w" }, { id: "6m", key: "w.analyze.ex.period6m" }, { id: "1y", key: "w.analyze.ex.period1y" }, { id: "all", key: "w.analyze.ex.periodAll" },
];
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });

/** AURORA Exercises — per-movement progress dashboard reusing the exact engine
 *  (exerciseHistory / exerciseDashboard). */
export default function AuroraExercises() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const params = useLocalSearchParams<{ name?: string }>();
  const { data: sessions = [], isFetching: refreshing, refetch } = useSessionsQuery();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [period, setPeriod] = useState<ExercisePeriod>("all");

  useEffect(() => { if (params.name) setSelected(params.name); }, [params.name]);
  const load = () => refetch();
  useRefreshOnFocus(refetch);

  const history = useMemo(() => exerciseHistory(sessions), [sessions]);
  const active = selected || history[0]?.name || "";
  const filtered = history.filter((e) => e.name.toLowerCase().includes(query.toLowerCase()));
  const { countWarmupsInVolume: iw, units } = useLoggerPrefs();
  const bw = useBodyweightLookup();
  const stats = useMemo(() => (active ? exerciseDashboard(sessions, active, period, Date.now(), iw, bw) : null), [sessions, active, period, iw, bw]);

  return (
    <AuroraScreen refreshing={refreshing} onRefresh={load}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
        <ABack />
        <AHeading style={{ fontSize: fs.display }}>{t("w.analyze.ex.title")}</AHeading>
      </View>

      {history.length === 0 ? (
        <ACard style={{ marginTop: 16, alignItems: "center", paddingVertical: 30 }}>
          <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, textAlign: "center", lineHeight: 19 }}>{t("w.analyze.ex.empty")}</Text>
        </ACard>
      ) : (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms, marginTop: 14, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 16 }}>
            <AuroraIcon name="search" size={20} color={C.ash} />
            <TextInput value={query} onChangeText={setQuery} placeholder={t("w.analyze.ex.search")} placeholderTextColor={C.ash} style={{ flex: 1, fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, paddingVertical: 14 }} />
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 12 }}>
            {filtered.slice(0, 24).map((e) => {
              const on = e.name === active;
              return (
                <Pressable key={e.name} onPress={() => setSelected(e.name)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: on ? C.lime : C.line, backgroundColor: on ? C.lime : "transparent" }}>
                  <Text style={{ fontFamily: F.semi, fontSize: fs.caption, color: on ? C.onAccent : C.ash }}>{e.name}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={{ flexDirection: "row", backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, padding: 4, gap: space.xxs, marginTop: 14 }}>
            {PERIODS.map((p) => {
              const on = period === p.id;
              return (
                <Pressable key={p.id} onPress={() => setPeriod(p.id)} style={{ flex: 1, paddingVertical: 9, borderRadius: RADIUS.pill, backgroundColor: on ? C.lime : "transparent", alignItems: "center" }}>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: on ? C.onAccent : C.ash }}>{t(p.key)}</Text>
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
  const { t } = useLang();
  if (stats.kind === "cardio") {
    if (stats.efforts === 0) return <ACard style={{ marginTop: 14 }}><Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk }}>{t("w.analyze.ex.noRuns")}</Text></ACard>;
    return (
      <>
        <View style={{ flexDirection: "row", gap: space.ms, marginTop: 14 }}>
          <Metric label={t("w.analyze.ex.runs")} value={String(stats.efforts)} />
          <Metric label={t("w.analyze.ex.km")} value={String(stats.distanceKm)} color={txt(C, C.lime)} />
          <Metric label={t("w.analyze.ex.longest")} value={String(stats.longestKm)} />
          <Metric label={t("w.analyze.ex.bestPace")} value={stats.bestPaceSecPerKm != null ? paceClock(stats.bestPaceSecPerKm) : "–"} color={txt(C, C.lime)} />
        </View>
        <ACard style={{ marginTop: 14 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{t("w.analyze.ex.paceTitle")}</Text>
          <TrendBars series={stats.pace.map((p) => p.secPerKm)} color={C.blue} lowerIsBetter unit="pace" />
        </ACard>
      </>
    );
  }
  if (stats.workingSets === 0) return <ACard style={{ marginTop: 14 }}><Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk }}>{t("w.analyze.ex.noWorkingSets")}</Text></ACard>;
  return (
    <>
      <View style={{ flexDirection: "row", gap: space.ms, marginTop: 14 }}>
        <Metric label={t("w.analyze.ex.bestE1rm")} value={fmtWeight(stats.bestE1rm, units)} color={C.lime} />
        <Metric label={t("w.analyze.ex.workingSets")} value={String(stats.workingSets)} />
        <Metric label={t("w.analyze.ex.volume")} value={fmtTonnage(stats.volume, units)} />
        <Metric label={t("w.analyze.ex.sessions")} value={String(stats.sessions)} />
      </View>
      <ACard style={{ marginTop: 14 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>{t("w.analyze.ex.e1rmTitle")}</Text>
        <TrendBars series={stats.e1rm.map((p) => Math.round(kgToUnit(p.e1rm, units)))} color={C.lime} unit={units} />
      </ACard>
      {stats.bestSet && (
        <ACard style={{ marginTop: 14 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>{t("w.analyze.ex.bestSet")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.note, color: C.chalk, marginTop: 8 }}>{fmtWeight(stats.bestSet.load, units)} × {stats.bestSet.reps}<Text style={{ color: C.ash }}> – {t("w.analyze.ex.e1rmLabel")} {fmtWeight(stats.bestSet.e1rm, units)} – {fmtDate(stats.bestSet.when)}</Text></Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 8 }}>{stats.totalReps} {t("w.analyze.ex.repsTail")} {fmtWeight(stats.heaviestLoad, units)} {t("w.analyze.ex.allTimeBest")} {fmtWeight(stats.bestE1rmAllTime, units)}</Text>
        </ACard>
      )}
      {stats.velocity && (
        <ACard style={{ marginTop: 14 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{t("w.analyze.ex.velocityProfile")}</Text>
          <Text style={{ fontFamily: F.black, fontSize: 22, color: txt(C, C.lime), marginTop: 6 }}>{fmtWeight(stats.velocity.e1rm, units)}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 4 }}>{t("w.analyze.ex.velEstPre")} {stats.velocity.r2} – {stats.velocity.n} {t("w.analyze.ex.velEstTail")}</Text>
        </ACard>
      )}
    </>
  );
}

function TrendBars({ series, color, lowerIsBetter = false, unit }: { series: number[]; color: string; lowerIsBetter?: boolean; unit: WeightUnit | "pace" }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  if (series.length < 2) return <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash, marginTop: 12 }}>{t("w.analyze.ex.trendHint")}</Text>;
  const max = Math.max(...series), min = Math.min(...series), range = max - min || 1;
  const latest = series[series.length - 1]!, delta = latest - series[0]!;
  const fmt = (v: number) => (unit === "pace" ? `${paceClock(v)} /km` : `${v} ${unit}`);
  const good = lowerIsBetter ? delta <= 0 : delta >= 0;
  return (
    <View style={{ marginTop: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk }}>{fmt(latest)}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: txt(C, good ? C.lime : C.amber) }}>{`${delta >= 0 ? "+" : "−"}${unit === "pace" ? paceClock(Math.abs(delta)) : Math.abs(delta)} – ${series.length}×`}</Text>
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
      <Text style={{ fontFamily: F.black, fontSize: fs.title, color: color ? txt(C, color) : C.chalk }}>{value}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: 8, color: C.ash, letterSpacing: 0.8, marginTop: 2 }}>{label}</Text>
    </View>
  );
}
