"use client";

import { useMemo, useState } from "react";
import { fs, space,
  volumeStatus, volumeAdvice, resolveLandmarks, ALL_MUSCLES,
  type LoggedSession, type MuscleVolumeStatus, type VolumeZone, type VolumeLandmark, type MuscleGroup,
} from "@hybrid/core";
import { useLoggerPrefs, setLoggerPref } from "@/lib/logger-prefs";
import { useLang } from "@/lib/i18n";

const MUSCLE_KEY: Record<string, string> = { quads: "w.analyze.vol.muscleQuads", glutes: "w.analyze.vol.muscleGlutes", posterior: "w.analyze.vol.musclePosteriorChain", back: "w.analyze.vol.muscleBack", chest: "w.analyze.vol.muscleChest", shoulders: "w.analyze.vol.muscleShoulders", triceps: "w.analyze.vol.muscleTriceps" };
const C = (v: string) => `var(--color-${v})`;
const ZONE: Record<VolumeZone, { key: string; c: string }> = {
  under: { key: "w.analyze.vol.zoneUnder", c: "amber" }, productive: { key: "w.analyze.vol.zoneProductive", c: "lime" }, peak: { key: "w.analyze.vol.zonePeak", c: "blue" }, overreaching: { key: "w.analyze.vol.zoneOver", c: "red" },
};
function adviceLine(s: MuscleVolumeStatus, t: (k: string) => string): string {
  if (s.action === "add") { const n = Math.round(s.deltaSets); return `${t("w.analyze.vol.adviceAddPre")}${n} ${n === 1 ? t("w.analyze.vol.adviceAddSet") : t("w.analyze.vol.adviceAddSets")}${t("w.analyze.vol.adviceAddTail")}${s.maintaining ? t("w.analyze.vol.adviceMaintaining") : ""}.`; }
  if (s.action === "reduce") { const n = Math.round(Math.abs(s.deltaSets)); return `${t("w.analyze.vol.adviceReducePre")}${n} ${n === 1 ? t("w.analyze.vol.adviceAddSet") : t("w.analyze.vol.adviceAddSets")}${t("w.analyze.vol.adviceReduceTail")}`; }
  if (s.action === "progress") return `${t("w.analyze.vol.adviceProgressPre")}${s.deltaSets}${t("w.analyze.vol.adviceProgressTail")}`;
  return t("w.analyze.vol.adviceHold");
}

/** AURORA Volume (web) — full bespoke landmarks screen reusing the exact engine
 *  (volumeStatus / volumeAdvice / resolveLandmarks) + landmark editor. */
export default function AuroraVolume({ sessions }: { sessions: LoggedSession[] }) {
  const { t } = useLang();
  const ml = (m: string) => (MUSCLE_KEY[m] ? t(MUSCLE_KEY[m]) : m);
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
  const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 20 } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.lg, maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: space.md }}>
        <div>
          <h1 style={{ fontWeight: 900, fontSize: fs.display, margin: 0 }}>{t("w.analyze.vol.title")}</h1>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("ash"), marginTop: 4 }}>{t("w.analyze.vol.subtitle")}</p>
        </div>
        <button onClick={() => setEditing((v) => !v)} style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, whiteSpace: "nowrap", padding: "7px 14px", borderRadius: 999, cursor: "pointer", color: editing || customized ? C("lime") : C("ash"), background: editing || customized ? `color-mix(in srgb, ${C("lime")} 12%, transparent)` : "transparent", border: `1px solid ${editing || customized ? C("lime") : C("line")}` }}>
          {editing ? t("w.analyze.vol.done") : customized ? t("w.analyze.vol.landmarksEdit") : t("w.analyze.vol.editLandmarks")}
        </button>
      </div>

      {editing && (
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("lime") }}>{t("w.analyze.vol.yourLandmarks")}</span>
            {customized && <button onClick={() => setLoggerPref("landmarkOverrides", {})} style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), background: "none", border: "none", cursor: "pointer" }}>{t("w.analyze.vol.resetDefaults")}</button>}
          </div>
          <div style={{ overflowX: "auto", maxWidth: "100%" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr repeat(5, 1fr)", gap: space.xs, marginTop: 12, alignItems: "center", minWidth: 460 }}>
              <span />
              {(["MV", "MEV", "MAV lo", "MAV hi", "MRV"] as const).map((h) => <span key={h} style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", textAlign: "center", color: C("ash") }}>{h}</span>)}
              {ALL_MUSCLES.map((m) => <Row key={m} m={m} label={ml(m)} l={lm[m]} onEdit={editField} />)}
            </div>
          </div>
        </div>
      )}

      {!trained && (
        <div style={{ ...card, textAlign: "center", padding: 40 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.bodyLg, color: C("ash") }}>{t("w.analyze.vol.empty")}</span>
        </div>
      )}

      {trained && advice.length > 0 && (
        <div style={card}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("lime") }}>{t("w.analyze.vol.adjust")}</span>
          <div style={{ display: "flex", flexDirection: "column", gap: space.sm, marginTop: 12 }}>
            {advice.map((s) => (
              <div key={s.muscle} style={{ display: "flex", gap: space.ms, alignItems: "baseline" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, fontWeight: 800, color: s.action === "reduce" ? C("red") : C("amber") }}>{s.action === "reduce" ? "↓" : "↑"} {ml(s.muscle)}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("ash") }}>{adviceLine(s, t)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {trained && (
        <div style={card}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("blue") }}>{t("w.analyze.vol.byMuscle")}</span>
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
      style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, width: "100%", textAlign: "center", background: C("ink"), color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 10, padding: "6px 4px", boxSizing: "border-box" }} />
  );
  return (
    <>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("chalk") }}>{label}</span>
      {cell("mv")}{cell("mev")}{cell("mavLow")}{cell("mavHigh")}{cell("mrv")}
    </>
  );
}

function LandmarkBar({ s }: { s: MuscleVolumeStatus }) {
  const { t } = useLang();
  const zone = ZONE[s.zone];
  const muscleKey = MUSCLE_KEY[s.muscle];
  const max = Math.max(s.landmark.mrv * 1.15, s.sets * 1.05, 1);
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("chalk") }}>{muscleKey ? t(muscleKey) : s.muscle}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption }}><span style={{ color: C(zone.c), fontWeight: 800 }}>{s.sets} {t("w.analyze.vol.sets")}</span><span style={{ color: C("ash") }}> · {t(zone.key)}</span></span>
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
      <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".06em", color: C("ash") }}>{label}</span>
    </div>
  );
}
