import { useEffect, useRef, useState } from "react";
import { Animated, Easing, View } from "react-native";
import { READINESS_FACE, durations, type ReadinessFeeling, type ReadinessMouth } from "@hybrid/core";
import { useTheme, txt } from "../../lib/theme";
import { useReducedMotion } from "../../lib/use-reduced-motion";

// The faces are drawn in the kaomoji vocabulary — (^‿^) — with one consistent
// 2px round-capped stroke, so they read as a crafted pictogram set, not crayon
// dots. The EYES carry as much of the expression as the mouth: delight closes
// them into happy ⌒ arcs, calm/flat keeps level strokes, wrecked droops them
// outward. Keyed by the shared mouth so core needs no new vocabulary. Mirrors
// the web <ReadinessFace> SVG paths.
//
// THE FACE MORPHS. When `feeling` changes, the features travel to the new
// expression instead of being swapped for it — the web twin interpolates its
// SVG paths, and this side does the same thing in the plain-View vocabulary
// (still no react-native-svg dep): every expression is ONE parameter set on
// ONE subtree. The mouth is a signed curvature — positive bows down (‿, the
// bottom of a clipped circle), negative bows up (⌒, the top), zero is the
// flat bar — so a frown becoming a grin flattens through the straight mouth
// mid-flight, which is exactly how a face changes its mind. The bar and the
// arc cross-fade around zero because a circle cannot flatten to a line; the
// hand-over hides inside the morph.

const STROKE = 2;

/** Everything one expression IS, as numbers the animation can travel between.
 *  `mouthK`: signed mouth curvature (+ = valley ‿, − = peak ⌒, 0 = flat bar).
 *  `eyeK`: eye character (+ = happy closed arc, 0 = level stroke, − = droop). */
const FACE_PARAMS: Record<ReadinessMouth, { mouthK: number; mouthW: number; eyeK: number }> = {
  grin: { mouthK: 7, mouthW: 15, eyeK: 4 },
  smile: { mouthK: 5, mouthW: 15, eyeK: 0 },
  flat: { mouthK: 0, mouthW: 12, eyeK: 0 },
  frown: { mouthK: -5, mouthW: 14, eyeK: -4 },
};

