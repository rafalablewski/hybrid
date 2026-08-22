/**
 * (family, weight) → the font binary that carries it TODAY.
 *
 * Pure data, in its own file rather than in `ui.tsx`, so the design-token guard
 * can import it without pulling React Native into a source-scanning test.
 *
 * ── IT IS 1:1 NOW, WHICH IS WHAT THE INDIRECTION WAS FOR ───────────────────
 *
 * While the app ran Archivo this map was deliberately lossy: the system
 * specifies four weights per cut and only four Archivo plus two JetBrains Mono
 * were loaded, so sans 500 resolved to the same binary as 600. A call site
 * named the weight it MEANT and this map said which binary was available to
 * mean it. The face swap was then one edit here plus one in `F` — no call site
 * moved, which is the whole return on having built the layer.
 *
 * A MISSING pair is not lossy, it is a bug: `ty()` would fall back to the
 * regular face, which is a silent wrong weight — the same failure mode as an
 * unresolvable PostScript name in SwiftUI. `design-tokens.test.ts` fails the
 * build if any named style resolves to a pair this map does not carry.
 */
export const FACE: Record<string, string> = {
  "Söhne:400": "Sohne_400Buch",
  "Söhne:500": "Sohne_500Kraftig",
  "Söhne:600": "Sohne_600Halbfett",
  "Söhne:700": "Sohne_700Dreiviertelfett",
  "Söhne Mono:400": "SohneMono_400Buch",
  "Söhne Mono:500": "SohneMono_500Kraftig",
  "Söhne Mono:600": "SohneMono_600Halbfett",
  // ITC Garamond ships ONE weight on purpose — the editorial voice has no
  // emphasis axis. A bold serif beside Söhne Halbfett is two voices claiming
  // one rank, so `weight.regular` is the only key that can ever resolve here.
  "ITC Garamond Std:400": "ITCGaramondStd_400Bk",
};

export const faceFor = (family: string, weight: number): string | undefined => FACE[`${family}:${weight}`];
