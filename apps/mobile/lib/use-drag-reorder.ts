import { useRef, useState } from "react";
import { Animated, type LayoutChangeEvent } from "react-native";
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
 */
export function useDragReorder(onMove: (group: string, from: number, to: number) => void) {
  const dragY = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  const rows = useRef<Record<string, { y: number; height: number }>>({});
  const drag = useRef({ group: "", from: -1, to: -1, count: 0 });
  const [dragKey, setDragKey] = useState<string | null>(null);

  const key = (group: string, index: number) => `${group}#${index}`;

  const onRowLayout = (group: string, index: number) => (e: LayoutChangeEvent) => {
    const { y, height } = e.nativeEvent.layout;
    rows.current[key(group, index)] = { y, height };
  };

  const begin = (group: string, index: number, count: number) => {
    drag.current = { group, from: index, to: index, count };
    dragY.setValue(0);
    setDragKey(key(group, index));
    haptic.medium();
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
    if (from >= 0 && to >= 0 && from !== to) {
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
    dragY.setValue(0);
    setDragKey(null);
  };

  return { dragY, dragKey, key, begin, move, end, onRowLayout };
}
