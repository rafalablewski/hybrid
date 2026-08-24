import { View, Text } from "react-native";
import Svg, { Path, Line, Circle } from "react-native-svg";
import type { SessionSpine } from "@hybrid/core";
import { useTheme } from "../../lib/theme";

/**
 * THE ACCUMULATION CURVE, drawn from core's spine model (session-spine.ts).
 *
 * A TRACE, in the instrument family's sense: running tonnage is a continuous
 * quantity — it did not stop existing between sets — so it is an unbroken line.
 * The SET SPINE that used to live here was a row of rectangles and has become
 * `SetPath` in session-instruments.tsx: sets are discrete events, and a mark
 * per event joined into a run says whether the session ramped, held or dropped.
 * A bar row said none of that.
 *
 * Dependency-free SVG, the way every chart in the app is drawn, and no axis: at
 * panel scale an axis costs more than it explains, and the figures that matter
 * are stated in words directly beneath.
 */

/**
 * DEFAULT plot heights, in dp. Both instruments now take a `height`, because a
 * panel is a fixed screen and the thing that should absorb its slack is the
 * INSTRUMENT, not a spacer: a chart that grows to fill the space reads as a
 * composed panel, and the same space left over reads as a hole. This is the
 * whole reason the first panel sequence emptied out.
 */
const CURVE_H = 132;

/**
 * TONNAGE THROUGH THE SESSION — running total after each set.
 *
 * The x-axis is the SET INDEX, not the clock, and that is a correctness
 * decision rather than a simplification: a set carries the rest taken BEFORE
 * it, never its own duration, so placing sets on a timeline would be half
 * measurement and half guess at how long a set takes. Set order is exact.
 */
export function TonnageCurve({ spine, width, height = CURVE_H }: { spine: SessionSpine; width: number; height?: number }) {
  const C = useTheme().palette;
  const n = spine.cumulativeKg.length;
  if (n < 2 || spine.totalKg <= 0) return null;

  const top = spine.totalKg;
  const plot = height - 10;
  const x = (i: number) => (i / (n - 1)) * width;
  const y = (kg: number) => plot - (kg / top) * (plot - 6);
  const line = spine.cumulativeKg.map((kg, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(kg).toFixed(1)}`).join(" ");

  return (
    <Svg width={width} height={height}>
      <Path d={`${line} L${width} ${plot} L0 ${plot} Z`} fill={C.lime} fillOpacity={0.1} />
      <Path d={line} fill="none" stroke={C.lime} strokeWidth={1.4} strokeLinejoin="round" />
      {/* One tick per set on the baseline: the curve says how much, the ticks
          say how many, and a warm-up is drawn without being counted. */}
      {spine.bars.map((b, i) => (
        <Line
          key={i}
          x1={x(i)}
          y1={plot}
          x2={x(i)}
          y2={plot + 6}
          stroke={b.top ? C.lime : C.chalk}
          strokeWidth={b.top ? 1.8 : 1}
          strokeOpacity={b.top ? 1 : b.warmup ? 0.22 : 0.5}
        />
      ))}
      <Line x1={0} y1={plot} x2={width} y2={plot} stroke={C.line} strokeWidth={1} />
      {spine.bars.map((b, i) => (b.top ? <Circle key={`t${i}`} cx={x(i)} cy={y(spine.cumulativeKg[i]!)} r={2.6} fill={C.lime} /> : null))}
    </Svg>
  );
}
