import { StyleSheet, View, Text, type StyleProp, type ViewStyle } from "react-native";
import { LABEL_GAP, type DurationParts } from "@hybrid/core";
import { useTheme, txt } from "../../lib/theme";
import { F, MAX_FONT_SCALE, TABULAR, fs, leading, space, tracking, ty } from "../../lib/ui";
import { ACard } from "./kit";

/**
 * THE SUMMARY WIDGET — one anatomy, and every block of a report is an instance
 * of it.
 *
 * A summary page is a set of readings, and the readings only look designed when
 * they are the SAME OBJECT repeated. The week report was assembled instead:
 * a floating section head above a card here, a bare figure on the ground there,
 * a stat row somewhere else — four arrangements of the same three parts, each
 * with its own spacing, and the eye reads that as approximate even when every
 * value on it is exact.
 *
 * SO THE ANATOMY IS FIXED, and there is exactly one of it:
 *
 *   NAME        the widget's structural label, wide-tracked caps, left
 *   FIGURE      the one number this block is about, with its unit annotating
 *               it and its change against the period before on the right
 *   BODY        the reading — rows, an instrument, records
 *
 * THREE RULES CARRY THE PRECISION, and they are the whole of it:
 *
 * ONE LEFT EDGE. The name, the figure and every row in the body start on the
 * same x. (The done receipt learned this the hard way — it ran three left edges
 * at once and read as ragged, and nobody could say why.)
 *
 * ONE RIGHT EDGE. Every value and every delta ends on the same x, in tabular
 * numerals, so a column of figures is a column rather than a drift.
 *
 * THE NUMERALS ARE THE OBJECT; THE UNITS ANNOTATE THEM. "4h 17min" set at one
 * size is a string. Set with the numerals at display size and the units a rung
 * down in ash, it is a reading — the same split `DoneReceiptStat` carries as
 * `figure` and `unit` for the same reason: so no client has to take a formatted
 * string apart to lay it out, and two of them can't take it apart differently.
 */
export function AWidget({ name, meta, children, style }: {
  name: string;
  /** A value on the name's own row — a count, a window. Never a second label. */
  meta?: string | null;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { palette: C } = useTheme();
  return (
    /* SOLID, not glass. A widget carries a READING, and translucency costs the
       contrast a column of figures is read by — the same call `ACard`'s own
       `solid` prop exists to let a caller make. */
    <ACard solid style={style}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.md }}>
        {/* `overline`, not `kicker`: this label is STRUCTURE — it names a
            division of the page — and the app's two eyebrows differ by exactly
            that distinction. */}
        <Text style={ty(C, "overline")}>{name}</Text>
        {!!meta && <Text style={[ty(C, "kicker"), TABULAR]}>{meta}</Text>}
      </View>
      {children}
    </ACard>
  );
}

/**
 * The widget's figure: numerals at size, unit annotating, delta on the right
 * edge. `rank` is the only thing that varies between instances — the week's own
 * figure outranks the halves that make it up, and that is the page's entire
 * hierarchy.
 */
export function WidgetFigure({ value, unit, second, secondUnit, delta, rank = "half" }: {
  value: string;
  unit?: string | null;
  /** A second numeral on the same baseline — the minutes of "4h 17min". Handed
   *  over already split (core `durationParts`) rather than as a string this
   *  would have to cut in two. */
  second?: string | null;
  secondUnit?: string | null;
  /** Change against the period before, pre-signed. Null when there is no axis
   *  to measure from, or when nothing moved. */
  delta?: string | null;
  rank?: "week" | "half";
}) {
  const { palette: C } = useTheme();
  const lime = txt(C, C.lime) as string;
  const size = rank === "week" ? fs.stat : fs.display;
  const unitSize = rank === "week" ? fs.title : fs.bodyLg;
  // THE TWO RANKS ARE SPELLED OUT rather than resolved through the variable
  // above, because the display-weight floor is read off the SOURCE: the guard
  // wants `F.takeover` and its size in one style object on one line, and a
  // `fontSize: size` it cannot follow is exactly the shape that let the 700
  // reach reading text before. The variable still drives the geometry.
  const numeral = rank === "week"
    ? { ...TABULAR, fontFamily: F.takeover, fontSize: fs.stat, lineHeight: leading(size, "flush"), letterSpacing: tracking(size), color: C.chalk } as const
    : { ...TABULAR, fontFamily: F.takeover, fontSize: fs.display, lineHeight: leading(size, "flush"), letterSpacing: tracking(size), color: C.chalk } as const;
  const annotation = { fontFamily: F.mono, fontSize: unitSize, color: C.ash } as const;
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", marginTop: space.md }}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={numeral}>{value}</Text>
      {!!unit && <Text style={[annotation, { marginLeft: LABEL_GAP }]}>{unit}</Text>}
      {!!second && (
        <>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[numeral, { marginLeft: space.sm }]}>{second}</Text>
          {!!secondUnit && <Text style={[annotation, { marginLeft: LABEL_GAP }]}>{secondUnit}</Text>}
        </>
      )}
      {!!delta && (
        <Text style={{ ...TABULAR, fontFamily: F.monoBold, fontSize: fs.body, color: delta.startsWith("+") ? lime : C.ash, marginLeft: "auto" }}>
          {delta}
        </Text>
      )}
    </View>
  );
}

/** A duration as a figure — the one place `durationParts` is turned into two
 *  numerals and two annotations, so every widget prints a span the same way. */
export function durationFigure(d: DurationParts, u: { h: string; min: string }) {
  return d.hours > 0
    ? { value: String(d.hours), unit: u.h, second: String(d.minutes).padStart(2, "0"), secondUnit: u.min }
    : { value: String(d.minutes), unit: u.min, second: null, secondUnit: null };
}

/**
 * THE BODY'S SEAM — the rule between the figure and the reading under it.
 *
 * It is the ONE hairline a widget draws. There is none under the NAME: a
 * hairline under a label is the label-plus-rule divider the app's cluster
 * markers deliberately retired, and whitespace does that job. Here the line is
 * doing something else — it separates the figure this block is ABOUT from the
 * detail that makes it up, which is a real division rather than a decoration.
 */
export function WidgetSeam({ style }: { style?: StyleProp<ViewStyle> }) {
  const { palette: C } = useTheme();
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: C.line, marginTop: space.lg }, style]} />;
}

/** A label and its value on one line: label left in the eyebrow voice, value
 *  right in tabular mono, both on the widget's own edges. */
export function WidgetRow({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  const { palette: C } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={[label, value, sub].filter(Boolean).join(", ")}
      style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.md, paddingVertical: space.ms }}
    >
      <Text style={ty(C, "kicker")}>{label}</Text>
      <View style={{ alignItems: "flex-end" }}>
        <Text
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={{ ...TABULAR, fontFamily: F.monoMed, fontSize: fs.bodyLg, color: C.chalk }}
        >
          {value}
        </Text>
        {!!sub && <Text style={{ ...TABULAR, fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: LABEL_GAP }}>{sub}</Text>}
      </View>
    </View>
  );
}
