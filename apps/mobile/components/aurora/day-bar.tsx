import { useEffect, useRef, useState } from "react";
import { Animated, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ALPHA, DAY_BAR, DAY_BAR_AWAY, avatarInitials, durations, inkOn, springToRN, springs,
  unreadLabel, type TodayTabId,
} from "@hybrid/core";
import { useSession } from "../../lib/session";
import { useNotifications } from "../../lib/use-notifications";
import { useLang } from "../../lib/i18n";
import { useReducedMotion } from "../../lib/use-reduced-motion";
import { useTheme } from "../../lib/theme";
import { F, PressScale as Pressable } from "../../lib/ui";
import { RADIUS } from "./geometry";
import { AuroraIcon } from "./icons";
import AuroraSideMenu from "./side-menu";
import { StreakMark } from "./streak-mark";
import { withAlpha } from "./field";

/**
 * THE DAY BAR — what is left of Today's head once the field has folded away.
 *
 * The day field (aurora/day-band.tsx) is the whole top of the screen: the app
 * row, the hub pills, the date, the title, the score and the instruction, on
 * one ground in the day's colour. Scrolling folds it — and what comes back is
 * NOT a second header. It is the SAME app row, compressed into a floating
 * capsule, so the fold rearranges the masthead instead of replacing it with a
 * different object. Avatar, wordmark, streak, bell; nothing else.
 *
 * ── IT CARRIES NO FIGURES, AND THAT IS THE DESIGN ────────────────────────
 * Two things were tried here and removed. A copy of the readiness score, which
 * duplicated a reading the athlete had just scrolled past, in a slot too small
 * to make it mean anything. And a scroll-progress rail, which is chrome
 * reporting on chrome — it tells you how far down a screen you are, which the
 * thumb already said. What survives is the one thing that is readable without
 * being looked at: WHICH COLOUR TODAY IS.
 *
 * ── ONE MATERIAL, ON EVERY RUNG ──────────────────────────────────────────
 * Solid, in the day's hue, always — never glass, and never a second treatment
 * for the quiet rungs. The reasoning is in day-fold.ts and it is not a taste
 * argument: a blur costs GPU in exchange for resolving what is behind it, and
 * behind this bar is a near-black page of flat dark cards with nothing to
 * resolve. The field washes the hue at 16%; the bar is the same hue at full
 * strength, so the day's colour ARRIVES concentrated rather than fading out.
 *
 * ── THE ENTRANCE IS TRAVEL, NOT A RESOLVE ────────────────────────────────
 * It rests above the screen edge by its own height plus `DAY_BAR.clearance`,
 * and comes down. An earlier cut animated insets and corner radius while the
 * bar sat at its final position: every number changed, nothing moved, and it
 * read as no transition at all. Opacity finishes well before the travel does,
 * so most of the drop is watched at full strength — a bar that fades across
 * the whole of its own movement reads as an appearance rather than an arrival.
 */
