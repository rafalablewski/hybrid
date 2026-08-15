import { useRef } from "react";
import { PanResponder, Text, View } from "react-native";
import { fs, F } from "../lib/ui";

// Grip handle — press and drag to reorder the row/card it sits in. Built on
// PanResponder (no gesture-handler dep, matching SwipeRow). Its own responder is
// created once; live callbacks are read through a ref so a parent re-render
// mid-drag can't strand a stale closure. It belongs to the BUILDER (block cards
// + set ledger) — the screen where a session is ARRANGED. The live logger used
// to carry it too and no longer does: a grip at the head of every exercise card
// and every set row advertised an arranging gesture on the screen where you DO
// the session, and it read as a handle where the lift's own avatar belongs.
export default function DragHandle({ onStart, onMove, onEnd, color, size = fs.subtitle }: {
  onStart: () => void;
  onMove: (dy: number) => void;
  onEnd: () => void;
  color: string;
  /** Glyph size — the default suits card headers; set rows want it a notch smaller. */
  size?: number;
}) {
  const cbs = useRef({ onStart, onMove, onEnd });
  cbs.current = { onStart, onMove, onEnd };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => cbs.current.onStart(),
      onPanResponderMove: (_, g) => cbs.current.onMove(g.dy),
      onPanResponderRelease: () => cbs.current.onEnd(),
      onPanResponderTerminate: () => cbs.current.onEnd(),
    }),
  ).current;
  return (
    <View {...pan.panHandlers} hitSlop={8} style={{ paddingRight: 2, paddingVertical: 4 }}>
      <Text style={{ fontFamily: F.mono, fontSize: size, color }}>⠿</Text>
    </View>
  );
}
