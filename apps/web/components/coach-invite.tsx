"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { fs, space, LIME, ASH, CHALK, VIOLET, LINE, disp, mono, Mono, Card } from "@/lib/ui";

type Invite = { id: string; token: string; email: string | null; phone: string | null; url: string; expiresAt: string };

/**
 * Coach-led onboarding — add a client who isn't on HYBRID yet. One invite backs
 * all delivery methods: copy the link, show the QR, or enter an email/phone (the
 * client is auto-connected when they sign up with that email). Shared by the
 * classic and Aurora coach screens.
 */
export default function CoachInvite() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ url: string; qr: string } | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(() => {
    fetch("/api/coach/invite")
      .then((r) => r.json())
      .then((d: { invites?: Invite[]; unavailable?: boolean }) => {
        setInvites(d.invites ?? []);
        setUnavailable(Boolean(d.unavailable));
      })
      .catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const makeQr = (url: string) => QRCode.toDataURL(url, { margin: 1, width: 240, color: { dark: "#0c0d0c", light: "#ffffff" } });

  const create = async () => {
    setBusy(true); setNote(""); setCreated(null);
    try {
      const r = await fetch("/api/coach/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() || undefined, phone: phone.trim() || undefined }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setNote(d.error || "Couldn't create the invite."); return; }
      if (d.existingUser) { setNote(d.message || "They're already on HYBRID — sent a link request."); setEmail(""); setPhone(""); load(); return; }
      const qr = await makeQr(d.url);
      setCreated({ url: d.url, qr });
      setEmail(""); setPhone("");
      load();
    } catch {
      setNote("Couldn't create the invite — try again.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (token: string) => {
    await fetch(`/api/coach/invite/${token}`, { method: "DELETE" }).catch(() => {});
    setInvites((v) => v.filter((i) => i.token !== token));
  };

  const copy = (url: string) => { navigator.clipboard?.writeText(url).then(() => setNote("Link copied to clipboard.")).catch(() => {}); };

  return (
    <Card style={{ borderLeft: `3px solid ${LIME}` }}>
      <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>Add a client</Mono>
      <div style={{ ...disp, fontWeight: 700, fontSize: fs.subtitle, marginTop: 4 }}>Invite someone who isn&apos;t on HYBRID yet</div>
      <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 4, lineHeight: 1.6 }} c={ASH}>
        Share a link, show the QR, or enter their email. They get the free app and see everything you assign (read-only) — connected to you automatically.
      </Mono>

      <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap", marginTop: 14 }}>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client email (optional)" style={input} />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="phone (optional)" style={input} />
        <button onClick={create} disabled={busy} style={cta(busy)}>{busy ? "Generating…" : "Generate invite"}</button>
      </div>

      {note && <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 10 }} c={LIME}>{note}</Mono>}

      {created && (
        <div style={{ marginTop: 16, display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={created.qr} alt="Invite QR code" width={140} height={140} style={{ borderRadius: 12, background: "#fff", padding: 8 }} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".08em" }} c={ASH}>Scan or share this link</Mono>
            <div style={{ display: "flex", gap: space.sm, marginTop: 6, flexWrap: "wrap" }}>
              <input readOnly value={created.url} style={{ ...input, flex: 1, minWidth: 200 }} onFocus={(e) => e.currentTarget.select()} />
              <button onClick={() => copy(created.url)} style={cta(false)}>Copy</button>
            </div>
            <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 6 }} c={ASH}>Expires in 30 days · single use.</Mono>
          </div>
        </div>
      )}

      {invites.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".08em" }} c={ASH}>Pending invites ({invites.length})</Mono>
          <div style={{ display: "grid", gap: space.xs, marginTop: 8 }}>
            {invites.map((i) => (
              <div key={i.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: space.ms, padding: "8px 0", borderTop: `1px solid ${LINE}` }}>
                <div style={{ ...mono, fontSize: fs.caption, color: CHALK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {i.email || i.phone || "link / QR invite"}
                </div>
                <div style={{ display: "flex", gap: space.sm, flexShrink: 0 }}>
                  <button onClick={() => copy(i.url)} style={ghost(LIME)}>Copy link</button>
                  <button onClick={() => revoke(i.token)} style={ghost(ASH)}>Revoke</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {unavailable && (
        <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 12 }} c={VIOLET}>
          Invites aren&apos;t enabled yet — run reference/sql-coach-invites.sql in Supabase.
        </Mono>
      )}
    </Card>
  );
}

const input: React.CSSProperties = {
  ...mono,
  fontSize: fs.body,
  color: CHALK,
  background: "var(--color-ink)",
  border: `1px solid ${LINE}`,
  borderRadius: 10,
  padding: "9px 12px",
  flex: "1 1 160px",
  minWidth: 140,
};

function cta(disabled: boolean): React.CSSProperties {
  return {
    ...mono,
    fontSize: fs.body,
    fontWeight: 700,
    color: "#0c0d0c",
    background: LIME,
    border: "none",
    borderRadius: 10,
    padding: "9px 16px",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}

function ghost(color: string): React.CSSProperties {
  return { ...mono, fontSize: fs.caption, color, background: "none", border: "none", cursor: "pointer" };
}
