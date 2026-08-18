"use client";

import { useCallback, useEffect, useState } from "react";
import { fs, INK2, LINE, LIME, ASH, BLUE, RED, disp, mono, Mono, Card, Chip, txt } from "@/lib/ui";
import { STATE_OPACITY } from "@hybrid/core";

// Anonymous (guest, pre-account) workouts — sessions logged on a device before
// the user ever signed in. Admin-only housekeeping: review and prune them.
type Block = { name?: string; kind?: string };
type AnonSession = {
  id: string;
  deviceId: string;
  platform: string | null;
  title: string;
  startedAt: string;
  blocks: Block[];
  createdAt: string;
};

const platformColor = (p: string | null) => (p === "ios" ? BLUE : p === "web" ? LIME : p === "android" ? RED : ASH);
const fmt = (d: string) => new Date(d).toISOString().slice(0, 19).replace("T", " ");
const trunc = (s: string) => (s.length > 12 ? `${s.slice(0, 8)}…${s.slice(-4)}` : s);

export default function AdminAnonSessions() {
  const [sessions, setSessions] = useState<AnonSession[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/anon-sessions")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { sessions?: AnonSession[] }) => setSessions(d.sessions ?? []))
      .catch(() => setSessions([]));
  }, []);

  useEffect(() => { load(); }, [load]);

  const remove = async (id: string, title: string) => {
    if (!window.confirm(`Permanently delete the anonymous workout “${title}”? This can't be undone.`)) return;
    setBusy(id);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/anon-sessions?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      load();
    } catch {
      setErr("Delete failed — re-syncing.");
      load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Mono s={{ fontSize: fs.body, lineHeight: 1.5 }} c={ASH}>
          Guest workouts logged on a device before any account existed.
        </Mono>
        <Mono s={{ fontSize: fs.body }} c={ASH}>{sessions ? `${sessions.length.toLocaleString()} sessions` : "…"}</Mono>
      </div>

      {err && (
        <div role="alert">
          <Mono s={{ fontSize: fs.body, display: "block", marginBottom: 12 }} c={RED}>
            {err}
          </Mono>
        </div>
      )}

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto", maxWidth: "100%" }}>
        <table className="adm-tbl" style={{ width: "100%", minWidth: 720, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Workout", "Platform", "Device", "Started", ""].map((h, i) => (
                <th
                  key={h || i}
                  style={{ ...mono, fontSize: fs.micro, color: txt(ASH), textTransform: "uppercase", letterSpacing: ".08em", textAlign: i === 4 ? "right" : "left", padding: "12px 16px", borderBottom: `1px solid ${LINE}` }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sessions?.map((s) => (
              <tr key={s.id} onMouseEnter={(e) => (e.currentTarget.style.background = INK2)} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                <td data-label="Workout" style={{ padding: "12px 16px", borderBottom: `1px solid ${LINE}` }}>
                  <div style={{ ...disp, fontWeight: 600, fontSize: fs.bodyLg }}>{s.title}</div>
                  <Mono s={{ fontSize: fs.caption }} c={ASH}>
                    {s.blocks.length} block{s.blocks.length === 1 ? "" : "s"}
                    {s.blocks.length ? ` – ${s.blocks.map((b) => b.name).filter(Boolean).slice(0, 4).join(", ")}` : ""}
                  </Mono>
                </td>
                <td data-label="Platform" style={{ padding: "12px 16px", borderBottom: `1px solid ${LINE}` }}>
                  <Chip c={platformColor(s.platform)}>{s.platform ?? "—"}</Chip>
                </td>
                <td data-label="Device" style={{ ...mono, fontSize: fs.body, color: txt(ASH), padding: "12px 16px", borderBottom: `1px solid ${LINE}` }}>
                  {trunc(s.deviceId)}
                </td>
                <td data-label="Started" style={{ ...mono, fontSize: fs.body, color: txt(ASH), padding: "12px 16px", borderBottom: `1px solid ${LINE}`, whiteSpace: "nowrap" }}>
                  {fmt(s.startedAt)}
                </td>
                <td data-label="" style={{ padding: "12px 16px", textAlign: "right", borderBottom: `1px solid ${LINE}` }}>
                  <button className="pressable"
                    onClick={() => remove(s.id, s.title)}
                    disabled={busy === s.id}
                    style={{ ...mono, fontSize: fs.body, color: txt(RED), background: `${RED}14`, border: `1px solid ${RED}55`, borderRadius: "var(--r-field)", padding: "8px 12px", cursor: busy === s.id ? "default" : "pointer", opacity: busy === s.id ? STATE_OPACITY.busy : 1 }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {sessions && sessions.length === 0 && (
              <tr>
                <td colSpan={5} style={{ ...mono, fontSize: fs.bodyLg, color: txt(ASH), textAlign: "center", padding: 40 }}>
                  No anonymous workouts.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  );
}
