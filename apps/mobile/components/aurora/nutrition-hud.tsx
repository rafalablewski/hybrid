import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, Platform, Pressable, Text, View } from "react-native";
import {
  NUTRITION_HUD_ACCENT,
  NUTRITION_HUD_BAR_H,
  NUTRITION_HUD_LETTER,
  NUTRITION_HUD_ORDER,
  nutritionHudState,
  railMotion,
  type NutritionHudPill,
  type NutritionHudSlot,
} from "@hybrid/core";
import { useTheme, txt } from "../../lib/theme";
import { useLang } from "../../lib/i18n";
import { F } from "../../lib/ui";
import { useReducedMotion } from "../../lib/use-reduced-motion";

// ── AURORA nutrition HUD (mobile) ───────────────────────────────────────────
// The sticky element the nutrition screens leave behind. Each capsule is the
// residue of a card you have already read — kcal from the calorie ring, then
// protein/carbs/fat from the macro card — so what's LEFT stays on screen while
// you browse the picker, your meals, your products and the libraries for
// something to eat.
//
// The capture rule, the ceiling, the contraction and the motion constants all
// come from @hybrid/core (nutrition-hud.ts + today-rail.ts's motion table), so
// this pins at the identical points as web and moves on the identical curves as
// Today's pill rail; this file owns only the pixels. Mirrors the web
// aurora/nutrition-hud.tsx.
//
// Sources are measured with onLayout (content space) and compared against the
// ScrollView's contentOffset.y — the same two numbers web derives from
// getBoundingClientRect, so neither client can drift from the other.

/** What the host screen measures for us: the bottom edge of each source card,
 *  in the ScrollView's content space. */
export interface NutritionHudBottoms {
  energy: number | null;
  macros: number | null;
}

const easingOf = (b: readonly [number, number, number, number]) => Easing.bezier(b[0], b[1], b[2], b[3]);

export default function AuroraNutritionHud({
  slots,
  scrollY,
  bottoms,
  always = false,
  topInset,
  onReveal,
}: {
  /** the four readouts from nutritionHudSlots(fuel). */
  slots: NutritionHudSlot[];
  /** live scroll offset of the host AuroraScreen. */
  scrollY: number;
  /** the two source cards, on the hub. */
  bottoms?: NutritionHudBottoms;
  /** the sub-screens: no ring to scroll past, so pin from the first pixel. */
  always?: boolean;
  /** The safe-area top inset. The overlay sits at the SCREEN's top edge, so the
   *  bar pads its CONTENT down by this much: the ink runs up under the clock
   *  with no seam and the capsules clear it. Same shape as today-rail.tsx. */
  topInset: number;
  /** tapping a capsule goes back to the card it came from. */
  onReveal?: (key: NutritionHudPill) => void;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const reduced = useReducedMotion();

  const held = useRef<NutritionHudPill[]>([]);
  const state = useMemo(() => {
    const next = nutritionHudState(
      { energy: bottoms?.energy ?? null, macros: bottoms?.macros ?? null },
      scrollY,
      { prev: held.current, always },
    );
    held.current = next.captured;
    return next;
  }, [bottoms?.energy, bottoms?.macros, scrollY, always]);

  const has = (k: NutritionHudPill) => state.captured.includes(k);

  return (
    <View
      pointerEvents={state.pinned ? "box-none" : "none"}
      accessibilityRole="summary"
      accessibilityLabel={state.pinned ? t("w.recovery.nutrition.hud.barAria") : undefined}
      style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 30 }}
    >
      <Bar visible={state.pinned} reduced={reduced} C={C} topInset={topInset}>
        {NUTRITION_HUD_ORDER.map((key) => {
          const slot = slots.find((s) => s.key === key);
          if (!slot) return null;
          // Only a breach earns the red — the rail reports rather than nags,
          // and only energy carries a tint at rest so the row has one headline.
          const accent = slot.over ? C.red : C[NUTRITION_HUD_ACCENT[key]];
          const fg = slot.over ? txt(C, C.red) : txt(C, accent);
          const letter = NUTRITION_HUD_LETTER[key];
          return (
            <Pill
              key={key}
              open={has(key)}
              reduced={reduced}
              C={C}
              tint={slot.over || key === "kcal" ? accent : undefined}
              onPress={() => onReveal?.(key)}
              label={t(key === "kcal" ? "w.recovery.nutrition.hud.energyAria" : "w.recovery.nutrition.hud.macrosAria")}
            >
              {letter ? (
                <Text style={{ fontFamily: F.mono, fontSize: 10.5, fontWeight: "700", color: fg, opacity: 0.72, marginRight: 4 }}>{letter}</Text>
              ) : null}
              <Text style={{ fontFamily: F.mono, fontSize: 10.5, fontWeight: "700", letterSpacing: 0.5, color: fg }}>
                {Math.round(slot.left)}
              </Text>
              {/* kcal keeps the word "left" — it is the whole point of the rail.
                  The macro capsules shed their `g` at the ceiling instead. */}
              {key === "kcal" ? (
                <Text style={{ fontFamily: F.mono, fontSize: 8.5, letterSpacing: 1.2, textTransform: "uppercase", color: fg, opacity: 0.72, marginLeft: 5 }}>
                  {t("w.recovery.nutrition.hud.left")}
                </Text>
              ) : (
                <Contract open={!state.tight} reduced={reduced}>
                  <Text style={{ fontFamily: F.mono, fontSize: 8.5, color: fg, opacity: 0.72 }}>g</Text>
                </Contract>
              )}
            </Pill>
          );
        })}
      </Bar>
    </View>
  );
}

