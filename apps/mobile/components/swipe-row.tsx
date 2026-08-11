import { useRef, type ReactNode } from "react";
import { Animated, PanResponder, Pressable, Text, View } from "react-native";
import { springs, springToRN, swipe, rubberBand, projectSwipe, durations } from "@hybrid/core";
import { fs, F } from "../lib/ui";
import { useTheme } from "../lib/theme";
import { haptic } from "../lib/haptics";
import { animateListChange } from "../lib/list-motion";
import { useReducedMotion } from "../lib/use-reduced-motion";

// Swipe a row left to reveal a Delete action — for sets added by accident.
// Built on Animated + PanResponder (no native gesture-handler dependency, so it
// works in the existing dev build). Only claims clearly-horizontal drags, so the
// numeric inputs still focus on tap and the list still scrolls vertically.
// Shared by the live logger (app/workout.tsx), the Builder's set ledger and the
// notifications list.
//
// THE RELEASE RULE is velocity projection, not displacement: the row commits
// from where the finger is HEADING (@hybrid/core projectSwipe), so a fast flick
// that only travelled 35px opens instead of snapping shut. Past the action
// width the travel rubber-bands rather than hitting a clamp, and a swipe that
// crosses `swipe.fullAt` of the row deletes outright with no second tap — the
// iOS full-swipe. Every constant is shared with the web twin
// (apps/web/components/swipe-row.tsx) because the two had drifted on all of
// them while each claiming to mirror the other.
//
// A row can also carry a LEADING action, revealed by swiping RIGHT (the
// notifications list uses it for "Unread"). Both sides obey the same grammar:
// a short swipe OPENS the action so it can be tapped, a full swipe COMMITS it
// outright. The leading action then settles home — it changes the row's state
// rather than removing it, so running it off the edge would be a lie.
export default function SwipeRow({ children, onDelete, label, leading, background, radius = 12, marginBottom = 6 }: {
  children: ReactNode;
  onDelete: () => void;
  label: string;
  /** The action revealed by swiping RIGHT, so it sits on the LEFT edge.
   *  Non-destructive by contract: the row settles back home after it runs. */
  leading?: { label: string; onAction: () => void; color?: string };
  /** Row surface colour — must match the host card so the covered actions
   *  can't bleed through.
   *
   *  Pass "transparent" when the row sits on a surface it must NOT repaint.
   *  That is safe because the actions below fade with the drag rather than
   *  sitting there at rest: an opaque content layer used to be the only thing
   *  hiding them. It matters most on Aurora, where the host card is GLASS —
   *  painting the row `card` there dropped an opaque panel inside the
   *  translucent card, which is the card-inside-a-card the live logger's
   *  active set was drawing while its own code said "no inner card". */
  background?: string;
  /** Corner radius of the revealed actions — match the wrapped row. */
  radius?: number;
  /** Outer spacing (the wrapped row should drop its own margin). */
  marginBottom?: number;
}) {
  const C = useTheme().palette;
  const reduced = useReducedMotion();
  const tx = useRef(new Animated.Value(0)).current;
  /** Which action is open: -1 delete (right edge), 0 closed, 1 leading. */
  const sideRef = useRef<-1 | 0 | 1>(0);
  const widthRef = useRef(0);
  // Latched so the full-swipe haptic fires ONCE as you cross, not every frame.
  const armedRef = useRef(false);
  // The PanResponder is built once, so it would close over the first render's
  // props. Read the leading action through a ref kept current each render.
  const leadingRef = useRef(leading);
  leadingRef.current = leading;

  const settle = (to: -1 | 0 | 1) => {
    sideRef.current = to;
    Animated.spring(tx, { toValue: to * swipe.action, useNativeDriver: true, ...springToRN(springs.slide) }).start();
  };

  const commitDelete = () => {
    haptic.warning();
    sideRef.current = 0;
    // Run the row off the edge before removing it, so the delete has a
    // direction instead of a disappearance — THEN close the gap.
    //
    // Closing it is this component's job, not the host's. It used to be left to
    // "the host's animated list", which meant the logger and the builder
    // remembered and the notification list and the saved shelf did not, so the
    // identical gesture healed smoothly on two screens and teleported on the
    // others. A swipe row knows it is deleting a row; nothing else has to.
    Animated.timing(tx, {
      toValue: -(widthRef.current || 400),
      duration: durations.fast,
      useNativeDriver: true,
    }).start(() => {
      animateListChange(reduced);
      onDelete();
    });
  };

  const commitLeading = () => {
    const l = leadingRef.current;
    if (!l) return;
    haptic.light();
    settle(0);
    l.onAction();
  };

  /** Where the finger has dragged to, with the right side closed off when
   *  there's no leading action to reveal. */
  const offset = (dx: number): number => {
    const raw = sideRef.current * swipe.action + dx;
    return leadingRef.current ? raw : Math.min(0, raw);
  };

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8,
      onPanResponderMove: (_, g) => {
        const raw = offset(g.dx);
        const full = widthRef.current * swipe.fullAt;
        // Rubber-band only between the action width and the full-swipe point;
        // past that the row must keep tracking the finger, because the action
        // is about to commit and resistance would fight the gesture.
        const crossed = raw < -full || (!!leadingRef.current && raw > full);
        tx.setValue(crossed ? raw : rubberBand(raw, swipe.action, swipe.max - swipe.action));
        if (crossed !== armedRef.current) {
          armedRef.current = crossed;
          if (crossed) haptic.light();
        }
      },
      onPanResponderRelease: (_, g) => {
        const raw = offset(g.dx);
        const full = widthRef.current * swipe.fullAt;
        armedRef.current = false;
        if (raw < -full) { commitDelete(); return; }
        if (leadingRef.current && raw > full) { commitLeading(); return; }
        // g.vx is px/ms; the shared rule is in px/s.
        const p = projectSwipe(raw, g.vx * 1000);
        const next: -1 | 0 | 1 = p < -swipe.action * swipe.openAt ? -1 : leadingRef.current && p > swipe.action * swipe.openAt ? 1 : 0;
        if (next !== sideRef.current) haptic.light();
        settle(next);
      },
      onPanResponderTerminate: () => {
        armedRef.current = false;
        settle(sideRef.current);
      },
    }),
  ).current;

  // The actions fade in with the drag, so a transparent row can't reveal them
  // at rest. 1px of travel is enough to show them; the row itself carries the
  // motion from there.
  const actionOpacity = tx.interpolate({ inputRange: [-1, 0, 1], outputRange: [1, 0, 1] });

  const action = (col: string, text: string, onPress: () => void, edge: "left" | "right") => (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        ...(edge === "left" ? { left: 0 } : { right: 0 }),
        top: 0,
        bottom: 0,
        opacity: actionOpacity,
      }}
    >
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        width: swipe.action,
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: col,
        borderRadius: radius,
      }}
    >
      {/* A solid accent fill, so the label is chalk rather than the accent-TEXT
          channel (which is tuned to sit on ink). */}
      <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: C.chalk }}>{text}</Text>
    </Pressable>
    </Animated.View>
  );

  return (
    <View
      style={{ position: "relative", marginBottom, overflow: "hidden" }}
      onLayout={(e) => { widthRef.current = e.nativeEvent.layout.width; }}
    >
      {leading && action(leading.color ?? C.red, leading.label, commitLeading, "left")}
      {action(C.red, label, commitDelete, "right")}
      <Animated.View style={{ transform: [{ translateX: tx }], backgroundColor: background ?? C.card }} {...pan.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}
