import { useEffect, useState, type ReactNode } from "react";
import { View, Text, Image, ScrollView, ActivityIndicator } from "react-native";
import { useTheme, txt } from "../lib/theme";
import { useLang } from "../lib/i18n";
import { F, fs, leading, serifIf, tracking, PressScale as Pressable, Loading } from "../lib/ui";
import { LEVEL_KEY } from "@hybrid/core";
import type { PublicProfileResponse, CompareResult, SharedLift, BadgeAccent } from "@hybrid/core";
import { getProfile, follow, unfollow, getCompare, blockUser, reportTarget } from "../lib/social-api";
import { useConfirm } from "./aurora/confirm";
import Sheet from "./aurora/sheet";

/** The level chip's ink — the palette's existing ramp, no new colours. Mirrors
 *  badgeInk in aurora/profile.tsx and LevelChip on web. */
/** The level chip's ink — ash and chalk for the lower tiers, the lime
 *  accent-text tone for advanced, gold reserved for elite. Exported because the
 *  user page paints the same chip; web's twin lives in components/user-page.tsx. */
export const levelInk = (C: ReturnType<typeof useTheme>["palette"], accent: BadgeAccent): string =>
  accent === "gold" ? C.gold : accent === "lime" ? txt(C, C.lime) : accent === "chalk" ? C.chalk : C.ash;

export function initials(name?: string | null, handle?: string) {
  const s = (name || handle || "?").trim();
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return s.slice(0, 2).toUpperCase();
}

export function Avatar({ url, name, handle, size = 44 }: { url?: string | null; name?: string | null; handle?: string; size?: number }) {
  const C = useTheme().palette;
  if (url) return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: 999, backgroundColor: C.ink2 }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: 999, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "700", fontSize: size * 0.36 }}>{initials(name, handle)}</Text>
    </View>
  );
}

export function Stars({ rating, size = 13 }: { rating: number | null; size?: number }) {
  const C = useTheme().palette;
  const { t } = useLang();
  if (rating == null) return <Text style={{ color: C.ash, fontSize: size }}>{t("w.social.noReviews")}</Text>;
  const full = Math.round(rating);
  return (
    <Text style={{ fontSize: size }}>
      <Text style={{ color: C.gold }}>{"★".repeat(full)}</Text>
      <Text style={{ color: C.line }}>{"★".repeat(5 - full)}</Text>
      <Text style={{ color: C.ash, fontFamily: F.mono }}> {rating.toFixed(1)}</Text>
    </Text>
  );
}

export function SButton({ label, onPress, ghost, tone, small, disabled }: { label: string; onPress?: () => void; ghost?: boolean; tone?: string; small?: boolean; disabled?: boolean }) {
  const C = useTheme().palette;
  const t = tone ?? C.lime;
  return (
    <Pressable onPress={onPress} disabled={disabled} style={{ paddingVertical: small ? 7 : 10, paddingHorizontal: small ? 12 : 16, borderRadius: 999, borderWidth: 1, borderColor: ghost ? C.line : t, backgroundColor: ghost ? "transparent" : t, opacity: disabled ? 0.5 : 1 }}>
      <Text style={{ color: ghost ? C.chalk : C.onAccent, fontFamily: F.bold, fontWeight: "700", fontSize: small ? 12 : 13 }}>{label}</Text>
    </Pressable>
  );
}

export function Empty({ title, sub }: { title: string; sub?: string }) {
  const { palette: C, scheme } = useTheme();
  return (
    <View style={{ paddingVertical: 36, alignItems: "center" }}>
      {/* Titles read the app's heading face, empty states included — the twin
          of web's EmptyState (social-ui.tsx). */}
      <Text style={{ color: C.chalk, fontFamily: serifIf(scheme, F.black), fontSize: fs.subtitle, marginBottom: 6 }}>{title}</Text>
      {sub ? <Text style={{ color: C.ash, fontFamily: F.reg, fontSize: fs.body, textAlign: "center", lineHeight: leading(fs.body), maxWidth: 300 }}>{sub}</Text> : null}
    </View>
  );
}

