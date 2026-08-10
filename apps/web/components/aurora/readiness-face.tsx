import { READINESS_FACE, type ReadinessFeeling, type ReadinessMouth } from "@hybrid/core";
import type { CSSProperties } from "react";

// Accent-as-foreground token — the theme-aware, AA-guarded tone for an accent
// drawn as thin strokes (globals.css --*-text; see palette.ts accentText).
const AT = (v: string) => `var(--${v}-text)`;

// The faces are drawn in the kaomoji vocabulary — (^‿^) — with one consistent
// 2px round-capped stroke, so they read as a crafted pictogram set, not crayon
// dots. The EYES carry as much of the expression as the mouth: delight closes
// them into happy ⌒ arcs, calm/flat keeps level strokes, wrecked droops them
// outward. Keyed by the shared mouth so core needs no new vocabulary.
//
// EVERY STATE IS THE SAME PATH SIGNATURE — each eye one quadratic, the mouth
// one quadratic — with a straight stroke written as a curve whose control
// point sits on the line. That is what lets the face MORPH between feelings
// instead of swapping: the browser can only interpolate `d` when the command
// lists match, so "flat" is a Q that happens to be straight, not an L. The
// endpoints always read left → right so a droop never interpolates through a
// mirror of itself.
const EYES: Record<ReadinessMouth, string> = {
  grin: "M10.6 17.2 Q13.6 14.4 16.6 17.2 M23.4 17.2 Q26.4 14.4 29.4 17.2",
  smile: "M11 16.4 Q13.3 16.4 15.6 16.4 M24.4 16.4 Q26.7 16.4 29 16.4",
  flat: "M11 16.4 Q13.3 16.4 15.6 16.4 M24.4 16.4 Q26.7 16.4 29 16.4",
  frown: "M11 17.6 Q13.7 16.4 16.4 15.2 M23.6 15.2 Q26.3 16.4 29 17.6",
};

// Mouth path per expression, on the shared 40×40 viewBox.
const MOUTH: Record<ReadinessMouth, string> = {
  grin: "M12.5 22.5 Q20 30 27.5 22.5",
  smile: "M13.5 23 Q20 28.4 26.5 23",
  flat: "M14 25 Q20 25 26 25",
  frown: "M13.5 27.6 Q20 22.4 26.5 27.6",
};

// The morph rides the crossfade duration: a change between two states of one
// box is where the eye compares them, same reasoning as skeleton → content.
// CSS `d` is the styled twin of the attribute — engines that don't animate it
// (it is not universal) fall back to the attribute's instant swap, which is
// exactly what this replaced, so nothing breaks below the flourish.
const MORPH: CSSProperties = { transition: "d var(--d-crossfade) var(--e-fade), stroke var(--d-crossfade) var(--e-fade)" };

/**
 * Minimal readiness face — eyes + a mood-shaped mouth, drawn in the feeling's
 * semantic accent colour (no enclosing ring). Shared by the Readiness picker
 * and the Today glance strip so both render the identical face; mirrors the
 * mobile plain-View ReadinessFace. When `feeling` changes the features MORPH
 * to the new expression — the check-in hero face is the same face changing its
 * mind, not four faces taking turns.
 */
export default function ReadinessFace({ feeling, size = 34, tone }: { feeling: ReadinessFeeling; size?: number; tone?: string }) {
  const { mouth, accent } = READINESS_FACE[feeling];
  // `tone` draws the face in a neutral (or any) colour instead of its semantic
  // accent — for clusters where the one-accent discipline says the hue may
  // appear only once (the readings record marks the governing read that way).
  // The EXPRESSION survives it: it is carried by the stroke, not the tint.
  const color = tone ?? AT(accent);
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden style={{ flexShrink: 0 }}>
      <path d={EYES[mouth]} stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" style={{ ...MORPH, d: `path("${EYES[mouth]}")` } as CSSProperties} />
      <path d={MOUTH[mouth]} stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" style={{ ...MORPH, d: `path("${MOUTH[mouth]}")` } as CSSProperties} />
    </svg>
  );
}
