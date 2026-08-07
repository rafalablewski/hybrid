"use client";

import { useRef } from "react";
import { fs } from "@hybrid/core";

/**
 * CARD FOOT — the ONE way a card is allowed to end.
 *
 * Three cards used to end three different ways. Tissue drew a rail of three
 * mono controls; Your Level drew a full-width row whose label was a statistic
 * and whose lime arrow pushed an entire screen; Volume drew an eyebrow on the
 * left and a lime CTA with a rotating ↓ on the right that merely unfolded a
 * drawer in place. Sixteen properties were being decided independently — face,
 * size, weight, case, tracking, colour, glyph, glyph motion, gap, offsets, the
 * open-state label, panel motion, the tap target, the haptic and, worst, what
 * a press even DOES. The accent was the loudest of them: lime meant "leaves the
 * card" on one and "unfolds in place" on the next, so it told the reader
 * nothing at all.
 *
 * The resolution is a shape, not a style guide:
 *
 *   status    — an optional figure or fact that QUALIFIES the card. It renders
 *               ABOVE the rule, is never pressable, and is never a button's
 *               accessible name. A number is not a label.
 *   expander  — exactly ONE link, and it unfolds in place. Nothing in a footer
 *               navigates and nothing opens a sheet, so nothing here earns the
 *               accent. The label names the NOUN of what appears and does NOT
 *               change when it does — the chevron's rotation is the only state
 *               anything reports, which is what retires "Hide tissues"/"Hide".
 *   children  — what unfolds, inside the drawer this component owns.
 *
 * There is deliberately no `kind`, no colour, no glyph and no array: a card
 * that wants a second link or an action in its footer is a review conversation,
 * not a prop. An action that must live near the footer belongs INSIDE the panel
 * (see the injury pill in tissue-card.tsx), where it cannot be mistaken for a
 * disclosure.
 *
 * Mirrors apps/mobile/components/aurora/kit.tsx → CardFoot. Guarded by
 * apps/web/__tests__/card-foot.test.ts.
 */
const C = (v: string) => `var(--color-${v})`;

/** The rail's one glyph. A 12px VECTOR that rotates 180° — web used to draw an
 *  8px text triangle and swap ▼/▲ while mobile drew a 12px icon and rotated it,
 *  which is two different affordances for one control. */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      style={{
        flex: "none",
        transform: open ? "rotate(-180deg)" : "none",
        transition: "transform var(--d-sheet) var(--e-sheet)",
      }}
    >
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The panel, on the app's shared 0fr → 1fr drawer. Mounted on first open and
 *  kept — a collapse needs something to collapse — and `inert` while closed so
 *  a clipped panel is out of both the focus order and the a11y tree. */
function Panel({ open, children }: { open: boolean; children: React.ReactNode }) {
  const mounted = useRef(open);
  if (open) mounted.current = true;
  return (
    <div className="motion-drawer" data-open={open ? "" : undefined}>
      <div inert={!open}>{mounted.current ? children : null}</div>
    </div>
  );
}

export function CardFoot({
  status,
  expander,
  children,
}: {
  /** A figure or fact that qualifies the card. Above the rule, never pressable. */
  status?: string;
  /** The one link. `label` names what unfolds and never changes on open. */
  expander: { label: string; open: boolean; onToggle: () => void };
  /** What unfolds. */
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginTop: 16 }}>
      {status && (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: fs.nano,
            textTransform: "uppercase",
            letterSpacing: ".12em",
            color: C("ash"),
            marginBottom: 11,
          }}
        >
          {status}
        </div>
      )}
      <div style={{ borderTop: `1px solid ${C("line")}` }}>
        <button
          type="button"
          className="pressable"
          aria-expanded={expander.open}
          onClick={expander.onToggle}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            // 44px of pressable height. Every one of the five controls this
            // replaces sat under 20px — web set `padding: 0` on its rail
            // buttons and mobile leaned on `hitSlop={6}` — which is the one
            // property in this component that is not cosmetic.
            minHeight: 44,
            boxSizing: "border-box",
            padding: 0,
            border: 0,
            background: "none",
            cursor: "pointer",
            textAlign: "left",
            fontFamily: "var(--font-mono)",
            fontSize: fs.micro,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: ".08em",
            // Ash, always. Nothing in a footer leaves the card, so nothing here
            // may take the accent.
            color: C("ash"),
          }}
        >
          {expander.label}
          <Chevron open={expander.open} />
        </button>
        <Panel open={expander.open}>{children}</Panel>
      </div>
    </div>
  );
}

/**
 * THE ACTION PILL — for the one thing a card may do that is not unfolding.
 *
 * It lives INSIDE a panel, never in the rail, and it is deliberately a
 * different object from the link: bordered, chalk, pill-shaped. A reader never
 * has to work out whether a footer control will unfold something or open a
 * form, because the two share no vocabulary at all.
 */
export function ActionPill({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="pressable"
      onClick={onClick}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: fs.micro,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: ".08em",
        color: C("chalk"),
        whiteSpace: "nowrap",
        background: "transparent",
        border: `1px solid ${C("line")}`,
        borderRadius: 999,
        padding: "9px 16px",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
