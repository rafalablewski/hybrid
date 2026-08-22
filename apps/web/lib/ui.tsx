"use client";

import type { CSSProperties, ReactNode, SelectHTMLAttributes } from "react";
import { useState } from "react";
import { ALPHA, colors, FEEDBACK, ROLE_COLOR, motion, statSubTone, type AccentKey, type SemanticRole, fs, space, TABULAR_NUMS, STATE_OPACITY } from "@hybrid/core";
import RollingNumber from "@/components/aurora/rolling-number";

// Re-export the shared scale so screens import sizing from one place:
//   import { fs, space } from "@/lib/ui"  →  fontSize: fs.body, gap: space.lg
export { fs, space };

/**
 * THE CARD'S INNER PADDING — one number for the whole app.
 *
 * The FULL-WIDTH card (ink2, 1px line, r28, shadow-card) is inset by this on
 * every edge, and a bleed out of one is written `-CARD_PAD` so it names the
 * container it is escaping. The mobile twin is `CARD_PAD` in
 * aurora/kit.tsx — the value ACard is built on — and both read `space.xl`, so
 * neither client can move alone.
 *
 * Why it is a token and not a literal: it drifted twice. Today's feeling card,
 * done-floor host and week verdict were hand-rolled at 16 against Performance's
 * 20; then the sweep for that found the whole History, Plans, Nutrition and
 * Profile side of the app carrying its own mixture — including two SIBLING
 * cards, stacked, at 20 and 16, and one component (History's swipe card, Plans'
 * detail cards) inset differently on web than on mobile. A number nobody can
 * grep for the meaning of gets typed again every time.
 *
 * WHAT DOES NOT TAKE IT — the deliberate variants, so the next sweep does not
 * "fix" them: a rail item or grid tile (its own compact inset), a media card
 * whose image is flush and only the text block is padded, an icon-tile ROW
 * (`IconTile` + text + chevron, inset 16), a card whose interior is banded rows
 * that pad themselves, and a sheet (its own 20, a different container).
 */
export const CARD_PAD = space.xl;

// Tokens come from @hybrid/core (the shared identity). Surface + primary-text
// tokens resolve through CSS variables (globals.css @theme) so a token edit
// lands app-wide without touching inline styles. LINE_HEX keeps the raw hex for
// recharts SVG presentation attrs, where CSS var() does not resolve. ASH +
// accents stay raw hex for the same reason.
export const INK = "var(--color-ink)",
  INK_HEX = colors.ink,
  INK2 = "var(--color-ink2)",
  LINE = "var(--color-line)",
  LINE_HEX = colors.line;
// LIME is the brand accent as a CSS var so every fill/border/text follows the
// token. Use LIME_HEX (raw) only where a CSS var can't resolve — recharts/SVG
// stroke/fill presentation attrs.
export const LIME = "var(--color-lime)",
  LIME_HEX = colors.lime,
  CHALK = "var(--color-chalk)",
  ASH = colors.ash,
  BLUE = colors.blue,
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
 * twin of mobile's `txt()`: `roleVar` returns the FILL, which is tuned to sit
 * under something; the `-text` variants are the AA-guarded tones for accents
 * rendered as text (palette.test.ts).
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
 * something computed `danger`). The `-text` variants are the AA-guarded tone
 * (palette.test.ts), which is what a glyph must be drawn in.
 */
export const accentText = (accent: AccentKey | "ash"): string =>
  accent === "ash" ? "var(--color-ash)" : `var(--${accent}-text)`;

/**
 * A colour held back to `alpha` (0–1), composited on whatever is behind it.
 *
 * TAKES THE SAME ARGUMENT MOBILE'S `withAlpha` DOES, on purpose: the two clients
 * now spell one tint identically — `tint(LIME, ALPHA.fill)` here,
 * `withAlpha(C.lime, ALPHA.fill)` there — so the ladder in
 * @hybrid/core theme/tokens.ts is finally usable on both. It had 196 call sites
 * on the phone and ZERO on web, where fourteen hand-typed color-mix percentages
 * were doing the job instead: 7 / 10 / 11 / 12 / 13 / 20 / 33 / 45 %, which is
 * the same "eight values in one band" drift ALPHA was written to end (audit/12
 * §5.10).
 */
