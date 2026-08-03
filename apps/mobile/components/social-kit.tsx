import { useEffect, useState, type ReactNode } from "react";
import { View, Text, Image, ScrollView, ActivityIndicator } from "react-native";
import { useTheme, txt } from "../lib/theme";
import { useLang } from "../lib/i18n";
import { F, PressScale as Pressable } from "../lib/ui";
import type { PublicProfileResponse, CompareResult, SharedLift } from "@hybrid/core";
import { getProfile, follow, unfollow, getCompare, blockUser, reportTarget } from "../lib/social-api";
import { useConfirm } from "./aurora/confirm";
import Sheet from "./aurora/sheet";

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

export function SPill({ label, active, onPress, count }: { label: string; active?: boolean; onPress?: () => void; count?: number }) {
  const C = useTheme().palette;
  return (
    <Pressable onPress={onPress} style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: active ? C.lime : C.line, backgroundColor: active ? C.lime : "transparent" }}>
      <Text style={{ color: active ? C.onAccent : C.chalk, fontFamily: F.bold, fontWeight: "600", fontSize: 13 }}>{label}{count ? ` ${count}` : ""}</Text>
    </Pressable>
  );
}

export function Empty({ title, sub }: { title: string; sub?: string }) {
  const C = useTheme().palette;
  return (
    <View style={{ paddingVertical: 36, alignItems: "center" }}>
      <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "700", marginBottom: 6 }}>{title}</Text>
      {sub ? <Text style={{ color: C.ash, fontSize: 13, textAlign: "center", lineHeight: 19, maxWidth: 300 }}>{sub}</Text> : null}
    </View>
  );
}

// A modal showing any user's public profile (reused by feed / discover / leaderboard).
export function ProfileModal({ handle, onClose }: { handle: string; onClose: () => void }) {
  const { confirm, notify } = useConfirm();
  const C = useTheme().palette;
  const { t } = useLang();
  const [data, setData] = useState<PublicProfileResponse | null>(null);
  const [cmp, setCmp] = useState<CompareResult | null>(null);
  const load = () => getProfile(handle).then(setData);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [handle]);
  const p = data?.profile;
  // A pending follow request lives in `followState`, NOT `relation`, so fold it in
  // — otherwise the "Requested" button + "Request pending" copy never show.
  const rel: string = data?.followState === "requested" ? "requested" : (data?.relation ?? "none");
  const following = rel === "following" || rel === "friend" || rel === "close";

  const doBlock = async () => {
    const ok = await confirm({ title: t("w.social.block"), message: t("w.social.blockConfirm").replace("{h}", handle), confirmLabel: t("w.social.block"), destructive: true });
    if (!ok) return;
    await blockUser({ handle });
    onClose();
  };
  const doReport = async () => {
    if (!p?.userId) return;
    const ok = await confirm({ title: t("w.social.report"), message: t("w.social.reportConfirm").replace("{h}", handle), confirmLabel: t("w.social.report"), destructive: true });
    if (!ok) return;
    await reportTarget({ targetType: "socialProfile", targetId: p.userId, reason: "inappropriate" });
    void notify(t("w.social.reportThanks"));
  };

  return (
    <Sheet visible onClose={onClose}>
          <>
            {!data || !p ? <ActivityIndicator color={C.lime} /> : (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
                  <Avatar url={p.avatarUrl} name={p.displayName} handle={p.handle} size={64} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "800", fontSize: 20 }}>{p.displayName || `@${p.handle}`} {p.coachVerified ? <Text style={{ color: txt(C, C.lime) }}>✓</Text> : null}</Text>
                    <Text style={{ color: C.ash, fontFamily: F.mono, fontSize: 13 }}>@{p.handle}</Text>
                  </View>
                </View>
                {p.bio ? <Text style={{ color: C.chalk, fontSize: 14, lineHeight: 21, marginTop: 12 }}>{p.bio}</Text> : null}
                <View style={{ flexDirection: "row", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                  {rel !== "self" && (rel === "requested"
                    ? <SButton label={t("w.social.requested")} ghost small disabled />
                    : following
                      ? <SButton label={rel === "friend" || rel === "close" ? `${t("w.social.friends")} ✓` : t("w.social.following")} ghost small onPress={async () => { await unfollow({ handle }); load(); }} />
                      : <SButton label={rel === "follower" ? t("w.social.followBack") : t("w.social.follow")} small onPress={async () => { await follow({ handle }); load(); }} />)}
                  {data?.canViewResults && rel !== "self" && <SButton label={t("w.social.compare")} ghost small onPress={async () => { const r = await getCompare(handle); setCmp(r.compare ?? null); }} />}
                </View>
                {data?.canViewResults ? (
                  data?.stats && (
                    <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                      {[{ l: t("w.social.statSessions"), v: data.stats.totalSessions }, { l: t("w.social.statVolume"), v: `${Math.round(data.stats.totalVolumeKg / 1000)}t` }, { l: t("w.social.statStreak"), v: `${data.stats.currentStreak}d` }].map((s) => (
                        <View key={s.l} style={{ flex: 1, backgroundColor: C.ink2, borderRadius: 12, padding: 12, alignItems: "center" }}>
                          <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "800", fontSize: 18 }}>{s.v}</Text>
                          <Text style={{ color: C.ash, fontSize: 11 }}>{s.l}</Text>
                        </View>
                      ))}
                    </View>
                  )
                ) : (
                  <View style={{ marginTop: 16, backgroundColor: C.ink2, borderRadius: 12, padding: 16 }}>
                    <Text style={{ color: C.ash, fontSize: 13 }}>🔒 {t("w.social.privateResults")} {rel === "requested" ? t("w.social.followPending") : t("w.social.followToSee")}</Text>
                  </View>
                )}
                {rel !== "self" && (
                  <View style={{ flexDirection: "row", gap: 16, marginTop: 16, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 16 }}>
                    <Pressable onPress={doReport}><Text style={{ color: C.ash, fontSize: 12, fontFamily: F.bold }}>⚐ {t("w.social.report")}</Text></Pressable>
                    <Pressable onPress={doBlock}><Text style={{ color: txt(C, C.red), fontSize: 12, fontFamily: F.bold }}>⊘ {t("w.social.block")}</Text></Pressable>
                  </View>
                )}
                {cmp && (
                  <View style={{ marginTop: 16 }}>
                    <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "700", marginBottom: 8 }}>{t("w.social.you")} {cmp.score.a} — {cmp.score.b} {p.displayName || "@" + p.handle}</Text>
                    {[...cmp.lines, ...cmp.sharedLifts.map((s: SharedLift) => ({ ...s, label: s.lift, unit: "kg" }))].map((l, i: number) => (
                      <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.line }}>
                        <Text style={{ flex: 1, textAlign: "right", fontFamily: F.mono, color: l.leader === "a" ? C.lime : C.chalk }}>{l.a}{l.unit}</Text>
                        <Text style={{ width: 120, textAlign: "center", color: C.ash, fontSize: 11 }}>{l.label}</Text>
                        <Text style={{ flex: 1, fontFamily: F.mono, color: l.leader === "b" ? C.lime : C.chalk }}>{l.b}{l.unit}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
          </>
    </Sheet>
  );
}
