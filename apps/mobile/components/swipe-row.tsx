import { useRef, type ReactNode } from "react";
import { Animated, PanResponder, Pressable, Text, View } from "react-native";
import { springs, springToRN, swipe, rubberBand, projectSwipe, durations } from "@hybrid/core";
import { fs, F } from "../lib/ui";
import { useTheme } from "../lib/theme";
import { haptic } from "../lib/haptics";

// Swipe a set row left to reveal a Delete action — for sets added by accident.
// Built on Animated + PanResponder (no native gesture-handler dependency, so it
// works in the existing dev build). Only claims clearly-horizontal drags, so the
// numeric inputs still focus on tap and the list still scrolls vertically.
// Shared by the live logger (app/workout.tsx) and the Builder's set ledger.
//
// THE RELEASE RULE is velocity projection, not displacement: the row commits
// from where the finger is HEADING (@hybrid/core projectSwipe), so a fast flick
// that only travelled 35px opens instead of snapping shut. Past the action
// width the travel rubber-bands rather than hitting a clamp, and a swipe that
// crosses `swipe.fullAt` of the row deletes outright with no second tap — the
// iOS full-swipe. Every constant is shared with the web twin
// (apps/web/components/swipe-row.tsx) because the two had drifted on all of
// them while each claiming to mirror the other.
export default function SwipeRow({ children, onDelete, label, background }: {
  children: ReactNode;
  onDelete: () => void;
  label: string;
  /** Row surface colour — must match the host card so the covered delete button
   *  can't bleed through (defaults to the live logger's card token). */
  background?: string;
}) {
  const C = useTheme().palette;
  const tx = useRef(new Animated.Value(0)).current;
  const openRef = useRef(false);
  const widthRef = useRef(0);
  // Latched so the full-swipe haptic fires ONCE as you cross, not every frame.
  const armedRef = useRef(false);

  const settle = (to: number) => {
    Animated.spring(tx, { toValue: to, useNativeDriver: true, ...springToRN(springs.slide) }).start();
  };

  const commitDelete = () => {
    haptic.warning();
    // Run the row off the edge before removing it, so the delete has a
    // direction instead of a disappearance. The list closes the gap (see the
    // host's animated list).
    Animated.timing(tx, {
      toValue: -(widthRef.current || 400),
      duration: durations.fast,
      useNativeDriver: true,
    }).start(() => onDelete());
  };

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8,
      onPanResponderMove: (_, g) => {
        const base = openRef.current ? -swipe.action : 0;
        const raw = Math.min(0, base + g.dx);
        const full = -(widthRef.current * swipe.fullAt);
        // Rubber-band only between the action width and the full-swipe point;
        // past that the row must keep tracking the finger, because it is about
        // to be thrown away and resistance would fight the gesture.
        tx.setValue(raw < full ? raw : rubberBand(raw, swipe.action, swipe.max - swipe.action));
        const crossed = raw < full;
        if (crossed !== armedRef.current) {
          armedRef.current = crossed;
          if (crossed) haptic.light();
        }
      },
      onPanResponderRelease: (_, g) => {
        const base = openRef.current ? -swipe.action : 0;
        const raw = Math.min(0, base + g.dx);
        // g.vx is px/ms; the shared rule is in px/s.
        const projected = projectSwipe(raw, g.vx * 1000);
        armedRef.current = false;
        if (raw < -(widthRef.current * swipe.fullAt)) { commitDelete(); return; }
        const open = projected < -swipe.action * swipe.openAt;
        if (open !== openRef.current) haptic.light();
        openRef.current = open;
        settle(open ? -swipe.action : 0);
      },
      onPanResponderTerminate: () => {
        armedRef.current = false;
        settle(openRef.current ? -swipe.action : 0);
      },
    }),
  ).current;

  return (
    <View
      style={{ position: "relative", marginBottom: 6, overflow: "hidden" }}
      onLayout={(e) => { widthRef.current = e.nativeEvent.layout.width; }}
    >
      <Pressable
        onPress={commitDelete}
        style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: swipe.action, alignItems: "center", justifyContent: "center", backgroundColor: C.red, borderRadius: 12 }}
      >
        <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: C.chalk }}>{label}</Text>
      </Pressable>
      <Animated.View style={{ transform: [{ translateX: tx }], backgroundColor: background ?? C.card }} {...pan.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}
