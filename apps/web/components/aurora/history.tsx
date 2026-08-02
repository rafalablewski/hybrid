"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { fs, space, sessionVolume, prsForSession, blockSummary, fmtTonnage, sessionShape, sessionCardioSummary, hasNote, moodDef, tagLabelKey, planSchedule, normalizeHistoryView, type HistoryViewId, type LoggedSession, type MoodDef } from "@hybrid/core";
import { useLoggerPrefs } from "@/lib/logger-prefs";
import { useBodyweightLookup } from "@/lib/use-bodyweight";
import { usePlanOverrides } from "@/lib/plan-overrides";
import { SessionDetail } from "../session-detail";
import { useLang } from "@/lib/i18n";
import { ViewSwitcher, AgendaView, WeeksView, TimelineView, TrendView, type ViewCtx } from "./history-views";
import FetchError from "./fetch-error";
import { AuroraIcon } from "./icons";
import type { ComponentType } from "react";

// Compile-checked view→component table: adding a HistoryViewId without wiring
// its component here is a type error, not a silent fall-back.
const VIEW_COMPONENTS: Record<HistoryViewId, ComponentType<{ ctx: ViewCtx }>> = {
  agenda: AgendaView,
  weeks: WeeksView,
  timeline: TimelineView,
  trend: TrendView,
};

const VIEW_KEY = "hybrid.historyView";
const readView = (): HistoryViewId => {
  try { return normalizeHistoryView(localStorage.getItem(VIEW_KEY)); } catch { return normalizeHistoryView(null); }
};

const C = (v: string) => `var(--color-${v})`;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "var(--shadow-card)", padding: 20 } as const;
const chip = (color: string, label: ReactNode) => <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: `color-mix(in srgb, ${color} 14%, transparent)`, color, borderRadius: 999, padding: "3px 12px", fontFamily: "var(--font-mono)", fontSize: fs.micro }}>{label}</span>;
const moodColor = (m: MoodDef) => (m.tone === "red" ? C("red") : m.tone === "amber" ? C("amber") : "var(--lime-text)");

// The owner's PRIVATE post-workout note (mood dot + text + tags), shown on their
// own history card. Never rendered on any non-owner view.
function SessionNoteView({ s }: { s: LoggedSession }) {
  const { t } = useLang();
  const m = moodDef(s.mood);
  const tags = s.tags ?? [];
  return (
    <div style={{ marginTop: 12, borderTop: `1px solid ${C("line")}`, paddingTop: 12 }}>
      {(m || s.note) && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          {m && <span title={t(m.labelKey)} aria-label={t(m.labelKey)} style={{ marginTop: 5, width: 8, height: 8, borderRadius: "50%", flex: "none", background: moodColor(m) }} />}
          {s.note && <span style={{ fontFamily: "var(--font-display)", fontSize: fs.body, color: C("chalk"), lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{s.note}</span>}
        </div>
      )}
      {tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: m || s.note ? 8 : 0 }}>
          {tags.map((slug) => {
            const k = tagLabelKey(slug);
            return <span key={slug} style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: "var(--lime-text)", background: "color-mix(in srgb, var(--color-lime) 8%, transparent)", border: `1px solid color-mix(in srgb, var(--color-lime) 26%, transparent)`, borderRadius: 6, padding: "2px 7px" }}>#{k ? t(k) : slug}</span>;
          })}
        </div>
      )}
    </div>
  );
}

type SwipeAction = { key: string; label: string; color: string; onPress: () => void };

/** AURORA History (web) — the five merged History × Calendar layouts behind a
 *  view switcher. Live sessions are managed (archive/delete) from the full
 *  breakdown (SessionDetail); the archived screen keeps the classic swipe list
 *  — drag a card left (pointer or touch) to reveal restore/delete. */
