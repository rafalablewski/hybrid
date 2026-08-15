import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import {
  HUB_DOCK_REST,
  HUB_DOCK_SPRINGS,
  HUB_PILL,
  TODAY_TABS,
  hubDockState,
  hubDockVisible,
  hubMotion,
  hubPillWidths,
  springToRN,
  type HubDockState,
  type HubMotion,
  type TodayTabId,
} from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useNavScroll } from "../../lib/nav-scroll";
import { useReducedMotion } from "../../lib/use-reduced-motion";
import { useTheme, txt } from "../../lib/theme";
// PressScale, not the raw Pressable: every tap target in the app answers a
// touch (guarded by apps/web/__tests__/press-feedback.test.ts). `noScale` —
// the pill already lives inside a parent that animates its width on selection,
// and a second scale on the same node fights it.
import { fs, F, PressScale , tracking} from "../../lib/ui";
import { haptic } from "../../lib/haptics";
import { GlassPillRow, LIQUID_GLASS_SUPPORTED } from "./swiftui";
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
// this file owns only the pixels. Mirrors web (aurora/today-hub-dock.tsx).
//
// ── THE GLASS IS REAL (iOS) ─────────────────────────────────────────────────
// The row used to wear a static glass tile per pill and tween the widths in JS,
// which gave three separate panes that changed size — glass as a MATERIAL. It
// is now a single native SwiftUI GlassEffectContainer (swiftui.tsx,
// GlassPillRow) whose capsules share a Namespace, so the system treats them as
// one body of glass: touching capsules FUSE, and a frame that changes makes the
// glass flow between the shapes instead of resizing a blur. That is what turns
// SPLIT from a metaphor into the actual transition — the row arrives as ONE
// lozenge and separates, and on the way out it merges back.
//
// The marks and the words stay RN on top (same vector glyphs as the in-flow
// switcher, same type, same i18n), and so do the taps. Both layers are laid out
// from the same shared widths and animate on the same shared springs, so the
// glyph rides its capsule exactly. Off iOS — and under Reduce Motion — the RN
// treatment below is the whole control, unchanged.
//
// Under REDUCED MOTION the row renders DOCK instead: one capsule, glyph-only,
// permanently on screen while detached. RETURN's whole value is the motion, and
// a control that vanishes without one has simply disappeared.

const LABEL = { fontFamily: F.bold, fontSize: fs.bodyLg, letterSpacing: tracking.display } as const;

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

/** Run an Animated.Value on one of the dock's shared transitions — the spring
 *  if it has one, otherwise its curve. The SwiftUI layer is handed the same
 *  token, so the two integrate identical physics rather than similar curves. */
function runMotion(v: Animated.Value, to: number, m: HubMotion, useNativeDriver: boolean) {
  return m.spring
    ? Animated.spring(v, { toValue: to, useNativeDriver, ...springToRN(m.spring) })
    : Animated.timing(v, {
        toValue: to,
        duration: m.ms,
        easing: m.bezier ? Easing.bezier(...m.bezier) : Easing.linear,
        useNativeDriver,
      });
}

