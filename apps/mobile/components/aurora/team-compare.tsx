import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { fetchCompare, type CompareResponse } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, space, F } from "../../lib/ui";
import { AuroraScreen, ACard, AHeading } from "./kit";

/**
 * AURORA Team Compare (mobile) — parity with
 * apps/web/components/aurora/team-compare.tsx. Same /api/coach/compare flow:
 * lines athletes up side by side on any lift across e1RM / velocity-1RM / bar
 * speed / volume / reps. The web recharts bars become a dependency-free
 * View-built bar list; the full table is a stacked row list below.
 */

const METRICS = [
  { key: "e1rm", label: "w.teams.compare.metricE1rm", unit: "kg", color: "lime" },
  { key: "estVel1rm", label: "w.teams.compare.metricVel1rm", unit: "kg", color: "violet" },
  { key: "bestVel", label: "w.teams.compare.metricBarSpeed", unit: "m/s", color: "blue" },
  { key: "volume", label: "w.teams.compare.metricVolume", unit: "kg", color: "amber" },
  { key: "reps", label: "w.teams.compare.metricReps", unit: "", color: "ash" },
] as const;

type MetricKey = (typeof METRICS)[number]["key"];

export default function AuroraTeamCompare() {
  const { t } = useLang();
  const { palette: C } = useTheme();
  const [data, setData] = useState<CompareResponse | null>(null);
  const [lift, setLift] = useState<string>("");
  const [metric, setMetric] = useState<MetricKey>("e1rm");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchCompare(lift || undefined)
      .then((d) => { setData(d); if (!lift && d.lift) setLift(d.lift); })
      .finally(() => setLoading(false));
  }, [lift]);

  const colorOf = (name: string) =>
    name === "lime" ? C.lime : name === "violet" ? C.violet : name === "blue" ? C.blue : name === "amber" ? C.amber : C.ash;

  const meta = METRICS.find((m) => m.key === metric)!;
  const metaColor = colorOf(meta.color);
  const athletes = data?.athletes ?? [];
  const lifts = data?.lifts ?? [];

  const chartData = useMemo(
    () => [...athletes].sort((a, b) => (b[metric] as number) - (a[metric] as number)).map((a) => ({ name: a.name, value: a[metric] as number })),
    [athletes, metric],
  );
  const max = Math.max(...chartData.map((d) => d.value), 1);

  const Pill = ({ label, on, color, onPress }: { label: string; on: boolean; color: string; onPress: () => void }) => (
    <Pressable
      onPress={onPress}
      style={{ borderWidth: 1, borderColor: on ? color : C.line, backgroundColor: on ? `${color}29` : "transparent", borderRadius: 999, paddingVertical: 8, paddingHorizontal: 15 }}
    >
      <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: on ? txt(C, color) : C.ash }}>{label}</Text>
    </Pressable>
  );

  const Body = () => {
    if (loading) return <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{t("w.teams.compare.loadingRoster")}</Text>;
    if (athletes.length === 0)
      return (
        <ACard>
          <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk, marginBottom: 6 }}>{t("w.teams.compare.emptyTitle")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash, lineHeight: 20 }}>{t("w.teams.compare.emptyBody")}</Text>
        </ACard>
      );

    const sortedTable = [...athletes].sort((a, b) => (b[metric] as number) - (a[metric] as number));

    return (
      <View>
        {lifts.length > 0 && (
          <>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash, marginBottom: 8 }}>{t("w.teams.compare.exercise")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs, paddingRight: 8 }} style={{ marginBottom: 14 }}>
              {lifts.map((l) => <Pill key={l} label={l} on={lift === l} color={C.lime} onPress={() => setLift(l)} />)}
            </ScrollView>
          </>
        )}

        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash, marginBottom: 8 }}>{t("w.teams.compare.metric")}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs, paddingRight: 8 }} style={{ marginBottom: 16 }}>
          {METRICS.map((m) => <Pill key={m.key} label={t(m.label)} on={metric === m.key} color={colorOf(m.color)} onPress={() => setMetric(m.key)} />)}
        </ScrollView>

        <ACard>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 1.2, color: metaColor }}>{t("w.teams.compare.teamComparison")}</Text>
          <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk, marginTop: 2, marginBottom: 14 }}>{`${data?.lift ?? lift} · ${t(meta.label)}`}</Text>
          <View style={{ gap: 10 }}>
            {chartData.map((d, i) => (
              <View key={`${d.name}-${i}`}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk }} numberOfLines={1}>{d.name}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{d.value.toLocaleString()}{meta.unit ? ` ${meta.unit}` : ""}</Text>
                </View>
                <View style={{ height: 9, borderRadius: 5, backgroundColor: C.ink, overflow: "hidden" }}>
                  <View style={{ width: `${(d.value / max) * 100}%`, height: "100%", borderRadius: 5, backgroundColor: metaColor }} />
                </View>
              </View>
            ))}
          </View>
        </ACard>

        <ACard style={{ marginTop: 14 }}>
          <View style={{ gap: space.sm }}>
            {sortedTable.map((a) => (
              <View key={a.linkId} style={{ borderBottomWidth: 1, borderBottomColor: C.line, paddingBottom: 10 }}>
                <Text style={{ fontFamily: F.semi, fontSize: fs.bodyLg, color: C.chalk, marginBottom: 6 }}>{a.name}</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
                  <Cell label="e1RM" value={a.e1rm ? `${a.e1rm} kg` : "—"} />
                  <Cell label={t("w.teams.compare.thVel1rm")} value={a.estVel1rm ? `${a.estVel1rm} kg` : "—"} />
                  <Cell label={t("w.teams.compare.thBarSpeed")} value={a.bestVel ? `${a.bestVel} m/s` : "—"} />
                  <Cell label={t("w.teams.compare.thVolume")} value={`${a.volume.toLocaleString()} kg`} />
                  <Cell label={t("w.teams.compare.thReps")} value={String(a.reps)} />
                  <Cell label={t("w.teams.compare.thSessions")} value={String(a.sessions)} />
                </View>
              </View>
            ))}
          </View>
        </ACard>
      </View>
    );

    function Cell({ label, value }: { label: string; value: string }) {
      return (
        <View style={{ minWidth: 70 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.6, color: C.ash }}>{label}</Text>
          <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk, marginTop: 2 }}>{value}</Text>
        </View>
      );
    }
  };

  return (
    <AuroraScreen>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 1.4, textTransform: "uppercase", color: C.amber }}>compare</Text>
      <AHeading style={{ marginTop: 2, marginBottom: 16 }}>{t("nav.teamcompare")}</AHeading>
      <Body />
    </AuroraScreen>
  );
}
