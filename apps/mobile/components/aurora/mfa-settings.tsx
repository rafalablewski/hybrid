import { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, ActivityIndicator } from "react-native";
import { isValidTotpCode , ALPHA} from "@hybrid/core";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { useTheme, txt } from "../../lib/theme";
import { leading, tracking, fs, space, F, PressScale as Pressable } from "../../lib/ui";
import { APill, ACard, RADIUS } from "./kit";
import { QrMatrix } from "../coach-invite";
import { withAlpha } from "./field";

type Factor = { id: string; friendly_name?: string | null; status: string };
type Enroll = { factorId: string; secret: string; uri: string };

/**
 * Two-factor (TOTP) enrolment + management — the MOBILE twin of web's
 * <MfaSettings/>. Uses Supabase Auth's MFA API directly (enroll → challenge →
 * verify → unenroll / listFactors) and the shared core helper
 * `isValidTotpCode`. Adding a verified factor makes the next sign-in require a
 * one-time code (the login step-up, handled separately); removing the last
 * factor drops the account back to single-factor.
 *
 * The QR is the hand-rolled `QrMatrix` reused from coach-invite (renders the
 * `otpauth://` URI Supabase returns) — no QR/svg dependency, so the iOS export
 * stays green. The secret is always shown for manual entry.
 */
export default function MfaSettings() {
  const { palette: C } = useTheme();
  const live = isSupabaseConfigured();
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [enroll, setEnroll] = useState<Enroll | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!live) return;
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      setFactors([]);
      return;
    }
    setFactors((data?.all ?? []) as Factor[]);
  }, [live]);

  useEffect(() => {
    load();
  }, [load]);

  const start = async () => {
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `authenticator-${Date.now()}` });
    setBusy(false);
    if (error || !data) {
      setMsg({ ok: false, text: error?.message ?? "Could not start enrollment. Is MFA enabled on the project?" });
      return;
    }
    setEnroll({ factorId: data.id, secret: data.totp.secret, uri: data.totp.uri });
  };

  const confirm = async () => {
    if (!enroll || !isValidTotpCode(code)) {
      setMsg({ ok: false, text: "Enter the 6-digit code from your authenticator app." });
      return;
    }
    setBusy(true);
    setMsg(null);
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: enroll.factorId });
    if (chErr || !ch) {
      setBusy(false);
      setMsg({ ok: false, text: chErr?.message ?? "Challenge failed." });
      return;
    }
    const { error } = await supabase.auth.mfa.verify({ factorId: enroll.factorId, challengeId: ch.id, code: code.trim() });
    setBusy(false);
    if (error) {
      setMsg({ ok: false, text: error.message });
      return;
    }
    setEnroll(null);
    setCode("");
    setMsg({ ok: true, text: "Two-factor authentication is on. You'll be asked for a code next sign-in." });
    load();
  };

  const remove = async (id: string) => {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    setBusy(false);
    if (error) {
      setMsg({ ok: false, text: error.message });
      return;
    }
    setMsg({ ok: true, text: "Factor removed." });
    load();
  };

  const verified = (factors ?? []).filter((f) => f.status === "verified");
  const accent = verified.length ? C.lime : C.amber;

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: tracking.caps, color: txt(C, accent), marginLeft: 4, marginBottom: 10 }}>
        Two-factor authentication
      </Text>
      <ACard style={{ borderLeftWidth: 3, borderLeftColor: accent }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>Authenticator app (TOTP)</Text>
          <View style={{ backgroundColor: withAlpha(verified.length ? C.lime : C.ash, ALPHA.fill), borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 3 }}>
            <Text style={{ fontFamily: F.semi, fontSize: fs.micro, color: txt(C, verified.length ? C.lime : C.ash), textTransform: "uppercase", letterSpacing: tracking.label }}>
              {verified.length ? "on" : "off"}
            </Text>
          </View>
        </View>
        <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.chalk, lineHeight: leading(fs.caption), marginTop: 6 }}>
          Adds a one-time code on sign-in — strongly recommended for admin accounts. Works with any authenticator (1Password, Authy, Google Authenticator).
        </Text>

        {!live && (
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 12 }}>
            Real auth required — add the Supabase keys to enable MFA.
          </Text>
        )}

        {live && (
          <View style={{ marginTop: 16 }}>
            {/* existing verified factors */}
            {verified.map((f) => (
              <View key={f.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk }}>{f.friendly_name || "Authenticator"}</Text>
                <Pressable onPress={() => remove(f.id)} disabled={busy} accessibilityRole="button" style={{ borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.inner, paddingHorizontal: 12, paddingVertical: 5, opacity: busy ? 0.5 : 1 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.red) }}>Remove</Text>
                </Pressable>
              </View>
            ))}

            {/* enrolment flow */}
            {!enroll && (
              <APill
                label={verified.length ? "Add another factor" : "Set up 2FA"}
                onPress={start}
                state={busy ? "saving" : "idle"}
                style={{ marginTop: 16 }}
              />
            )}

            {enroll && (
              <View style={{ marginTop: 16 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginBottom: 10 }}>
                  Scan this with your authenticator, then enter the 6-digit code to confirm.
                </Text>
                <View style={{ alignItems: "flex-start", backgroundColor: "#fff", borderRadius: RADIUS.inner, padding: 6, alignSelf: "flex-start" }}>
                  <QrMatrix url={enroll.uri} size={168} />
                </View>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 8, marginBottom: 12 }}>
                  Manual key: <Text style={{ color: C.chalk }}>{enroll.secret}</Text>
                </Text>
                <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
                  <TextInput
                    value={code}
                    onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    keyboardType="number-pad"
                    placeholder="000000"
                    placeholderTextColor={C.ash}
                    accessibilityLabel="Authenticator code"
                    style={{ flex: 1, fontFamily: F.mono, fontSize: fs.subtitle, letterSpacing: 3, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 16, paddingVertical: 12 }}
                  />
                  <Pressable onPress={confirm} disabled={busy || !isValidTotpCode(code)} accessibilityRole="button" style={{ backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingHorizontal: 20, paddingVertical: 12, alignItems: "center", opacity: busy || !isValidTotpCode(code) ? 0.5 : 1 }}>
                    <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.onAccent }}>Confirm</Text>
                  </Pressable>
                </View>
                <Pressable onPress={() => { setEnroll(null); setCode(""); }} accessibilityRole="button" style={{ borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.inner, paddingHorizontal: 12, paddingVertical: 6, marginTop: 10, alignSelf: "flex-start" }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.red) }}>Cancel</Text>
                </Pressable>
              </View>
            )}

            {msg && (
              <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, msg.ok ? C.lime : C.red), marginTop: 12 }}>
                {msg.text}
              </Text>
            )}
          </View>
        )}
      </ACard>
    </View>
  );
}
