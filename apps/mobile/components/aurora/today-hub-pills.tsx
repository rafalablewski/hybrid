import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import {
  HUB_DOCK_REST,
  HUB_PILL,
  TODAY_TABS,
  hubActiveWidth,
  hubDockState,
  hubDockVisible,
  hubMotion,
  hubSplitDelay,
  type HubDockState,
  type TodayTabId,
} from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useNavScroll } from "../../lib/nav-scroll";
import { useReducedMotion } from "../../lib/use-reduced-motion";
import { useTheme, txt } from "../../lib/theme";
// PressScale, not the raw Pressable: every tap target in the app answers a
// touch (guarded by apps/web/__tests__/press-feedback.test.ts). `noScale` —
// the pill already lives inside an animating parent that scales it on arrival
// and animates its width on selection; a second scale on the same node fights
// both.
import { F, PressScale } from "../../lib/ui";
import { haptic } from "../../lib/haptics";
import { GlassSurface, LIQUID_GLASS_SUPPORTED } from "./swiftui";
import { withAlpha } from "./kit";
import { HubGlyph } from "./today-tabs";

// ── THE TODAY HUB DOCK (mobile) ─────────────────────────────────────────────
// What Today leaves behind on scroll, in the slot the deleted pill rail used
// to hold: the hub switcher itself, so the persistent element is the way OUT
// of the view you are in rather than a summary of it.
//
// SPLIT — once the in-flow segmented control has scrolled off, the three
// destinations become three free pills. Free pills need not be equal, so
// exactly one of them (the one you are in) carries its WORD; the other two
// contract to their glyph. Inside a track that is impossible, which is why the
// resting control is glyph-only.
//
// RETURN — the row answers scroll DIRECTION. Reading down takes it away; the
// first flick up brings it back. Both rules live in @hybrid/core
// (today-hub-dock.ts) so web detaches, hides and returns at identical points;
// this file owns only the pixels. Mirrors web (aurora/today-hub-pills.tsx).
//
// Under REDUCED MOTION the row renders DOCK instead: one capsule, glyph-only,
// permanently on screen while detached. RETURN's whole value is the motion, and
// a control that vanishes without one has simply disappeared.

const LABEL = { fontFamily: F.bold, fontSize: 14, letterSpacing: -0.1 } as const;

/**
 * Drive the shared dock engine off the nav-scroll signal.
 *
 * Every hub view already publishes its offset there to collapse the nav pill —
 * the dashboard's own ScrollView, and AuroraScreen/FeedView for Performance and
 * Feed — so all three drive the dock with no second listener anywhere. The full
 * state lives in a ref and only a PHASE change reaches React.
 *
 * Mobile passes no `controlBottom`: rebuilding the switcher's content-space y
 * from its parent chain is exactly the fragility the deleted rail carried
 * (entrance wrapper → dissolve wrapper → block → card → row), and the three
 * views nest it differently. The shared floor stands in, set a touch late so
 * the floating row can never appear beside the real one.
 */
function useHubDock(reduced: boolean, resetKey: string) {
  const nav = useNavScroll();
  const [phase, setPhase] = useState<HubDockState["phase"]>("attached");
  const held = useRef<HubDockState>(HUB_DOCK_REST);

  // A hub switch mounts a different view at the top of its own scroller: the
  // dock starts over, or the new screen inherits the old one's direction run.
  useEffect(() => {
    held.current = HUB_DOCK_REST;
    setPhase("attached");
  }, [resetKey]);

  useEffect(() => {
    if (!nav) return;
    return nav.subscribe((y) => {
      const next = hubDockState(y, { reduced, prev: held.current });
      held.current = next;
      setPhase((p) => (p === next.phase ? p : next.phase));
    });
  }, [nav, reduced]);

  return phase;
}

