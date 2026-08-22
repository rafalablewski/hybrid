/**
 * THE LIFT'S HISTORY — every session this lift was trained, at its estimated
 * max, oldest to newest, with the newest lit.
 *
 * WHY IT EXISTS. Two panels of the summary had a subject and no instrument: the
 * record ("75 kg", a trophy and a rotating gradient) and the deeper read (four
 * label-and-value rows). A panel is a whole screen, so a panel with nothing to
 * draw is a screen of ink — which is exactly what shipped, and what the
 * reporter photographed. The fix is not to shrink the panel; it is to give it
 * the picture the figure was always implying.
 *
 * A record is only legible AS A HISTORY. "70 × 8" says nothing on its own; the
 * same figure standing above fourteen months of bars that never reached it is
 * the thing worth looking at, and the thing worth posting.
 *
 * THE BARS ARE THE PICTURE'S TEXT ALTERNATIVE TOO: the caller states the same
 * delta in words beneath, so nothing here is carried by colour alone.
 */
import { View, Text } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { fmtWeight, type E1rmPoint, type WeightUnit } from "@hybrid/core";
import { useTheme } from "../../lib/theme";
import { fs, tracking, F } from "../../lib/ui";

/** Below this the bars are not a trend, they are two marks — the caller shows
 *  its rows instead. Same floor SIGNATURE_MIN_BARS applies to the signature. */
export const HISTORY_MIN_POINTS = 3;
/** The shortest a bar may draw, so a session at the series' floor is still a
 *  session rather than a gap in the row. */
const FLOOR = 8;
/** More than this and the bars stop separating; the oldest are dropped, because
 *  the RECENT shape is what a record is read against. */
const MAX_BARS = 26;

export function LiftHistory({
  points,
  width,
  height,
}: {
  points: E1rmPoint[];
  width: number;
  height: number;
}) {
  const C = useTheme().palette;
  if (points.length < HISTORY_MIN_POINTS) return null;
  const shown = points.slice(-MAX_BARS);
  const max = Math.max(...shown.map((p) => p.e1rm), 1);
  const min = Math.min(...shown.map((p) => p.e1rm));
  // The floor is the series' own minimum, not zero: every e1RM for one lift
  // sits in a narrow band, so a zero-based axis would draw a flat wall and hide
  // the only thing the panel is about.
  const range = max - min || 1;
  const slot = width / shown.length;
  const barW = Math.max(2, slot - 3);
  const best = Math.max(...shown.map((p) => p.e1rm));

  return (
    <View>
      <Svg width={width} height={height}>
        {shown.map((p, i) => {
          const h = FLOOR + ((p.e1rm - min) / range) * (height - FLOOR - 2);
          const last = i === shown.length - 1;
          return (
            <Rect
              key={`${p.date}-${i}`}
              x={i * slot}
              y={height - h}
              width={barW}
              height={h}
              rx={1.5}
              fill={last || p.e1rm >= best ? C.lime : C.chalk}
              fillOpacity={last ? 1 : p.e1rm >= best ? 0.55 : 0.3}
            />
          );
        })}
      </Svg>
    </View>
  );
}

/**
 * THE SESSION'S OWN EXERCISES, COMPARED — the heaviest working set of each.
 *
 * WHY: `LiftHistory` needs a past to plot, and a lift trained twice has none.
 * The premium panel then had a figure and one row on a whole screen, which is
 * the thin panel this exists to fill. What ALWAYS exists for a strength session
 * is the session itself, so the panel compares what it did: which lift was
 * actually the big one today. That is the question the figure above it — an
 * estimated max belonging to one exercise — already started asking.
 *
 * The scale is the session's own heaviest set, so the bars read as "against the
 * biggest thing you lifted today" rather than against a number off-screen.
 */
export function ExerciseTops({
  tops,
  width,
  height,
  units,
  locale,
}: {
  tops: { exercise: string; loadKg: number }[];
  width: number;
  height: number;
  units: WeightUnit;
  locale?: string;
}) {
  const C = useTheme().palette;
  if (tops.length === 0 || width <= 0 || height <= 0) return null;
  const ranked = [...tops].sort((a, b) => b.loadKg - a.loadKg).slice(0, MAX_BARS);
  const max = Math.max(...ranked.map((r) => r.loadKg), 1);
  const slot = width / ranked.length;
  const barW = Math.max(2, slot - 6);

  return (
    <View>
      <Svg width={width} height={height}>
        {ranked.map((r, i) => {
          const h = FLOOR + (r.loadKg / max) * (height - FLOOR - 2);
          return (
            <Rect
              key={r.exercise}
              x={i * slot}
              y={height - h}
              width={barW}
              height={h}
              rx={1.5}
              fill={i === 0 ? C.lime : C.chalk}
              fillOpacity={i === 0 ? 1 : 0.34}
            />
          );
        })}
      </Svg>
      {/* Named and figured beneath, so the bars are never the only statement —
          the same rule the muscle ledger follows under its figure. */}
      <View style={{ flexDirection: "row", marginTop: 6 }}>
        {ranked.map((r) => (
          <View key={r.exercise} style={{ width: slot, paddingRight: 4 }}>
            <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, color: C.ash, textTransform: "uppercase" }}>
              {r.exercise}
            </Text>
            <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.chalk }}>
              {fmtWeight(r.loadKg, units, undefined, locale)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
