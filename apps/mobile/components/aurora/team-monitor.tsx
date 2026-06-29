import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { athleteSegment, SEGMENT_LABELS, type AthleteSegment } from "@hybrid/core";
import { fetchSquad, type SquadRow, type SquadSummary } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, space, F } from "../../lib/ui";
import { AuroraScreen, ACard, AHeading } from "./kit";

/**
 * AURORA Team Monitor / Squad (mobile) — parity with
 * apps/web/components/aurora/team-monitor.tsx. Same /api/coach/squad flow +
 * athleteSegment engine: the morning squad screen with RAG readiness, ACWR and
 * injury-risk flags, auto-segment + tag filters and sort. The web's wide table
 * becomes a stacked card list, the natural mobile shape for a roster.
 */

type SortKey = "readiness" | "acwr" | "risk";

export default function AuroraTeamMonitor() {
  const { t } = useLang();
  const { palette: C } = useTheme();
  const [squad, setSquad] = useState<SquadRow[]>([]);
  const [summary, setSummary] = useState<SquadSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sort, setSort] = useState<SortKey>("readiness");
  const [seg, setSeg] = useState<AthleteSegment | "all">("all");
  const [tag, setTag] = useState<string>("");

  const load = (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    fetchSquad()
      .then((d) => { setSquad(d.squad); setSummary(d.summary); })
      .finally(() => { setLoading(false); setRefreshing(false); });
  };
  useEffect(() => { load(); }, []);

  const readinessColor = (r: number) => (r >= 70 ? C.lime : r >= 55 ? C.amber : C.red);
  const riskColor = (r: number) => (r < 33 ? C.lime : r < 66 ? C.amber : C.red);
  const acwrColor = (band: string) =>
    band === "sweet-spot" ? C.lime : band === "caution" ? C.amber : band === "danger" ? C.red : band === "detraining" ? C.blue : C.ash;
  const segColor = (s: AthleteSegment) =>
    s === "needs-attention" ? C.red : s === "dormant" ? C.violet : s === "new" ? C.blue : C.lime;
  const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—");

  const segOf = (a: SquadRow): AthleteSegment =>
    athleteSegment({
      readiness: a.readiness,
      acwrBand: a.acwrBand,
      flagged: !!a.flagged,
      daysSinceLast: a.lastSession ? Math.floor((Date.now() - Date.parse(a.lastSession)) / 86_400_000) : null,
      sessions: a.sessions,
    });

  const Pill = ({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) => (
    <Pressable
      onPress={onPress}
      style={{ borderWidth: 1, borderColor: on ? C.lime : C.line, backgroundColor: on ? `${C.lime}29` : "transparent", borderRadius: 999, paddingVertical: 6, paddingHorizontal: 13 }}
    >
      <Text style={{ fontFamily: F.bold, fontSize: fs.caption, textTransform: "uppercase", color: on ? txt(C, C.lime) : C.ash }}>{label}</Text>
    </Pressable>
  );

  const Body = () => {
    if (loading) return <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{t("w.teams.monitor.loadingSquad")}</Text>;
    if (squad.length === 0)
      return (
        <ACard>
          <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk, marginBottom: 6 }}>{t("w.teams.monitor.emptyTitle")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash, lineHeight: 20 }}>{t("w.teams.monitor.emptyBody")}</Text>
        </ACard>
      );

    const counts = squad.reduce((m, a) => { const s = segOf(a); m[s] = (m[s] ?? 0) + 1; return m; }, {} as Record<string, number>);
    const allTags = [...new Set(squad.flatMap((a) => a.tags ?? []))].sort();
    const filtered = squad
      .filter((a) => seg === "all" || segOf(a) === seg)
      .filter((a) => !tag || (a.tags ?? []).includes(tag));
    const sorted = [...filtered].sort((a, b) =>
      sort === "readiness" ? a.readiness - b.readiness
      : sort === "acwr" ? b.acwr - a.acwr
      : b.riskOverall - a.riskOverall,
    );
    const SEGS: (AthleteSegment | "all")[] = ["all", "needs-attention", "dormant", "new", "on-track"];

    return (
      <View>
        {summary && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginBottom: 14 }}>
            <Summary label={t("w.teams.monitor.athletes")} value={summary.athletes} color={C.chalk} />
            <Summary label={t("w.teams.monitor.lowReadiness")} value={summary.redReadiness} color={summary.redReadiness ? C.red : C.lime} />
            <Summary label={t("w.teams.monitor.acwrFlags")} value={summary.acwrFlags} color={summary.acwrFlags ? C.amber : C.lime} />
            <Summary label={t("w.teams.monitor.injuryFlags")} value={summary.injuryFlags} color={summary.injuryFlags ? C.red : C.lime} />
          </View>
        )}

        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash, marginBottom: 8 }}>{t("w.teams.monitor.segment")}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs, paddingRight: 8 }} style={{ marginBottom: 12 }}>
          {SEGS.map((s) => (
            <Pill key={s} label={s === "all" ? `${t("w.teams.monitor.all")} ${squad.length}` : `${SEGMENT_LABELS[s]} ${counts[s] ?? 0}`} on={seg === s} onPress={() => setSeg(s)} />
          ))}
        </ScrollView>

        {allTags.length > 0 && (
          <>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash, marginBottom: 8 }}>{t("w.teams.monitor.tag")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs, paddingRight: 8 }} style={{ marginBottom: 12 }}>
              <Pill label={t("w.teams.monitor.all")} on={tag === ""} onPress={() => setTag("")} />
              {allTags.map((tg) => <Pill key={tg} label={tg} on={tag === tg} onPress={() => setTag(tg)} />)}
            </ScrollView>
          </>
        )}

        <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, marginBottom: 14 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{t("w.teams.monitor.sortBy")}</Text>
          {(["readiness", "acwr", "risk"] as const).map((k) => (
            <Pill key={k} label={t(`w.teams.monitor.sort.${k}`)} on={sort === k} onPress={() => setSort(k)} />
          ))}
        </View>

        <View style={{ gap: space.sm }}>
          {sorted.map((a) => {
            const s = segOf(a);
            return (
              <ACard key={a.linkId} style={{ padding: 16 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: space.sm }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }} numberOfLines={1}>{a.name}</Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                      <Tag color={segColor(s)} label={SEGMENT_LABELS[s]} />
                      {(a.tags ?? []).map((tg) => <Tag key={tg} color={C.blue} label={tg} />)}
                    </View>
                  </View>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{fmtDate(a.lastSession)}</Text>
                </View>

                <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 12, gap: 12 }}>
                  <Metric label={t("w.teams.monitor.thReadiness")} value={String(a.readiness)} color={readinessColor(a.readiness)} dot />
                  <Metric label="ACWR" value={a.acwr ? a.acwr.toFixed(2) : "—"} color={acwrColor(a.acwrBand)} sub={a.acwrBand} />
                  <Metric label={t("w.teams.monitor.thAcuteLoad")} value={a.acute ? String(a.acute) : "—"} color={C.chalk} />
                  <Metric label={t("w.teams.monitor.thInjuryRisk")} value={String(a.riskOverall)} color={riskColor(a.riskOverall)} sub={a.flagged ?? undefined} subColor={C.red} />
                  <Metric label="HPI" value={String(a.hpi)} color={C.chalk} />
                </View>
              </ACard>
            );
          })}
        </View>

        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 12, lineHeight: 16 }}>{t("w.teams.monitor.acwrNote")}</Text>
      </View>
    );
  };

  return (
    <AuroraScreen refreshing={refreshing} onRefresh={() => load(true)}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 1.4, textTransform: "uppercase", color: C.amber }}>squad</Text>
      <AHeading style={{ marginTop: 2, marginBottom: 16 }}>{t("nav.squad")}</AHeading>
      <Body />
    </AuroraScreen>
  );

  function Summary({ label, value, color }: { label: string; value: number; color: string }) {
    return (
      <ACard style={{ flex: 1, minWidth: 130, padding: 16 }}>
        <Text style={{ fontFamily: F.black, fontSize: 28, color: txt(C, color) }}>{value}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.8, color: C.ash }}>{label}</Text>
      </ACard>
    );
  }

  function Tag({ color, label }: { color: string; label: string }) {
    return (
      <View style={{ backgroundColor: `${color}24`, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: txt(C, color) }}>{label}</Text>
      </View>
    );
  }

  function Metric({ label, value, color, sub, subColor, dot }: { label: string; value: string; color: string; sub?: string; subColor?: string; dot?: boolean }) {
    return (
      <View style={{ minWidth: 64 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.6, color: C.ash }}>{label}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 }}>
          {dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} /> : null}
          <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: dot ? C.chalk : txt(C, color) }}>{value}</Text>
        </View>
        {sub ? <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: subColor ? txt(C, subColor) : txt(C, color) }} numberOfLines={1}>{sub}</Text> : null}
      </View>
    );
  }
}
