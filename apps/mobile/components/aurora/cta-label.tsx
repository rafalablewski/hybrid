import { Text } from "react-native";
import { F } from "../../lib/ui";

// CTA label with a crisp trailing arrow — the mobile twin of web's CtaLabel.
// The i18n "start" strings end in "→" (U+2192), but Archivo — the display face
// (F.bold) — doesn't render that glyph, so React Native falls back to a system
// font just for the arrow: wrong weight, wrong metrics, a thin misaligned mark.
//
// We keep the whole label in ONE <Text> (so the parent's alignItems:center
// centres it as a single block, exactly like a plain label) and render just the
// trailing arrow as a NESTED <Text> run in JetBrains Mono (F.monoBold) — the
// same crisp face the card's »/↦ glyphs use. A nested run is baseline-aligned to
// the word by the text engine, so the arrow sits optically centred beside it
// (no separate flex line-box to drift vertically). The leading space is the gap.
// Labels without a trailing arrow (Do it now, Start early, …) render unchanged.
const TRAILING_ARROW = /\s*[→↦➔➜]\s*$/u;

export function CtaLabel({
  label,
  color,
  fontSize,
  font = F.bold,
}: {
  label: string;
  color: string;
  fontSize: number;
  font?: string;
}) {
  const hasArrow = TRAILING_ARROW.test(label);
  const text = label.replace(TRAILING_ARROW, "");
  return (
    <Text style={{ fontFamily: font, fontSize, color }}>
      {text}
      {hasArrow ? <Text style={{ fontFamily: F.monoBold }}>{" →"}</Text> : null}
    </Text>
  );
}