export function TodayHubDock({
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
  // Reduce Motion keeps DOCK — the RN capsule — even on iOS: a row of glass
  // that fuses and separates is exactly the motion the setting asks us not to
  // run, and the material without the behaviour is just a lighter pill.
  const nativeGlass = LIQUID_GLASS_SUPPORTED && !reduced;

  const reveal = hubMotion("reveal", reduced);
  const conceal = hubMotion("conceal", reduced);
  const exchange = hubMotion("exchange", reduced);

  // ── The row's arrival and departure ───────────────────────────────────────
  const vis = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    runMotion(vis, shown ? 1 : 0, shown ? reveal : conceal, true).start();
  }, [shown, vis, reveal, conceal]);

  // ── The exchange ──────────────────────────────────────────────────────────
  // A pill's width IS its label's, and RN cannot animate to `auto`, so the
  // three labels are measured once in an invisible row and each pill animates
  // between its glyph-only width and its own measured one. Selecting a sibling
  // is then a real exchange — one inflating to its word as the other contracts
  // — which is the physics the lens used to carry inside the track. The SAME
  // widths go to the glass beneath (hubPillWidths is the one source).
  const [labelW, setLabelW] = useState<Record<string, number>>({});
  const targets = useMemo(() => hubPillWidths(value, labelW, TODAY_TABS), [value, labelW]);
  const widths = useRef(TODAY_TABS.map(() => new Animated.Value(HUB_PILL.siblingWidth))).current;
  useEffect(() => {
    Animated.parallel(targets.map((w, i) => runMotion(widths[i]!, w, exchange, false))).start();
  }, [targets, widths, exchange]);

  // ── SPLIT and MERGE ───────────────────────────────────────────────────────
  // One number: the gap. At zero the capsules touch, and touching Liquid Glass
  // is ONE lozenge — so springing the gap open is the track becoming three
  // pills, and shutting it on the way out is them merging back. Under reduced
  // motion the gap stays shut and the DOCK capsule holds the three together.
  const gap = reduced ? 0 : HUB_PILL.gap;
  const split = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) { split.setValue(0); return; }
    // Leaving rides the SPLIT spring too, not the conceal curve: the merge is
    // positional, and the row is still on screen while it runs.
    runMotion(split, shown ? gap : 0, reveal, false).start();
  }, [shown, reduced, gap, split, reveal]);

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
        opacity: vis.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: "clamp" }),
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
          position: "relative",
          flexDirection: "row",
          alignItems: "center",
          // DOCK (reduced motion): the three pills sit inside one capsule
          // instead of floating free, so the fallback is a shipped shape rather
          // than a degraded one.
          ...(reduced
            ? { backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 999, padding: 4 }
            : null),
        }}
      >
        {/* THE GLASS, underneath: one native container, three capsules that fuse
            and flow. It draws no content and takes no touches — if it never
            renders (iOS < 26, a failed native mount) the RN row above is still
            the whole working control. */}
        {nativeGlass && (
          <GlassPillRow
            widths={targets}
            activeIndex={activeIndex}
            gap={gap}
            open={shown}
            height={HUB_PILL.height}
            tintColor={withAlpha(C.lime, 0.34)}
            // Straight from the shared tokens rather than off the resolved
            // transitions above: the native layer only ever runs when motion is
            // NOT reduced, and these are the two springs `hubMotion` hands the
            // RN layer in that case.
            spring={HUB_DOCK_SPRINGS.exchange}
            splitSpring={HUB_DOCK_SPRINGS.reveal}
          />
        )}

        {TODAY_TABS.map((tab, i) => {
          const on = tab.id === value;
          const label = t(tab.labelKey);
          return (
            <Animated.View
              key={tab.id}
              style={{
                width: widths[i],
                height: HUB_PILL.height,
                // The gap is animated, not styled: it IS the split. Matching
                // `padding(leading:)` on the glass beneath.
                marginLeft: i === 0 ? 0 : split,
              }}
            >
              <PressScale
                noScale
                onPress={() => select(tab.id)}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected: on }}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", overflow: "hidden", borderRadius: HUB_PILL.height / 2 }}
              >
                {/* Off iOS (and under Reduce Motion) the pill still needs a
                    body of its own: a translucent ink floor, and the accent as
                    a film. On iOS both are IN the glass — a tinted pane rather
                    than a coloured sheet behind one — so nothing is drawn here
                    and the native material is what you see. */}
                {!nativeGlass && (
                  <View
                    style={[
                      StyleSheet.absoluteFill,
                      {
                        borderRadius: HUB_PILL.height / 2,
                        backgroundColor: on ? withAlpha(C.lime, reduced ? 0.14 : 0.13) : reduced ? "transparent" : withAlpha(C.ink2, 0.86),
                        borderWidth: reduced ? 0 : 1,
                        borderColor: on ? withAlpha(C.lime, 0.46) : C.line,
                      },
                    ]}
                  />
                )}
                <HubGlyph name={tab.glyph} color={on ? txt(C, C.lime) : C.ash} size={HUB_PILL.glyph} />
                {on && (
                  <Text numberOfLines={1} style={[LABEL, { color: txt(C, C.lime), marginLeft: HUB_PILL.labelGap }]}>
                    {label}
                  </Text>
                )}
              </PressScale>
            </Animated.View>
          );
        })}
      </View>
    </Animated.View>
  );
}

export default TodayHubDock;
