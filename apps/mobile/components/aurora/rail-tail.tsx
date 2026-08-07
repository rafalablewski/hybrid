import { View, Text } from "react-native";
import { ArrowGlyph } from "./cta-label";
import { useLang } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";
import { usePremiumAccent } from "../../lib/premium-accent";
import { F, PressScale as Pressable, FIXED_FONT_SCALE } from "../../lib/ui";

/**
 * RAIL TAIL — the ONE "see all" affordance, and the TWIN of
 * components/aurora/rail-tail.tsx on web.
 *
 * The rule: a rail's exit lives at the END OF THE RAIL, not in its header.
 *
 * Every rail used to carry a lime "See all ›" up in its section head. Three of
 * them stacked down Today (Swimming / Cycling / Running) put three identical
 * accent-coloured links on one screen, each pointing somewhere different, none
 * of them where the eye actually is — the reader is at the RIGHT edge of the
 * cards, having just swiped to the end, and the only way to act on "there is
 * more" was to travel back up and left to a link they'd scrolled past. It also
 * spends the head's right slot, which per the Explore SectionHead standard is
 * for the section's meta, and spends chartreuse — the "go" colour — on a link
 * repeated once per lane.
 *
 * A tail card puts the door where the corridor ends. It is the last card in the
 * scroller, so it is DISCOVERED by the same gesture that exhausts the rail: you
 * swipe, you run out of content, and the next thing under your thumb is the way
 * in. It also self-documents the rail's length — reaching the tail is how you
 * know you've seen everything — which the header link could never do.
 *
 * It wears the CARD form, not link form: same ink2 fill, same hairline, the
 * rail's own radius, so it belongs to the row rather than floating over it. The
 * arrow sits in a ringed plate at card centre (the coach rail's drawing, which
 * this component now supplies to every rail so there is one implementation
 * rather than four copies), and the label is mono uppercase in ash — a
 * destination, not a shout.
 */
export default function RailTail({
  onOpen,
  label,
  a11y,
  w = 132,
  radius = 28,
  minHeight,
  premium = false,
  shadow = true,
}: {
  onOpen: () => void;
  /** Defaults to the shared "See all". Pass a destination-specific label where
   *  the rail's position doesn't already say the scope. */
  label?: string;
  /** Spoken label — add the rail's subject where "See all" alone is ambiguous
   *  out of context (a screen reader has no "end of THIS rail" cue). */
  a11y?: string;
  /** Match the rail's card width. */
  w?: number;
  /** Match the rail's card radius. */
  radius?: number;
  /** Floor for rails whose cards size themselves (the tail has no content to
   *  give it height). */
  minHeight?: number;
  /** ✦ — the destination is behind Full. Carries the premium accent, not lime. */
  premium?: boolean;
  /** Off inside dense rails whose cards are flat (the endurance lanes). */
  shadow?: boolean;
}) {
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
  const pa = usePremiumAccent();
  const text = label ?? t("w.explore.seeAll");
  const color = premium ? pa.text : C.ash;
  // Soft theme-aware card lift (web --shadow-card parity): warm sumi-wash on
  // Kyoto Hour, the usual black bloom on Aurora — never black on washi.
  const cardShadow = !shadow
    ? null
    : scheme === "light"
      ? ({ shadowColor: "#584934", shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3 } as const)
      : ({ shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3 } as const);
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={a11y ?? text}
      style={{
        width: w, minHeight, alignItems: "center", justifyContent: "center", gap: 8, padding: 12,
        backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: radius,
        ...(cardShadow ?? {}),
      }}
    >
      <View style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: premium ? pa.text : C.line, alignItems: "center", justifyContent: "center" }}>
        <ArrowGlyph size={14} color={color} />
      </View>
      <Text
        maxFontSizeMultiplier={FIXED_FONT_SCALE}
        style={{ color, fontFamily: F.mono, fontSize: 11, letterSpacing: 0.9, textTransform: "uppercase", textAlign: "center", lineHeight: 15 }}
      >
        {premium ? `✦ ${text}` : text}
      </Text>
    </Pressable>
  );
}
