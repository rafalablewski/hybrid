import { useMemo, useState } from "react";
import { View, Text } from "react-native";
import {
  activeDisciplines, disciplineSessions, DISCIPLINE_META, formatDisciplinePace, disciplinePaceUnit,
  runStats, weeklyMileage, paceEffortSplit, pacedRunMoves, paceSeries,
  type CardioDiscipline,
} from "@hybrid/core";
import { useSessionsQuery } from "../../lib/queries";
import { useRefreshOnFocus } from "../../lib/query";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { leading, fs, space, F, PressScale as Pressable } from "../../lib/ui";
import { AuroraScreen, ACard, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";

const fmtWeek = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** AURORA Endurance hub — per-discipline analytics (run / swim / bike / row / …),
 *  reusing the running engine but labelled in each discipline's own unit. */
export default function AuroraEndurance() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const { data: sessions = [], isFetching: refreshing, refetch } = useSessionsQuery();
  const [pick, setPick] = useState<CardioDiscipline | "">("");
  const [move, setMove] = useState("");

  const load = () => refetch();
  useRefreshOnFocus(refetch);

  const active = useMemo(() => activeDisciplines(sessions), [sessions]);
  const discipline: CardioDiscipline | "" = active.some((d) => d.discipline === pick) ? pick : (active[0]?.discipline ?? "");
  const dSessions = useMemo(() => (discipline ? disciplineSessions(sessions, discipline) : []), [sessions, discipline]);

  const totals = active.find((d) => d.discipline === discipline);
  const stats = useMemo(() => runStats(dSessions), [dSessions]);
  const mileage = useMemo(() => weeklyMileage(dSessions, 8), [dSessions]);
  const split = useMemo(() => paceEffortSplit(dSessions), [dSessions]);
  const paceMoves = useMemo(() => pacedRunMoves(dSessions), [dSessions]);
  const activeMove = paceMoves.includes(move) ? move : (paceMoves[0] ?? "");
  const pace = useMemo(() => (activeMove ? paceSeries(dSessions, activeMove).map((p) => p.secPerKm) : []), [dSessions, activeMove]);

  if (!discipline || !totals)
    return (
      <AuroraScreen hero={{ rank: "title", title: t("endurance.title") }} refreshing={refreshing} onRefresh={load}>
        <ACard style={{ marginTop: 16, alignItems: "center", paddingVertical: 32 }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.title, color: C.chalk }}>{t("endurance.emptyTitle")}</Text>
          <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash, marginTop: 8, textAlign: "center", lineHeight: leading(fs.bodyLg, "snug") }}>{t("endurance.emptyBody")}</Text>
        </ACard>
      </AuroraScreen>
    );

  const meta = DISCIPLINE_META[discipline];
  const splitTotal = split.easy + split.moderate + split.hard;
  const hasEffort = splitTotal > 0;
  const easyPct = hasEffort ? Math.round((split.easy / splitTotal) * 100) : null;
  const maxKm = Math.max(...mileage.map((w) => w.km), 1);
  const dName = (d: CardioDiscipline) => t(DISCIPLINE_META[d].labelKey);

  return (
    <AuroraScreen hero={{ rank: "title", title: t("endurance.title") }} refreshing={refreshing} onRefresh={load}>

      {/* Discipline picker — one chip per logged endurance discipline */}
      {active.length > 1 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: 16 }}>
          {active.map((d) => { const on = d.discipline === discipline; return (
            <Pressable key={d.discipline} onPress={() => { setPick(d.discipline); setMove(""); }} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: on ? C.blue : C.line, backgroundColor: on ? `${C.blue}1a` : "transparent" }}>
              <Text style={{ fontSize: fs.body }}>{DISCIPLINE_META[d.discipline].emoji}</Text>
              <Text style={{ fontFamily: F.semi, fontSize: fs.caption, color: on ? txt(C, C.blue) : C.ash }}>{dName(d.discipline)}</Text>
            </Pressable>
          ); })}
        </View>
      )}

      <View style={{ flexDirection: "row", gap: space.ms, marginTop: 16 }}>
        <Metric label={t("endurance.efforts")} value={String(totals.efforts)} />
        <Metric label="KM" value={`${totals.distanceKm}`} color={C.blue} />
        <Metric label="H" value={`${Math.round(totals.minutes / 6) / 10}`} />
        {easyPct != null && <Metric label={t("running.easyPct")} value={`${easyPct}%`} color={C.lime} />}
      </View>

      <ACard style={{ marginTop: 16 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.blue) }}>{t("endurance.weeklyVolume")}</Text>
        <View style={{ flexDirection: "row", alignItems: "flex-end", height: 90, gap: 5, marginTop: 12 }}>
          {mileage.map((w, i) => <View key={i} style={{ flex: 1, alignItems: "center" }}><View style={{ width: "100%", height: 6 + (w.km / maxKm) * 70, borderRadius: 3, backgroundColor: i === mileage.length - 1 ? C.blue : `${C.blue}66` }} /></View>)}
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{fmtWeek(mileage[0]!.weekStart)}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{`${mileage[mileage.length - 1]!.km} km`}</Text>
        </View>
      </ACard>

      {hasEffort && (
        <ACard style={{ marginTop: 16 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>{t("running.effortSplit")}</Text>
          <View style={{ flexDirection: "row", height: 14, borderRadius: 7, overflow: "hidden", marginTop: 12, backgroundColor: C.ink }}>
            {([["easy", split.easy, C.lime], ["moderate", split.moderate, C.amber], ["hard", split.hard, C.red]] as const).map(([k, v, c]) => v > 0 && <View key={k} style={{ width: `${(v / splitTotal) * 100}%`, backgroundColor: c }} />)}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 10 }}>
            <Legend c={C.lime} label={`${t("running.easy")} ${split.easy}m`} />
            <Legend c={C.amber} label={`${t("running.moderate")} ${split.moderate}m`} />
            <Legend c={C.red} label={`${t("running.hard")} ${split.hard}m`} />
          </View>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 10, lineHeight: leading(fs.nano) }}>{t("running.paceNote")}</Text>
        </ACard>
      )}

      {paceMoves.length > 0 && (
        <ACard style={{ marginTop: 16 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.blue) }}>{t("session.paceTrend")} – {activeMove}</Text>
          {paceMoves.length > 1 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: 10 }}>
              {paceMoves.map((m) => { const on = activeMove === m; return (
                <Pressable key={m} onPress={() => setMove(m)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: on ? C.blue : C.line, backgroundColor: on ? `${C.blue}1a` : "transparent" }}>
                  <Text style={{ fontFamily: F.semi, fontSize: fs.caption, color: on ? txt(C, C.blue) : C.ash }}>{m}</Text>
                </Pressable>
              ); })}
            </View>
          )}
          <PaceBars series={pace} discipline={discipline} />
        </ACard>
      )}

      <ACard style={{ marginTop: 16 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.blue) }}>{t("running.byMove")}</Text>
        <View style={{ flexDirection: "row", marginTop: 10, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.line }}>
          <ColHead flex={2}>{t("running.move")}</ColHead><ColHead>KM</ColHead><ColHead>{t("running.longest")}</ColHead><ColHead>{disciplinePaceUnit(discipline).replace("/", "")}</ColHead>
        </View>
        {stats.map((r) => (
          <View key={r.move} style={{ flexDirection: "row", paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line }}>
            <Text style={{ flex: 2, fontFamily: F.mono, fontSize: fs.body, color: C.chalk }}>{r.move}</Text>
            <Text style={{ flex: 1, textAlign: "center", fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{r.distanceKm}</Text>
            <Text style={{ flex: 1, textAlign: "center", fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{r.longestKm || "–"}</Text>
            <Text style={{ flex: 1, textAlign: "center", fontFamily: F.mono, fontSize: fs.body, color: txt(C, r.bestPaceSecPerKm != null ? C.blue : C.ash) }}>{r.bestPaceSecPerKm != null ? formatDisciplinePace(r.bestPaceSecPerKm, discipline) : "–"}</Text>
          </View>
        ))}
      </ACard>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 10, textAlign: "center" }}>{meta.emoji} {dName(discipline)}</Text>
    </AuroraScreen>
  );
}

