import { useRef, useState } from "react";
import { PanResponder, Text, View } from "react-native";
import { scrubFraction, scrubIndex, type ChartReading, type ScrubMode } from "@hybrid/core";
import { haptic } from "../../lib/haptics";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { F, fs, tracking, ty} from "../../lib/ui";
import { RADIUS } from "./kit";
import { withAlpha } from "./field";

/**
 * THE HELD CHART (mobile) — press a chart and it states the figure under your
 * finger, the way a stock chart does. The hit-testing is core's (`scrubIndex`)
 * rather than this file's, so which week a press reads is decided once, by a
 * tested function, and not by geometry re-derived inside a gesture handler.
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
export interface ScrubOptions {
  /**
   * Milliseconds a finger must dwell before the chart answers — for a chart
   * that is ALSO a button (the Today exercise cards, the other-sport tiles),
   * where a press has to declare which of the two things it meant. Under the
   * dwell the press is a tap and `onTap` fires; past it, it is a read and the
   * tap is cancelled. Web reaches the same behaviour with its own HOLD_MS.
   *
   * Omit it on a chart that is only a chart: there is nothing to disambiguate,
   * and a delay before the answer is just a slower answer.
   */
  holdMs?: number;
  /** What the press meant when it ended before the dwell. */
  onTap?: () => void;
  /**
   * PINCH TO CHANGE THE PERIOD. `+1` is a pinch OUT — fingers spreading, which
   * zooms IN to a shorter range; `-1` is a pinch in. The host maps that onto
   * its own range (core `stepActivityRange` is the ladder), because a chart
   * knows it was pinched and nothing about what period it is drawing.
   *
   * Omit it and two fingers behave exactly as they did: the chart simply reads
   * under the first one. A chart with no period to zoom must not pretend.
   */
  onZoom?: (dir: 1 | -1) => void;
}

/** How far the fingers must spread or close before it counts as one step.
 *  Generous on purpose: a pinch that fires at 10% turns every two-finger
 *  scroll into a range change, and the range is a destructive-feeling edit —
 *  the whole screen redraws. One deliberate gesture, one rung. */
const ZOOM_STEP = 1.4;

export function useChartScrub(count: number, mode: ScrubMode, inset?: number, opts: ScrubOptions = {}) {
  const [index, setIndex] = useState(-1);
  const ref = useRef<View | null>(null);
  /** Optional: the PLOT, when the press target is bigger than the drawing (a
   *  whole tile, say). The fraction is always measured against the drawing, or
   *  the first bar would start wherever the padding did. */
  const plotRef = useRef<View | null>(null);
  const box = useRef({ x: 0, width: 0 });
  const geo = useRef({ count, mode, inset });
  geo.current = { count, mode, inset };
  const cfg = useRef(opts);
  cfg.current = opts;
  const last = useRef(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const at = useRef(0);
  /** Finger spread the current zoom step is measured FROM. 0 = not pinching. */
  const spread = useRef(0);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => true,
      // Measure THEN read, in the callback: a rail that has been scrolled since
      // the last layout would otherwise answer the first press off a stale box.
      onPanResponderGrant: (e) => {
        const pageX = e.nativeEvent.pageX;
        at.current = pageX;
        const hold = cfg.current.holdMs;
        if (!hold) { measure(() => read(pageX)); return; }
        // The dwell reads the LATEST x rather than the one it was armed with,
        // so a finger that settles a few millimetres along still answers where
        // it stopped.
        timer.current = setTimeout(() => {
          timer.current = null;
          measure(() => read(at.current));
        }, hold);
      },
      onPanResponderMove: (e) => {
        // TWO FINGERS IS A DIFFERENT GESTURE. A pinch is not a scrub with a
        // spare finger: reading under one of them while the other is moving
        // would flicker the readout across the series as the hand closes.
        if (cfg.current.onZoom && e.nativeEvent.touches.length >= 2) {
          if (last.current >= 0) clear();
          pinch(e.nativeEvent.touches);
          return;
        }
        spread.current = 0;
        at.current = e.nativeEvent.pageX;
        if (!timer.current) read(e.nativeEvent.pageX);
      },
      onPanResponderRelease: () => {
        // Nothing was read, so the press was the other thing this surface is —
        // a button. A pinch is neither: it already did its work per detent, and
        // must not also fire the tap on the way out.
        const pinched = spread.current > 0;
        const tapped = cfg.current.holdMs != null && last.current < 0 && !pinched;
        spread.current = 0;
        clear();
        if (tapped) cfg.current.onTap?.();
      },
      onPanResponderTerminate: () => { spread.current = 0; clear(); },
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
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    last.current = -1;
    setIndex(-1);
  }
  /**
   * One rung per crossing, and RE-BASE after each — so a slow continuous
   * spread walks the ladder rung by rung instead of firing once and then
   * either going quiet or buzzing every frame. This is the audit's slider
   * rule ("selection per detent only, never continuously") applied to a
   * gesture that has no thumb: the detent is the ratio threshold.
   */
  function pinch(touches: { pageX: number; pageY: number }[]) {
    const [a, b] = touches;
    if (!a || !b) return;
    const d = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
    if (!spread.current) { spread.current = d; return; }
    const ratio = d / spread.current;
    const dir: 1 | -1 | 0 = ratio > ZOOM_STEP ? 1 : ratio < 1 / ZOOM_STEP ? -1 : 0;
    if (!dir) return;
    spread.current = d;
    haptic.selection();
    cfg.current.onZoom?.(dir);
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

/* ── the readout ─────────────────────────────────────────────────────────── */

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
 * this size would cover most of a 176dp tile.
 *
 * `when` and `note` arrive already localized: the model formats the FIGURE,
 * because that is where the units live, and the client formats the sentence
 * around it, because that is where the language lives.
 */
export function ChartReadout({ read, side, when, note, C: palette }: {
  read: ChartReading;
  side: "left" | "right";
  when: string;
  note?: string;
  /** The host's palette, when it already has one in hand. */
  C?: Palette;
}) {
  const theme = useTheme();
  const C = palette ?? theme.palette;
  const label = ty(C, "overline");
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute", top: 0,
        left: side === "left" ? 0 : undefined,
        right: side === "right" ? 0 : undefined,
        alignItems: side === "right" ? "flex-end" : "flex-start",
        gap: 2, paddingHorizontal: 9, paddingVertical: 5, zIndex: 2,
        borderRadius: RADIUS.inner, backgroundColor: withAlpha(C.ink, 0.88), borderWidth: 1, borderColor: C.line,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4 }}>
        <Text style={{ fontFamily: F.monoBold, fontSize: fs.bodyLg, color: read.best ? txt(C, C.lime) : C.chalk }}>{read.value}</Text>
        {!!read.unit && <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginBottom: 2 }}>{read.unit}</Text>}
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Text style={label}>{when}</Text>
        {!!note && <Text style={label}>{note}</Text>}
      </View>
    </View>
  );
}
