import {
  AURORA_ICON_PATHS,
  auroraIconStroke,
  glyphPaths,
  sportMarkPaths,
  type AuroraIconName,
  type GlyphName,
} from "@hybrid/core";

/**
 * Aurora line icons (web). Inline <svg> rendered from the shared @hybrid/core
 * path data, stroked with currentColor so they inherit the brand colour. Names
 * and stroke weight (`auroraIconStroke`) stay in lockstep with the mobile
 * vector renderer.
 *
 * `Glyph` and `SportMark` are the twins of the mobile renderers in
 * apps/mobile/components/aurora/icons.tsx — one vocabulary, one stroke rule,
 * both clients. See core theme/icons.ts for why the four path maps are four
 * ORIGINS and not four languages.
 */
function Stroked({
  paths,
  size,
  color,
  strokeWidth,
  style,
}: {
  paths: string[];
  size: number;
  color: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" fill="none" style={style} aria-hidden="true">
      {paths.map((d, i) => (
        <path key={i} d={d} stroke={color} strokeWidth={strokeWidth ?? auroraIconStroke(size)} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

export function AuroraIcon({
  name,
  size = 22,
  color = "currentColor",
  strokeWidth,
  style,
}: {
  name: AuroraIconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}) {
  return <Stroked paths={AURORA_ICON_PATHS[name]} size={size} color={color} strokeWidth={strokeWidth} style={style} />;
}

/** Any mark in the one vocabulary. Defaults to `currentColor` — on web the
 *  inherited ink IS a palette colour, which is why this may default where the
 *  mobile twin may not. */
export function Glyph({
  name,
  size = 22,
  color = "currentColor",
  strokeWidth,
  style,
}: {
  name: GlyphName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}) {
  return <Stroked paths={glyphPaths(name)} size={size} color={color} strokeWidth={strokeWidth} style={style} />;
}

/** A sport's own drawing, resolved from its name. See the mobile twin. */
export function SportMark({
  sport,
  size = 22,
  color = "currentColor",
  fallback = "target",
  strokeWidth,
  style,
}: {
  sport: string;
  size?: number;
  color?: string;
  fallback?: GlyphName;
  strokeWidth?: number;
  style?: React.CSSProperties;
}) {
  const paths = sportMarkPaths(sport);
  return <Stroked paths={paths.length ? paths : glyphPaths(fallback)} size={size} color={color} strokeWidth={strokeWidth} style={style} />;
}
