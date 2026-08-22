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
import { View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import type { E1rmPoint } from "@hybrid/core";
import { useTheme } from "../../lib/theme";

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
