import { View, Text, type DimensionValue } from "react-native";
import {
  comparisonBar, comparisonAverageMark, verdictLabelKey, ALPHA,
  type VerdictComparison, type ActivityMetric,
} from "@hybrid/core";
import { ASection, RADIUS, withAlpha } from "./kit";
import { MeasureLine, MeasureTrack, MeasureScale, MEASURE_ROW_PAD } from "./measure-row";
import { useTheme, txt } from "../../lib/theme";
import { fs, space, F, PressScale as Pressable, FIXED_FONT_SCALE, tracking } from "../../lib/ui";

/**
 * THE COMPARISON — the activity card's SECOND PAGE.
 *
 * The figure row can mark only TWO of its four metrics, because `best` and
 * `worst` are the period's two ENDS and a row of totals has no room to argue
 * about the middle. A week of +31% hours, +18% tonnage, −7% sessions and −9%
 * distance therefore states four figures and explains two of them; the other
 * two comparisons are computed on every render and thrown away. This page keeps
 * them: every metric against its own average, on one axis, one row each.
 *
 * IT IS THE BY-MUSCLE ROW — the same COMPONENT, not a copy of it. Volume's
 * "By muscle" list (aurora/volume.tsx `MuscleRow`) is this app's answer to
 * exactly this shape of question, and it had already settled every decision
 * this page was re-litigating from scratch. The shared pieces live in
 * aurora/measure-row.tsx and both screens read them, so the head's sizing, the
 * rail's field and the landmark row's alignment can only ever change on both at
 * once. This page was briefly a hand-rolled copy of that row, which is exactly
 * the drift the shared component exists to end:
 *
 *   • The LABEL is the display face in chalk (`F.semi` at `fs.note`), not a mono
 *     uppercase kicker. It names a thing, and things get names, not labels.
 *   • The FIGURE is `F.monoBold` at the SAME size, toned. A metric's headline
 *     figure and its name sit on one baseline at one size, which is what makes
 *     a list of them scan.
 *   • The third slot on that line is mono caption ash, carrying the context the
 *     figure needs — "Target 14" over there, the difference in real units here.
 *   • The bar is a TRACK: a filled rail on `C.ink`, with the reference cut into
 *     it as a notch. An earlier pass here drew a bare bar on the card and argued
 *     the track was chrome; the track is not chrome, it is the field the mark is
 *     measured in, and this app had already decided that.
 *   • Under it, the figures line up as a flat left-pinned row of equal columns,
 *     exactly as MEV / MAV / MRV do — so values align down the whole list
 *     instead of floating at two different indents.
 *
 * What is NOT shared is the geometry inside the rail, and it must not be:
 * Volume normalises sets onto a landmark scale, this page maps a signed
 * percentage onto a centre axis. The FIELD is common, the marks in it are not.
 *
 * ONE AXIS, AND THE AXIS IS THE ATHLETE'S OWN AVERAGE — not zero. Bar length is
 * per cent of that average, because per cent is the only unit tonnage (kg), a
 * session COUNT, hours (minutes) and distance (km) can share; a shared VALUE
 * axis across those four is not one axis, it is four pretending.
 *
 * THE SCALE IS FIXED (core's COMPARE_SCALE_PCT), not fitted to the week's
 * biggest mover. Fitting makes a +4% week draw exactly the same picture as a
 * +40% one, so the chart looks identical every week and length stops carrying
 * magnitude at a glance. Past the scale the bar PINS and the figure keeps
 * counting — the same honesty the card already applies past VERDICT_PCT_CEILING.
 *
 * COLOUR STILL MARKS ONLY THE TWO ENDS, which is the rule a chart most wants to
 * break. Every rise going chartreuse here would light tonnage's +18% on this
 * page and leave it ash on the page one DRAG away — the same week, two readings,
 * and the athlete has no way to know which is the lie. Direction is already
 * carried by which side of the axis the bar sits on, which is a channel this
 * page has and the figure row does not.
 *
 * A ROW OPENS WHAT ITS COLUMN OPENS. Pressing a row raises the same breakdown
 * sheet the column press raises on page one, with the same groups and the same
 * sessions inside. Two ways in, one destination, or the second page is a dead
 * end wearing a chart.
 *
 * IT IS A PAGE, NOT A SHEET. A sheet is for a DETOUR — narrow to a sport, open a
 * session, come back — which is why the breakdown is one. The comparison is not
 * a detour; it is the same four figures said the other way, so it belongs beside
 * them, at the same level, reachable without leaving the screen.
 */

const pct = (v: number): DimensionValue => `${v * 100}%` as DimensionValue;

