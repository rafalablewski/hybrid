import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  Animated,
  Easing,
  StyleSheet,
  type ViewStyle,
} from "react-native";
import { BlurView } from "expo-blur";
import { useRouter, type Href } from "expo-router";
import { NAV_ITEMS, navVisibleTo } from "@hybrid/core";
import { useLang } from "../lib/i18n";
import { usePersona } from "../lib/persona";
import { useNavAccess } from "../lib/access";
import { useTheme } from "../lib/theme";
import { F } from "../lib/ui";

const AnimatedBlur = Animated.createAnimatedComponent(BlurView);

// Shared depth shadow — the "lifted glass" feel (iOS shadow + Android elevation).
const glassShadow: ViewStyle = {
  shadowColor: "#000",
  shadowOpacity: 0.5,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 12 },
  elevation: 8,
};

/**
 * Liquid Glass surface for React Native. BlurView frosts whatever is behind it;
 * a brand tint film + a top rim-highlight + a soft border reproduce the web
 * `.liquid-glass` look (grain is omitted — no perf-free noise primitive on RN).
 * Mirrors the @hybrid/core palette so web and mobile stay in lockstep.
 */
export function GlassCard({
  children,
  style,
  intensity = 38,
  tint,
  accent,
  padding = 16,
}: {
  children: ReactNode;
  style?: ViewStyle;
  intensity?: number;
  /** Override the blur tint; defaults to the active theme. */
  tint?: "dark" | "light";
  /** Optional left accent bar (e.g. the lime accent) matching the web cards. */
  accent?: string;
  padding?: number;
}) {
  const { scheme } = useTheme();
  const t = tint ?? scheme;
  const light = t === "light";
  const film = light ? "rgba(255,255,255,0.34)" : "rgba(22,24,22,0.34)";
  const rim = light ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.22)";
  const border = light ? "rgba(20,30,15,0.12)" : "rgba(255,255,255,0.10)";
  return (
    <View
      style={[
        { borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: border, marginBottom: 12 },
        glassShadow,
        style,
      ]}
    >
      <BlurView intensity={intensity} tint={t} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: film }]} />
      <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, backgroundColor: rim }} />
      {accent && <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, backgroundColor: accent }} />}
      <View style={{ padding }}>{children}</View>
    </View>
  );
}

/** Frosted background for the bottom tab bar (used via Tabs `tabBarBackground`). */
export function GlassTabBarBackground() {
  const { scheme } = useTheme();
  return (
    <View style={StyleSheet.absoluteFill}>
      <BlurView intensity={40} tint={scheme} style={StyleSheet.absoluteFill} />
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: scheme === "light" ? "rgba(233,236,230,0.55)" : "rgba(12,13,12,0.55)" },
        ]}
      />
    </View>
  );
}

// Tiles for the control-center sheet — built from the shared canonical nav
// (@hybrid/core NAV_ITEMS) filtered to the routes mobile actually has, so the
// icons/labels/grouping can't drift from web. Each id maps to an expo-router href.
const HREF: Record<string, Href> = {
  today: "/(tabs)",
  cockpit: "/cockpit",
  log: "/(tabs)/log",
  history: "/(tabs)/history",
  plans: "/(tabs)/plans",
  sport: "/(tabs)/sport",
  calendar: "/calendar",
  periodize: "/periodize",
  performance: "/performance",
  competition: "/competition",
  longevity: "/longevity",
  tactical: "/tactical",
  video: "/video",
  connections: "/connections",
  talent: "/talent",
  forceplate: "/forceplate",
  roles: "/roles",
  velocity: "/(tabs)/velocity",
  running: "/(tabs)/running",
  progress: "/progress",
  nutrition: "/nutrition",
  checkin: "/checkin",
  coach: "/(tabs)/coach",
  settings: "/settings",
};
const TILES = NAV_ITEMS.filter((i) => i.id in HREF);

// Force monochrome (text) rendering on single-unit glyphs so they don't fall
// back to dark emoji presentation; true emoji (🏃/🍎/📸) are left alone.
const glyph = (ic: string) => (Array.from(ic).length === 1 ? `${ic}︎` : ic);

/**
 * The central control-center menu: a floating glass orb (FAB) that blooms a
 * blurred sheet of nav tiles — the mobile analog of the web ⌘K hub.
 */
