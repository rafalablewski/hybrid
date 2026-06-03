"use client";

import type { CSSProperties, ReactNode, SelectHTMLAttributes } from "react";
import { useState } from "react";
import { colors } from "@hybrid/core";

// Ported 1:1 from reference/HybridWeb.jsx so the deployed app matches the
// prototype exactly. Tokens come from @hybrid/core (the shared identity).
export const INK = colors.ink,
  INK2 = colors.ink2,
  CARD = colors.card,
  LINE = colors.line;
export const LIME = colors.lime,
  CHALK = colors.chalk,
  ASH = colors.ash,
  BLUE = colors.blue,
  VIOLET = colors.violet,
  AMBER = colors.amber,
  RED = colors.red;

export const disp: CSSProperties = { fontFamily: "'Archivo', sans-serif" };
export const cond: CSSProperties = { fontFamily: "'Archivo Narrow', sans-serif" };
export const mono: CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
export const body: CSSProperties = { fontFamily: "'Archivo', sans-serif" };

export const tip = {
  background: INK,
  border: `1px solid ${LINE}`,
  borderRadius: 8,
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
  return <span style={{ ...mono, color: c, ...s }}>{children}</span>;
}

export function Card({
  children,
  style,
  span,
  onClick,
}: {
  children: ReactNode;
  style?: CSSProperties;
  span?: number;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: CARD,
        border: `1px solid ${LINE}`,
        borderRadius: 16,
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
        color: c,
        background: `${c}1f`,
        padding: "3px 9px",
        borderRadius: 5,
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
          borderRadius: pill ? 999 : 9,
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
    <Card>
      <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }}>
        {label}
      </Mono>
      <div
        style={{
          ...disp,
          fontWeight: 800,
          fontSize: 34,
          color: c,
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
    <Card span={span}>
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
