"use client";

import { useCallback, useEffect, useState } from "react";
import { isValidTotpCode } from "@hybrid/core";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { LINE, LIME, CHALK, ASH, RED, AMBER, INK2, disp, mono, Mono, Card, Chip } from "@/lib/ui";

type Factor = { id: string; friendly_name?: string | null; status: string };
type Enroll = { factorId: string; qr: string; secret: string };

// Two-factor (TOTP) enrollment + management. Uses Supabase Auth's MFA API
// directly from the browser. Adding a verified factor makes the next sign-in
// require a one-time code (the login step-up). Removing the last factor drops
// the account back to single-factor.
export default function MfaSettings() {
  const live = isSupabaseConfigured();
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [enroll, setEnroll] = useState<Enroll | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!live) return;
    const supabase = createClient();
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
    const supabase = createClient();
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `authenticator-${Date.now()}` });
    setBusy(false);
    if (error || !data) {
      setMsg({ ok: false, text: error?.message ?? "Could not start enrollment. Is MFA enabled on the project?" });
      return;
    }
    setEnroll({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  };

  const confirm = async () => {
    if (!enroll || !isValidTotpCode(code)) {
      setMsg({ ok: false, text: "Enter the 6-digit code from your authenticator app." });
      return;
    }
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
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
    const supabase = createClient();
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

  return (
    <Card style={{ borderLeft: `3px solid ${verified.length ? LIME : AMBER}`, marginBottom: 16 }}>
      <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={verified.length ? LIME : AMBER}>
        Two-factor authentication
      </Mono>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
        <div style={{ ...disp, fontWeight: 700, fontSize: 18 }}>Authenticator app (TOTP)</div>
        <Chip c={verified.length ? LIME : ASH}>{verified.length ? "on" : "off"}</Chip>
      </div>
      <Mono s={{ fontSize: 13, lineHeight: 1.6, display: "block", marginTop: 6 }} c={CHALK}>
        Adds a one-time code on sign-in — strongly recommended for admin accounts. Works with any
        authenticator (1Password, Authy, Google Authenticator).
      </Mono>

      {!live && (
        <Mono s={{ fontSize: 12, display: "block", marginTop: 12 }} c={ASH}>
          Real auth required — add the Supabase keys to enable MFA.
        </Mono>
      )}

      {live && (
        <div style={{ marginTop: 16 }}>
          {/* existing factors */}
          {verified.map((f) => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${LINE}` }}>
              <Mono s={{ fontSize: 13 }} c={CHALK}>{f.friendly_name || "Authenticator"}</Mono>
              <button onClick={() => remove(f.id)} disabled={busy} style={removeBtn}>Remove</button>
            </div>
          ))}

          {/* enrollment flow */}
          {!enroll && (
            <button onClick={start} disabled={busy} style={primaryBtn}>
              {busy ? "…" : verified.length ? "Add another factor" : "Set up 2FA"}
            </button>
          )}

          {enroll && (
            <div style={{ marginTop: 14 }}>
              <Mono s={{ fontSize: 12, display: "block", marginBottom: 10 }} c={ASH}>
                Scan this with your authenticator, then enter the 6-digit code to confirm.
              </Mono>
              {/* Supabase returns the QR as an SVG data URL */}
              <img src={enroll.qr} alt="2FA QR code" style={{ width: 168, height: 168, background: "#fff", borderRadius: 10, padding: 6 }} />
              <Mono s={{ fontSize: 11, display: "block", margin: "8px 0 12px", wordBreak: "break-all" }} c={ASH}>
                Manual key: <span style={{ color: CHALK }}>{enroll.secret}</span>
              </Mono>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  placeholder="000000"
                  style={{ ...mono, fontSize: 16, letterSpacing: ".2em", flex: 1, padding: "11px 14px", borderRadius: 10, background: INK2, color: CHALK, border: `1px solid ${LINE}`, outline: "none" }}
                />
                <button onClick={confirm} disabled={busy || !isValidTotpCode(code)} style={{ ...primaryBtn, marginTop: 0, width: "auto", padding: "0 18px" }}>
                  Confirm
                </button>
              </div>
              <button onClick={() => { setEnroll(null); setCode(""); }} style={{ ...removeBtn, marginTop: 10 }}>Cancel</button>
            </div>
          )}

          {msg && (
            <Mono s={{ fontSize: 12, display: "block", marginTop: 12 }} c={msg.ok ? LIME : RED}>
              {msg.text}
            </Mono>
          )}
        </div>
      )}
    </Card>
  );
}

const primaryBtn = {
  ...disp,
  fontWeight: 800,
  fontSize: 14,
  width: "100%",
  marginTop: 14,
  padding: "11px 0",
  borderRadius: 10,
  border: "none",
  background: LIME,
  color: "#0c0d0c",
  cursor: "pointer",
} as const;

const removeBtn = {
  ...mono,
  fontSize: 12,
  color: RED,
  background: "transparent",
  border: `1px solid ${LINE}`,
  borderRadius: 8,
  padding: "5px 12px",
  cursor: "pointer",
} as const;
