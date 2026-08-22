/**
 * THE SESSION'S INSTRUMENTS — three forms, and none of them is a bar.
 *
 * WHY THE BARS WENT. Every chart on the summary had converged on the same
 * shape: a row of rectangles. The set spine, the lift history and the
 * per-exercise comparison were three different questions drawn as one picture,
 * and a bar is the least specific answer available — it is a rectangle standing
 * in for a number, so it says nothing about what KIND of thing the number is.
 * Four of them on one scroll read as filler, which is exactly what they were.
 *
 * THE SYSTEM THAT REPLACES THEM. Each form belongs to a kind of fact, and the
 * form is chosen by the fact rather than by habit:
 *
 *   TRACE     a continuous quantity over time — it never stopped existing
 *             between samples, so it is drawn as an unbroken line.
 *             (the tonnage curve, the heart-rate trace — session-spine /
 *             session-trace, unchanged)
 *
 *   PATH      DISCRETE EVENTS in order — each one happened at a moment and had
 *             a value, so each is a MARK, placed at its value and joined to the
 *             next. A ramp reads as a climb, straight sets as a level run, a
 *             drop set as a fall. A bar row flattens all three into "some
 *             rectangles of similar height".
 *             (`SetPath`, `LiftTrend`)
 *
 *   RANGE     A HANDFUL OF THINGS COMPARED. A dot on a shared axis, one row
 *             each. The eye compares POSITIONS, which is the comparison being
 *             asked for; a bar adds length, which encodes the same number
 *             twice and buries the differences at the top of the scale where
 *             they matter most.
 *             (`EffortRange`)
 *
 *   RIBBON    PARTS OF ONE WHOLE — one continuous strip cut into segments,
 *             because the parts sum to a thing that exists (a session's
 *             minutes, a run's distance). Five separate meters assert five
 *             separate quantities and make the reader add them up.
 *             (`Ribbon`)
 *
 * ONE HUE PER INSTRUMENT, varying in opacity — intensity reads as intensity.
 * A rainbow scale would make five zones look like five unrelated categories.
 */
import { View, Text } from "react-native";
import Svg, { Path, Circle, Line as SvgLine } from "react-native-svg";
import { ALPHA, fmtWeight, type E1rmPoint, type WeightUnit } from "@hybrid/core";
import { useTheme, txt } from "../../lib/theme";
import { withAlpha } from "./field";
import { RADIUS } from "./kit";
import { fs, tracking, F, TABULAR, ty } from "../../lib/ui";

/** The mark for one logged set. Big enough to hit, small enough to crowd. */
const DOT = 3.1;
/** The top set wears a larger mark and a ring — it is the one you would name. */
const DOT_TOP = 4.6;
/** Gap between exercise runs, in plot units. */
const RUN_GAP = 9;
/** A path never draws its marks flat against the floor or the ceiling. */
const PAD_Y = 7;

/* ── PATH ─────────────────────────────────────────────────────────────────── */

export interface SetMark {
  loadKg: number;
  warmup: boolean;
  drop: boolean;
  top: boolean;
  group: number;
}

/**
 * EVERY SET, AS A PATH. One mark per set at the load it actually moved, joined
 * within an exercise and broken between them.
 *
 * The joining is the whole value: five sets at one weight is a flat run, a ramp
 * is a climb, a drop set falls away from the set above it. Drawn as bars those
 * three sessions were the same picture with slightly different heights.
 */
