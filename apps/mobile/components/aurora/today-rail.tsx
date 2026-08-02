import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, Platform, Pressable, Text, View } from "react-native";
import {
  TODAY_RAIL_BAR_H,
  railMotion,
  todayRailState,
  type LogbookDay,
  type ReadinessFeeling,
  type TodayDoneState,
  type TodayPillKey,
  type TodayRailSource,
} from "@hybrid/core";
import { useTheme, txt } from "../../lib/theme";
import { useLang } from "../../lib/i18n";
import { F } from "../../lib/ui";
import { useReducedMotion } from "../../lib/use-reduced-motion";
import ReadinessFace from "./readiness-face";

// ── AURORA Today pill rail (mobile) ─────────────────────────────────────────
// The sticky element Today leaves behind. Each card hands ONE answer up to a
// 46dp bar as it clears the top — the date, then whether today is done, then
// how ready you feel. The capture rule, the ceiling, the contraction and the
// motion constants all come from @hybrid/core (today-rail.ts), so this pins at
// the identical points as web; this file owns only the pixels. Mirrors the web
// aurora/today-rail.tsx.
//
// Sources are measured with onLayout (content space) and compared against the
// ScrollView's contentOffset.y — the same two numbers web derives from
// getBoundingClientRect, so neither client can drift from the other.

/** What the host screen measures for us: the bottom edge of each source card,
 *  in the ScrollView's content space. */
export interface TodayRailBottoms {
  date: number | null;
  done: number | null;
  ready: number | null;
}

const easingOf = (b: readonly [number, number, number, number]) => Easing.bezier(b[0], b[1], b[2], b[3]);

export default function AuroraTodayRail({
  scrollY,
  bottoms,
  days,
  doneState,
  feeling,
  topInset,
  onOpenMonth,
  onOpenDone,
  onOpenCheckin,
}: {
  /** live scroll offset of Today's ScrollView. */
  scrollY: number;
  bottoms: TodayRailBottoms;
  /** the same seven days the week strip drew, so the dot track cannot drift. */
  days: Pick<LogbookDay, "dateKey" | "logged" | "isToday" | "weekdayShort" | "dayOfMonth" | "monthShort">[];
  doneState: TodayDoneState;
  feeling: ReadinessFeeling | null;
  /** The safe-area top inset. The overlay itself sits at the SCREEN's top edge
   *  — an absolutely positioned child is laid out from its parent's border box,
   *  so the host SafeAreaView's own paddingTop does NOT move it (the ambient
   *  AuroraField behaves the same way, which is why its glow reaches behind the
   *  status bar). The bar therefore pads its CONTENT down by this much: the ink
   *  runs up under the clock with no seam, and the pills clear it. */
  topInset: number;
  onOpenMonth: () => void;
  onOpenDone: () => void;
  onOpenCheckin: () => void;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const reduced = useReducedMotion();

  const held = useRef<TodayPillKey[]>([]);
  const state = useMemo(() => {
    const sources: TodayRailSource[] = [
      { key: "date", bottom: bottoms.date },
      { key: "done", bottom: bottoms.done },
      { key: "ready", bottom: bottoms.ready },
    ];
    const next = todayRailState(sources, scrollY, { prev: held.current });
    held.current = next.captured;
    return next;
  }, [bottoms.date, bottoms.done, bottoms.ready, scrollY]);

  const has = (k: TodayPillKey) => state.captured.includes(k);

  return (
    <View
      pointerEvents={state.pinned ? "box-none" : "none"}
      style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 30 }}
    >
      <Bar visible={state.pinned} reduced={reduced} C={C} topInset={topInset}>
        {/* DATE — the week strip's residue. At the ceiling it sheds its month
            and dot track and contracts to "Sun 26". */}
        <Pill open={has("date")} reduced={reduced} C={C} onPress={onOpenMonth} label={t("w.home.pill.dateAria")}>
          <Text style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: 0.9, color: C.chalk }}>
            {todayOf(days) ? `${todayOf(days)!.weekdayShort} ${todayOf(days)!.dayOfMonth}` : ""}
          </Text>
          <Contract open={!state.tight} reduced={reduced}>
            <Text style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: 0.9, color: C.chalk }}>{todayOf(days)?.monthShort}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginLeft: 8 }}>
              {days.map((d) => (
                <View
                  key={d.dateKey}
                  style={{
                    width: d.isToday ? 7 : 5,
                    height: d.isToday ? 7 : 5,
                    borderRadius: 4,
                    backgroundColor: d.isToday ? C.lime : d.logged ? txt(C, C.lime) : C.line,
                    opacity: d.isToday || d.logged ? 1 : 0.9,
                  }}
                />
              ))}
            </View>
          </Contract>
        </Pill>

        {/* DONE — today's verdict. Only a finished day earns the accent, so the
            rail reports rather than nags. */}
        <Pill
          open={has("done")}
          reduced={reduced}
          C={C}
          onPress={onOpenDone}
          label={t(`w.home.pill.${doneState === "none" ? "log" : doneState}Aria`)}
          tint={doneState === "done" ? C.lime : undefined}
        >
          <Text style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: 0.9, color: doneState === "done" ? txt(C, C.lime) : C.ash }}>
            {doneState === "done" ? "✓ " : ""}
            {t(`w.home.pill.${doneState === "none" ? "log" : doneState}`)}
          </Text>
        </Pill>

        {/* READY — the check-in's residue. Not checked in yet is the state that
            matters most in the evening: the pill becomes the prompt. */}
        <Pill open={has("ready")} reduced={reduced} C={C} onPress={onOpenCheckin} label={t("w.home.pill.readyAria")}>
          {feeling ? (
            <View style={{ marginRight: 5 }}>
              <ReadinessFace feeling={feeling} scale={0.5} />
            </View>
          ) : null}
          <Text style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: 0.9, color: feeling ? txt(C, C[READY_ACCENT[feeling]]) : C.ash }}>
            {feeling ? t(`w.recovery.readiness.${feeling}`) : t("w.home.pill.howReady")}
          </Text>
        </Pill>
      </Bar>
    </View>
  );
}

