import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View, type StyleProp, type TextStyle } from "react-native";
import { durations, numericDiff, numericRolls } from "@hybrid/core";
import { useReducedMotion } from "../../lib/use-reduced-motion";

/**
 * A FIGURE THAT ROLLS to its new value instead of being swapped for it — the
 * mobile half of SwiftUI's `contentTransition(.numericText())`, and the twin of
 * apps/web/components/aurora/rolling-number.tsx.
 *
 * This is a training app, so numbers changing IS the content: a weight going
 * 80 → 82.5, a rest clock falling, a macro total climbing as the day is logged.
 * Every one of those was a plain re-render — the old string replaced by the new
 * one in a single frame, with nothing to say which way it moved.
 *
 * WHAT CHANGED is decided in @hybrid/core `numericDiff`, shared with web,
 * because the interesting part is the diff and not the animation: which columns
 * kept their identity, which are new, and which way the VALUE moved. Only the
 * changed digits travel; a column that is still a 2 stays put, punctuation
 * never travels, and a figure that changed SHAPE ("—" becoming a weight) does
 * not roll at all — that is one thing replaced by another, not one value
 * becoming the next.
 *
 * Reduce Motion SUBSTITUTES: the digit still changes, it simply changes without
 * travelling. Never an instant cut of the update itself.
 */
export function RollingNumber({
  value,
  style,
  align = "left",
  maxFontSizeMultiplier,
}: {
  /** The formatted figure, exactly as it should read. */
  value: string;
  style?: StyleProp<TextStyle>;
  /** Which way the row packs — a right-aligned figure keeps its last digit
   *  pinned as it grows a column. */
  align?: "left" | "right" | "center";
  /** The Dynamic Type ceiling, passed straight to every cell.
   *
   *  A figure in a COLUMN needs one: the ledger runs four of them across a
   *  ~73dp column, where "1675/2325" already sits within a few points of the
   *  edge at 100 %, and the plain `<Text>` it replaced carried
   *  `FIXED_FONT_SCALE`. Left off, this component silently removed a clamp its
   *  caller had. A figure with a row to itself (the picker's hero) still wants
   *  none — it should grow with the reader's setting. */
  maxFontSizeMultiplier?: number;
}) {
  const prev = useRef<string | null>(null);
  const [, force] = useState(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    prev.current = value;
    force((n) => n + 1);
  }, [value]);

  const from = prev.current;
  const roll = numericRolls(from, value) && !reduced;
  const { cells, dir } = numericDiff(from ?? value, value);

  return (
    // The whole figure is ONE accessible string. Without this it reads out
    // character by character ("eight", "two", "point", "five"), which is worse
    // than the swap this replaces.
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={value}
      style={{ flexDirection: "row", justifyContent: align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start" }}
    >
      {cells.map((c, i) =>
        roll && c.rolls && c.changed ? (
          <RollCell key={`${c.key}:${c.char}:${i}`} from={c.prev ?? ""} to={c.char} dir={dir} style={style} max={maxFontSizeMultiplier} />
        ) : (
          <Text key={`${c.key}:${i}`} maxFontSizeMultiplier={maxFontSizeMultiplier} style={style}>{c.char}</Text>
        ),
      )}
    </View>
  );
}

/**
 * One column mid-turn. Both faces sit in the same box — the outgoing one
 * absolutely positioned over the incoming one — and the pair slides by exactly
 * the column's own measured height, so the wheel turns through its own glyph
 * rather than a guessed distance.
 *
 * On `durations.collapse`, not a spring: a digit travels its own height, and
 * overshooting a character out of its own box and back reads as a wobble.
 */
function RollCell({ from, to, dir, style, max }: { from: string; to: string; dir: 1 | -1 | 0; style?: StyleProp<TextStyle>; max?: number }) {
  const t = useRef(new Animated.Value(0)).current;
  const [h, setH] = useState(0);
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: durations.collapse, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [t]);
  // Up means the value went UP, so the old face exits upward and the new one
  // arrives from below.
  const sign = dir === 1 ? -1 : 1;
  const outY = t.interpolate({ inputRange: [0, 1], outputRange: [0, sign * h] });
  const inY = t.interpolate({ inputRange: [0, 1], outputRange: [-sign * h, 0] });
  return (
    <View style={{ overflow: "hidden" }} onLayout={(e) => setH(Math.round(e.nativeEvent.layout.height))}>
      {/* The INCOMING face is the one in flow: it defines the column's width and
          height, so a measurement is never needed before the first frame. */}
      <Animated.View style={{ transform: [{ translateY: inY }], opacity: t }}>
        <Text maxFontSizeMultiplier={max} style={style}>{to}</Text>
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { transform: [{ translateY: outY }], opacity: t.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}
      >
        <Text maxFontSizeMultiplier={max} style={style}>{from}</Text>
      </Animated.View>
    </View>
  );
}

export default RollingNumber;
