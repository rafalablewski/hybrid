import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LIQUID_GLASS_STORAGE_KEY } from "@hybrid/core";

/**
 * Liquid Glass preference — the on/off switch for the native SwiftUI kit
 * (apps/mobile/components/aurora/swiftui.tsx). Mirrors the TemplateProvider
 * pattern: a per-device toggle persisted to AsyncStorage, defaulting OFF so a
 * fresh install shows the classic Aurora theme first and the native SwiftUI
 * (Liquid Glass) look is opt-in. Flipping it ON in Settings swaps in the native
 * SwiftUI surfaces with no rebuild.
 *
 * SwiftUI is iOS-only, so `supported` is false off-iOS and `active` is always
 * false there — the toggle simply isn't shown on web/Android.
 */
const SUPPORTED = Platform.OS === "ios";

interface LiquidGlassCtx {
  /** Whether this platform can render the native kit at all (iOS only). */
  supported: boolean;
  /** The user's persisted preference (meaningful only when `supported`). */
  enabled: boolean;
  /** The effective state the kit should use: supported AND enabled. */
  active: boolean;
  setEnabled: (v: boolean) => void;
}

const Ctx = createContext<LiquidGlassCtx>({
  supported: SUPPORTED,
  enabled: false,
  active: false,
  setEnabled: () => {},
});

export function LiquidGlassProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(LIQUID_GLASS_STORAGE_KEY)
      .then((v) => {
        if (v === "0") setEnabledState(false);
        else if (v === "1") setEnabledState(true);
      })
      .catch((err) => console.error("Failed to load Liquid Glass preference:", err));
  }, []);

  const setEnabled = (v: boolean) => {
    setEnabledState(v);
    AsyncStorage.setItem(LIQUID_GLASS_STORAGE_KEY, v ? "1" : "0").catch(() => {});
  };

  return (
    <Ctx.Provider value={{ supported: SUPPORTED, enabled, active: SUPPORTED && enabled, setEnabled }}>
      {children}
    </Ctx.Provider>
  );
}

export const useLiquidGlass = () => useContext(Ctx);
