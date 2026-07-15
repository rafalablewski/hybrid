import type { ReactNode } from "react";

// CTA label with a crisp trailing arrow. The i18n "start" strings end in "→"
// (U+2192), but Archivo — the display webfont — doesn't ship that glyph in the
// loaded subset, so the browser falls back to a system font just for the arrow:
// wrong weight, wrong side-bearings, an ugly wide gap. We strip the trailing
// arrow from the text and draw it as an inline SVG instead, so it always matches
// the label's colour (currentColor) and weight with a fixed, tight gap.
// Labels without a trailing arrow (Do it now, Start early, …) render unchanged.
const TRAILING_ARROW = /\s*[→↦➔➜]\s*$/u;

export function CtaLabel({ children }: { children: string }): ReactNode {
  const hasArrow = TRAILING_ARROW.test(children);
  const text = children.replace(TRAILING_ARROW, "");
  if (!hasArrow) return text;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, verticalAlign: "middle" }}>
      {text}
      <svg width="17" height="13" viewBox="0 0 17 13" fill="none" aria-hidden="true" focusable="false" style={{ display: "block", flex: "0 0 auto" }}>
        <path d="M1 6.5h13.5M9.5 1.5l5 5-5 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
