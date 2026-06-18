"use client";

import { useMemo, useState } from "react";
import {
  volumeStatus, volumeAdvice, resolveLandmarks, ALL_MUSCLES,
  type LoggedSession, type MuscleVolumeStatus, type VolumeZone, type VolumeLandmark, type MuscleGroup,
} from "@hybrid/core";
import { useLoggerPrefs, setLoggerPref } from "@/lib/logger-prefs";

const MUSCLE_LABEL: Record<string, string> = { quads: "Quads", glutes: "Glutes", posterior: "Posterior chain", back: "Back", chest: "Chest", shoulders: "Shoulders", triceps: "Triceps" };
const C = (v: string) => `var(--color-${v})`;
const ZONE: Record<VolumeZone, { label: string; c: string }> = {
  under: { label: "below MEV", c: "amber" }, productive: { label: "productive", c: "lime" }, peak: { label: "near MRV", c: "blue" }, overreaching: { label: "over MRV", c: "red" },
};
function adviceLine(s: MuscleVolumeStatus): string {
  if (s.action === "add") return `Add ~${Math.round(s.deltaSets)} set${Math.round(s.deltaSets) === 1 ? "" : "s"}/wk — below the minimum to grow${s.maintaining ? " (only maintaining)" : ""}.`;
  if (s.action === "reduce") return `Over your recoverable ceiling — drop ~${Math.round(Math.abs(s.deltaSets))} set${Math.round(Math.abs(s.deltaSets)) === 1 ? "" : "s"}/wk or deload.`;
  if (s.action === "progress") return `In the productive range — room to add ~${s.deltaSets} more if recovery allows.`;
  return "At the top of your productive range — hold here.";
}

/** AURORA Volume (web) — full bespoke landmarks screen reusing the exact engine
 *  (volumeStatus / volumeAdvice / resolveLandmarks) + landmark editor. */
