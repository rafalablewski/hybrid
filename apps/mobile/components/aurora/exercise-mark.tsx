import Svg, { Path } from "react-native-svg";
import { auroraIconStroke, exerciseMarkPaths } from "@hybrid/core";

/**
 * The EXERCISE MARK (mobile) — the implement a lift is done with, drawn as a
 * line glyph for its 40px tile. A TRUE VECTOR via react-native-svg, stroked
 * from the shared @hybrid/core path data at the shared `auroraIconStroke(size)`
 * weight, so it matches web exactly (apps/web/components/aurora/exercise-mark.tsx)
 * and sits at the same optical weight as the rest of the Aurora icon set.
 *
 * Always draws something: a gym lift gets its implement, a catalog sport reuses
 * its sport mark, anything else gets the neutral custom mark.
 */
export default function AuroraExerciseMark({
  name,
  size = 22,
  color,
}: {
  name: string;
  size?: number;
  color: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 72 72" fill="none">
      {exerciseMarkPaths(name).map((d, i) => (
        <Path key={i} d={d} stroke={color} strokeWidth={auroraIconStroke(size)} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  );
}
