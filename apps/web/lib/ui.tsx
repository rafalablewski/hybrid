"use client";

import type { CSSProperties, ReactNode, SelectHTMLAttributes } from "react";
import { useState } from "react";
import { colors } from "@hybrid/core";

// Tokens come from @hybrid/core (the shared identity). Surface + primary-text
// tokens resolve through CSS variables (globals.css @theme + [data-theme])
// so the app re-themes (dark ⇄ light) without touching inline styles. LINE,
// ASH and the accents stay raw hex because they're also fed to recharts as SVG
// presentation attributes, where CSS var() does not resolve.
export const INK = "var(--color-ink)",
  INK2 = "var(--color-ink2)",
  CARD = "var(--color-card)",
  LINE = colors.line;
export const LIME = colors.lime,
  CHALK = "var(--color-chalk)",
  ASH = colors.ash,
  BLUE = colors.blue,
  VIOLET = colors.violet,
  AMBER = colors.amber,
  RED = colors.red;

// Fixed near-black for text/icons placed ON a bright accent fill (lime/amber/…).
// Stays dark in BOTH themes (accent fills are bright in both), so it must NOT be
// the themed INK var. Replaces the scattered "#0c0d0c" literals.
export const ON_ACCENT = colors.ink;

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
  fontSize: 12,
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
  variant,
}: {
  children: ReactNode;
  style?: CSSProperties;
  span?: number;
  onClick?: () => void;
  /** Liquid Glass surface (default). Pass `glass={false}` for a solid card. */
  glass?: boolean;
  /** Glass variant — only applies when `glass` is set. */
  variant?: "thin" | "thick" | "vibrant";
}) {
  if (glass) {
    return (
      <Glass span={span} variant={variant} onClick={onClick} style={{ padding: 20, ...style }}>
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
        padding: 20,
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
  variant,
  hover = true,
  className = "",
}: {
  children: ReactNode;
  style?: CSSProperties;
  span?: number;
  onClick?: () => void;
  variant?: "thin" | "thick" | "vibrant";
  hover?: boolean;
  className?: string;
}) {
  const cls = [
    "liquid-glass",
    variant ? `lg-${variant}` : "",
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
        fontSize: 12,
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
          fontSize: 13,
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
      <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }}>
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
          s={{ fontSize: 12 }}
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
            s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }}
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
