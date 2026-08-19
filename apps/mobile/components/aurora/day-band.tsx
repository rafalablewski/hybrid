import { Text, View } from "react-native";
import {
  DISCIPLINE_META, bandText, fs, inkOn, leading, tracking,
  type DayBand, type SemanticRole, type TrainingKind,
} from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { roleColor, useTheme } from "../../lib/theme";
import { F, PressScale as Pressable } from "../../lib/ui";
import { GUTTER } from "./geometry";
import { AuroraIcon, Glyph, SportMark } from "./icons";

/**
 * THE DAY BAND — the filled field at the head of Today.
 *
 * It replaces the readiness DAY CARD, and the difference is not decoration: the
 * card stated a diagnosis ("Shoulders is the limiter today") and drew a bar of
 * its own runs under it, which is a report. This states what to do. The ladder
 * that decides is `dayBand()` in @hybrid/core — this file renders and decides
 * nothing, which is the same contract the ring's own components hold.
 *
 * THREE OBJECTS, AND THAT IS THE WHOLE ANATOMY. A numeral, an instruction, one
 * sentence. What it deliberately does NOT have is the mono STAMP above and the
 * mono META line below that the first cut wore: three text objects in three
 * faces, each smaller and quieter than the last, where the top one labelled a
 * number nobody asked to have labelled ("READINESS 64") and the bottom one
 * repeated the headline in figures. The score is a numeral for the same reason
 * a clock has no label, and the sentence under the instruction has to add a
 * fact the instruction does not carry — the engine's own copy test holds that.
 *
 * THE FILL IS THE READINESS BAND, except when it isn't. `band.fill` is null on
 * the two rungs that tell an athlete NOT to train, and that is the engine
 * refusing a fill rather than failing to pick one: a bright chartreuse field
 * over "Five-a-side tomorrow" at a readiness of 81 says two opposite things at
 * once. A null fill draws the ground and a hairline. Do not default it.
 *
 * THE INK IS MEASURED, NOT ASSUMED. `onAccent` is guarded against chartreuse,
 * and the band made three more accents into surfaces carrying a 26pt headline —
 * so the ink is `inkOn(fill, [ink, chalk])`, the palette's own two inks, with
 * palette.test.ts sweeping every score the engine can produce.
 *
 * FULL-BLEED, by the house idiom: negative margins the width of the screen
 * gutter, matching internal padding. It does NOT paint under the status bar —
 * the hub shell owns that inset for all three tabs, and taking it would mean
 * every hub screen owning its own. The band starts under the safe area.
 */

/** A discipline's own drawing, at the head of the band. Resolved through the
 *  endurance hub's `DISCIPLINE_META` so the mark on the band and the mark on
 *  that sport's lane are the same object. Gym has no discipline mark. */
function KindMark({ kind, color }: { kind: TrainingKind; color: string }) {
  if (kind === "gym") return <Glyph name="barbell" size={18} color={color} />;
  const mark = DISCIPLINE_META[kind]?.mark;
  if (!mark) return null;
  return mark.kind === "sport"
    ? <SportMark sport={mark.sport} size={18} color={color} />
    : <Glyph name={mark.name} size={18} color={color} />;
}

export default function AuroraDayBand({
  band,
  onExplain,
  onNotToday,
}: {
  band: DayBand;
  /** Opens the readiness sheet — the same door the ring has always had. */
  onExplain: () => void;
  /** Offered ONLY on an inferred day, and only when the rotation has another
   *  candidate. Absent means the band has nothing to correct itself to. */
  onNotToday?: () => void;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  if (band.rung === "none" || !band.head) return null;

  const quiet = band.fill === null;
  const fill = quiet ? C.ink : roleColor(C, band.fill as SemanticRole);
  const ink = quiet ? C.chalk : inkOn(fill, [C.ink, C.chalk]);
  // The second tone is the same ink held back, so a band never introduces a
  // colour the palette does not own. On a quiet band that is `ash`, which is
  // already the guarded secondary on this ground.
  const soft = quiet ? C.ash : ink;
  const softOpacity = quiet ? 1 : 0.78;

  const head = bandText(t, band.head);
  const say = band.say.map((l) => bandText(t, l)).join(" ");
  // THE STEP-DOWN. A head over one line's worth of characters takes the next
  // rung down rather than wrapping to a third line or ellipsizing — an
  // instruction with its verb cut off is worse than a smaller instruction. The
  // engine holds every locale under two lines at `display`; this is what makes
  // the long end of that range sit properly.
  const headSize = head.length > 24 ? fs.headline : fs.display;

  return (
    <View
      accessible
      accessibilityLabel={[String(band.figure), head, say].filter(Boolean).join(" – ")}
      style={{
        marginHorizontal: -GUTTER,
        paddingHorizontal: GUTTER + 3,
        paddingTop: 18,
        paddingBottom: 20,
        backgroundColor: fill,
        borderBottomWidth: quiet ? 1 : 0,
        borderBottomColor: C.line,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
        {band.mark ? <KindMark kind={band.mark} color={quiet ? txtQuietMark(C) : ink} /> : null}
        <Text
          style={{
            flex: 1,
            fontFamily: F.black,
            fontSize: fs.hero,
            letterSpacing: tracking.display,
            color: quiet ? C.ash : ink,
          }}
        >
          {band.figure}
        </Text>
        {/* The ⓘ, and it stays the affordance: what this opens is an
            EXPLANATION of the figure beside it, which is the same grammar the
            ring, the freshness columns and the reading already use. The glyph
            is already a ring, so nothing draws a second one around it. */}
        <Pressable
          onPress={onExplain}
          accessibilityRole="button"
          accessibilityLabel={t("w.home.readiness.sheetTitle")}
          hitSlop={14}
          style={{ minWidth: 44, minHeight: 44, alignItems: "flex-end", justifyContent: "center" }}
        >
          <AuroraIcon name="info" size={17} color={quiet ? C.ash : ink} />
        </Pressable>
      </View>

      <Text
        style={{
          fontFamily: F.black,
          fontSize: headSize,
          lineHeight: leading(headSize),
          letterSpacing: tracking.display,
          color: ink,
          marginTop: 10,
        }}
      >
        {head}
      </Text>

      {say ? (
        <Text
          style={{
            fontFamily: F.reg,
            fontSize: fs.bodyLg,
            lineHeight: leading(fs.bodyLg),
            color: soft,
            opacity: softOpacity,
            marginTop: 8,
          }}
        >
          {say}
        </Text>
      ) : null}

      {/* THE CORRECTION. Only ever offered on a day the app INFERRED, because
          only an inference can be wrong in a way the athlete can see and the
          app cannot. It is a plain control with no chrome: it neither leaves
          nor grows, so neither half of the exit grammar applies to it. */}
      {onNotToday && band.source === "inferred" ? (
        <Pressable
          onPress={onNotToday}
          accessibilityRole="button"
          hitSlop={12}
          style={{ minHeight: 44, justifyContent: "flex-end", alignSelf: "flex-start" }}
        >
          <Text
            style={{
              fontFamily: F.mono,
              fontSize: fs.nano,
              textTransform: "uppercase",
              letterSpacing: tracking.label,
              color: soft,
              opacity: quiet ? 1 : 0.72,
            }}
          >
            {t("w.home.band.notToday")}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A quiet band's mark tone: the accent-text blue, because a protected day is
 *  information rather than a call to act, and `ash` beside `ash` would lose the
 *  one thing the mark is there to say. */
const txtQuietMark = (C: ReturnType<typeof useTheme>["palette"]) => C.accentText.blue;