function MorphFace({ color, mouth }: { color: string; mouth: ReadinessMouth }) {
  const reduced = useReducedMotion();
  const t = useRef(new Animated.Value(1)).current;
  // From → to as plain state, so the interpolations below rebuild exactly when
  // a leg starts. A change mid-flight restarts from the previous REST pose —
  // the 1–5 scale row re-taps faster than a half-finished pose is worth.
  const [leg, setLeg] = useState({ from: mouth, to: mouth, fromColor: color, toColor: color });
  useEffect(() => {
    if (leg.to === mouth && leg.toColor === color) return;
    setLeg({ from: leg.to, to: mouth, fromColor: leg.toColor, toColor: color });
    t.setValue(0);
    // The crossfade duration, same as the web twin: a change between two
    // states of one box is where the eye compares them. Under Reduce Motion
    // the swap is the substitution.
    Animated.timing(t, { toValue: 1, duration: reduced ? 0 : durations.crossfade, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [mouth, color, leg, t, reduced]);

  const from = FACE_PARAMS[leg.from];
  const to = FACE_PARAMS[leg.to];
  const col = leg.fromColor === leg.toColor
    ? leg.toColor
    : t.interpolate({ inputRange: [0, 1], outputRange: [leg.fromColor, leg.toColor] });

  // ── mouth ──
  const mk = t.interpolate({ inputRange: [0, 1], outputRange: [from.mouthK, to.mouthK] });
  const mw = t.interpolate({ inputRange: [0, 1], outputRange: [from.mouthW, to.mouthW] });
  // |k| with a floor, piecewise around zero — the arc's visible slice.
  const mouthDepth = mk.interpolate({ inputRange: [-7, 0, 7], outputRange: [7, 0.5, 7], extrapolate: "clamp" });
  const mouthH = mk.interpolate({ inputRange: [-7, 0, 7], outputRange: [7, STROKE, 7], extrapolate: "clamp" });
  // 1 when the curve bows down (valley — the clipped circle shows its bottom,
  // so it is pulled up by its own height), 0 when it bows up (top slice stays).
  const valley = mk.interpolate({ inputRange: [-0.5, 0.5], outputRange: [0, 1], extrapolate: "clamp" });
  const circleShift = Animated.multiply(valley, Animated.subtract(mouthDepth, mw));
  const mouthArcOp = mk.interpolate({ inputRange: [-2, 0, 2], outputRange: [1, 0, 1], extrapolate: "clamp" });
  const mouthBarOp = mk.interpolate({ inputRange: [-2, 0, 2], outputRange: [0, 1, 0], extrapolate: "clamp" });

  // ── eyes ──
  const ek = t.interpolate({ inputRange: [0, 1], outputRange: [from.eyeK, to.eyeK] });
  const eyeArcOp = ek.interpolate({ inputRange: [0.5, 2.5], outputRange: [0, 1], extrapolate: "clamp" });
  const eyeBarOp = ek.interpolate({ inputRange: [0.5, 2.5], outputRange: [1, 0], extrapolate: "clamp" });
  const eyeBarW = ek.interpolate({ inputRange: [-4, 0, 4], outputRange: [7, 5.5, 5.5], extrapolate: "clamp" });
  const eyeDepth = ek.interpolate({ inputRange: [0.3, 4], outputRange: [0.3, 4], extrapolate: "clamp" });
  const eyeH = ek.interpolate({ inputRange: [0, 4], outputRange: [STROKE, 4], extrapolate: "clamp" });
  const eyeGap = ek.interpolate({ inputRange: [0, 4], outputRange: [8, 6], extrapolate: "clamp" });
  // wrecked droops the strokes outward: left "/" and right "\".
  const eyeRotL = ek.interpolate({ inputRange: [-4, 0], outputRange: ["-20deg", "0deg"], extrapolate: "clamp" });
  const eyeRotR = ek.interpolate({ inputRange: [-4, 0], outputRange: ["20deg", "0deg"], extrapolate: "clamp" });

  const eye = (rot: Animated.AnimatedInterpolation<string>, first: boolean) => (
    <Animated.View style={{ width: 10, height: eyeH, alignItems: "center", justifyContent: "center", marginLeft: first ? 0 : eyeGap }}>
      <Animated.View style={{ position: "absolute", width: eyeBarW, height: STROKE, borderRadius: STROKE / 2, backgroundColor: col, opacity: eyeBarOp, transform: [{ rotate: rot }] }} />
      <Animated.View style={{ width: 10, height: eyeDepth, overflow: "hidden", alignItems: "center", opacity: eyeArcOp }}>
        <Animated.View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: STROKE, borderColor: col }} />
      </Animated.View>
    </Animated.View>
  );

  return (
    <View style={{ width: 34, height: 34, alignItems: "center", justifyContent: "center", gap: 5 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {eye(eyeRotL, true)}
        {eye(eyeRotR, false)}
      </View>
      <Animated.View style={{ height: mouthH, alignItems: "center", justifyContent: "center" }}>
        <Animated.View style={{ position: "absolute", width: 12, height: STROKE, borderRadius: STROKE / 2, backgroundColor: col, opacity: mouthBarOp }} />
        <Animated.View style={{ width: mw, height: mouthDepth, overflow: "hidden", alignItems: "center", opacity: mouthArcOp }}>
          <Animated.View style={{ width: mw, height: mw, borderRadius: Animated.divide(mw, 2), borderWidth: STROKE, borderColor: col, marginTop: circleShift }} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/**
 * Readiness face for a FEELING, drawn in the semantic accent colour. Shared by
 * the Readiness picker (scale 1) and the Today glance strip (scaled down) so
 * both render the identical face. Mirrors the web <ReadinessFace> SVG. When
 * `feeling` changes the features MORPH to the new expression — the check-in
 * hero face is the same face changing its mind, not four faces taking turns.
 */
export default function ReadinessFace({ feeling, scale = 1, tone }: { feeling: ReadinessFeeling; scale?: number; tone?: string }) {
  const { palette: C } = useTheme();
  const { mouth, accent } = READINESS_FACE[feeling];
  // `tone` draws the face in a neutral (or any) colour instead of its semantic
  // accent — for clusters where the one-accent discipline says the hue may
  // appear only once (the readings record marks the governing read that way).
  // The EXPRESSION survives it: it is carried by the stroke, not the tint.
  const color = tone ?? txt(C, C[accent]);
  const face = <MorphFace color={color} mouth={mouth} />;
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
