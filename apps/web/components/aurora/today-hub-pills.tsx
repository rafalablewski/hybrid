"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  HUB_DOCK_REST,
  HUB_PILL,
  TODAY_TABS,
  hubDockState,
  hubDockVisible,
  hubMotion,
  type HubDockState,
  type TodayTabId,
} from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import { HubGlyph } from "./today-tabs";

// ── THE TODAY HUB DOCK (web) ────────────────────────────────────────────────
// What Today leaves behind on scroll, in the slot the deleted pill rail used
// to hold: the hub switcher itself, so the persistent element is the way OUT
// of the view you are in rather than a summary of it.
//
// SPLIT — once the in-flow segmented control has scrolled off, the three
// destinations become three free pills. Free pills need not be equal, so
// exactly one of them (the one you are in) carries its WORD; the other two
// contract to their glyph. Inside a track that is impossible, which is why the
// resting control is glyph-only.
//
// RETURN — the row answers scroll DIRECTION. Reading down takes it away; the
// first flick up brings it back. Both rules live in @hybrid/core
// (today-hub-dock.ts) so mobile detaches, hides and returns at identical
// points; this file owns only the pixels. Mirrored on mobile
// (aurora/today-hub-pills.tsx).
//
// SPLIT IS THE GAP. The row arrives with the pills touching and springs them
// apart; leaving, it runs backwards and they merge. One animated number, shared
// with mobile — where, on iOS, touching pills are not three shapes at all: the
// native GlassEffectContainer FUSES adjacent Liquid Glass into one lozenge and
// flows it apart, which is the transition this gap describes and CSS can only
// state. The physics is identical either way: every transition below is a
// sampled spring from the app's own tokens (motion.ts), the same response and
// damping SwiftUI integrates natively.
//
// Under REDUCED MOTION the row renders DOCK instead: one capsule, glyph-only,
// permanently on screen while detached. RETURN's whole value is the motion, and
// a control that vanishes without one has simply disappeared.

const C = (v: string) => `var(--color-${v})`;

/** Mirrors the mobile useReducedMotion so the dock's motion is suppressed for
 *  users who ask for less of it. */
function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}

/**
 * Drive the shared dock engine off the window scroll.
 *
 * Web is the client that CAN measure the switcher's real bottom edge cheaply,
 * so it does — the row then appears the instant the real control leaves, never
 * beside it. The full state lives in a ref and only a PHASE change reaches
 * React, so a scroll at 60fps costs one rAF measurement and no renders.
 */
function useHubDock(anchor: RefObject<HTMLElement | null>, reduced: boolean, resetKey: string) {
  const [phase, setPhase] = useState<HubDockState["phase"]>("attached");
  // The content column's left edge, taken from the same rect as the threshold.
  // The row is LEADING-anchored, and on web the column is not the viewport edge
  // — the app shell keeps a sidebar — so the inset is measured rather than
  // assumed. Lining up with the switcher's own left edge also means detaching
  // reads as the control lifting straight up, with no sideways drift.
  const [inset, setInset] = useState<number | null>(null);
  const held = useRef<HubDockState>(HUB_DOCK_REST);

  // A hub switch mounts a different view at the top of the page: the dock has
  // to start over, or the new screen inherits the old one's direction run.
  useEffect(() => {
    held.current = HUB_DOCK_REST;
    setPhase("attached");
  }, [resetKey]);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const el = anchor.current;
      const y = window.scrollY;
      const rect = el ? el.getBoundingClientRect() : null;
      const next = hubDockState(y, {
        controlBottom: rect ? rect.bottom + y : null,
        reduced,
        prev: held.current,
      });
      held.current = next;
      setPhase((p) => (p === next.phase ? p : next.phase));
      // Sub-pixel jitter must not re-render on every scrolled frame.
      if (rect) setInset((v) => (v != null && Math.abs(v - rect.left) < 1 ? v : rect.left));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [anchor, reduced]);

  return { phase, inset };
}

