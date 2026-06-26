import { useEffect, useState } from "react";
import { View, Text, TextInput, AccessibilityInfo } from "react-native";
import { normalizeHandle, isValidHandle } from "@hybrid/core";
import { Card, Loading } from "../../lib/ui";
import { useTheme } from "../../lib/theme";
import { getMyProfile, putMyProfile } from "../../lib/social-api";
import { SButton, SPill } from "../social-kit";

// The EDIT form for the user's PUBLIC social profile (handle/bio/photo/
// visibility) — lives in Settings + the dedicated profile-edit route. So there
// is ONE profile, edited in one place.

const inpStyle = (C: any) => ({ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2, color: C.chalk, fontSize: 14 } as const);

export function MySocialProfileEdit({ onDone }: { onDone?: () => void }) {
  const C = useTheme().palette;
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
  return (
    <Card>
      {!claimed && <Text style={{ color: C.ash, fontSize: 13, marginBottom: 10 }}>Claim a handle so friends can find and follow you.</Text>}
      <Text style={{ color: C.ash, fontSize: 12, marginBottom: 4 }}>Handle</Text>
      <TextInput value={form.handle} onChangeText={(v) => setForm({ ...form, handle: v })} placeholder="handle" placeholderTextColor={C.ash} autoCapitalize="none" style={{ ...inp, marginBottom: 12 }} />
      <Text style={{ color: C.ash, fontSize: 12, marginBottom: 4 }}>Display name</Text>
      <TextInput value={form.displayName} onChangeText={(v) => setForm({ ...form, displayName: v })} placeholder="Optional" placeholderTextColor={C.ash} style={{ ...inp, marginBottom: 12 }} />
      <Text style={{ color: C.ash, fontSize: 12, marginBottom: 4 }}>Bio</Text>
      <TextInput value={form.bio} onChangeText={(v) => setForm({ ...form, bio: v })} multiline placeholder="Hybrid athlete · runner · lifter…" placeholderTextColor={C.ash} style={{ ...inp, minHeight: 64, marginBottom: 12 }} />
      <Text style={{ color: C.ash, fontSize: 12, marginBottom: 4 }}>Avatar image URL</Text>
      <TextInput value={form.avatarUrl} onChangeText={(v) => setForm({ ...form, avatarUrl: v })} autoCapitalize="none" placeholder="https://…  (upload coming soon)" placeholderTextColor={C.ash} style={{ ...inp, marginBottom: 12 }} />
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
  );
}
