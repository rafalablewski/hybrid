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
import { fs, space, INK, INK2, LINE, LIME, CHALK, ASH, BLUE, ON_ACCENT, disp, mono, Mono, Card } from "@/lib/ui";
import { useLang } from "@/lib/i18n";

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
 * Today-dashboard quick-log widget — pick a sport, enter time (+ distance for
 * distance sports), Save. Logs a real session straight to /api/sessions (one
 * cardio activity named after the sport) so "back from a run → log it → done"
 * never leaves the home screen. Distance reads/writes in the sport's natural
 * unit (metres for swimming/rowing); storage stays km. No wearable needed.
 */
export default function QuickSportLog({ sessions = [], onSaved, solid = false }: { sessions?: LoggedSession[]; onSaved?: () => void; solid?: boolean }) {
  const { t } = useLang();
  const suggested = suggestedSports(sessions);
  // Until the athlete picks, track the top suggestion — which only resolves once
  // `sessions` has loaded (the prop is empty on first mount), so storing a
  // computed default in state would freeze it on "Running".
  const [picked, setPicked] = useState<string | null>(null);
  const sport = picked ?? suggested[0] ?? "Running";
  const [minutes, setMinutes] = useState("");
  const [distance, setDistance] = useState(""); // in the sport's unit
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const tracksDist = sportTracksDistance(sport);
  const km = parseSportDistance(distance, sport);
  const pace = cardioPace({ name: sport, distance: km, minutes: parseFloat(minutes) });

  const save = async () => {
    const mins = parseFloat(minutes);
    if (!Number.isFinite(mins) && km == null) {
      setMsg(t("w.home.quickSport.needValue"));
      return;
    }
    setSaving(true);
    setMsg("");
    const block: SessionBlock = {
      kind: "cardio",
      name: sport,
      ...(km != null ? { distance: km } : {}),
      ...(Number.isFinite(mins) ? { minutes: mins } : {}),
    };
    const now = new Date().toISOString();
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: sport, startedAt: now, completedAt: now, blocks: [block] }),
      });
      if (res.status === 401) {
        setMsg(t("w.home.quickSport.signIn"));
        setSaving(false);
        return;
      }
      if (!res.ok) {
        setMsg(`${t("w.home.quickSport.saveError")} (HTTP ${res.status}).`);
        setSaving(false);
        return;
      }
      setMinutes("");
      setDistance("");
      setMsg(`✓ ${t("w.home.quickSport.logged")} ${sport}`);
      setSaving(false);
      onSaved?.();
    } catch {
      setMsg(t("w.home.quickSport.netError"));
      setSaving(false);
    }
  };

  // Aurora pairs this with the solid `ink2` season card, so match that surface
  // (no glass) there; the classic skin keeps the default glass Card.
  const content = (
    <>
      <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={BLUE}>
        {t("w.home.quickSport.title")}
      </Mono>
      <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 2 }} c={ASH}>
        {t("w.home.quickSport.sub")}
      </Mono>

      {/* Sport picker — a field-styled trigger that opens a searchable modal. */}
      <SportPicker
        sport={sport}
        onPick={(name) => { setPicked(name); setMsg(""); }}
      />

      <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap", alignItems: "flex-end", marginTop: 16 }}>
        {tracksDist && (
          <div style={{ flex: "1 1 96px" }}>
            <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".06em", display: "block", marginBottom: 6 }} c={ASH}>
              {t("w.home.quickSport.dist")} · {sportDistanceUnit(sport)}
            </Mono>
            <input value={distance} onChange={(e) => setDistance(e.target.value)} placeholder={sportDistanceUnit(sport) === "m" ? "400" : "8"} inputMode="decimal" style={{ ...field, width: "100%" }} />
          </div>
        )}
        <div style={{ flex: "1 1 84px" }}>
          <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".06em", display: "block", marginBottom: 6 }} c={ASH}>{t("w.home.quickSport.minutes")}</Mono>
          <input value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="45" inputMode="decimal" style={{ ...field, width: "100%" }} />
        </div>
        <button
          onClick={save}
          disabled={saving}
          style={{ ...disp, fontWeight: 800, fontSize: fs.note, background: LIME, color: ON_ACCENT, border: "none", borderRadius: 999, padding: "13px 20px", cursor: saving ? "default" : "pointer", opacity: saving ? 0.5 : 1, whiteSpace: "nowrap" }}
        >
          {saving ? t("w.home.quickSport.saving") : t("w.home.quickSport.log")}
        </button>
      </div>
      {(pace || msg) && (
        <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 10 }} c={msg.startsWith("✓") ? LIME : pace ? BLUE : ASH}>
          {msg || `${t("w.home.quickSport.pace")} ${pace}`}
        </Mono>
      )}
    </>
  );

  // Match the aurora season card's solid surface (ink2 + soft shadow, no glass).
  return solid ? (
    <div style={{ background: "var(--color-ink2)", border: "1px solid var(--color-line)", borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 22 }}>
      {content}
    </div>
  ) : (
    <Card style={{}}>{content}</Card>
  );
}

