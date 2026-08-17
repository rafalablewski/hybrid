import Svg, { Polygon, Circle } from "react-native-svg";
import { roomBodyMark, MUSCLE_SHORT, type Muscle } from "@hybrid/core";

/**
 * The ROOM MARK (mobile) — a muscle group drawn as the body it trains, for the
 * exercise picker's rooms grid. The room's own exercise list decides which
 * figure (front or back) and how brightly each muscle glows; see core's
 * roomBodyMark. Returns null when the room holds no lift the database knows (a
 * sports room), so the caller keeps its own glyph.
 */
export default function AuroraBodyMark({
  names,
  size = 32,
  color,
  silhouette,
}: {
  /** The lifts this room holds. */
  names: string[];
  size?: number;
  /** The glow colour for the lit muscles. */
  color: string;
  /** The unlit body underneath. */
  silhouette: string;
}) {
  const mark = roomBodyMark(names);
  if (!mark) return null;
  const { figure, intensityOf, top } = mark;
  const points = (poly: { x: number; y: number }[]) => poly.map((q) => `${q.x},${q.y}`).join(" ");

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" fill="none" accessibilityLabel={top ? MUSCLE_SHORT[top] : undefined}>
      {/* the unlit body: silhouette + head */}
      {figure.outline.map((poly, i) => (
        <Polygon key={i} points={points(poly)} fill={silhouette} />
      ))}
      <Circle cx={figure.head.cx} cy={figure.head.cy} r={figure.head.r} fill={silhouette} />
      {/* the muscles this room trains, glowing by share of its work */}
      {figure.regions.map((region) => {
        const intensity = intensityOf[region.muscle as Muscle];
        if (!intensity) return null;
        return region.shapes.map((poly, i) => (
          <Polygon key={`${region.muscle}-${i}`} points={points(poly)} fill={color} opacity={0.35 + 0.65 * intensity} />
        ));
      })}
    </Svg>
  );
}
