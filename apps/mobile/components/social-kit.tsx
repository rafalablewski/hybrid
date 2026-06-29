import { useEffect, useState, type ReactNode } from "react";
import { View, Text, Pressable, Image, Modal, ScrollView, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "../lib/theme";
import { F } from "../lib/ui";
import { getProfile, follow, unfollow, getCompare, blockUser, reportTarget } from "../lib/social-api";

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
  if (rating == null) return <Text style={{ color: C.ash, fontSize: size }}>No reviews</Text>;
  const full = Math.round(rating);
  return (
    <Text style={{ fontSize: size }}>
      <Text style={{ color: C.amber }}>{"★".repeat(full)}</Text>
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
      <Text style={{ color: ghost ? C.chalk : C.ink, fontFamily: F.bold, fontWeight: "700", fontSize: small ? 12 : 13 }}>{label}</Text>
    </Pressable>
  );
}

export function SPill({ label, active, onPress, count }: { label: string; active?: boolean; onPress?: () => void; count?: number }) {
  const C = useTheme().palette;
  return (
    <Pressable onPress={onPress} style={{ paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: active ? C.lime : C.line, backgroundColor: active ? C.lime : "transparent" }}>
      <Text style={{ color: active ? C.ink : C.chalk, fontFamily: F.bold, fontWeight: "600", fontSize: 13 }}>{label}{count ? ` ${count}` : ""}</Text>
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
  const C = useTheme().palette;
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [cmp, setCmp] = useState<any>(null);
  const load = () => getProfile(handle).then(setData);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [handle]);
  const p = data?.profile;
  const rel: string = data?.relation ?? "none";
  const following = rel === "following" || rel === "friend" || rel === "close";

  const doBlock = () => Alert.alert("Block", `Block @${handle}? You'll disappear from each other's feeds, search and leaderboards.`, [
    { text: "Cancel", style: "cancel" },
    { text: "Block", style: "destructive", onPress: async () => { await blockUser({ handle }); onClose(); } },
  ]);
  const doReport = () => { if (!p?.userId) return; Alert.alert("Report", `Report @${handle} to the moderators?`, [
    { text: "Cancel", style: "cancel" },
    { text: "Report", style: "destructive", onPress: async () => { await reportTarget({ targetType: "socialProfile", targetId: p.userId, reason: "inappropriate" }); Alert.alert("Thanks", "Reported to the moderators."); } },
  ]); };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,.6)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: C.ink, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "88%", borderWidth: 1, borderColor: C.line }}>
          <Pressable onPress={onClose} style={{ alignSelf: "flex-end", padding: 16 }}><Text style={{ color: C.ash, fontSize: 22 }}>×</Text></Pressable>
          <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 0 }}>
            {!p ? <ActivityIndicator color={C.lime} /> : (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                  <Avatar url={p.avatarUrl} name={p.displayName} handle={p.handle} size={64} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "800", fontSize: 20 }}>{p.displayName || `@${p.handle}`} {p.coachVerified ? <Text style={{ color: C.lime }}>✓</Text> : null}</Text>
                    <Text style={{ color: C.ash, fontFamily: F.mono, fontSize: 13 }}>@{p.handle}</Text>
                  </View>
                </View>
                {p.bio ? <Text style={{ color: C.chalk, fontSize: 14, lineHeight: 21, marginTop: 12 }}>{p.bio}</Text> : null}
                <View style={{ flexDirection: "row", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                  {rel !== "self" && (rel === "requested"
                    ? <SButton label="Requested" ghost small disabled />
                    : following
                      ? <SButton label={rel === "friend" || rel === "close" ? "Friends ✓" : "Following"} ghost small onPress={async () => { await unfollow({ handle }); load(); }} />
                      : <SButton label={rel === "follower" ? "Follow back" : "Follow"} small onPress={async () => { await follow({ handle }); load(); }} />)}
                  {data?.canViewResults && rel !== "self" && <SButton label="Compare" ghost small onPress={async () => { const r: any = await getCompare(handle); setCmp(r.compare ?? null); }} />}
                  {p.isCoach && <SButton label="View coaching →" ghost small onPress={() => { onClose(); router.push("/coaches"); }} />}
                </View>
                {data?.canViewResults ? (
                  data?.stats && (
                    <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
                      {[{ l: "Sessions", v: data.stats.totalSessions }, { l: "Volume", v: `${Math.round(data.stats.totalVolumeKg / 1000)}t` }, { l: "Streak", v: `${data.stats.currentStreak}d` }].map((s) => (
                        <View key={s.l} style={{ flex: 1, backgroundColor: C.ink2, borderRadius: 12, padding: 12, alignItems: "center" }}>
                          <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "800", fontSize: 18 }}>{s.v}</Text>
                          <Text style={{ color: C.ash, fontSize: 11 }}>{s.l}</Text>
                        </View>
                      ))}
                    </View>
                  )
                ) : (
                  <View style={{ marginTop: 14, backgroundColor: C.ink2, borderRadius: 12, padding: 14 }}>
                    <Text style={{ color: C.ash, fontSize: 13 }}>🔒 Their results are private. {rel === "requested" ? "Request pending." : "Follow to see their training."}</Text>
                  </View>
                )}
                {data?.canViewResults && data?.stats?.topLifts?.length > 0 && (
                  <View style={{ marginTop: 14 }}>
                    <Text style={{ color: C.ash, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Top lifts</Text>
                    {data.stats.topLifts.map((l: any) => (
                      <View key={l.lift} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.line }}>
                        <Text style={{ color: C.chalk, fontSize: 14 }}>{l.lift}</Text>
                        <Text style={{ color: C.lime, fontFamily: F.mono, fontSize: 14 }}>{l.e1rm} kg</Text>
                      </View>
                    ))}
                  </View>
                )}
                {rel !== "self" && (
                  <View style={{ flexDirection: "row", gap: 18, marginTop: 18, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 14 }}>
                    <Pressable onPress={doReport}><Text style={{ color: C.ash, fontSize: 12, fontFamily: F.bold }}>⚐ Report</Text></Pressable>
                    <Pressable onPress={doBlock}><Text style={{ color: C.red, fontSize: 12, fontFamily: F.bold }}>⊘ Block</Text></Pressable>
                  </View>
                )}
                {cmp && (
                  <View style={{ marginTop: 18 }}>
                    <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "700", marginBottom: 8 }}>You {cmp.score.a} — {cmp.score.b} {p.displayName || "@" + p.handle}</Text>
                    {[...cmp.lines, ...cmp.sharedLifts.map((s: any) => ({ ...s, label: s.lift, unit: "kg" }))].map((l: any, i: number) => (
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
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
