/**
 * THE HEART-RATE TRACE — the shape of the effort, not its average.
 *
 * WHY IT EXISTS. `Session.device` has always carried an average and a peak, and
 * the summary showed them as two numbers. Two numbers cannot tell a steady hour
 * from an interval session that averaged the same, which is the difference the
 * athlete actually did. The samples under those numbers have been uploaded by
 * the phone since the streams work landed and never once read back — the GET
 * has been complete the whole time, and nothing called it.
 *
 * MEASURED READS IN DEVICE BLUE. A wrist counted this; nothing here is modelled,
 * so nothing here wears the tilde or the chalk that a logged figure wears.
 *
 * THE ZONE GUIDES ARE THE AXIS. A heart-rate chart with no scale is a squiggle,
 * but a numbered axis at panel scale costs more than it explains. The five zone
 * edges ARE the meaningful gradations, so they are the horizontal rules — and
 * because they are drawn from the athlete's own measured max rather than from
 * 220-minus-age, the picture is relative to them and not to a population.
 */
import { View, Text } from "react-native";
import Svg, { Path, Line as SvgLine } from "react-native-svg";
import { ALPHA, type SessionStream } from "@hybrid/core";
import { useTheme } from "../../lib/theme";
import { fs, tracking, F } from "../../lib/ui";

/** The conventional zone edges, as a share of max — the same five `hrZoneSeconds`
 *  counts against, so the rules under the trace and the ledger beside it can
 *  never disagree about where a zone starts. */
export const ZONE_EDGES = [0.5, 0.6, 0.7, 0.8, 0.9] as const;

/** Below this a trace is a handful of dots, not a shape. */
export const TRACE_MIN_SAMPLES = 8;

/** Down to at most this many points before drawing — a 3 000-sample path is
 *  more nodes than a phone-width chart has pixels, and every one of them costs
 *  layout time on a screen that scrolls. */
const DRAW_MAX = 240;

export function HrTrace({
  stream,
  maxHr,
  width,
  height,
}: {
  stream: SessionStream;
  maxHr: number;
  width: number;
  height: number;
}) {
  const C = useTheme().palette;
  const n = stream.values.length;
  if (n < TRACE_MIN_SAMPLES || !(maxHr > 0) || width <= 0 || height <= 0) return null;

  // The floor is Z1's edge, not zero: a resting heart rate is not part of the
  // effort, and a zero-based axis spends half the panel drawing the gap to it.
  const lo = maxHr * ZONE_EDGES[0];
  const hi = Math.max(maxHr, ...stream.values);
  const span = hi - lo || 1;
  const step = Math.max(1, Math.ceil(n / DRAW_MAX));
  const first = stream.offsets[0] ?? 0;
  const last = stream.offsets[n - 1] ?? 1;
  const clock = last - first || 1;

  const pts: string[] = [];
  for (let i = 0; i < n; i += step) {
    const x = ((stream.offsets[i]! - first) / clock) * width;
    const y = height - ((Math.max(lo, stream.values[i]!) - lo) / span) * height;
    pts.push(`${pts.length ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  const line = pts.join(" ");

  return (
    <Svg width={width} height={height}>
      {ZONE_EDGES.map((e) => {
        const y = height - ((maxHr * e - lo) / span) * height;
        if (y < 0 || y > height) return null;
        return (
          <SvgLine key={e} x1={0} y1={y} x2={width} y2={y} stroke={C.line} strokeWidth={0.75} />
        );
      })}
      <Path d={`${line} L${width} ${height} L0 ${height} Z`} fill={C.blue} fillOpacity={0.11} />
      <Path d={line} fill="none" stroke={C.blue} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}
