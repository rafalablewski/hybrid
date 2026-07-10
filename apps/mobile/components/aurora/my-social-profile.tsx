import { useEffect, useState } from "react";
import { View, Text, TextInput, Image, Pressable, AccessibilityInfo } from "react-native";
import { normalizeHandle, isValidHandle, AVATAR_PRESETS } from "@hybrid/core";
import { Card, Loading, F, fs } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { getMyProfile, putMyProfile, getProfile } from "../../lib/social-api";
import { useAccountSettings } from "../../lib/account";
import { SButton, SPill } from "../social-kit";

// The unified EDIT PROFILE screen (Instagram-style): a live preview + the avatar
// (with branded presets) on top, then a tap-a-row list. Tapping a row opens a
// FOCUSED single-field editor with its own validation. One surface for the
// public profile (handle/name/bio/visibility, via the social API) AND the
// account identity (name/email, via Supabase auth).

type FieldKey = "name" | "handle" | "displayName" | "bio" | "email" | "visibility";

const inpStyle = (C: any) => ({ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2, color: C.chalk, fontSize: 15 } as const);

export function MySocialProfileEdit({ onDone }: { onDone?: () => void }) {
  const C = useTheme().palette;
  const acct = useAccountSettings();
  const [data, setData] = useState<any>(null);
  const [form, setForm] = useState<any>({ handle: "", displayName: "", bio: "", visibility: "followers", avatarUrl: "" });
  const [err, setErr] = useState<string | null>(null);
  const [avail, setAvail] = useState<null | "checking" | "ok" | "taken">(null);
  const [editing, setEditing] = useState<FieldKey | null>(null);

  const load = async () => {
    const d: any = await getMyProfile();
    setData(d);
    if (d.profile) setForm({ handle: d.profile.handle, displayName: d.profile.displayName ?? "", bio: d.profile.bio ?? "", visibility: d.profile.visibility, avatarUrl: d.profile.avatarUrl ?? "" });
    else setForm((f: any) => ({ ...f, handle: d.suggestedHandle ?? "" }));
  };
  useEffect(() => { load(); }, []);

  // Live handle availability — debounced (format instant, 404 = free).
  useEffect(() => {
    const h = normalizeHandle(form.handle);
    if (!h || !isValidHandle(h)) { setAvail(null); return; }
    if (data?.profile && h === data.profile.handle) { setAvail("ok"); return; }
    setAvail("checking");
    const id = setTimeout(async () => {
      const r: any = await getProfile(h);
      setAvail(r?.profile ? "taken" : "ok");
    }, 450);
    return () => clearTimeout(id);
  }, [form.handle, data]);

  // Persist the public profile (all social fields at once). Returns success so
  // the focused editor can close only when the save actually went through.
  const saveSocial = async (): Promise<boolean> => {
    setErr(null);
    const h = normalizeHandle(form.handle);
    if (!isValidHandle(h)) { setErr("Handle must be 3–20 chars: a–z, 0–9, _"); AccessibilityInfo.announceForAccessibility("Invalid handle"); return false; }
    const r: any = await putMyProfile({ ...form, handle: h });
    if (r.error) { setErr(r.error); AccessibilityInfo.announceForAccessibility(r.error); return false; }
    return true;
  };

  if (!data) return <Loading />;
  const claimed = !!data.profile;
  const inp = inpStyle(C);
  const initials = (acct.name || form.displayName || form.handle || "?").slice(0, 1).toUpperCase();
  const hNorm = normalizeHandle(form.handle);
  const fmtValid = isValidHandle(hNorm);
  const isMine = !!data?.profile && hNorm === data.profile.handle;
  const bioLen = (form.bio ?? "").length;
  const visLabel = form.visibility === "public" ? "Public" : form.visibility === "private" ? "Private" : "Followers";
  const feedbackColor = (!fmtValid || avail === "taken" ? C.red : avail === "checking" ? C.ash : txt(C, C.lime)) as string;
  const lime = txt(C, C.lime) as string;

  // ── FOCUSED FIELD EDITOR ──────────────────────────────────────────────────
  if (editing) {
    const back = () => { setErr(null); setEditing(null); };
    const titles: Record<FieldKey, string> = { name: "Your name", handle: "Username", displayName: "Display name", bio: "Bio", email: "Email", visibility: "Who can see your results" };
    return (
      <Card>
        <Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 14 }}>
          <Text style={{ color: C.chalk, fontSize: 20 }}>‹</Text>
          <Text style={{ fontFamily: F.bold, fontSize: fs.title, color: C.chalk }}>{titles[editing]}</Text>
        </Pressable>

        {editing === "name" && (<>
          <TextInput value={acct.name} onChangeText={acct.setName} placeholder="Your name" placeholderTextColor={C.ash} style={inp} autoFocus />
          <SButton label={acct.busy ? "Saving…" : "Save"} onPress={() => { acct.saveName(); back(); }} />
        </>)}

        {editing === "email" && (<>
          <TextInput value={acct.newEmail} onChangeText={acct.setNewEmail} placeholder={acct.email ?? "new@email.com"} placeholderTextColor={C.ash} autoCapitalize="none" keyboardType="email-address" style={inp} autoFocus />
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 8, marginBottom: 2 }}>We’ll email the new address to confirm the change.</Text>
          <SButton label="Update email" onPress={() => { acct.changeEmail(); back(); }} />
        </>)}

        {editing === "handle" && (<>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ color: C.ash, fontFamily: F.mono, fontSize: 15 }}>@</Text>
            <TextInput value={form.handle} onChangeText={(v) => setForm({ ...form, handle: v })} placeholder="handle" placeholderTextColor={C.ash} autoCapitalize="none" autoFocus style={{ ...inp, flex: 1 }} />
          </View>
          {form.handle.length > 0 && (
            <Text style={{ fontFamily: F.mono, fontSize: 12, color: feedbackColor, marginTop: 8 }}>
              {!fmtValid ? "✕ 3–20 chars: a–z, 0–9, _" : avail === "taken" ? `✕ @${hNorm} is taken` : avail === "checking" ? "Checking availability…" : `✓ ${isMine ? "This is your handle" : "@" + hNorm + " is available"}`}
            </Text>
          )}
          {err && <Text accessibilityRole="alert" style={{ color: C.red, fontSize: 13, marginTop: 8 }}>{err}</Text>}
          <SButton label={claimed ? "Save" : "Claim handle"} onPress={async () => { if (await saveSocial()) back(); }} />
        </>)}

        {editing === "displayName" && (<>
          <TextInput value={form.displayName} onChangeText={(v) => setForm({ ...form, displayName: v })} placeholder="Optional" placeholderTextColor={C.ash} autoFocus style={inp} />
          {err && <Text accessibilityRole="alert" style={{ color: C.red, fontSize: 13, marginTop: 8 }}>{err}</Text>}
          <SButton label="Save" onPress={async () => { if (await saveSocial()) back(); }} />
        </>)}

        {editing === "bio" && (<>
          <TextInput value={form.bio} onChangeText={(v) => setForm({ ...form, bio: v })} multiline maxLength={280} placeholder="Hybrid athlete · runner · lifter…" placeholderTextColor={C.ash} autoFocus style={{ ...inp, minHeight: 96, textAlignVertical: "top" }} />
          <Text style={{ fontFamily: F.mono, fontSize: 10, color: bioLen >= 280 ? C.red : C.ash, textAlign: "right", marginTop: 6 }}>{bioLen}/280</Text>
          {err && <Text accessibilityRole="alert" style={{ color: C.red, fontSize: 13, marginTop: 4 }}>{err}</Text>}
          <SButton label="Save" onPress={async () => { if (await saveSocial()) back(); }} />
        </>)}

        {editing === "visibility" && (<>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
            {(["public", "followers", "private"] as const).map((v) => <SPill key={v} label={v[0]!.toUpperCase() + v.slice(1)} active={form.visibility === v} onPress={() => setForm({ ...form, visibility: v })} />)}
          </View>
          {err && <Text accessibilityRole="alert" style={{ color: C.red, fontSize: 13, marginTop: 4 }}>{err}</Text>}
          <SButton label="Save" onPress={async () => { if (await saveSocial()) back(); }} />
        </>)}
      </Card>
    );
  }

  // ── LIST (preview + avatar + tappable rows) ───────────────────────────────
  const rows: { key: FieldKey; label: string; value: string; muted: boolean }[] = [
    { key: "name", label: "Name", value: acct.name || "Add your name", muted: !acct.name },
    { key: "handle", label: "Username", value: form.handle ? `@${form.handle}` : "Claim a handle", muted: !form.handle },
    { key: "displayName", label: "Display name", value: form.displayName || "Optional", muted: !form.displayName },
    { key: "bio", label: "Bio", value: form.bio || "Add a bio", muted: !form.bio },
    { key: "email", label: "Email", value: acct.email || "Add an email", muted: !acct.email },
    { key: "visibility", label: "Visibility", value: visLabel, muted: false },
  ];

  return (
    <>
      {/* Live "what followers see" preview. */}
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, overflow: "hidden", backgroundColor: C.ink2, alignItems: "center", justifyContent: "center" }}>
            {form.avatarUrl ? <Image source={{ uri: form.avatarUrl }} style={{ width: "100%", height: "100%" }} /> : <Text style={{ fontFamily: F.black, fontSize: 18, color: lime }}>{initials}</Text>}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 16, color: C.chalk }}>{form.displayName || form.handle || "Your name"}</Text>
            <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: 12, color: lime }}>@{form.handle || "handle"}</Text>
          </View>
          <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: 0.5, color: C.ash }}>{visLabel}</Text>
          </View>
        </View>
        {form.bio ? <Text style={{ fontSize: 13, color: C.chalk, marginTop: 10, lineHeight: 19 }}>{form.bio}</Text> : null}
      </Card>

      {/* Avatar — preview + one-tap branded gradient presets (photo upload soon). */}
      <Card style={{ marginTop: 14 }}>
        <View style={{ alignItems: "center", gap: 8 }}>
          <View style={{ width: 92, height: 92, borderRadius: 46, backgroundColor: lime, alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: 86, height: 86, borderRadius: 43, borderWidth: 3, borderColor: C.ink, backgroundColor: C.ink2, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
              {form.avatarUrl ? <Image source={{ uri: form.avatarUrl }} style={{ width: "100%", height: "100%" }} /> : <Text style={{ fontFamily: F.black, fontSize: 34, color: lime }}>{initials}</Text>}
            </View>
          </View>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1, color: C.ash }}>Pick a preset</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
            {AVATAR_PRESETS.map((p) => {
              const on = form.avatarUrl === p.uri;
              return (
                <Pressable key={p.id} onPress={async () => { setForm({ ...form, avatarUrl: p.uri }); }} accessibilityRole="button" accessibilityLabel={`Preset ${p.id}`} style={{ width: 44, height: 44, borderRadius: 22, padding: on ? 2 : 0, borderWidth: 2, borderColor: on ? lime : "transparent" }}>
                  <Image source={{ uri: p.uri }} style={{ width: "100%", height: "100%", borderRadius: 22 }} />
                </Pressable>
              );
            })}
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 2 }}>
            {form.avatarUrl ? <SButton label="Save photo" small onPress={saveSocial} /> : null}
            <Pressable disabled accessibilityRole="button" style={{ opacity: 0.55, borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 16 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>Upload photo (soon)</Text>
            </Pressable>
          </View>
        </View>
      </Card>

      {/* Tap-a-row list. */}
      <Card style={{ marginTop: 14 }}>
        {rows.map((row, i) => (
          <Pressable key={row.key} onPress={() => setEditing(row.key)} accessibilityRole="button" accessibilityLabel={row.label} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: C.line }}>
            <Text style={{ width: 92, color: C.ash, fontSize: 13 }}>{row.label}</Text>
            <Text numberOfLines={1} style={{ flex: 1, color: row.muted ? C.ash : C.chalk, fontSize: 14 }}>{row.value}</Text>
            <Text style={{ color: C.ash, fontSize: 18 }}>›</Text>
          </Pressable>
        ))}
      </Card>

      {onDone && (
        <View style={{ marginTop: 14 }}>
          <SButton label="Done" onPress={onDone} />
        </View>
      )}
      {!!acct.profileMsg && <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: acct.profileMsg.startsWith("✓") ? lime : C.ash, marginTop: 10, textAlign: "center" }}>{acct.profileMsg}</Text>}
    </>
  );
}
