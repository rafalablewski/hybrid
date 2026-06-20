"use client";

import { useEffect, useRef, useState } from "react";
import { pacePerKm } from "@hybrid/core";
import { fs, space, INK2, LINE, LIME, CHALK, ASH, BLUE, AMBER, ON_ACCENT, disp, mono, Mono, Card } from "@/lib/ui";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Run tracking — the live-run surface. Live GPS route mapping needs the native
 *  app build (expo-location + a map lib), so the map is a PLACEHOLDER here; the
 *  rest is real: a running stopwatch + manual distance → derived pace, saved as
 *  a real cardio session via /api/sessions. The native build swaps the
 *  placeholder for a live route map without changing this logic. */
export default function RunTrack({ onSaved }: { onSaved?: () => void }) {
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
    if (running) {
      baseRef.current = elapsed;
      setRunning(false);
    } else {
      startedRef.current = Date.now();
      setRunning(true);
    }
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
    <div style={{ maxWidth: 720 }}>
      <h2 style={{ ...disp, fontWeight: 900, fontSize: fs.display, marginBottom: 4 }}>Run tracking</h2>
      <Mono s={{ fontSize: fs.body, display: "block", marginBottom: 16 }}>Track a run — time it, log the distance, save it to your history.</Mono>

      {/* Map placeholder — live GPS route map lands with the native app build. */}
      <Card style={{ marginBottom: 16, padding: 0, overflow: "hidden" }}>
        <div style={{ position: "relative", height: 220, background: `linear-gradient(135deg, ${INK2}, ${LINE})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {/* faux route line */}
          <svg width="100%" height="100%" viewBox="0 0 400 220" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, opacity: 0.5 }}>
            <path d="M30,180 C80,120 120,170 170,110 C210,60 260,120 320,50 C350,20 370,40 380,30" fill="none" stroke={LIME} strokeWidth="3" strokeDasharray="6 7" strokeLinecap="round" />
            <circle cx="30" cy="180" r="6" fill={LIME} />
            <circle cx="380" cy="30" r="6" fill={AMBER} />
          </svg>
          <div style={{ position: "relative", textAlign: "center", padding: "0 24px" }}>
            <div style={{ ...disp, fontWeight: 800, fontSize: fs.subtitle, color: CHALK }}>📍 Live route map</div>
            <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 6, lineHeight: 1.5 }} c={ASH}>
              GPS route tracking goes live in the native app build (the map needs on-device location). Timing &amp; distance below work everywhere.
            </Mono>
          </div>
        </div>
      </Card>

      {/* Live stats */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 100px), 1fr))", gap: space.md }}>
          <Stat label="Time" value={mmss(elapsed)} color={CHALK} />
          <Stat label="Distance" value={Number.isFinite(km) && km > 0 ? `${km} km` : "—"} color={BLUE} />
          <Stat label="Pace /km" value={pace ?? "—"} color={LIME} />
        </div>
        <div style={{ display: "flex", gap: space.ms, marginTop: 16, flexWrap: "wrap" }}>
          <button onClick={toggle} style={{ ...disp, fontWeight: 800, fontSize: fs.note, background: running ? AMBER : LIME, color: ON_ACCENT, border: "none", borderRadius: 12, padding: "12px 24px", cursor: "pointer" }}>
            {running ? "❚❚ Pause" : elapsed > 0 ? "▶ Resume" : "▶ Start run"}
          </button>
          <button onClick={reset} disabled={elapsed === 0} style={{ ...mono, fontSize: fs.body, color: ASH, background: "transparent", border: `1px solid ${LINE}`, borderRadius: 12, padding: "12px 18px", cursor: elapsed === 0 ? "default" : "pointer", opacity: elapsed === 0 ? 0.5 : 1 }}>
            Reset
          </button>
        </div>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <Mono s={{ fontSize: fs.caption, display: "block", marginBottom: 6 }} c={ASH}>Distance (km)</Mono>
        <input
          value={distance}
          onChange={(e) => setDistance(e.target.value)}
          placeholder="e.g. 5.0"
          inputMode="decimal"
          style={{ ...mono, fontSize: fs.subtitle, width: "100%", maxWidth: 200, padding: "10px 12px", borderRadius: 10, background: INK2, color: CHALK, border: `1px solid ${LINE}`, outline: "none" }}
        />
        <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 8 }} c={ASH}>In the native build, GPS fills this in automatically as you run.</Mono>
      </Card>

      {msg && <Mono s={{ fontSize: fs.caption, display: "block", marginBottom: 10 }} c={msg.ok ? LIME : AMBER}>{msg.text}</Mono>}

      <button onClick={save} disabled={saving} style={{ ...disp, fontWeight: 800, fontSize: fs.note, background: LIME, color: ON_ACCENT, border: "none", borderRadius: 12, padding: "14px 28px", cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}>
        {saving ? "Saving…" : "Save run →"}
      </button>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".1em" }} c={ASH}>{label}</Mono>
      <div style={{ ...disp, fontWeight: 800, fontSize: fs.display, color, marginTop: 4 }}>{value}</div>
    </div>
  );
}