export function TodayHubPills({
  value,
  onChange,
  anchor,
}: {
  value: TodayTabId;
  onChange: (id: TodayTabId) => void;
  /** The in-flow switcher, so the row appears exactly as it leaves. */
  anchor: RefObject<HTMLElement | null>;
}) {
  const { t } = useLang();
  const reduced = useReducedMotion();
  const { phase, inset } = useHubDock(anchor, reduced, value);
  const shown = hubDockVisible(phase);

  // PORTALLED TO THE BODY, for two reasons that happen to be the same reason.
  // The screen-transition wrapper this component renders inside carries a
  // `transform` while a screen animates, and a transformed ancestor becomes the
  // containing block for `position: fixed` — so a fixed row nested under it
  // scrolls with the page instead of pinning (measured: it tracked scrollY
  // exactly). Escaping to the body also keeps the dock OUT of the hub's own
  // transition, which is what "the chrome holds still" requires of it.
  // Mounted-gated so the server render and the first client render agree.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const reveal = hubMotion("reveal", reduced);
  const conceal = hubMotion("conceal", reduced);
  const exchange = hubMotion("exchange", reduced);
  const move = shown ? reveal : conceal;

  if (!mounted) return null;

  return createPortal(
    <div
      aria-hidden={!shown}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 45,
        display: "flex",
        justifyContent: "flex-start",
        paddingTop: HUB_PILL.top,
        // Anchored to the CONTENT COLUMN, not the viewport: on a wide screen
        // the shell's sidebar owns the left edge, so a row flush to it would
        // float over the nav. `inset` is the switcher's own measured left; the
        // shared gutter stands in until the first measurement lands.
        paddingLeft: inset ?? HUB_PILL.inset,
        paddingRight: HUB_PILL.inset,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          // SPLIT / MERGE — the pills arrive touching and spring apart. The gap
          // rides the ARRIVAL spring in both directions (it is positional, and
          // the row is still on screen while it closes), not the flat conceal
          // curve that carries the lift and the fade.
          gap: reduced || !shown ? 0 : HUB_PILL.gap,
          pointerEvents: shown ? "auto" : "none",
          opacity: shown ? 1 : 0,
          transform: shown ? "none" : `translateY(calc(-100% - ${HUB_PILL.top}px))`,
          transition: [
            `transform ${move.ms}ms ${move.css}`,
            `opacity ${Math.round(move.ms * 0.8)}ms ease`,
            `gap ${reveal.ms}ms ${reveal.css}`,
          ].join(", "),
          // DOCK (reduced motion): the three pills sit inside one capsule
          // instead of floating free, so the fallback is a shipped shape rather
          // than a degraded one.
          ...(reduced
            ? {
                background: C("ink2"),
                border: `1px solid ${C("line")}`,
                borderRadius: 999,
                padding: 4,
              }
            : null),
        }}
      >
        {TODAY_TABS.map((tab, i) => {
          const on = tab.id === value;
          const label = t(tab.labelKey);
          // MERGED, the row is ONE lozenge, not three capsules in a chain: the
          // abutting corners square off as the gap shuts and round again as it
          // opens. This is what iOS gets for free — adjacent Liquid Glass fuses
          // inside a GlassEffectContainer — approximated on web with the one
          // property CSS can animate for it. Reduce Motion keeps every pill
          // round: there the DOCK capsule is the container, and squared pills
          // inside a track would just look broken.
          const round = `${HUB_PILL.height / 2}px`;
          const merged = !reduced && !shown;
          const corners = !merged
            ? round
            : i === 0
              ? `${round} 0 0 ${round}`
              : i === TODAY_TABS.length - 1
                ? `0 ${round} ${round} 0`
                : "0";
          return (
            <button
              key={tab.id}
              type="button"
              className={reduced ? "pressable" : "pressable aurora-navglass"}
              onClick={() => onChange(tab.id)}
              aria-label={label}
              title={label}
              aria-pressed={on}
              tabIndex={shown ? 0 : -1}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: HUB_PILL.siblingWidth,
                height: HUB_PILL.height,
                // The pill's own width IS the label's: padding and the label's
                // max-width are what animate, because a width transition to
                // `auto` does not run. Selecting a sibling therefore reads as
                // an exchange — one pill inflating to its word as the other
                // contracts — which is the physics the lens used to carry.
                padding: on ? `0 ${HUB_PILL.labelPadX}px` : 0,
                borderRadius: corners,
                border: reduced ? "1px solid transparent" : `1px solid ${on ? `color-mix(in srgb, ${C("lime")} 46%, transparent)` : C("line")}`,
                // The glass class alone is a 6% film — right for one wide
                // capsule over a dark ground, too thin for a 44px pill with
                // the page's own headings sliding under it. Each pill gets an
                // ink body behind the blur so the glyph stays legible whatever
                // it is passing over; the active one takes the same body under
                // its accent tint.
                background: reduced
                  ? on
                    ? `color-mix(in srgb, ${C("lime")} 14%, transparent)`
                    : "transparent"
                  : on
                    ? `linear-gradient(0deg, color-mix(in srgb, ${C("lime")} 15%, transparent), color-mix(in srgb, ${C("lime")} 15%, transparent)), color-mix(in srgb, ${C("ink")} 72%, transparent)`
                    : `color-mix(in srgb, ${C("ink")} 66%, transparent)`,
                color: on ? "var(--lime-text)" : C("ash"),
                cursor: "pointer",
                whiteSpace: "nowrap",
                overflow: "hidden",
                transition: [
                  `padding ${exchange.ms}ms ${exchange.css}`,
                  `background ${exchange.ms}ms ease`,
                  `border-color ${exchange.ms}ms ease`,
                  `color ${exchange.ms}ms ease`,
                  // The un-merging rides the ARRIVAL spring, with the gap.
                  `border-radius ${reveal.ms}ms ${reveal.css}`,
                ].join(", "),
              }}
            >
              <HubGlyph name={tab.glyph} size={HUB_PILL.glyph} />
              <span
                style={{
                  display: "inline-block",
                  overflow: "hidden",
                  maxWidth: on ? 220 : 0,
                  opacity: on ? 1 : 0,
                  marginLeft: on ? HUB_PILL.labelGap : 0,
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 14,
                  letterSpacing: "-.01em",
                  transition: [
                    `max-width ${exchange.ms}ms ${exchange.css}`,
                    `margin-left ${exchange.ms}ms ${exchange.css}`,
                    `opacity ${Math.round(exchange.ms * 0.6)}ms ease`,
                  ].join(", "),
                }}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}

export default TodayHubPills;
