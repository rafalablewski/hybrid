"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { springs, springToRN } from "@hybrid/core";

/**
 * LIQUID SEGMENTED CONTROL (web) — the iOS 26 two-state selection, twin of
 * apps/mobile/components/aurora/liquid-seg.tsx. One primitive, consumed by the
 * Today hub switcher and the This-week date filter, so both clients carry the
 * same behaviour per the parity rule.
 *
 * The system control's behaviour, reconstructed for the browser:
 *  - AT REST the selection is a quiet, near-solid NEUTRAL pill inside the
 *    track — no permanent glassiness, no accent fill.
 *  - ON TOUCH the pill inflates past the track's edges and crossfades to a
 *    clear glass lens (backdrop-filter — a browser has no system material,
 *    so the simulation IS the web treatment) with a hairline rim. Dragging
 *    scrubs it across segments; release commits the one under the lens.
 *  - A TAP on another segment sends the lens over glassy IN FLIGHT — it lands
 *    as the solid pill, on the shared lens spring (@hybrid/core springs.lens),
 *    with a gel stretch proportional to velocity.
 *
 * Segments are equal-width. An item may `intercept` selection (the date
 * filter's Month segment opens its picker instead of taking the pill).
 * Honours prefers-reduced-motion: springs collapse to instant moves.
 */

export type LiquidSegItem = {
  key: string;
  /** The segment's accessible name. */
  label: string;
  /** Draw the segment's content; `on` = selected, or under the lens mid-drag. */
  render: (on: boolean) => ReactNode;
  /** Replace selection (e.g. open a sheet). The pill springs back home. */
  intercept?: () => void;
};

// How far the lens grows past the track under touch (px), per the reference.
const GROW_Y = 7;
const GROW_X = 16;
// THE LENS SPRING — springs.lens from @hybrid/core, converted to the
// stiffness/damping this integrator wants. It used to be SwiftUI's DEFAULT
// spring hard-coded here (response .55 / damping .75 = K 130, DAMP 17), which
// settles in 629ms: 40% past the system's own 450ms ceiling, on the control
// users touch most often. Reading the token means the guard in motion.test.ts
// now covers this curve too.
const { stiffness: K, damping: DAMP } = springToRN(springs.lens);
// Dragging damps harder so the lens tracks the finger instead of swinging past
// it — twice the resting damping, kept as a RATIO so retuning the token can't
// silently leave the drag feel behind.
const DRAG_DAMP = DAMP * 2;

