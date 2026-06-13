import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import {
  runTotals,
  runStats,
  weeklyMileage,
  paceEffortSplit,
  pacedRunMoves,
  paceSeries,
  paceClock,
  type LoggedSession,
} from "@hybrid/core";
import { fetchSessions } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { Screen, Card, Kicker, Mono, C, F } from "../../lib/ui";
import { useTheme } from "../../lib/theme";

const fmtWeek = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export default function Running() {
  const C = useTheme().palette;
  const { t } = useLang();
  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [move, setMove] = useState("");

  const load = () => {
    setRefreshing(true);
    fetchSessions().then(setSessions).finally(() => setRefreshing(false));
  };
  useEffect(load, []);

  const totals = useMemo(() => runTotals(sessions), [sessions]);
  const stats = useMemo(() => runStats(sessions), [sessions]);
  const mileage = useMemo(() => weeklyMileage(sessions, 8), [sessions]);
  const split = useMemo(() => paceEffortSplit(sessions), [sessions]);
  const paceMoves = useMemo(() => pacedRunMoves(sessions), [sessions]);
  const active = paceMoves.includes(move) ? move : (paceMoves[0] ?? "");
  const pace = useMemo(() => (active ? paceSeries(sessions, active).map((p) => p.secPerKm) : []), [sessions, active]);

  if (totals.efforts === 0)
    return (
      <Screen refreshing={refreshing} onRefresh={load}>
        <Kicker>{t("nav.running")}</Kicker>
        <Card style={{ marginTop: 8, alignItems: "center", paddingVertical: 32 }}>
          <Text style={{ fontFamily: F.bold, fontSize: 18, color: C.chalk }}>{t("running.emptyTitle")}</Text>
          <Mono style={{ marginTop: 8, textAlign: "center", lineHeight: 19 }}>{t("running.emptyBody")}</Mono>
        </Card>
      </Screen>
    );

  const splitTotal = split.easy + split.moderate + split.hard;
  const hasEffort = splitTotal > 0;
  const easyPct = hasEffort ? Math.round((split.easy / splitTotal) * 100) : null;
  const maxKm = Math.max(...mileage.map((w) => w.km), 1);

  return (
    <Screen refreshing={refreshing} onRefresh={load}>
      <Kicker>{t("nav.running")}</Kicker>

      {/* Totals */}
      <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
        <Metric label={t("running.runs")} value={String(totals.efforts)} />
        <Metric label="KM" value={`${totals.distanceKm}`} color={C.blue} />
        <Metric label="H" value={`${Math.round(totals.minutes / 6) / 10}`} />
        {easyPct != null && <Metric label={t("running.easyPct")} value={`${easyPct}%`} color={C.lime} />}
      </View>

      {/* Weekly mileage bars */}
      <Card>
        <Kicker color={C.blue}>{t("running.weeklyMileage")}</Kicker>
        <View style={{ flexDirection: "row", alignItems: "flex-end", height: 90, gap: 5, marginTop: 12 }}>
          {mileage.map((w, i) => (
            <View key={i} style={{ flex: 1, alignItems: "center" }}>
              <View style={{ width: "100%", height: 6 + (w.km / maxKm) * 70, borderRadius: 3, backgroundColor: i === mileage.length - 1 ? C.blue : `${C.blue}66` }} />
            </View>
          ))}
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
          <Mono style={{ fontSize: 9 }}>{fmtWeek(mileage[0]!.weekStart)}</Mono>
          <Mono style={{ fontSize: 9 }}>{`${mileage[mileage.length - 1]!.km} km`}</Mono>
        </View>
      </Card>

      {/* Effort split (easy/moderate/hard) — only when intensity was logged */}
      {hasEffort && (
        <Card>
          <Kicker color={C.lime}>{t("running.effortSplit")}</Kicker>
          <View style={{ flexDirection: "row", height: 14, borderRadius: 7, overflow: "hidden", marginTop: 12, backgroundColor: C.ink2 }}>
            {([["easy", split.easy, C.lime], ["moderate", split.moderate, C.amber], ["hard", split.hard, C.red]] as const).map(
              ([k, v, c]) => v > 0 && <View key={k} style={{ width: `${(v / splitTotal) * 100}%`, backgroundColor: c }} />,
            )}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 10 }}>
            <Legend c={C.lime} label={`${t("running.easy")} ${split.easy}m`} />
            <Legend c={C.amber} label={`${t("running.moderate")} ${split.moderate}m`} />
            <Legend c={C.red} label={`${t("running.hard")} ${split.hard}m`} />
          </View>
          <Mono style={{ fontSize: 11, lineHeight: 16, marginTop: 10 }}>{t("running.paceNote")}</Mono>
        </Card>
      )}

      {/* Pace trend per move */}
      {paceMoves.length > 0 && (
        <Card>
          <Kicker color={C.blue}>{t("session.paceTrend")} · {active}</Kicker>
          {paceMoves.length > 1 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {paceMoves.map((m) => (
                <Pressable key={m} onPress={() => setMove(m)} style={pill(active === m, C.blue)}>
                  <Text style={{ fontFamily: F.semi, fontSize: 12, color: active === m ? C.blue : C.ash }}>{m}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <PaceBars series={pace} />
        </Card>
      )}

      {/* By movement */}
      <Card>
        <Kicker color={C.blue}>{t("running.byMove")}</Kicker>
        <View style={{ flexDirection: "row", marginTop: 10, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.line }}>
          <ColHead flex={2}>{t("running.move")}</ColHead>
          <ColHead>KM</ColHead>
          <ColHead>{t("running.longest")}</ColHead>
          <ColHead>{t("running.best")}</ColHead>
        </View>
        {stats.map((r) => (
          <View key={r.move} style={{ flexDirection: "row", paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line }}>
            <Mono color={C.chalk} style={{ flex: 2 }}>{r.move}</Mono>
            <Mono style={{ flex: 1, textAlign: "center" }}>{r.distanceKm}</Mono>
            <Mono style={{ flex: 1, textAlign: "center" }}>{r.longestKm || "–"}</Mono>
            <Mono color={r.bestPaceSecPerKm != null ? C.blue : C.ash} style={{ flex: 1, textAlign: "center" }}>
              {r.bestPaceSecPerKm != null ? paceClock(r.bestPaceSecPerKm) : "–"}
            </Mono>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

// Dependency-free pace bars: lower (faster) is taller; latest highlighted.
function PaceBars({ series }: { series: number[] }) {
  const C = useTheme().palette;
  if (series.length < 2)
    return <Mono style={{ marginTop: 12 }}>Log this run a few times to see a pace trend.</Mono>;
  const max = Math.max(...series);
  const min = Math.min(...series);
  const range = max - min || 1;
  const delta = series[series.length - 1]! - series[0]!;
  return (
    <View style={{ marginTop: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
        <Mono>{`${paceClock(series[series.length - 1]!)} /km`}</Mono>
        <Mono color={delta <= 0 ? C.lime : C.amber}>{`${delta <= 0 ? "−" : "+"}${paceClock(Math.abs(delta))} · ${series.length}×`}</Mono>
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: 40, gap: 3 }}>
        {series.map((v, i) => (
          <View key={i} style={{ flex: 1, height: 8 + ((max - v) / range) * 30, borderRadius: 2, backgroundColor: i === series.length - 1 ? C.blue : `${C.blue}55` }} />
        ))}
      </View>
    </View>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  const C = useTheme().palette;
  const fg = color ?? C.chalk;
  return (
    <View style={{ flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingVertical: 14, alignItems: "center" }}>
      <Text style={{ fontFamily: F.black, fontSize: 22, color: fg }}>{value}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 1, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function Legend({ c, label }: { c: string; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: c }} />
      <Mono style={{ fontSize: 12 }}>{label}</Mono>
    </View>
  );
}

function ColHead({ children, flex = 1 }: { children: React.ReactNode; flex?: number }) {
  const C = useTheme().palette;
  return <Text style={{ flex, textAlign: flex > 1 ? "left" : "center", fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 1 }}>{children}</Text>;
}

const pill = (active: boolean, c: string) => ({
  paddingHorizontal: 12,
  paddingVertical: 6,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: active ? c : C.line,
  backgroundColor: active ? `${c}1a` : "transparent",
});
