"use client";

import { useEffect } from "react";

/**
 * The web twin of the mobile `NavScrollProvider` (apps/mobile/lib/nav-scroll.tsx):
 * ONE scroll signal, published once, that any number of surfaces can subscribe
 * to. Mobile needed it because RN has no global scroll event; web needs it
 * because several surfaces want the same value and each adding its own listener
 * is how you end up with four of them fighting over the same frame.
 *
 * Published as a CSS custom property rather than React state, deliberately: this
 * fires on every scroll frame, and re-rendering the shell 60 times a second to
 * move a title would be absurd. As a registered `<number>` property, CSS can do
 * the interpolation itself and the whole effect stays off the main thread's
 * React path. Nothing re-renders.
 *
 * 0 = at the top, 1 = collapsed past COLLAPSE_DISTANCE. Same 48px range the
 * mobile nav pill already uses, so the two clients compress in step.
 */
const COLLAPSE_DISTANCE = 48;

export function useScrollCollapse(): void {
  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;
    let last = -1;

    const publish = () => {
      frame = 0;
      const y = window.scrollY || 0;
      const next = y <= 0 ? 0 : y >= COLLAPSE_DISTANCE ? 1 : y / COLLAPSE_DISTANCE;
      // Only touch the DOM when the value actually moves — scroll fires far more
      // often than the value changes once you're past the range.
      const rounded = Math.round(next * 100) / 100;
      if (rounded === last) return;
      last = rounded;
      root.style.setProperty("--scroll-collapse", String(rounded));
    };

    const onScroll = () => {
      // rAF-throttled: one write per painted frame, never one per scroll event.
      if (!frame) frame = requestAnimationFrame(publish);
    };

    publish();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
      root.style.removeProperty("--scroll-collapse");
    };
  }, []);
}
