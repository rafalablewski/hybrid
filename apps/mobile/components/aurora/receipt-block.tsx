import { View, Text } from "react-native";
import { doneReceiptHero, type DoneReceipt, type WeightUnit } from "@hybrid/core";
import { useTheme, txt } from "../../lib/theme";
import { useLang } from "../../lib/i18n";
import { leading, fs, F, serifIf, FIXED_FONT_SCALE } from "../../lib/ui";

// ── AURORA Done receipt block (mobile) ──────────────────────────────────────
// The finished day, as both week rails render it: the ✓, the headline, the
// finishing clock, ONE figure at display size and the rest standing down.
//
// THE GUTTER IS THE POINT. The card used to run three left edges at once — its
// hairlines at 0, the ✓ and headline at the card's padding, and every line
// under them at padding + 31 (the width of a ✓ glyph plus its gap), aligning to
// a mark the eye couldn't see because the glyph above was half that wide. That
// reads as ragged, not indented. So the ✓ now HANGS in a gutter of its own and
// every line of the receipt — headline included — starts at the same edge. The
// only other edges left in the card are hairlines, which is a hierarchy.
//
// ONE NUMBER EARNS THE SIZE. Three figures at one size is three focal points,
// which is none; core doneReceiptHero picks the one the day was about (the same
// priority sessionHeadline uses for the History rows, so the two can't headline
// different facts) and hands back the remainder for a single quiet line.
//
// Mirrors the web twin (aurora/receipt-block.tsx) exactly.

/** The indent the ✓ hangs in — the receipt's one text edge. Exported because
 *  the rails' seam and floor align their labels to it too. */
export const RECEIPT_GUTTER = 31;

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
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
  const { hero, rest } = receipt ? doneReceiptHero(receipt, units) : { hero: null, rest: [] };
  const finished = receipt?.finishedClock
    ? t("w.home.rail.finishedAt").replace("{t}", receipt.finishedClock)
    : "";

  return (
    <View style={{ paddingLeft: RECEIPT_GUTTER }}>
      <Text
        style={{ position: "absolute", left: 0, top: 0, fontFamily: F.black, fontSize: 19, lineHeight: 22, color: txt(C, C.lime) }}
      >
        ✓
      </Text>

      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <Text
          maxFontSizeMultiplier={FIXED_FONT_SCALE}
          style={{ flex: 1, fontFamily: serifIf(scheme, F.black), fontSize: 19, letterSpacing: -0.5, color: C.chalk }}
        >
          {title}
        </Text>
        {!!stamp && <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{stamp}</Text>}
      </View>

      {!!finished && (
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 6, lineHeight: leading(fs.caption) }}>
          {finished}
        </Text>
      )}

      {!!hero && (
        <View style={{ flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: 7, marginTop: 14 }}>
          <Text
            maxFontSizeMultiplier={FIXED_FONT_SCALE}
            style={{ fontFamily: F.black, fontSize: 42, lineHeight: 44, letterSpacing: -1.9, color: C.chalk, fontVariant: ["tabular-nums"] }}
          >
            {hero.figure}
          </Text>
          {!!hero.unit && <Text style={{ fontFamily: F.bold, fontSize: 16, color: C.ash }}>{hero.unit}</Text>}
          {/* a hero whose unit can't name it (a bare count, a climb) keeps its label */}
          {!!hero.needsLabel && (
            <Text style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: C.ash }}>
              {t(hero.labelKey)}
            </Text>
          )}
        </View>
      )}

      {/* The supporting figures, on one line. No separator glyph — the gap does
          it (house rule: never a middot). A value that can't stand on its own
          takes its label back, lowercased, so "320 m" beside "9.4 km" still
          reads as the climb it is. */}
      {rest.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 18, rowGap: 6, marginTop: 12 }}>
          {rest.map((s) => (
            <Text key={s.labelKey} style={{ fontFamily: F.mono, fontSize: 12.5, color: C.ash, fontVariant: ["tabular-nums"] }}>
              {s.needsLabel ? `${s.value} ${t(s.labelKey).toLowerCase()}` : s.value}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}
