import { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { fetchTeamCompare, type TeamCompareResponse, type TeamCompareAthlete } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { leading, fs, space, F, PressScale as Pressable, FIXED_FONT_SCALE, Loading } from "../../lib/ui";
import { AuroraScreen, ACard, AHeading, RADIUS, AChip } from "./kit";

/** The five comparable metrics — the SAME set and order the web screen offers
 *  (apps/web/components/aurora/team-compare.tsx), so a coach reads the same
 *  columns on either client. */
const METRICS = [
  { key: "e1rm", label: "w.teams.compare.metricE1rm", unit: "kg", color: "lime" },
  { key: "estVel1rm", label: "w.teams.compare.metricVel1rm", unit: "kg", color: "violet" },
  { key: "bestVel", label: "w.teams.compare.metricBarSpeed", unit: "m/s", color: "blue" },
  { key: "volume", label: "w.teams.compare.metricVolume", unit: "kg", color: "amber" },
  { key: "reps", label: "w.teams.compare.metricReps", unit: "", color: "ash" },
] as const;

type MetricKey = (typeof METRICS)[number]["key"];

/** AURORA Team Compare (mobile) — the twin of the web screen, on the same
 *  /api/coach/compare payload: lines a coach's athletes up on any lift across
 *  e1RM / velocity-1RM / bar speed / volume / reps.
 *
 *  The web version draws a horizontal recharts bar chart plus a 7-column table;
 *  neither survives a phone's width, so mobile renders the ranked comparison as
 *  measured bars and the per-athlete detail as stacked rows. Same data, same
 *  ordering, drawn the way the rest of the app draws it. Part of closing the
 *  mobile-team-surfaces gap. */
export default function AuroraTeamCompare() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const [data, setData] = useState<TeamCompareResponse | null>(null);
  const [lift, setLift] = useState<string>("");
  const [metric, setMetric] = useState<MetricKey>("e1rm");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchTeamCompare(lift)
      .then((d) => {
        if (!alive) return;
        setData(d);
        if (!lift && d.lift) setLift(d.lift);
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [lift]);

  const meta = METRICS.find((m) => m.key === metric)!;
  const athletes = data?.athletes ?? [];
  const lifts = data?.lifts ?? [];
  const accent = txt(C, (C[meta.color as keyof Palette] as string) ?? C.chalk);

  const ranked = useMemo(
    () => [...athletes].sort((a, b) => (b[metric] as number) - (a[metric] as number)),
    [athletes, metric],
  );
  const max = Math.max(...ranked.map((a) => a[metric] as number), 1);

  const body = () => {
    if (loading) {
      return (
        <Loading />
      );
    }
    if (athletes.length === 0) {
      return (
        <ACard style={{ marginTop: space.md }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{t("w.teams.compare.emptyTitle")}</Text>
          <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.ash, marginTop: 8, lineHeight: leading(fs.body) }}>{t("w.teams.compare.emptyBody")}</Text>
        </ACard>
      );
    }
    return (
      <>
        {/* lift selector — a rail, so a long lift list never wraps into a wall */}
        <Text style={kicker(C)}>{t("w.teams.compare.exercise")}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }} contentContainerStyle={{ gap: space.xs, paddingRight: space.md }}>
          {lifts.map((l) => (
            <AChip key={l} label={l} selected={lift === l} accent={txt(C, C.lime)} onPress={() => setLift(l)} />
          ))}
        </ScrollView>

        <Text style={[kicker(C), { marginTop: space.md }]}>{t("w.teams.compare.metric")}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }} contentContainerStyle={{ gap: space.xs, paddingRight: space.md }}>
          {METRICS.map((m) => (
            <AChip
              key={m.key}
              label={t(m.label)}
              selected={metric === m.key}
              accent={txt(C, (C[m.color as keyof Palette] as string) ?? C.chalk)}
              onPress={() => setMetric(m.key)}
            />
          ))}
        </ScrollView>

        {/* ranked comparison on the chosen metric */}
        <ACard style={{ marginTop: space.md }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: accent }}>{t("w.teams.compare.teamComparison")}</Text>
          <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk, marginTop: 2 }}>{data?.lift ?? lift}</Text>
          {ranked.map((a) => {
            const v = a[metric] as number;
            return (
              <View key={a.linkId} style={{ marginTop: 12 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.ms }}>
                  <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{a.name}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{v || "—"}{v && meta.unit ? ` ${meta.unit}` : ""}</Text>
                </View>
                <View style={{ height: 8, borderRadius: 4, backgroundColor: C.ink, overflow: "hidden", marginTop: 6 }}>
                  <View style={{ width: `${Math.max(2, Math.round((v / max) * 100))}%`, height: "100%", backgroundColor: accent }} />
                </View>
              </View>
            );
          })}
        </ACard>

        {/* per-athlete detail — the web table's columns, stacked to fit a phone */}
        <ACard style={{ marginTop: space.md }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{t("w.teams.compare.thAthlete")}</Text>
          {ranked.map((a, i) => (
            <View key={a.linkId} style={{ paddingTop: 12, marginTop: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{a.name}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8 }}>
                <Cell C={C} label="e1RM" value={a.e1rm ? `${a.e1rm} kg` : "—"} />
                <Cell C={C} label={t("w.teams.compare.thVel1rm")} value={a.estVel1rm ? `${a.estVel1rm} kg` : "—"} />
                <Cell C={C} label={t("w.teams.compare.thBarSpeed")} value={a.bestVel ? `${a.bestVel} m/s` : "—"} />
                <Cell C={C} label={t("w.teams.compare.thVolume")} value={`${a.volume.toLocaleString()} kg`} />
                <Cell C={C} label={t("w.teams.compare.thReps")} value={String(a.reps)} />
                <Cell C={C} label={t("w.teams.compare.thSessions")} value={String(a.sessions)} />
              </View>
            </View>
          ))}
        </ACard>
      </>
    );
  };

  return (
    <AuroraScreen hero={{ rank: "title", title: t("nav.teamcompare") }}>
      {body()}
      <View style={{ height: RADIUS.card }} />
    </AuroraScreen>
  );
}

const kicker = (C: Palette) => ({ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase" as const, letterSpacing: 1.2, color: C.ash, marginTop: space.md });

function Cell({ C, label, value }: { C: Palette; label: string; value: string }) {
  return (
    <View style={{ width: "33.33%", paddingVertical: 5 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.9, color: C.ash }}>{label}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk, marginTop: 2 }}>{value}</Text>
    </View>
  );
}
