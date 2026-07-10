import { useEffect, useState } from "react";
import { View, Text, TextInput, Image, Pressable, AccessibilityInfo } from "react-native";
import { normalizeHandle, isValidHandle, AVATAR_PRESETS } from "@hybrid/core";
import { Card, Loading, F, fs } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { getMyProfile, putMyProfile } from "../../lib/social-api";
import { useAccountSettings } from "../../lib/account";
import { SButton, SPill } from "../social-kit";

// The unified EDIT PROFILE screen (Instagram-style, one surface): the public
// profile (avatar + branded presets, handle, display name, bio, visibility) on
// top, then the account identity (name, email). Reached from the profile-head
// pencil AND Settings → Edit profile — so there is ONE place to edit yourself.
// Save actions stay split by backend (social API vs Supabase auth).

const inpStyle = (C: any) => ({ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2, color: C.chalk, fontSize: 14 } as const);

function Label({ children, color }: { children: React.ReactNode; color: string }) {
  return <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color, marginBottom: 10 }}>{children}</Text>;
}

export function MySocialProfileEdit({ onDone }: { onDone?: () => void }) {
  const C = useTheme().palette;
  const acct = useAccountSettings();
  const [data, setData] = useState<any>(null);
  const [form, setForm] = useState<any>({ handle: "", displayName: "", bio: "", visibility: "followers", avatarUrl: "" });
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = async () => {
    const d: any = await getMyProfile();
    setData(d);
    if (d.profile) setForm({ handle: d.profile.handle, displayName: d.profile.displayName ?? "", bio: d.profile.bio ?? "", visibility: d.profile.visibility, avatarUrl: d.profile.avatarUrl ?? "" });
    else setForm((f: any) => ({ ...f, handle: d.suggestedHandle ?? "" }));
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setErr(null);
    const h = normalizeHandle(form.handle);
    if (!isValidHandle(h)) { setErr("Handle must be 3–20 chars: a–z, 0–9, _"); AccessibilityInfo.announceForAccessibility("Handle must be 3–20 chars: a–z, 0–9, _"); return; }
    const r: any = await putMyProfile({ ...form, handle: h });
    if (r.error) { setErr(r.error); AccessibilityInfo.announceForAccessibility(r.error); return; }
    if (onDone) onDone();
    else { setSaved(true); setTimeout(() => setSaved(false), 1500); }
  };

  if (!data) return <Loading />;
  const claimed = !!data.profile;
  const inp = inpStyle(C);
  const initials = (acct.name || form.displayName || form.handle || "?").slice(0, 1).toUpperCase();

  return (
    <>
      {/* Avatar — a real preview + one-tap branded gradient presets. A photo
          upload arrives with the avatars Storage bucket (social-avatar-upload). */}
      <Card>
        <View style={{ alignItems: "center", gap: 8 }}>
          <View style={{ width: 92, height: 92, borderRadius: 46, backgroundColor: txt(C, C.lime), alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: 86, height: 86, borderRadius: 43, borderWidth: 3, borderColor: C.ink, backgroundColor: C.ink2, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
              {form.avatarUrl ? <Image source={{ uri: form.avatarUrl }} style={{ width: "100%", height: "100%" }} /> : <Text style={{ fontFamily: F.black, fontSize: 34, color: txt(C, C.lime) }}>{initials}</Text>}
            </View>
          </View>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1, color: C.ash }}>Pick a preset</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
            {AVATAR_PRESETS.map((p) => {
              const on = form.avatarUrl === p.uri;
              return (
                <Pressable key={p.id} onPress={() => setForm({ ...form, avatarUrl: p.uri })} accessibilityRole="button" accessibilityLabel={`Preset ${p.id}`} style={{ width: 44, height: 44, borderRadius: 22, padding: on ? 2 : 0, borderWidth: 2, borderColor: on ? (txt(C, C.lime) as string) : "transparent" }}>
                  <Image source={{ uri: p.uri }} style={{ width: "100%", height: "100%", borderRadius: 22 }} />
                </Pressable>
              );
            })}
          </View>
          <Pressable disabled accessibilityRole="button" style={{ marginTop: 4, opacity: 0.55, borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 16 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>Upload photo (soon)</Text>
          </Pressable>
        </View>
      </Card>

      {/* Public profile */}
      <Card style={{ marginTop: 14 }}>
        <Label color={txt(C, C.lime) as string}>PUBLIC PROFILE</Label>
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
        {err && <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={{ color: C.red, fontSize: 13, marginBottom: 8 }}>{err}</Text>}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <SButton label={saved ? "Saved ✓" : claimed ? "Save" : "Claim handle"} onPress={save} />
          {onDone && <SButton label={claimed ? "Done" : "Back"} ghost onPress={onDone} />}
        </View>
      </Card>

      {/* Account identity */}
      <Card style={{ marginTop: 14 }}>
        <Label color={txt(C, C.lime) as string}>ACCOUNT</Label>
        <Text style={{ color: C.ash, fontSize: 12, marginBottom: 4 }}>Your name</Text>
        <TextInput value={acct.name} onChangeText={acct.setName} placeholder="Your name" placeholderTextColor={C.ash} style={{ ...inp, marginBottom: 10 }} />
        <SButton label={acct.busy ? "Saving…" : "Save name"} onPress={acct.saveName} />
        <Text style={{ color: C.ash, fontSize: 12, marginTop: 16, marginBottom: 4 }}>Email</Text>
        <TextInput value={acct.newEmail} onChangeText={acct.setNewEmail} placeholder={acct.email ?? "new@email.com"} placeholderTextColor={C.ash} autoCapitalize="none" keyboardType="email-address" style={{ ...inp, marginBottom: 10 }} />
        <SButton label="Update email" ghost onPress={acct.changeEmail} />
        {!!acct.profileMsg && <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: acct.profileMsg.startsWith("✓") ? (txt(C, C.lime) as string) : C.ash, marginTop: 10 }}>{acct.profileMsg}</Text>}
        {!acct.authOn && <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 10 }}>Sign in to edit your account details.</Text>}
      </Card>
    </>
  );
}
