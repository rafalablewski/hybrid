"use client";

import type { CSSProperties, ReactNode, SelectHTMLAttributes } from "react";
import { useState } from "react";
import { colors, ROLE_COLOR, type AccentKey, type SemanticRole, fs, space } from "@hybrid/core";

// Re-export the shared scale so screens import sizing from one place:
//   import { fs, space } from "@/lib/ui"  →  fontSize: fs.body, gap: space.lg
export { fs, space };

// Tokens come from @hybrid/core (the shared identity). Surface + primary-text
// tokens resolve through CSS variables (globals.css @theme + [data-theme])
// so the app re-themes (dark ⇄ light) without touching inline styles. LINE is
// the THEMED CSS var so hairline borders soften with the theme (the raw dark hex
// used to paint near-black borders on the light Kyoto washi — a hard contrast
// break). LINE_HEX keeps the raw hex for recharts SVG presentation attrs, where
// CSS var() does not resolve. ASH + accents stay raw hex for the same reason.
export const INK = "var(--color-ink)",
  INK2 = "var(--color-ink2)",
  CARD = "var(--color-card)",
  LINE = "var(--color-line)",
  LINE_HEX = colors.line;
// LIME is the brand accent as a THEMED CSS var (bright lime in Aurora, pine in
// Kyoto Hour) so every fill/border/text follows the theme. Use LIME_HEX (raw) only
// where a CSS var can't resolve — recharts/SVG stroke/fill presentation attrs.
export const LIME = "var(--color-lime)",
  LIME_HEX = colors.lime,
  CHALK = "var(--color-chalk)",
  ASH = colors.ash,
  BLUE = colors.blue,
  VIOLET = colors.violet,
  AMBER = colors.amber,
  RED = colors.red;

// Resolve a SHARED semantic role (@hybrid/core semantic.ts) to a colour. `roleHex`
// returns raw hex (for recharts/SVG + the classic screens); `roleVar` returns the
// themed CSS var (for the Aurora screens). State colour goes through ONE source,
// so web + mobile can't drift on what a colour means.
export const roleHex = (role: SemanticRole): string => colors[ROLE_COLOR[role]];
export const roleVar = (role: SemanticRole): string => `var(--color-${ROLE_COLOR[role]})`;

/**
 * A role as a colour to DRAW WITH — the accent-TEXT channel. This is the web
 * twin of mobile's `txt()`, and web went without it for too long: `roleVar`
 * returns the FILL, which is tuned to sit under something, and Kyoto Hour
 * deliberately leaves `--color-amber` as the pale sand #d0cd94. Used as a text
 * colour on washi paper that is 1.57:1 — a quarter of AA — so every "caution"
 * figure on the light theme (the readiness ledger's wearable row, an elevated
 * tissue's driver label, a compromised HPI score at 46px) was printed in
 * something close to invisible ink. The `-text` variants exist for exactly this
 * and are AA-guarded on BOTH grounds in palette.test.ts.
 *
 * `ash` has no `-text` variant and needs none: the muted token is already a
 * text colour.
 *
 * Rule of thumb: painting a background, a bar or a body-map area → `roleVar`.
 * Painting glyphs, a legend swatch or a ring's ticks → `roleText`.
 */
export const roleText = (role: SemanticRole): string => {
  const accent = ROLE_COLOR[role];
  return accent === "ash" ? "var(--color-ash)" : `var(--${accent}-text)`;
};

/**
 * An accent BY NAME as a colour to draw with — the same channel `roleText` uses,
 * for the many call sites that reference an accent directly rather than through
 * a semantic role (an error message is red because it is an error, not because
 * something computed `danger`).
 *
 * Every one of those said `color: C("red")` — the FILL — and the type scale here
 * tops out at 14px, so the WCAG large-text exemption covers none of them:
 * on Kyoto Hour that error text was 3.26:1 against the card, sand was 1.57:1 and
 * steel 2.83:1, all under AA. The `-text` variants are the AA-guarded tone for
 * each theme (palette.test.ts), which is what a glyph must be drawn in.
 */
export const accentText = (accent: AccentKey | "ash"): string =>
  accent === "ash" ? "var(--color-ash)" : `var(--${accent}-text)`;

/** A colour held back to `pct`% opacity, composited on whatever is behind it. */
export const tint = (color: string, pct: number): string =>
  `color-mix(in srgb, ${color} ${pct}%, transparent)`;

// Fixed near-black for text/icons placed ON a bright accent fill (lime/amber/…).
// Text/icons ON a bright accent fill. Theme-aware: dark on Aurora's bright lime,
// light on Kyoto Hour's deep pine (so it always clears contrast on the fill).
// Mirrors --on-accent in globals.css. Replaces scattered "#0c0d0c".
export const ON_ACCENT = "var(--on-accent)";

