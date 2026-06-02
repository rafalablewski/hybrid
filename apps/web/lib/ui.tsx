"use client";

import type { CSSProperties, ReactNode } from "react";
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
}: {
  children: ReactNode;
  style?: CSSProperties;
  span?: number;
}) {
  return (
    <div
      style={{
        background: CARD,
        border: `1px solid ${LINE}`,
        borderRadius: 16,
        padding: 20,
        gridColumn: span ? `span ${span}` : undefined,
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
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: ".05em",
        textTransform: "uppercase",
        color: c,
        background: `${c}1f`,
        padding: "3px 9px",
        borderRadius: 5,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
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
