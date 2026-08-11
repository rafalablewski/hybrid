import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { durations } from "@hybrid/core";
import { haptic } from "../../lib/haptics";
import { AURORA_NAV_BAR_HEIGHT } from "../../lib/layout";
import { useTheme } from "../../lib/theme";
import { F, fs } from "../../lib/ui";
import { useReducedMotion } from "../../lib/use-reduced-motion";
import { withAlpha } from "./field";
import { GlassSurface, LIQUID_GLASS_SUPPORTED } from "./swiftui";

/**
 * THE TOAST — one small glass chip for a one-line outcome ("Following",
 * "Reported"), TWIN of apps/web/components/aurora/toast.tsx.
 *
 * It exists because the native overflow menu DISMISSES on select: the RN menu
 * card used to hold its row open and tag it with the result in place, and a
 * system menu cannot do that — so the outcome needs somewhere to land that
 * isn't a modal interruption. This is that place, and BOTH menu renderers now
 * report through it so the two platforms keep one behaviour.
 *
 * NOT a notification system: one message at a time, a newer one replaces the
 * current one, nothing queues, nothing is pressable. Anything that needs a
 * decision is a confirm sheet; anything that needs to persist is a screen's
 * own state. `toast()` is imperative for the same reason `confirm()` is — a
 * result line at a call site should read as one, not as a piece of state.
 */

/** An outcome chip, or a FAILURE chip. The kind exists so a failure can't pass
 *  as an outcome: "error" reads in the failure voice (red), stays up longer,
 *  and knocks (haptic.error — the audit's §15: a silent failure on a phone is
 *  a failure the user doesn't notice). The haptic fires in the HOST, once, so
 *  no call site can forget it — the same one-gate reasoning as lib/haptics. */
export type ToastKind = "outcome" | "error";

const listeners = new Set<(msg: string, kind: ToastKind) => void>();

/** Show one line of outcome. Safe to call from anywhere; no-op until the host
 *  is mounted (which is app launch). */
export function toast(msg: string, kind: ToastKind = "outcome") {
  for (const l of listeners) l(msg, kind);
}

const SHOW_MS = 1800;
/** A failure earns a longer read — it is the one chip the user must not miss. */
const SHOW_ERROR_MS = 3600;

/** Mounted ONCE, above the navigator (app/_layout.tsx), so a toast overlays
 *  whatever screen fired it and never recedes with a sheet. */
export function ToastHost() {
  const { palette: C } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [msg, setMsg] = useState<string | null>(null);
  const [kind, setKind] = useState<ToastKind>("outcome");
  const shown = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onToast = (m: string, k: ToastKind) => {
      setMsg(m);
      setKind(k);
      if (k === "error") haptic.error();
      if (hideTimer.current) clearTimeout(hideTimer.current);
      Animated.timing(shown, { toValue: 1, duration: reduced ? 60 : durations.fast, useNativeDriver: true }).start();
      hideTimer.current = setTimeout(() => {
        Animated.timing(shown, { toValue: 0, duration: reduced ? 60 : durations.fast, useNativeDriver: true }).start(
          ({ finished }) => { if (finished) setMsg(null); },
        );
      }, k === "error" ? SHOW_ERROR_MS : SHOW_MS);
    };
    listeners.add(onToast);
    return () => {
      listeners.delete(onToast);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [shown, reduced]);

  if (msg === null) return null;
  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", left: 0, right: 0, bottom: insets.bottom + AURORA_NAV_BAR_HEIGHT + 18, alignItems: "center" }}
    >
      <Animated.View
        accessibilityLiveRegion={kind === "error" ? "assertive" : "polite"}
        style={{
          borderRadius: 999,
          overflow: "hidden",
          paddingHorizontal: 16,
          paddingVertical: 9,
          backgroundColor: LIQUID_GLASS_SUPPORTED ? "transparent" : withAlpha(C.ink2, 0.92),
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: withAlpha("#ffffff", 0.16),
          opacity: shown,
          transform: reduced ? [] : [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
        }}
      >
        {/* The same material stack as every glass chip: native glass where it
            renders, blur + translucent ink elsewhere. */}
        {LIQUID_GLASS_SUPPORTED ? (
          <GlassSurface radius={999} />
        ) : (
          <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} />
        )}
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, letterSpacing: 0.9, textTransform: "uppercase", color: kind === "error" ? C.red : C.chalk }}>
          {msg}
        </Text>
      </Animated.View>
    </View>
  );
}