export function TodayHubPills({
  value,
  onChange,
  topInset,
}: {
  value: TodayTabId;
  onChange: (id: TodayTabId) => void;
  /** The safe-area top, so the row clears the status bar / notch. */
  topInset: number;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const reduced = useReducedMotion();
  const phase = useHubDock(reduced, value);
  const shown = hubDockVisible(phase);

  const reveal = hubMotion("reveal", reduced);
  const conceal = hubMotion("conceal", reduced);
  const exchange = hubMotion("exchange", reduced);

  // ── The row's arrival and departure ───────────────────────────────────────
  const vis = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const m = shown ? reveal : conceal;
    Animated.timing(vis, {
      toValue: shown ? 1 : 0,
      duration: m.ms,
      easing: reduced ? Easing.linear : Easing.bezier(...m.bezier),
      useNativeDriver: true,
    }).start();
  }, [shown, reduced, vis, reveal, conceal]);

  // ── The exchange ──────────────────────────────────────────────────────────
  // A pill's width IS its label's, and RN cannot animate to `auto`, so the
  // three labels are measured once in an invisible row and each pill animates
  // between its glyph-only width and its own measured one. Selecting a sibling
  // is then a real exchange — one inflating to its word as the other contracts
  // — which is the physics the lens used to carry inside the track.
  const [labelW, setLabelW] = useState<Record<string, number>>({});
  const widths = useRef(TODAY_TABS.map(() => new Animated.Value(HUB_PILL.siblingWidth))).current;
  useEffect(() => {
    const anims = TODAY_TABS.map((tab, i) => {
      const measured = labelW[tab.id];
      const target = tab.id === value && measured ? hubActiveWidth(measured) : HUB_PILL.siblingWidth;
      return Animated.timing(widths[i]!, {
        toValue: target,
        duration: exchange.ms,
        easing: reduced ? Easing.linear : Easing.bezier(...exchange.bezier),
        useNativeDriver: false,
      });
    });
    Animated.parallel(anims).start();
  }, [value, labelW, widths, exchange, reduced]);

  const activeIndex = Math.max(0, TODAY_TABS.findIndex((tab) => tab.id === value));

  const select = (id: TodayTabId) => {
    if (id !== value) haptic.selection();
    onChange(id);
  };

  return (
    <Animated.View
      pointerEvents={shown ? "box-none" : "none"}
      accessibilityElementsHidden={!shown}
      importantForAccessibility={shown ? "auto" : "no-hide-descendants"}
      style={{
        position: "absolute",
        top: topInset + HUB_PILL.top,
        left: 0,
        right: 0,
        // LEADING-anchored, not centred: the pills sit on the screen gutter,
        // which is where the in-flow switcher's own left edge is, so detaching
        // reads as the control lifting straight up rather than sliding
        // sideways. Web measures the same edge (its column is inset by the
        // shell's sidebar); here the gutter IS the column.
        alignItems: "flex-start",
        paddingLeft: HUB_PILL.inset,
        paddingRight: HUB_PILL.inset,
        opacity: vis,
        transform: [
          {
            translateY: vis.interpolate({
              inputRange: [0, 1],
              outputRange: [-(HUB_PILL.height + HUB_PILL.top + topInset), 0],
            }),
          },
        ],
      }}
    >
      {/* The measuring row — never visible, never touchable. Each label is laid
          out at the real type so `hubActiveWidth` works off the language the
          athlete actually reads, not an estimate. */}
      <View style={{ position: "absolute", opacity: 0, top: -400, flexDirection: "row" }} pointerEvents="none">
        {TODAY_TABS.map((tab) => (
          <Text
            key={tab.id}
            style={LABEL}
            onLayout={(e) => {
              const w = Math.ceil(e.nativeEvent.layout.width);
              setLabelW((m) => (m[tab.id] === w ? m : { ...m, [tab.id]: w }));
            }}
          >
            {t(tab.labelKey)}
          </Text>
        ))}
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: reduced ? 0 : HUB_PILL.gap,
          // DOCK (reduced motion): the three pills sit inside one capsule
          // instead of floating free, so the fallback is a shipped shape rather
          // than a degraded one.
          ...(reduced
            ? { backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 999, padding: 4 }
            : null),
        }}
      >
        {TODAY_TABS.map((tab, i) => {
          const on = tab.id === value;
          const label = t(tab.labelKey);
          return (
            // Two layers, because the pill runs two independent motions: the
            // wrapper carries the ARRIVAL (the staggered split, outward from
            // the active pill), the pill inside carries the EXCHANGE. Sharing
            // one node would make every selection inherit the split's delay.
            <SplitStagger key={tab.id} shown={shown} reduced={reduced} delay={hubSplitDelay(i, activeIndex)}>
              <Animated.View style={{ width: reduced ? HUB_PILL.siblingWidth : widths[i], height: HUB_PILL.height }}>
                <PressScale
                  noScale
                  onPress={() => select(tab.id)}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{ selected: on }}
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", overflow: "hidden", borderRadius: HUB_PILL.height / 2 }}
                >
                  {/* Liquid Glass on iOS, a translucent RN floor everywhere
                      else — the same material the app's other floating chrome
                      wears, so the dock reads as one family with it. */}
                  {!reduced && <GlassSurface radius={HUB_PILL.height / 2} />}
                  <View
                    style={[
                      StyleSheet.absoluteFill,
                      {
                        borderRadius: HUB_PILL.height / 2,
                        backgroundColor: on
                          ? withAlpha(C.lime, reduced ? 0.14 : 0.13)
                          : reduced || LIQUID_GLASS_SUPPORTED
                            ? "transparent"
                            : withAlpha(C.ink2, 0.86),
                        borderWidth: reduced ? 0 : 1,
                        borderColor: on ? withAlpha(C.lime, 0.46) : C.line,
                      },
                    ]}
                  />
                  <HubGlyph name={tab.glyph} color={on ? txt(C, C.lime) : C.ash} size={HUB_PILL.glyph} />
                  {on && (
                    <Text numberOfLines={1} style={[LABEL, { color: txt(C, C.lime), marginLeft: HUB_PILL.labelGap }]}>
                      {label}
                    </Text>
                  )}
                </PressScale>
              </Animated.View>
            </SplitStagger>
          );
        })}
      </View>
    </Animated.View>
  );
}

/**
 * One pill's arrival. Siblings land a beat after the pill you are IN, outward
 * from it (hubSplitDelay), so the split reads as one object opening rather
 * than three appearing. Under reduced motion there is no scale and no stagger — the row
 * is simply there.
 */
function SplitStagger({ shown, reduced, delay, children }: { shown: boolean; reduced: boolean; delay: number; children: React.ReactNode }) {
  const scale = useRef(new Animated.Value(shown || reduced ? 1 : 0.86)).current;
  useEffect(() => {
    if (reduced) { scale.setValue(1); return; }
    const m = hubMotion(shown ? "split" : "conceal", reduced);
    Animated.timing(scale, {
      toValue: shown ? 1 : 0.86,
      duration: m.ms,
      delay: shown ? delay : 0,
      easing: Easing.bezier(...m.bezier),
      useNativeDriver: true,
    }).start();
  }, [shown, reduced, delay, scale]);
  return <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>;
}

export default TodayHubPills;