const todayOf = <T extends { isToday: boolean }>(days: T[]) => days.find((d) => d.isToday) ?? days[days.length - 1] ?? null;

/** The feeling's semantic accent — mirrors READINESS_FACE without pulling the
 *  whole record in for one lookup. */
const READY_ACCENT: Record<ReadinessFeeling, "lime" | "blue" | "amber" | "red"> = {
  primed: "lime",
  good: "blue",
  flat: "amber",
  wrecked: "red",
};

/** The bar: fades up 7dp with its hairline as the first pill lands. */
function Bar({ visible, reduced, C, topInset, children }: { visible: boolean; reduced: boolean; C: ReturnType<typeof useTheme>["palette"]; topInset: number; children: React.ReactNode }) {
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
        minHeight: TODAY_RAIL_BAR_H + topInset,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingHorizontal: 16,
        paddingTop: topInset + 8,
        paddingBottom: 8,
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

/** One pill: blooms in on the overshoot curve, retracts on the flat one. RN
 *  cannot animate width to `auto`, so the bloom is carried by scale + opacity
 *  and the pill is unmounted from layout when closed. */
function Pill({
  open,
  reduced,
  C,
  onPress,
  label,
  tint,
  children,
}: {
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
        // Drawn at 28, touched at 44 — the pill keeps a full-size target.
        hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 12,
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

/** The date's collapsible tail — month + dot track. Width animation needs the
 *  JS driver, so this is the one place the rail leaves the native thread; it
 *  runs once per contraction, not per frame. */
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
        marginLeft: 8,
        overflow: "hidden",
        opacity: v,
        maxWidth: v.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(1, width.current || 140)] }),
        // Android clips mid-animation without an explicit height hint.
        ...(Platform.OS === "android" ? { minHeight: 12 } : null),
      }}
    >
      {children}
    </Animated.View>
  );
}
