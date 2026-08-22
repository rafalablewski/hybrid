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

/* ── PERCEPTUAL MIXING ─────────────────────────────────────────────────────
 *
 * `contrastRatio` answers "can this be read on that" and `deltaE2000` answers
 * "can these be told apart". Neither answers the third question a ramp asks:
 * what is HALFWAY between two colours — and the obvious answer, interpolating
 * the sRGB bytes, is wrong in a way you can see.
 *
 * IT SHIPPED WRONG ON THE DAY BAND'S FOOT. A filled band resolves into the page
 * ground over its bottom pad, and drawn as a plain two-stop gradient it came out
 * with a visible CREASE where the solid left off and a muddy olive stripe
 * through the middle. Two different faults, and only one of them is the colour
 * space:
 *
 *  - THE CREASE is the curve. A linear ramp has a discontinuous first
 *    derivative at both ends, so the eye finds the corner where the field stops
 *    being solid. `smoothstep` leaves and arrives tangentially, which is what
 *    makes a scrim read as shade rather than as a shape.
 *
 *  - THE MUD is the path, and it is only PARTLY fixable. Half of Wild Lime and
 *    half of near-black is a dark olive in any colour space — there is no route
 *    from a saturated yellow-green to the page ground that does not pass
 *    through it. OKLab drops the chroma faster on the way (0.070 against 0.080
 *    at the midpoint), and the ease is what matters more: it crosses the middle
 *    QUICKLY and lingers at the ends, so the olive is transited rather than
 *    displayed.
 */

/** The classic S-curve, 0→1 with zero slope at both ends. */
export const smoothstep = (t: number): number => {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
};

const srgbToLinear = (v: number): number => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const linearToSrgb = (v: number): number => {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(255, Math.max(0, c * 255)));
};

