"use client";

import { useMemo } from "react";
import {
  volumeStatus,
  volumeAdvice,
  type LoggedSession,
  type MuscleVolumeStatus,
  type VolumeZone,
} from "@hybrid/core";
import { INK2, LINE, LIME, CHALK, ASH, BLUE, AMBER, RED, disp, mono, Mono, Card } from "@/lib/ui";
import { useLoggerPrefs } from "@/lib/logger-prefs";

const MUSCLE_LABEL: Record<string, string> = {
  quads: "Quads",
  glutes: "Glutes",
  posterior: "Posterior chain",
  back: "Back",
  chest: "Chest",
  shoulders: "Shoulders",
  triceps: "Triceps",
};

const ZONE: Record<VolumeZone, { label: string; c: string }> = {
  under: { label: "below MEV", c: AMBER },
  productive: { label: "productive", c: LIME },
  peak: { label: "near MRV", c: BLUE },
  overreaching: { label: "over MRV", c: RED },
};

function adviceLine(s: MuscleVolumeStatus): string {
  if (s.action === "add")
    return `Add ~${s.deltaSets} set${s.deltaSets === 1 ? "" : "s"}/wk — below the minimum to grow${s.maintaining ? " (only maintaining)" : ""}.`;
  if (s.action === "reduce")
    return `Over your recoverable ceiling — drop ~${Math.abs(s.deltaSets)} set${Math.abs(s.deltaSets) === 1 ? "" : "s"}/wk or deload.`;
  if (s.action === "progress") return `In the productive range — room to add ~${s.deltaSets} more if recovery allows.`;
  return "At the top of your productive range — hold here.";
}

export default function Volume({ sessions }: { sessions: LoggedSession[] }) {
  const { countWarmupsInVolume: iw } = useLoggerPrefs();
  const rows = useMemo(() => volumeStatus(sessions, { includeWarmups: iw }), [sessions, iw]);
  const advice = useMemo(() => volumeAdvice(sessions, { includeWarmups: iw }), [sessions, iw]);
  const trained = rows.some((r) => r.sets > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 860 }}>
      <div style={{ marginBottom: 4 }}>
        <div style={{ ...disp, fontWeight: 800, fontSize: 26 }}>Volume</div>
        <Mono s={{ fontSize: 13, display: "block", marginTop: 4 }}>
          Weekly working sets per muscle vs your landmarks — MV (maintain) · MEV (grow) · MAV (productive) · MRV
          (ceiling). Warm-ups don&apos;t count. Last 7 days.
        </Mono>
      </div>

      {!trained && (
        <Card style={{ textAlign: "center", padding: 40 }}>
          <Mono s={{ fontSize: 14 }}>
            No working strength sets in the last 7 days. Log some lifts and your per-muscle volume — and where it sits
            against MEV/MAV/MRV — shows up here.
          </Mono>
        </Card>
      )}

      {trained && advice.length > 0 && (
        <Card>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>
            This week — adjust volume
          </Mono>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {advice.map((s) => (
              <div key={s.muscle} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                <span style={{ ...mono, fontSize: 13, fontWeight: 800, color: s.action === "reduce" ? RED : AMBER }}>
                  {s.action === "reduce" ? "↓" : "↑"} {MUSCLE_LABEL[s.muscle] ?? s.muscle}
                </span>
                <Mono s={{ fontSize: 13, color: ASH }}>{adviceLine(s)}</Mono>
              </div>
            ))}
          </div>
        </Card>
      )}

      {trained && (
        <Card>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={BLUE}>
            By muscle · sets this week
          </Mono>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 14 }}>
            {rows.map((r) => (
              <LandmarkBar key={r.muscle} s={r} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function LandmarkBar({ s }: { s: MuscleVolumeStatus }) {
  const zone = ZONE[s.zone];
  // Scale the track to a bit beyond MRV so the ceiling marker sits inside.
  const max = Math.max(s.landmark.mrv * 1.15, s.sets * 1.05, 1);
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <Mono s={{ fontSize: 13 }} c={CHALK}>
          {MUSCLE_LABEL[s.muscle] ?? s.muscle}
        </Mono>
        <span style={{ ...mono, fontSize: 12 }}>
          <span style={{ color: zone.c, fontWeight: 800 }}>{s.sets} sets</span>
          <span style={{ color: ASH }}> · {zone.label}</span>
        </span>
      </div>
      <div style={{ position: "relative", height: 12, background: INK2, borderRadius: 6, border: `1px solid ${LINE}` }}>
        {/* MAV productive band */}
        <div
          style={{
            position: "absolute",
            left: pct(s.landmark.mev),
            width: `${Math.max(0, ((s.landmark.mavHigh - s.landmark.mev) / max) * 100)}%`,
            top: 0,
            bottom: 0,
            background: `${LIME}22`,
          }}
        />
        {/* filled value */}
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: pct(s.sets), background: zone.c, borderRadius: 6, opacity: 0.85 }} />
        {/* MEV + MRV markers */}
        <Marker at={pct(s.landmark.mev)} c={AMBER} />
        <Marker at={pct(s.landmark.mrv)} c={RED} />
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 5 }}>
        <Tick c={AMBER} label={`MEV ${s.landmark.mev}`} />
        <Tick c={LIME} label={`MAV ${s.landmark.mavLow}–${s.landmark.mavHigh}`} />
        <Tick c={RED} label={`MRV ${s.landmark.mrv}`} />
      </div>
    </div>
  );
}

function Marker({ at, c }: { at: string; c: string }) {
  return <div style={{ position: "absolute", left: at, top: -2, bottom: -2, width: 2, background: c }} />;
}

function Tick({ c, label }: { c: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: c }} />
      <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em" }}>{label}</Mono>
    </div>
  );
}
