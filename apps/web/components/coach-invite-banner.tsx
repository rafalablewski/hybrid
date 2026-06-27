"use client";

import { useEffect, useState } from "react";
import { fs, space, LIME, ASH, CHALK, disp, mono, Mono, Card, txt } from "@/lib/ui";

type Invite = { id: string; status: string; coach?: { name: string | null; email: string; coachVerified?: boolean } };

const coachName = (c?: Invite["coach"]) => c?.name || c?.email?.split("@")[0] || "A coach";

/**
 * Incoming coach invites, surfaced to EVERY persona so a client can accept the
 * mutual-consent link without needing the coach console. Renders nothing when
 * there are no pending invites.
 */
export default function CoachInviteBanner() {
  const [invites, setInvites] = useState<Invite[]>([]);

  // Finish a coach-led onboarding claim: if a QR/link invite token was stashed
  // before sign-up (see /invite/[token]), claim it now that we're signed in.
  useEffect(() => {
    let token: string | null = null;
    try { token = localStorage.getItem("hybrid.coachInviteToken"); } catch { /* ignore */ }
    if (!token) return;
    fetch(`/api/coach/invite/${token}/claim`, { method: "POST" })
      .catch(() => {})
      .finally(() => { try { localStorage.removeItem("hybrid.coachInviteToken"); } catch { /* ignore */ } });
  }, []);

  useEffect(() => {
    fetch("/api/coach/links")
      .then((r) => (r.ok ? r.json() : { asClient: [] }))
      .then((d: { asClient?: Invite[] }) => setInvites((d.asClient ?? []).filter((l) => l.status === "PENDING")))
      .catch(() => {});
  }, []);

  const act = async (id: string, action: "accept" | "end") => {
    await fetch(`/api/coach/links/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    }).catch(() => {});
    setInvites((v) => v.filter((i) => i.id !== id));
  };

  if (invites.length === 0) return null;

  return (
    <div style={{ marginBottom: 16, display: "grid", gap: space.sm }}>
      {invites.map((inv) => (
        <Card key={inv.id} style={{ borderLeft: `3px solid ${LIME}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: space.md, flexWrap: "wrap" }}>
            <div>
              <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={ASH}>Coach invite</Mono>
              <div style={{ ...disp, fontWeight: 700, fontSize: fs.subtitle, marginTop: 4 }}>
                {coachName(inv.coach)}
                {inv.coach?.coachVerified && <span title="Verified coach" style={{ color: txt(LIME), marginLeft: 5 }}>✓</span>}
                {" "}wants to coach you
              </div>
              <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 2 }} c={ASH}>
                Accepting shares your training with them — you can end it anytime.
              </Mono>
            </div>
            <div style={{ display: "flex", gap: space.sm }}>
              <button
                onClick={() => act(inv.id, "accept")}
                style={{ ...mono, fontSize: fs.body, fontWeight: 700, color: txt(LIME), background: `${LIME}1a`, border: `1px solid ${LIME}`, borderRadius: 10, padding: "8px 16px", cursor: "pointer" }}
              >
                Accept
              </button>
              <button
                onClick={() => act(inv.id, "end")}
                style={{ ...mono, fontSize: fs.body, color: txt(ASH), background: "none", border: "none", cursor: "pointer" }}
              >
                Decline
              </button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
