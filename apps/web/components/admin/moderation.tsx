"use client";

import { useCallback, useEffect, useState } from "react";
import { LINE, LIME, CHALK, ASH, AMBER, RED, ON_ACCENT, disp, cond, Mono, Card, Chip, txt } from "@/lib/ui";

type PendingProfile = {
  id: string;
  name: string;
  email: string;
  sport: string;
  sex: string;
  age: number;
  metrics: Record<string, number>;
  updatedAt: string;
};
type ReportItem = {
  id: string;
  reporterEmail: string;
  targetType: string;
  targetId: string;
  reason: string;
  detail: string | null;
  createdAt: string;
  target: { name: string; email: string; sport: string; visibility: string; moderationStatus: string } | null;
};

type Tab = "profiles" | "reports";

export default function AdminModeration() {
  const [tab, setTab] = useState<Tab>("profiles");
  const [profiles, setProfiles] = useState<PendingProfile[] | null>(null);
  const [reports, setReports] = useState<ReportItem[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/moderation")
      .then((r) => r.json())
      .then((d) => {
        setUnavailable(Boolean(d.unavailable));
        setProfiles(d.pendingProfiles ?? []);
        setReports(d.reports ?? []);
      })
      .catch(() => {
        setProfiles([]);
        setReports([]);
      });
  }, []);

  useEffect(load, [load]);

  async function moderateProfile(id: string, action: "approve" | "reject") {
    const note = action === "reject" ? prompt("Reason for rejection (optional, shown to no one):") ?? undefined : undefined;
    setBusy(id);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/moderation/profile/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setErr("That action didn't go through — re-syncing the queue.");
    }
    setBusy(null);
    load();
  }

  async function resolveReport(id: string, action: "dismiss" | "resolve" | "takedown") {
    const note = action === "takedown" ? prompt("Takedown note (optional):") ?? undefined : undefined;
    setBusy(id);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/moderation/report/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setErr("That action didn't go through — re-syncing the queue.");
    }
    setBusy(null);
    load();
  }

  if (unavailable)
    return (
      <Card style={{ borderLeft: `3px solid ${AMBER}` }}>
        <div style={{ ...disp, fontWeight: 800, fontSize: 17, marginBottom: 8 }}>Moderation not initialized</div>
        <Mono s={{ fontSize: 13, lineHeight: 1.6, display: "block" }} c={CHALK}>
          The moderation tables aren&apos;t set up yet. Run{" "}
          <span style={{ color: txt(AMBER) }}>reference/sql-moderation.sql</span> in the Supabase SQL Editor, then reload.
        </Mono>
      </Card>
    );

  const pCount = profiles?.length ?? 0;
  const rCount = reports?.length ?? 0;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {([["profiles", `Pending profiles${pCount ? ` · ${pCount}` : ""}`], ["reports", `Reports${rCount ? ` · ${rCount}` : ""}`]] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              ...cond,
              fontSize: 13,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: ".05em",
              padding: "8px 16px",
              borderRadius: "var(--r-field)",
              cursor: "pointer",
              border: `1px solid ${tab === id ? LIME : LINE}`,
              background: tab === id ? LIME : "transparent",
              color: txt(tab === id ? ON_ACCENT : ASH),
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {err && (
        <Mono s={{ fontSize: 12, display: "block", marginBottom: 12 }} c={RED}>
          {err}
        </Mono>
      )}

      {tab === "profiles" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Mono s={{ fontSize: 11, display: "block" }} c={ASH}>
            Discoverable talent profiles awaiting approval before they surface in discovery.
          </Mono>
          {profiles?.map((p) => (
            <Card key={p.id} style={{ borderLeft: `3px solid ${AMBER}` }}>
              <div style={{ marginBottom: 4 }}>
                <Chip c={AMBER}>pending</Chip>
                <Chip c={ASH}>{p.sport}</Chip>
                <Chip c={ASH}>{p.sex}{p.age}</Chip>
              </div>
              <div style={{ ...disp, fontWeight: 800, fontSize: 16 }}>{p.name}</div>
              <Mono s={{ fontSize: 11, display: "block", marginTop: 2 }} c={ASH}>{p.email}</Mono>
              <Mono s={{ fontSize: 12, display: "block", marginTop: 6 }} c={ASH}>
                {Object.entries(p.metrics ?? {}).map(([k, v]) => `${k}: ${v}`).join("  ·  ") || "no metrics"}
              </Mono>
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button disabled={busy === p.id} onClick={() => moderateProfile(p.id, "approve")} style={primaryBtn}>Approve</button>
                <button disabled={busy === p.id} onClick={() => moderateProfile(p.id, "reject")} style={{ ...ghostBtn, color: txt(RED), borderColor: `${RED}55` }}>Reject</button>
              </div>
            </Card>
          ))}
          {profiles && profiles.length === 0 && <Empty>No profiles awaiting review. 🎉</Empty>}
        </div>
      )}

      {tab === "reports" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Mono s={{ fontSize: 11, display: "block" }} c={ASH}>
            User-flagged content. Take down to drop the target from discovery; dismiss if it&apos;s fine.
          </Mono>
          {reports?.map((r) => (
            <Card key={r.id} style={{ borderLeft: `3px solid ${RED}` }}>
              <div style={{ marginBottom: 4 }}>
                <Chip c={RED}>{r.reason}</Chip>
                <Chip c={ASH}>{r.targetType}</Chip>
                {r.target && <Chip c={r.target.moderationStatus === "approved" ? LIME : AMBER}>{r.target.moderationStatus}</Chip>}
              </div>
              <div style={{ ...disp, fontWeight: 800, fontSize: 15 }}>
                {r.target ? `${r.target.name} · ${r.target.sport}` : `${r.targetType}:${r.targetId.slice(0, 8)} (target gone)`}
              </div>
              {r.detail && <Mono s={{ fontSize: 12, display: "block", marginTop: 4, lineHeight: 1.5 }} c={CHALK}>“{r.detail}”</Mono>}
              <Mono s={{ fontSize: 11, display: "block", marginTop: 6 }} c={ASH}>
                reported by {r.reporterEmail} · {new Date(r.createdAt).toLocaleDateString()}
              </Mono>
              <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                <button disabled={busy === r.id} onClick={() => resolveReport(r.id, "takedown")} style={{ ...primaryBtn, background: RED, border: `1px solid ${RED}` }}>Take down</button>
                <button disabled={busy === r.id} onClick={() => resolveReport(r.id, "dismiss")} style={ghostBtn}>Dismiss</button>
                <button disabled={busy === r.id} onClick={() => resolveReport(r.id, "resolve")} style={ghostBtn}>Mark resolved</button>
              </div>
            </Card>
          ))}
          {reports && reports.length === 0 && <Empty>No open reports. 🎉</Empty>}
        </div>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <Mono s={{ fontSize: 13, textAlign: "center", display: "block", padding: 24 }} c={ASH}>{children}</Mono>
    </Card>
  );
}

const primaryBtn: React.CSSProperties = {
  ...cond,
  fontSize: 13,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: ".05em",
  padding: "8px 16px",
  borderRadius: "var(--r-field)",
  cursor: "pointer",
  background: LIME,
  color: ON_ACCENT,
  border: `1px solid ${LIME}`,
};
const ghostBtn: React.CSSProperties = {
  ...cond,
  fontSize: 13,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: ".05em",
  padding: "8px 16px",
  borderRadius: "var(--r-field)",
  cursor: "pointer",
  background: "transparent",
  color: txt(ASH),
  border: `1px solid ${LINE}`,
};
