import { View } from "react-native";
import { READINESS_FACE, type ReadinessFeeling, type ReadinessMouth } from "@hybrid/core";
import { useTheme, txt } from "../../lib/theme";

// The faces are drawn in the kaomoji vocabulary — (^‿^) — with one consistent
// 2px round-capped stroke, so they read as a crafted pictogram set, not crayon
// dots. The EYES carry as much of the expression as the mouth: delight closes
// them into happy ⌒ arcs, calm/flat keeps level strokes, wrecked droops them
// outward. Keyed by the shared mouth so core needs no new vocabulary. Mirrors
// the web <ReadinessFace> SVG paths.

const STROKE = 2;

/** A clipped-ring arc — the reliable way to draw a thin curve with plain Views
 *  (no react-native-svg dep): a bordered circle inside an overflow:hidden box
 *  that reveals only its top arc (`peak`, ⌒) or bottom arc (`valley`, ‿). A
 *  single-side border + radius collapses to a flat line on device. */
function Arc({ color, width, depth, shape }: { color: string; width: number; depth: number; shape: "peak" | "valley" }) {
  return (
    <View style={{ width, height: depth, overflow: "hidden", alignItems: "center" }}>
      <View style={{ width, height: width, borderRadius: width / 2, borderWidth: STROKE, borderColor: color, marginTop: shape === "peak" ? 0 : -(width - depth) }} />
    </View>
  );
}

/** A short level (or slanted) eye stroke. */
function Bar({ color, width, rotate }: { color: string; width: number; rotate?: string }) {
  return <View style={{ width, height: STROKE, borderRadius: STROKE / 2, backgroundColor: color, transform: rotate ? [{ rotate }] : undefined }} />;
}

function Eyes({ color, mouth }: { color: string; mouth: ReadinessMouth }) {
  if (mouth === "grin") {
    // delight — happy closed ⌒ arcs
    return (
      <View style={{ flexDirection: "row", gap: 6, alignItems: "flex-end" }}>
        <Arc color={color} width={10} depth={4} shape="peak" />
        <Arc color={color} width={10} depth={4} shape="peak" />
      </View>
    );
  }
  if (mouth === "frown") {
    // wrecked — eyes droop outward: left "/" and right "\"
    return (
      <View style={{ flexDirection: "row", gap: 7, alignItems: "center" }}>
        <Bar color={color} width={7} rotate="-20deg" />
        <Bar color={color} width={7} rotate="20deg" />
      </View>
    );
  }
  // smile / flat — calm level strokes
  return (
    <View style={{ flexDirection: "row", gap: 7, alignItems: "center" }}>
      <Bar color={color} width={5.5} />
      <Bar color={color} width={5.5} />
    </View>
  );
}

function Mouth({ color, mouth }: { color: string; mouth: ReadinessMouth }) {
  if (mouth === "flat") return <Bar color={color} width={12} />;
  if (mouth === "frown") return <Arc color={color} width={14} depth={5} shape="peak" />;
  return <Arc color={color} width={15} depth={mouth === "grin" ? 7 : 5} shape="valley" />;
}

/** Minimal readiness face — eyes + a mood-shaped mouth (no ring). */
function Face({ color, mouth }: { color: string; mouth: ReadinessMouth }) {
  return (
    <View style={{ width: 34, height: 34, alignItems: "center", justifyContent: "center", gap: 5 }}>
      <Eyes color={color} mouth={mouth} />
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
