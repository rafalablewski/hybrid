import { View, Text } from "react-native";
import { doneReceiptHero, type DoneReceipt, type DoneReceiptStat, type WeightUnit } from "@hybrid/core";
import { useTheme } from "../../lib/theme";
import { useLang } from "../../lib/i18n";
import { F, MAX_FONT_SCALE, fs, leading, trackFigure, tracking} from "../../lib/ui";

// ── AURORA Done receipt block (mobile) ──────────────────────────────────────
// The finished day, as both week rails render it: the headline, ONE figure at
// display size and the rest standing down.
//
// NO FINISHING CLOCK. "finished 16:32" used to sit under the headline; it is
// gone (see the note in core done-receipt.ts). A day trained twice reported
// the FIRST workout's finish beside figures that summed the whole day, and no
// reading of that line was true of the card it sat on.
//
// NO TICK, AND NO GUTTER UNDER IT (Aug 2026). The receipt used to open with a
// chartreuse ✓ in a 31px gutter column of its own, every line of the block
// hanging off that column's edge. The gutter was the right fix for the layout
// it was given — three ragged left edges in one card — but it was fixing the
// tick, and the tick was the thing that didn't earn its place: the day chip
// above already marks the day as trained, the headline says "Logged", and the
// figures are a receipt for work that plainly happened. Three statements of
// one fact, and the loudest of them was the least informative. Removing it
// collapses the column, so the receipt now starts on the card's own content
// edge — ONE left edge for the whole card, which is what the gutter was
// reaching for in the first place. The 31px indent went with it everywhere:
// the seam label, the figures, the exit.
//
// ONE NUMBER EARNS THE SIZE. Three figures at one size is three focal points,
// which is none; core doneReceiptHero picks the one the day was about (the same
// priority sessionHeadline uses for the History rows, so the two can't headline
// different facts) and hands back the remainder for a single quiet line.

/** The headline's line box — a fixed leading so the headline row's height can't
 *  shift between a day that carries a stamp and one that doesn't. */
const HEAD_LINE = 24;

export default function ReceiptBlock({
  receipt,
  units,
  title,
  stamp,
}: {
  receipt: DoneReceipt | null;
  units: WeightUnit;
  /** already-localized headline ("All done for today" / "Logged"). */
  title: string;
  /** already-localized corner stamp ("Yesterday", "6-day streak"), or "". */
  stamp?: string | null;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const empty: { hero: DoneReceiptStat | null; rest: DoneReceiptStat[] } = { hero: null, rest: [] };
  const { hero, rest } = receipt ? doneReceiptHero(receipt, units) : empty;

  // A supporting label, for the figures whose unit can't name them. Uppercase
  // mono — the house grammar for a label, and the only casing that is correct
  // in every language (lowercasing "Höhenmeter" would not be German).
  const suffix = { fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking(fs.nano, "caps"), textTransform: "uppercase", color: C.ash } as const;

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <Text
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={{ flex: 1, fontFamily: F.black, fontSize: 19, lineHeight: HEAD_LINE, letterSpacing: tracking(19), color: C.chalk }}
        >
          {title}
        </Text>
        {!!stamp && <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{stamp}</Text>}
      </View>

      {!!hero && (
        <View style={{ flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: 7, marginTop: 14 }}>
          <Text
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={{ fontFamily: F.black, fontSize: 42, lineHeight: leading(42, "flush"), letterSpacing: trackFigure(42), color: C.chalk, fontVariant: ["tabular-nums"] }}
          >
            {hero.figure}
          </Text>
          {!!hero.unit && <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.ash }}>{hero.unit}</Text>}
          {/* a hero whose unit can't name it (a bare count, a climb) keeps its label */}
          {!!hero.needsLabel && <Text style={suffix}>{t(hero.labelKey)}</Text>}
        </View>
      )}

      {/* The supporting figures, on one line. No separator glyph — the gap
          does it (house rule: never a middot). A value that can't stand on
          its own takes its label back, so "320 m" beside "9.4 km" still reads
          as the climb it is. */}
      {rest.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 18, rowGap: 6, marginTop: 12 }}>
          {rest.map((s) => (
            <Text key={s.labelKey} style={{ fontFamily: F.mono, fontSize: 12.5, color: C.ash, fontVariant: ["tabular-nums"] }}>
              {s.value}
              {s.needsLabel ? <Text style={suffix}>{` ${t(s.labelKey)}`}</Text> : null}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}