export default function AuroraDayBar({
  /** The day's colour — `bandHue()` resolved through the palette. */
  hue,
  /** Latched by the screen through `barLatched()`, never by a raw threshold. */
  folded,
  /** Mirrors AppHeader: the drawer's hub rows switch the hub in place here. */
  hub,
}: {
  hue: string;
  folded: boolean;
  hub?: { value: TodayTabId; onChange: (tab: TodayTabId) => void };
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { name } = useSession();
  const { unread } = useNotifications();
  const reduced = useReducedMotion();
  const [menuOpen, setMenuOpen] = useState(false);
  const anim = useRef(new Animated.Value(folded ? 1 : 0)).current;

  useEffect(() => {
    // REDUCE MOTION SUBSTITUTES, it does not delete: the bar still arrives, it
    // just stops travelling to do it (durations.reduced, never zero).
    if (reduced) {
      Animated.timing(anim, { toValue: folded ? 1 : 0, duration: durations.reduced, useNativeDriver: true }).start();
      return;
    }
    Animated.spring(anim, {
      toValue: folded ? 1 : 0,
      useNativeDriver: true,
      ...springToRN(springs.sheet),
    }).start();
  }, [folded, reduced, anim]);

  // MEASURED, never chosen. palette.test.ts sweeps every accent this can be, so
  // no rung can ship a bar whose wordmark does not clear AA on its own fill.
  const ink = inkOn(hue, [C.ink, C.chalk]);

  // The travel, and the fade that leads it. `sheet` peaks a touch past its
  // target, so translateY EXTENDS past 0 — that overshoot is the arrival — while
  // opacity clamps, because a bar cannot be more visible than visible.
  const translateY = reduced
    ? 0
    : anim.interpolate({ inputRange: [0, 1], outputRange: [DAY_BAR_AWAY, 0] });
  const opacity = anim.interpolate({ inputRange: [0, 0.42, 1], outputRange: [0, 1, 1], extrapolate: "clamp" });

  return (
    <>
      <Animated.View
        pointerEvents={folded ? "auto" : "none"}
        accessibilityElementsHidden={!folded}
        importantForAccessibility={folded ? "auto" : "no-hide-descendants"}
        style={{
          position: "absolute",
          top: insets.top + DAY_BAR.top,
          left: DAY_BAR.inset,
          right: DAY_BAR.inset,
          height: DAY_BAR.height,
          paddingHorizontal: DAY_BAR.padX,
          borderRadius: RADIUS.pill,
          backgroundColor: hue,
          borderWidth: 1,
          borderColor: withAlpha(ink, ALPHA.fill),
          flexDirection: "row",
          alignItems: "center",
          gap: DAY_BAR.gap,
          opacity,
          transform: [{ translateY }],
        }}
      >
        <Pressable
          onPress={() => setMenuOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t("nav.openMenu")}
          accessibilityState={{ expanded: menuOpen }}
          style={{
            width: DAY_BAR.tile.size, height: DAY_BAR.tile.size, borderRadius: DAY_BAR.tile.radius,
            backgroundColor: withAlpha(ink, ALPHA.fill), borderWidth: 1, borderColor: withAlpha(ink, ALPHA.rim),
            alignItems: "center", justifyContent: "center",
          }}
        >
          <Text style={{ fontFamily: F.black, fontSize: DAY_BAR.initials, color: ink }}>{avatarInitials(name)}</Text>
        </Pressable>

        {/* The row is avatar / spacer / bell, and the LOCKUP IS OVERLAID on it
            rather than laid out in it. Nothing beside it has a fixed width — an
            unread badge goes 9 → 12 → 99+, initials are one letter or two — and
            a wordmark that slides sideways when a notification arrives is the
            jitter that makes a header look broken. Absolute centring makes the
            middle the middle by construction. */}
        <View style={{ flex: 1 }} />

        <Pressable
          onPress={() => router.push("/notifications")}
          accessibilityRole="button"
          accessibilityLabel={t("w.home.today.notificationsAria")}
          style={{ width: DAY_BAR.tile.size, height: DAY_BAR.tile.size, alignItems: "center", justifyContent: "center" }}
        >
          <View style={{ opacity: DAY_BAR.softInk }}>
            <AuroraIcon name="bell" size={DAY_BAR.icon} color={ink} />
          </View>
          {unread > 0 && (
            <View style={{
              position: "absolute", top: DAY_BAR.badge.inset, right: DAY_BAR.badge.inset,
              minWidth: DAY_BAR.badge.size, height: DAY_BAR.badge.size, paddingHorizontal: DAY_BAR.badge.padX,
              borderRadius: DAY_BAR.badge.size / 2, backgroundColor: ink,
              borderWidth: DAY_BAR.badge.ring, borderColor: hue,
              alignItems: "center", justifyContent: "center",
            }}>
              <Text style={{ fontFamily: F.mono, fontSize: DAY_BAR.badge.text, color: hue }}>{unreadLabel(unread)}</Text>
            </View>
          )}
        </Pressable>

        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: F.black, fontSize: DAY_BAR.wordmark.size, letterSpacing: DAY_BAR.wordmark.tracking, color: ink }}>
            HYBRID<Text>.</Text>
          </Text>
          <View style={{ marginTop: DAY_BAR.streak.top }}>
            <View style={{ opacity: DAY_BAR.softInk }}>
              <StreakMark ink={ink} />
            </View>
          </View>
        </View>
      </Animated.View>

      <AuroraSideMenu open={menuOpen} onClose={() => setMenuOpen(false)} onHubTab={hub?.onChange} activeHub={hub?.value} />
    </>
  );
}
