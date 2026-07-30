import {
  DEVICE_MARK_HEIGHT,
  DEVICE_MARK_INK,
  deviceMarkFor,
  deviceMarkWidth,
  type DeviceMarkForm,
  type DeviceMarkSurface,
} from "@hybrid/core";

/**
 * DEVICE MARK (web) — the logo a matched session signs itself with, drawn from
 * the shared @hybrid/core path data. Mobile renders the SAME paths through
 * react-native-svg (apps/mobile/components/aurora/device-mark.tsx).
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
  /** The ground it sits on. HYBRID's device surfaces are dark whatever the
   *  theme does; a themed surface passes its own scheme. */
  on?: DeviceMarkSurface;
  /** Overrides the drawing's own screen-reader label. Pass "" to hide it from
   *  assistive tech when adjacent copy already names the device. */
  label?: string;
  style?: React.CSSProperties;
}) {
  const art = deviceMarkFor(provider, form);
  // No artwork for this connector — the caller falls back to naming the device
  // in text with `deviceSourceLabel`.
  if (!art) return null;
  const name = label ?? art.label;
  return (
    <svg
      width={deviceMarkWidth(art, height)}
      height={height}
      viewBox={`0 0 ${art.width} ${DEVICE_MARK_HEIGHT}`}
      fill={DEVICE_MARK_INK[on]}
      fillRule="evenodd"
      clipRule="evenodd"
      role={name ? "img" : undefined}
      aria-label={name || undefined}
      aria-hidden={name ? undefined : true}
      style={{ display: "block", flex: "none", ...style }}
    >
      {art.paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
