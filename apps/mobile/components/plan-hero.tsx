import { useRef, useState, type ReactNode } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { planCoverView, type GoalNode, type GoalPlan, type PlanProgram } from "@hybrid/core";
import { AURORA_NAV_BAR_HEIGHT, auroraScrollClearance } from "../lib/layout";
import { useLoggerPrefs } from "../lib/logger-prefs";
import { useNavScroll } from "../lib/nav-scroll";
import { useTheme, txt } from "../lib/theme";
import { fs, F, serifIf, useEntrance } from "../lib/ui";
import { useReducedMotion } from "../lib/use-reduced-motion";
import { AuroraField, withAlpha } from "./aurora/kit";
import { MetaLine } from "./aurora/meta";

/** The Explore PlanCover's fixed-dark base — the cover is dark in BOTH themes,
 *  exactly like the Explore cards it grows out of. */
const COVER_INK = "#0c0d0c";

/** The docked enroll pill both detail renderers hand to PlanCoverScreen's dock
 *  slot — lime while actionable, a quiet bordered status pill once enrolled. */
export function PlanDockPill({ state, idleLabel, busyLabel, doneLabel, onPress }: { state: "idle" | "busy" | "done" | "error"; idleLabel: string; busyLabel: string; doneLabel: string; onPress: () => void }) {
  const { palette: C } = useTheme();
  const done = state === "done";
  return (
    <Pressable
      onPress={onPress}
      disabled={state === "busy" || done}
      accessibilityRole="button"
      style={{
        height: 50,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: done ? C.ink2 : C.lime,
        borderWidth: 1,
        borderColor: done ? C.line : C.lime,
        shadowColor: done ? "#000" : C.lime,
        shadowOpacity: done ? 0.2 : 0.35,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 4,
      }}
    >
      <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: done ? txt(C, C.lime) : C.onAccent }}>
        {state === "busy" ? busyLabel : done ? `✓ ${doneLabel}` : idleLabel}
      </Text>
    </Pressable>
  );
}
/** Bar content height below the status-bar inset when fully collapsed. */
const BAR_CONTENT = 56;
/** Cover content height below the status-bar inset when fully expanded. */
const COVER_CONTENT = 252;

/** What the scaffold needs to draw a cover — a structural subset of core's
 *  PlanCoverView, so the GOAL-level cover (goalCoverView) rides the exact same
 *  scaffold with its plan-count label in the duration slot. */
export interface CoverSpec {
  accent: string;
  glyph: string;
  chip: string;
  /** top-right mono label — "8 WEEKS" on a plan, "1 PLAN" on a goal. */
  duration: string;
  title: string;
  metaParts: (string | null)[];
  /** rule-topped hem columns; [] skips the hem entirely. */
  stats: { value: string; unit: string | null; label: string }[];
  blurb: string;
}

/**
 * PlanCoverScreen — the plan detail's full-bleed collapsing cover scaffold,
 * shared by BOTH mobile detail renderers (discipline-shaped program + classic).
 *
 * The cover is the Explore PlanCover recipe at screen scale (one shared
 * planCoverView so the two can't drift): duotone accent wash over fixed cover
 * ink, ghost discipline glyph, white chip, bottom-anchored display title. It
 * sits at y=0 under the status bar, PINS, and compresses 1:1 with scroll into a
 * 56dp glass bar — pure transform/opacity interpolation off one scrollY value
 * (the NavScrollProvider idiom), never a height animation. Deliberately NOT
 * suppressed under Reduce Motion: this is direct manipulation tracking the
 * finger, the same stance as the shipped masthead compression; only the
 * released-mid-range snap degrades to an instant settle.
 *
 * Slots: `top` renders above the sticky `rail` (which docks beneath the
 * collapsed bar), `children` below it; `dock` is the CTA pill that surfaces
 * above the tab bar as the cover finishes collapsing.
 */
export default function PlanCoverScreen({
  goal,
  plan,
  program,
  back,
  top,
  rail,
  dock,
  children,
}: {
  goal: GoalNode;
  plan: GoalPlan;
  program?: PlanProgram;
  back: () => void;
  top?: ReactNode;
  rail?: ReactNode;
  dock?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <CoverScreen cover={planCoverView(goal, plan, program)} backLabel={goal.name} back={back} top={top} rail={rail} dock={dock}>
      {children}
    </CoverScreen>
  );
}

/** The generic scaffold behind PlanCoverScreen — same collapse physics, snap
 *  detent and dock for ANY CoverSpec (plan detail and the goal/category hero). */
