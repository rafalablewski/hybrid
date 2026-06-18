"use client";

import { useEffect, useRef, useState } from "react";
import { pacePerKm } from "@hybrid/core";

const C = (v: string) => `var(--color-${v})`;
const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 24, padding: 20 } as const;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** AURORA Run tracking (web) — live-run surface with a PLACEHOLDER route map
 *  (live GPS needs the native build); the stopwatch + manual distance → pace
 *  are real and save a cardio session via /api/sessions. */
export default function AuroraRunTrack({ onSaved }: { onSaved?: () => void }) {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [distance, setDistance] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const startedRef = useRef<number | null>(null);
  const baseRef = useRef(0);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setElapsed(baseRef.current + Math.floor((Date.now() - (startedRef.current ?? Date.now())) / 1000));
    }, 250);
    return () => clearInterval(id);
  }, [running]);

  const toggle = () => {
    if (running) { baseRef.current = elapsed; setRunning(false); }
    else { startedRef.current = Date.now(); setRunning(true); }
  };
  const reset = () => { setRunning(false); setElapsed(0); baseRef.current = 0; startedRef.current = null; setMsg(null); };

  const km = parseFloat(distance);
  const minutes = elapsed / 60;
  const pace = Number.isFinite(km) && km > 0 && minutes > 0 ? pacePerKm({ distance: km, minutes }) : null;

  const save = async () => {
    if (elapsed < 1 && !(Number.isFinite(km) && km > 0)) { setMsg({ text: "Start the timer or enter a distance first.", ok: false }); return; }
    setSaving(true);
    setMsg(null);
    const now = new Date();
    const block = {
      kind: "cardio" as const,
      name: "Run",
      ...(Number.isFinite(km) && km > 0 ? { distance: km } : {}),
      ...(minutes > 0 ? { minutes: Math.round(minutes) } : {}),
    };
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Run", startedAt: now.toISOString(), completedAt: now.toISOString(), blocks: [block] }),
      });
      if (res.status === 401) { setMsg({ text: "Sign in to save your run.", ok: false }); setSaving(false); return; }
      if (!res.ok) { setMsg({ text: `Couldn't save (HTTP ${res.status}).`, ok: false }); setSaving(false); return; }
      setMsg({ text: "✓ Run saved to your history.", ok: true });
      reset();
      onSaved?.();
    } catch {
      setMsg({ text: "Network error — try again.", ok: false });
    }
    setSaving(false);
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <h1 style={{ fontWeight: 900, fontSize: 26, margin: "0 0 6px" }}>Run tracking</h1>
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: C("ash"), marginBottom: 16 }}>Track a run — time it, log the distance, save it to your history.</p>

      {/* Map placeholder */}
      <div style={{ ...card, padding: 0, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ position: "relative", height: 220, background: `linear-gradient(135deg, ${C("ink2")}, ${C("line")})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="100%" height="100%" viewBox="0 0 400 220" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, opacity: 0.5 }}>
            <path d="M30,180 C80,120 120,170 170,110 C210,60 260,120 320,50 C350,20 370,40 380,30" fill="none" stroke={C("lime")} strokeWidth="3" strokeDasharray="6 7" strokeLinecap="round" />
            <circle cx="30" cy="180" r="6" fill={C("lime")} />
            <circle cx="380" cy="30" r="6" fill={C("amber")} />
          </svg>
          <div style={{ position: "relative", textAlign: "center", padding: "0 24px" }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>📍 Live route map</div>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, marginTop: 6, lineHeight: 1.5, color: C("ash") }}>
              GPS route tracking goes live in the native app build (the map needs on-device location). Timing &amp; distance below work everywhere.
            </p>
          </div>
        </div>
      </div>

      {/* Live stats */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          <Stat label="Time" value={mmss(elapsed)} color={C("chalk")} />
          <Stat label="Distance" value={Number.isFinite(km) && km > 0 ? `${km} km` : "—"} color={C("blue")} />
          <Stat label="Pace /km" value={pace ?? "—"} color={C("lime")} />
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <button onClick={toggle} style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 15, background: running ? C("amber") : C("lime"), color: C("ink"), border: "none", borderRadius: 999, padding: "12px 26px", cursor: "pointer" }}>
            {running ? "❚❚ Pause" : elapsed > 0 ? "▶ Resume" : "▶ Start run"}
          </button>
          <button onClick={reset} disabled={elapsed === 0} style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: C("ash"), background: "transparent", border: `1px solid ${C("line")}`, borderRadius: 999, padding: "12px 20px", cursor: elapsed === 0 ? "default" : "pointer", opacity: elapsed === 0 ? 0.5 : 1 }}>
            Reset
          </button>
        </div>
      </div>

      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C("ash"), marginBottom: 6 }}>Distance (km)</div>
        <input
          value={distance}
          onChange={(e) => setDistance(e.target.value)}
          placeholder="e.g. 5.0"
          inputMode="decimal"
          style={{ fontFamily: "var(--font-mono)", fontSize: 16, width: "100%", maxWidth: 200, padding: "12px 14px", borderRadius: 14, background: C("ink"), color: C("chalk"), border: `1px solid ${C("line")}`, outline: "none" }}
        />
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C("ash"), marginTop: 8 }}>In the native build, GPS fills this in automatically as you run.</div>
      </div>

      {msg && <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, marginBottom: 10, color: msg.ok ? C("lime") : C("amber") }}>{msg.text}</div>}

      <button onClick={save} disabled={saving} style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 15, background: C("lime"), color: C("ink"), border: "none", borderRadius: 999, padding: "14px 28px", cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}>
        {saving ? "Saving…" : "Save run →"}
      </button>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em", color: C("ash") }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 26, color, marginTop: 4 }}>{value}</div>
    </div>
  );
}
