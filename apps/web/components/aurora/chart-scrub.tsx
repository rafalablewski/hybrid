"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fs, scrubFraction, scrubIndex, type ChartReading, type ScrubMode } from "@hybrid/core";

/**
 * THE HELD CHART (web) — press a chart and it states the figure under your
 * finger, the way a stock chart does. The twin of
 * apps/mobile/components/aurora/chart-scrub.tsx.
 *
 * A trend answers "which way", never "how much, that week": an eight-week
 * strip names its first and last bucket and leaves the six in between as a
 * shape with no figures. Holding is how those get an answer without a second
 * screen.
 *
 * The hit-testing is core's (`scrubIndex`), so the same press reads the same
 * week here and on the phone. Only the GESTURE is per-client:
 *  - `touchAction: pan-y` — a vertical drag still scrolls the page, so a chart
 *    never traps a finger that meant to scroll past it. (A chart inside a
 *    horizontal rail leaves the property at `auto`, so the rail keeps its own
 *    scroll; see `SCRUB_STYLE_IN_RAIL`.)
 *  - a TOUCH must dwell `HOLD_MS` before anything appears. Without it, every
 *    swipe that begins on a chart flashes a readout for the frame before the
 *    browser takes the pan — the mobile twin gets this free from the
 *    ScrollView's own `delaysContentTouches`.
 *  - a MOUSE reads on HOVER, with no press at all — that is what a pointer is
 *    for, and it costs one line.
 *  - the arrow keys, Home/End and Escape walk the series, so the figures are
 *    reachable without a pointer.
 */

/** A chart that owns its horizontal axis: vertical drags scroll the page,
 *  horizontal ones scrub. */
export const SCRUB_STYLE = { touchAction: "pan-y", userSelect: "none", WebkitUserSelect: "none", cursor: "crosshair" } as const;

/** A chart riding inside a horizontal rail. The rail's scroll wins every drag —
 *  it is how the athlete reaches the rest of the cards — so the gesture here is
 *  a DWELL: hold still and the figure appears, move and the rail carries on. */
export const SCRUB_STYLE_IN_RAIL = { userSelect: "none", WebkitUserSelect: "none", cursor: "crosshair" } as const;

/** How long a finger must rest before a chart answers. Matches the delay a
 *  native scroll view applies before it hands a touch to its content. */
export const HOLD_MS = 120;

export interface ScrubOptions {
  /**
   * True when the chart sits INSIDE a button — the Today exercise cards, the
   * other-sport tiles — and a press has to declare which of the two things it
   * meant. The dwell already separates them (a tap ends before it), so all this
   * adds is cancelling the click that a completed READ would otherwise fire,
   * and dropping the chart's own focus stop so the card keeps one.
   */
  inButton?: boolean;
}