export function LiquidSeg({
  items,
  index,
  onSelect,
  segHeight = 36,
  pad = 4,
  trackStyle,
}: {
  items: LiquidSegItem[];
  index: number;
  onSelect: (i: number) => void;
  segHeight?: number;
  pad?: number;
  trackStyle?: React.CSSProperties;
}) {
  const n = items.length;
  const trackRef = useRef<HTMLDivElement>(null);
  const lensRef = useRef<HTMLDivElement>(null);
  const restRef = useRef<HTMLDivElement>(null);
  const glassRef = useRef<HTMLDivElement>(null);
  /** The segment the lens is over mid-drag; null when idle (selection rules). */
  const [under, setUnder] = useState<number | null>(null);

  // All physics lives in one mutable bag so the rAF loop and the pointer
  // handlers never fight React's render cycle.
  const S = useRef({
    x: 0, vx: 0, lift: 0, vlift: 0, liftTarget: 0,
    raf: 0, last: 0, init: false,
    dragging: false, travelling: false, dragX: 0, downX: 0, downSeg: -1, hasDown: false,
    suppressClick: false, reduced: false,
    index, items,
  }).current;
  S.index = index;
  S.items = items;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const set = () => { S.reduced = mq.matches; };
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, [S]);

  const thumbW = () => {
    const w = trackRef.current?.clientWidth ?? 0;
    return w > 0 ? (w - 2 * pad) / n : 0;
  };

  const step = (t: number) => {
    const lens = lensRef.current, rest = restRef.current, glass = glassRef.current, track = trackRef.current;
    if (!lens || !rest || !glass || !track) { S.raf = 0; return; }
    const dt = Math.min((t - S.last) / 1000, 0.032);
    S.last = t;
    const w = thumbW();
    const tx = S.dragging ? S.dragX : S.index * w;
    if (!S.init) { S.init = true; S.x = tx; }

    if (S.reduced) {
      S.x = tx; S.vx = 0; S.lift = 0; S.vlift = 0; S.travelling = false;
    } else {
      const c = S.dragging ? DRAG_DAMP : DAMP;
      S.vx += (K * (tx - S.x) - c * S.vx) * dt;
      S.x += S.vx * dt;
      // the in-flight glass condenses back into the pill as it lands
      if (S.travelling && !S.hasDown && Math.abs(tx - S.x) < 3 && Math.abs(S.vx) < 24) {
        S.travelling = false;
        S.liftTarget = 0;
      }
      S.vlift += (420 * (S.liftTarget - S.lift) - 30 * S.vlift) * dt;
      S.lift = Math.max(0, Math.min(1.1, S.lift + S.vlift * dt));
    }

    const L = S.lift;
    const stretch = S.reduced ? 0 : Math.min(Math.abs(S.vx) * 0.0009, 0.2);
    const edge = `${pad - GROW_Y * L}px`;
    lens.style.top = edge;
    lens.style.bottom = edge;
    lens.style.width = `${w + GROW_X * L}px`;
    lens.style.transformOrigin = `${50 - Math.max(-30, Math.min(30, S.vx * 0.06))}% 50%`;
    lens.style.transform = `translateX(${S.x - (GROW_X / 2) * L}px) scale(${1 + stretch}, ${1 - stretch * 0.35})`;
    rest.style.opacity = String(Math.max(0, 1 - L * 1.15));
    glass.style.opacity = String(Math.min(1, L * 1.2));

    const still =
      Math.abs(tx - S.x) < 0.3 && Math.abs(S.vx) < 2 &&
      Math.abs(S.liftTarget - S.lift) < 0.005 && Math.abs(S.vlift) < 0.02 &&
      !S.dragging && !S.hasDown && !S.travelling;
    if (still) {
      S.x = tx; S.vx = 0;
      lens.style.transform = `translateX(${S.x}px) scale(1, 1)`;
      S.raf = 0;
      return;
    }
    S.raf = requestAnimationFrame(step);
  };

  const kick = () => {
    if (S.raf) return;
    S.last = performance.now();
    S.raf = requestAnimationFrame(step);
  };

  // Selection moved (tap, keyboard, or external state): fly the lens over.
  useEffect(() => {
    if (S.init && !S.reduced && !S.dragging && Math.abs(S.index * thumbW() - S.x) > 2) {
      S.travelling = true;
      S.liftTarget = Math.max(S.liftTarget, 0.85);
    }
    kick();
    addEventListener("resize", kick);
    return () => {
      removeEventListener("resize", kick);
      if (S.raf) cancelAnimationFrame(S.raf);
      S.raf = 0;
    };
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (i: number) => {
    const it = S.items[i];
    if (!it) return;
    if (it.intercept) { it.intercept(); return; } // pill springs home (index unchanged)
    if (i !== S.index) onSelectRef.current(i);
  };

  const segAt = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    const w = thumbW();
    if (!r || w <= 0) return S.index;
    return Math.min(n - 1, Math.max(0, Math.floor((clientX - r.left - pad) / w)));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    S.hasDown = true;
    S.downX = e.clientX;
    S.downSeg = segAt(e.clientX);
    if (S.downSeg === S.index) { S.liftTarget = 1; kick(); }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!S.hasDown) return;
    if (!S.dragging && Math.abs(e.clientX - S.downX) > 6) {
      S.dragging = true;
      S.liftTarget = 1;
      trackRef.current?.setPointerCapture(e.pointerId);
    }
    if (!S.dragging) return;
    const r = trackRef.current!.getBoundingClientRect();
    const w = thumbW();
    S.dragX = Math.min(Math.max(e.clientX - r.left - pad - w / 2, 0), r.width - 2 * pad - w);
    const i = segAt(e.clientX);
    setUnder((cur) => (cur === i ? cur : i));
    kick();
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!S.hasDown) return;
    S.hasDown = false;
    S.liftTarget = 0;
    if (S.dragging) {
      S.dragging = false;
      S.suppressClick = true;
      const w = thumbW();
      commit(w > 0 ? Math.min(n - 1, Math.max(0, Math.round(S.dragX / w))) : S.index);
    }
    setUnder(null);
    kick();
  };

  // The initial (server-rendered) lens position is pure CSS — equal segments
  // make a %-of-own-width translate exact — so there's no first-paint jump
  // before the px physics take over.
  const lensInit: React.CSSProperties = {
    position: "absolute",
    left: pad,
    top: pad,
    bottom: pad,
    width: `calc((100% - ${2 * pad}px) / ${n})`,
    transform: `translateX(${index * 100}%)`,
    borderRadius: 999,
    pointerEvents: "none",
    // NB: no `filter` here — a filter on this ancestor would become the
    // backdrop root and break the glass child's backdrop-filter.
  };

  return (
    <div
      ref={trackRef}
      role="tablist"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        position: "relative",
        display: "flex",
        padding: pad,
        borderRadius: 999,
        touchAction: "pan-y",
        ...trackStyle,
      }}
    >
      <div ref={lensRef} aria-hidden style={lensInit}>
        {/* rest state: the quiet neutral pill */}
        <div
          ref={restRef}
          style={{
            position: "absolute", inset: 0, borderRadius: 999,
            background: "color-mix(in srgb, var(--color-chalk) 22%, transparent)",
            boxShadow: "0 1px 3px rgba(0,0,0,.3)",
          }}
        />
        {/* touched state: the clear glass lens */}
        <div
          ref={glassRef}
          style={{
            position: "absolute", inset: 0, borderRadius: 999, opacity: 0,
            background: "color-mix(in srgb, var(--color-chalk) 9%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-chalk) 45%, transparent)",
            backdropFilter: "blur(8px) saturate(1.5) brightness(1.06)",
            WebkitBackdropFilter: "blur(8px) saturate(1.5) brightness(1.06)",
            boxShadow: "inset 0 1px 1px rgba(255,255,255,.35), inset 0 -1px 1px rgba(255,255,255,.08), 0 5px 14px rgba(0,0,0,.3)",
          }}
        />
      </div>
      {items.map((it, i) => {
        const on = under === null ? i === index : under === i;
        return (
          <button
            key={it.key}
            role="tab"
            aria-selected={i === index}
            aria-label={it.label}
            title={it.label}
            onClick={() => {
              if (S.suppressClick) { S.suppressClick = false; return; }
              commit(i);
            }}
            onKeyDown={(e) => {
              const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
              if (!d) return;
              e.preventDefault();
              commit(Math.min(n - 1, Math.max(0, i + d)));
            }}
            style={{
              position: "relative", flex: 1, minWidth: 0, height: segHeight,
              background: "none", border: "none", cursor: "pointer", borderRadius: 999,
              display: "grid", placeItems: "center", padding: 0,
            }}
          >
            {it.render(on)}
          </button>
        );
      })}
    </div>
  );
}
