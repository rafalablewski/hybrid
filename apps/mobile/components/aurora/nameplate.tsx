import { View, Text } from "react-native";
import { NAMEPLATE_LINE_DP, nameplateLines, nameplateRung, type NameplateRung } from "@hybrid/core";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { F, MAX_FONT_SCALE, fs, leading, space } from "../../lib/ui";
import { APanel } from "./kit";

/**
 * THE NAMEPLATE — a plate whose subject is its NAME.
 *
 * The inversion, and why it is not just a bigger label: every card in this app
 * had settled on a small name over a big figure, which is right for a card you
 * are READING and wrong for one you are SCANNING. On a rail or a grid you are
 * not reading the cards, you are looking for one of them — the name is the
 * target and the figure is what you get once you've found it. The app had 13dp
 * of name under 26dp of number, and the name was the part that truncated.
 *
 * So the name takes `fs.display` in `F.black` — Söhne Halbfett, 600, the
 * heaviest cut the app ships — in caps, the figure recedes to
 * the bottom edge at reading size, and a hairline between them gives the word a
 * floor. The rule for whether a surface may use this at all lives in core
 * (`nameplateLines` / `fitsNameplate`): a nameplate needs a SHORT noun, and
 * that is a property of the data rather than of whoever built the screen.
 *
 * WHAT IT IS NOT. It is not a second panel: it renders through `APanel`, so it
 * carries the same fill, rim and radius as every other surface in the app and
 * cannot drift from them. The only thing this component owns is the type
 * hierarchy inside that panel.
 *
 * THE PLINTH is the hairline under the word. Here it is composition — a short
 * name in a row sized by a longer one leaves space above the base, and a rule
 * turns that space into a margin rather than a gap. Where a plate has a TARGET
 * (a macro against its goal) the same rule is meant to FILL, which is the one
 * extension this component is designed to take: the decorative line becomes the
 * only progress indicator the screen needs. Not built until a surface needs it.
 */

export type NameplateTone = "up" | "down" | "quiet";

const toneColor = (C: Palette, tone: NameplateTone): string =>
  tone === "up" ? txt(C, C.lime) : tone === "down" ? txt(C, C.red) : C.ash;

