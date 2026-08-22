"use client";

import { useCallback, useEffect, useState } from "react";
import { fs, space, LINE, LIME, CHALK, ASH, AMBER, RED, ON_ACCENT, disp, Mono, Card, Chip, txt } from "@/lib/ui";

// The moderation queue: user-flagged content reports (social profiles, comments
// and posts). The talent-profile approval queue that used to sit beside it went
// with the Talent Graph in the 2026-08 strategy cuts, so reports are the only
// feeder now — and one feeder does not need a tab bar above it.
type ReportItem = {
  id: string;
  reporterEmail: string;
  targetType: string;
  targetId: string;
  reason: string;
  detail: string | null;
  createdAt: string;
};

export default function AdminModeration() {
  const [reports, setReports] = useState<ReportItem[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/moderation")
      .then((r) => r.json())
      .then((d) => {
        setUnavailable(Boolean(d.unavailable));
        setReports(d.reports ?? []);
      })
      .catch(() => setReports([]));
  }, []);

  useEffect(load, [load]);

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
        <Mono s={{ fontSize: fs.bodyLg, lineHeight: 1.6, display: "block" }} c={CHALK}>
          The moderation tables aren&apos;t set up yet. Run{" "}
          <span style={{ color: txt(AMBER) }}>reference/sql-moderation.sql</span> in the Supabase SQL Editor, then reload.
        </Mono>
      </Card>
    );

  return (
    <div>
      {err && (
        <div role="alert">
          <Mono s={{ fontSize: fs.body, display: "block", marginBottom: 12 }} c={RED}>
            {err}
          </Mono>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: space.ms }}>
        <Mono s={{ fontSize: fs.caption, display: "block" }} c={ASH}>
          User-flagged content. Take down to action the target; dismiss if it&apos;s fine.
        </Mono>
        {reports?.map((r) => (
          <Card key={r.id} style={{ borderLeft: `3px solid ${RED}` }}>
            <div style={{ marginBottom: 4 }}>
              <Chip c={RED}>{r.reason}</Chip>
              <Chip c={ASH}>{r.targetType}</Chip>
            </div>
            <div style={{ ...disp, fontWeight: 800, fontSize: fs.bodyLg }}>
              {r.targetType}:{r.targetId.slice(0, 8)}
            </div>
            {r.detail && <Mono s={{ fontSize: fs.body, display: "block", marginTop: 4, lineHeight: 1.5 }} c={CHALK}>“{r.detail}”</Mono>}
            <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 6 }} c={ASH}>
              reported by {r.reporterEmail} – {new Date(r.createdAt).toLocaleDateString()}
            </Mono>
            <div style={{ display: "flex", gap: space.sm, marginTop: 14, flexWrap: "wrap" }}>
              <button className="pressable" disabled={busy === r.id} onClick={() => resolveReport(r.id, "takedown")} style={{ ...primaryBtn, background: RED, border: `1px solid ${RED}` }}>Take down</button>
              <button className="pressable" disabled={busy === r.id} onClick={() => resolveReport(r.id, "dismiss")} style={ghostBtn}>Dismiss</button>
              <button className="pressable" disabled={busy === r.id} onClick={() => resolveReport(r.id, "resolve")} style={ghostBtn}>Mark resolved</button>
            </div>
          </Card>
        ))}
        {reports && reports.length === 0 && <Empty>No open reports.</Empty>}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <Mono s={{ fontSize: fs.bodyLg, textAlign: "center", display: "block", padding: 24 }} c={ASH}>{children}</Mono>
    </Card>
  );
}

const primaryBtn: React.CSSProperties = {
  ...disp,
  fontSize: fs.bodyLg,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: ".08em",
  padding: "10px 16px",
  borderRadius: "var(--r-field)",
  cursor: "pointer",
  background: LIME,
  color: ON_ACCENT,
  border: `1px solid ${LIME}`,
};
const ghostBtn: React.CSSProperties = {
  ...disp,
  fontSize: fs.bodyLg,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: ".08em",
  padding: "10px 16px",
  borderRadius: "var(--r-field)",
  cursor: "pointer",
  background: "transparent",
  color: txt(ASH),
  border: `1px solid ${LINE}`,
};