export function SetPath({
  marks,
  labels,
  width,
  height,
}: {
  marks: SetMark[];
  labels: { exercise: string; count: number }[];
  width: number;
  height: number;
}) {
  const C = useTheme().palette;
  if (marks.length === 0 || width <= 0 || height <= 0) return null;

  const max = Math.max(...marks.map((m) => m.loadKg), 1);
  const min = Math.min(...marks.filter((m) => m.loadKg > 0).map((m) => m.loadKg), max);
  // The floor is the session's own lightest working load, not zero: every set
  // of one exercise sits in a narrow band, and a zero floor spends the panel
  // drawing the gap down to a weight nobody lifted.
  const span = max - min || max || 1;
  const runs = labels.length || 1;
  const slots = marks.length + (runs - 1) * (RUN_GAP / 10);
  const step = width / Math.max(1, slots);
  const y = (kg: number) => height - PAD_Y - ((kg - min) / span) * (height - PAD_Y * 2);

  // Lay the marks out, breaking the line between exercises.
  const pts: { x: number; y: number; m: SetMark }[] = [];
  let x = step / 2;
  let group = marks[0]!.group;
  for (const m of marks) {
    if (m.group !== group) {
      x += step * (RUN_GAP / 10);
      group = m.group;
    }
    pts.push({ x, y: y(m.loadKg), m });
    x += step;
  }

  const runPaths: string[] = [];
  let cur: string[] = [];
  let curGroup = pts[0]?.m.group;
  for (const pt of pts) {
    if (pt.m.group !== curGroup) {
      if (cur.length > 1) runPaths.push(cur.join(" "));
      cur = [];
      curGroup = pt.m.group;
    }
    cur.push(`${cur.length ? "L" : "M"}${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`);
  }
  if (cur.length > 1) runPaths.push(cur.join(" "));

  return (
    <View>
      <Svg width={width} height={height}>
        {/* The floor is the lightest working set, so it is drawn — an unmarked
            baseline invites the reading "this bar is twice that one". */}
        <SvgLine x1={0} y1={height - PAD_Y} x2={width} y2={height - PAD_Y} stroke={C.line} strokeWidth={0.75} />
        {runPaths.map((d, i) => (
          <Path key={i} d={d} fill="none" stroke={C.chalk} strokeOpacity={0.34} strokeWidth={1.1} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {pts.map((pt, i) => {
          const { m } = pt;
          if (m.top) {
            return (
              <Circle key={i} cx={pt.x} cy={pt.y} r={DOT_TOP} fill={C.lime} stroke={C.lime} strokeOpacity={0.3} strokeWidth={3.4} />
            );
          }
          // A warm-up is HOLLOW rather than faint: it is a different kind of
          // set, not a quieter one, and opacity alone reads as "less important"
          // to anyone who cannot separate two greys.
          return m.warmup ? (
            <Circle key={i} cx={pt.x} cy={pt.y} r={DOT} fill="none" stroke={C.ash} strokeWidth={1} />
          ) : (
            <Circle key={i} cx={pt.x} cy={pt.y} r={DOT} fill={C.chalk} fillOpacity={m.drop ? 0.45 : 0.85} />
          );
        })}
      </Svg>
      <View style={{ flexDirection: "row", marginTop: 6 }}>
        {labels.map((g, i) => (
          <View key={`${g.exercise}-${i}`} style={{ width: g.count * step + (i ? step * (RUN_GAP / 10) : 0), paddingRight: 4 }}>
            <Text numberOfLines={1} style={ty(C, "kicker")}>
              {g.exercise}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * A LIFT'S HISTORY, AS A CEILING BEING BROKEN.
 *
 * The figure alone says nothing — "75 kg" is a number. The same figure standing
 * above every session that never reached it is the thing worth looking at, and
 * the thing worth posting. So the standing best is drawn as a RULE across the
 * plot and today's mark sits above it: the picture is the ceiling breaking, not
 * a row of rectangles of which the last is tallest.
 */
export function LiftTrend({
  points,
  width,
  height,
}: {
  points: E1rmPoint[];
  width: number;
  height: number;
}) {
  const C = useTheme().palette;
  if (points.length < 2 || width <= 0 || height <= 0) return null;
  const vals = points.map((p) => p.e1rm);
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const span = max - min || 1;
  const step = width / Math.max(1, points.length - 1);
  const y = (v: number) => height - PAD_Y - ((v - min) / span) * (height - PAD_Y * 2);

  // The standing best BEFORE today — the line today either cleared or did not.
  const prior = vals.slice(0, -1);
  const ceiling = prior.length ? Math.max(...prior) : null;
  const lastV = vals[vals.length - 1]!;
  const cleared = ceiling != null && lastV > ceiling;

  const line = points.map((p, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)} ${y(p.e1rm).toFixed(1)}`).join(" ");

  return (
    <Svg width={width} height={height}>
      {ceiling != null && (
        <SvgLine
          x1={0}
          y1={y(ceiling)}
          x2={width}
          y2={y(ceiling)}
          stroke={C.ash}
          strokeWidth={0.9}
          strokeDasharray="3 3"
        />
      )}
      <Path d={`${line} L${width} ${height} L0 ${height} Z`} fill={C.lime} fillOpacity={0.08} />
      <Path d={line} fill="none" stroke={C.lime} strokeOpacity={0.65} strokeWidth={1.3} strokeLinejoin="round" />
      {points.map((p, i) => {
        const last = i === points.length - 1;
        if (!last) return <Circle key={i} cx={i * step} cy={y(p.e1rm)} r={2.2} fill={C.chalk} fillOpacity={0.4} />;
        return (
          <Circle
            key={i}
            cx={i * step}
            cy={y(p.e1rm)}
            r={DOT_TOP}
            fill={cleared ? C.lime : C.chalk}
            stroke={cleared ? C.lime : C.chalk}
            strokeOpacity={0.28}
            strokeWidth={3.6}
          />
        );
      })}
    </Svg>
  );
}

/* ── RANGE ────────────────────────────────────────────────────────────────── */

/**
 * A HANDFUL OF THINGS ON ONE AXIS. Each exercise is a dot at its heaviest set,
 * on a shared scale, one row each.
 *
 * A bar would encode the load twice — once as position, once as length — and
 * the doubling is not free: it puts every difference at the far end of the
 * scale, where a 75 and a 70 are two nearly identical rectangles. Position
 * alone separates them, which is the comparison the panel exists to make.
 */
export function EffortRange({
  rows,
  units,
  locale,
  width,
}: {
  rows: { exercise: string; loadKg: number }[];
  units: WeightUnit;
  locale?: string;
  width: number;
}) {
  const C = useTheme().palette;
  if (rows.length === 0 || width <= 0) return null;
  const ranked = [...rows].sort((a, b) => b.loadKg - a.loadKg);
  const max = Math.max(...ranked.map((r) => r.loadKg));
  const min = Math.min(...ranked.map((r) => r.loadKg));
  const span = max - min || max || 1;
  // The axis runs from the lightest to the heaviest of THIS session, so the
  // spread fills the panel instead of huddling at one end of an arbitrary zero.
  const at = (kg: number) => ((kg - min) / span) * 100;

  return (
    <View style={{ width }}>
      {ranked.map((r, i) => {
        const lead = i === 0;
        return (
          <View key={r.exercise} style={{ paddingVertical: 7, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
            <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
              <Text numberOfLines={1} style={[ty(C, "kicker", lead ? C.chalk : C.ash), { flex: 1 }]}>
                {r.exercise}
              </Text>
              <Text style={[TABULAR, { fontFamily: F.black, fontSize: fs.body, color: lead ? txt(C, C.lime) : C.chalk }]}>
                {fmtWeight(r.loadKg, units, undefined, locale)}
              </Text>
            </View>
            {/* The axis is a hairline the dot sits ON, never a track it fills. */}
            <View style={{ height: 9, justifyContent: "center", marginTop: 3 }}>
              <View style={{ height: 1, backgroundColor: C.line }} />
              <View
                style={{
                  position: "absolute",
                  left: `${at(r.loadKg)}%`,
                  width: lead ? 9 : 7,
                  height: lead ? 9 : 7,
                  borderRadius: RADIUS.pill,
                  marginLeft: lead ? -4.5 : -3.5,
                  backgroundColor: lead ? C.lime : C.chalk,
                  opacity: lead ? 1 : 0.55,
                }}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

/* ── RIBBON ───────────────────────────────────────────────────────────────── */

export interface RibbonPart {
  key: string;
  label: string;
  value: number;
  /** the readout beside the label, already formatted ("36:12", "4:52 /km") */
  text: string;
  /** 0–1 within the instrument's single hue; 1 is the part being pointed at */
  weight: number;
  /** the one part worth lighting — the longest zone, the fastest split */
  lead?: boolean;
}

/**
 * PARTS OF ONE WHOLE — a single strip, cut.
 *
 * Five zone meters asserted five separate quantities and left the reader to add
 * them back into the session they came from. The session's minutes ARE one
 * thing; the zones are cuts in it. So there is one strip, and the legend under
 * it names each cut. Nothing is carried by colour alone: every segment is named
 * and figured beneath.
 */
export function Ribbon({
  parts,
  hue,
  width,
  height = 12,
}: {
  parts: RibbonPart[];
  hue: string;
  width: number;
  height?: number;
}) {
  const C = useTheme().palette;
  const shown = parts.filter((p) => p.value > 0);
  const total = shown.reduce((n, p) => n + p.value, 0);
  if (shown.length === 0 || total <= 0 || width <= 0) return null;

  return (
    <View>
      <View style={{ flexDirection: "row", height, borderRadius: RADIUS.pill, overflow: "hidden", backgroundColor: withAlpha(C.chalk, ALPHA.wash) }}>
        {shown.map((p) => (
          <View
            key={p.key}
            style={{
              // A part that exists always draws: "a little" must not render as
              // "none", or the strip and the legend disagree.
              flexGrow: Math.max(p.value / total, 0.02),
              flexBasis: 0,
              backgroundColor: hue,
              opacity: p.lead ? 1 : 0.22 + p.weight * 0.55,
            }}
          />
        ))}
      </View>
      <View style={{ marginTop: 9, gap: 3 }}>
        {shown.map((p) => (
          <View key={p.key} style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 7, flex: 1, minWidth: 0 }}>
              <View style={{ width: 6, height: 6, borderRadius: RADIUS.pill, backgroundColor: hue, opacity: p.lead ? 1 : 0.22 + p.weight * 0.55 }} />
              <Text numberOfLines={1} style={[ty(C, "kicker", p.lead ? C.chalk : C.ash), { flex: 1 }]}>
                {p.label}
              </Text>
            </View>
            <Text style={[TABULAR, { fontFamily: F.mono, fontSize: fs.caption, color: p.lead ? C.chalk : C.ash }]}>{p.text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/* ── TRACE (spatial) ──────────────────────────────────────────────────────── */

/**
 * THE ROUTE, AS A SHAPE — where you went, drawn and nothing else.
 *
 * No tiles, no basemap, no network, no attribution: the streets are somebody
 * else's data and somebody else's licence, and they are not the part anyone
 * recognises. The SHAPE of a route is — a loop, an out-and-back, the lap you
 * run four times — and it reads at thumbnail size, which is the test that
 * matters for the thing people post.
 *
 * Core's `routePoints` has already corrected longitude for latitude and centred
 * the shorter axis, so this only scales a unit box into the plot.
 */
export function RouteTrace({
  points,
  width,
  height,
}: {
  points: { x: number; y: number }[];
  width: number;
  height: number;
}) {
  const C = useTheme().palette;
  if (points.length < 2 || width <= 0 || height <= 0) return null;
  const inset = DOT_TOP + 2;
  const w = Math.max(1, width - inset * 2);
  const h = Math.max(1, height - inset * 2);
  const side = Math.min(w, h);
  const ox = inset + (w - side) / 2;
  const oy = inset + (h - side) / 2;
  const at = (p: { x: number; y: number }) => ({ x: ox + p.x * side, y: oy + p.y * side });
  const d = points
    .map((p, i) => {
      const q = at(p);
      return `${i ? "L" : "M"}${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
    })
    .join(" ");
  const start = at(points[0]!);
  const end = at(points[points.length - 1]!);

  return (
    <Svg width={width} height={height}>
      <Path d={d} fill="none" stroke={C.blue} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      {/* Where it began and where it ended — on a loop these land together, and
          that IS the reading. */}
      <Circle cx={start.x} cy={start.y} r={DOT} fill={C.ink} stroke={C.blue} strokeWidth={1.4} />
      <Circle cx={end.x} cy={end.y} r={DOT_TOP} fill={C.lime} />
    </Svg>
  );
}
