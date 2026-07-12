import { READINESS_FACE, type ReadinessFeeling, type ReadinessMouth } from "@hybrid/core";

// Accent-as-foreground token — the theme-aware, AA-guarded tone for an accent
// drawn as thin strokes (globals.css --*-text; see palette.ts accentText).
const AT = (v: string) => `var(--${v}-text)`;

// Mouth path per expression, on the shared 40×40 viewBox. Eyes are fixed; only
// the mouth changes. Grin/smile curve up, flat is a line, frown curves down.
const MOUTH: Record<ReadinessMouth, string> = {
  grin: "M12 23 Q20 31 28 23",
  smile: "M13 23 Q20 30 27 23",
  flat: "M13 25 L27 25",
  frown: "M13 28 Q20 21 27 28",
};

/**
 * Minimal readiness face — two eyes + a mood-shaped mouth, drawn in the
 * feeling's semantic accent colour (no enclosing ring). Shared by the Readiness
 * picker and the Today glance strip so both render the identical face; mirrors
 * the mobile plain-View ReadinessFace.
 */
export default function ReadinessFace({ feeling, size = 34 }: { feeling: ReadinessFeeling; size?: number }) {
  const { mouth, accent } = READINESS_FACE[feeling];
  const color = AT(accent);
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden style={{ flexShrink: 0 }}>
      <circle cx={13} cy={16} r={2.3} fill={color} />
      <circle cx={27} cy={16} r={2.3} fill={color} />
      <path d={MOUTH[mouth]} stroke={color} strokeWidth={2.8} strokeLinecap="round" fill="none" />
    </svg>
  );
}
