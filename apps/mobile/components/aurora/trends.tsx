import { useMemo, useState, type ReactNode } from "react";
import { View, Text, type StyleProp, type TextStyle } from "react-native";
import { useRouter } from "expo-router";
import Svg, { Path, Circle, Line as SvgLine } from "react-native-svg";
import {
  weeklyVolumeTrend, exerciseTable, EXERCISE_TABLE_FOLD, fmtWeight, fmtTonnage, fmtRowChange, splitFigure, kgToUnit, sparkline,
  volumeTrendReading, stepTrendWindow, TREND_WEEKS_DEFAULT,
  type ExercisePeriod, type TrendDir, type ExerciseTableRow,
} from "@hybrid/core";
import { useSessionsQuery } from "../../lib/queries";
import { useBodyweightLookup } from "../../lib/use-bodyweight";
import { useRefreshOnFocus } from "../../lib/query";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { leading, fs, space, tracking, F, PressScale as Pressable } from "../../lib/ui";
import { useChartScrub } from "./chart-scrub";
import { AuroraScreen, ACard, AHeading, ASub, ASegment } from "./kit";

const PERIODS: { id: ExercisePeriod; key: string }[] = [{ id: "8w", key: "w.analyze.trends.period8w" }, { id: "6m", key: "w.analyze.trends.period6m" }, { id: "1y", key: "w.analyze.trends.period1y" }, { id: "all", key: "w.analyze.trends.periodAll" }];

// ONE SHEET — the three floating cards (sets, tonnage, exercise table) are a
// single surface divided by hairlines. Three cards made one screen look like
// three unrelated features, and each spent 80dp of height on a chart to say a
// number it then set at 10dp in the corner. Here every band leads with its
// FIGURE; the eight-week line supports it at the size a supporting mark
// deserves. See design/trend-cards-redesign-ideas.html (idea 7).
const PAD_X = 18;
const SPARK = { width: 112, height: 46, pad: 4 };

