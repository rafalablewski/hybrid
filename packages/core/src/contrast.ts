/**
 * WCAG 2.x contrast ratio between two sRGB hex colours. Pure + dependency-free,
 * so theme palettes can be unit-tested for accessibility (see theme.test.ts).
 */

/** Parse `#rgb` or `#rrggbb` into [r,g,b] 0..255. */
function parseHex(hex: string): [number, number, number] {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) {
    throw new Error(`contrast: invalid hex colour "${hex}"`);
  }
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Relative luminance per WCAG. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** Contrast ratio (1..21) between two hex colours. Order-independent. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG thresholds: AA normal 4.5, AA large 3, AAA normal 7. */
export const WCAG = { AA: 4.5, AA_LARGE: 3, AAA: 7 } as const;

/** True if the pair meets the given WCAG level (default AA). */
export function meetsContrast(a: string, b: string, level: number = WCAG.AA): boolean {
  return contrastRatio(a, b) >= level;
}
