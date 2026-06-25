"use client";

import { useRef, useState, type ReactNode } from "react";
import { fs, space, sessionVolume, prsForSession, blockSummary, fmtTonnage, type LoggedSession } from "@hybrid/core";
import { useLoggerPrefs } from "@/lib/logger-prefs";
import { SessionDetail } from "../session-detail";
import { useLang } from "@/lib/i18n";

const C = (v: string) => `var(--color-${v})`;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 20 } as const;
const chip = (color: string, label: string) => <span style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color, borderRadius: 999, padding: "3px 12px", fontFamily: "var(--font-mono)", fontSize: fs.micro }}>{label}</span>;

type SwipeAction = { key: string; label: string; color: string; onPress: () => void };

/** AURORA History (web) — bespoke session list with PR badges. Manage actions
 *  (archive/restore/delete) live behind a SWIPE: drag a card left (pointer or
 *  touch) to reveal them, so the resting card is clean — no footer buttons, no
 *  divider lines — and a tap opens the full breakdown (reusing SessionDetail). */
export default function AuroraHistory({ sessions, onOpenExercise, onChanged }: { sessions: LoggedSession[]; onOpenExercise?: (name: string) => void; onChanged?: () => void }) {
  const { t } = useLang();
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
      if (!res.ok) { alert(`${t("w.analyze.hist.couldntPre")} ${value ? t("w.analyze.hist.confirmArchive") : t("w.analyze.hist.confirmRestore")} ${t("w.analyze.hist.couldntTail")}`); return; }
      onChanged?.(); if (showArchived || value) await loadArchived();
    } catch { alert(t("w.analyze.hist.networkError")); } finally { setBusy(null); }
  };
  const remove = async (id: string, title: string) => {
    if (!window.confirm(`${t("w.analyze.hist.confirmDeletePre")}${title}${t("w.analyze.hist.confirmDeleteTail")}`)) return;
    setBusy(id);
    try { const res = await fetch(`/api/sessions/${id}`, { method: "DELETE" }); if (!res.ok) { alert(t("w.analyze.hist.couldntDelete")); return; } onChanged?.(); if (showArchived) await loadArchived(); }
    catch { alert(t("w.analyze.hist.networkError")); } finally { setBusy(null); }
  };
  const toggleArchived = () => { const next = !showArchived; setShowArchived(next); if (next) void loadArchived(); };

  const open = openId ? sessions.find((s) => s.id === openId) : null;
  if (open) return <SessionDetail session={open} all={sessions} onBack={() => setOpenId(null)} onOpenExercise={onOpenExercise} />;

  const archivedToggle = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <h1 style={{ fontWeight: 900, fontSize: fs.display, margin: 0 }}>{t("w.analyze.hist.title")}</h1>
      <button onClick={toggleArchived} style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: showArchived ? C("amber") : C("ash"), background: "none", border: `1px solid ${showArchived ? C("amber") : C("line")}`, borderRadius: 999, padding: "6px 14px", cursor: "pointer" }}>{showArchived ? t("w.analyze.hist.backToHistory") : t("w.analyze.hist.archivedToggle")}</button>
    </div>
  );

  const list = showArchived ? archived : sessions;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.md, maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      {archivedToggle}
      {list.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: 50 }}>
          <div style={{ fontWeight: 800, fontSize: fs.heading }}>{showArchived ? t("w.analyze.hist.noArchived") : t("w.analyze.hist.noSessions")}</div>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: fs.bodyLg, marginTop: 10, color: C("ash") }}>{showArchived ? t("w.analyze.hist.archivedEmpty") : t("w.analyze.hist.sessionsEmpty")}</p>
        </div>
      ) : (
        <>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), textAlign: "right", marginTop: -4 }}>{t("w.analyze.hist.swipeHint")}</div>
          {list.map((s) => {
            const prCount = prsForSession(sessions, s.id).length;
            const actions: SwipeAction[] = [
              showArchived
                ? { key: "restore", label: t("w.analyze.hist.restore"), color: C("lime"), onPress: () => setArchivedFlag(s.id, false) }
                : { key: "archive", label: t("w.analyze.hist.archive"), color: C("amber"), onPress: () => setArchivedFlag(s.id, true) },
              { key: "delete", label: t("w.analyze.hist.delete"), color: C("red"), onPress: () => remove(s.id, s.title) },
            ];
            return (
              <SwipeCard key={s.id} actions={actions} busy={busy === s.id} openable={!showArchived} onOpen={() => setOpenId(s.id)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontWeight: 800, fontSize: fs.title }}>{s.title}</div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>{fmtDate(s.startedAt)}</span>
                </div>
                <div style={{ display: "flex", gap: space.sm, margin: "10px 0 14px", flexWrap: "wrap" }}>
                  {chip(C("blue"), fmtTonnage(sessionVolume(s.blocks), units))}
                  {chip(C("ash"), `${s.blocks.length} ${s.blocks.length === 1 ? t("w.analyze.hist.block") : t("w.analyze.hist.blocks")}`)}
                  {typeof s.readiness === "number" && chip(C("lime"), `${t("w.analyze.hist.readiness")} ${s.readiness}`)}
                  {prCount > 0 && chip(C("lime"), `🏆 ${prCount} ${t("w.analyze.hist.pr")}`)}
                </div>
                {s.blocks.map((b, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontFamily: "var(--font-mono)", fontSize: fs.body }}>
                    <span style={{ color: C("chalk") }}>{b.name}</span><span style={{ color: C("ash") }}>{blockSummary(b)}</span>
                  </div>
                ))}
                {!showArchived && <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginTop: 10 }}>{t("w.analyze.hist.openBreakdown")}</div>}
              </SwipeCard>
            );
          })}
        </>
      )}
    </div>
  );
}

