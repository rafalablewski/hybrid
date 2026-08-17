import type { StyleProp, ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import {
  DEVICE_MARK_HEIGHT,
  DEVICE_MARK_INK,
  deviceMarkFor,
  deviceMarkWidth,
  type DeviceMarkForm,
  type DeviceMarkSurface,
} from "@hybrid/core";

/**
 * DEVICE MARK (mobile) — the logo a matched session signs itself with, drawn
 * as a true vector from the shared @hybrid/core path data. The web renderer
 * draws the SAME paths, so the two clients are pixel-identical at every size.
 *
 * There is deliberately NO `color` prop. A manufacturer's logo reproduces in
 * solid black or solid white and nothing else, so the caller names the SURFACE
 * it sits on and the ink comes from DEVICE_MARK_INK. The mark cannot be tinted
 * by a screen, a theme, or a future edit — see core/device-marks.ts.
 *
 * Height is the only size input; the width follows from the artwork, so the
 * aspect ratio survives any layout.
 */
export function DeviceMark({
  provider,
  form = "lockup",
  height = 11,
  on = "dark",
  label,
  style,
}: {
  /** DeviceWorkout.provider — "apple" today. */
  provider: string | null | undefined;
  /** `lockup` names the device, `mark` is the compact status glyph. */
  form?: DeviceMarkForm;
  /** Cap height in px. Below the artwork's own `minPx` the counters fill in. */
  height?: number;
  /** The ground it sits on. The Wrapped panels and the match sheet are dark
   *  whatever the theme does, so they pass "dark" explicitly. */
  on?: DeviceMarkSurface;
  /** Overrides the drawing's own screen-reader label. Pass "" to hide it from
   *  assistive tech when adjacent copy already names the device. */
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const art = deviceMarkFor(provider, form);
  // No artwork for this connector — the caller falls back to naming the device
  // in text with `deviceSourceLabel`.
  if (!art) return null;
  const name = label ?? art.label;
  return (
    <Svg
      width={deviceMarkWidth(art, height)}
      height={height}
      viewBox={`0 0 ${art.width} ${DEVICE_MARK_HEIGHT}`}
      style={style}
      accessibilityRole={name ? "image" : undefined}
      accessibilityLabel={name || undefined}
      accessibilityElementsHidden={!name}
      importantForAccessibility={name ? "yes" : "no-hide-descendants"}
    >
      {art.paths.map((d, i) => (
        <Path key={i} d={d} fill={DEVICE_MARK_INK[on]} fillRule="evenodd" />
      ))}
    </Svg>
  );
}
