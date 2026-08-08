import { useRef, useState } from "react";
import { PanResponder, View } from "react-native";
import { scrubFraction, scrubIndex, type ScrubMode } from "@hybrid/core";
import { haptic } from "../../lib/haptics";

/**
 * THE HELD CHART (mobile) — press a chart and it states the figure under your
 * finger, the way a stock chart does. The twin of
 * apps/web/components/aurora/chart-scrub.tsx: the hit-testing is core's
 * (`scrubIndex`), so the same press reads the same week in a browser and here.
 *
 * The gesture is the only per-client part. It claims the touch on CONTACT — a
 * still finger IS the gesture, so waiting for movement would mean holding a
 * chart did nothing — but grants every termination request, which is how an
 * enclosing scroller takes the drag back the moment it turns out to be a
 * scroll. That matters twice over: the page scrolls vertically past every
 * chart, and a chart inside a rail has a horizontal scroller to yield to as
 * well. A chart that traps the finger is a chart the athlete has to scroll
 * around. (The web twin has to emulate the delay before the touch arrives with
 * a timer; here `delaysContentTouches` on the scroll view already provides it,
 * which is why a swipe never flashes a readout on the way past.)
 *
 * The x is read from `pageX` against a MEASURED box rather than `locationX`,
 * because `locationX` is relative to whichever child the finger happens to be
 * over — mid-drag across eight bars, a different view every few millimetres.
 * The box is re-measured on every press: inside a horizontal rail the plot's
 * window position changes with the rail's own scroll.
 */
export function useChartScrub(count: number, mode: ScrubMode, inset?: number) {
  const [index, setIndex] = useState(-1);
  const ref = useRef<View | null>(null);
  /** Optional: the PLOT, when the press target is bigger than the drawing (a
   *  whole tile, say). The fraction is always measured against the drawing, or
   *  the first bar would start wherever the padding did. */
  const plotRef = useRef<View | null>(null);
  const box = useRef({ x: 0, width: 0 });
  const geo = useRef({ count, mode, inset });
  geo.current = { count, mode, inset };
  const last = useRef(-1);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => true,
      // Measure THEN read, in the callback: a rail that has been scrolled since
      // the last layout would otherwise answer the first press off a stale box.
      onPanResponderGrant: (e) => {
        const pageX = e.nativeEvent.pageX;
        measure(() => read(pageX));
      },
      onPanResponderMove: (e) => read(e.nativeEvent.pageX),
      onPanResponderRelease: () => clear(),
      onPanResponderTerminate: () => clear(),
    }),
  ).current;

  // Declared after the responder so both close over the same refs; the
  // responder is built once, and everything it touches is a ref, so it never
  // acts on a stale render.
  function measure(then?: () => void) {
    const node = plotRef.current ?? ref.current;
    if (!node) { then?.(); return; }
    node.measureInWindow((x, _y, w) => {
      box.current = { x, width: w || box.current.width };
      then?.();
    });
  }
  function read(pageX: number) {
    const i = scrubIndex(scrubFraction(pageX - box.current.x, box.current.width), geo.current);
    if (i === last.current) return;
    last.current = i;
    // Crossing into the next week is a discrete step — Apple's own use for
    // `selection`, and the same feedback the segmented controls give.
    if (i >= 0) haptic.selection();
    setIndex(i);
  }
  function clear() {
    last.current = -1;
    setIndex(-1);
  }

  const bind = {
    ref,
    onLayout: () => measure(),
    ...pan.panHandlers,
  };
  return { index, bind, plotRef };
}

/** What a scrubbable chart spreads onto its own root. */
export type ScrubBind = ReturnType<typeof useChartScrub>["bind"];
