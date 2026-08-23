import { Text, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { F } from "../../lib/ui";

// CTA label with a crisp trailing arrow — the mobile twin of web's CtaLabel.
// The i18n "start" strings end in "→" (U+2192), but Söhne — the display face
// (F.bold) — doesn't render that glyph, so React Native falls back to a system
// font just for the arrow: wrong weight, wrong metrics, a thin misaligned mark.
//
// We keep the whole label in ONE <Text> (so the parent's alignItems:center
// centres it as a single block, exactly like a plain label) and render just the
// trailing arrow as a NESTED <Text> run in the mono cut (F.monoBold) — the
// same crisp face the card's »/↦ glyphs use. A nested run is baseline-aligned to
// the word by the text engine, so the arrow sits optically centred beside it
// (no separate flex line-box to drift vertically). The leading space is the gap.
// Labels without a trailing arrow (Do it now, Start early, …) render unchanged.
const TRAILING_ARROW = /\s*[→↦➔➜]\s*$/u;

/** The arrow on its own — web ArrowGlyph's exact drawing (17:13, stroke 2.2),
 *  for standalone chevron affordances (row-end arrows, round "see all" tiles)
 *  where the arrow is the whole content. SVG can't nest inside <Text>, so this
 *  is only for slots that are already their own flex child. `size` is the
 *  arrow's WIDTH; height keeps the 17:13 drawing ratio. */
export function ArrowGlyph({ size = 17, color, style }: { size?: number; color: string; style?: StyleProp<ViewStyle> }) {
  return (
    <Svg width={size} height={Math.round((size * 13) / 17)} viewBox="0 0 17 13" fill="none" style={style}>
      <Path d="M1 6.5h13.5M9.5 1.5l5 5-5 5" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function CtaLabel({
  label,
  color,
  fontSize,
  font = F.bold,
  style,
}: {
  label: string;
  color: string;
  fontSize: number;
  font?: string;
  /** Extra text styling for the whole label (letterSpacing, textTransform,
   *  margins) — merged over the base so mono-uppercase CTA rows keep their
   *  tracking when they route through here. */
  style?: StyleProp<TextStyle>;
}) {
  const hasArrow = TRAILING_ARROW.test(label);
  const text = label.replace(TRAILING_ARROW, "");
  return (
    <Text style={[{ fontFamily: font, fontSize, color }, style]}>
      {text}
      {hasArrow ? <Text style={{ fontFamily: F.monoBold }}>{" →"}</Text> : null}
    </Text>
  );
}