/** A card whose manage actions are revealed by dragging it left (pointer or
 *  touch). Opaque surface so the actions don't bleed through; a tap opens the
 *  card unless it was a drag, and a tap while open closes the reveal. */
function SwipeCard({ actions, busy, openable, onOpen, children }: { actions: SwipeAction[]; busy: boolean; openable: boolean; onOpen: () => void; children: ReactNode }) {
  const TILE = 104;
  const reveal = TILE * actions.length;
  const [tx, setTx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef({ x0: 0, base: 0, active: false, moved: false });
  const openRef = useRef(false);

  const down = (e: React.PointerEvent) => {
    drag.current = { x0: e.clientX, base: tx, active: true, moved: false };
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current; if (!d.active) return;
    const dx = e.clientX - d.x0;
    if (Math.abs(dx) > 5) d.moved = true;
    setTx(Math.max(-reveal, Math.min(0, d.base + dx)));
  };
  const up = () => {
    const d = drag.current; if (!d.active) return;
    d.active = false; setDragging(false);
    setTx((cur) => { const willOpen = cur < -reveal / 2; openRef.current = willOpen; return willOpen ? -reveal : 0; });
  };
  const onClick = () => {
    if (drag.current.moved) return; // a drag, not a tap
    if (openRef.current) { openRef.current = false; setTx(0); return; }
    if (openable) onOpen();
  };

  return (
    <div style={{ position: "relative", borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)" }}>
      <div style={{ position: "relative", borderRadius: 28, overflow: "hidden" }}>
        {/* Revealed actions, pinned right behind the card. */}
        <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, display: "flex" }}>
          {actions.map((a) => (
            <button
              key={a.key}
              disabled={busy}
              onClick={() => { openRef.current = false; setTx(0); a.onPress(); }}
              style={{ width: TILE, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, border: "none", cursor: busy ? "default" : "pointer", background: `color-mix(in srgb, ${a.color} 18%, transparent)`, color: a.color, fontFamily: "var(--font-mono)", fontSize: fs.caption, opacity: busy ? 0.5 : 1 }}
            >
              {a.label}
            </button>
          ))}
        </div>
        {/* The card — opaque, draggable. */}
        <div
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onClick={onClick}
          style={{ transform: `translateX(${tx}px)`, transition: dragging ? "none" : "transform .25s cubic-bezier(.22,1,.36,1)", background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, padding: 20, cursor: openable ? "pointer" : "default", touchAction: "pan-y", userSelect: "none" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