// Theme-aware FOREGROUND accent colours (for text). The bright accents above
// stay fixed for backgrounds / borders / chart strokes / glows (and recharts,
// which can't resolve var()); these darken on light so accent TEXT keeps WCAG
// AA. Use *_T directly for inline accent text, or rely on Mono/Chip which map
// a bright accent → its themed text colour automatically.
export const LIME_T = "var(--lime-text)",
  BLUE_T = "var(--blue-text)",
  VIOLET_T = "var(--violet-text)",
  AMBER_T = "var(--amber-text)",
  RED_T = "var(--red-text)";

const ACCENT_TEXT: Record<string, string> = {
  [colors.lime]: LIME_T,
  [colors.blue]: BLUE_T,
  [colors.violet]: VIOLET_T,
  [colors.amber]: AMBER_T,
  [colors.red]: RED_T,
  [colors.ash]: "var(--color-ash)",
};

/** Map a bright accent (or ash) to its theme-aware text colour; pass anything
 *  else through unchanged. Accepts an optional colour (e.g. Mono's `c?`) and
 *  returns undefined for it. Use for inline accent TEXT: `color: txt(BLUE)`. */
export const txt = (c?: string): string | undefined => (c ? ACCENT_TEXT[c] ?? c : undefined);

/** The ambient Liquid Glass field — slow-drifting accent blobs that the glass
 *  surfaces refract. Render once per page/shell, behind the content (the
 *  styling + stacking live in globals.css `.lg-field`). */
export function GlassField() {
  return (
    <div className="lg-field" aria-hidden>
      <div className="lg-blob lg-a" />
      <div className="lg-blob lg-b" />
      <div className="lg-blob lg-c" />
    </div>
  );
}

export const disp: CSSProperties = { fontFamily: "'Archivo', sans-serif" };
export const cond: CSSProperties = { fontFamily: "'Archivo Narrow', sans-serif" };
export const mono: CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
export const body: CSSProperties = { fontFamily: "'Archivo', sans-serif" };

export const tip = {
  background: INK,
  border: `1px solid ${LINE}`,
  borderRadius: "var(--r-tip)",
  ...mono,
  fontSize: fs.caption,
} as const;

export function Mono({
  children,
  s = {},
  c = ASH,
}: {
  children: ReactNode;
  s?: CSSProperties;
  c?: string;
}) {
  // Auto-map a bright accent (or ash) to its theme-aware text colour so every
  // `Mono c={LIME}` across the app stays AA in light mode without edits.
  return <span style={{ ...mono, color: txt(c), ...s }}>{children}</span>;
}

