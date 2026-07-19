import { READINESS_FACE, type ReadinessFeeling, type ReadinessMouth } from "@hybrid/core";

// Accent-as-foreground token — the theme-aware, AA-guarded tone for an accent
// drawn as thin strokes (globals.css --*-text; see palette.ts accentText).
const AT = (v: string) => `var(--${v}-text)`;

// The faces are drawn in the kaomoji vocabulary — (^‿^) — with one consistent
// 2px round-capped stroke, so they read as a crafted pictogram set, not crayon
// dots. The EYES carry as much of the expression as the mouth: delight closes
// them into happy ⌒ arcs, calm/flat keeps level strokes, wrecked droops them
// outward. Keyed by the shared mouth so core needs no new vocabulary.
const EYES: Record<ReadinessMouth, string> = {
  grin: "M10.6 17.2 Q13.6 14.4 16.6 17.2 M23.4 17.2 Q26.4 14.4 29.4 17.2",
  smile: "M11 16.4 L15.6 16.4 M24.4 16.4 L29 16.4",
  flat: "M11 16.4 L15.6 16.4 M24.4 16.4 L29 16.4",
  frown: "M16.4 15.2 L11 17.6 M23.6 15.2 L29 17.6",
};

// Mouth path per expression, on the shared 40×40 viewBox.
const MOUTH: Record<ReadinessMouth, string> = {
  grin: "M12.5 22.5 Q20 30 27.5 22.5",
  smile: "M13.5 23 Q20 28.4 26.5 23",
  flat: "M14 25 L26 25",
  frown: "M13.5 27.6 Q20 22.4 26.5 27.6",
};

/**
 * Minimal readiness face — eyes + a mood-shaped mouth, drawn in the feeling's
 * semantic accent colour (no enclosing ring). Shared by the Readiness picker
 * and the Today glance strip so both render the identical face; mirrors the
 * mobile plain-View ReadinessFace.
 */
export default function ReadinessFace({ feeling, size = 34 }: { feeling: ReadinessFeeling; size?: number }) {
  const { mouth, accent } = READINESS_FACE[feeling];
  const color = AT(accent);
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden style={{ flexShrink: 0 }}>
      <path d={EYES[mouth]} stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
      <path d={MOUTH[mouth]} stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
    </svg>
  );
}
