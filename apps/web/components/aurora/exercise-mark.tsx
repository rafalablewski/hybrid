import { auroraIconStroke, exerciseMarkPaths } from "@hybrid/core";

/**
 * The EXERCISE MARK (web) — the implement a lift is done with, drawn as a line
 * glyph for its 40px tile. Inline <svg> from the shared @hybrid/core path data
 * at the shared `auroraIconStroke(size)` weight, so it carries the same optical
 * weight as every other Aurora glyph, and the same weight as its mobile twin
 * (apps/mobile/components/aurora/exercise-mark.tsx).
 *
 * Always draws something: a gym lift gets its implement, a catalog sport reuses
 * its sport mark, anything else gets the neutral custom mark.
 */
export default function AuroraExerciseMark({
  name,
  size = 22,
  color = "currentColor",
}: {
  name: string;
  size?: number;
  color?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" fill="none" aria-hidden="true" style={{ display: "block", flex: "none" }}>
      {exerciseMarkPaths(name).map((d, i) => (
        <path key={i} d={d} stroke={color} strokeWidth={auroraIconStroke(size)} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}
