import { View, Text } from "react-native";
import Svg, { Path, Rect, Line, Circle } from "react-native-svg";
import type { SessionSpine } from "@hybrid/core";
import { useTheme, type Palette } from "../../lib/theme";
import { fs, tracking, F } from "../../lib/ui";

/**
 * THE SESSION'S TWO INSTRUMENTS, drawn from core's one spine model
 * (session-spine.ts) so the hero's curve and the work panel's bars can never
 * disagree about what a set weighed.
 *
 * Both are dependency-free SVG, the way every other chart in the app is drawn.
 * Neither carries an axis: at panel scale an axis costs more than it explains,
 * and the figures that matter are stated in words directly beneath.
 */

/** Height of the accumulation curve's plot, in dp. */
const CURVE_H = 132;
/** Height of the set spine's plot, in dp. */
const SPINE_H = 176;
/** Gap between exercise groups, in dp — the only thing separating them. */
const GROUP_GAP = 7;

/**
 * TONNAGE THROUGH THE SESSION — running total after each set.
 *
 * The x-axis is the SET INDEX, not the clock, and that is a correctness
 * decision rather than a simplification: a set carries the rest taken BEFORE
 * it, never its own duration, so placing sets on a timeline would be half
 * measurement and half guess at how long a set takes. Set order is exact.
 */
export function TonnageCurve({ spine, width }: { spine: SessionSpine; width: number }) {
  const C = useTheme().palette;
  const n = spine.cumulativeKg.length;
  if (n < 2 || spine.totalKg <= 0) return null;

  const top = spine.totalKg;
  const plot = CURVE_H - 10;
  const x = (i: number) => (i / (n - 1)) * width;
  const y = (kg: number) => plot - (kg / top) * (plot - 6);
  const line = spine.cumulativeKg.map((kg, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(kg).toFixed(1)}`).join(" ");

  return (
    <Svg width={width} height={CURVE_H}>
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

/**
 * THE SET SPINE — one bar per set, height by the load actually moved, grouped
 * by exercise with warm-ups ghosted and the heaviest working set lit.
 *
 * This is what replaced the signature panel: six bars with no axis, no scale
 * and no comparison, captioned "your session's shape". A ramp to a top single
 * now reads as a ramp and a straight-sets day reads as a wall, which is the
 * thing the old chart was gesturing at without ever saying.
 */
export function SetSpine({ spine, width }: { spine: SessionSpine; width: number }) {
  const C = useTheme().palette;
  const max = Math.max(...spine.bars.map((b) => b.loadKg), 1);
  const gaps = Math.max(0, spine.groups.length - 1) * GROUP_GAP;
  const slot = (width - gaps) / Math.max(1, spine.bars.length);
  const barW = Math.max(2, slot - 2);

  let x = 0;
  let group = 0;
  const rects = spine.bars.map((b, i) => {
    if (b.group !== group) {
      x += GROUP_GAP;
      group = b.group;
    }
    const h = 10 + (b.loadKg / max) * (SPINE_H - 18);
    const at = x;
    x += slot;
    return (
      <Rect
        key={i}
        x={at}
        y={SPINE_H - h}
        width={barW}
        height={h}
        rx={1.5}
        fill={b.top ? C.lime : C.chalk}
        fillOpacity={b.top ? 1 : b.warmup ? 0.16 : b.drop ? 0.28 : 0.42}
      />
    );
  });

  return (
    <View>
      <Svg width={width} height={SPINE_H}>{rects}</Svg>
      <GroupLabels C={C} spine={spine} slot={slot} />
    </View>
  );
}

/** The exercise names under the spine, each sitting over its own bars. A name
 *  too long for its group is clipped rather than wrapped: the row is a scale,
 *  and a scale whose height changes with the exercise names is not one. */
function GroupLabels({ C, spine, slot }: { C: Palette; spine: SessionSpine; slot: number }) {
  return (
    <View style={{ flexDirection: "row", marginTop: 6 }}>
      {spine.groups.map((g, i) => (
        <View key={`${g.exercise}-${i}`} style={{ width: g.count * slot + (i ? GROUP_GAP : 0), paddingRight: 4 }}>
          <Text
            numberOfLines={1}
            style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking(fs.nano, "label"), color: C.ash, textTransform: "uppercase" }}
          >
            {g.exercise}
          </Text>
        </View>
      ))}
    </View>
  );
}