export default function ActivityCompare({
  rows,
  headline,
  fmt,
  onOpen,
  t,
}: {
  rows: VerdictComparison[];
  /** The mono meta on the head's right — core's `comparisonHeadKey`, already
   *  translated. It names the AXIS, which is the one thing this page adds; the
   *  WINDOW is deliberately absent, since the section head above the card
   *  already carries it and printing it twice is the redundancy the Progress
   *  cluster's sweep exists to catch. */
  headline: string;
  /** Canonical → display, the SAME formatter the figure row uses, so a span or
   *  a tonnage cannot print two ways one drag apart. */
  fmt: (metric: ActivityMetric, value: number) => string;
  onOpen?: (metric: ActivityMetric) => void;
  t: (k: string) => string;
}) {
  const { palette: C } = useTheme();

  const tone = (end: VerdictComparison["end"]) =>
    end === "best" ? txt(C, C.lime) : end === "worst" ? txt(C, C.red) : null;

  /** A signed difference, always carrying its sign — "+2.3 t", "−0.92 km". The
   *  sign hugs its figure, exactly as the percentage beside it does, and the
   *  magnitude goes through the metric's own formatter so the difference and
   *  the figures under it round the same way. */
  const signed = (metric: ActivityMetric, diff: number) => {
    const mag = fmt(metric, Math.abs(diff));
    return `${diff < 0 ? "−" : "+"}${mag}`;
  };

  return (
    <View>
      {/* The head is the kit's ASection, not a hand-rolled copy of it — the
          same component every other section head on the app uses, so this one
          cannot drift into being the seventh spelling of "title left, mono meta
          right". The meta names the AXIS, which is the one thing this page
          adds; the WINDOW is deliberately absent, since the section head above
          the card already carries it. */}
      <ASection title={t("w.home.cmp.title")} meta={headline} />

      <View style={{ marginTop: 4 }}>
        {rows.map((r) => {
          const col = tone(r.end);
          const bar = comparisonBar(r);
          const avg = comparisonAverageMark(r);
          const move = r.deltaPct;
          return (
            <Pressable
              key={r.metric}
              onPress={() => onOpen?.(r.metric)}
              disabled={!onOpen}
              accessibilityRole="button"
              accessibilityLabel={
                move === null
                  ? t("w.home.cmp.aRowFlat")
                    .replace("{m}", t(verdictLabelKey(r.metric)))
                    .replace("{b}", fmt(r.metric, r.value))
                  : t("w.home.cmp.aRow")
                    .replace("{m}", t(verdictLabelKey(r.metric)))
                    .replace("{p}", `${move > 0 ? "+" : move < 0 ? "−" : ""}${Math.abs(move)}%`)
                    .replace("{a}", fmt(r.metric, r.baseline))
                    .replace("{b}", fmt(r.metric, r.value))
                    .replace("{d}", signed(r.metric, r.diff))
              }
              accessibilityHint={onOpen ? t("w.home.act.hint") : undefined}
              style={{ paddingVertical: MEASURE_ROW_PAD }}
            >
              <MeasureLine
                name={t(verdictLabelKey(r.metric))}
                figure={move === null ? "—" : `${move > 0 ? "+" : move < 0 ? "−" : ""}${Math.abs(move)}%`}
                tone={col}
                context={move === null ? null : signed(r.metric, r.diff)}
              />

              {/* The marks are this page's own — one bar off a centre axis. The
                  rail they sit in is the shared one. */}
              {bar !== null && (
                <MeasureTrack>
                  {bar < 0 && (
                    <View style={{
                      position: "absolute", right: "50%", width: pct(Math.abs(bar) / 2),
                      top: 0, bottom: 0, borderRadius: RADIUS.pill,
                      backgroundColor: col ?? C.ash, opacity: 0.9,
                    }} />
                  )}
                  {bar > 0 && (
                    <View style={{
                      position: "absolute", left: "50%", width: pct(bar / 2),
                      top: 0, bottom: 0, borderRadius: RADIUS.pill,
                      backgroundColor: col ?? C.ash, opacity: 0.9,
                    }} />
                  )}
                  {/* THE AVERAGE, as a second landmark — MEV and MRV sit either
                      side of where you are on a muscle's rail, and this is the
                      same move: the bar says what you did against LAST period,
                      the notch says where your normal is. Absent when the mean
                      is the previous period, where it would land under the axis
                      it duplicates. */}
                  {avg !== null && (
                    <View style={{
                      position: "absolute", left: pct(0.5 + avg / 2), top: 0, bottom: 0,
                      width: 2, marginLeft: -1, backgroundColor: withAlpha(C.chalk, ALPHA.line),
                    }} />
                  )}
                  {/* The axis, notched in LAST so it survives both — the same
                      device MEV and MRV use over there. */}
                  <View style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 2, backgroundColor: withAlpha(C.chalk, ALPHA.rim) }} />
                </MeasureTrack>
              )}

              {/* AVG / NOW where MEV / MAV / MRV sit. Not pressable here: the
                  whole row already presses through to the breakdown. */}
              {/* THREE LANDMARKS, exactly as MEV / MAV / MRV are three: where
                  you were, where you are, and what your normal is. Every cell
                  KEEPS ITS SLOT when it has nothing to say — a metric with no
                  previous period would otherwise pull the others left while
                  every row beside it kept them in place, and the list stops
                  lining up. An em dash says "there is none", which is the true
                  fact and the same one the figure above is printing. */}
              <MeasureScale
                cells={[
                  { key: "prev", label: t("w.home.cmp.prev"), value: move === null ? "—" : fmt(r.metric, r.previous) },
                  { key: "now", label: t("w.home.cmp.now"), value: fmt(r.metric, r.value) },
                  { key: "avg", label: t("w.home.cmp.avg"), value: r.baseline > 0 ? fmt(r.metric, r.baseline) : "—" },
                ]}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
