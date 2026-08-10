import { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { athleteSegment, SEGMENT_LABELS, type AthleteSegment } from "@hybrid/core";
import { fetchSquad, type SquadRow, type SquadSummary } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { leading, fs, space, F, PressScale as Pressable, Chip, FIXED_FONT_SCALE, Loading, LoadSwap } from "../../lib/ui";
import { AuroraScreen, ACard, AHeading, RADIUS, AChip } from "./kit";

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—");

/** AURORA Squad Monitor (mobile) — the twin of the web Team Monitor
 *  (apps/web/components/aurora/team-monitor.tsx), on the same /api/coach/squad
 *  payload and the same shared `athleteSegment` engine, so the segments, flags
 *  and ordering match exactly.
 *
 *  The web version is an 8-column table; a phone can't carry that, so each
 *  athlete becomes a card carrying the same eight facts. The summary strip,
 *  segment + tag filters and the three sorts are unchanged. RAG readiness dots
 *  are SEMANTIC status dots, which the no-decorative-dot rule explicitly keeps.
 *  Part of closing the mobile-team-surfaces gap. */
export default function AuroraTeamMonitor() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const [squad, setSquad] = useState<SquadRow[]>([]);
  const [summary, setSummary] = useState<SquadSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<"readiness" | "acwr" | "risk">("readiness");
  const [seg, setSeg] = useState<AthleteSegment | "all">("all");
  const [tag, setTag] = useState<string>("");

  useEffect(() => {
    let alive = true;
    fetchSquad()
      .then(({ squad: s, summary: sm }) => {
        if (!alive) return;
        setSquad(s);
        setSummary(sm);
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const readinessColor = (r: number) => (r >= 70 ? txt(C, C.lime) : r >= 55 ? txt(C, C.amber) : txt(C, C.red));
  const riskColor = (r: number) => (r < 33 ? txt(C, C.lime) : r < 66 ? txt(C, C.amber) : txt(C, C.red));
  const acwrColor = (band: string) =>
    band === "sweet-spot" ? txt(C, C.lime) : band === "caution" ? txt(C, C.amber) : band === "danger" ? txt(C, C.red) : band === "detraining" ? txt(C, C.blue) : C.ash;
  const segColor = (s: AthleteSegment) =>
    s === "needs-attention" ? txt(C, C.red) : s === "dormant" ? txt(C, C.violet) : s === "new" ? txt(C, C.blue) : txt(C, C.lime);

  const segOf = (a: SquadRow): AthleteSegment =>
    athleteSegment({
      readiness: a.readiness,
      acwrBand: a.acwrBand,
      flagged: !!a.flagged,
      daysSinceLast: a.lastSession ? Math.floor((Date.now() - Date.parse(a.lastSession)) / 86_400_000) : null,
      sessions: a.sessions,
    });

  const { counts, allTags, sorted } = useMemo(() => {
    const c = squad.reduce((m, a) => { const s = segOf(a); m[s] = (m[s] ?? 0) + 1; return m; }, {} as Record<string, number>);
    const tags = [...new Set(squad.flatMap((a) => a.tags ?? []))].sort();
    const filtered = squad
      .filter((a) => seg === "all" || segOf(a) === seg)
      .filter((a) => !tag || (a.tags ?? []).includes(tag));
    return {
      counts: c,
      allTags: tags,
      sorted: [...filtered].sort((a, b) =>
        sort === "readiness" ? a.readiness - b.readiness // worst first
        : sort === "acwr" ? b.acwr - a.acwr
        : b.riskOverall - a.riskOverall,
      ),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [squad, seg, tag, sort]);

  const SEGS: (AthleteSegment | "all")[] = ["all", "needs-attention", "dormant", "new", "on-track"];

  // The placeholder hands over to whatever lands — the empty state or the
  // real thing. `body` was already a function, which is exactly the shape
  // LoadSwap's lazy children want, so nothing here had to move.
  const body = () => (
    <LoadSwap loading={loading}>
      {() => {
        if (squad.length === 0) {
          return (
            <ACard style={{ marginTop: space.md }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{t("w.teams.monitor.emptyTitle")}</Text>
              <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.ash, marginTop: 8, lineHeight: leading(fs.body) }}>{t("w.teams.monitor.emptyBody")}</Text>
            </ACard>
          );
        }
        return (
          <>
            {summary ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.ms, marginTop: space.md }}>
                <SummaryCard C={C} label={t("w.teams.monitor.athletes")} value={summary.athletes} color={C.chalk} />
                <SummaryCard C={C} label={t("w.teams.monitor.lowReadiness")} value={summary.redReadiness} color={summary.redReadiness ? txt(C, C.red) : txt(C, C.lime)} />
                <SummaryCard C={C} label={t("w.teams.monitor.acwrFlags")} value={summary.acwrFlags} color={summary.acwrFlags ? txt(C, C.amber) : txt(C, C.lime)} />
                <SummaryCard C={C} label={t("w.teams.monitor.injuryFlags")} value={summary.injuryFlags} color={summary.injuryFlags ? txt(C, C.red) : txt(C, C.lime)} />
              </View>
            ) : null}

            <Text style={kicker(C)}>{t("w.teams.monitor.segment")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }} contentContainerStyle={{ gap: space.xs, paddingRight: space.md }}>
              {SEGS.map((s) => (
                <AChip key={s} selected={seg === s} onPress={() => setSeg(s)}
                  label={s === "all" ? `${t("w.teams.monitor.all")} ${squad.length}` : `${SEGMENT_LABELS[s as AthleteSegment]} ${counts[s] ?? 0}`} />
              ))}
            </ScrollView>

            {allTags.length > 0 ? (
              <>
                <Text style={kicker(C)}>{t("w.teams.monitor.tag")}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }} contentContainerStyle={{ gap: space.xs, paddingRight: space.md }}>
                  <AChip selected={tag === ""} onPress={() => setTag("")} label={t("w.teams.monitor.all")} />
                  {allTags.map((tg) => (
                    <AChip key={tg} selected={tag === tg} onPress={() => setTag(tg)} label={tg} />
                  ))}
                </ScrollView>
              </>
            ) : null}

            <Text style={kicker(C)}>{t("w.teams.monitor.sortBy")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }} contentContainerStyle={{ gap: space.xs, paddingRight: space.md }}>
              {(["readiness", "acwr", "risk"] as const).map((k) => (
                <AChip key={k} selected={sort === k} onPress={() => setSort(k)} label={t(`w.teams.monitor.sort.${k}`)} />
              ))}
            </ScrollView>

            {sorted.map((a) => {
              const s = segOf(a);
              return (
                <ACard key={a.linkId} style={{ marginTop: space.ms }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
                    <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ flex: 1, fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{a.name}</Text>
                    <Chip color={segColor(s)}>{SEGMENT_LABELS[s]}</Chip>
                  </View>

                  {(a.tags ?? []).length > 0 ? (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                      {a.tags!.map((tg) => <Chip key={tg} color={txt(C, C.blue)}>{tg}</Chip>)}
                    </View>
                  ) : null}

                  <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 10 }}>
                    {/* a SEMANTIC RAG status dot — kept by the no-decorative-dot rule */}
                    <Metric C={C} label={t("w.teams.monitor.thReadiness")} value={String(a.readiness)} color={readinessColor(a.readiness)} dot />
                    <Metric C={C} label="ACWR" value={a.acwr ? String(a.acwr) : "—"} sub={a.acwrBand} color={acwrColor(a.acwrBand)} />
                    <Metric C={C} label={t("w.teams.monitor.thAcuteLoad")} value={a.acute ? String(a.acute) : "—"} color={C.chalk} />
                    <Metric C={C} label={t("w.teams.monitor.thInjuryRisk")} value={String(a.riskOverall)} sub={a.flagged ?? undefined} color={riskColor(a.riskOverall)} />
                    <Metric C={C} label="HPI" value={String(a.hpi)} color={C.chalk} />
                    <Metric C={C} label={t("w.teams.monitor.thLast")} value={fmtDate(a.lastSession)} color={C.ash} />
                  </View>
                </ACard>
              );
            })}

            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 12, lineHeight: leading(fs.micro, "relaxed") }}>{t("w.teams.monitor.acwrNote")}</Text>
            {/* Only when a row actually shows the dash — explain the gap so a coach
                doesn't read it as missing data or a broken metric. */}
            {sorted.some((a) => a.acwrBand === "insufficient") && (
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 6, lineHeight: leading(fs.micro, "relaxed") }}>{t("w.teams.monitor.acwrInsufficient")}</Text>
            )}
          </>
        );
      }}
    </LoadSwap>
  );

  return (
    <AuroraScreen hero={{ rank: "title", title: t("nav.squad") }}>
      {body()}
      <View style={{ height: RADIUS.card }} />
    </AuroraScreen>
  );
}

const kicker = (C: Palette) => ({ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase" as const, letterSpacing: 1.2, color: C.ash, marginTop: space.md });

function SummaryCard({ C, label, value, color }: { C: Palette; label: string; value: number; color: string }) {
  return (
    <ACard style={{ flex: 1, minWidth: 140, padding: 16 }}>
      <Text style={{ fontFamily: F.black, fontSize: 28, lineHeight: 32, color }}>{value}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.9, color: C.ash, marginTop: 4 }}>{label}</Text>
    </ACard>
  );
}

function Metric({ C, label, value, sub, color, dot = false }: { C: Palette; label: string; value: string; sub?: string; color: string; dot?: boolean }) {
  return (
    <View style={{ width: "33.33%", paddingVertical: 6 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.9, color: C.ash }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 }}>
        {dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} /> : null}
        <Text style={{ fontFamily: F.mono, fontSize: fs.body, color }}>{value}</Text>
      </View>
      {sub ? <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.nano, color, marginTop: 1 }}>{sub}</Text> : null}
    </View>
  );
}
