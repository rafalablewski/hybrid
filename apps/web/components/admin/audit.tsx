"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { INK2, CARD, LINE, LIME, CHALK, ASH, AMBER, RED, disp, cond, mono, Mono, Card, Chip, txt } from "@/lib/ui";

type Entry = {
  id: string;
  actorEmail: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  summary: string | null;
  metadata: unknown;
  ip: string | null;
  createdAt: string;
};

type Resp = { total: number; page: number; pages: number; entries: Entry[]; unavailable?: boolean };

export default function AdminAuditLog() {
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Resp | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "50" });
    if (action) params.set("action", action);
    setErr(null);
    fetch(`/api/admin/audit?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => { setData(null); setErr("Couldn't load the audit log — try reloading."); });
  }, [action, page]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  if (data?.unavailable)
    return (
      <Card style={{ borderLeft: `3px solid ${AMBER}` }}>
        <div style={{ ...disp, fontWeight: 800, fontSize: 17, marginBottom: 8 }}>Audit log not initialized</div>
        <Mono s={{ fontSize: 13, lineHeight: 1.6, display: "block" }} c={CHALK}>
          The <b>AdminAudit</b> table doesn&apos;t exist yet. Run{" "}
          <span style={{ color: txt(AMBER) }}>reference/sql-admin-audit.sql</span> in the Supabase SQL Editor to
          create it. Until then, privileged actions still work but aren&apos;t recorded.
        </Mono>
      </Card>
    );

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
        <input
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
          placeholder="Filter by action (e.g. user.update)…"
          style={{ ...mono, fontSize: 13, flex: 1, padding: "10px 14px", borderRadius: "var(--r-card)", background: INK2, color: CHALK, border: `1px solid ${LINE}`, outline: "none" }}
        />
        <Mono s={{ fontSize: 12 }} c={ASH}>{data ? `${data.total.toLocaleString()} events` : "…"}</Mono>
      </div>

      {err && (
        <Mono s={{ fontSize: 12, display: "block", marginBottom: 14 }} c={RED}>
          {err}
        </Mono>
      )}

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["When", "Actor", "Action", "Target", ""].map((h, i) => (
                <th key={h || i} style={{ ...mono, fontSize: 10, color: txt(ASH), textTransform: "uppercase", letterSpacing: ".08em", textAlign: "left", padding: "12px 16px", borderBottom: `1px solid ${LINE}` }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data?.entries.map((e) => (
              <Fragment key={e.id}>
                <tr
                  onClick={() => setOpen(open === e.id ? null : e.id)}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={(ev) => (ev.currentTarget.style.background = INK2)}
                  onMouseLeave={(ev) => (ev.currentTarget.style.background = "transparent")}
                >
                  <td style={{ ...mono, fontSize: 12, color: txt(ASH), padding: "11px 16px", borderBottom: `1px solid ${LINE}`, whiteSpace: "nowrap" }}>
                    {new Date(e.createdAt).toISOString().slice(0, 19).replace("T", " ")}
                  </td>
                  <td style={{ padding: "11px 16px", borderBottom: `1px solid ${LINE}` }}>
                    <Mono s={{ fontSize: 12 }} c={CHALK}>{e.actorEmail}</Mono>
                  </td>
                  <td style={{ padding: "11px 16px", borderBottom: `1px solid ${LINE}` }}>
                    <Chip c={AMBER}>{e.action}</Chip>
                  </td>
                  <td style={{ padding: "11px 16px", borderBottom: `1px solid ${LINE}` }}>
                    <Mono s={{ fontSize: 12 }} c={ASH}>{e.summary || (e.targetType ? `${e.targetType}:${e.targetId?.slice(0, 8)}` : "—")}</Mono>
                  </td>
                  <td style={{ padding: "11px 16px", borderBottom: `1px solid ${LINE}`, color: txt(ASH) }}>{open === e.id ? "▾" : "▸"}</td>
                </tr>
                {open === e.id && (
                  <tr>
                    <td colSpan={5} style={{ padding: "0 16px 14px", borderBottom: `1px solid ${LINE}`, background: "#0a0b0a" }}>
                      <pre style={{ ...mono, fontSize: 11, color: txt(ASH), whiteSpace: "pre-wrap", wordBreak: "break-word", margin: "10px 0 0", lineHeight: 1.5 }}>
                        {JSON.stringify({ ip: e.ip, targetType: e.targetType, targetId: e.targetId, metadata: e.metadata }, null, 2)}
                      </pre>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {data && data.entries.length === 0 && (
              <tr><td colSpan={5} style={{ ...mono, fontSize: 13, color: txt(ASH), textAlign: "center", padding: 40 }}>No audit events recorded yet.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      {data && data.pages > 1 && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <PageBtn disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Prev</PageBtn>
          <Mono s={{ fontSize: 12, alignSelf: "center" }} c={ASH}>{data.page} / {data.pages}</Mono>
          <PageBtn disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Next →</PageBtn>
        </div>
      )}
    </div>
  );
}

function PageBtn({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ ...cond, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: txt(disabled ? ASH : CHALK), background: CARD, border: `1px solid ${LINE}`, borderRadius: "var(--r-field)", padding: "8px 14px", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1 }}>
      {children}
    </button>
  );
}
