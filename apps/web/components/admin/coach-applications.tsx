"use client";

import { useCallback, useEffect, useState } from "react";
import { fs, space, LINE, LIME, CHALK, ASH, VIOLET, disp, mono, Mono, Card, txt } from "@/lib/ui";

type CoachApp = {
  id: string;
  userEmail: string;
  credentials: string;
  status: string;
  createdAt: string;
};

/**
 * Admin → Coach applications: a client applies from Settings with their
 * coaching credentials; an admin approves (→ COACH role) or denies here.
 * Mirrors the access-request queue in access.tsx (fetch / optimistic / decide).
 */
export default function CoachApplications() {
  const [apps, setApps] = useState<CoachApp[]>([]);

  const load = useCallback(() => {
    fetch("/api/admin/coach-applications")
      .then((r) => (r.ok ? r.json() : { applications: [] }))
      .then((d) => setApps((d.applications ?? []).filter((a: CoachApp) => a.status === "pending")))
      .catch(() => setApps([]));
  }, []);
  useEffect(load, [load]);

  const decide = async (id: string, action: "approve" | "deny") => {
    setApps((a) => a.filter((x) => x.id !== id)); // optimistic
    try {
      const res = await fetch(`/api/admin/coach-applications/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error();
    } catch {
      load(); // re-sync the queue from the server on failure
    }
  };

  if (apps.length === 0) return null;

  return (
    <Card style={{ borderLeft: `3px solid ${VIOLET}`, marginBottom: 16 }}>
      <Mono s={{ fontSize: fs.caption, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 10 }} c={VIOLET}>
        Pending coach applications · {apps.length}
      </Mono>
      <div style={{ display: "grid", gap: space.sm }}>
        {apps.map((a) => (
          <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: space.md, padding: "8px 0", borderBottom: `1px solid ${LINE}` }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ ...disp, fontWeight: 700, fontSize: fs.bodyLg }}>{a.userEmail}</div>
              <Mono s={{ fontSize: fs.body, display: "block", marginTop: 4, lineHeight: 1.5 }} c={CHALK}>{a.credentials}</Mono>
              <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 4 }} c={ASH}>
                {new Date(a.createdAt).toLocaleDateString()}
              </Mono>
            </div>
            <div style={{ display: "flex", gap: space.sm, flexShrink: 0 }}>
              <button onClick={() => decide(a.id, "approve")} style={{ ...mono, fontSize: fs.body, fontWeight: 700, color: txt(LIME), background: `color-mix(in srgb, var(--color-lime) 10%, transparent)`, border: `1px solid ${LIME}`, borderRadius: "var(--r-field)", padding: "9px 14px", cursor: "pointer" }}>Approve</button>
              <button onClick={() => decide(a.id, "deny")} style={{ ...mono, fontSize: fs.body, color: txt(ASH), background: "none", border: `1px solid ${LINE}`, borderRadius: "var(--r-field)", padding: "9px 14px", cursor: "pointer" }}>Deny</button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
