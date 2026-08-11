import { useMemo, useRef, useState } from "react";
import { Animated, type LayoutChangeEvent } from "react-native";
import { springs, springToRN } from "@hybrid/core";
import { haptic } from "./haptics";
import { animateListChange } from "./list-motion";
import { useReducedMotion } from "./use-reduced-motion";

/**
 * Hold-and-drag vertical reorder for a list of rows/cards — the one drag
 * mechanic every reorderable list shares (exercise cards, set ledgers, builder
 * blocks). Rows report their layout via onRowLayout; a DragHandle drives
 * begin/move/end; on release the item drops next to whichever row's centre is
 * nearest (robust across variable row heights and the gaps between them).
 *
 * Rows are keyed by (group, index) so ONE instance can serve several sibling
 * lists rendered in the same component (e.g. each exercise's sets in the live
 * logger) — a drag never crosses groups. Single-list callers just pass "".
 *
 * THE PICKED-UP CARD LEAVES THE PLANE, and this hook owns that — see
 * `rowStyle`. The mechanic was already good (haptic on pickup, a selection tick
 * per position change, an animated commit) but the card being dragged was drawn
 * at exactly the size and depth of the ones it was passing over, so the only
 * thing separating it from the list was that it happened to be moving. Now it
 * grows 3% and casts a shadow on pickup, both on `springs.press` — the token
 * for a surface answering a finger — and settles back when you put it down.
 */

/** How far a picked-up card grows. 3%: enough to read as "off the plane",
 *  small enough that a full-width card's edges don't visibly cross the screen
 *  gutter. (The profile tile grid, whose tiles are small squares rather than
 *  full-width rows, runs the same idiom a notch larger at 1.06.) */
const LIFT_SCALE = 1.03;
/** Peak shadow under a lifted card. Matches the sheet panel's own drop shadow —
 *  a card in the hand and a panel over the screen are the same distance up. */
const LIFT_SHADOW = 0.4;

export function useDragReorder(onMove: (group: string, from: number, to: number) => void) {
  const dragY = useRef(new Animated.Value(0)).current;
  // 0 = flat in the list, 1 = in the hand. One value drives the scale AND the
  // shadow so the card cannot be caught half-lifted-but-flat.
  const lift = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  const rows = useRef<Record<string, { y: number; height: number }>>({});
  const drag = useRef({ group: "", from: -1, to: -1, count: 0 });
  const [dragKey, setDragKey] = useState<string | null>(null);
  // Bumped on every pickup, so a put-down still settling when the next card is
  // grabbed cannot clear the new card's key out from under it.
  const seq = useRef(0);

  const key = (group: string, index: number) => `${group}#${index}`;

  const springLift = (to: number, then?: (finished: boolean) => void) => {
    // JS-driven, like `dragY` beside it: `move` writes dragY every frame with
    // setValue, and a native-driven node in the same transform array as a
    // JS-driven one is the one combination RN refuses.
    Animated.spring(lift, { toValue: to, useNativeDriver: false, ...springToRN(springs.press) })
      .start(({ finished }) => then?.(finished));
  };

  /**
   * The style for a row — everything about being dragged, in one place:
   *
   *   <Animated.View onLayout={onRowLayout(g, i)} style={rowStyle(g, i)}>
   *
   * It is returned rather than left to the caller because every list on this
   * hook had written its own and they had all drifted: the builder's block cards
   * lifted with a shadow, its set ledger and the live logger's set rows with
   * `elevation` only — which is Android, so on the platform this app ships to,
   * two of them had no depth cue at all — and the live logger's exercise CARDS
   * were not on the hook whatsoever, carrying a line-for-line copy of it that
   * predated it and had therefore missed every upgrade it since received (the
   * animated commit above among them).
   */
  const liftStyle = useMemo(
    () => ({
      transform: [
        { translateY: dragY },
        { scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, LIFT_SCALE] }) },
      ],
      zIndex: 20,
      shadowColor: "#000",
      shadowOpacity: lift.interpolate({ inputRange: [0, 1], outputRange: [0, LIFT_SHADOW] }),
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: lift.interpolate({ inputRange: [0, 1], outputRange: [0, 12] }),
    }),
    [dragY, lift],
  );
  const rowStyle = (group: string, index: number) => (dragKey === key(group, index) ? liftStyle : undefined);

  const onRowLayout = (group: string, index: number) => (e: LayoutChangeEvent) => {
    const { y, height } = e.nativeEvent.layout;
    rows.current[key(group, index)] = { y, height };
  };

  const begin = (group: string, index: number, count: number) => {
    seq.current++;
    drag.current = { group, from: index, to: index, count };
    // Stop, don't just overwrite: a put-down still springing back would keep
    // running against the new drag's setValue writes.
    dragY.stopAnimation();
    dragY.setValue(0);
    setDragKey(key(group, index));
    haptic.medium();
    // Reduce Motion SUBSTITUTES rather than deletes: the card still arrives
    // lifted, it just arrives there at once instead of springing. What that
    // setting objects to is travel, and a card already being dragged around
    // the screen by a finger has no business hiding the fact that it is the
    // one in the hand.
    if (reduced) lift.setValue(1);
    else springLift(1);
  };

  const move = (dy: number) => {
    dragY.setValue(dy);
    const { group, from, count } = drag.current;
    const L = rows.current[key(group, from)];
    if (from < 0 || !L) return;
    const center = L.y + L.height / 2 + dy;
    let to = from;
    let best = Infinity;
    for (let k = 0; k < count; k++) {
      const Lk = rows.current[key(group, k)];
      if (!Lk) continue;
      const dist = Math.abs(Lk.y + Lk.height / 2 - center);
      if (dist < best) {
        best = dist;
        to = k;
      }
    }
    drag.current.to = to;
  };

  const end = () => {
    const { group, from, to } = drag.current;
    const moved = from >= 0 && to >= 0 && from !== to;
    if (moved) {
      // THE COMMIT TRAVELS. Only the dragged row was ever animated: on release
      // the rows it displaced jumped to their new slots, so the one moment the
      // list's order visibly changed had no motion in it at all. Animating the
      // commit here rather than at each caller means every reorderable list in
      // the app — exercise cards, set ledgers, builder blocks — gets it from
      // the mechanic they already share.
      animateListChange(reduced);
      onMove(group, from, to);
      haptic.selection();
    }
    drag.current = { group: "", from: -1, to: -1, count: 0 };
    if (moved || reduced) {
      // The commit REINDEXES the rows, so `group#from` names a DIFFERENT card
      // the moment onMove lands — holding the lift through a settle would
      // shrink the wrong one. It drops with the commit instead, under the
      // layout animation that is already moving every row.
      dragY.setValue(0);
      lift.setValue(0);
      setDragKey(null);
      return;
    }
    // Put back where it came from: nothing reindexed, so the card can travel
    // home and settle onto the plane rather than snapping flat.
    const mine = seq.current;
    Animated.spring(dragY, { toValue: 0, useNativeDriver: false, ...springToRN(springs.press) }).start();
    springLift(0, (finished) => {
      if (finished && seq.current === mine) setDragKey(null);
    });
  };

  return { dragY, dragKey, key, rowStyle, begin, move, end, onRowLayout };
}