/** sRGB hex → OKLab, the space a ramp should be interpolated in. */
export function oklabOf(hex: string): [number, number, number] {
  const [r, g, b] = parseHex(hex).map(srgbToLinear) as [number, number, number];
  const cbrt = (v: number) => (v > 0 ? Math.cbrt(v) : 0);
  const l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab → sRGB hex, clamped into gamut. */
export function oklabHex([L, A, B]: [number, number, number]): string {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => linearToSrgb(Math.min(1, Math.max(0, v))));
  return `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** `t` of the way from `a` to `b`, mixed perceptually. */
export function mixOklab(a: string, b: string, t: number): string {
  const A = oklabOf(a);
  const B = oklabOf(b);
  return oklabHex([0, 1, 2].map((i) => A[i]! + (B[i]! - A[i]!) * t) as [number, number, number]);
}

/**
 * A ramp from `from` to `to` with no crease at either end: `steps` stops at
 * even POSITIONS, coloured at eased WEIGHTS. The endpoints are exact — a stop
 * table that does not start where the surface starts is a crease of its own.
 */
export function easedRamp(from: string, to: string, steps: number): { at: number; color: string }[] {
  const n = Math.max(2, Math.round(steps));
  return Array.from({ length: n }, (_, i) => {
    const at = i / (n - 1);
    return { at, color: i === 0 ? from : i === n - 1 ? to : mixOklab(from, to, smoothstep(at)) };
  });
}

/* ── PERCEPTUAL DISTANCE ───────────────────────────────────────────────────
 *
 * Contrast answers "can this be read against that background". It cannot answer
 * "can these two be told apart from each other", and a legend needs the second:
 * every swatch in it can clear AA against the card and still be useless if two
 * of them are the same warm mark at 8px.
 *
 * That gap is not hypothetical — it shipped. In the since-retired light theme
 * the readiness ledger's tissue and wearable rows resolved to #a3442f and
 * #875427, a vermilion and a brown ΔE 13 apart, both comfortably AA. Nothing
 * tested it, because nothing measured colours against EACH OTHER.
 */

/** CIE L*a*b* (D65) for an sRGB hex — the space perceptual distance is measured in. */
export function labOf(hex: string): [number, number, number] {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  // sRGB → XYZ (D65), then normalized by the D65 white point.
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/**
 * CIEDE2000 colour difference. Roughly: under 2 is a match, ~10 is "clearly a
 * different colour", and a set of legend swatches wants to sit well above that
 * so the pairing survives small marks, cheap panels and colour-vision variance.
 */
export function deltaE2000(a: string, b: string): number {
  const [L1, a1, b1] = labOf(a);
  const [L2, a2, b2] = labOf(b);
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const cBar = (C1 + C2) / 2;
  const g = 0.5 * (1 - Math.sqrt(cBar ** 7 / (cBar ** 7 + 25 ** 7)));
  const ap1 = (1 + g) * a1;
  const ap2 = (1 + g) * a2;
  const Cp1 = Math.hypot(ap1, b1);
  const Cp2 = Math.hypot(ap2, b2);
  const hue = (x: number, y: number) => {
    if (x === 0 && y === 0) return 0;
    const d = (Math.atan2(y, x) * 180) / Math.PI;
    return d < 0 ? d + 360 : d;
  };
  const hp1 = hue(ap1, b1);
  const hp2 = hue(ap2, b2);
  const dL = L2 - L1;
  const dC = Cp2 - Cp1;
  let dh = 0;
  if (Cp1 * Cp2 !== 0) {
    dh = hp2 - hp1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dh * Math.PI) / 360);
  const lBar = (L1 + L2) / 2;
  const cpBar = (Cp1 + Cp2) / 2;
  let hBar: number;
  if (Cp1 * Cp2 === 0) hBar = hp1 + hp2;
  else {
    hBar = (hp1 + hp2) / 2;
    if (Math.abs(hp1 - hp2) > 180) hBar += hp1 + hp2 < 360 ? 180 : -180;
  }
  const rad = (d: number) => (d * Math.PI) / 180;
  const T =
    1 - 0.17 * Math.cos(rad(hBar - 30)) + 0.24 * Math.cos(rad(2 * hBar))
    + 0.32 * Math.cos(rad(3 * hBar + 6)) - 0.2 * Math.cos(rad(4 * hBar - 63));
  const Sl = 1 + (0.015 * (lBar - 50) ** 2) / Math.sqrt(20 + (lBar - 50) ** 2);
  const Sc = 1 + 0.045 * cpBar;
  const Sh = 1 + 0.015 * cpBar * T;
  const Rt =
    -2 * Math.sqrt(cpBar ** 7 / (cpBar ** 7 + 25 ** 7))
    * Math.sin(rad(60 * Math.exp(-(((hBar - 275) / 25) ** 2))));
  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh));
}

/**
 * The floor for two colours that carry DIFFERENT MEANINGS side by side.
 *
 * It applies to roles drawn at the SAME strength. Where a pair is separated by
 * weight instead — the readiness ring's kept arc is its band's hue held back to
 * 30% while every cause draws at full — the hue may repeat by design, and does.
 *
 * 18 is chosen against what already reads correctly rather than to be passable:
 * the dark theme's three cost roles sit at 28.4 / 29.0 / 41.1, so the bar leaves
 * room for a future retune while staying far above the 13.2 that shipped.
 */
export const DISTINCT_ROLE_DE = 18;

/**
 * THE INK THAT ACTUALLY READS ON A FILL.
 *
 * Given a surface and the inks a design system is willing to use on it, return
 * the one with the most contrast. It is three lines and it exists because the
 * alternative — a component assuming one ink and every caller quietly
 * disagreeing — is how the app shipped `color: "#fff"` on Muskmelon at 2.36:1,
 * under even the 3:1 large-text floor, on "Delete account", "Erase everything"
 * and "Leave plan".
 *
 * WHY A CHOICE AND NOT A FORMULA. A generated ink (lighten/darken the fill
 * until it passes) would pass the maths and leave the brand: the app has TWO
 * inks, near-black and Stalactite, and every surface in it is one or the other.
 * So the rule picks between them rather than inventing a third — a measurement
 * where there was a guess, with the palette still in charge of the answer.
 *
 * It does NOT assert the winner is good enough: a fill whose best ink still
 * fails AA is a bad fill, and that is the palette's problem to fix rather than
 * a thing a call site can paper over. `contrast.test.ts` holds every accent the
 * app can hand a filled control to the AA bar.
 */
export function inkOn(fill: string, inks: readonly string[]): string {
  if (inks.length === 0) throw new Error("inkOn: no inks to choose from");
  return inks.reduce((best, ink) => (contrastRatio(ink, fill) > contrastRatio(best, fill) ? ink : best));
}

/** An alpha composite of `fg` over `bg`, as a hex — what the eye actually
 *  receives when a colour is drawn at less than full strength. Contrast is a
 *  property of the RESULT, so anything that measures a held-back ink has to
 *  composite it first. */
export function blendOver(fg: string, alpha: number, bg: string): string {
  const a = Math.min(1, Math.max(0, alpha));
  const f = parseHex(fg);
  const b = parseHex(bg);
  const mix = f.map((v, i) => Math.round(a * v + (1 - a) * b[i]!));
  return `#${mix.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * THE STRONGEST HOLD-BACK A GROUND CAN AFFORD — `inkOn`'s idea, one level down.
 *
 * A secondary line is usually the primary ink at reduced strength: it is the
 * same colour, quieter, which is what stops a component inventing a third tone.
 * The alpha for that is always typed as a constant, and a constant cannot know
 * what it is being drawn on.
 *
 * IT SHIPPED WRONG, and in the most-used range. The day band draws its sentence
 * at 0.78 of the fill's ink. On Wild Lime that lands at 7.32:1 and on Fleur De
 * Lis 5.97:1 — comfortable. On Lyons Blue (`info`, which `readinessRole` returns
 * for every score from 60 to 79) it lands at **3.46:1**, under AA, on the single
 * most common reading an athlete gets. No alpha fixes that one: `#2f7893` is the
 * palette's tightest fill and its best ink only reaches 4.60:1 at FULL strength,
 * so the honest answer for that ground is no hold-back at all.
 *
 * So this measures instead of assuming. It walks `ladder` from the most held
 * back to the least and returns the first step whose COMPOSITE clears `min`,
 * falling back to 1 — full strength — when the ground can afford none. A band on
 * lime keeps its softness; the same band on blue simply separates its lines by
 * type instead, which it was already doing.
 */
export function inkHold(
  ink: string,
  on: string,
  ladder: readonly number[],
  min: number = WCAG.AA,
): number {
  for (const a of [...ladder].sort((x, y) => x - y)) {
    if (contrastRatio(blendOver(ink, a, on), on) >= min) return a;
  }
  return 1;
}