/** A week bucket's date, as the bands print it. */
const fmtWeekDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "");

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
  // The DEFAULT window is bounded (audit/10 T9): "all" ran one per-exercise
  // dashboard pass over full history for every movement ever logged, on mount,
  // to show a table most visits never scroll to the bottom of. Eight weeks
  // matches the two measure bands above it; "all" stays one tap away.
  const [period, setPeriod] = useState<ExercisePeriod>("8w");
  const [sort, setSort] = useState<{ k: keyof ExerciseTableRow; dir: 1 | -1 }>({ k: "volume", dir: -1 });
  // The table wears EXERCISE_TABLE_FOLD rows until the athlete asks for all of
  // them — the fold is the engine's constant, so both clients fold at one depth.
  const [allRows, setAllRows] = useState(false);

  const load = () => refetch();
  useRefreshOnFocus(refetch);

  const prefs = useLoggerPrefs();
  const iw = prefs.countWarmupsInVolume, units = prefs.units;
  const bw = useBodyweightLookup();
  // THE WINDOW IS PINCHABLE (audit/09 §14's one missing gesture). It was the
  // literal 8 at three call sites — a reasonable default that no athlete could
  // ever change. The rungs and the gesture's inverted sense are core's
  // (`stepTrendWindow`), so the spark and its label can never disagree about
  // how many weeks are on screen.
  const [trendWeeks, setTrendWeeks] = useState<number>(TREND_WEEKS_DEFAULT);
  const zoom = (dir: 1 | -1) => setTrendWeeks((w) => stepTrendWindow(w, dir));
  const weeks = useMemo(() => weeklyVolumeTrend(sessions, trendWeeks, Date.now(), iw, bw), [sessions, trendWeeks, iw, bw]);
  const table = useMemo(() => exerciseTable(sessions, period, Date.now(), iw, bw), [sessions, period, iw, bw]);
  // "Has this athlete lifted at all?" — asked of the weekly series this screen
  // actually draws, rather than of a second volumeStatus() pass whose only other
  // job (the muscle breakdown) now lives on the Volume rows.
  const trained = weeks.some((w) => w.sets > 0) || table.length > 0;
  const sortedTable = useMemo(() => {
    const arr = [...table]; const { k, dir } = sort;
    arr.sort((a, b) => (k === "name" ? dir * a.name.localeCompare(b.name) : dir * (((a[k] as number) ?? 0) - ((b[k] as number) ?? 0))));
    return arr;
  }, [table, sort]);
  const sortBy = (k: keyof ExerciseTableRow) => setSort((s) => (s.k === k ? { k, dir: (s.dir * -1) as 1 | -1 } : { k, dir: k === "name" ? 1 : -1 }));
  const shownRows = allRows ? sortedTable : sortedTable.slice(0, EXERCISE_TABLE_FOLD);
  const folded = sortedTable.length - EXERCISE_TABLE_FOLD;

  // One meaning per colour: chartreuse marks the CURRENT week and the live
  // selection, teal is the second measure, and a change is signed text tinted by
  // whether it was an improvement — never a bare arrow.
  const TREND: Record<TrendDir, string> = { up: C.lime, down: C.amber, flat: C.ash };
  const setSeries = weeks.map((w) => w.sets);
  const tonneSeries = weeks.map((w) => (units === "kg" ? w.tonnage : kgToUnit(w.tonnage, "lb")) / 1000);
  const last = weeks[weeks.length - 1];
  const avgSets = setSeries.reduce((a, b) => a + b, 0) / (setSeries.length || 1);
  const avgTonnage = weeks.reduce((a, w) => a + w.tonnage, 0) / (weeks.length || 1);
  const [tonnageValue, tonnageUnit] = splitFigure(fmtTonnage(last?.tonnage ?? 0, units));

  const divider = { borderBottomWidth: 1, borderBottomColor: C.line } as const;
  const bandLabel = { fontFamily: F.semi, fontSize: fs.caption, color: C.ash } as const;
  const figure = { fontFamily: F.black, fontSize: fs.display, color: C.chalk, letterSpacing: tracking.display } as const;
  const meta = { fontFamily: F.mono, fontSize: fs.micro, color: C.ash } as const;
  const colHead = { fontFamily: F.mono, fontSize: fs.nano, color: C.ash, letterSpacing: tracking.label } as const;

  /** A measure band: label, the week's figure, its eight-week average, and the
   *  eight-week line — drawn on a TRUE zero baseline, so a week with nothing
   *  logged sits on the line instead of being floored into a phantom bar. */
  const Measure = ({ label, value, unit, avg, series, color, measure }: {
    label: string; value: string; unit?: string; avg: string; series: number[]; color: string;
    measure: "sets" | "tonnage";
  }) => {
    const s = sparkline(series, SPARK);
    // sparkline() insets its points by `pad` at each end (the endpoint dot must
    // not clip), so the hit-testing has to know about the same inset.
    const scrub = useChartScrub(series.length, "point", SPARK.pad / SPARK.width, { onZoom: zoom });
    const read = scrub.index >= 0 ? volumeTrendReading(weeks, scrub.index, measure, units) : null;
    const hit = read ? s.points[read.index] : null;
    return (
      <View style={[{ flexDirection: "row", alignItems: "center", gap: space.lg, paddingHorizontal: PAD_X, paddingVertical: 17 }, divider]}>
        {/* HELD, the band answers for another week in the slots it already has:
            the FIGURE becomes that week's, and the average line underneath
            becomes the week it belongs to. A pinned pill would cover a 112×46
            spark whole. */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={bandLabel}>{label}</Text>
          <View style={{ flexDirection: "row", alignItems: "baseline", marginTop: 9 }}>
            <Text style={[figure, read?.best ? { color: txt(C, C.lime) } : null]}>{read ? read.value : value}</Text>
            {!!(read ? read.unit : unit) && (
              <Text style={{ fontFamily: F.semi, fontSize: fs.caption, color: C.ash, marginLeft: 4 }}>{read ? read.unit : unit}</Text>
            )}
          </View>
          <Text style={[meta, { marginTop: 8 }]}>
            {read ? t("chart.weekOf").replace("{date}", fmtWeekDate(read.weekStart)) : avg}
          </Text>
        </View>
        <View {...scrub.bind} accessibilityLabel={label}>
          <Svg width={SPARK.width} height={SPARK.height}>
            <SvgLine x1={0} y1={s.baselineY} x2={SPARK.width} y2={s.baselineY} stroke={C.line} strokeWidth={1} />
            <Path d={s.d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" opacity={0.6} />
            <Circle cx={s.last.x} cy={s.last.y} r={3.2} fill={color} />
            {!!hit && <SvgLine x1={hit.x} x2={hit.x} y1={0} y2={SPARK.height} stroke={C.ash} strokeWidth={1} strokeOpacity={0.55} />}
            {!!hit && <Circle cx={hit.x} cy={hit.y} r={4} fill={C.chalk} stroke={C.ink2} strokeWidth={1.5} />}
          </Svg>
        </View>
      </View>
    );
  };

  /** A sortable column label. The active key carries the arrow; nothing else is
   *  tinted, so chartreuse keeps meaning "selected". */
  const Col = ({ k, label, style }: { k: keyof ExerciseTableRow; label: string; style?: StyleProp<TextStyle> }) => (
    <Text onPress={() => sortBy(k)} style={[colHead, sort.k === k && { color: txt(C, C.lime) }, style]}>
      {label}{sort.k === k ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
    </Text>
  );

  const body = (
    <>
      {/* Standing alone the title is the HERO's (below); embedded — a hub tab,
          or inside the unified Performance page — the host owns the head, so
          only the sub-line renders here. */}
      {(top || unified) && <AHeading style={{ fontSize: fs.display }}>{t("w.analyze.trends.title")}</AHeading>}
      <ASub style={{ marginTop: top || unified ? 10 : 0 }}>{t("w.analyze.trends.subtitle")}</ASub>

      {!trained ? (
        <ACard solid style={{ marginTop: 16, alignItems: "center", paddingVertical: 30 }}>
          <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, textAlign: "center", lineHeight: leading(fs.bodyLg, "snug") }}>{t("w.analyze.trends.empty")}</Text>
        </ACard>
      ) : (
        <ACard solid style={{ marginTop: 16, padding: 0, overflow: "hidden" }}>
          <Measure
            label={t("w.analyze.trends.setsMeasure")}
            value={String(last?.sets ?? 0)}
            avg={`${t("w.analyze.trends.avgNw").replace("{n}", String(trendWeeks))} ${Number(avgSets.toFixed(1))}`}
            series={setSeries}
            color={C.lime}
            measure="sets"
          />
          <Measure
            label={t("w.analyze.trends.tonnageMeasure")}
            value={tonnageValue}
            unit={tonnageUnit}
            avg={`${t("w.analyze.trends.avgNw").replace("{n}", String(trendWeeks))} ${fmtTonnage(avgTonnage, units)}`}
            series={tonneSeries}
            color={C.blue}
            measure="tonnage"
          />

          {/* The quiet band — the sheet's one recessive surface, carrying the
              section's name and its period switch.

              THE ROW SURVIVES, THE UNDERLINE DOES NOT. The switch was a row of
              labels on a 2dp CHARTREUSE border, and the comment here used to
              call it "an underline that moves" — it never moved: the border was
              per-tab, so it appeared under one label and vanished from under
              another. Its stated reason ("the fill was competing with the
              figures above it for the same accent") was a real objection to a
              chartreuse PILL, and it does not apply to the shared control,
              whose lens is a neutral step of the text colour and never the
              accent. So this is `ASegment`, the same switch the rest of the app
              changes state with.

              IT STAYS IN THE LABEL'S ROW — the band is one row and that is its
              shape; the label keeps its natural width and the track takes the
              rest. The band's own padding drops from 12 to 8 because the track
              brings a 52dp height of its own, so the band grows by ~20dp rather
              than ~44. And the track is the DEFAULT (raised) fill, not
              `surface: 'card'`: this band is `ink`, the darker ground, so a
              raised track reads against it exactly as it does on a screen. */}
          <View style={[{ backgroundColor: C.ink, flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: PAD_X, paddingVertical: 8 }, divider]}>
            <Text numberOfLines={1} style={[bandLabel, { flexShrink: 1 }]}>{t("w.analyze.trends.perExercise")}</Text>
            <View style={{ flex: 1 }}>
              <ASegment
                options={PERIODS.map((p) => ({ id: p.id, label: t(p.key) }))}
                value={period}
                onPick={setPeriod}
              />
            </View>
          </View>

          <View style={{ paddingHorizontal: PAD_X, paddingTop: 13, paddingBottom: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm, paddingBottom: 9 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Col k="name" label={t("w.analyze.trends.colExercise")} />
                {/* The header mirrors the ROW: what the row's second line shows,
                    the header's second line sorts. */}
                <Text style={{ marginTop: 5 }}>
                  <Col k="sessions" label={t("w.analyze.trends.colFreq")} />
                  <Text style={colHead}> – </Text>
                  <Col k="volume" label={t("w.analyze.trends.colVolume")} />
                </Text>
              </View>
              <Col k="topWeight" label={t("w.analyze.trends.colHeaviest")} style={{ width: 78, textAlign: "right" }} />
              <Col k="change" label={t("w.analyze.trends.colChange")} style={{ width: 62, textAlign: "right" }} />
            </View>
            {shownRows.map((r) => (
              <Pressable
                key={r.name}
                onPress={() => router.push({ pathname: "/exercise", params: { name: r.name } })}
                style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm, paddingVertical: 13, borderTopWidth: 1, borderTopColor: C.line }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontFamily: F.semi, fontSize: fs.bodyLg, color: C.chalk }}>{r.name}</Text>
                  <Text numberOfLines={1} style={[meta, { marginTop: 5 }]}>
                    {`${r.sessions}× – ${r.kind === "cardio" ? `${r.volume} km` : fmtTonnage(r.volume, units)}`}
                  </Text>
                </View>
                <Text style={{ width: 78, textAlign: "right", fontFamily: F.mono, fontSize: fs.bodyLg, color: C.chalk }}>
                  {r.kind === "strength" ? fmtWeight(r.topWeight, units) : `${r.volume} km`}
                </Text>
                <Text style={{ width: 62, textAlign: "right", fontFamily: F.mono, fontSize: fs.micro, color: r.change ? txt(C, TREND[r.trend]) : C.ash }}>
                  {fmtRowChange(r, units)}
                </Text>
              </Pressable>
            ))}
            {/* The list's END CONTROL — an EXPANDER, so it wears the expander
                grammar (endurance-lanes' All-sports control): chromeless, a
                BARE ＋/− with no ring (the ring promises a screen; this only
                grows the list in place), and an ash count naming exactly how
                many rows are folded — a cap is never silent. Mirrors web. */}
            {folded > 0 && (
              <Pressable
                onPress={() => setAllRows((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: allRows }}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 10, paddingBottom: 13, borderTopWidth: 1, borderTopColor: C.line }}
              >
                <View style={{ width: 32, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 18, color: C.ash }}>{allRows ? "−" : "＋"}</Text>
                </View>
                <Text style={{ flex: 1, fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>
                  {allRows ? t("w.analyze.trends.fewerRows") : t("w.analyze.trends.allRows")}
                </Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{allRows ? "−" : "+"}{folded}</Text>
              </Pressable>
            )}
          </View>
        </ACard>
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
