import { useEffect, useRef } from "react";
import { Animated, PanResponder, type StyleProp, type ViewProps, type ViewStyle } from "react-native";
import type { useDragReorder } from "../lib/use-drag-reorder";

/**
 * A row you REORDER BY HOLDING IT — press, feel it lift, drag, let go. No grip.
 *
 * The other way to reorder in this app is `drag-handle.tsx`, the ⠿ the Builder
 * wears: a dedicated 16pt target that starts dragging the instant it is touched.
 * That one is right where a row is BUSY — the Builder's block cards carry a name
 * field, a collapse caret and a delete, so a whole-row drag would fight every one
 * of them. This one is right where a row is INERT and the list is short: nothing
 * to compete with, so the row can simply be the handle and the list stays clean.
 * Which is the whole reason reorder came back this way and not as a ＋/− pair of
 * move buttons stapled to every row.
 *
 * WHY A HOLD AND NOT A DRAG. The rows live inside a scroller. Claiming the
 * gesture on the first movement would eat the scroll; claiming it on touch-down
 * would eat the tap. So the touch has to declare itself: hold still for
 * HOLD_MS and the row lifts and is yours, move before that and it was a scroll
 * and we never claimed anything. Tapping is untouched — the responder is never
 * granted on a plain press.
 *
 * The lift, the nearest-centre drop, the haptics and the animated commit all
 * come from `lib/use-drag-reorder`, the same mechanic the grip drives. Only the
 * way the drag STARTS differs, which is the point: one reorder in the app, two
 * doors into it.
 */

/** How long the finger sits still before the row lifts. Long enough not to fire
 *  on a flick of a scroll, short enough not to feel like a stuck tap — the same
 *  ballpark as the logger card's own 400ms long-press, a touch quicker because
 *  here the hold is the beginning of a movement rather than a whole gesture. */
const HOLD_MS = 260;
/** Finger travel that says "this was a scroll, not a hold". */
const HOLD_SLOP = 8;

export default function HoldDragRow({
  drag,
  group = "",
  index,
  count,
  style,
  children,
  ...view
}: {
  drag: ReturnType<typeof useDragReorder>;
  /** Sibling-list key; single-list callers leave it "". */
  group?: string;
  index: number;
  /** The list's length. Below two there is nothing to reorder and the hold
   *  never arms, so a caller does not have to special-case a lone row. */
  count: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
} & Pick<ViewProps, "accessible" | "accessibilityLabel" | "accessibilityActions" | "onAccessibilityAction">) {
  const held = useRef(false);
  const granted = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef({ x: 0, y: 0 });

  // Live values behind a ref: the responder below is built ONCE, so reading
  // these off the closure would strand it on the first render's index.
  const live = useRef({ drag, group, index, count });
  live.current = { drag, group, index, count };

  const clearHold = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  // A row unmounting mid-hold (the sheet closing under a finger) must not fire
  // begin() into a component that is gone.
  useEffect(() => clearHold, []);

  const finish = () => {
    clearHold();
    if (!held.current) return;
    held.current = false;
    granted.current = false;
    live.current.drag.end();
  };

  const pan = useRef(
    PanResponder.create({
      // Never on touch-down: a press must stay a press.
      onStartShouldSetPanResponder: () => false,
      // Only once the hold has fired — before that, the scroller owns the move.
      onMoveShouldSetPanResponder: () => held.current,
      onMoveShouldSetPanResponderCapture: () => held.current,
      onPanResponderGrant: () => {
        granted.current = true;
      },
      onPanResponderMove: (_, g) => live.current.drag.move(g.dy),
      onPanResponderRelease: finish,
      onPanResponderTerminate: finish,
      // Mid-drag the scroller may not take the gesture back.
      onPanResponderTerminationRequest: () => !held.current,
    }),
  ).current;

  // `view` carries the caller's a11y: a hold-and-drag is a gesture VoiceOver
  // cannot make, so callers pass the same reorder through as explicit Move up /
  // Move down actions rather than gating it on holding a moving target.
  return (
    <Animated.View
      onLayout={drag.onRowLayout(group, index)}
      style={[style, drag.rowStyle(group, index)]}
      {...view}
      {...pan.panHandlers}
      onTouchStart={(e) => {
        const { pageX, pageY } = e.nativeEvent;
        origin.current = { x: pageX, y: pageY };
        clearHold();
        // Put down anything still in the hand. The only way a row gets stranded
        // lifted is a hold that fired just as the scroller stole the touch, so
        // no release ever reached us — the next touch anywhere clears it.
        if (held.current) finish();
        if (live.current.count < 2) return; // nothing to reorder
        timer.current = setTimeout(() => {
          held.current = true;
          const l = live.current;
          l.drag.begin(l.group, l.index, l.count); // lifts the row, and taps the haptic
        }, HOLD_MS);
      }}
      onTouchMove={(e) => {
        if (held.current || !timer.current) return;
        const { pageX, pageY } = e.nativeEvent;
        const travelled =
          Math.abs(pageX - origin.current.x) > HOLD_SLOP || Math.abs(pageY - origin.current.y) > HOLD_SLOP;
        if (travelled) clearHold(); // it was a scroll
      }}
      // A hold that never moved still has to be PUT DOWN: the responder is only
      // granted on a move, so without this the row would stay in the hand.
      onTouchEnd={() => {
        if (!granted.current) finish();
        else clearHold();
      }}
      onTouchCancel={() => {
        if (!granted.current) finish();
        else clearHold();
      }}
    >
      {children}
    </Animated.View>
  );
}
