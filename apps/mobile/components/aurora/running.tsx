import { useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import {
  runTotals, runStats, weeklyMileage, paceEffortSplit, pacedRunMoves, paceSeries, paceClock,
  type LoggedSession,
} from "@hybrid/core";
import { useSessionsQuery } from "../../lib/queries";
import { useRefreshOnFocus } from "../../lib/query";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, space, F } from "../../lib/ui";
import { ABack, AuroraScreen, ACard, AHeading, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";

const fmtWeek = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** AURORA Running — totals, weekly mileage, effort split, pace trend + by-move
 *  table, reusing the exact running engine. */
export default function AuroraRunning() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const { data: sessions = [], isFetching: refreshing, refetch } = useSessionsQuery();
  const [move, setMove] = useState("");

  const load = () => refetch();
  useRefreshOnFocus(refetch);

  const totals = useMemo(() => runTotals(sessions), [sessions]);
  const stats = useMemo(() => runStats(sessions), [sessions]);
  const mileage = useMemo(() => weeklyMileage(sessions, 8), [sessions]);
  const split = useMemo(() => paceEffortSplit(sessions), [sessions]);
  const paceMoves = useMemo(() => pacedRunMoves(sessions), [sessions]);
  const active = paceMoves.includes(move) ? move : (paceMoves[0] ?? "");
  const pace = useMemo(() => (active ? paceSeries(sessions, active).map((p) => p.secPerKm) : []), [sessions, active]);

  const header = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
      <ABack />
      <AHeading style={{ fontSize: fs.display }}>{t("nav.running")}</AHeading>
      <View style={{ marginLeft: "auto" }}><AuroraIcon name="navigation" size={24} color={txt(C, C.blue)} /></View>
    </View>
  );

  if (totals.efforts === 0)
    return (
      <AuroraScreen refreshing={refreshing} onRefresh={load}>
        {header}
        <ACard style={{ marginTop: 16, alignItems: "center", paddingVertical: 32 }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.title, color: C.chalk }}>{t("running.emptyTitle")}</Text>
          <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash, marginTop: 8, textAlign: "center", lineHeight: 19 }}>{t("running.emptyBody")}</Text>
        </ACard>
      </AuroraScreen>
    );

  const splitTotal = split.easy + split.moderate + split.hard;
  const hasEffort = splitTotal > 0;
  const easyPct = hasEffort ? Math.round((split.easy / splitTotal) * 100) : null;
  const maxKm = Math.max(...mileage.map((w) => w.km), 1);

  return (
    <AuroraScreen refreshing={refreshing} onRefresh={load}>
      {header}

      <View style={{ flexDirection: "row", gap: space.ms, marginTop: 14 }}>
        <Metric label={t("running.runs")} value={String(totals.efforts)} />
        <Metric label="KM" value={`${totals.distanceKm}`} color={C.blue} />
        <Metric label="H" value={`${Math.round(totals.minutes / 6) / 10}`} />
        {easyPct != null && <Metric label={t("running.easyPct")} value={`${easyPct}%`} color={C.lime} />}
      </View>

      <ACard style={{ marginTop: 14 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.blue) }}>{t("running.weeklyMileage")}</Text>
        <View style={{ flexDirection: "row", alignItems: "flex-end", height: 90, gap: 5, marginTop: 12 }}>
          {mileage.map((w, i) => <View key={i} style={{ flex: 1, alignItems: "center" }}><View style={{ width: "100%", height: 6 + (w.km / maxKm) * 70, borderRadius: 3, backgroundColor: i === mileage.length - 1 ? C.blue : `${C.blue}66` }} /></View>)}
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash }}>{fmtWeek(mileage[0]!.weekStart)}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash }}>{`${mileage[mileage.length - 1]!.km} km`}</Text>
        </View>
      </ACard>

      {hasEffort && (
        <ACard style={{ marginTop: 14 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>{t("running.effortSplit")}</Text>
          <View style={{ flexDirection: "row", height: 14, borderRadius: 7, overflow: "hidden", marginTop: 12, backgroundColor: C.ink }}>
            {([["easy", split.easy, C.lime], ["moderate", split.moderate, C.amber], ["hard", split.hard, C.red]] as const).map(([k, v, c]) => v > 0 && <View key={k} style={{ width: `${(v / splitTotal) * 100}%`, backgroundColor: c }} />)}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 10 }}>
            <Legend c={C.lime} label={`${t("running.easy")} ${split.easy}m`} />
            <Legend c={C.amber} label={`${t("running.moderate")} ${split.moderate}m`} />
            <Legend c={C.red} label={`${t("running.hard")} ${split.hard}m`} />
          </View>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 10, lineHeight: 15 }}>{t("running.paceNote")}</Text>
        </ACard>
      )}

      {paceMoves.length > 0 && (
        <ACard style={{ marginTop: 14 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.blue) }}>{t("session.paceTrend")} · {active}</Text>
          {paceMoves.length > 1 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: 10 }}>
              {paceMoves.map((m) => { const on = active === m; return (
                <Pressable key={m} onPress={() => setMove(m)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: on ? C.blue : C.line, backgroundColor: on ? `${C.blue}1a` : "transparent" }}>
                  <Text style={{ fontFamily: F.semi, fontSize: fs.caption, color: on ? txt(C, C.blue) : C.ash }}>{m}</Text>
                </Pressable>
              ); })}
            </View>
          )}
          <PaceBars series={pace} />
        </ACard>
      )}

      <ACard style={{ marginTop: 14 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.blue) }}>{t("running.byMove")}</Text>
        <View style={{ flexDirection: "row", marginTop: 10, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.line }}>
          <ColHead flex={2}>{t("running.move")}</ColHead><ColHead>KM</ColHead><ColHead>{t("running.longest")}</ColHead><ColHead>{t("running.best")}</ColHead>
        </View>
        {stats.map((r) => (
          <View key={r.move} style={{ flexDirection: "row", paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line }}>
            <Text style={{ flex: 2, fontFamily: F.mono, fontSize: fs.body, color: C.chalk }}>{r.move}</Text>
            <Text style={{ flex: 1, textAlign: "center", fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{r.distanceKm}</Text>
            <Text style={{ flex: 1, textAlign: "center", fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{r.longestKm || "–"}</Text>
            <Text style={{ flex: 1, textAlign: "center", fontFamily: F.mono, fontSize: fs.body, color: txt(C, r.bestPaceSecPerKm != null ? C.blue : C.ash) }}>{r.bestPaceSecPerKm != null ? paceClock(r.bestPaceSecPerKm) : "–"}</Text>
          </View>
        ))}
      </ACard>
    </AuroraScreen>
  );
}

function PaceBars({ series }: { series: number[] }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  if (series.length < 2) return <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash, marginTop: 12 }}>{t("running.paceTrendHint")}</Text>;
  const max = Math.max(...series), min = Math.min(...series), range = max - min || 1;
  const delta = series[series.length - 1]! - series[0]!;
  return (
    <View style={{ marginTop: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{`${paceClock(series[series.length - 1]!)} /km`}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: txt(C, delta <= 0 ? C.lime : C.amber) }}>{`${delta <= 0 ? "−" : "+"}${paceClock(Math.abs(delta))} · ${series.length}×`}</Text>
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
    <View style={{ flex: 1, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card, paddingVertical: 14, alignItems: "center" }}>
      <Text style={{ fontFamily: F.black, fontSize: 22, color: color ? txt(C, color) : C.chalk }}>{value}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 1, marginTop: 2 }}>{label}</Text>
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
  return <Text style={{ flex, textAlign: flex > 1 ? "left" : "center", fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 1 }}>{children}</Text>;
}
