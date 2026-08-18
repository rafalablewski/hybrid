import { type ReactNode } from "react";
import { View, Text } from "react-native";
import { RADIUS } from "./kit";
import { useTheme } from "../../lib/theme";
import { fs, space, F, PressScale as Pressable, MAX_FONT_SCALE, tracking } from "../../lib/ui";
import { STATE_OPACITY } from "@hybrid/core";

/**
 * THE MEASURE ROW — one measure, where it sits, and the figures it sits between.
 *
 * This is the shape Volume's "By muscle" list arrived at (14 sets, a rail, and
 * MEV / MAV / MRV underneath), and it turned out not to be about muscles at all:
 * the Progress card's comparison page asks the identical question of tonnage,
 * sessions, hours and distance — a measure, a mark on a scale, and the
 * landmarks that give the mark meaning. The second surface was built as a copy
 * of the first, which is the drift this file exists to end. Both read these
 * three pieces now, so a change to the rail's height, the head's type scale or
 * the landmark row's alignment lands on both screens or on neither.
 *
 * IT IS THREE PIECES, NOT ONE COMPONENT, because the two callers wrap them
 * differently and a single component would have grown a prop for each. Volume
 * puts the press target around the head and the rail only — its landmark cells
 * are their own controls, and a drawer of prose follows them; the comparison
 * page presses the whole row through to a breakdown sheet and has nothing after
 * it. Composing the pieces keeps both honest; a `pressWholeRow` boolean would
 * not have.
 *
 * WHAT LIVES HERE is the part that must never differ:
 *   • MeasureLine  — name, figure, context on ONE baseline at ONE size. It is
 *     a row's line, not a section head, and is named so the section-head
 *     ratchet does not have to spend a rung absorbing it.
 *   • MeasureTrack — the rail shell. The marks inside it are the caller's, and
 *     they must be: Volume draws a band, a ceiling tint, two notches and a
 *     target caret; the comparison page draws one bar off a centre axis.
 *   • MeasureScale — the landmark row, N equal columns, quiet label loud figure.
 *
 * WHAT DOES NOT is anything either screen alone knows: the geometry inside the
 * rail, what the figures mean, whether a cell is pressable.
 */

/**
 * NAME, FIGURE, CONTEXT — one baseline, three slots, and the sizing is the
 * point: the name and its headline figure are the SAME size, which is what lets
 * a list of these scan as a table without being drawn as one. The name takes
 * the display face because it names a thing; the figure takes mono-bold because
 * it is a figure; the context is a quiet mono caption and is optional.
 */
export function MeasureLine({
  name,
  figure,
  /** The figure's colour when it carries a mark. Chalk when null. */
  tone = null,
  context = null,
}: {
  name: string;
  figure: string;
  tone?: string | null;
  context?: string | null;
}) {
  const { palette: C } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.sm, marginBottom: 8 }}>
      <Text
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        numberOfLines={1}
        style={{ flex: 1, fontFamily: F.semi, fontSize: fs.note, color: C.chalk }}
      >
        {name}
      </Text>
      <Text
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        numberOfLines={1}
        style={{ fontFamily: F.monoBold, fontSize: fs.note, color: tone ?? C.chalk }}
      >
        {figure}
      </Text>
      {context !== null && (
        <Text
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          numberOfLines={1}
          style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}
        >
          {context}
        </Text>
      )}
    </View>
  );
}

/**
 * THE RAIL SHELL — a clipped track on `ink`, and nothing else. Every mark inside
 * is absolutely positioned by the caller, because the two callers measure
 * completely different things in it: Volume normalises sets onto a landmark
 * scale (`railX`), the comparison page maps a signed percentage onto a centre
 * axis. What they must share is the FIELD — its height, its radius and the
 * surface it sits on — so a rail is the same object on both screens.
 */
export function MeasureTrack({ children }: { children?: ReactNode }) {
  const { palette: C } = useTheme();
  return (
    <View style={{ height: 11, borderRadius: RADIUS.pill, backgroundColor: C.ink, overflow: "hidden" }}>
      {children}
    </View>
  );
}

export interface MeasureCell {
  key: string;
  /** The quiet half — MEV, MAV, MRV, AVG, NOW. */
  label: string;
  /** The loud half. */
  value: string;
  onPress?: () => void;
  selected?: boolean;
  /** Held back while a sibling cell is spotlighted. */
  dim?: boolean;
  a11yLabel?: string;
}

/**
 * THE LANDMARK ROW — N equal columns, pinned LEFT rather than spread, so the
 * values line up down the whole list instead of floating at three different
 * indents. The label is small and ash, the figure a rung up and chalk: a scale
 * is read as figures, and the labels are there to say which figure is which.
 *
 * A cell with `onPress` renders as a control (Volume's, which spotlight a band
 * across every row at once); without it, as plain type.
 */
export function MeasureScale({ cells, tone = null }: { cells: MeasureCell[]; tone?: string | null }) {
  const { palette: C } = useTheme();
  return (
    <View style={{ flexDirection: "row", marginTop: 8 }}>
      {cells.map((c) => {
        const body = (
          <Text
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            numberOfLines={1}
            style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, color: c.selected ? (tone ?? C.chalk) : C.ash }}
          >
            {c.label} <Text style={{ fontSize: fs.micro, color: C.chalk }}>{c.value}</Text>
          </Text>
        );
        if (!c.onPress) return <View key={c.key} style={{ flex: 1 }}>{body}</View>;
        return (
          <Pressable
            key={c.key}
            onPress={c.onPress}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityState={{ selected: !!c.selected }}
            accessibilityLabel={c.a11yLabel}
            style={{ flex: 1, opacity: c.dim ? STATE_OPACITY.disabled : 1 }}
          >
            {body}
          </Pressable>
        );
      })}
    </View>
  );
}

/** The row's own vertical rhythm — the gap BETWEEN rows is what groups one, so
 *  it lives here rather than in either caller. */
export const MEASURE_ROW_PAD = 12;
