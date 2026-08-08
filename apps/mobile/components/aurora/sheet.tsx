import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { View, Text, Pressable, Animated, Easing, StyleSheet, ScrollView, Modal, KeyboardAvoidingView, Platform, PanResponder, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  motion,
  springs,
  springToRN,
  durations,
  sheetGesture,
  resolveSheetRelease,
  rubberBand,
  sheetPadBottom,
  type SheetDetent,
} from "@hybrid/core";
import { useTheme } from "../../lib/theme";
import { useSheetRecede } from "../../lib/sheet-recede";
import { useReducedMotion } from "../../lib/use-reduced-motion";
import { haptic } from "../../lib/haptics";
import { F } from "../../lib/ui";

/**
 * AURORA Sheet (mobile) — a slide-up bottom sheet rendered in a transparent
 * Modal so the screen behind stays visible through the scrim. A rounded panel
 * animates up from the bottom (grab handle + optional title/sub) and slides back
 * down on dismiss before it unmounts. This is the shared modal transition for the
 * Today quick actions (Quick Log · Readiness · Done · Nutrition · Follow a coach),
 * mirroring the web Sheet (aurora/sheet.tsx) so both clients feel identical.
 *
 * `visible` mounts it; the entrance/exit animation is driven internally and the
 * node is kept alive through the exit so callers just flip a boolean. Pass
 * `scroll={false}` when the child owns its own scroll container.
 *
 * THE HANDLE IS A GESTURE, not a decoration. This component drew iOS's universal
 * 40×4 "drag me" glyph and bound nothing to it, so the first thing a fluent user
 * tries did nothing — worse than having no handle, because a handle-less sheet
 * at least teaches "tap outside". Now: the panel tracks the finger 1:1 downward
 * and rubber-bands upward, the scrim AND the parent's recede interpolate on the
 * same drag input (so the whole stack is attached to your hand rather than
 * playing an animation at you), and the release is decided by VELOCITY
 * PROJECTION in @hybrid/core `resolveSheetRelease` — a flick moves one detent,
 * or dismisses from the smallest. This is the interruptibility springs were
 * chosen for in motion.ts and which nothing previously exercised.
 *
 * DETENTS. `detents` defaults to ["large"], which is the old single-height
 * behaviour. Pass ["medium","large"] for a sheet that opens short and expands.
 *
 * THE BOTTOM PAD IS THE SHEET'S, not the caller's. It comes from @hybrid/core
 * `sheetPadBottom`, the one number both clients read, and it is MAX'd against
 * the home-indicator inset rather than added to it. Children must not trail a
 * pad of their own — stacked pads are what put a dead band under every sheet.
 *
 * PRESENTATION. While the sheet is up the presenting screen RECEDES (scales
 * back, corners round, dims) — see lib/sheet-recede.tsx. A Modal renders in its
 * own native window, so the sheet can't transform the shell directly; it
 * publishes to a root-mounted provider instead, the same shape as
 * NavScrollProvider. Because the recede now does the separating, the scrim
 * drops from motion.scrimFlat (0.6) to motion.scrimWithRecede (0.28) — a heavy
 * dim over an un-receded screen is what made the old sheet feel flat.
 */