export function useChartScrub(count: number, mode: ScrubMode, inset?: number, opts: ScrubOptions = {}) {
  const [index, setIndex] = useState(-1);
  const ref = useRef<HTMLDivElement | null>(null);
  /** Optional: the PLOT, when the press target is bigger than the drawing (a
   *  whole tile, say). The fraction is always measured against the drawing, or
   *  the first bar would start wherever the padding did. */
  const plotRef = useRef<HTMLDivElement | null>(null);
  const held = useRef(false);
  const last = useRef(-1);
  const at = useRef(0);
  const timer = useRef(0);
  /** True once a TOUCH has dwelled long enough to read. A hovering mouse reads
   *  too, but a mouse click on a card still means "open the card". */
  const dwelled = useRef(false);
  const geo = useRef({ count, mode, inset });
  geo.current = { count, mode, inset };

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  // `last` mirrors the state so a hovering mouse — which fires a move event per
  // pixel — only re-renders when the WEEK changes. Every setter goes through
  // `set`, so releasing a touch cannot leave the mirror pointing at a week the
  // chart is no longer showing (the next press on that same bar would then read
  // as "no change" and show nothing).
  const set = useCallback((i: number) => {
    if (i === last.current) return;
    last.current = i;
    setIndex(i);
  }, []);
  const read = useCallback((clientX: number) => {
    const el = plotRef.current ?? ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    set(scrubIndex(scrubFraction(clientX - r.left, r.width), geo.current));
  }, [set]);
  const clear = useCallback(() => {
    held.current = false;
    if (timer.current) { window.clearTimeout(timer.current); timer.current = 0; }
    set(-1);
  }, [set]);

  const bind = {
    ref,
    // A chart inside a button must not be a second focus stop inside it — the
    // card already is one, and nested interactive content is a trap for anyone
    // arriving by keyboard. Its figures stay reachable: the card opens the page
    // where the same chart is full size and fully keyboard-driven.
    ...(opts.inButton ? {} : { tabIndex: 0 }),
    // A GROUP, not an img: the drawing itself is aria-hidden, and what a screen
    // reader should reach is the readout — a live region that states the held
    // figure as the arrow keys walk the series. Inside role="img" its contents
    // would be presentational and it would never be announced.
    role: "group" as const,
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      held.current = true;
      dwelled.current = false;
      at.current = e.clientX;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      if (e.pointerType === "mouse") { read(e.clientX); return; }
      // The dwell reads the LATEST x rather than the one it was armed with, so
      // a finger that settles a few pixels along still answers where it stopped.
      timer.current = window.setTimeout(() => {
        timer.current = 0;
        if (!held.current) return;
        dwelled.current = true;
        read(at.current);
      }, HOLD_MS);
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      at.current = e.clientX;
      if (e.pointerType === "mouse") { read(e.clientX); return; }
      if (held.current && !timer.current) read(e.clientX);
    },
    // A mouse keeps its readout after the click — it is still hovering. A
    // finger has left the glass, so the chart goes back to its own shape.
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
      held.current = false;
      if (timer.current) { window.clearTimeout(timer.current); timer.current = 0; }
      if (e.pointerType !== "mouse") set(-1);
    },
    onPointerCancel: clear,
    onPointerLeave: clear,
    onBlur: clear,
    // A press that READ something was not a press on the card. The click still
    // fires after pointerup, so it is stopped here rather than un-navigated
    // afterwards.
    onClick: opts.inButton
      ? (e: React.MouseEvent) => { if (dwelled.current) { e.preventDefault(); e.stopPropagation(); } }
      : undefined,
    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
      const n = geo.current.count;
      if (n <= 0) return;
      const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (step) {
        e.preventDefault();
        const from = last.current < 0 ? (step > 0 ? -1 : n) : last.current;
        set(Math.min(n - 1, Math.max(0, from + step)));
      } else if (e.key === "Home") { e.preventDefault(); set(0); }
      else if (e.key === "End") { e.preventDefault(); set(n - 1); }
      else if (e.key === "Escape") set(-1);
    },
  };
  return { index, bind, plotRef };
}

/** What a scrubbable chart spreads onto its own root — plus the label the
 *  screen reader announces for it. */
export type ScrubBind = ReturnType<typeof useChartScrub>["bind"] & { "aria-label"?: string };

/* ── the readout ──────────────────────────────────────────────────────────── */

const C = (v: string) => `var(--color-${v})`;

/**
 * Which side of a plot the readout takes: the one the finger is NOT on, so it
 * can never hide the point being read. It flips at the midpoint of the series
 * rather than of the width, because the series is what the finger is choosing
 * between.
 */
export function readoutSide(index: number, count: number): "left" | "right" {
  return index * 2 >= count - 1 ? "left" : "right";
}

/**
 * The held figure, pinned inside the plot.
 *
 * For a chart with room of its own. A card-sized chart uses its own label and
 * figure slots instead (see the endurance lanes and the Trends bands) — a pill
 * this size would cover most of a 176px tile.
 *
 * `when` and `note` arrive already localized: the model formats the FIGURE,
 * because that is where the units live, and the client formats the sentence
 * around it, because that is where the language lives.
 */
export function ChartReadout({ read, side, when, note }: {
  read: ChartReading;
  side: "left" | "right";
  when: string;
  note?: string;
}) {
  return (
    <span
      aria-live="polite"
      style={{
        position: "absolute", top: 0, [side]: 0, display: "flex", flexDirection: "column", gap: 2,
        alignItems: side === "right" ? "flex-end" : "flex-start",
        padding: "5px 9px", borderRadius: 12, pointerEvents: "none", zIndex: 2,
        background: `color-mix(in srgb, ${C("ink")} 88%, transparent)`, border: `1px solid ${C("line")}`,
      }}
    >
      <span style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <b style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.note, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums", color: read.best ? "var(--lime-text)" : C("chalk") }}>{read.value}</b>
        {!!read.unit && <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash") }}>{read.unit}</span>}
      </span>
      <span style={{ display: "flex", gap: 8, fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash"), whiteSpace: "nowrap" }}>
        <span>{when}</span>
        {!!note && <span>{note}</span>}
      </span>
    </span>
  );
}