export default function AuroraVolume({ sessions }: { sessions: LoggedSession[] }) {
  const prefs = useLoggerPrefs();
  const iw = prefs.countWarmupsInVolume;
  const lm = useMemo(() => resolveLandmarks(prefs.landmarkOverrides), [prefs.landmarkOverrides]);
  const fr = prefs.fractionalVolume;
  const rows = useMemo(() => volumeStatus(sessions, { includeWarmups: iw, fractional: fr, landmarks: lm }), [sessions, iw, fr, lm]);
  const advice = useMemo(() => volumeAdvice(sessions, { includeWarmups: iw, fractional: fr, landmarks: lm }), [sessions, iw, fr, lm]);
  const trained = rows.some((r) => r.sets > 0);
  const [editing, setEditing] = useState(false);
  const customized = Object.keys(prefs.landmarkOverrides).length > 0;
  const editField = (m: MuscleGroup, k: keyof VolumeLandmark, raw: string) => {
    const next = { ...prefs.landmarkOverrides, [m]: { ...prefs.landmarkOverrides[m] } };
    if (raw.trim() === "") delete next[m]![k];
    else next[m]![k] = Math.max(0, Math.round(Number(raw) || 0));
    if (!Object.keys(next[m]!).length) delete next[m];
    setLoggerPref("landmarkOverrides", next);
  };
  const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, padding: 20 } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 860, margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <h1 style={{ fontWeight: 900, fontSize: 26, margin: 0 }}>Volume</h1>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: C("ash"), marginTop: 4 }}>Weekly working sets per muscle vs your landmarks — MV · MEV (grow) · MAV (productive) · MRV (ceiling). Last 7 days.</p>
        </div>
        <button onClick={() => setEditing((v) => !v)} style={{ fontFamily: "var(--font-mono)", fontSize: 12, whiteSpace: "nowrap", padding: "7px 14px", borderRadius: 999, cursor: "pointer", color: editing || customized ? C("lime") : C("ash"), background: editing || customized ? `color-mix(in srgb, ${C("lime")} 12%, transparent)` : "transparent", border: `1px solid ${editing || customized ? C("lime") : C("line")}` }}>
          {editing ? "Done" : customized ? "Landmarks ✎" : "Edit landmarks"}
        </button>
      </div>

      {editing && (
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em", color: C("lime") }}>Your landmarks · weekly sets</span>
            {customized && <button onClick={() => setLoggerPref("landmarkOverrides", {})} style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C("ash"), background: "none", border: "none", cursor: "pointer" }}>Reset to defaults</button>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr repeat(5, 1fr)", gap: 6, marginTop: 12, alignItems: "center" }}>
            <span />
            {(["MV", "MEV", "MAV lo", "MAV hi", "MRV"] as const).map((h) => <span key={h} style={{ fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", textAlign: "center", color: C("ash") }}>{h}</span>)}
            {ALL_MUSCLES.map((m) => <Row key={m} m={m} label={MUSCLE_LABEL[m] ?? m} l={lm[m]} onEdit={editField} />)}
          </div>
        </div>
      )}

      {!trained && (
        <div style={{ ...card, textAlign: "center", padding: 40 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: C("ash") }}>No working strength sets in the last 7 days. Log some lifts and your per-muscle volume — and where it sits against MEV/MAV/MRV — shows up here.</span>
        </div>
      )}

      {trained && advice.length > 0 && (
        <div style={card}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em", color: C("lime") }}>This week — adjust volume</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {advice.map((s) => (
              <div key={s.muscle} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 800, color: s.action === "reduce" ? C("red") : C("amber") }}>{s.action === "reduce" ? "↓" : "↑"} {MUSCLE_LABEL[s.muscle] ?? s.muscle}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: C("ash") }}>{adviceLine(s)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {trained && (
        <div style={card}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em", color: C("blue") }}>By muscle · sets this week</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 14 }}>
            {rows.map((r) => <LandmarkBar key={r.muscle} s={r} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ m, label, l, onEdit }: { m: MuscleGroup; label: string; l: VolumeLandmark; onEdit: (m: MuscleGroup, k: keyof VolumeLandmark, raw: string) => void }) {
  const cell = (k: keyof VolumeLandmark) => (
    <input type="number" min={0} defaultValue={l[k]} onBlur={(e) => onEdit(m, k, e.target.value)}
      style={{ fontFamily: "var(--font-mono)", fontSize: 13, width: "100%", textAlign: "center", background: C("ink"), color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 10, padding: "6px 4px", boxSizing: "border-box" }} />
  );
  return (
    <>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C("chalk") }}>{label}</span>
      {cell("mv")}{cell("mev")}{cell("mavLow")}{cell("mavHigh")}{cell("mrv")}
    </>
  );
}

function LandmarkBar({ s }: { s: MuscleVolumeStatus }) {
  const zone = ZONE[s.zone];
  const max = Math.max(s.landmark.mrv * 1.15, s.sets * 1.05, 1);
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: C("chalk") }}>{MUSCLE_LABEL[s.muscle] ?? s.muscle}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}><span style={{ color: C(zone.c), fontWeight: 800 }}>{s.sets} sets</span><span style={{ color: C("ash") }}> · {zone.label}</span></span>
      </div>
      <div style={{ position: "relative", height: 12, background: C("ink"), borderRadius: 6, border: `1px solid ${C("line")}` }}>
        <div style={{ position: "absolute", left: pct(s.landmark.mev), width: `${Math.max(0, ((s.landmark.mavHigh - s.landmark.mev) / max) * 100)}%`, top: 0, bottom: 0, background: `color-mix(in srgb, ${C("lime")} 14%, transparent)` }} />
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: pct(s.sets), background: C(zone.c), borderRadius: 6, opacity: 0.85 }} />
        <div style={{ position: "absolute", left: pct(s.landmark.mev), top: -2, bottom: -2, width: 2, background: C("amber") }} />
        <div style={{ position: "absolute", left: pct(s.landmark.mrv), top: -2, bottom: -2, width: 2, background: C("red") }} />
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 5 }}>
        <Tick c={C("amber")} label={`MEV ${s.landmark.mev}`} /><Tick c={C("lime")} label={`MAV ${s.landmark.mavLow}–${s.landmark.mavHigh}`} /><Tick c={C("red")} label={`MRV ${s.landmark.mrv}`} />
      </div>
    </div>
  );
}

function Tick({ c, label }: { c: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: c }} />
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em", color: C("ash") }}>{label}</span>
    </div>
  );
}
