import { View, Text } from "react-native";
import {
  comparisonBar, verdictLabelKey,
  type VerdictComparison, type ActivityMetric,
} from "@hybrid/core";
import { RADIUS } from "./kit";
import { useTheme, txt } from "../../lib/theme";
import { leading, fs, F, PressScale as Pressable, FIXED_FONT_SCALE, tracking } from "../../lib/ui";

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
 * IT IS A PAGE, NOT A SHEET, and that is the whole shape of it. A sheet is for a
 * DETOUR — narrow to a sport, open a session, come back — which is why the
 * breakdown is one. The comparison is not a detour; it is the same four figures
 * said the other way, so it belongs beside them, at the same level, reachable
 * without leaving the screen. The sheet stays one layer down, for what a single
 * figure is made of.
 *
 * ONE AXIS, AND THE AXIS IS THE ATHLETE'S OWN AVERAGE — not zero. Bar length is
 * per cent of that average, because per cent is the only unit tonnage (kg), a
 * session COUNT, hours (minutes) and distance (km) can share; a shared VALUE
 * axis across those four is not one axis, it is four pretending. Paired
 * now-against-average bars would have been eight marks in a card this size to
 * say the thing one diverging bar says: the difference is the subject, so the
 * chart draws the difference and nothing else.
 *
 * THE SCALE IS FIXED (core's COMPARE_SCALE_PCT), not fitted to the week's
 * biggest mover. Fitting makes a +4% week draw exactly the same picture as a
 * +40% one, so the chart looks identical every week and length stops carrying
 * magnitude at a glance. Past the scale the bar PINS and the figure keeps
 * counting — the same honesty the card already applies past VERDICT_PCT_CEILING,
 * where it prints the step instead of a four-digit percentage.
 *
 * COLOUR STILL MARKS ONLY THE TWO ENDS, and this is the rule a chart most wants
 * to break. Every rise going chartreuse here would light tonnage's +18% on this
 * page and leave it ash on the page one DRAG away — the same week, two readings,
 * and the athlete has no way to know which is the lie. Direction is already
 * carried by which side of the axis the bar sits on, which is a channel this
 * page has and the figure row does not.
 *
 * THE FIGURES ARE NOT META. Every line but the percentage once sat at nano or
 * micro in ash — the label, both values, the difference — which is the styling
 * of a meta row under a session, and made the one line carrying what an athlete
 * actually did the least legible thing in the row. The STEP reads in chalk at
 * body size now: it is the training, not a footnote to it. The percentage keeps
 * the big slot because it is the row's subject, and everything else is a rung
 * below it rather than three rungs below it.
 *
 * A ROW IS ONE OBJECT, and the spacing is what says so: the gap BETWEEN rows is
 * more than twice the gaps inside one. At 16 against 10 the separation barely
 * exceeded the joins, and four rows read as twelve loose lines — the grouping
 * has to come from whitespace here, because this card does not draw rules
 * between things.
 *
 * NO TRACK BEHIND THE BAR. Only the axis is drawn, because only the axis is
 * information. A rail behind every bar is four bars of chrome on a card whose
 * columns already separate by whitespace — the same reasoning that retired the
 * column dividers, the GroupMark hairline and the drawer's border.
 *
 * A ROW OPENS WHAT ITS COLUMN OPENS. Pressing a row raises the same breakdown
 * sheet the column press raises on page one, with the same groups and the same
 * sessions inside. Two ways in, one destination, or the second page is a dead
 * end wearing a chart.
 */

export default function ActivityCompare({
  rows,
  headline,
  fmt,
  onOpen,
  t,
}: {
  rows: VerdictComparison[];
  /** The one line that says what the AXIS is — core's `comparisonHeadKey`,
   *  already translated. The WINDOW is deliberately absent: the section head
   *  above the card names it, and printing it twice is the redundancy the
   *  Progress cluster's sweep exists to catch. */
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
   *  magnitude goes through the metric's own formatter, so the difference and
   *  the figures it sits under round the same way. */
  const signed = (metric: ActivityMetric, diff: number) => {
    const mag = fmt(metric, Math.abs(diff));
    return diff < 0 ? `− ${mag}` : `+ ${mag}`;
  };

  return (
    <View>
      {/* The head names the axis. Mono uppercase ash — the card's own in-card
          kicker idiom, not a section head: this sits INSIDE a card that already
          has one above it. */}
      <View style={{ paddingBottom: 11, borderBottomWidth: 1, borderBottomColor: C.line }}>
        <Text
          maxFontSizeMultiplier={FIXED_FONT_SCALE}
          style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }}
        >
          {headline}
        </Text>
      </View>

      {rows.map((r) => {
        const col = tone(r.end);
        const bar = comparisonBar(r);
        const pct = r.deltaPct;
        return (
          <Pressable
            key={r.metric}
            onPress={() => onOpen?.(r.metric)}
            disabled={!onOpen}
            accessibilityRole="button"
            accessibilityLabel={
              pct === null
                ? t("w.home.cmp.aRowFlat")
                  .replace("{m}", t(verdictLabelKey(r.metric)))
                  .replace("{b}", fmt(r.metric, r.value))
                : t("w.home.cmp.aRow")
                  .replace("{m}", t(verdictLabelKey(r.metric)))
                  .replace("{p}", `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)}%`)
                  .replace("{a}", fmt(r.metric, r.baseline))
                  .replace("{b}", fmt(r.metric, r.value))
                  .replace("{d}", signed(r.metric, r.diff))
            }
            accessibilityHint={onOpen ? t("w.home.act.hint") : undefined}
            style={{ paddingTop: 24, paddingHorizontal: 5, marginHorizontal: -5, borderRadius: RADIUS.inner }}
          >
            {/* THE MOVE TAKES THE BIG SLOT. Page one already carries the totals;
                this page exists to say which way they went, so the signed per
                cent is the row's subject and the largest figure in it. */}
            <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
              <Text
                maxFontSizeMultiplier={FIXED_FONT_SCALE}
                numberOfLines={1}
                style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: tracking.label, textTransform: "uppercase", color: col ?? C.ash }}
              >
                {t(verdictLabelKey(r.metric))}
              </Text>
              <Text
                maxFontSizeMultiplier={FIXED_FONT_SCALE}
                numberOfLines={1}
                style={{ fontFamily: F.mono, fontSize: fs.heading, letterSpacing: tracking.display, color: col ?? C.chalk }}
              >
                {pct === null ? "—" : `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)}%`}
              </Text>
            </View>

            {/* THE BAR, off the shared axis. It renders only when there is a
                baseline to draw an axis against: on a cold card the rows keep
                their figures and draw nothing, rather than measure against a
                baseline the card has already said it does not trust. */}
            {bar !== null && (
              <View style={{ height: 10, marginTop: 10, flexDirection: "row", alignItems: "stretch" }}>
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  {bar < 0 && (
                    <View style={{
                      width: `${Math.abs(bar) * 100}%`, height: 10,
                      borderTopLeftRadius: RADIUS.mark, borderBottomLeftRadius: RADIUS.mark,
                      backgroundColor: col ?? C.ash,
                    }} />
                  )}
                </View>
                {/* The axis itself — the only furniture on this chart, and the
                    one piece of it that is information. */}
                <View style={{ width: 1, marginVertical: -5, backgroundColor: C.ash, opacity: 0.5 }} />
                <View style={{ flex: 1 }}>
                  {bar > 0 && (
                    <View style={{
                      width: `${bar * 100}%`, height: 10,
                      borderTopRightRadius: RADIUS.mark, borderBottomRightRadius: RADIUS.mark,
                      backgroundColor: col ?? C.ash,
                    }} />
                  )}
                </View>
              </View>
            )}

            {/* THE STEP, then the difference. "5h 14min → 6h 52min" is the card's
                own idiom for stating a move — the same arrow the verdict prints
                when a percentage past the ceiling stops being a measurement — so
                two figures ride one line and neither needs a "was" label to
                explain it. The difference in real units sits right: a per cent
                alone never says whether 31% is an hour or a minute, and the
                real figure is the one an athlete acts on. */}
            <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginTop: 10 }}>
              <Text
                maxFontSizeMultiplier={FIXED_FONT_SCALE}
                numberOfLines={1}
                style={{ flexShrink: 1, fontFamily: F.mono, fontSize: fs.body, lineHeight: leading(fs.body, "snug"), color: C.chalk }}
              >
                {pct === null ? fmt(r.metric, r.value) : `${fmt(r.metric, r.baseline)} → ${fmt(r.metric, r.value)}`}
              </Text>
              {pct !== null && (
                <Text
                  maxFontSizeMultiplier={FIXED_FONT_SCALE}
                  numberOfLines={1}
                  style={{ fontFamily: F.mono, fontSize: fs.body, lineHeight: leading(fs.body, "snug"), color: C.ash }}
                >
                  {signed(r.metric, r.diff)}
                </Text>
              )}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
