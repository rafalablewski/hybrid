import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";
import { Animated, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";

// How far you scroll down (px) before the floating nav pill is fully collapsed.
// Full size lives at the very top; the pill shrinks smoothly across this range,
// matching Instagram's bottom bar (full at rest, compact once you scroll).
const COLLAPSE_DISTANCE = 48;

type NavScroll = {
  // 0 = expanded (at the top), 1 = collapsed (scrolled past COLLAPSE_DISTANCE).
  collapse: Animated.Value;
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  reset: () => void;
};

const Ctx = createContext<NavScroll | null>(null);

/**
 * Shares one scroll-collapse signal between the (many) scroll surfaces and the
 * single root-mounted floating nav — RN has no global scroll event, so screens
 * publish their offset here and the nav subscribes. Mounted once at the root.
 */
export function NavScrollProvider({ children }: { children: ReactNode }) {
  const collapse = useRef(new Animated.Value(0)).current;
  const value = useMemo<NavScroll>(
    () => ({
      collapse,
      onScroll: (e) => {
        const y = e?.nativeEvent?.contentOffset?.y ?? 0;
        const p = y <= 0 ? 0 : y >= COLLAPSE_DISTANCE ? 1 : y / COLLAPSE_DISTANCE;
        collapse.setValue(p);
      },
      reset: () => collapse.setValue(0),
    }),
    [collapse],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNavScroll(): NavScroll | null {
  return useContext(Ctx);
}

/**
 * Props to spread onto any ScrollView / FlatList so it drives the nav collapse.
 * A no-op ({}) outside the provider, so callers can spread it unconditionally.
 */
export function useNavScrollProps(): { onScroll?: NavScroll["onScroll"]; scrollEventThrottle?: number } {
  const ns = useNavScroll();
  if (!ns) return {};
  return { onScroll: ns.onScroll, scrollEventThrottle: 16 };
}
