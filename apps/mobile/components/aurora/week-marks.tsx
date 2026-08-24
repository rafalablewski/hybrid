import { View, Text } from "react-native";
import { WEEKDAY_LABEL_KEYS, ALPHA, type WeekChapterDay } from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme, type Palette } from "../../lib/theme";
import { F, fs, space } from "../../lib/ui";
import { RADIUS, withAlpha } from "./kit";

/**
 * THE WEEK, AS SEVEN MARKS ON A SHARED BASELINE.
 *
 * DAY MARKS, NOT A BAR CHART — the session summary's instrument rule, which
 * this app applies everywhere: a bar is a rectangle standing in for a number
 * and says nothing about what kind of number it is. A day trained is a discrete
 * EVENT, so it draws as a mark, and the axis it is placed against is the
 * athlete's own busiest day.
 *
 * IT USED TO BE THREE DOT SIZES IN A ROW, which encoded the same fact in the
 * one channel the eye is worst at: area. Two marks 7dp and 10dp across are the
 * same mark to anyone not comparing them side by side, so a light week and a
 * heavy one drew nearly the same picture. Position on a shared baseline is the
 * channel people actually read — it is how the retired Trend view drew its
 * buckets before it went, and the argument outlived the screen — so the mark
 * now RISES with the day's load and the baseline is drawn for it to rise from.
 *
 * The encodings, unchanged from the strip it replaces so the two week readings
 * still agree: hue carries the KIND (chartreuse lifting, teal cardio-only), and
 * a rest day is a faint tick sitting ON the line rather than a mark floating
 * above nothing.
 *
 * ONE COMPONENT, TWO SCREENS. The week chapter in History and the week summary
 * behind it draw the identical instrument at the identical scale — `max` is the
 * busiest day across ALL weeks, passed in, so a Tuesday is the same height
 * wherever it appears. The same week drawn two ways, one tap apart, is the
 * drift this screen was rebuilt to end.
 */
export function WeekMarks({ days, max, dates }: {
  days: readonly WeekChapterDay[];
  max: number;
  /** Print the day of the month under each weekday letter. The summary does —
   *  it is a page about one week and the dates are part of naming it — and the
   *  chapter list does not, because the range in its own heading already says. */
  dates?: boolean;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: PLOT, gap: space.xs }}>
        {days.map((d) => (
          <View key={d.dateKey} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end" }}>
            <View style={{ height: rise(d, max), justifyContent: "flex-start" }}>
              <View
                style={{
                  width: d.load <= 0 ? TICK : DOT,
                  height: d.load <= 0 ? 2 : DOT,
                  borderRadius: RADIUS.pill,
                  backgroundColor: markColor(C, d),
                }}
              />
            </View>
          </View>
        ))}
      </View>
      {/* THE BASELINE — the axis the marks are placed against. It is the one
          line here that is information rather than chrome: without it a rest
          day's tick has nothing to sit on and a low day looks like a mistake. */}
      <View style={{ height: 1, backgroundColor: withAlpha(C.ash, ALPHA.line), marginTop: space.xxs }} />
      <View style={{ flexDirection: "row", gap: space.xs, marginTop: space.xs }}>
        {days.map((d, i) => (
          <View key={d.dateKey} style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{t(WEEKDAY_LABEL_KEYS[i]!).slice(0, 1)}</Text>
            {dates && (
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: withAlpha(C.ash, ALPHA.rim) }}>
                {Number(d.dateKey.slice(8, 10))}
              </Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

/** How tall the plot is. One value, used on both screens — a knob here would be
 *  two scales for one instrument. */
const PLOT = 40;
const DOT = 8;
const TICK = 6;

/** Where the day's mark sits. A trained day never sits ON the line (the floor
 *  keeps the lightest session visibly above a rest day), and the busiest day
 *  reaches the top of the plot. */
const rise = (d: WeekChapterDay, max: number) =>
  d.load <= 0 ? DOT : DOT + Math.round((PLOT - DOT * 2) * Math.min(1, d.load / Math.max(1, max)));

const markColor = (C: Palette, d: WeekChapterDay) =>
  d.load <= 0 ? withAlpha(C.ash, ALPHA.rim) : d.hasCardio && !d.hasStrength ? C.blue : C.lime;
