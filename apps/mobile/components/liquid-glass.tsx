import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  Animated,
  Easing,
  StyleSheet,
} from "react-native";
import { BlurView } from "expo-blur";
import { useRouter, type Href } from "expo-router";
import { NAV_ITEMS, navVisibleTo, AURORA_NAV_ICONS } from "@hybrid/core";
import { AuroraIcon } from "./aurora/icons";
import { useLang } from "../lib/i18n";
import { usePersona } from "../lib/persona";
import { useNavAccess } from "../lib/access";
import { useTheme } from "../lib/theme";
// GlassCard + glassShadow live in lib/ui (Card's glass-by-default base), so the
// surface is defined once and shared with every screen.
import { fs, space, F, GlassCard, glassShadow } from "../lib/ui";

const AnimatedBlur = Animated.createAnimatedComponent(BlurView);

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
  cockpit: "/(tabs)/cockpit",
  notifications: "/notifications",
  log: "/(tabs)/log",
  timer: "/interval-timer",
  statistics: "/statistics",
  runtrack: "/run-track",
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
  velocity: "/(tabs)/velocity",
  endurance: "/(tabs)/endurance",
  progress: "/progress",
  nutrition: "/nutrition",
  checkin: "/checkin",
  coach: "/(tabs)/coach",
  settings: "/settings",
};
const TILES = NAV_ITEMS.filter((i) => i.id in HREF);

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
                      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1.4, color: palette.ash, textTransform: "uppercase" }}>
                        app.hybrid.app
                      </Text>
                      <Text style={{ fontFamily: F.black, fontSize: fs.title, color: palette.chalk, marginTop: 2 }}>Jump to…</Text>
                    </View>
                    <Pressable
                      onPress={() => setOpen(false)}
                      accessibilityRole="button"
                      accessibilityLabel={t("common.close")}
                      hitSlop={8}
                      style={{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: neutral(0.16), backgroundColor: neutral(0.07) }}
                    >
                      <Text style={{ color: palette.chalk, fontSize: fs.note }}>✕</Text>
                    </Pressable>
                  </View>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.ms }}>
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
                          gap: space.sm,
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
                          <AuroraIcon name={AURORA_NAV_ICONS[tile.id] ?? "info"} size={22} color={palette.chalk} />
                        </View>
                        <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: palette.chalk }} numberOfLines={1}>
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
