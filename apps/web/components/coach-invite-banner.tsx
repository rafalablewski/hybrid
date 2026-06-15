"use client";

import { useEffect, useState } from "react";
import { LIME, ASH, CHALK, VIOLET, disp, mono, Mono, Card, txt } from "@/lib/ui";

type Invite = { id: string; status: string; coach?: { name: string | null; email: string } };

const coachName = (c?: Invite["coach"]) => c?.name || c?.email?.split("@")[0] || "A coach";

/**
 * Incoming coach invites, surfaced to EVERY persona so a client can accept the
 * mutual-consent link without needing the coach console. Renders nothing when
 * there are no pending invites.
 */
export default function CoachInviteBanner() {
  const [invites, setInvites] = useState<Invite[]>([]);

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
    <div style={{ marginBottom: 16, display: "grid", gap: 8 }}>
      {invites.map((inv) => (
        <Card key={inv.id} style={{ borderLeft: `3px solid ${VIOLET}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={VIOLET}>Coach invite</Mono>
              <div style={{ ...disp, fontWeight: 700, fontSize: 16, marginTop: 4 }}>
                {coachName(inv.coach)} wants to coach you
              </div>
              <Mono s={{ fontSize: 12, display: "block", marginTop: 2 }} c={ASH}>
                Accepting shares your training with them — you can end it anytime.
              </Mono>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => act(inv.id, "accept")}
                style={{ ...mono, fontSize: 13, fontWeight: 700, color: txt(LIME), background: `${LIME}1a`, border: `1px solid ${LIME}`, borderRadius: 10, padding: "8px 16px", cursor: "pointer" }}
              >
                Accept
              </button>
              <button
                onClick={() => act(inv.id, "end")}
                style={{ ...mono, fontSize: 13, color: txt(ASH), background: "none", border: "none", cursor: "pointer" }}
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