/**
 * Custom searchable sport picker — a field-styled trigger that opens a dimmed,
 * centered modal with a live search box over the catalog grouped by category
 * (sticky headers). Replaces the OS-styled native <select> + chips so the
 * control matches the dark identity and scales past 100 sports.
 */
function SportPicker({ sport, onPick }: { sport: string; onPick: (name: string) => void }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const meta = olympicSport(sport);

  // Focus the search on open; close + clear on Esc.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => searchRef.current?.focus());
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => { cancelAnimationFrame(id); window.removeEventListener("keydown", onKey); };
  }, [open]);

  const close = () => { setOpen(false); setQuery(""); };
  const select = (name: string) => { onPick(name); close(); };

  // Filter live on sport name (case-insensitive); drop emptied groups.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return olympicSportsByCategory()
      .map(({ category, sports }) => ({ category, sports: q ? sports.filter((s) => s.name.toLowerCase().includes(q)) : sports }))
      .filter((g) => g.sports.length > 0);
  }, [query]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        style={{ ...disp, marginTop: 14, width: "100%", display: "flex", alignItems: "center", gap: 10, background: INK2, border: `1px solid ${LINE}`, borderRadius: 12, padding: "11px 13px", cursor: "pointer", textAlign: "left", color: CHALK }}
      >
        {meta && <span style={{ fontSize: fs.bodyLg }}>{meta.icon}</span>}
        <span style={{ flex: 1, fontWeight: 600, fontSize: fs.body }}>{sport}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ASH} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          role="presentation"
          onClick={close}
          style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("w.home.quickSport.choose")}
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 460, maxHeight: "78vh", display: "flex", flexDirection: "column", background: INK2, border: `1px solid ${LINE}`, borderRadius: 16, boxShadow: "0 24px 60px -20px rgba(0,0,0,.8)", overflow: "hidden" }}
          >
            {/* Search */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 15px", borderBottom: `1px solid ${LINE}` }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={ASH} strokeWidth="2" strokeLinecap="round" aria-hidden>
                <circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" />
              </svg>
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("w.home.quickSport.search")}
                style={{ ...disp, flex: 1, minWidth: 0, background: "none", border: 0, outline: "none", color: CHALK, fontSize: fs.body }}
              />
            </div>
            {/* List */}
            <div style={{ overflowY: "auto", flex: 1 }}>
              {groups.map(({ category, sports }) => (
                <div key={category}>
                  <div style={{ position: "sticky", top: 0, background: INK2, padding: "9px 15px 4px", ...mono, fontSize: fs.nano, fontWeight: 600, letterSpacing: ".14em", textTransform: "uppercase", color: ASH }}>
                    {category}
                  </div>
                  {sports.map((s) => {
                    const on = s.name === sport;
                    const hint = s.metrics.includes("distance") ? sportDistanceUnit(s.name) : category;
                    return (
                      <button
                        key={s.name}
                        type="button"
                        onClick={() => select(s.name)}
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, padding: "10px 15px", cursor: "pointer", textAlign: "left", border: 0, background: on ? `color-mix(in srgb, ${BLUE} 12%, transparent)` : "transparent", color: CHALK }}
                      >
                        <span style={{ width: 20, textAlign: "center", fontSize: fs.bodyLg }}>{s.icon}</span>
                        <span style={{ ...disp, flex: 1, fontWeight: 500, fontSize: fs.body, color: on ? BLUE : CHALK }}>{s.name}</span>
                        <span style={{ ...mono, fontSize: fs.micro, color: ASH }}>{hint}</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={on ? BLUE : "transparent"} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="m5 12 5 5 9-11" />
                        </svg>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
