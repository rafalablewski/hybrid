"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { numericDiff, numericRolls } from "@hybrid/core";

/**
 * A FIGURE THAT ROLLS to its new value instead of being swapped for it — the
 * web half of SwiftUI's `contentTransition(.numericText())`.
 *
 * This is a training app, so numbers changing IS the content: a weight going
 * 80 → 82.5, a rest clock falling, a macro total climbing as the day is logged.
 * Every one of those was a plain re-render — the old string replaced by the new
 * one in a single frame, with nothing to say which way it moved.
 *
 * WHAT CHANGED is decided in @hybrid/core `numericDiff`, shared with the mobile
 * twin (aurora/rolling-number.tsx there), because the interesting part is the
 * diff and not the animation: which columns kept their identity, which are new,
 * and which way the VALUE moved. Get that wrong on one client and the same
 * number rolls up in the browser and down on the phone.
 *
 * Only the changed digits move. A column that is still a 2 does not travel, a
 * decimal point never travels, and a figure that changed SHAPE ("—" becoming a
 * weight) does not roll at all — that is one thing replaced by another, not one
 * value becoming the next.
 *
 * Reduce Motion is handled by the global backstop in globals.css, which collapses
 * these animations; the number still updates, which is the part that matters.
 */
export default function RollingNumber({
  value,
  style,
  className,
  "aria-label": ariaLabel,
}: {
  /** The formatted figure, exactly as it should read. */
  value: string;
  style?: CSSProperties;
  className?: string;
  "aria-label"?: string;
}) {
  const prev = useRef<string | null>(null);
  // Re-render is driven by `value`; this only remembers what to roll FROM.
  const [, force] = useState(0);
  useEffect(() => {
    prev.current = value;
    force((n) => n + 1);
  }, [value]);

  const from = prev.current;
  const roll = numericRolls(from, value);
  const { cells, dir } = numericDiff(from ?? value, value);

  return (
    // The whole figure is ONE accessible string. Split into per-column spans it
    // reads out character by character ("eight", "two", "point", "five"), which
    // is worse than the swap this replaces — so the columns are hidden from
    // assistive tech and the value is announced once, off-screen.
    <span className={className} style={{ display: "inline-flex", position: "relative", ...style }}>
      <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>
        {ariaLabel ?? value}
      </span>
      <span aria-hidden style={{ display: "inline-flex" }}>
        {cells.map((c, i) =>
          roll && c.rolls && c.changed ? (
            <span
              // Keyed by POSITION plus the character, so React remounts exactly
              // the columns that changed — which is what starts their animation
              // — and leaves the rest alone.
              key={`${c.key}:${c.char}:${i}`}
              style={{ display: "inline-grid", overflow: "hidden", lineHeight: 1 }}
            >
              {/* Both faces occupy one grid cell: the old one leaves in the
                  direction the value moved and the new one arrives from the
                  opposite side, so the column reads as a wheel turning rather
                  than as two characters cross-fading. */}
              <span style={{ gridArea: "1 / 1" }} className={dir === 1 ? "roll-out-up" : "roll-out-down"}>
                {c.prev}
              </span>
              <span style={{ gridArea: "1 / 1" }} className={dir === 1 ? "roll-in-up" : "roll-in-down"}>
                {c.char}
              </span>
            </span>
          ) : (
            <span key={`${c.key}:${i}`} style={{ lineHeight: 1 }}>{c.char}</span>
          ),
        )}
      </span>
    </span>
  );
}
