import { View, Text } from "react-native";
import { fmtTemp, space, type HeatSitting, type WeightUnit } from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { fs, F, MAX_FONT_SCALE } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { AuroraIcon } from "./icons";

/**
 * A SAUNA, IN THE DAY'S LOG — the accent line under the session it followed.
 *
 * WHAT WAS WRONG. A sitting was readable in exactly two places: the week's
 * count on Today's Heat row, and the sheet's Recent list. Neither of them says
 * WHEN in the day it happened, so an athlete who lifted, sat in the sauna and
 * then swam saw two workouts in the done floor with nothing between them — the
 * sauna had happened, the engines had already scored it, and the record of the
 * afternoon did not contain it. The placement itself was never the hard part:
 * `heatAfterSession` has known which workout a sitting followed since the
 * out-of-order pass; nothing had ever asked it on behalf of a LIST.
 *
 * IT IS AN ACCENT, NOT A SESSION, and four things say so at once:
 *
 *  - IT IS SMALLER. ONE line, not two: the modality and both figures sit on a
 *    single baseline at `fs.caption`, against the session row's 15/700 title
 *    over a 12/mono meta line. Half the height, and that is the point — this
 *    line shipped once at the session rung, and at equal size an accent is not
 *    an accent, it is a third workout that happens to be amber. A sitting is a
 *    real thing the athlete did; it is not a thing they trained.
 *  - THE INDENT. An attached sitting steps in under its parent, so the eye
 *    reads it as belonging to the workout above rather than as the next item
 *    in the list. A standalone sauna (a rest-day sitting, one taken hours from
 *    any session) does NOT indent — there is nothing for it to belong to, and
 *    an indent under a session it did not follow would be a claim.
 *  - NO TILE. The session row's glyph sits on a 40dp filled square; this glyph
 *    is bare, and smaller. A sitting is not a workout and must not wear a
 *    workout's chrome — the same argument the exit rule makes about a bordered
 *    box at the end of a rail, which gets counted as one more of the thing it
 *    sits beside. It keeps the tile's COLUMN WIDTH, though, so every line in
 *    the list starts on one edge.
 *  - AMBER. Heat's hue everywhere it appears (the Wrapped's post-session
 *    prompt, the clearance card), against the lime of a plan session and the
 *    blue of one logged off-plan.
 *
 * IT DOES NOTHING WHEN TAPPED, and carries no swipe. It states what happened,
 * which is the whole job. Correcting or removing a sitting is not this line's
 * to offer: a destructive gesture on a half-height accent inside a list whose
 * other rows delete a WORKOUT is a mis-swipe waiting to happen, and it would
 * be the only place in the app where two rows of different rank in one list
 * both destroy something. That path lives elsewhere.
 *
 * THE FIGURES ARE COMPOSED, NOT JOINED. Values with a gap between them, for
 * the reason the Heat row's week figures are: a `.replace` into one string is
 * what the middot rule calls out, and it leaves the type nothing to
 * distinguish. An ASSUMED temperature is not printed at all — the athlete never
 * typed it, and the engine's own reference standing in as a measurement is
 * exactly the false precision `assumedTemp` exists to mark.
 */
export function HeatAccent({ sitting, indent, units, variant = "floor" }: {
  sitting: HeatSitting;
  indent: boolean;
  units: WeightUnit;
  variant?: "floor" | "sheet";
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const label = t(`w.recovery.heat.protocol.${sitting.protocol}`);
  const minutes = `${sitting.minutes} ${t("w.recovery.heat.min")}`;
  const temp = sitting.assumedTemp ? null : fmtTemp(sitting.tempC, units);
  // The two lists this line appears in size their glyph column differently (the
  // floor's session tile is 40, the Done-today sheet's check circle is 30) and
  // the sheet separates its rows with a hairline. Read from the host rather
  // than re-declared here: a line that starts 10dp off the ones above it is
  // the whole reason this row is shaped by its list and not by itself.
  const sheet = variant === "sheet";

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={[label, minutes, temp].filter(Boolean).join(", ")}
      style={{
        flexDirection: "row", alignItems: "center", gap: space.md,
        paddingVertical: sheet ? space.sm : space.xxs,
        paddingLeft: indent ? space.xl : 0,
        ...(sheet ? { borderBottomWidth: 1, borderBottomColor: C.line } : null),
      }}
    >
      {/* The session tile's column, holding a BARE glyph at the line's own
          scale. The width is the host row's glyph column, so every title in
          the list starts on one edge whether the row is a workout or the sauna
          after it. */}
      <View style={{ width: sheet ? 30 : 40, alignItems: "center" }}>
        <AuroraIcon name="flame" size={fs.bodyLg} color={txt(C, C.amber) as string} />
      </View>
      {/* ONE baseline. `flexShrink` on the label and not on the figures: at a
          large Dynamic Type setting the modality is the part that can afford
          to truncate — "20 min" and "90 °C" are the line's content. */}
      <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "baseline", gap: space.sm }}>
        <Text
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          numberOfLines={1}
          style={{ flexShrink: 1, fontFamily: F.bold, fontSize: fs.caption, color: txt(C, C.amber) }}
        >
          {label}
        </Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{minutes}</Text>
        {temp ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{temp}</Text> : null}
      </View>
    </View>
  );
}

export default HeatAccent;
