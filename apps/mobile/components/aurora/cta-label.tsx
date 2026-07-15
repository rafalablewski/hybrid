import { View, Text } from "react-native";
import { F } from "../../lib/ui";

// CTA label with a crisp trailing arrow — the mobile twin of web's CtaLabel.
// The i18n "start" strings end in "→" (U+2192), but Archivo — the display face
// (F.bold) — doesn't render that glyph, so React Native falls back to a system
// font just for the arrow: wrong weight, wrong metrics, a thin misaligned mark.
// We strip the trailing arrow from the text and draw it in JetBrains Mono
// (F.monoBold) instead — the same crisp face the card's »/↦ glyphs already use —
// at matching colour and a fixed, tight gap. Labels without a trailing arrow
// (Do it now, Start early, …) render unchanged.
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
  const textNode = <Text style={{ fontFamily: font, fontSize, color }}>{text}</Text>;
  if (!hasArrow) return textNode;
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {textNode}
      <Text style={{ fontFamily: F.monoBold, fontSize: fontSize * 0.9, color, marginLeft: 7 }}>→</Text>
    </View>
  );
}
