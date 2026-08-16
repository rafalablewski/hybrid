import { View, Text, type DimensionValue } from "react-native";
import {
  comparisonBar, verdictLabelKey, ALPHA,
  type VerdictComparison, type ActivityMetric,
} from "@hybrid/core";
import { RADIUS, withAlpha } from "./kit";
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
 * IT IS THE BY-MUSCLE ROW, and deliberately so. Volume's "By muscle" list
 * (aurora/volume.tsx `MuscleRow`) is this app's answer to exactly this shape of
 * question — a measure, where it sits, and the landmarks it sits between — and
 * it had already settled every decision this page was re-litigating from
 * scratch. So the grammar is lifted whole rather than re-invented:
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
      {/* The head is "By muscle"'s, to the token: display-face title left, mono
          uppercase meta right, and no marker in front of either. */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
        <Text style={{ flex: 1, fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>
          {t("w.home.cmp.title")}
        </Text>
        <Text
          maxFontSizeMultiplier={FIXED_FONT_SCALE}
          numberOfLines={1}
          style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.caps, textTransform: "uppercase", color: C.ash }}
        >
          {headline}
        </Text>
      </View>

      <View style={{ marginTop: 4 }}>
        {rows.map((r) => {
          const col = tone(r.end);
          const bar = comparisonBar(r);
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
              style={{ paddingVertical: 12 }}
            >
              {/* NAME, FIGURE, CONTEXT — one baseline, MuscleRow's three slots. */}
              <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.sm, marginBottom: 8 }}>
                <Text
                  maxFontSizeMultiplier={FIXED_FONT_SCALE}
                  numberOfLines={1}
                  style={{ flex: 1, fontFamily: F.semi, fontSize: fs.note, color: C.chalk }}
                >
                  {t(verdictLabelKey(r.metric))}
                </Text>
                <Text
                  maxFontSizeMultiplier={FIXED_FONT_SCALE}
                  numberOfLines={1}
                  style={{ fontFamily: F.monoBold, fontSize: fs.note, color: col ?? C.chalk }}
                >
                  {move === null ? "—" : `${move > 0 ? "+" : move < 0 ? "−" : ""}${Math.abs(move)}%`}
                </Text>
                {move !== null && (
                  <Text
                    maxFontSizeMultiplier={FIXED_FONT_SCALE}
                    numberOfLines={1}
                    style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}
                  >
                    {signed(r.metric, r.diff)}
                  </Text>
                )}
              </View>

              {/* THE TRACK. A rail on `C.ink`, the bar filled from the axis, and
                  the axis itself cut into it as a notch — the muscle rail's
                  construction exactly. It renders only when there is a baseline
                  to draw an axis against: on a cold card the rows keep their
                  figures and draw nothing, rather than measure against a
                  baseline the card has already said it does not trust. */}
              {bar !== null && (
                <View style={{ height: 11, borderRadius: RADIUS.pill, backgroundColor: C.ink, overflow: "hidden" }}>
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
                  {/* The axis, notched in LAST so it survives the fill — the same
                      device MEV and MRV use over there. */}
                  <View style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 2, backgroundColor: withAlpha(C.chalk, ALPHA.rim) }} />
                </View>
              )}

              {/* THE TWO FIGURES, pinned left in equal columns — MEV / MAV / MRV
                  down there, AVG / NOW up here, and for the same reason: the
                  values line up down the whole list instead of floating at two
                  different indents. The label is the quiet half and the figure
                  the loud one, exactly as the landmark scale sets it. */}
              <View style={{ flexDirection: "row", marginTop: 8 }}>
                {([
                  ["w.home.cmp.avg", move === null ? null : r.baseline],
                  ["w.home.cmp.now", r.value],
                ] as const).map(([key, val]) => (
                  <View key={key} style={{ flex: 1 }}>
                    {val !== null && (
                      <Text
                        maxFontSizeMultiplier={FIXED_FONT_SCALE}
                        numberOfLines={1}
                        style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, color: C.ash }}
                      >
                        {t(key)} <Text style={{ fontSize: fs.micro, color: C.chalk }}>{fmt(r.metric, val)}</Text>
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
