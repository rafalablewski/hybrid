import { useCallback, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, type GestureResponderEvent } from "react-native";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import { TOUCH_LIGHT, durations } from "@hybrid/core";
import { useTheme } from "../../lib/theme";
import { useReducedMotion } from "../../lib/use-reduced-motion";

/**
 * THE TOUCH LIGHT — the RN half of the press the material answers natively.
 *
 * On iOS 26 a control handed wholesale to SwiftUI (`swiftui.tsx`'s leaves, all
 * passing `glass: { interactive: true }`) lights itself under the finger. Every
 * other control in the app is drawn by React Native, RN takes the press, and
 * the shared `PressScale` answers it with a 3% scale-down — feedback about the
 * BUTTON, not about where you touched it. This draws the missing half, so a
 * satellite confirms a tap the same way whether or not its mark happened to
 * exist as an SF Symbol. `TOUCH_LIGHT` in @hybrid/core carries the numbers and
 * the reasoning for each of them.
 *
 * A HOOK, not a wrapper component, for one reason: the light has to be a CHILD
 * of the pressed surface (it is positioned in that surface's coordinate space
 * and clipped by that surface's radius), and its handlers have to be that
 * surface's own. A wrapper would be a second view around the control — a new
 * layout node between every button and its parent — and it still could not see
 * the press. So the caller spreads `handlers` and renders `light` as its first
 * child.
 *
 * THE CALLER MUST CLIP. The pool bleeds past the control's edges by
 * construction (that is what makes it a light and not a disc), so a host
 * without `overflow: "hidden"` gets a rectangle of glow outside its own
 * rounded shape. Every current caller was already clipped — this is the same
 * contract `APressCard`'s corner glow states, and the same reason it states it.
 * The clip is NOT set here: on iOS `overflow: "hidden"` sets masksToBounds and
 * takes the shadow with it, so a primitive that clipped on the caller's behalf
 * would silently kill `cardShadow()` on any surface that has one.
 *
 * NOT ON THE NATIVE LEAVES. Where the real material renders the press
 * (`GlassSatellite`, `GlassNavButton`, `GlassToolbarGroup`), drawing this on
 * top would be two lights for one touch. The callers here sit on the RN branch
 * by construction — `ASatellite` picks its renderer once and only the RN side
 * asks for a light.
 *
 * REDUCE MOTION gets nothing rather than a substitution, and that is the
 * documented exception rather than a lapse: the substitution rule exists so a
 * user still perceives a CHANGE, and `PressScale` already reports every press
 * with an opacity dip under Reduce Motion. A second, still confirmation of the
 * same tap is decorative — the one category `use-reduced-motion` says should
 * simply stop.
 */
export function useTouchLight(hue?: string): {
  /** Spread onto the pressed surface. Chains with any handlers it already has. */
  handlers: { onPressIn: (e: GestureResponderEvent) => void; onPressOut: () => void };
  /** Render as the surface's FIRST child, under its content. */
  light: ReactNode;
} {
  const { palette } = useTheme();
  const reduced = useReducedMotion();
  // The gradient's id must be unique per mounted instance: react-native-svg
  // resolves `url(#…)` against a document-wide table, so two lit controls on
  // one screen sharing an id would both paint whichever one mounted last.
  const gid = useId();
  const v = useRef(new Animated.Value(0)).current;
  // Where the finger landed, in the host's own coordinates. Null between
  // presses so nothing is mounted while the control is at rest — this is the
  // one place the app renders an SVG per touch, and it should not outlive it.
  const [pt, setPt] = useState<{ x: number; y: number } | null>(null);

  const onPressIn = useCallback(
    (e: GestureResponderEvent) => {
      if (reduced) return;
      setPt({ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY });
      Animated.timing(v, {
        toValue: 1,
        duration: TOUCH_LIGHT.bloomMs,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    },
    [reduced, v],
  );

  const onPressOut = useCallback(() => {
    if (reduced) return;
    Animated.timing(v, {
      toValue: 0,
      // A release is a recovery, not an input — the same reading `PressScale`
      // makes when it lets go slower than it presses.
      duration: durations.fast,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      // Only unmount on a run that actually reached zero. A press that arrives
      // mid-fade retargets this animation, and clearing the point on the
      // interrupted callback would pull the pool out from under the new touch.
      if (finished) setPt(null);
    });
  }, [reduced, v]);

  const handlers = useMemo(() => ({ onPressIn, onPressOut }), [onPressIn, onPressOut]);

  const D = TOUCH_LIGHT.diameter;
  const tint = hue ?? palette.chalk;
  const light = pt ? (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: pt.x - D / 2,
        top: pt.y - D / 2,
        width: D,
        height: D,
        opacity: v,
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [TOUCH_LIGHT.from, 1] }) }],
      }}
    >
      {/* A REAL radial falloff, not stacked concentric views. The ambient field
          fakes its blobs that way because they are 300dp wide and permanently
          on screen, where banding is invisible and an SVG would be a persistent
          cost; a 132dp pool is small enough that the steps in a faked ramp read
          as rings, and this one is mounted for the length of a press. */}
      <Svg width={D} height={D}>
        <Defs>
          <RadialGradient id={gid} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={tint} stopOpacity={TOUCH_LIGHT.core} />
            <Stop offset={String(TOUCH_LIGHT.midStop)} stopColor={tint} stopOpacity={TOUCH_LIGHT.mid} />
            <Stop offset="1" stopColor={tint} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={D / 2} cy={D / 2} r={D / 2} fill={`url(#${gid})`} />
      </Svg>
    </Animated.View>
  ) : null;

  return { handlers, light };
}