export function Card({
  children,
  style,
  span,
  onClick,
  glass = true,
}: {
  children: ReactNode;
  style?: CSSProperties;
  span?: number;
  onClick?: () => void;
  /** Liquid Glass surface (default). Pass `glass={false}` for a solid card. */
  glass?: boolean;
}) {
  if (glass) {
    return (
      <Glass span={span} onClick={onClick} style={{ padding: space.xl, ...style }}>
        {children}
      </Glass>
    );
  }
  return (
    <div
      onClick={onClick}
      style={{
        background: CARD,
        border: `1px solid ${LINE}`,
        borderRadius: "var(--r-card)",
        padding: space.xl,
        gridColumn: span ? `span ${span}` : undefined,
        cursor: onClick ? "pointer" : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// Liquid Glass surface primitive. The visual treatment lives in globals.css
// (`.liquid-glass` + `.lg-*` variants); this just wires up the className,
// the sheen layer and the brand-consistent props (span/onClick/style). Add
// `hover` for the rim-sweep + lift on pointer interaction.
export function Glass({
  children,
  style,
  span,
  onClick,
  hover = true,
  className = "",
}: {
  children: ReactNode;
  style?: CSSProperties;
  span?: number;
  onClick?: () => void;
  hover?: boolean;
  className?: string;
}) {
  const cls = [
    "liquid-glass",
    hover ? "lg-hover" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      onClick={onClick}
      className={cls}
      style={{
        gridColumn: span ? `span ${span}` : undefined,
        cursor: onClick ? "pointer" : undefined,
        ...style,
      }}
    >
      <span className="lg-sheen" aria-hidden />
      {children}
    </div>
  );
}

export function Chip({ children, c = LIME }: { children: ReactNode; c?: string }) {
  return (
    <span
      style={{
        ...cond,
        display: "inline-block",
        fontSize: fs.caption,
        fontWeight: 600,
        letterSpacing: ".05em",
        textTransform: "uppercase",
        color: txt(c),
        background: `${c}1f`,
        padding: "3px 9px",
        borderRadius: "var(--r-chip)",
        whiteSpace: "nowrap",
        // self-spacing so adjacent chips never touch (and wrap cleanly)
        marginRight: 6,
        marginBottom: 4,
      }}
    >
      {children}
    </span>
  );
}

/** Pill button — mirrors mobile lib/ui Button (fill | outline): same face
 *  (Archivo bold), same size (fs.note), same ~44px height, so the two clients
 *  share one button. Fill paints the brand accent (or an explicit `color`) with
 *  onAccent ink; outline is a transparent ghost with a hairline border, `color`
 *  tinting the label + border (muted ash/line when omitted) — e.g. destructive
 *  actions. `size="compact"` is for dense admin rows only — never a screen's
 *  primary action. Press/hover feedback comes from the shared `.pressable`
 *  utility (globals.css). */
export function Button({
  label,
  onClick,
  color,
  variant = "fill",
  size = "regular",
  disabled,
  style,
}: {
  label: string;
  onClick: () => void;
  color?: string;
  variant?: "fill" | "outline";
  size?: "regular" | "compact";
  disabled?: boolean;
  style?: CSSProperties;
}) {
  const outline = variant === "outline";
  const compact = size === "compact";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="pressable"
      style={{
        ...disp,
        fontSize: compact ? fs.body : fs.note,
        fontWeight: 700,
        color: outline ? txt(color ?? ASH) : ON_ACCENT,
        background: outline ? "none" : color ?? LIME,
        border: outline ? `1px solid ${color ? `color-mix(in srgb, ${color} 45%, transparent)` : LINE}` : "none",
        borderRadius: 999,
        padding: compact ? "8px 16px" : "12px 24px",
        minHeight: compact ? 32 : 44,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {label}
    </button>
  );
}

// Branded dropdown. Native <select> arrows + popups are OS-styled and clash
// with the dark identity, so we strip the chrome (appearance:none), draw our
// own chevron, and paint the control with brand tokens. One source of truth for
// every dropdown in the app — pass `variant="pill"` for the rounded header look.
export function Select({
  children,
  style = {},
  variant = "default",
  onFocus,
  onBlur,
  ...rest
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "style"> & {
  style?: CSSProperties;
  variant?: "default" | "pill";
}) {
  const [focus, setFocus] = useState(false);
  const pill = variant === "pill";
  // Layout/positioning props belong on the wrapper (the chevron is absolutely
  // positioned against it) so flex/width/margins/insets keep behaving; the rest
  // (typography, compact padding, …) decorates the control.
  const {
    flex,
    width,
    minWidth,
    maxWidth,
    height,
    minHeight,
    maxHeight,
    alignSelf,
    margin,
    marginTop,
    marginRight,
    marginBottom,
    marginLeft,
    position,
    top,
    right,
    bottom,
    left,
    display,
    ...rest2
  } = style;
  return (
    <div
      style={{
        position: position ?? "relative",
        display: display ?? "inline-flex",
        alignItems: "stretch",
        flex,
        width,
        minWidth,
        maxWidth,
        height,
        minHeight,
        maxHeight,
        alignSelf,
        margin,
        marginTop,
        marginRight,
        marginBottom,
        marginLeft,
        top,
        right,
        bottom,
        left,
      }}
    >
      <select
        {...rest}
        onFocus={(e) => {
          setFocus(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocus(false);
          onBlur?.(e);
        }}
        style={{
          ...mono,
          fontSize: fs.body,
          padding: pill ? "8px 14px" : "8px 10px",
          borderRadius: pill ? 999 : "var(--r-field)",
          background: INK2,
          color: CHALK,
          appearance: "none",
          WebkitAppearance: "none",
          MozAppearance: "none",
          outline: "none",
          cursor: "pointer",
          width: "100%",
          transition: "border-color .15s ease",
          ...rest2,
          // these are owned by the component and must survive style overrides:
          border: `1px solid ${focus ? LIME : LINE}`,
          paddingRight: pill ? 32 : 30,
        }}
      >
        {children}
      </select>
      <span
        aria-hidden
        style={{
          position: "absolute",
          right: pill ? 12 : 10,
          top: "50%",
          transform: "translateY(-50%)",
          display: "flex",
          pointerEvents: "none",
          color: focus ? LIME : ASH,
          transition: "color .15s ease",
        }}
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="8 9 12 5 16 9" />
          <polyline points="8 15 12 19 16 15" />
        </svg>
      </span>
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  c = CHALK,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  c?: string;
}) {
  return (
    <Card glass>
      <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }}>
        {label}
      </Mono>
      <div
        style={{
          ...disp,
          fontWeight: 800,
          fontSize: 34,
          color: txt(c),
          lineHeight: 1.1,
          margin: "6px 0 2px",
        }}
      >
        {value}
      </div>
      {sub && (
        <Mono
          s={{ fontSize: fs.caption }}
          c={sub.startsWith("−") || sub.startsWith("↓") ? RED : LIME}
        >
          {sub}
        </Mono>
      )}
    </Card>
  );
}

export function ChartFrame({
  title,
  kicker,
  children,
  c = LIME,
  span = 1,
}: {
  title: string;
  kicker?: string;
  children: ReactNode;
  c?: string;
  span?: number;
}) {
  return (
    <Card span={span} glass>
      <div style={{ marginBottom: 14 }}>
        {kicker && (
          <Mono
            s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }}
            c={c}
          >
            {kicker}
          </Mono>
        )}
        <div style={{ ...disp, fontWeight: 700, fontSize: 17, marginTop: 2 }}>
          {title}
        </div>
      </div>
      {children}
    </Card>
  );
}
