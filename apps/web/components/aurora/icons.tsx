import { AURORA_ICON_PATHS, type AuroraIconName } from "@hybrid/core";

/**
 * Aurora line icons (web). Inline <svg> rendered from the shared @hybrid/core
 * path data, stroked with currentColor so they inherit the brand colour. Names
 * stay in lockstep with the mobile PNG renderer.
 */
export function AuroraIcon({
  name,
  size = 22,
  color = "currentColor",
  strokeWidth = 3.5,
  style,
}: {
  name: AuroraIconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" fill="none" style={style} aria-hidden="true">
      {AURORA_ICON_PATHS[name].map((d, i) => (
        <path key={i} d={d} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}