export default function Nameplate({
  name,
  rung,
  figure,
  unit,
  note,
  noteTone = "quiet",
  dim = false,
  onPress,
  a11y,
}: {
  name: string;
  /**
   * The type the NAME sets at, decided for the whole SET by core's
   * `nameplateRung` and passed down — because "does this treatment fit?" is a
   * question about the set, not about one card. A row where one plate is at 28
   * and its neighbour shrank itself to 25 is the fault this replaces.
   *
   * Optional so a single stray plate still renders; it then answers the
   * question for a set of one, which is right for a plate with no siblings.
   */
  rung?: NameplateRung;
  /** The comparable measure. Omitted when this plate has no value in the
   *  reading currently selected — the plate then says so in `note` rather than
   *  printing a dash where a metric was never going to be. */
  figure?: string;
  unit?: string;
  /** The plate's SECOND fact, and never a restatement of the figure. */
  note?: string;
  noteTone?: NameplateTone;
  /** The subject exists but carries nothing in this reading. The NAME recedes
   *  rather than the whole plate fading: an opacity wash on a card takes its
   *  rim and its fill with it, and the plate is still a real, tappable thing. */
  dim?: boolean;
  onPress?: () => void;
  a11y?: string;
}) {
  const { palette: C } = useTheme();
  const r = rung ?? nameplateRung([name]);
  const { lines } = nameplateLines(name, {
    budgetEm: NAMEPLATE_LINE_DP / r.size,
    trackingEm: r.trackingEm,
    caps: r.caps,
  });

  return (
    <APanel onPress={onPress} a11y={a11y} style={{ flex: 1 }}>
      <View>
        {lines.map((line, i) => (
          <Text
            key={i}
            numberOfLines={1}
            // THE SIZE MOVES, THE WORD DOES NOT SHRINK. This used to be
            // `adjustsFontSizeToFit` with a 0.8 floor: set every plate at
            // `fs.display` and let iOS squeeze the ones that overrun. It works,
            // and it is the wrong answer twice over. It puts a name on an
            // OFF-LADDER size (German at 91% of 28 is 25.5dp, a rung that does
            // not exist), and it does so PER PLATE — so a German grid drew
            // SCHWIMMEN visibly smaller than TENNIS beside it, which is a row
            // of plates that cannot agree how big a name is.
            //
            // `nameplateRung` steps the WHOLE SET down instead: English gets
            // 28, German 22, Polish 20, every plate on the screen the same and
            // every one of them a real rung. Nobody reads two languages at
            // once, so within-screen agreement is the consistency that pays.
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={{
              fontFamily: F.black,
              fontSize: r.size,
              lineHeight: leading(r.size, "flush"),
              // Uppercase Halbfett needs the caps air REMOVED — see
              // CAPS_AIR_EM.wordmark in core/scale. Sentence case at a smaller
              // rung takes the plain optical curve, and `nameplateRung`
              // resolves which, so the measurement and the render cannot
              // disagree about the tracking the way they once did.
              letterSpacing: r.trackingEm * r.size,
              ...(r.caps ? { textTransform: "uppercase" as const } : null),
              // ONE WORD, TWO WEIGHTS. The lead line holds the foreground and
              // the rest recede, so a two-word name reads as one mark with a
              // stress rather than as two things — and it costs no colour
              // channel beyond the two the plate already uses.
              color: i === 0 && !dim ? C.chalk : C.ash,
            }}
          >
            {line}
          </Text>
        ))}
      </View>

      {/* The base sits on the bottom edge whatever the name's height, so a row
          of plates aligns on its figures rather than on its words. */}
      <View style={{ flex: 1, minHeight: space.md }} />

      <View style={{ height: 1, backgroundColor: C.line }} />

      {/* THE BASE STACKS, and the split row it replaces is worth writing down
          because the arithmetic that justified it was wrong.

          It was one row: note on the left, figure on the right, sharing a
          153dp line (a 179dp plate, less APanel's 12dp pad each side and its
          rim). Both are set in Söhne Mono, and Söhne Mono is a FIXED 0.6em
          advance — `numHMetrics` is 1, every glyph the same — so a character
          costs exactly 6dp at `fs.nano` and 9.6dp at `fs.bodyLg`, and the
          width of either fact is just its length.

          "14h 43min" is nine characters: 86.4dp. Take it and the 8dp gap off
          the line and the note has 58.6dp, which is NINE CHARACTERS. "12
          EFFORTS" is ten. The German "12 EINHEITEN" is twelve. So the row
          ellipsised the fact it existed to show — and it did so on the plate
          with the LARGEST figure, i.e. exactly the sport an athlete looks at
          first.

          It shipped because the width was measured with `textWidthEm`, which
          carries Söhne's PROPORTIONAL advance table. Run a monospaced string
          through it and every narrow letter is under-counted: it read "12
          EFFORTS" as 53.8dp against a true 60, and called a line that
          overruns by 1.4dp a fit with 5dp to spare. A proportional table
          applied to a mono face is not an approximation, it is a different
          font.

          Stacking removes the contest instead of re-tuning it. The note takes
          the whole 153dp — every language, every count, and the 96dp longest
          effort the row could never hold — and the figure keeps the bottom
          edge, so a row of plates still aligns on its figures. */}
      <View style={{ marginTop: space.sm }}>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={{
            fontFamily: F.mono,
            fontSize: fs.nano,
            lineHeight: leading(fs.nano, "snug"),
            color: toneColor(C, noteTone),
          }}
        >
          {/* The line is RESERVED even when empty. Plates in a wrapping grid
              stretch to their row's tallest, and the base is bottom-anchored,
              so a plate that dropped this line would sit its plinth 13dp
              lower than its neighbours — the one misalignment a grid of
              rules cannot hide. */}
          {note ?? " "}
        </Text>
        {figure != null && (
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            // NO trackFigure HERE, and the guard that caught it was right: the
            // figure tightening is for the 30–68dp band, where a constant dp
            // means nothing at the top of the range. At fs.bodyLg a mono
            // numeral needs no tightening at all — `tracking(16)` is 0 — so the
            // honest answer is to set none rather than to reach for the big
            // figure's tool because the thing is called a figure.
            style={{
              fontFamily: F.mono,
              fontSize: fs.bodyLg,
              lineHeight: leading(fs.bodyLg, "tight"),
              color: C.chalk,
            }}
          >
            {figure}
            {unit ? (
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}> {unit}</Text>
            ) : null}
          </Text>
        )}
      </View>
    </APanel>
  );
}
