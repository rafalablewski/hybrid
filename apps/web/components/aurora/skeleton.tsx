"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { durations } from "@hybrid/core";

/**
 * SKELETONS (web) — the twin of the mobile primitives in apps/mobile/lib/ui.tsx.
 *
 * A spinner is correct only when you cannot predict the SHAPE of what is
 * coming. This app almost always can — a session card, a macro ring, a chart, a
 * set row — so a placeholder should be that geometry, reserving its own space
 * and filling in, not a spinner in the middle of an empty screen.
 *
 * The two clients had different loading languages: mobile grew a Skeleton and
 * put 33 arriving-content sites on it, while web kept a `.skeleton` class that
 * essentially nothing used and said "Loading…" in mono instead. Same product,
 * two answers.
 *
 * The breath itself lives in @hybrid/core `skeleton` and reaches this file
 * through the generated custom properties in globals.css, so the rate cannot
 * drift between clients — see .skeleton there.
 */

/** A placeholder block that holds the space its content will fill. */
export function Skeleton({
  width = "100%",
  height = 14,
  radius = 8,
  style,
}: {
  width?: number | string;
  height?: number;
  radius?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      className="skeleton"
      aria-hidden
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}

/**
 * The default content placeholder — three bars at descending widths, which read
 * as "a list is coming here" rather than "something is happening somewhere".
 * Named and shaped to match the mobile `Loading()` exactly.
 */
export function Loading() {
  return (
    <div role="progressbar" aria-label="Loading" style={{ display: "grid", gap: 10, padding: "24px 0" }}>
      <Skeleton width="62%" height={16} />
      <Skeleton height={12} />
      <Skeleton width="84%" height={12} />
    </div>
  );
}

/**
 * The hand-over from a placeholder to the thing it was holding space for.
 *
 * The audit's finding was that skeleton → content was a SWAP: one frame of
 * placeholder, the next frame a fully-formed screen. Both states are rendered
 * into the same grid cell here and cross-fade over `durations.crossfade`, so
 * the content arrives where the placeholder was rather than replacing it.
 *
 * The placeholder is kept mounted through its own fade and removed after —
 * unmounting it on the flag would leave nothing to fade out, which is the exact
 * swap this replaces.
 */
export function LoadSwap({
  loading,
  placeholder = <Loading />,
  children,
  style,
}: {
  loading: boolean;
  /** What holds the space. Give it the geometry of the real thing. */
  placeholder?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}) {
  // `held` lags `loading` by one crossfade so the outgoing placeholder is still
  // in the tree while it fades.
  const [held, setHeld] = useState(loading);
  const first = useRef(true);
  useEffect(() => {
    if (loading) { setHeld(true); return undefined; }
    const t = setTimeout(() => setHeld(false), durations.crossfade);
    return () => clearTimeout(t);
  }, [loading]);
  useEffect(() => { first.current = false; }, []);

  return (
    <div className="load-swap" style={style}>
      {held && (
        <div className={`load-ph${loading ? "" : " load-swap-out"}`}>{placeholder}</div>
      )}
      {/* Content mounts as soon as the data is there — it is the thing that
          fades UP through the placeholder, so it cannot wait for it to leave.
          No entrance on a first render that was never loading: there was no
          placeholder to hand over from, and fading in anyway would make every
          already-cached screen blink. */}
      {!loading && <div className={first.current ? undefined : "load-swap-in"}>{children}</div>}
    </div>
  );
}
