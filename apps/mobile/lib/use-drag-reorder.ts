import { useMemo, useRef, useState } from "react";
import { Animated, type LayoutChangeEvent } from "react-native";
import { springs, springToRN, displacedIndex } from "@hybrid/core";
import { haptic } from "./haptics";
import { useReducedMotion } from "./use-reduced-motion";

/**
 * Hold-and-drag vertical reorder for a list of rows/cards — the one drag
 * mechanic every reorderable list shares (exercise cards, set ledgers, builder
 * blocks). Rows report their layout via onRowLayout; a `DragHandle` (the
 * Builder's ⠿) or a `HoldDragRow` (the logger's Order block, where the row
 * itself is the handle) drives begin/move/end; on release the item drops next
 * to whichever row's centre is nearest — robust across variable row heights and
 * the gaps between them.
 *
 * Rows are keyed by (group, index) so ONE instance can serve several sibling
 * lists rendered in the same component (e.g. each exercise's sets in the live
 * logger) — a drag never crosses groups. Single-list callers just pass "".
 *
 * THE PICKED-UP CARD LEAVES THE PLANE, and this hook owns that — see
 * `rowStyle`. The mechanic was already good (haptic on pickup, a selection tick
 * per position change) but the card being dragged was drawn at exactly the size
 * and depth of the ones it was passing over, so the only thing separating it
 * from the list was that it happened to be moving. Now it grows 3% and casts a
 * shadow on pickup, both on `springs.press` — the token for a surface answering
 * a finger — and settles back when you put it down.
 *
 * AND THE LIST PARTS UNDER IT — see `part`. The destination was computed on
 * every frame and rendered on none of them, so the drop was a guess and a card
 * held at exactly one row's offset covered the row it was passing. The rows
 * that the drop would displace now step aside while the finger is still down,
 * which also makes the release almost free: see `end`.
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
  const drag = useRef({ group: "", from: -1, to: -1, dy: 0, count: 0 });
  // THE GAP. One value per row, holding how far that row has stepped aside to
  // open a slot for the card in the hand. Zero for every row at rest.
  const shifts = useRef<Record<string, Animated.Value>>({});
  const [dragKey, setDragKey] = useState<string | null>(null);
  // The pending move, as STATE rather than the ref `move` keeps — a list that
  // prints positions has to renumber with the gap (see `slotOf`), and that is a
  // render. It changes once per slot crossed, not once per frame.
  const [pending, setPending] = useState<{ group: string; from: number; to: number } | null>(null);
  // Bumped on every pickup, so a put-down still settling when the next card is
  // grabbed cannot clear the new card's key out from under it.
  const seq = useRef(0);

  const key = (group: string, index: number) => `${group}#${index}`;

  const shiftOf = (group: string, index: number) => {
    const k = key(group, index);
    return (shifts.current[k] ??= new Animated.Value(0));
  };

  /**
   * THE LIST PARTS. Every row that the drop would displace steps aside NOW,
   * so the gap under the finger is the answer to "where does this land".
   *
   * It shipped without this and the omission was invisible in code and obvious
   * the moment the gesture was watched frame by frame: `move` computed the
   * destination on every frame and wrote it to a ref that nothing rendered, so
   * only the held card ever moved — and at exactly one row's offset it sat on
   * top of the row it was passing and that row disappeared underneath it. The
   * drop was a guess.
   *
   * The step is measured, not assumed: a row's target is the y of the SLOT it
   * would end up in, so the gap is exact under variable row heights and under
   * whatever margin sits between rows. Guessing "one row height" would drift on
   * both (the Builder's block cards are not all the same height — one of them
   * is expanded).
   */
  const part = (to: number) => {
    const { group, from, count } = drag.current;
    for (let k = 0; k < count; k++) {
      if (k === from) continue;
      // Where row k ends up if the card is dropped at `to` — core, beside the
      // move it predicts, so the gap can never open somewhere the drop won't.
      const dest = displacedIndex(k, from, to);
      const here = rows.current[key(group, k)];
      const there = rows.current[key(group, dest)];
      const target = here && there ? there.y - here.y : 0;
      const v = shiftOf(group, k);
      // Reduce Motion: the gap still OPENS — it is the answer to the question,
      // not decoration — it just opens at once instead of travelling.
      if (reduced) v.setValue(target);
      else Animated.spring(v, { toValue: target, useNativeDriver: false, ...springToRN(springs.slide) }).start();
    }
  };

  /** Close every gap instantly. JS-driven for this: the commit hands the same
   *  distance from the transform to the layout in one tick, and a native value
   *  would clear a frame late and show the swap it is there to hide. */
  const closeGaps = (group: string, count: number) => {
    for (let k = 0; k < count; k++) shiftOf(group, k).setValue(0);
  };

  /**
   * The index a row would have if the finger let go NOW.
   *
   * For a list that PRINTS its positions — the logger's Order block numbers
   * every lift — the gap alone is half a preview: opening a slot at 3 while the
   * card in it still says 2 is the list contradicting itself under the finger.
   * Callers render `slotOf(group, i) + 1` instead of `i + 1`. A list that shows
   * no positions never has to call this.
   */
  const slotOf = (group: string, index: number) =>
    pending && pending.group === group ? displacedIndex(index, pending.from, pending.to) : index;

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
  // The card in the hand carries the lift; every other row carries its gap.
  const rowStyle = (group: string, index: number) =>
    dragKey === key(group, index) ? liftStyle : { transform: [{ translateY: shiftOf(group, index) }] };

  const onRowLayout = (group: string, index: number) => (e: LayoutChangeEvent) => {
    const { y, height } = e.nativeEvent.layout;
    rows.current[key(group, index)] = { y, height };
  };

  const begin = (group: string, index: number, count: number) => {
    seq.current++;
    drag.current = { group, from: index, to: index, dy: 0, count };
    closeGaps(group, count); // a previous drag's gaps must not still be open
    setPending(null);
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
    const { group, from, to: was, count } = drag.current;
    const L = rows.current[key(group, from)];
    if (from < 0 || !L) return;
    drag.current.dy = dy;
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
    // Only when the ANSWER changes, not every frame: the gap springs once per
    // slot crossed, so the rows travel instead of chasing the finger — and the
    // one render this costs happens then too, not sixty times a second.
    if (to !== was) {
      part(to);
      setPending(to === from ? null : { group, from, to });
    }
  };

  /**
   * THE COMMIT IS NOW A HAND-OVER, NOT A TRAVEL.
   *
   * Before the list parted, this moment had to animate: the displaced rows were
   * still sitting in their old slots at the instant the order changed, so it
   * called `animateListChange` and let a LayoutAnimation carry every row across.
   * With the gap already open they are ALREADY standing where the commit puts
   * them, and each one's layout gains exactly the distance its transform gives
   * up — so closing the gaps in the same tick means nothing moves at all. A
   * LayoutAnimation here would now be the bug: it would drag them back to their
   * old slots and re-travel the distance they had already crossed.
   *
   * That leaves one card actually needing to land — the one in the hand, which
   * is wherever the finger left it. It keeps the lift THROUGH the reindex (the
   * key follows it to its new position rather than being dropped on whichever
   * row took its old one) and springs home from the residual, so the gesture
   * ends by setting the card down instead of by it vanishing into a slot.
   */
  const end = () => {
    const { group, from, to, dy, count } = drag.current;
    const moved = from >= 0 && to >= 0 && from !== to;
    const mine = seq.current;
    const settle = (key0: string | null) => {
      if (reduced) {
        dragY.setValue(0);
        lift.setValue(0);
        setDragKey(null);
        return;
      }
      if (key0) setDragKey(key0);
      Animated.spring(dragY, { toValue: 0, useNativeDriver: false, ...springToRN(springs.press) }).start();
      springLift(0, (finished) => {
        if (finished && seq.current === mine) setDragKey(null);
      });
    };

    if (!moved) {
      // Put back where it came from: nothing reindexed, and no gap was left
      // open (`to` came home to `from`), so the card just travels back.
      drag.current = { group: "", from: -1, to: -1, dy: 0, count: 0 };
      setPending(null);
      settle(null);
      return;
    }

    // Where the card is RIGHT NOW, measured against the slot it lands in.
    const L = rows.current[key(group, from)];
    const T = rows.current[key(group, to)];
    const residual = L && T ? L.y + dy - T.y : 0;

    onMove(group, from, to);
    haptic.selection();
    closeGaps(group, count);
    setPending(null); // the real indices are the preview's now
    dragY.setValue(residual);
    drag.current = { group: "", from: -1, to: -1, dy: 0, count: 0 };
    settle(key(group, to));
  };

  return { dragY, dragKey, key, rowStyle, slotOf, begin, move, end, onRowLayout };
}
