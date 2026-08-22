/**
 * (family, weight) → the font binary that carries it TODAY.
 *
 * Pure data, in its own file rather than in `ui.tsx`, so the design-token guard
 * can import it without pulling React Native into a source-scanning test.
 *
 * ── THE MAP IS LOSSY ON PURPOSE ────────────────────────────────────────────
 *
 * `theme/typography.ts` specifies four weights per cut. The app loads four
 * Archivo and two JetBrains Mono, so sans 500 resolves to the same binary as
 * 600 and mono 500 to the same as 400. That is not a fudge to be tidied later —
 * it is exactly the indirection that makes the face swap one edit: a call site
 * names the weight it MEANS, and this map says which binary is available to
 * mean it. When Söhne lands, this becomes 1:1 and no call site changes.
 *
 * ARCHIVO BLACK (900) IS DELIBERATELY ABSENT. The system caps at 700, and
 * dropping the app's 294 Black call sites to 600/700 is a real visual change
 * that belongs with the face swap, where it can be judged against the face it
 * was designed for. Until then a heading keeps its `F.black` and stays off the
 * named tokens — which is why the migration is scoped to the styles that render
 * identically to what shipped.
 *
 * A MISSING pair is not lossy, it is a bug: `ty()` would fall back to the
 * regular face, which is a silent wrong weight — the same failure mode as an
 * unresolvable PostScript name in SwiftUI. `design-tokens.test.ts` fails the
 * build if any named style resolves to a pair this map does not carry.
 */
export const FACE: Record<string, string> = {
  "Archivo:400": "Archivo_400Regular",
  "Archivo:500": "Archivo_600SemiBold", // no Archivo 500 loaded; SemiBold is the nearest above
  "Archivo:600": "Archivo_600SemiBold",
  "Archivo:700": "Archivo_700Bold",
  "JetBrains Mono:400": "JetBrainsMono_400Regular",
  "JetBrains Mono:500": "JetBrainsMono_400Regular", // no 500 mono loaded
  "JetBrains Mono:600": "JetBrainsMono_700Bold",
};

export const faceFor = (family: string, weight: number): string | undefined => FACE[`${family}:${weight}`];
