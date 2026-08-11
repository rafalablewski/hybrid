import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { View, Text, Pressable, Animated, Easing, StyleSheet, ScrollView, Modal, KeyboardAvoidingView, Platform, PanResponder, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  motion,
  springs,
  springToRN,
  durations,
  sheetGesture,
  sheetSnaps,
  resolveSheetRelease,
  releaseVelocity,
  rubberBand,
  sheetPadBottom,
  type SheetDetent,
} from "@hybrid/core";
import { useTheme } from "../../lib/theme";
import { sheetInsetBottom } from "../../lib/layout";
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
 * `scroll={false}` when the child owns its own scroll container — and only
 * then: that hands the panel's whole column to the child, so such a sheet is
 * FULL HEIGHT (see the measurement note below). A short sheet lets this
 * component do the scrolling and rests exactly as tall as what it holds.
 *
 * THE HANDLE IS A GESTURE, not a decoration. This component drew iOS's universal
 * 40×4 "drag me" glyph and bound nothing to it, so the first thing a fluent user
 * tries did nothing — worse than having no handle, because a handle-less sheet
 * at least teaches "tap outside". Now: the panel tracks the finger 1:1 in both
 * directions between its stops (and rubber-bands only past the top, where there
 * is nothing left to uncover), the scrim AND the parent's recede interpolate on the
 * same drag input (so the whole stack is attached to your hand rather than
 * playing an animation at you), and the release is decided by VELOCITY
 * PROJECTION in @hybrid/core `resolveSheetRelease` — a flick moves one detent,
 * or dismisses from the smallest. This is the interruptibility springs were
 * chosen for in motion.ts and which nothing previously exercised.
 *
 * EVERY SHEET ELONGATES. The panel is ALWAYS laid out at the `large` height and
 * translated down to its resting stop, so one drag from the bottom to the top
 * grows it to full and the way back down shortens it again before it dismisses.
 * By default the resting stop is the sheet's own CONTENT height (measured, so a
 * short sheet still looks exactly as short as what it holds) — the panel below
 * that line is off-screen until you pull it up. Before this, a content-sized
 * sheet had exactly ONE stop and the handle's upward direction did nothing: it
 * rubber-banded and fell back, which reads as broken rather than as "no".
 *
 * DETENTS. `detents` adds stops between the content height and full
 * (`["medium"]` puts one at half the screen). It is only ever ADDITIVE: the
 * shortest stop is where the sheet rests, so declaring `medium` never inflates
 * a two-button sheet to half the screen. The stops come from @hybrid/core
 * `sheetSnaps`, shared with web so the two land identically.
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
  onClosed,
  title,
  sub,
  children,
  scroll = true,
  fill = false,
  detents,
}: {
  visible: boolean;
  onClose: () => void;
  /** Fired when the exit has FINISHED and the panel has unmounted — for a sheet
   *  that is hosted by a route and must pop it. Popping on `onClose` instead
   *  would tear the route down under the panel mid-flight, which is the same
   *  defect the web sheet had when it unmounted on a 160ms timer racing its own
   *  transition. */
  onClosed?: () => void;
  title?: string;
  /** A node, not just a string, so callers can inline an AuroraIcon (e.g. the
   *  Done sheet's flame beside the streak count) — it renders inside the sub
   *  <Text>, so pass strings and inline elements only. */
  sub?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
  /** The child owns a FLEXING body (`flex: 1`, typically its own ScrollView) and
   *  fills the panel. Such a sheet has no natural height to rest at, so it is
   *  full-height — see the measurement note in the body. */
  fill?: boolean;
  /** Extra stops between the content height and full. Additive — the shortest
   *  stop still decides where the sheet rests. */
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
  // Held in a ref so the exit effect (which must not re-run when a caller passes
  // a fresh closure) always calls the LATEST one.
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;

  // The panel is ALWAYS the full `large` height, translated down to its stop —
  // that is what gives every sheet somewhere to grow into. `panelH` is
  // therefore both the layout height and the dismissed offset.
  const panelH = Math.round(screenH * sheetGesture.detents.large);
  // What the sheet is naturally worth: the chrome plus what it holds. Measured
  // rather than assumed, so a three-row sheet still rests three rows tall — a
  // declared detent adds a stop above that, it does not inflate the sheet to
  // fill it.
  //
  // ONLY a sheet that owns its scroller can be measured, and that is not a
  // limitation of the measuring — it is what the two modes MEAN. `scroll` puts
  // the children in this component's ScrollView, whose content size is their
  // natural height however tall the scroller is. `scroll={false}` (and `fill`)
  // hand the panel's column to the child, which is typically a ScrollView of
  // its own: RN gives every ScrollView flexGrow 1, so such a child takes the
  // whole panel by construction and there is no shorter height to find. Those
  // sheets are full-height, which is what a sheet holding its own scroller
  // wants anyway; a SHORT sheet must let this component do the scrolling.
  const padTop = 12;
  // The WINDOW's inset, not this screen's — a sheet covers the tab bar, and a
  // screen inside the native tab bar reports an inset with the bar folded in
  // (see lib/layout.ts `sheetInsetBottom`).
  const padBottom = sheetPadBottom(sheetInsetBottom(insets.bottom));
  const border = 1;
  const measures = scroll && !fill;
  const [headerH, setHeaderH] = useState<number | null>(null);
  const [contentH, setContentH] = useState<number | null>(null);
  // RN sizes border-box, so the panel's own border is part of the height the
  // resting stop has to leave room for — as are both pads.
  const naturalH = headerH != null && contentH != null ? border * 2 + padTop + headerH + contentH + padBottom : null;
  // Stops, ascending (0 = open at full height). Shared with web.
  const snaps = useMemo(
    () => sheetSnaps(panelH, detents, measures ? naturalH : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [panelH, detents?.join(","), measures, naturalH],
  );
  const openY = snaps[0] ?? 0;
  const restY = snaps[snaps.length - 1] ?? 0; // the SMALLEST height — where it opens to
  // Don't animate in before the resting stop is known, or the entrance lands at
  // full height and the measurement snaps it short afterwards. The panel is
  // off-screen while this resolves (one layout pass), so nothing is visible.
  const ready = !measures || naturalH != null;

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

  // The entrance must run ONCE per open, and only once the resting stop is
  // known. Without this latch it re-fires on every measurement, which would
  // drop the panel back off-screen and spring it up a second time.
  const entered = useRef(false);
  useEffect(() => {
    if (visible) {
      setRender(true);
      recede.open();
      return () => recede.close();
    }
    entered.current = false;
    if (render) {
      Animated.timing(y, {
        toValue: panelH,
        duration: reduced ? durations.reduced : durations.fast,
        easing: reduced ? Easing.linear : Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) return;
        setRender(false);
        // Forget the measurement WITH the unmount, never before it: dropping it
        // mid-exit would re-range the scrim, and dropping it while the children
        // stay mounted would leave nothing to re-report it on the next open.
        setHeaderH(null);
        setContentH(null);
        onClosedRef.current?.();
      });
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reduced, panelH]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!visible || !render || !ready || entered.current) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, render, ready, reduced]);

  // RE-FIT. The content can change height under a sheet that is already up (a
  // list loads, a section expands). If it is sitting at its content stop and
  // hasn't been dragged, follow the new one — an expanded sheet, or one the
  // hand is holding, is left exactly where it was put.
  const dragging = useRef(false);
  const prevRest = useRef(restY);
  useEffect(() => {
    const from = prevRest.current;
    prevRest.current = restY;
    if (!entered.current || dragging.current || Math.abs(restY - from) <= 2) return;
    if (Math.abs(yNow.current - from) <= 2) springTo(restY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restY]);

  // THE DRAG. Claimed only on a clear vertical move so a horizontal swipe or a
  // tap inside the sheet still works; the inner ScrollView keeps its own
  // gestures because this responder lives on the panel's chrome, and a drag
  // that starts inside scrolled content is left to the list.
  const drag = useRef({ startY: 0, last: 0, t: 0, v: 0 });
  const pan = useMemo(
    () =>
      PanResponder.create({
        // EITHER direction, not just down — up is the elongation. Still only on
        // a clear VERTICAL move, so a horizontal swipe or a tap inside the
        // sheet is left alone.
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx) * 1.6,
        onPanResponderGrant: () => {
          dragging.current = true;
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
          // The panel tracks the finger 1:1 in BOTH directions between the
          // stops — that is the elongation, and it has to be continuous to read
          // as one. Only past the top does it rubber-band, so the sheet never
          // leaves the top edge.
          y.setValue(raw >= openY ? raw : openY - rubberBand(openY - raw, 0, sheetGesture.resist));
        },
        onPanResponderRelease: () => {
          dragging.current = false;
          const from = yNow.current;
          // A gesture that was being HELD releases at rest, not at the speed of
          // whatever it did a moment ago (@hybrid/core `releaseVelocity`).
          const v = releaseVelocity(drag.current.v, Date.now() - drag.current.t);
          const { target, dismiss } = resolveSheetRelease(from, v, panelH, snaps);
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
          dragging.current = false;
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
  // The range runs from the RESTING stop, not from fully-open: presentation is
  // complete the moment the sheet has arrived, and elongating it further is not
  // "more presented". Ranging it from 0 would open every content-sized sheet on
  // a fraction of its scrim.
  const progress = y.interpolate({ inputRange: [Math.min(restY, panelH - 1), panelH], outputRange: [1, 0], extrapolate: "clamp" });
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
          style={{
            // ALWAYS the full height, resting translated down: the part below
            // the resting line is the room the sheet grows into.
            height: panelH,
            backgroundColor: C.ink2,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            borderWidth: border,
            borderColor: C.line,
            paddingHorizontal: 20,
            paddingTop: padTop,
            // ONE pad under the last row — @hybrid/core `sheetPadBottom`. The
            // home-indicator inset is its FLOOR, not an addition: `insets.bottom
            // + 20` was 54dp on any notched iPhone against the web twin's 24,
            // and every child that trailed its own pad stacked on top of that.
            paddingBottom: padBottom,
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
          <View
            {...pan.panHandlers}
            onLayout={(e) => setHeaderH(Math.round(e.nativeEvent.layout.height))}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel="Drag to resize or dismiss"
          >
            {header}
          </View>
          {/* No contentContainer pad on the scroller: the panel's own
              paddingBottom sits BELOW it, so anything here is a second pad.
              onContentSizeChange reports the content's NATURAL height whatever
              the scroller was given, which is what the resting stop is made of
              — and it re-reports when the content changes, so the sheet re-fits
              rather than holding a stale height. */}
          {scroll ? (
            <ScrollView
              style={{ flex: 1 }}
              onContentSizeChange={measures ? (_, h) => setContentH(Math.round(h)) : undefined}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
          ) : (
            // Straight into the panel's column, never through a wrapper: a
            // child that flexes (its own ScrollView, `fill`'s flexing body)
            // needs the panel's definite height to resolve against, and an
            // intermediate auto-height View is exactly what takes that away.
            children
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
