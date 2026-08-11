import { useEffect, useRef, useState, type ReactNode } from "react";
import { View, Text, Image, ScrollView } from "react-native";
import { useTheme, txt } from "../lib/theme";
import { useLang } from "../lib/i18n";
import { F, fs, leading, tracking, PressScale as Pressable, Loading } from "../lib/ui";
import { LEVEL_KEY, SHARED_ELEMENTS } from "@hybrid/core";
import type { PublicProfileResponse, CompareResult, SharedLift, BadgeAccent } from "@hybrid/core";
import { getProfile, follow, unfollow, getCompare, blockUser, reportTarget } from "../lib/social-api";
import { registerPerson, useSharedSurfaceTarget } from "../lib/shared-element";
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

/**
 * A person's face. `shared` makes this instance the DESTINATION of an avatar
 * armed on the way in — the same image of the same person, 52px in a list and
 * 84px on the page it opens, so the circle grows instead of being re-rendered
 * at the far end with no thread back to what was touched.
 *
 * The web twin declares a `view-transition-name`; here the clone is a SURFACE
 * flight (lib/shared-element), which is why the face is a component the arming
 * row can render into the flight rather than something to re-draw.
 */
export function Avatar({ url, name, handle, size = 44, shared }: { url?: string | null; name?: string | null; handle?: string; size?: number; shared?: boolean }) {
  const C = useTheme().palette;
  const { ref } = useSharedSurfaceTarget(shared ? SHARED_ELEMENTS.personAvatar : "");
  const srcRef = useRef<View | null>(null);
  const face = url
    ? <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: 999, backgroundColor: C.ink2 }} />
    : (
      <View style={{ width: size, height: size, borderRadius: 999, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "700", fontSize: size * 0.36 }}>{initials(name, handle)}</Text>
      </View>
    );
  // A SOURCE registers itself under the person's handle, so a door only has to
  // say who it is opening — see lib/shared-element `usePersonSource`. Nothing
  // is measured here: the list will have scrolled by the time anything is
  // armed, and a flight starting where the face used to be is worse than none.
  useEffect(() => {
    if (shared || !handle) return undefined;
    return registerPerson(handle, srcRef.current, face);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared, handle, url, name, size]);

  if (shared) return <View ref={ref} collapsable={false}>{face}</View>;
  if (!handle) return face;
  return <View ref={srcRef} collapsable={false}>{face}</View>;
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

/** `full` stretches the button to its container and centres the label — for a
 *  surface whose whole offer is ONE verb (a person's page), so the action never
 *  has to be hunted for among equals. Web twin: Btn's `full` in social-ui.tsx. */
export function SButton({ label, onPress, ghost, tone, small, disabled, full }: { label: string; onPress?: () => void; ghost?: boolean; tone?: string; small?: boolean; disabled?: boolean; full?: boolean }) {
  const C = useTheme().palette;
  const t = tone ?? C.lime;
  return (
    <Pressable onPress={onPress} disabled={disabled} style={{ paddingVertical: small ? 7 : 10, paddingHorizontal: small ? 12 : 16, borderRadius: 999, borderWidth: 1, borderColor: ghost ? C.line : t, backgroundColor: ghost ? "transparent" : t, opacity: disabled ? 0.5 : 1, alignSelf: full ? "stretch" : undefined, alignItems: full ? "center" : undefined }}>
      <Text style={{ color: ghost ? C.chalk : C.onAccent, fontFamily: F.bold, fontWeight: "700", fontSize: small ? 12 : 13 }}>{label}</Text>
    </Pressable>
  );
}

export function Empty({ title, sub }: { title: string; sub?: string }) {
  const { palette: C } = useTheme();
  return (
    <View style={{ paddingVertical: 36, alignItems: "center" }}>
      {/* Titles read the app's heading face, empty states included — the twin
          of web's EmptyState (social-ui.tsx). */}
      <Text style={{ color: C.chalk, fontFamily: F.black, fontSize: fs.subtitle, marginBottom: 6 }}>{title}</Text>
      {sub ? <Text style={{ color: C.ash, fontFamily: F.reg, fontSize: fs.body, textAlign: "center", lineHeight: leading(fs.body), maxWidth: 300 }}>{sub}</Text> : null}
    </View>
  );
}

