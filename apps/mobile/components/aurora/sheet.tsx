import { useEffect, useRef, useState, type ReactNode } from "react";
import { View, Text, Pressable, Animated, Easing, StyleSheet, ScrollView, Modal, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { motion, springs, springDurationMs, durations } from "@hybrid/core";
import { useTheme } from "../../lib/theme";
import { useSheetRecede } from "../../lib/sheet-recede";
import { useReducedMotion } from "../../lib/use-reduced-motion";
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
}) {
  const { palette: C } = useTheme();
  const insets = useSafeAreaInsets();
  // Keep the node alive through the exit animation: `render` stays true until
  // the slide-down finishes. `slide` drives the panel (0 = down/hidden, 1 = up).
  const [render, setRender] = useState(visible);
  const [panelH, setPanelH] = useState(0);
  const slide = useRef(new Animated.Value(0)).current;
  const recede = useSheetRecede();
  const reduced = useReducedMotion();

  useEffect(() => {
    if (visible) {
      setRender(true);
      recede.open();
      Animated.timing(slide, {
        toValue: 1,
        duration: reduced ? durations.reduced : springDurationMs(springs.sheet),
        easing: reduced ? Easing.linear : Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return () => recede.close();
    }
    if (render) {
      Animated.timing(slide, {
        toValue: 0,
        duration: reduced ? durations.reduced : durations.fast,
        easing: reduced ? Easing.linear : Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => { if (finished) setRender(false); });
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reduced]);

  if (!render) return null;

  // Reduce Motion SUBSTITUTES a cross-dissolve: the panel fades in place rather
  // than travelling. It is never removed — the user still needs to perceive
  // that a sheet appeared.
  const translateY = reduced
    ? 0
    : slide.interpolate({ inputRange: [0, 1], outputRange: [panelH || 900, 0] });
  const panelOpacity = reduced ? slide : 1;
  const scrimOpacity = slide.interpolate({ inputRange: [0, 1], outputRange: [0, motion.scrimWithRecede] });

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
          onLayout={(e) => setPanelH(e.nativeEvent.layout.height)}
          style={{
            backgroundColor: C.ink2,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            borderWidth: 1,
            borderColor: C.line,
            maxHeight: "90%",
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: insets.bottom + 20,
            transform: [{ translateY }],
            opacity: panelOpacity,
            shadowColor: "#000",
            shadowOpacity: 0.4,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: -8 },
            elevation: 24,
          }}
        >
          {scroll ? (
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 4 }}>
              {header}
              {children}
            </ScrollView>
          ) : (
            <>
              {header}
              {children}
            </>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