function PaceBars({ series, discipline }: { series: number[]; discipline: CardioDiscipline }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  if (series.length < 2) return <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash, marginTop: 12 }}>{t("running.paceTrendHint")}</Text>;
  const max = Math.max(...series), min = Math.min(...series), range = max - min || 1;
  // Lower sec/km is faster for pace AND higher km/h for speed, so a fall over the
  // series is an improvement either way — colour it lime, a rise amber.
  const improved = series[series.length - 1]! <= series[0]!;
  return (
    <View style={{ marginTop: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{formatDisciplinePace(series[series.length - 1]!, discipline)}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: txt(C, improved ? C.lime : C.amber) }}>{`${improved ? "↓" : "↑"} ${series.length}×`}</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: 40, gap: 3 }}>
        {series.map((v, i) => <View key={i} style={{ flex: 1, height: 8 + ((max - v) / range) * 30, borderRadius: 3, backgroundColor: i === series.length - 1 ? C.blue : `${C.blue}55` }} />)}
      </View>
    </View>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  const { palette: C } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card, paddingVertical: 16, alignItems: "center" }}>
      <Text style={{ fontFamily: F.black, fontSize: 22, color: color ? txt(C, color) : C.chalk }}>{value}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, letterSpacing: 0.9, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function Legend({ c, label }: { c: string; label: string }) {
  const { palette: C } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: c }} />
      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{label}</Text>
    </View>
  );
}

function ColHead({ children, flex = 1 }: { children: React.ReactNode; flex?: number }) {
  const { palette: C } = useTheme();
  return <Text style={{ flex, textAlign: flex > 1 ? "left" : "center", fontFamily: F.mono, fontSize: fs.nano, color: C.ash, letterSpacing: 0.9 }}>{children}</Text>;
}
