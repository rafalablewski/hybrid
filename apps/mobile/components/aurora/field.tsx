import { View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../../lib/theme";

/**
 * The AURORA FIELD — the ambient ground the whole app sits on, and the one
 * backdrop a `title`-rank hero is allowed (see packages/core/src/hero.ts).
 *
 * Lives in its own module rather than in kit.tsx because BOTH kit.tsx and
 * hero.tsx need it, and kit.tsx routes its screens through hero.tsx: keeping it
 * here is what stops that from becoming an import cycle.
 */

/** Append an alpha byte to a `#RRGGBB` brand token → `#RRGGBBAA` (passthrough
 *  for anything that isn't a 6-digit hex). */
export function withAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}

/** Ambient AURORA backdrop — soft accent gradients that bleed in from the edges
 *  and fade to transparent, giving the rounded screens a smooth gradient wash
 *  (the classic Aurora look). Built from layered `LinearGradient`s rather than
 *  hard-edged blobs so it reads as a gradient, not discs — the RN parity of the
 *  web `.lg-field` (which blurs its blobs 70px to the same effect). Renders in
 *  both modes: with Liquid Glass on it's the colour the glass cards refract;
 *  with it off it's the plain Aurora gradient. Exported so screens that own
 *  their own shell (e.g. the live logger) can drop the same backdrop behind
 *  their content. */
export function AuroraField() {
  const { palette } = useTheme();
  const fill = StyleSheet.absoluteFill;
  return (
    <View pointerEvents="none" style={[fill, { overflow: "hidden" }]}>
      {/* lime — bleeds from the top-left corner. */}
      <LinearGradient
        colors={[withAlpha(palette.lime, 0.14), "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.9, y: 0.9 }}
        style={fill}
      />
      {/* violet — bleeds from the bottom-left. */}
      <LinearGradient
        colors={[withAlpha(palette.violet, 0.16), "transparent"]}
        start={{ x: 0, y: 1 }}
        end={{ x: 0.9, y: 0.15 }}
        style={fill}
      />
      {/* blue — a faint depth glow from the right edge. */}
      <LinearGradient
        colors={["transparent", withAlpha(palette.blue, 0.1)]}
        start={{ x: 0.25, y: 0.4 }}
        end={{ x: 1, y: 0.4 }}
        style={fill}
      />
    </View>
  );
}

