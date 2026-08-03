import { useMemo, useState, type ReactNode } from "react";
import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import {
  weeklyVolumeTrend, exerciseTable, fmtWeight, fmtTonnage, kgToUnit,
  type LoggedSession, type ExercisePeriod, type TrendDir, type ExerciseTableRow,
} from "@hybrid/core";
import { useSessionsQuery } from "../../lib/queries";
import { useBodyweightLookup } from "../../lib/use-bodyweight";
import { useRefreshOnFocus } from "../../lib/query";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, space, F, PressScale as Pressable } from "../../lib/ui";
import { AuroraScreen, ACard, AHeading, ASub, RADIUS } from "./kit";

const PERIODS: { id: ExercisePeriod; key: string }[] = [{ id: "8w", key: "w.analyze.trends.period8w" }, { id: "6m", key: "w.analyze.trends.period6m" }, { id: "1y", key: "w.analyze.trends.period1y" }, { id: "all", key: "w.analyze.trends.periodAll" }];

/** AURORA Trends — analytics hub (weekly volume, muscle breakdown, per-exercise
 *  table) reusing the exact engines. */
export default function AuroraTrends({ top, unified = false }: {
  top?: ReactNode;
  /** True when these sections render INSIDE the unified Performance page: no
   *  AuroraScreen wrapper (the page owns the scroller), title demotes to a
   *  section head. */
  unified?: boolean;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const { data: sessions = [], isFetching: refreshing, refetch } = useSessionsQuery();
  const [period, setPeriod] = useState<ExercisePeriod>("all");
  const [sort, setSort] = useState<{ k: keyof ExerciseTableRow; dir: 1 | -1 }>({ k: "volume", dir: -1 });

  const load = () => refetch();
  useRefreshOnFocus(refetch);

  const prefs = useLoggerPrefs();
  const iw = prefs.countWarmupsInVolume, units = prefs.units;
  const bw = useBodyweightLookup();
  const weeks = useMemo(() => weeklyVolumeTrend(sessions, 8, Date.now(), iw, bw), [sessions, iw, bw]);
  const table = useMemo(() => exerciseTable(sessions, period, Date.now(), iw, bw), [sessions, period, iw, bw]);
  // "Has this athlete lifted at all?" — asked of the weekly series this screen
  // actually draws, rather than of a second volumeStatus() pass whose only other
  // job (the muscle breakdown) now lives on the Volume rows.
  const trained = weeks.some((w) => w.sets > 0) || table.length > 0;
  const sortedTable = useMemo(() => {
    const arr = [...table]; const { k, dir } = sort;
    arr.sort((a, b) => (k === "name" ? dir * a.name.localeCompare(b.name) : dir * ((a[k] as number) - (b[k] as number))));
    return arr;
  }, [table, sort]);
  const sortBy = (k: keyof ExerciseTableRow) => setSort((s) => (s.k === k ? { k, dir: (s.dir * -1) as 1 | -1 } : { k, dir: k === "name" ? 1 : -1 }));

  const TREND: Record<TrendDir, { g: string; c: string }> = { up: { g: "▲", c: C.lime }, down: { g: "▼", c: C.amber }, flat: { g: "→", c: C.ash } };
  const maxSets = Math.max(...weeks.map((w) => w.sets), 1);
  // WEEKLY TONNAGE — the second series web has always drawn and mobile never
  // did. Folding the screens into one page is the moment to close that gap
  // rather than ship a Performance page that says less on the phone.
  const tonnes = weeks.map((w) => (units === "kg" ? w.tonnage : kgToUnit(w.tonnage, "lb")) / 1000);
  const maxTonnes = Math.max(...tonnes, 0.1);

  const body = (
    <>
      {/* Standing alone the title is the HERO's (below); embedded — a hub tab,
          or inside the unified Performance page — the host owns the head, so
          only the sub-line renders here. */}
      {(top || unified) && <AHeading style={{ fontSize: fs.display }}>{t("w.analyze.trends.title")}</AHeading>}
      <ASub style={{ marginTop: top || unified ? 10 : 0 }}>{t("w.analyze.trends.subtitle")}</ASub>

      {!trained ? (
        <ACard solid style={{ marginTop: 16, alignItems: "center", paddingVertical: 30 }}>
          <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, textAlign: "center", lineHeight: 19 }}>{t("w.analyze.trends.empty")}</Text>
        </ACard>
      ) : (
        <>
          <ACard solid style={{ marginTop: 16 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>{t("w.analyze.trends.weeklySets")}</Text>
            <View style={{ flexDirection: "row", alignItems: "flex-end", height: 80, gap: 5, marginTop: 12 }}>
              {weeks.map((w, i) => <View key={i} style={{ flex: 1, height: 6 + (w.sets / maxSets) * 64, borderRadius: 3, backgroundColor: i === weeks.length - 1 ? C.lime : `${C.lime}66` }} />)}
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{t("w.analyze.trends.weeksAgo")}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{`${weeks[weeks.length - 1]!.sets} ${t("w.analyze.trends.setsThisWk")}`}</Text>
            </View>
          </ACard>

          {/* WEEKLY TONNAGE — the tonnes actually moved, week by week. Web has
              always drawn this second series; mobile hadn't. */}
          <ACard solid style={{ marginTop: 16 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.blue) }}>
              {t("w.analyze.trends.weeklyTonnage")} – {units === "kg" ? t("w.analyze.trends.tonnes") : t("w.analyze.trends.klb")}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "flex-end", height: 80, gap: 5, marginTop: 12 }}>
              {tonnes.map((v, i) => <View key={i} style={{ flex: 1, height: 6 + (v / maxTonnes) * 64, borderRadius: 3, backgroundColor: i === tonnes.length - 1 ? C.blue : `${C.blue}66` }} />)}
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{t("w.analyze.trends.weeksAgo")}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{fmtTonnage(weeks[weeks.length - 1]?.tonnage ?? 0, units)}</Text>
            </View>
          </ACard>

          <ACard solid style={{ marginTop: 16 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>{t("w.analyze.trends.exerciseAnalytics")}</Text>
            <View style={{ flexDirection: "row", backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, padding: 4, gap: space.xxs, marginTop: 12 }}>
              {PERIODS.map((p) => { const on = period === p.id; return (
                <Pressable key={p.id} onPress={() => setPeriod(p.id)} style={{ flex: 1, paddingVertical: 8, borderRadius: RADIUS.pill, backgroundColor: on ? C.lime : "transparent", alignItems: "center" }}>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.micro, color: on ? C.onAccent : C.ash }}>{t(p.key)}</Text>
                </Pressable>
              ); })}
            </View>
            <View style={{ flexDirection: "row", marginTop: 12, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.line }}>
              {([["w.analyze.trends.colExercise", "name", 2, "left"], ["w.analyze.trends.colFreq", "sessions", 1, "center"], ["w.analyze.trends.colHeaviest", "topWeight", 1, "center"]] as const).map(([h, k, fl, al]) => (
                <Text key={h} onPress={() => sortBy(k)} style={{ flex: fl, textAlign: al, fontFamily: F.mono, fontSize: fs.nano, color: sort.k === k ? txt(C, C.lime) : C.ash, letterSpacing: 0.9 }}>{t(h)}{sort.k === k ? (sort.dir === 1 ? " ↑" : " ↓") : ""}</Text>
              ))}
              <Text onPress={() => sortBy("volume")} style={{ width: 28, textAlign: "center", fontFamily: F.mono, fontSize: fs.nano, color: sort.k === "volume" ? txt(C, C.lime) : C.ash }}>↗</Text>
            </View>
            {sortedTable.map((r) => { const tr = TREND[r.trend]; return (
              <Pressable key={r.name} onPress={() => router.push({ pathname: "/exercise", params: { name: r.name } })} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line }}>
                <Text style={{ flex: 2, fontFamily: F.mono, fontSize: fs.body, color: txt(C, C.lime) }}>{r.name}</Text>
                <Text style={{ flex: 1, textAlign: "center", fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{r.sessions}×</Text>
                <Text style={{ flex: 1, textAlign: "center", fontFamily: F.mono, fontSize: fs.body, color: r.kind === "strength" ? C.chalk : C.ash }}>{r.kind === "strength" ? fmtWeight(r.topWeight, units) : `${r.volume}km`}</Text>
                <Text style={{ width: 28, textAlign: "center", fontFamily: F.mono, fontSize: fs.body, color: txt(C, tr.c) }}>{tr.g}</Text>
              </Pressable>
            ); })}
          </ACard>
        </>
      )}
    </>
  );

  // Inside the unified Performance page the host owns the scroller, the safe
  // area and the pull-to-refresh — wrapping again would nest two ScrollViews.
  if (unified) return body;
  return (
    <AuroraScreen refreshing={refreshing} onRefresh={load} top={top} hero={top ? undefined : { rank: "title", title: t("w.analyze.trends.title") }}>
      {body}
    </AuroraScreen>
  );
}
