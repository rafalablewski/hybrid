import { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, Share } from "react-native";
import QRCode from "qrcode";
import { fs, Kicker, Mono, F, PressScale as Pressable } from "../lib/ui";
import { useTheme } from "../lib/theme";
import { getCoachInvites, createCoachInvite, revokeCoachInvite, type CoachInviteRow } from "../lib/api";
import { ACard, cardStack, APill, RADIUS } from "./aurora/kit";
import { colors } from "@hybrid/core";

/** Render a QR code as a grid of Views from the qrcode module matrix — no native
 *  dependency (keeps the iOS export green), so a client can scan it to onboard.
 *  Exported so the MFA (TOTP) enrolment reuses the exact same renderer for the
 *  otpauth QR — no new QR/svg dependency. */
export function QrMatrix({ url, size = 200, dark = colors.ink, light = "#ffffff" }: { url: string; size?: number; dark?: string; light?: string }) {
  let n = 0;
  let data: Uint8Array | null = null;
  try {
    const m = QRCode.create(url, { errorCorrectionLevel: "M" }).modules as { size: number; data: Uint8Array };
    n = m.size;
    data = m.data;
  } catch {
    return null;
  }
  if (!data || n === 0) return null;
  const cell = Math.max(2, Math.floor(size / n));
  const dim = cell * n;
  return (
    <View style={{ width: dim, height: dim, backgroundColor: light }}>
      {Array.from({ length: n }).map((_, r) => (
        <View key={r} style={{ flexDirection: "row" }}>
          {Array.from({ length: n }).map((__, c) => (
            <View key={c} style={{ width: cell, height: cell, backgroundColor: data![r * n + c] ? dark : light }} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** Coach-led onboarding (mobile, both templates) — invite a client who isn't on
 *  HYBRID yet via a shareable link, a QR they scan, or an email auto-match. The
 *  claimed client lands on the free plan with read-only access to what's assigned.
 *  Soft-degrades until reference/sql-coach-invites.sql is run. */
export default function CoachInvite() {
  const C = useTheme().palette;
  const [invites, setInvites] = useState<CoachInviteRow[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    getCoachInvites().then((d) => { setInvites(d.invites); setUnavailable(d.unavailable); }).catch(() => {});
  }, []);
  useEffect(() => load(), [load]);

  const create = async () => {
    setBusy(true); setMsg(null); setCreated(null);
    const r = await createCoachInvite({ email: email.trim() || undefined });
    setBusy(false);
    if (!r.ok) { setMsg(r.error || "Couldn't create the invite."); return; }
    if (r.existingUser) { setMsg(r.message || "They're already on HYBRID — sent a link request."); setEmail(""); load(); return; }
    setCreated(r.url || null); setEmail(""); load();
  };

  const share = (url: string) => { Share.share({ message: `Join me on HYBRID: ${url}` }).catch(() => {}); };
  const revoke = async (token: string) => { await revokeCoachInvite(token); setInvites((v) => v.filter((i) => i.token !== token)); };

  return (
    <ACard style={[cardStack, { borderLeftWidth: 3, borderLeftColor: C.lime }]}>
      <Kicker color={C.lime}>Add a client</Kicker>
      <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk, marginTop: 4 }}>Invite someone not on HYBRID yet</Text>
      <Mono style={{ marginTop: 4, lineHeight: 18 }}>Share a link or QR, or enter their email. They get the free app and see what you assign (read-only).</Mono>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="client email (optional)"
        placeholderTextColor={C.ash}
        autoCapitalize="none"
        keyboardType="email-address"
        style={{ fontFamily: F.mono, fontSize: fs.bodyLg, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, padding: 12, marginTop: 10 }}
      />
      <View style={{ marginTop: 10 }}><APill label="Generate invite" savingLabel="Generating…" state={busy ? "saving" : "idle"} color={C.lime} onPress={create} /></View>
      {msg && <View accessibilityLiveRegion="polite"><Mono color={C.lime} style={{ marginTop: 8 }}>{msg}</Mono></View>}

      {created && (
        <View style={{ marginTop: 16, alignItems: "center" }}>
          <QrMatrix url={created} />
          <Mono style={{ marginTop: 8, textAlign: "center" }}>{created}</Mono>
          <View style={{ marginTop: 8, width: "100%" }}><APill label="Share invite link" color={C.lime} onPress={() => share(created)} /></View>
          <Mono color={C.ash} style={{ marginTop: 6 }}>Expires in 30 days – single use.</Mono>
        </View>
      )}

      {invites.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <Kicker color={C.ash}>Pending invites ({invites.length})</Kicker>
          {invites.map((i) => (
            <View key={i.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line }}>
              <Mono color={C.chalk} style={{ flex: 1 }}>{i.email || i.phone || "link / QR invite"}</Mono>
              <Pressable onPress={() => share(i.url)} style={{ marginRight: 16 }}><Mono color={C.lime}>Share</Mono></Pressable>
              <Pressable onPress={() => revoke(i.token)}><Mono color={C.ash}>Revoke</Mono></Pressable>
            </View>
          ))}
        </View>
      )}

      {unavailable && <Mono color={C.ash} style={{ marginTop: 10 }}>Invites aren&apos;t enabled yet — run reference/sql-coach-invites.sql.</Mono>}
    </ACard>
  );
}
