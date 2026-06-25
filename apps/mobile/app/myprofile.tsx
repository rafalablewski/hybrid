import { useEffect, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { normalizeHandle, isValidHandle } from "@hybrid/core";
import { Screen, Card, Loading, F } from "../lib/ui";
import { useTheme } from "../lib/theme";
import { getMyProfile, putMyProfile, getConnections, respondFollow, setCloseFriend, follow } from "../lib/social-api";
import { Avatar, Empty, ProfileModal, SButton, SPill } from "../components/social-kit";

export default function MyProfileScreen() {
  const C = useTheme().palette;
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [conns, setConns] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({ handle: "", displayName: "", bio: "", visibility: "followers" });
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"friends" | "following" | "followers" | "requests">("friends");
  const [drawer, setDrawer] = useState<string | null>(null);

  const load = async () => {
    const d: any = await getMyProfile();
    setData(d);
    if (d.profile) setForm({ handle: d.profile.handle, displayName: d.profile.displayName ?? "", bio: d.profile.bio ?? "", visibility: d.profile.visibility });
    else setForm((f: any) => ({ ...f, handle: d.suggestedHandle ?? "" }));
    setConns(await getConnections());
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setErr(null);
    const h = normalizeHandle(form.handle);
    if (!isValidHandle(h)) { setErr("Handle must be 3–20 chars: a–z, 0–9, _"); return; }
    const r: any = await putMyProfile({ ...form, handle: h });
    if (r.error) { setErr(r.error); return; }
    setEditing(false); load();
  };

  if (!data) return <Screen><Loading /></Screen>;
  const claimed = !!data.profile;
  const p = data.profile;
  const showForm = !claimed || editing;
  const inp = { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2, color: C.chalk, fontSize: 14 } as const;
  const connList: any[] = conns ? (tab === "friends" ? conns.friends : tab === "following" ? conns.following : tab === "followers" ? conns.followers : conns.requests) ?? [] : [];

  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 14, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}><Text style={{ color: C.chalk, fontSize: 18 }}>‹</Text></Pressable>
        <View style={{ flex: 1 }}><Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "800", fontSize: 24 }}>My profile</Text><Text style={{ color: C.ash, fontSize: 13 }}>Your @handle, privacy and circle.</Text></View>
        {claimed && !editing && <SButton label="Edit" ghost small onPress={() => setEditing(true)} />}
      </View>

      {showForm ? (
        <Card>
          {!claimed && <Text style={{ color: C.ash, fontSize: 13, marginBottom: 10 }}>Claim a handle so friends can find and follow you.</Text>}
          <Text style={{ color: C.ash, fontSize: 12, marginBottom: 4 }}>Handle</Text>
          <TextInput value={form.handle} onChangeText={(v) => setForm({ ...form, handle: v })} placeholder="handle" placeholderTextColor={C.ash} autoCapitalize="none" style={{ ...inp, marginBottom: 12 }} />
          <Text style={{ color: C.ash, fontSize: 12, marginBottom: 4 }}>Display name</Text>
          <TextInput value={form.displayName} onChangeText={(v) => setForm({ ...form, displayName: v })} placeholder="Optional" placeholderTextColor={C.ash} style={{ ...inp, marginBottom: 12 }} />
          <Text style={{ color: C.ash, fontSize: 12, marginBottom: 4 }}>Bio</Text>
          <TextInput value={form.bio} onChangeText={(v) => setForm({ ...form, bio: v })} multiline placeholder="Hybrid athlete · runner · lifter…" placeholderTextColor={C.ash} style={{ ...inp, minHeight: 64, marginBottom: 12 }} />
          <Text style={{ color: C.ash, fontSize: 12, marginBottom: 6 }}>Who can see your results</Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
            {(["public", "followers", "private"] as const).map((v) => <SPill key={v} label={v[0]!.toUpperCase() + v.slice(1)} active={form.visibility === v} onPress={() => setForm({ ...form, visibility: v })} />)}
          </View>
          {err && <Text style={{ color: C.red, fontSize: 13, marginBottom: 8 }}>{err}</Text>}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <SButton label={claimed ? "Save" : "Claim handle"} onPress={save} />
            {claimed && <SButton label="Cancel" ghost onPress={() => { setEditing(false); setErr(null); }} />}
          </View>
        </Card>
      ) : (
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <Avatar url={p.avatarUrl} name={p.displayName} handle={p.handle} size={64} />
            <View>
              <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "800", fontSize: 20 }}>{p.displayName || `@${p.handle}`}</Text>
              <Text style={{ color: C.ash, fontFamily: F.mono, fontSize: 13 }}>@{p.handle}</Text>
              <Text style={{ color: C.ash, fontSize: 12, marginTop: 2, textTransform: "capitalize" }}>🔒 {p.visibility}</Text>
            </View>
          </View>
          {p.bio ? <Text style={{ color: C.chalk, fontSize: 14, lineHeight: 21, marginTop: 12 }}>{p.bio}</Text> : null}
          {data.stats && (
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              {[{ l: "Sessions", v: data.stats.totalSessions }, { l: "Volume", v: `${Math.round(data.stats.totalVolumeKg / 1000)}t` }, { l: "Streak", v: `${data.stats.currentStreak}d` }].map((s) => (
                <View key={s.l} style={{ flex: 1, backgroundColor: C.ink2, borderRadius: 12, padding: 12, alignItems: "center" }}>
                  <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "800", fontSize: 18 }}>{s.v}</Text>
                  <Text style={{ color: C.ash, fontSize: 11 }}>{s.l}</Text>
                </View>
              ))}
            </View>
          )}
        </Card>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 18, paddingBottom: 12 }}>
        {(["friends", "following", "followers", "requests"] as const).map((tb) => (
          <SPill key={tb} label={tb[0]!.toUpperCase() + tb.slice(1)} active={tab === tb} onPress={() => setTab(tb)} count={conns ? (conns[tb]?.length || undefined) : undefined} />
        ))}
      </ScrollView>
      <Card>
        {connList.length === 0 ? <Empty title={tab === "requests" ? "No pending requests" : `No ${tab} yet`} /> : connList.map((u: any) => (
          <View key={u.id || u.followerId} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
            <Pressable onPress={() => u.handle && setDrawer(u.handle)} style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
              <Avatar url={u.avatarUrl} name={u.displayName} handle={u.handle} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "600" }}>{u.displayName || `@${u.handle}`}</Text>
                <Text style={{ color: C.ash, fontSize: 12, fontFamily: F.mono }}>@{u.handle}{u.friend ? " · friend" : u.closeFriend ? " · close" : ""}</Text>
              </View>
            </Pressable>
            {tab === "requests" ? (
              <View style={{ flexDirection: "row", gap: 6 }}>
                <SButton label="Accept" small onPress={async () => { await respondFollow({ followerId: u.followerId, action: "approve" }); load(); }} />
                <SButton label="Deny" ghost small onPress={async () => { await respondFollow({ followerId: u.followerId, action: "deny" }); load(); }} />
              </View>
            ) : tab === "following" ? (
              <SButton label={u.closeFriend ? "★ Close" : "☆ Close"} ghost small tone={u.closeFriend ? C.amber : C.lime} onPress={async () => { await setCloseFriend({ followeeId: u.id, close: !u.closeFriend }); load(); }} />
            ) : tab === "followers" && !u.friend ? (
              <SButton label="Follow back" small onPress={async () => { await follow({ followeeId: u.id }); load(); }} />
            ) : null}
          </View>
        ))}
      </Card>

      {drawer && <ProfileModal handle={drawer} onClose={() => { setDrawer(null); load(); }} />}
    </Screen>
  );
}
