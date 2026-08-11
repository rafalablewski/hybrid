"use client";

import type { CSSProperties, ReactNode } from "react";
import { SATELLITE } from "@hybrid/core";
import { fs } from "@/lib/ui";

/**
 * SATELLITE — the ONE neutral glass button, and the TWIN of
 * apps/mobile/components/aurora/satellite.tsx.
 *
 * A satellite orbits a filled primary: Pause and Finish beside Log set, the
 * ★ / → around Share on the finish summary, "Keep going" beside the Finish
 * confirm. The geometry and the rim are @hybrid/core `SATELLITE` — see that
 * file for why the same button had been drawn four ways in one screen.
 *
 * On web the material is CSS rather than SwiftUI (the mobile twin hands the
 * whole button to a real glass Button on iOS 26), so the drawing here is the
 * app's glass grammar at the shared alphas: a chalk fill inside a chalk ring,
 * a backdrop blur, and the specular highlight above / shade below that every
 * other glass surface in the app wears. The one thing it does NOT wear is a
 * second accent — the filled primary beside it is the screen's only "go".
 */
const face = (on?: boolean): CSSProperties => ({
  borderRadius: 999,
  background: `color-mix(in srgb, var(--color-chalk) ${(on ? SATELLITE.alpha.onFill : SATELLITE.alpha.fill) * 100}%, transparent)`,
  border: `1px solid color-mix(in srgb, var(--color-chalk) ${(on ? SATELLITE.alpha.onStroke : SATELLITE.alpha.stroke) * 100}%, transparent)`,
  backdropFilter: "blur(14px) saturate(1.4)",
  WebkitBackdropFilter: "blur(14px) saturate(1.4)",
  boxShadow: "inset 0 1.5px 0 var(--inner-hi), inset 0 -1px 1px var(--inner-lo)",
  color: "var(--color-chalk)",
  cursor: "pointer",
  flex: "none",
});

export default function Satellite({
  onClick,
  a11y,
  mark,
  word,
  caption,
  on,
  fg,
  size = SATELLITE.size,
  disabled,
  style,
}: {
  onClick: () => void;
  /** The full spoken phrase — the only name a bare circle has. */
  a11y: string;
  /** The glyph: a node, or a bare character for the marks the shared vector set
   *  does not carry yet (✕, ★). Optional only for a `word` capsule. */
  mark?: ReactNode;
  /** Present → a labelled capsule instead of a circle. */
  word?: string;
  /** A mono caption UNDER the circle — the summary cluster's ROUTINE /
   *  ANALYSIS. It names the button in place; it never changes it. */
  caption?: string;
  /** The one state: holding something open (the ★'s composer). */
  on?: boolean;
  /** Overrides chalk — `pause` goes amber while a session is held. */
  fg?: string;
  size?: number;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  const button = (
    <button
      className="pressable"
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={a11y}
      aria-pressed={on}
      title={a11y}
      style={{
        ...face(on),
        height: size,
        width: word ? undefined : size,
        padding: word ? `0 ${SATELLITE.wordPad}px` : 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        fontFamily: "var(--font-display)",
        fontWeight: 700,
        fontSize: word ? fs.body : Math.round(size * 0.36),
        ...(fg ? { color: fg } : null),
        ...style,
      }}
    >
      {mark}
      {word}
    </button>
  );
  if (!caption) return button;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: Math.max(size, 62), flex: "0 0 auto" }}>
      {button}
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: fs.nano,
          letterSpacing: ".12em",
          color: "var(--color-ash)",
          marginTop: SATELLITE.captionGap,
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        {caption}
      </div>
    </div>
  );
}
