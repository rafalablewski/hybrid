import type { ReactNode } from "react";
import { View, Text } from "react-native";
import { AURORA_ICON_PATHS, SATELLITE, type AuroraIconName } from "@hybrid/core";
import { AuroraIcon } from "./icons";
import { GlassSatellite, GlassSurface, LIQUID_GLASS_RENDERED, LIQUID_GLASS_SUPPORTED, type SFSymbol } from "./swiftui";
import { withAlpha } from "./field";
import { useTheme } from "../../lib/theme";
import { F, fs, PressScale as Pressable, FIXED_FONT_SCALE } from "../../lib/ui";

/**
 * ASATELLITE — the ONE neutral glass button, and the TWIN of
 * apps/web/components/aurora/satellite.tsx.
 *
 * A satellite orbits a filled primary: Pause and Finish beside Log set, the
 * ✕ / ★ / → around Share on the finish summary. The geometry and the floor's
 * rim are @hybrid/core `SATELLITE` — see that file for why the same button had
 * been drawn four ways in one screen.
 *
 * TWO RENDERERS, ONE CONTROL, and the choice is made HERE so no caller can make
 * it differently:
 *
 *   • A satellite whose mark exists as an SF Symbol hands the WHOLE button to
 *     SwiftUI where Liquid Glass renders — the material answers the press
 *     itself, which is worth most on the controls a chalked thumb hits without
 *     looking.
 *   • Everything else keeps the RN drawing with a native glass BACKDROP under
 *     it (`GlassSurface`), which is the same material one layer down. That is
 *     the path for a mark the shared vector set carries but SF Symbols do not
 *     (✕, ★, the kit's own arrow), and for the one STATE a satellite has:
 *     `on` is a fill-and-ring change, and a native glass button has no on.
 *
 * So every satellite in the app wears real glass on iOS 26 and one rim
 * everywhere else, whichever renderer answers.
 */
export default function ASatellite({
  onPress,
  a11y,
  glyph,
  mark,
  word,
  caption,
  on,
  fg,
  size = SATELLITE.size,
  glyphSize = SATELLITE.glyph,
}: {
  onPress: () => void;
  /** The full spoken phrase — the only name a bare circle has. */
  a11y: string;
  /** The SF Symbol. Present (and stateless) → the button goes native where the
   *  material renders. Absent → the RN drawing over a glass backdrop. */
  glyph?: SFSymbol;
  /** The floor's mark: a shared vector name, a NODE, or a bare glyph character
   *  for the marks the vector set does not carry yet (✕, ★ — the
   *  design-system-unification sweep's job, and until then this component sizes
   *  them so three call sites can't pick three type scales).
   *
   *  Optional ONLY for a `word` capsule, which is the one satellite that can
   *  carry its meaning without a mark ("Keep going"). */
  mark?: AuroraIconName | string | ReactNode;
  /** Present → a labelled capsule instead of a circle, for the satellite whose
   *  glyph must not be guessed at. */
  word?: string;
  /** A mono caption UNDER the circle — the summary cluster's ROUTINE /
   *  ANALYSIS. It never changes the button; it names it in place. */
  caption?: string;
  /** The one state: pressed-and-holding-something-open (the ★'s composer).
   *  PROVIDING it at all keeps the button on the floor for its whole life —
   *  deciding per-render would swap renderers on the tap that toggles it, and a
   *  control that changes material when pressed reads as two controls. */
  on?: boolean;
  /** Overrides chalk — `pause` goes amber while a session is held. */
  fg?: string;
  /** The circle's diameter / the capsule's height. Defaults to the token; a
   *  caller changes it only where the cluster's primary is a different size. */
  size?: number;
  glyphSize?: number;
}) {
  const C = useTheme().palette;
  const tint = fg ?? C.chalk;
  // Native only when there is a symbol to draw with and no state to carry.
  const native = LIQUID_GLASS_RENDERED && !!glyph && on === undefined;
  const face = native ? (
    <GlassSatellite
      onPress={onPress}
      label={a11y}
      glyph={glyph!}
      word={word}
      fontFamily={F.bold}
      fg={tint}
      size={size}
      glyphSize={glyphSize}
    />
  ) : (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ selected: on ?? false }}
      hitSlop={6}
      style={{
        height: size,
        width: word ? undefined : size,
        paddingHorizontal: word ? SATELLITE.wordPad : 0,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        borderRadius: 999,
        overflow: "hidden",
        // Transparent under the real material, so the glass is the fill rather
        // than a wash printed on top of it.
        backgroundColor: LIQUID_GLASS_SUPPORTED
          ? "transparent"
          : withAlpha(C.chalk, on ? SATELLITE.alpha.onFill : SATELLITE.alpha.fill),
        borderWidth: 1,
        borderColor: withAlpha(C.chalk, on ? SATELLITE.alpha.onStroke : SATELLITE.alpha.stroke),
      }}
    >
      {LIQUID_GLASS_SUPPORTED && <GlassSurface radius={size / 2} />}
      {mark == null ? null : typeof mark !== "string" ? (
        mark
      ) : mark in AURORA_ICON_PATHS ? (
        <AuroraIcon name={mark as AuroraIconName} size={glyphSize} color={tint} />
      ) : (
        <Text style={{ fontFamily: F.bold, fontSize: Math.round(size * 0.36), color: tint }}>{mark}</Text>
      )}
      {word ? <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: tint }}>{word}</Text> : null}
    </Pressable>
  );
  if (!caption) return face;
  // The caption is allowed to be wider than the circle, but not to set the
  // cluster's spacing: the column is the circle's width or 60, whichever is
  // larger, and the word ellipsises inside it.
  return (
    <View style={{ alignItems: "center", width: Math.max(size, 60) }}>
      {face}
      <Text
        maxFontSizeMultiplier={FIXED_FONT_SCALE}
        numberOfLines={1}
        style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, color: C.ash, marginTop: SATELLITE.captionGap }}
      >
        {caption.toUpperCase()}
      </Text>
    </View>
  );
}
