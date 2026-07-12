"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  olympicSportsByCategory,
  olympicSport,
  suggestedSports,
  sportTracksDistance,
  sportDistanceUnit,
  parseSportDistance,
  cardioPace,
  type LoggedSession,
  type SessionBlock,
} from "@hybrid/core";
import { fs, space, INK, INK2, LINE, LIME, CHALK, ASH, ON_ACCENT, disp, mono, Mono } from "@/lib/ui";
import { useLang } from "@/lib/i18n";

// Carousel cards use punchy short labels (the sheet/log keeps the real sport
// name) — "Running" → "Run", "Cycling" → "Ride", etc.
const SHORT: Record<string, string> = { Running: "Run", Cycling: "Ride", Swimming: "Swim", Rowing: "Row", Walking: "Walk", Hiking: "Hike" };
const shortSport = (name: string) => SHORT[name] ?? name;

const field = {
  ...mono,
  fontSize: fs.bodyLg,
  background: INK,
  color: CHALK,
  border: `1px solid ${LINE}`,
  borderRadius: 10,
  padding: "11px 12px",
  outline: "none",
  minWidth: 0,
  boxSizing: "border-box" as const,
};

/**
 * Today quick-log — a horizontal CAROUSEL of one-tap sport cards (the most
 * recently/likely sports + an "Other" card). Tapping a card opens a small sheet
 * to enter time (+ distance for distance sports) and Save, which logs a real
 * cardio session straight to /api/sessions — "back from a run → tap → log →
 * done" without leaving Today. Mirrored on mobile (quick-sport.tsx there).
 */
export default function QuickSportLog({ sessions = [], onSaved }: { sessions?: LoggedSession[]; onSaved?: () => void; solid?: boolean }) {
  const { t } = useLang();
  // Top suggestions drive the carousel; resolves once `sessions` has loaded.
  const suggested = useMemo(() => {
    const s = suggestedSports(sessions);
    const seen = new Set<string>();
    return [...s, "Running", "Cycling", "Swimming"].filter((n) => (seen.has(n) ? false : (seen.add(n), true))).slice(0, 4);
  }, [sessions]);

  const [sheetSport, setSheetSport] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <>
      {/* 2×2 grid of one-tap sport cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {suggested.map((name) => (
          <SportCard key={name} icon={olympicSport(name)?.icon ?? "🏃"} label={shortSport(name)} hint={t("w.home.today.w.tapLog")} onClick={() => setSheetSport(name)} />
        ))}
      </div>
      {/* Other — a full-width tile that opens the searchable picker for any sport */}
      <button onClick={() => setPickerOpen(true)} style={{ marginTop: 10, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: INK2, border: `1px solid ${LINE}`, borderRadius: 18, padding: 15, cursor: "pointer", color: CHALK }}>
        <span style={{ ...disp, fontWeight: 900, fontSize: fs.bodyLg, color: "var(--lime-text)" }}>＋</span>
        <span style={{ ...disp, fontWeight: 700, fontSize: fs.note }}>{t("w.home.quickSport.other")}</span>
      </button>

      {pickerOpen && (
        <SportPicker
          onPick={(name) => { setPickerOpen(false); setSheetSport(name); }}
          onClose={() => setPickerOpen(false)}
        />
      )}
      {sheetSport && (
        <LogSheet sport={sheetSport} onClose={() => setSheetSport(null)} onSaved={() => { setSheetSport(null); onSaved?.(); }} />
      )}
    </>
  );
}

// One grid card — emoji, sport name, an uppercase "tap to log" hint.
function SportCard({ icon, label, hint, onClick }: { icon: string; label: string; hint: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ display: "flex", flexDirection: "column", gap: 4, background: INK2, border: `1px solid ${LINE}`, borderRadius: 18, padding: 16, cursor: "pointer", textAlign: "left", color: CHALK }}
    >
      <span style={{ fontSize: 26 }}>{icon}</span>
      <span style={{ ...disp, fontWeight: 800, fontSize: fs.subtitle, marginTop: 6 }}>{label}</span>
      <span style={{ ...mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".08em", color: ASH, marginTop: 2 }}>{hint}</span>
    </button>
  );
}

