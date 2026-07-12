import { View } from "react-native";
import { READINESS_FACE, type ReadinessFeeling, type ReadinessMouth } from "@hybrid/core";
import { useTheme, txt } from "../../lib/theme";

/** The mood-shaped mouth, built from plain Views (no react-native-svg dep). The
 *  curves are a CLIPPED RING — a bordered circle inside an overflow:hidden box
 *  that reveals only its bottom arc (smile) or top arc (frown). That renders a
 *  real, reliable curve on iOS + Android; a single-side border + radius collapses
 *  to a flat line on device. Mirrors the web <ReadinessFace> SVG mouth paths. */
function Mouth({ color, mouth }: { color: string; mouth: ReadinessMouth }) {
  if (mouth === "flat") {
    return <View style={{ width: 14, height: 2.6, backgroundColor: color, borderRadius: 1.3 }} />;
  }
  const D = 16; // ring diameter; the visible slice is the arc of a circle this big.
  const bw = 2.6; // stroke weight (matches the eyes / web stroke)
  const h = mouth === "grin" ? 7 : mouth === "frown" ? 6 : 5; // slice height = curve depth
  // smile shows the ring's BOTTOM arc (push the circle up so only its base peeks);
  // frown shows the TOP arc (align the circle's top with the clip box).
  const marginTop = mouth === "frown" ? 0 : -(D - h);
  return (
    <View style={{ width: D, height: h, overflow: "hidden", alignItems: "center" }}>
      <View style={{ width: D, height: D, borderRadius: D / 2, borderWidth: bw, borderColor: color, marginTop }} />
    </View>
  );
}

/** Minimal readiness face — two eyes + a mood-shaped mouth (no ring). */
function Face({ color, mouth }: { color: string; mouth: ReadinessMouth }) {
  const eye = { width: 4.5, height: 4.5, borderRadius: 2.25, backgroundColor: color } as const;
  return (
    <View style={{ width: 34, height: 34, alignItems: "center", justifyContent: "center", gap: 5 }}>
      <View style={{ flexDirection: "row", gap: 9 }}>
        <View style={eye} />
        <View style={eye} />
      </View>
      <Mouth color={color} mouth={mouth} />
    </View>
  );
}

/**
 * Readiness face for a FEELING, drawn in the semantic accent colour. Shared by
 * the Readiness picker (scale 1) and the Today glance strip (scaled down) so
 * both render the identical face. Mirrors the web <ReadinessFace> SVG.
 */
export default function ReadinessFace({ feeling, scale = 1 }: { feeling: ReadinessFeeling; scale?: number }) {
  const { palette: C } = useTheme();
  const { mouth, accent } = READINESS_FACE[feeling];
  const color = txt(C, C[accent]);
  const face = <Face color={color} mouth={mouth} />;
  if (scale === 1) return face;
  // transform:scale is visual only — the layout box stays 34×34 — so wrap it in
  // a container sized to the scaled dimensions, keeping the layout footprint honest.
  const size = 34 * scale;
  return (
    <View style={{ width: size, height: size, justifyContent: "center", alignItems: "center" }}>
      <View style={{ transform: [{ scale }] }}>{face}</View>
    </View>
  );
}
