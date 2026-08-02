import type { ReactNode } from "react";

// CTA label with a crisp trailing arrow. The i18n "start" strings end in "→"
// (U+2192), but Archivo — the display webfont — doesn't ship that glyph in the
// loaded subset, so the browser falls back to a system font just for the arrow:
// wrong weight, wrong side-bearings, an ugly wide gap. We strip the trailing
// arrow from the text and draw it as an inline SVG instead, so it always matches
// the label's colour (currentColor) and weight with a fixed, tight gap.
// Labels without a trailing arrow (Do it now, Start early, …) render unchanged.
const TRAILING_ARROW = /\s*[→↦➔➜]\s*$/u;

/** The arrow on its own — CtaLabel's exact drawing, for standalone chevron
 *  affordances (round "see all" tiles, row-end arrows) and non-string label
 *  slots. `size` is the arrow's WIDTH; height keeps the 17:13 drawing ratio.
 *  Inherits currentColor like the label version. */
export function ArrowGlyph({ size = 17, style }: { size?: number; style?: React.CSSProperties }): ReactNode {
  return (
    <svg width={size} height={Math.round((size * 13) / 17)} viewBox="0 0 17 13" fill="none" aria-hidden="true" focusable="false" style={{ display: "block", flex: "0 0 auto", ...style }}>
      <path d="M1 6.5h13.5M9.5 1.5l5 5-5 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CtaLabel({ children, size = 17 }: { children: string; size?: number }): ReactNode {
  const hasArrow = TRAILING_ARROW.test(children);
  const text = children.replace(TRAILING_ARROW, "");
  if (!hasArrow) return text;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: size < 16 ? 4 : 8, verticalAlign: "middle" }}>
      {text}
      <ArrowGlyph size={size} />
    </span>
  );
}
