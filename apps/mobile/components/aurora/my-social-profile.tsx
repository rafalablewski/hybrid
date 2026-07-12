import { useEffect, useState, type ReactNode } from "react";
import { View, Text, TextInput, Image, Pressable, AccessibilityInfo } from "react-native";
import { normalizeHandle, isValidHandle, AVATAR_PRESETS } from "@hybrid/core";
import { Card, Loading, F, fs } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { getMyProfile, putMyProfile, getProfile } from "../../lib/social-api";
import { useAccountSettings } from "../../lib/account";
import { SButton, SPill } from "../social-kit";
import { ABack } from "./kit";

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
    let active = true; // ignore a stale response if the handle changed meanwhile
    const id = setTimeout(async () => {
      const r: any = await getProfile(h);
      if (active) setAvail(r?.profile ? "taken" : "ok");
    }, 450);
    return () => { active = false; clearTimeout(id); };
  }, [form.handle, data]);

  // Persist the public profile (all social fields at once). An optional override
  // lets inline controls (visibility segment, preset save) persist their new
  // value without waiting for the async setForm to flush. Returns success so the
  // focused editor can close only when the save actually went through.
  const saveSocial = async (override?: Partial<typeof form>): Promise<boolean> => {
    setErr(null);
    const next = { ...form, ...override };
    const h = normalizeHandle(next.handle);
    if (!isValidHandle(h)) { setErr("Handle must be 3–20 chars: a–z, 0–9, _"); AccessibilityInfo.announceForAccessibility("Invalid handle"); return false; }
    const r: any = await putMyProfile({ ...next, handle: h });
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
  const feedbackColor = (!fmtValid || avail === "taken" ? C.red : avail === "checking" ? C.ash : txt(C, C.lime)) as string;
  const lime = txt(C, C.lime) as string;

  // ── FOCUSED FIELD EDITOR ──────────────────────────────────────────────────
  if (editing) {
    const back = () => { setErr(null); setEditing(null); };
    const titles: Record<FieldKey, string> = { name: "Your name", handle: "Username", displayName: "Display name", bio: "Bio", email: "Email", visibility: "Who can see your results" };
    return (
      <Card>
        {/* Boxed ABack — the same back affordance the rest of the app uses, so the
            focused editor no longer shows a lone ‹ chevron. */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <ABack onPress={back} />
          <Text style={{ fontFamily: F.bold, fontSize: fs.title, color: C.chalk }}>{titles[editing]}</Text>
        </View>

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
          {err && <Text accessibilityRole="alert" style={{ color: txt(C, C.red), fontSize: 13, marginTop: 8 }}>{err}</Text>}
          <SButton label={claimed ? "Save" : "Claim handle"} onPress={async () => { if (await saveSocial()) back(); }} />
        </>)}

        {editing === "displayName" && (<>
          <TextInput value={form.displayName} onChangeText={(v) => setForm({ ...form, displayName: v })} placeholder="Optional" placeholderTextColor={C.ash} autoFocus style={inp} />
          {err && <Text accessibilityRole="alert" style={{ color: txt(C, C.red), fontSize: 13, marginTop: 8 }}>{err}</Text>}
          <SButton label="Save" onPress={async () => { if (await saveSocial()) back(); }} />
        </>)}

        {editing === "bio" && (<>
          <TextInput value={form.bio} onChangeText={(v) => setForm({ ...form, bio: v })} multiline maxLength={280} placeholder="Hybrid athlete – runner – lifter…" placeholderTextColor={C.ash} autoFocus style={{ ...inp, minHeight: 96, textAlignVertical: "top" }} />
          <Text style={{ fontFamily: F.mono, fontSize: 10, color: bioLen >= 280 ? C.red : C.ash, textAlign: "right", marginTop: 6 }}>{bioLen}/280</Text>
          {err && <Text accessibilityRole="alert" style={{ color: txt(C, C.red), fontSize: 13, marginTop: 4 }}>{err}</Text>}
          <SButton label="Save" onPress={async () => { if (await saveSocial()) back(); }} />
        </>)}

        {editing === "visibility" && (<>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
            {(["public", "followers", "private"] as const).map((v) => <SPill key={v} label={v[0]!.toUpperCase() + v.slice(1)} active={form.visibility === v} onPress={() => setForm({ ...form, visibility: v })} />)}
          </View>
          {err && <Text accessibilityRole="alert" style={{ color: txt(C, C.red), fontSize: 13, marginTop: 4 }}>{err}</Text>}
          <SButton label="Save" onPress={async () => { if (await saveSocial()) back(); }} />
        </>)}
      </Card>
    );
  }

  // ── SECTIONED editor ──────────────────────────────────────────────────────
  // Every part of the screen lives in a labelled section (Photo · Identity ·
  // Contact · Visibility) — the app-wide settings pattern. Text fields still
  // open the focused editor; Visibility is an inline segment that saves on tap.
  const pickVisibility = (v: "public" | "followers" | "private") => {
    setForm({ ...form, visibility: v });
    if (claimed) void saveSocial({ visibility: v });
  };

  // A tappable field row → opens the focused editor. A plain render function
  // (not a <Component/>) so the rows aren't remounted on every parent render.
  const fieldRow = ({ rk, label, value, muted, first }: { rk: FieldKey; label: string; value: string; muted: boolean; first?: boolean }): ReactNode => (
    <Pressable key={rk} onPress={() => setEditing(rk)} accessibilityRole="button" accessibilityLabel={label} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderTopWidth: first ? 0 : 1, borderTopColor: C.line }}>
      <Text style={{ width: 96, color: C.ash, fontSize: 13 }}>{label}</Text>
      <Text numberOfLines={1} style={{ flex: 1, color: muted ? C.ash : C.chalk, fontSize: 14 }}>{value}</Text>
      <Text style={{ color: C.ash, fontSize: 18 }}>›</Text>
    </Pressable>
  );

  return (
    <>
      {/* ── PHOTO ── avatar + one-tap branded gradient presets (upload soon). */}
      <SectionLabel first>Photo</SectionLabel>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: lime, alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: 53, height: 53, borderRadius: 27, borderWidth: 2.5, borderColor: C.ink, backgroundColor: C.ink2, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
              {form.avatarUrl ? <Image source={{ uri: form.avatarUrl }} style={{ width: "100%", height: "100%" }} /> : <Text style={{ fontFamily: F.black, fontSize: 22, color: lime }}>{initials}</Text>}
            </View>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>Preset avatar</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
              {AVATAR_PRESETS.map((p) => {
                const on = form.avatarUrl === p.uri;
                return (
                  <Pressable key={p.id} onPress={() => setForm({ ...form, avatarUrl: p.uri })} accessibilityRole="button" accessibilityLabel={`Preset ${p.id}`} style={{ width: 30, height: 30, borderRadius: 15, padding: on ? 2 : 0, borderWidth: 2, borderColor: on ? lime : "transparent" }}>
                    <Image source={{ uri: p.uri }} style={{ width: "100%", height: "100%", borderRadius: 15 }} />
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 }}>
          {form.avatarUrl ? <SButton label="Save photo" small onPress={() => saveSocial()} /> : null}
          <Pressable disabled accessibilityRole="button" style={{ opacity: 0.55, borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 16 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>Upload photo (soon)</Text>
          </Pressable>
        </View>
      </Card>

      {/* ── IDENTITY ── name, handle, display name, bio. */}
      <SectionLabel>Identity</SectionLabel>
      <Card>
        {fieldRow({ rk: "name", label: "Name", value: acct.name || "Add your name", muted: !acct.name, first: true })}
        {fieldRow({ rk: "handle", label: "Username", value: form.handle ? `@${form.handle}` : "Claim a handle", muted: !form.handle })}
        {fieldRow({ rk: "displayName", label: "Display name", value: form.displayName || "Optional", muted: !form.displayName })}
        {fieldRow({ rk: "bio", label: "Bio", value: form.bio || "Add a bio", muted: !form.bio })}
      </Card>

      {/* ── CONTACT ── account email. */}
      <SectionLabel>Contact</SectionLabel>
      <Card>
        {fieldRow({ rk: "email", label: "Email", value: acct.email || "Add an email", muted: !acct.email, first: true })}
      </Card>

      {/* ── VISIBILITY ── inline segment, saves on tap. */}
      <SectionLabel>Visibility</SectionLabel>
      <Card>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(["public", "followers", "private"] as const).map((v) => (
            <SPill key={v} label={v[0]!.toUpperCase() + v.slice(1)} active={form.visibility === v} onPress={() => pickVisibility(v)} />
          ))}
        </View>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 10, lineHeight: 15 }}>Who can see your results and profile.</Text>
      </Card>

      {onDone && (
        <View style={{ marginTop: 18 }}>
          <SButton label="Done" onPress={onDone} />
        </View>
      )}
      {err && <Text accessibilityRole="alert" style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.red), marginTop: 10, textAlign: "center" }}>{err}</Text>}
      {!!acct.profileMsg && <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: acct.profileMsg.startsWith("✓") ? lime : C.ash, marginTop: 10, textAlign: "center" }}>{acct.profileMsg}</Text>}
    </>
  );
}

/** A labelled section header — the app-wide settings grouping treatment. */
function SectionLabel({ children, first }: { children: ReactNode; first?: boolean }) {
  const C = useTheme().palette;
  return (
    <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash, marginLeft: 4, marginBottom: 10, marginTop: first ? 0 : 18 }}>
      {children}
    </Text>
  );
}
