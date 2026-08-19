import { View, Text } from "react-native";
import { fmtTemp, space, type HeatSitting, type WeightUnit } from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { fs, F, MAX_FONT_SCALE } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { AuroraIcon } from "./icons";
import SwipeRow from "../swipe-row";
import { useConfirm } from "./confirm";

/**
 * A SAUNA, IN THE DAY'S LOG — the accent row under the session it followed.
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
 * IT IS AN ACCENT, NOT A SESSION, and three things say so at once:
 *
 *  - THE INDENT. An attached sitting steps in under its parent, so the eye
 *    reads it as belonging to the workout above rather than as the next item
 *    in the list. A standalone sauna (a rest-day sitting, one taken hours from
 *    any session) does NOT indent — there is nothing for it to belong to, and
 *    an indent under a session it did not follow would be a claim.
 *  - NO TILE. The session row's glyph sits on a 40dp filled square; this glyph
 *    is bare. A sitting is not a workout and must not wear a workout's chrome —
 *    the same argument the exit rule makes about a bordered box at the end of a
 *    rail, which gets counted as one more of the thing it sits beside.
 *  - AMBER. Heat's hue everywhere it appears (the Wrapped's post-session
 *    prompt, the clearance card), against the lime of a plan session and the
 *    blue of one logged off-plan.
 *
 * IT IS THE SAME SIZE AS THE ROWS AROUND IT, deliberately. Title at the session
 * title's rung, meta at the session meta's, and the same vertical padding — so
 * the list keeps ONE rhythm and the sauna is subordinate by position and hue
 * rather than by being shrunk into a footnote. A sitting is a real thing the
 * athlete did; the accent says where it belongs, not that it barely counts.
 *
 * AND IT IS WHERE A SITTING IS DELETED, because it is where a sitting is now
 * read. The log sheet used to carry a RECENT list — the last three, behind an
 * expander, with a × on each — and that list was the only way to correct a
 * fat-fingered 90-minute entry in the whole product. It is gone: a log sheet
 * that also lists the log is two screens under one title, and an expander you
 * have to open to see is not a surface anyone checks. The capability did not
 * go with it. It moved HERE, behind the standard swipe, so removing a sauna
 * works exactly as removing a session in the same list does — you notice a
 * wrong entry where you are reading it, and the fix is under your thumb rather
 * than two taps into a sheet that exists to write, not to audit.
 *
 * BOTH SIGNAL ROWS GO TOGETHER. One sitting writes `sauna` and `saunaTemp` at
 * one exact instant; `HeatSitting.ids` carries both, and the delete takes the
 * pair. Removing only the minutes would leave a temperature nobody sat in, and
 * `heatSittings` drops a lone `saunaTemp` — so the row would vanish from the
 * screen while a dead signal stayed on the record.
 *
 * THE FIGURES ARE COMPOSED, NOT JOINED. Two values with a gap between them,
 * for the reason the Heat row's week figures are: a `.replace` into one string
 * is what the middot rule calls out, and it leaves the type nothing to
 * distinguish. An ASSUMED temperature is not printed at all — the athlete never
 * typed it, and the engine's own reference standing in as a measurement is
 * exactly the false precision `assumedTemp` exists to mark.
 */
export function HeatAccent({ sitting, indent, units, variant = "floor", onDelete }: {
  sitting: HeatSitting;
  indent: boolean;
  units: WeightUnit;
  variant?: "floor" | "sheet";
  /** Remove the sitting — both its Signal rows. Present → the row swipes;
   *  absent → it doesn't, which is right in the Done-today sheet: a sheet is
   *  not where a destructive gesture belongs, and the floor behind it has the
   *  same row. */
  onDelete?: (sitting: HeatSitting) => void;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const { confirm } = useConfirm();
  const label = t(`w.recovery.heat.protocol.${sitting.protocol}`);
  const minutes = `${sitting.minutes} ${t("w.recovery.heat.min")}`;
  const temp = sitting.assumedTemp ? null : fmtTemp(sitting.tempC, units);
  // The two lists this row appears in size their glyph column differently (the
  // floor's session tile is 40, the Done-today sheet's check circle is 30) and
  // the sheet separates its rows with a hairline. Read from the host rather
  // than re-declared here: a title that starts 10dp off the ones above it is
  // the whole reason this row is shaped by its list and not by itself.
  const sheet = variant === "sheet";

  const row = (
    <View
      accessibilityRole="text"
      accessibilityLabel={[label, minutes, temp].filter(Boolean).join(", ")}
      style={{
        flexDirection: "row", alignItems: "center", gap: space.md,
        paddingVertical: sheet ? space.md : space.sm,
        paddingLeft: indent ? space.xl : 0,
        ...(sheet ? { borderBottomWidth: 1, borderBottomColor: C.line } : null),
      }}
    >
      {/* The session tile's column, holding a BARE glyph — same alignment, no
          surface. The width is the host row's own glyph column, so every title
          in the list starts on one edge whether the row is a workout or the
          sauna after it. */}
      <View style={{ width: sheet ? 30 : 40, alignItems: "center" }}>
        <AuroraIcon name="flame" size={fs.subtitle} color={txt(C, C.amber) as string} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.note, color: txt(C, C.amber) }}>{label}</Text>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm, marginTop: 2 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{minutes}</Text>
          {temp ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{temp}</Text> : null}
        </View>
      </View>
    </View>
  );

  if (!onDelete) return row;
  return (
    /* The app's own confirm sheet, never Alert.alert — the design-token test
       bans the system alert outright, and a user who has learned this app's
       sheet gesture should not meet an OS modal at the moment they most need
       to feel oriented. The swipe itself IS the system's. */
    <SwipeRow
      label={t("common.delete")}
      background="transparent"
      marginBottom={0}
      onDelete={async () => {
        const ok = await confirm({
          title: t("w.recovery.heat.deleteTitle"),
          message: t("w.recovery.heat.deleteBody")
            .replace("{n}", String(sitting.minutes))
            .replace("{t}", fmtTemp(sitting.tempC, units)),
          confirmLabel: t("common.delete"),
          destructive: true,
        });
        if (ok) onDelete(sitting);
      }}
    >
      {row}
    </SwipeRow>
  );
}

export default HeatAccent;
