"use client";

import { useState } from "react";
import { fs, space, sessionVolume, prsForSession, blockSummary, fmtTonnage, type LoggedSession } from "@hybrid/core";
import { useLoggerPrefs } from "@/lib/logger-prefs";
import { SessionDetail } from "../screens";

const C = (v: string) => `var(--color-${v})`;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 20 } as const;
const chip = (color: string, label: string) => <span style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color, borderRadius: 999, padding: "3px 12px", fontFamily: "var(--font-mono)", fontSize: fs.micro }}>{label}</span>;
const rowBtn = (color: string, disabled: boolean) => ({ fontFamily: "var(--font-mono)", fontSize: fs.caption, color, background: `color-mix(in srgb, ${color} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`, borderRadius: 999, padding: "6px 14px", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1 } as const);

/** AURORA History (web) — bespoke session list (archive/restore/delete + PR
 *  badges), reusing the same /api/sessions actions; the full breakdown reuses
 *  the shared SessionDetail. */
export default function AuroraHistory({ sessions, onOpenExercise, onChanged }: { sessions: LoggedSession[]; onOpenExercise?: (name: string) => void; onChanged?: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archived, setArchived] = useState<LoggedSession[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const units = useLoggerPrefs().units;

  const loadArchived = async () => {
    try { const res = await fetch("/api/sessions?archived=1"); setArchived(res.ok ? ((await res.json()) as { sessions?: LoggedSession[] }).sessions ?? [] : []); } catch { setArchived([]); }
  };
  const setArchivedFlag = async (id: string, value: boolean) => {
    setBusy(id);
    try {
      const res = await fetch(`/api/sessions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ archived: value }) });
      if (!res.ok) { alert(`Couldn't ${value ? "archive" : "restore"} the workout — try again.`); return; }
      onChanged?.(); if (showArchived || value) await loadArchived();
    } catch { alert("Network error — try again."); } finally { setBusy(null); }
  };
  const remove = async (id: string, title: string) => {
    if (!window.confirm(`Permanently delete “${title}”? This can't be undone.`)) return;
    setBusy(id);
    try { const res = await fetch(`/api/sessions/${id}`, { method: "DELETE" }); if (!res.ok) { alert("Couldn't delete the workout — try again."); return; } onChanged?.(); if (showArchived) await loadArchived(); }
    catch { alert("Network error — try again."); } finally { setBusy(null); }
  };
  const toggleArchived = () => { const next = !showArchived; setShowArchived(next); if (next) void loadArchived(); };

  const open = openId ? sessions.find((s) => s.id === openId) : null;
  if (open) return <SessionDetail session={open} all={sessions} onBack={() => setOpenId(null)} onOpenExercise={onOpenExercise} />;

  const archivedToggle = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <h1 style={{ fontWeight: 900, fontSize: fs.display, margin: 0 }}>History</h1>
      <button onClick={toggleArchived} style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: showArchived ? C("amber") : C("ash"), background: "none", border: `1px solid ${showArchived ? C("amber") : C("line")}`, borderRadius: 999, padding: "6px 14px", cursor: "pointer" }}>{showArchived ? "← Back to history" : "Archived ▸"}</button>
    </div>
  );

  const list = showArchived ? archived : sessions;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.md, maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      {archivedToggle}
      {list.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: 50 }}>
          <div style={{ fontWeight: 800, fontSize: fs.heading }}>{showArchived ? "No archived workouts" : "No sessions yet"}</div>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: fs.bodyLg, marginTop: 10, color: C("ash") }}>{showArchived ? "Workouts you archive show up here." : "Log your first workout — it'll appear here and feed your dashboard."}</p>
        </div>
      ) : list.map((s) => {
        const prCount = prsForSession(sessions, s.id).length;
        return (
          <div key={s.id} style={card}>
            <div onClick={() => !showArchived && setOpenId(s.id)} style={{ cursor: showArchived ? "default" : "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontWeight: 800, fontSize: fs.title }}>{s.title}</div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>{fmtDate(s.startedAt)}</span>
              </div>
              <div style={{ display: "flex", gap: space.sm, margin: "8px 0 12px", flexWrap: "wrap" }}>
                {chip(C("blue"), fmtTonnage(sessionVolume(s.blocks), units))}
                {chip(C("ash"), `${s.blocks.length} blocks`)}
                {typeof s.readiness === "number" && chip(C("lime"), `readiness ${s.readiness}`)}
                {prCount > 0 && chip(C("lime"), `🏆 ${prCount} PR`)}
              </div>
              {s.blocks.map((b, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: `1px solid ${C("line")}`, fontFamily: "var(--font-mono)", fontSize: fs.body }}>
                  <span style={{ color: C("chalk") }}>{b.name}</span><span style={{ color: C("ash") }}>{blockSummary(b)}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C("line")}` }}>
              {!showArchived ? <button onClick={() => setOpenId(s.id)} style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), background: "none", border: "none", cursor: "pointer" }}>Open the full breakdown →</button> : <span />}
              <div style={{ display: "flex", gap: space.sm }}>
                {showArchived ? <button onClick={() => setArchivedFlag(s.id, false)} disabled={busy === s.id} style={rowBtn(C("lime"), busy === s.id)}>↺ Restore</button> : <button onClick={() => setArchivedFlag(s.id, true)} disabled={busy === s.id} style={rowBtn(C("amber"), busy === s.id)}>Archive</button>}
                <button onClick={() => remove(s.id, s.title)} disabled={busy === s.id} style={rowBtn(C("red"), busy === s.id)}>Delete</button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