export function CoverScreen({
  cover,
  backLabel,
  back,
  top,
  rail,
  dock,
  children,
}: {
  cover: CoverSpec;
  /** what the ← button announces ("← Olympic Weightlifting" / "← All goals"). */
  backLabel: string;
  back: () => void;
  top?: ReactNode;
  rail?: ReactNode;
  dock?: ReactNode;
  children?: ReactNode;
}) {
  const { palette: C, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const heroH = insets.top + COVER_CONTENT;
  const barH = insets.top + BAR_CONTENT;
  const delta = heroH - barH;

  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const dockedRef = useRef(false);
  const [docked, setDocked] = useState(false);
  const [railTop, setRailTop] = useState<number | null>(null);
  const ns = useNavScroll();
  const reduced = useReducedMotion();
  const haptics = useLoggerPrefs().haptics;
  const entrance = useEntrance();

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    scrollY.setValue(y);
    const wantDock = y > delta * 0.45;
    if (wantDock !== dockedRef.current) {
      dockedRef.current = wantDock;
      setDocked(wantDock);
    }
    ns?.onScroll(e);
  };

  // Released mid-collapse → settle to the nearer pole. A genuine detent, so it
  // may buzz (user-gated); under Reduce Motion the settle is an instant jump.
  const snap = (y: number) => {
    if (y <= 6 || y >= delta) return;
    scrollRef.current?.scrollTo({ y: y > delta / 2 ? delta : 0, animated: !reduced });
    if (haptics) Haptics.selectionAsync().catch(() => {});
  };

  // Every hero layer reads from the ONE scroll track (0 → delta), 1:1 with the
  // finger. Frame slides up; the bar chrome counter-translates to stay put.
  const clamp = (input: [number, number], output: [number, number]) =>
    scrollY.interpolate({ inputRange: input, outputRange: output, extrapolate: "clamp" });
  const heroShift = clamp([0, delta], [0, -delta]);
  const counter = clamp([0, delta], [0, delta]);
  const glyphCounter = clamp([0, delta], [0, delta * 0.55]);
  const glyphFade = clamp([0, delta], [1, 0.4]);
  const scrimFade = clamp([0, delta], [1, 0]);
  const bigFade = clamp([0, delta * 0.5], [1, 0]);
  const compactFade = clamp([delta * 0.62, delta], [0, 1]);
  const hairFade = clamp([delta * 0.5, delta], [0, 1]);
  const dockFade = clamp([delta * 0.45, delta], [0, 1]);
  const dockRise = clamp([delta * 0.45, delta], [10, 0]);
  // The rail docks beneath the collapsed bar: once its natural position would
  // scroll past `barH`, it translates down to hold there (second sticky layer).
  const railShift =
    railTop != null
      ? scrollY.interpolate({
          inputRange: [Math.max(0, railTop - barH), Math.max(0, railTop - barH) + 100000],
          outputRange: [0, 100000],
          extrapolateLeft: "clamp",
        })
      : 0;

  const accent = cover.accent;
  return (
    <View style={{ flex: 1, backgroundColor: C.ink }}>
      {/* the cover is fixed-dark even in the light theme → light status icons */}
      <StatusBar style="light" />
      <AuroraField />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Animated.View style={[{ flex: 1 }, entrance]}>
          <ScrollView
            ref={scrollRef}
            onScroll={onScroll}
            scrollEventThrottle={16}
            onScrollEndDrag={(e) => {
              const v = e.nativeEvent.velocity?.y ?? 0;
              if (Math.abs(v) < 0.15) snap(e.nativeEvent.contentOffset.y);
            }}
            onMomentumScrollEnd={(e) => snap(e.nativeEvent.contentOffset.y)}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingTop: heroH, paddingBottom: auroraScrollClearance(insets.bottom) + 66 }}
          >
            {/* the hem — editorial rule-topped stat columns directly on the ink,
                the first content to slide under the pinned cover. */}
            <View style={{ paddingHorizontal: 16 }}>
              {cover.stats.length > 0 && (
                <View style={{ flexDirection: "row", gap: 18, marginTop: 18, marginBottom: 14 }}>
                  {cover.stats.map((s) => (
                    <View key={s.label} style={{ flex: 1, borderTopWidth: 2, borderTopColor: withAlpha(C.chalk, 0.18), paddingTop: 10 }}>
                      <Text style={{ fontFamily: F.black, fontSize: 27, lineHeight: 28, letterSpacing: -0.5, color: C.chalk, fontVariant: ["tabular-nums"] }}>
                        {s.value}
                        {!!s.unit && <Text style={{ fontSize: 14, color: C.ash }}>{s.unit}</Text>}
                      </Text>
                      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1.4, textTransform: "uppercase", color: C.ash, marginTop: 6 }}>{s.label}</Text>
                    </View>
                  ))}
                </View>
              )}
              {!!cover.blurb && <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, lineHeight: 22, color: C.ash, marginTop: cover.stats.length ? 0 : 16, marginBottom: 4 }}>{cover.blurb}</Text>}
              {top}
            </View>

            {rail && (
              <Animated.View
                onLayout={(e) => setRailTop(e.nativeEvent.layout.y)}
                style={{ zIndex: 10, transform: [{ translateY: railShift }] }}
              >
                <View style={{ backgroundColor: withAlpha(C.ink, 0.88), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line, overflow: "hidden" }}>
                  <BlurView intensity={26} tint={scheme === "light" ? "light" : "dark"} style={StyleSheet.absoluteFill} />
                  {rail}
                </View>
              </Animated.View>
            )}

            <View style={{ paddingHorizontal: 16 }}>{children}</View>
          </ScrollView>

          {/* ── the cover: pinned overlay, slides up by exactly the scroll ── */}
          <Animated.View
            pointerEvents="box-none"
            style={{ position: "absolute", top: 0, left: 0, right: 0, height: heroH, zIndex: 20, overflow: "hidden", backgroundColor: COVER_INK, transform: [{ translateY: heroShift }] }}
          >
            {/* duotone wash bleeding from the top corner (Explore recipe) */}
            <LinearGradient colors={[`${accent}c8`, `${accent}4d`, `${accent}0d`]} start={{ x: 0.9, y: 0 }} end={{ x: 0.2, y: 0.95 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
            {/* bottom scrim for title legibility — retired as the title leaves */}
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: scrimFade }]}>
              <LinearGradient colors={["#0c0d0c00", "#0c0d0ccc"]} start={{ x: 0, y: 0.4 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
            </Animated.View>
            {/* ghost glyph — the cover art; parallax drift against the frame */}
            <Animated.Text
              pointerEvents="none"
              style={{ position: "absolute", top: insets.top - 26, right: -10, fontSize: 150, lineHeight: 158, color: "rgba(255,255,255,0.07)", opacity: glyphFade, transform: [{ translateY: glyphCounter }] }}
            >
              {cover.glyph}
            </Animated.Text>

            {/* bar chrome — counter-translates so it never moves on screen */}
            <Animated.View style={{ position: "absolute", top: insets.top + 4, left: 16, right: 18, height: 44, flexDirection: "row", justifyContent: "space-between", alignItems: "center", zIndex: 3, transform: [{ translateY: counter }] }}>
              <Pressable
                onPress={back}
                accessibilityRole="button"
                accessibilityLabel={`← ${backLabel}`}
                hitSlop={8}
                style={{ width: 38, height: 38, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ fontFamily: F.semi, fontSize: 16, color: "#fff" }}>←</Text>
              </Pressable>
              <Text style={{ fontFamily: F.mono, fontSize: 10.5, fontWeight: "600", letterSpacing: 0.6, color: "rgba(255,255,255,0.88)" }}>{cover.duration}</Text>
            </Animated.View>

            {/* compact bar title — fades in a beat after the big one leaves */}
            <Animated.View
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{ position: "absolute", top: insets.top + 4, left: 62, right: 62, height: 44, alignItems: "center", justifyContent: "center", zIndex: 2, opacity: compactFade, transform: [{ translateY: counter }] }}
            >
              <Text numberOfLines={1} style={{ fontFamily: serifIf(scheme, F.bold), fontSize: 15.5, letterSpacing: -0.2, color: "#fff" }}>{cover.title}</Text>
            </Animated.View>

            {/* the cover proper — chip, title, meta; slides up with the frame */}
            <Animated.View pointerEvents="none" style={{ position: "absolute", left: 18, right: 18, bottom: 18, opacity: bigFade }}>
              <Text style={{ alignSelf: "flex-start", fontFamily: F.mono, fontSize: 10, fontWeight: "700", letterSpacing: 1.4, textTransform: "uppercase", color: "#0d0e0d", backgroundColor: "#edefe8", paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999, overflow: "hidden" }}>{cover.chip}</Text>
              <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: 31, lineHeight: 33, letterSpacing: -0.7, color: "#fff", maxWidth: "86%", marginTop: 12 }}>{cover.title}</Text>
              <View style={{ marginTop: 9 }}>
                <MetaLine parts={cover.metaParts} textStyle={{ fontFamily: F.mono, fontSize: 11, color: "rgba(255,255,255,0.82)", letterSpacing: 0.3 }} />
              </View>
            </Animated.View>

            {/* hairline — the collapsed bar's bottom edge */}
            <Animated.View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.16)", opacity: hairFade }} />
          </Animated.View>

          {/* ── the dock: CTA pill above the tab bar, arrives with the collapse ── */}
          {dock && (
            <Animated.View
              pointerEvents={docked ? "box-none" : "none"}
              style={{ position: "absolute", left: 16, right: 16, bottom: insets.bottom + AURORA_NAV_BAR_HEIGHT + 14, zIndex: 30, opacity: dockFade, transform: [{ translateY: dockRise }] }}
            >
              {dock}
            </Animated.View>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}