/** The bar: fades up 7dp with its hairline as the first capsule lands. */
function Bar({ visible, reduced, C, topInset, children }: {
  visible: boolean;
  reduced: boolean;
  C: ReturnType<typeof useTheme>["palette"];
  topInset: number;
  children: React.ReactNode;
}) {
  const m = railMotion("pin", reduced);
  const v = useRef(new Animated.Value(visible ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: visible ? 1 : 0, duration: m.ms, easing: easingOf(m.bezier), useNativeDriver: true }).start();
  }, [visible, v, m.ms, m.bezier]);
  return (
    <Animated.View
      style={{
        // The bar spans the status bar as well, so its own height is the rail
        // plus whatever the notch takes.
        minHeight: NUTRITION_HUD_BAR_H + topInset,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingHorizontal: 16,
        paddingTop: topInset + 8,
        paddingBottom: 9,
        // No backdrop-filter in RN: an ink wash at the same weight as the web
        // blur keeps the two bars reading the same.
        backgroundColor: C.ink,
        borderBottomWidth: 1,
        borderBottomColor: visible ? C.line : "transparent",
        opacity: v,
        transform: reduced ? undefined : [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-7, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

/** One capsule: blooms in on the overshoot curve, retracts on the flat one. RN
 *  cannot animate width to `auto`, so the bloom is carried by scale + opacity
 *  and the capsule is unmounted from layout when closed. */
function Pill({ open, reduced, C, onPress, label, tint, children }: {
  open: boolean;
  reduced: boolean;
  C: ReturnType<typeof useTheme>["palette"];
  onPress: () => void;
  label: string;
  tint?: string;
  children: React.ReactNode;
}) {
  const m = railMotion(open ? "bloom" : "retract", reduced);
  const v = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: open ? 1 : 0, duration: m.ms, easing: easingOf(m.bezier), useNativeDriver: true }).start();
  }, [open, v, m.ms, m.bezier]);
  if (!open) return null;
  return (
    <Animated.View
      style={{
        opacity: v,
        transform: reduced ? undefined : [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.68, 1] }) }],
      }}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        // Drawn at 26, touched at 44 — the capsule keeps a full-size target.
        hitSlop={{ top: 11, bottom: 11, left: 6, right: 6 }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 11,
          paddingVertical: 5,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: tint ? `${tint}57` : C.line,
          backgroundColor: tint ? `${tint}1a` : C.ink2,
        }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

/** The macro capsule's collapsible unit. Width animation needs the JS driver,
 *  so this is the one place the rail leaves the native thread; it runs once per
 *  contraction, not per frame. */
function Contract({ open, reduced, children }: { open: boolean; reduced: boolean; children: React.ReactNode }) {
  const m = railMotion(open ? "expand" : "contract", reduced);
  const v = useRef(new Animated.Value(open ? 1 : 0)).current;
  const width = useRef(0);
  useEffect(() => {
    Animated.timing(v, { toValue: open ? 1 : 0, duration: m.ms, easing: easingOf(m.bezier), useNativeDriver: false }).start();
  }, [open, v, m.ms, m.bezier]);
  return (
    <Animated.View
      onLayout={(e) => {
        if (open && !width.current) width.current = e.nativeEvent.layout.width;
      }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        marginLeft: 3,
        overflow: "hidden",
        opacity: v,
        maxWidth: v.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(1, width.current || 10)] }),
        // Android clips mid-animation without an explicit height hint.
        ...(Platform.OS === "android" ? { minHeight: 11 } : null),
      }}
    >
      {children}
    </Animated.View>
  );
}