export default function Sheet({
  visible,
  onClose,
  title,
  sub,
  children,
  scroll = true,
  fill = false,
  detents = ["large"],
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** A node, not just a string, so callers can inline an AuroraIcon (e.g. the
   *  Done sheet's flame beside the streak count) — it renders inside the sub
   *  <Text>, so pass strings and inline elements only. */
  sub?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
  /** Take the FULL height of the largest detent instead of sizing to content.
   *  Required whenever the child owns a FLEXING body (`flex: 1`, typically its
   *  own ScrollView): a content-sized panel has no height for a flex child to
   *  fill, so the child collapses to zero and its content disappears. */
  fill?: boolean;
  /** Resting heights, smallest first. Defaults to a single full-height sheet. */
  detents?: SheetDetent[];
}) {
  const { palette: C } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  // Keep the node alive through the exit animation: `render` stays true until
  // the slide-down finishes. `y` is the panel's offset from fully-open, in px
  // (0 = open at the largest detent, panelH = gone) — ONE axis describes the
  // entrance, every detent and the dismissal, so the gesture and the animation
  // drive the same value and can interrupt each other.
  const [render, setRender] = useState(visible);
  const recede = useSheetRecede();
  const reduced = useReducedMotion();

  // A SINGLE-detent sheet stays CONTENT-SIZED (capped at `large`) — which is
  // what every short sheet in the app relies on; forcing them all to a fixed
  // height would leave Quick Log and Readiness mostly empty. A multi-detent
  // sheet needs a fixed height because expanding needs a target — and so does
  // a `fill` sheet, whose child flexes into the panel rather than filling it.
  const expandable = detents.length > 1;
  const fixedH = expandable || fill;
  const maxH = Math.round(screenH * sheetGesture.detents[detents[detents.length - 1] ?? "large"]);
  // Measured height of a content-sized panel; the fixed height when it's fixed.
  const [measured, setMeasured] = useState(maxH);
  const panelH = fixedH ? maxH : measured;
  // Detent offsets, ascending (0 = largest/open).
  const snaps = useMemo(
    () => (expandable
      ? detents.map((d) => maxH - Math.round(screenH * sheetGesture.detents[d])).sort((a, b) => a - b)
      : [0]),
    [detents, maxH, screenH, expandable],
  );
  const openY = snaps[0] ?? 0;
  const restY = snaps[snaps.length - 1] ?? 0; // the SMALLEST detent — where it opens to

  const y = useRef(new Animated.Value(panelH)).current;
  const yNow = useRef(panelH);
  useEffect(() => {
    const id = y.addListener(({ value }) => { yNow.current = value; });
    return () => y.removeListener(id);
  }, [y]);

  const springTo = (to: number, then?: () => void) => {
    Animated.spring(y, { toValue: to, useNativeDriver: true, ...springToRN(springs.sheet) })
      .start(({ finished }) => { if (finished) then?.(); });
  };

  // The entrance must run ONCE per open. Without this latch it re-fires when
  // onLayout reports the measured height (panelH changes), which would drop the
  // panel back off-screen and spring it up a second time.
  const entered = useRef(false);
  useEffect(() => {
    if (visible) {
      setRender(true);
      recede.open();
      if (entered.current) return () => recede.close();
      entered.current = true;
      if (reduced) {
        // Reduce Motion SUBSTITUTES a cross-dissolve: the panel fades in place
        // rather than travelling. Never removed — the user still needs to
        // perceive that a sheet appeared.
        y.setValue(restY);
      } else {
        y.setValue(panelH);
        // The entrance rides the real sheet SPRING. It used to run
        // Easing.out(Easing.cubic) at the spring's DURATION, which is a
        // different curve wearing the right number: no overshoot, so the panel
        // landed dead while its web twin — running the exact spring as a
        // generated linear() — settled with the small arrival energy that makes
        // a sheet feel like an object. springToRN existed for this the whole
        // time and was already used correctly three files away.
        springTo(restY);
      }
      return () => recede.close();
    }
    entered.current = false;
    if (render) {
      Animated.timing(y, {
        toValue: panelH,
        duration: reduced ? durations.reduced : durations.fast,
        easing: reduced ? Easing.linear : Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => { if (finished) setRender(false); });
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reduced, panelH, restY]); // eslint-disable-line react-hooks/exhaustive-deps

  // THE DRAG. Claimed only on a clear vertical move so a horizontal swipe or a
  // tap inside the sheet still works; the inner ScrollView keeps its own
  // gestures because this responder lives on the panel's chrome, and a drag
  // that starts inside scrolled content is left to the list.
  const drag = useRef({ startY: 0, last: 0, t: 0, v: 0 });
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx) * 1.6,
        onPanResponderGrant: () => {
          drag.current = { startY: yNow.current, last: 0, t: Date.now(), v: 0 };
          y.stopAnimation((v) => { drag.current.startY = v; });
        },
        onPanResponderMove: (_, g) => {
          const now = Date.now();
          const dt = Math.max(1, now - drag.current.t);
          drag.current.v = ((g.dy - drag.current.last) / dt) * 1000;
          drag.current.t = now;
          drag.current.last = g.dy;
          const raw = drag.current.startY + g.dy;
          // Downward tracks the finger exactly; upward past the largest detent
          // rubber-bands, so the panel never leaves the top.
          y.setValue(raw >= openY ? raw : openY - rubberBand(openY - raw, 0, sheetGesture.resist));
        },
        onPanResponderRelease: () => {
          const from = yNow.current;
          const { target, dismiss } = resolveSheetRelease(from, drag.current.v, panelH, snaps);
          if (dismiss) {
            haptic.light();
            // Hand back to the `visible` effect so the caller's state and the
            // animation cannot disagree about whether the sheet is open.
            onClose();
            return;
          }
          if (Math.abs(target - from) > 2 && snaps.length > 1) haptic.light();
          springTo(target);
        },
        onPanResponderTerminate: () => {
          const { target } = resolveSheetRelease(yNow.current, 0, panelH, snaps);
          springTo(target === panelH ? restY : target);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [panelH, openY, restY, snaps.join(",")],
  );

  if (!render) return null;

  // The scrim and the parent's recede BOTH read the drag position, so pulling
  // the sheet down brings the screen behind it back in step with your finger.
  const progress = y.interpolate({ inputRange: [openY, panelH], outputRange: [1, 0], extrapolate: "clamp" });
  const scrimOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, motion.scrimWithRecede] });
  const panelOpacity = reduced ? progress : 1;

  const header = (
    <>
      <View style={{ width: 40, height: 4, borderRadius: 999, backgroundColor: C.line, alignSelf: "center", marginBottom: title || sub ? 16 : 8 }} />
      {title ? <Text style={{ fontFamily: F.black, fontSize: 22, letterSpacing: -0.5, color: C.chalk }}>{title}</Text> : null}
      {sub ? <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ash, marginTop: 4 }}>{sub}</Text> : null}
    </>
  );

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {/* Full-screen scrim — kept OUTSIDE the KeyboardAvoidingView so it always
          covers the whole screen; wrapping it in the KAV would shrink the dimming
          (and undim the area behind the keyboard) when padding is added. */}
      <Pressable onPress={onClose} style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close">
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "#000", opacity: scrimOpacity }]} />
      </Pressable>
      {/* Lift the panel above the keyboard so low inputs (nutrition quick-add,
          any sheet-hosted field) aren't hidden when the keyboard opens.
          box-none lets taps on the empty area fall through to the scrim. */}
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: "flex-end" }} behavior={Platform.OS === "ios" ? "padding" : undefined} pointerEvents="box-none">
        <Animated.View
          onLayout={(e) => { if (!fixedH) setMeasured(Math.round(e.nativeEvent.layout.height)); }}
          style={{
            ...(fixedH ? { height: maxH } : { maxHeight: maxH }),
            backgroundColor: C.ink2,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            borderWidth: 1,
            borderColor: C.line,
            paddingHorizontal: 20,
            paddingTop: 12,
            // ONE pad under the last row — @hybrid/core `sheetPadBottom`. The
            // home-indicator inset is its FLOOR, not an addition: `insets.bottom
            // + 20` was 54dp on any notched iPhone against the web twin's 24,
            // and every child that trailed its own pad stacked on top of that.
            paddingBottom: sheetPadBottom(insets.bottom),
            transform: [{ translateY: y }],
            opacity: panelOpacity,
            shadowColor: "#000",
            shadowOpacity: 0.4,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: -8 },
            elevation: 24,
          }}
        >
          {/* The grab area owns the pan. Keeping it off the scrollable body is
              what lets a list inside the sheet scroll normally. */}
          <View {...pan.panHandlers} accessible accessibilityRole="adjustable" accessibilityLabel="Drag to resize or dismiss">
            {header}
          </View>
          {/* No contentContainer pad on the scroller: the panel's own
              paddingBottom sits BELOW it, so anything here is a second pad. */}
          {scroll ? (
            <ScrollView style={fixedH ? { flex: 1 } : undefined} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
          ) : (
            children
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