// The log sheet — pick is done, now enter minutes (+ distance) and Save.
function LogSheet({ sport, onClose, onSaved }: { sport: string; onClose: () => void; onSaved: () => void }) {
  const { t } = useLang();
  const [minutes, setMinutes] = useState("");
  const [distance, setDistance] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const tracksDist = sportTracksDistance(sport);
  const km = parseSportDistance(distance, sport);
  const pace = cardioPace({ name: sport, distance: km, minutes: parseFloat(minutes) });
  const meta = olympicSport(sport);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async () => {
    const mins = parseFloat(minutes);
    if (!Number.isFinite(mins) && km == null) { setMsg(t("w.home.quickSport.needValue")); return; }
    setSaving(true); setMsg("");
    const block: SessionBlock = { kind: "cardio", name: sport, ...(km != null ? { distance: km } : {}), ...(Number.isFinite(mins) ? { minutes: mins } : {}) };
    const now = new Date().toISOString();
    try {
      const res = await fetch("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: sport, startedAt: now, completedAt: now, blocks: [block] }) });
      if (res.status === 401) { setMsg(t("w.home.quickSport.signIn")); setSaving(false); return; }
      if (!res.ok) { setMsg(`${t("w.home.quickSport.saveError")} (HTTP ${res.status}).`); setSaving(false); return; }
      onSaved();
    } catch { setMsg(t("w.home.quickSport.netError")); setSaving(false); }
  };

  return (
    <div role="presentation" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
      <div role="dialog" aria-modal="true" aria-label={`${t("w.home.quickSport.log")} ${sport}`} onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 420, background: INK2, border: `1px solid ${LINE}`, borderRadius: 20, boxShadow: "0 24px 60px -20px rgba(0,0,0,.8)", padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {meta && <span style={{ fontSize: 22 }}>{meta.icon}</span>}
          <span style={{ ...disp, fontWeight: 800, fontSize: fs.subtitle }}>{sport}</span>
        </div>
        <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap", alignItems: "flex-end", marginTop: 16 }}>
          {tracksDist && (
            <div style={{ flex: "1 1 96px" }}>
              <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".06em", display: "block", marginBottom: 6 }} c={ASH}>{t("w.home.quickSport.dist")} – {sportDistanceUnit(sport)}</Mono>
              <input value={distance} onChange={(e) => setDistance(e.target.value)} placeholder={sportDistanceUnit(sport) === "m" ? "400" : "8"} inputMode="decimal" autoFocus style={{ ...field, width: "100%" }} />
            </div>
          )}
          <div style={{ flex: "1 1 84px" }}>
            <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".06em", display: "block", marginBottom: 6 }} c={ASH}>{t("w.home.quickSport.minutes")}</Mono>
            <input value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="45" inputMode="decimal" autoFocus={!tracksDist} style={{ ...field, width: "100%" }} />
          </div>
          <button onClick={save} disabled={saving} style={{ ...disp, fontWeight: 800, fontSize: fs.note, background: LIME, color: ON_ACCENT, border: "none", borderRadius: 999, padding: "13px 20px", cursor: saving ? "default" : "pointer", opacity: saving ? 0.5 : 1, whiteSpace: "nowrap" }}>
            {saving ? t("w.home.quickSport.saving") : t("w.home.quickSport.log")}
          </button>
        </div>
        {(pace || msg) && (
          <div role="alert"><Mono s={{ fontSize: fs.caption, display: "block", marginTop: 10 }} c={msg.startsWith("✓") ? LIME : pace ? LIME : ASH}>{msg || `${t("w.home.quickSport.pace")} ${pace}`}</Mono></div>
        )}
      </div>
    </div>
  );
}

/**
 * Searchable sport picker — a dimmed, centered modal with a live search over the
 * catalog grouped by category (sticky headers). Opened by the carousel's "Other"
 * card; on pick it hands the sport to the log sheet.
 */
function SportPicker({ onPick, onClose }: { onPick: (name: string) => void; onClose: () => void }) {
  const { t } = useLang();
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => searchRef.current?.focus());
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { cancelAnimationFrame(id); window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return olympicSportsByCategory()
      .map(({ category, sports }) => ({ category, sports: q ? sports.filter((s) => s.name.toLowerCase().includes(q)) : sports }))
      .filter((g) => g.sports.length > 0);
  }, [query]);

  return (
    <div role="presentation" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
      <div role="dialog" aria-modal="true" aria-label={t("w.home.quickSport.choose")} onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 460, maxHeight: "78vh", display: "flex", flexDirection: "column", background: INK2, border: `1px solid ${LINE}`, borderRadius: 16, boxShadow: "0 24px 60px -20px rgba(0,0,0,.8)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 15px", borderBottom: `1px solid ${LINE}` }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={ASH} strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
          <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("w.home.quickSport.search")} style={{ ...disp, flex: 1, minWidth: 0, background: "none", border: 0, outline: "none", color: CHALK, fontSize: fs.body }} />
        </div>
        <div style={{ overflowY: "auto", flex: 1 }}>
          {groups.map(({ category, sports }) => (
            <div key={category}>
              <div style={{ position: "sticky", top: 0, background: INK2, padding: "9px 15px 4px", ...mono, fontSize: fs.nano, fontWeight: 600, letterSpacing: ".14em", textTransform: "uppercase", color: ASH }}>{category}</div>
              {sports.map((s) => {
                const hint = s.metrics.includes("distance") ? sportDistanceUnit(s.name) : category;
                return (
                  <button key={s.name} type="button" onClick={() => onPick(s.name)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, padding: "10px 15px", cursor: "pointer", textAlign: "left", border: 0, background: "transparent", color: CHALK }}>
                    <span style={{ width: 20, textAlign: "center", fontSize: fs.bodyLg }}>{s.icon}</span>
                    <span style={{ ...disp, flex: 1, fontWeight: 500, fontSize: fs.body }}>{s.name}</span>
                    <span style={{ ...mono, fontSize: fs.micro, color: ASH }}>{hint}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
