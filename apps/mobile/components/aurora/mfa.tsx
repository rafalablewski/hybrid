import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, TextInput, Linking } from "react-native";
import { isValidTotpCode } from "@hybrid/core";
import { supabase } from "../../lib/supabase";
import { useTheme, txt } from "../../lib/theme";
import { fs, space, F } from "../../lib/ui";
import { APill } from "./kit";

/**
 * Two-factor (TOTP) enrollment + management (mobile) — parity with
 * apps/web/components/account/mfa.tsx. Uses Supabase Auth's MFA API directly,
 * the same as web. NATIVE ADAPTATION: Supabase returns the QR as an SVG data
 * URI, which RN <Image> can't render — so instead we surface the manual secret
 * key and an "Add to authenticator app" deep-link (the otpauth:// URI), which
 * adds the account to the user's authenticator in one tap. The 6-digit confirm,
 * factor list and removal are identical to web.
 */

type Factor = { id: string; friendly_name?: string | null; status: string };
type Enroll = { factorId: string; secret: string; uri: string };

export default function MfaSettings() {
  const { palette: C } = useTheme();
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [enroll, setEnroll] = useState<Enroll | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) { setFactors([]); return; }
    setFactors((data?.all ?? []) as Factor[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const start = async () => {
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `authenticator-${Date.now()}` });
    setBusy(false);
    if (error || !data) { setMsg({ ok: false, text: error?.message ?? "Could not start enrollment. Is MFA enabled on the project?" }); return; }
    setEnroll({ factorId: data.id, secret: data.totp.secret, uri: data.totp.uri });
  };

  const confirm = async () => {
    if (!enroll || !isValidTotpCode(code)) { setMsg({ ok: false, text: "Enter the 6-digit code from your authenticator app." }); return; }
    setBusy(true); setMsg(null);
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: enroll.factorId });
    if (chErr || !ch) { setBusy(false); setMsg({ ok: false, text: chErr?.message ?? "Challenge failed." }); return; }
    const { error } = await supabase.auth.mfa.verify({ factorId: enroll.factorId, challengeId: ch.id, code: code.trim() });
    setBusy(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setEnroll(null); setCode("");
    setMsg({ ok: true, text: "Two-factor authentication is on. You'll be asked for a code next sign-in." });
    load();
  };

  const remove = async (id: string) => {
    setBusy(true); setMsg(null);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    setBusy(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setMsg({ ok: true, text: "Factor removed." });
    load();
  };

  const verified = (factors ?? []).filter((f) => f.status === "verified");

  return (
    <View style={{ borderLeftWidth: 3, borderLeftColor: verified.length ? C.lime : C.amber, paddingLeft: 12, marginTop: 6 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, verified.length ? C.lime : C.amber) }}>Two-factor authentication</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: 8 }}>
        <Text style={{ fontFamily: F.bold, fontSize: fs.title, color: C.chalk }}>Authenticator app (TOTP)</Text>
        <View style={{ backgroundColor: `${verified.length ? C.lime : C.ash}24`, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, verified.length ? C.lime : C.ash) }}>{verified.length ? "on" : "off"}</Text>
        </View>
      </View>
      <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.chalk, lineHeight: 18, marginTop: 6 }}>
        Adds a one-time code on sign-in — strongly recommended for admin accounts. Works with any authenticator (1Password, Authy, Google Authenticator).
      </Text>

      {verified.map((f) => (
        <View key={f.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.line, marginTop: 8 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk }}>{f.friendly_name || "Authenticator"}</Text>
          <Pressable onPress={() => remove(f.id)} disabled={busy} style={{ borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 12 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.red) }}>Remove</Text>
          </Pressable>
        </View>
      ))}

      {!enroll && (
        <View style={{ marginTop: 12 }}>
          <APill label={busy ? "…" : verified.length ? "Add another factor" : "Set up 2FA"} variant="soft" disabled={busy} onPress={start} style={{ paddingVertical: 13 }} />
        </View>
      )}

      {enroll && (
        <View style={{ marginTop: 14 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginBottom: 10, lineHeight: 17 }}>
            Add this to your authenticator app, then enter the 6-digit code to confirm.
          </Text>
          <APill label="Add to authenticator app" variant="primary" onPress={() => Linking.openURL(enroll.uri).catch(() => {})} style={{ paddingVertical: 13 }} />
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 10 }}>
            Or enter the key manually: <Text style={{ color: C.chalk }}>{enroll.secret}</Text>
          </Text>
          <View style={{ flexDirection: "row", gap: space.sm, marginTop: 12 }}>
            <TextInput
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
              keyboardType="number-pad"
              placeholder="000000"
              placeholderTextColor={C.ash}
              style={{ flex: 1, fontFamily: F.mono, fontSize: fs.subtitle, letterSpacing: 4, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11 }}
            />
            <Pressable onPress={confirm} disabled={busy || !isValidTotpCode(code)} style={{ backgroundColor: C.lime, borderRadius: 10, paddingHorizontal: 18, justifyContent: "center", opacity: busy || !isValidTotpCode(code) ? 0.5 : 1 }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.onAccent }}>Confirm</Text>
            </Pressable>
          </View>
          <Pressable onPress={() => { setEnroll(null); setCode(""); }} style={{ marginTop: 10, alignSelf: "flex-start" }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>Cancel</Text>
          </Pressable>
        </View>
      )}

      {msg && (
        <Text accessibilityLiveRegion="polite" style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, msg.ok ? C.lime : C.red), marginTop: 12 }}>{msg.text}</Text>
      )}
    </View>
  );
}