export default function AuroraHistory({ sessions, planId, planStartedAt, initialOpenId, onOpenExercise, onNavigate, onChanged, fetchError = false, onRetry }: { sessions: LoggedSession[]; planId?: string | null; planStartedAt?: string | null; initialOpenId?: string | null; onOpenExercise?: (name: string) => void; onNavigate?: (screen: string) => void; onChanged?: () => void; fetchError?: boolean; onRetry?: () => void }) {
  const { t } = useLang();
  // Seeded when Today deep-links one session's breakdown (the "Also today"
  // card — parity with mobile's /session/{id}); the screen remounts per shell
  // switch, so an initializer is enough — no effect needed.
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null);
  const [showArchived, setShowArchived] = useState(false);
  const [archived, setArchived] = useState<LoggedSession[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [view, setView] = useState<HistoryViewId>(readView);
  const units = useLoggerPrefs().units;
  const bw = useBodyweightLookup();
  const { overrides } = usePlanOverrides(planId);

  const pickView = (v: HistoryViewId) => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode */ }
  };

  // The date-anchored plan schedule feeds the agenda ghosts + block chapters;
  // everything degrades gracefully when no plan is enrolled.
  const schedule = useMemo(
    () => (planId && planStartedAt ? planSchedule({ planId, startedAt: planStartedAt, sessions, overrides }) : null),
    [planId, planStartedAt, sessions, overrides],
  );
  // PR counts once per data change (prsForSession is O(n) per call).
  const prCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sessions) m.set(s.id, prsForSession(sessions, s.id).length);
    return m;
  }, [sessions]);
  const viewCtx: ViewCtx = useMemo(
    () => ({ sessions, units, bw, schedule, prs: (id: string) => prCounts.get(id) ?? 0, onOpen: setOpenId }),
    [sessions, units, bw, schedule, prCounts],
  );

  const loadArchived = async () => {
    try { const res = await fetch("/api/sessions?archived=1"); setArchived(res.ok ? ((await res.json()) as { sessions?: LoggedSession[] }).sessions ?? [] : []); } catch { setArchived([]); }
  };
  const setArchivedFlag = async (id: string, value: boolean) => {
    setBusy(id);
    try {
      const res = await fetch(`/api/sessions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ archived: value }) });
      if (!res.ok) { alert(`${t("w.analyze.hist.couldntPre")} ${value ? t("w.analyze.hist.confirmArchive") : t("w.analyze.hist.confirmRestore")} ${t("w.analyze.hist.couldntTail")}`); return; }
      // Only refresh the archived list when it's on screen — toggleArchived
      // loads it fresh anyway, so archiving from live needn't prefetch it.
      onChanged?.(); if (showArchived) await loadArchived();
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
  // Archive/delete moved here from the retired classic-list swipe: once either
  // succeeds the session leaves `sessions` (onChanged refetch) and the detail
  // unmounts on its own; a cancelled confirm leaves it open.
  if (open) {
    return (
      <SessionDetail
        session={open}
        all={sessions}
        onBack={() => setOpenId(null)}
        onOpenExercise={onOpenExercise}
        onNavigate={onNavigate}
        onArchive={() => void setArchivedFlag(open.id, true)}
        onDelete={() => void remove(open.id, open.title)}
        onEdited={() => onChanged?.()}
        manageBusy={busy === open.id}
      />
    );
  }

  const archivedToggle = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <h1 style={{ fontWeight: 900, fontSize: fs.display, margin: 0 }}>{t("w.analyze.hist.title")}</h1>
      <button onClick={toggleArchived} style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: showArchived ? "var(--lime-text)" : C("ash"), background: "none", border: `1px solid ${showArchived ? C("lime") : C("line")}`, borderRadius: 999, padding: "6px 14px", cursor: "pointer" }}>{showArchived ? t("w.analyze.hist.backToHistory") : t("w.analyze.hist.archivedToggle")}</button>
    </div>
  );

  const list = showArchived ? archived : sessions;
  // Live history renders the chosen merged layout (agenda/journal/weeks/
  // timeline/blocks); archived management keeps the classic swipe list.
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.md, maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      {archivedToggle}
      {!showArchived && <ViewSwitcher view={view} onChange={pickView} />}
      {!showArchived && fetchError && sessions.length === 0 ? (
        /* A real fetch failure — distinct from a genuine empty history, so an
           offline / 500 load never masquerades as "no workouts yet" (parity
           with mobile history). */
        <FetchError onRetry={() => onRetry?.()} />
      ) : list.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: 50 }}>
          <div style={{ fontWeight: 800, fontSize: fs.heading }}>{showArchived ? t("w.analyze.hist.noArchived") : t("w.analyze.hist.noSessions")}</div>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: fs.bodyLg, marginTop: 10, color: C("ash") }}>{showArchived ? t("w.analyze.hist.archivedEmpty") : t("w.analyze.hist.sessionsEmpty")}</p>
        </div>
      ) : !showArchived ? (
        (() => { const View = VIEW_COMPONENTS[view]; return <View ctx={viewCtx} />; })()
      ) : (
        <>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), textAlign: "right", marginTop: -4 }}>{t("w.analyze.hist.swipeHint")}</div>
          {list.map((s) => {
            const prCount = prCounts.get(s.id) ?? 0;
            const actions: SwipeAction[] = [
              { key: "restore", label: t("w.analyze.hist.restore"), color: C("lime"), onPress: () => setArchivedFlag(s.id, false) },
              { key: "delete", label: t("w.analyze.hist.delete"), color: C("red"), onPress: () => remove(s.id, s.title) },
            ];
            return (
              <SwipeCard key={s.id} actions={actions} busy={busy === s.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontWeight: 800, fontSize: fs.title }}>{s.title}</div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>{fmtDate(s.startedAt)}</span>
                </div>
                <div style={{ display: "flex", gap: space.sm, margin: "10px 0 14px", flexWrap: "wrap" }}>
                  {/* Sport-aware headline chip — a run/match has no tonnage, so
                      cardio sessions read distance/time; conditioning-only
                      sessions fall back to summed minutes (matches the
                      history-views keyMetric so this list agrees with the layouts). */}
                  {sessionShape(s) === "cardio"
                    ? (() => {
                        const ct = sessionCardioSummary(s);
                        const parts = [ct.distanceKm > 0 ? `${ct.distanceKm.toFixed(1)} km` : null, ct.minutes ? `${ct.minutes} min` : null].filter(Boolean);
                        if (parts.length) return chip(C("blue"), parts.join(" – "));
                        const minutes = s.blocks.reduce((sum, b) => sum + (b.kind !== "strength" ? (b.minutes ?? 0) : 0), 0);
                        return chip(C("blue"), minutes > 0 ? `${minutes} min` : `${s.blocks.length} ${s.blocks.length === 1 ? t("w.analyze.hist.block") : t("w.analyze.hist.blocks")}`);
                      })()
                    : chip(C("ash"), fmtTonnage(sessionVolume(s.blocks, false, bw(s.startedAt)), units))}
                  {chip(C("ash"), `${s.blocks.length} ${s.blocks.length === 1 ? t("w.analyze.hist.block") : t("w.analyze.hist.blocks")}`)}
                  {typeof s.readiness === "number" && chip(C("lime"), `${t("w.analyze.hist.readiness")} ${s.readiness}`)}
                  {prCount > 0 && chip(C("lime"), <><AuroraIcon name="trophy" size={13} />{`${prCount} ${t("w.analyze.hist.pr")}`}</>)}
                </div>
                {s.blocks.map((b, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontFamily: "var(--font-mono)", fontSize: fs.body }}>
                    <span style={{ color: C("chalk") }}>{b.name}</span><span style={{ color: C("ash") }}>{blockSummary(b)}</span>
                  </div>
                ))}
                {hasNote(s) && <SessionNoteView s={s} />}
              </SwipeCard>
            );
          })}
        </>
      )}
    </div>
  );
}

/** A card whose manage actions are revealed by dragging it left (pointer or
 *  touch). Opaque surface so the actions don't bleed through; a tap while open
 *  closes the reveal (the card itself doesn't open anything — archived
 *  breakdowns aren't openable). */
function SwipeCard({ actions, busy, children }: { actions: SwipeAction[]; busy: boolean; children: ReactNode }) {
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
    if (openRef.current) { openRef.current = false; setTx(0); }
  };

  return (
    <div style={{ position: "relative", borderRadius: 28, boxShadow: "var(--shadow-card)" }}>
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
          style={{ transform: `translateX(${tx}px)`, transition: dragging ? "none" : "transform .25s cubic-bezier(.22,1,.36,1)", background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, padding: 20, cursor: "default", touchAction: "pan-y", userSelect: "none" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