export const tint = (color: string, alpha: number): string =>
  `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;

// Near-black for text/icons placed ON the bright accent fill (lime/amber/…).
// Mirrors --on-accent in globals.css. Replaces scattered "#0c0d0c".
export const ON_ACCENT = "var(--on-accent)";

// FOREGROUND accent colours (for text). The bright accents above stay for
// backgrounds / borders / chart strokes / glows (and recharts, which can't
// resolve var()); these are the AA-guarded accent-TEXT tones. Use *_T directly
// for inline accent text, or rely on Mono/Chip which map a bright accent → its
// text colour automatically.
/**
 * FEEDBACK — success / warning / error / info, the OUTCOME colours. Separate
 * from the accents on purpose: the brand four are a DATA ramp (readiness, load,
 * RPE), and an outcome is not a reading on a ramp. See @hybrid/core
 * theme/feedback.ts. `OK_HEX`/`ERR_HEX` are the raw values for recharts, which
 * cannot resolve a CSS var.
 */
export const OK = "var(--feedback-success)",
  WARN = "var(--feedback-warning)",
  ERR = "var(--feedback-error)",
  INFO = "var(--feedback-info)",
  OK_HEX = FEEDBACK.success.text,
  ERR_HEX = FEEDBACK.error.text;

export const LIME_T = "var(--lime-text)",
  BLUE_T = "var(--blue-text)",
  AMBER_T = "var(--amber-text)",
  RED_T = "var(--red-text)";

const ACCENT_TEXT: Record<string, string> = {
  [colors.lime]: LIME_T,
  [colors.blue]: BLUE_T,
  [colors.amber]: AMBER_T,
  [colors.red]: RED_T,
  [colors.ash]: "var(--color-ash)",
};

/** Map a bright accent (or ash) to its accent-text colour; pass anything
 *  else through unchanged. Accepts an optional colour (e.g. Mono's `c?`) and
 *  returns undefined for it. Use for inline accent TEXT: `color: txt(BLUE)`. */
export const txt = (c?: string): string | undefined => (c ? ACCENT_TEXT[c] ?? c : undefined);


/**
 * THE MODAL SCRIM — one wash, at the opacity core already names.
 *
 * Three admin overlays each spelled their own: `#000a` (67%), `#000b` (73%) and
 * `rgba(0,0,0,.5)`. Nobody chose three — each site typed a black (audit/12
 * §5.11). The colour is `ink` rather than pure black for the reason core's SCRIM
 * gives, and the opacity is `motion.scrimFlat`, which is the number the mobile
 * sheet already uses when its parent does NOT recede — which is exactly what a
 * web modal does.
 */
export const scrim = (): string => tint(INK, Math.round(motion.scrimFlat * 100));

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
export const mono: CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
export const body: CSSProperties = { fontFamily: "'Archivo', sans-serif" };

/**
 * A FIGURE'S NUMERALS — spread into any style that draws a number sitting in a
 * column, updating, or animating. Argument in core `scale.ts` beside
 * `TABULAR_NUMS`; short version: a proportional `1` is narrower than an `8`, so
 * a column stops aligning and a rolling digit resizes its own slot mid-turn.
 *
 * Web had this at ZERO sites — not "mostly applied", never applied — which is
 * why every `Stat` tile and every rolling figure in the admin panel has been
 * drawing proportional figures beside a mobile twin that mostly wasn't.
 */
export const tabular: CSSProperties = { fontVariantNumeric: TABULAR_NUMS };

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
  // Auto-map a bright accent (or ash) to its accent-text colour so every
  // `Mono c={LIME}` across the app stays AA without edits.
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
        background: INK2,
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
        ...disp,
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
 *  (Archivo bold), same size (fs.bodyLg), same ~44px height, so the two clients
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
        fontSize: compact ? fs.body : fs.bodyLg,
        fontWeight: 700,
        color: outline ? txt(color ?? ASH) : ON_ACCENT,
        background: outline ? "none" : color ?? LIME,
        border: outline ? `1px solid ${color ? tint(color, ALPHA.rim) : LINE}` : "none",
        borderRadius: 999,
        padding: compact ? "8px 16px" : "12px 24px",
        minHeight: compact ? 32 : 44,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? STATE_OPACITY.disabled : 1,
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
          ...tabular,
          fontWeight: 800,
          fontSize: fs.hero,
          color: txt(c),
          lineHeight: 1.1,
          margin: "6px 0 2px",
          display: "flex",
        }}
      >
        {/* A FIGURE rolls to its new value; anything else is rendered as given.
            `value` is a ReactNode because a few callers compose a unit or an
            icon into it, and rolling an arbitrary tree would be nonsense — but
            the overwhelming majority pass a formatted number, and this is the
            one place all thirty-one stat tiles pass through. */}
        {typeof value === "string" || typeof value === "number"
          ? <RollingNumber value={String(value)} />
          : value}
      </div>
      {sub && (
        // ONLY a sign-led sub carries a tone (core `statSubTone`). This used to
        // paint every non-negative sub in the "good" accent, which meant a sub
        // that was not a delta got congratulated — `sub={dateStr}` rendered a
        // DATE in chartreuse, as did "not enough data" and "ARR $1.2M". The
        // minus-marked thresholds the admin panels rely on ("−below 40") are
        // sign-led already, so they still read as failing.
        <Mono
          s={{ fontSize: fs.caption }}
          c={{ down: RED, up: LIME, flat: ASH }[statSubTone(sub)]}
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