export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const a = useRef(new Animated.Value(0)).current;
  const router = useRouter();
  const { t } = useLang();
  const persona = usePersona();
  const access = useNavAccess();
  const { scheme, palette } = useTheme();
  // Shape the hub to the persona (honouring the admin's access override) — a
  // casual user never sees the athlete/coach tiles unless an admin grants them.
  const tiles = TILES.filter((tile) => navVisibleTo(persona, tile.id, access));
  const label = (k: string, fb: string) => (t(k) === k ? fb : t(k));
  // neutral chip/border tint that reads on either glass theme
  const neutral = (o: number) => (scheme === "light" ? `rgba(20,30,15,${o})` : `rgba(255,255,255,${o})`);

  useEffect(() => {
    if (open) {
      setMounted(true);
      Animated.spring(a, { toValue: 1, useNativeDriver: false, friction: 8, tension: 70 }).start();
    } else if (mounted) {
      Animated.timing(a, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: false }).start(
        ({ finished }) => finished && setMounted(false),
      );
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (href: Href) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityLabel="Open quick menu"
        style={[
          {
            position: "absolute",
            bottom: 70,
            alignSelf: "center",
            width: 58,
            height: 58,
            borderRadius: 29,
            overflow: "hidden",
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: neutral(0.12),
          },
          glassShadow,
        ]}
      >
        <BlurView intensity={28} tint={scheme} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: scheme === "light" ? "rgba(255,255,255,0.4)" : "rgba(22,24,22,0.4)" }]} />
        <View style={{ width: 20, height: 20, borderRadius: 7, backgroundColor: palette.lime }} />
      </Pressable>

      <Modal visible={mounted} transparent animationType="none" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)}>
          <AnimatedBlur
            intensity={a.interpolate({ inputRange: [0, 1], outputRange: [0, 24] })}
            tint={scheme}
            style={StyleSheet.absoluteFill}
          />
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: scheme === "light" ? "rgba(210,216,205,0.45)" : "rgba(0,0,0,0.45)",
                opacity: a,
                justifyContent: "center",
                padding: 22,
              },
            ]}
          >
            <Animated.View
              style={{
                transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) }],
                opacity: a,
              }}
            >
              {/* absorbs taps so they don't reach the backdrop's close handler
                  (RN touch events don't bubble; no stopPropagation needed) */}
              <Pressable onPress={() => {}}>
                <GlassCard intensity={50} padding={20} style={{ borderRadius: 28, marginBottom: 0 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <View>
                      <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.4, color: palette.ash, textTransform: "uppercase" }}>
                        app.hybrid.app
                      </Text>
                      <Text style={{ fontFamily: F.black, fontSize: 18, color: palette.chalk, marginTop: 2 }}>Jump to…</Text>
                    </View>
                    <Pressable
                      onPress={() => setOpen(false)}
                      style={{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: neutral(0.16), backgroundColor: neutral(0.07) }}
                    >
                      <Text style={{ color: palette.chalk, fontSize: 15 }}>✕</Text>
                    </Pressable>
                  </View>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                    {tiles.map((tile) => (
                      <Pressable
                        key={tile.id}
                        onPress={() => go(HREF[tile.id]!)}
                        style={{
                          width: "30%",
                          flexGrow: 1,
                          borderRadius: 16,
                          paddingVertical: 14,
                          alignItems: "center",
                          gap: 8,
                          backgroundColor: neutral(0.06),
                          borderWidth: 1,
                          borderColor: neutral(0.1),
                        }}
                      >
                        <View
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 14,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: neutral(0.07),
                            borderWidth: 1,
                            borderColor: neutral(0.18),
                          }}
                        >
                          <Text style={{ fontSize: 20, color: palette.chalk }}>{glyph(tile.icon)}</Text>
                        </View>
                        <Text style={{ fontFamily: F.bold, fontSize: 12, color: palette.chalk }} numberOfLines={1}>
                          {label(`nav.${tile.id}`, tile.label)}
                        </Text>
                        <Text style={{ fontFamily: F.mono, fontSize: 8, color: palette.ash, textTransform: "uppercase", letterSpacing: 0.6 }}>
                          {tile.group}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </GlassCard>
              </Pressable>
            </Animated.View>
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
}
