"use client";

import { useEffect, useState } from "react";
import { LIME, CHALK, ASH, AMBER, RED, BLUE, VIOLET, disp, Mono, Card, Chip } from "@/lib/ui";

type Metrics = { movement: string; reps: number; minKneeAngle: number | null; kneeAsymmetryPct: number | null; techniqueScore: number; flags: string[] };
type Analysis = { id: string; movement: string; metrics: Metrics; createdAt: string };

// Build a synthetic squat clip (2 reps, slight left/right asymmetry) so the
// markerless analysis engine can be demonstrated without a camera here. On
// device, an on-phone pose model produces these frames from real video.
function sampleFrames() {
  const ankle = (angle: number) => ({ x: Math.sin((angle * Math.PI) / 180), y: 1 + Math.cos((angle * Math.PI) / 180) });
  const angles = [172, 96, 170, 92, 171];
  return angles.map((a, i) => ({
    t: i * 0.4,
    pose: {
      leftHip: { x: 0, y: 2 }, leftKnee: { x: 0, y: 1 }, leftAnkle: ankle(a),
      rightHip: { x: 0, y: 2 }, rightKnee: { x: 0, y: 1 }, rightAnkle: ankle(a + 9), // ~asymmetry
    },
  }));
}

const scoreColor = (s: number) => (s >= 85 ? LIME : s >= 70 ? BLUE : s >= 50 ? AMBER : RED);

export default function VideoScreen() {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const res = await fetch("/api/video");
    if (res.ok) setAnalyses(((await res.json()) as { analyses: Analysis[] }).analyses);
  };
  useEffect(() => {
    refresh();
  }, []);

  const runSample = async () => {
    setBusy(true);
    await fetch("/api/video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frames: sampleFrames() }),
    });
    await refresh();
    setBusy(false);
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card style={{ borderLeft: `3px solid ${VIOLET}` }}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={VIOLET}>
          Video intelligence · markerless motion analysis
        </Mono>
        <Mono s={{ fontSize: 13, display: "block", marginTop: 6, lineHeight: 1.5 }} c={CHALK}>
          An on-device pose model turns a phone clip into keypoints; the engine scores technique
          (depth, rep count, L/R asymmetry) and feeds asymmetry into the Twin&apos;s injury risk —
          so a technique breakdown lines up with fatigue. Lab-grade biomechanics, phone-first.
        </Mono>
        <div style={{ marginTop: 12 }}>
          <button onClick={runSample} disabled={busy} style={{ ...disp, fontWeight: 800, fontSize: 14, background: LIME, color: "#0c0d0c", border: "none", borderRadius: 10, padding: "11px 20px", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
            {busy ? "Analyzing…" : "Run sample squat analysis"}
          </button>
          <Mono s={{ fontSize: 11, marginLeft: 12 }} c={ASH}>(on-device capture is the native integration)</Mono>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
        {analyses.length === 0 && <Mono s={{ fontSize: 13 }}>No analyses yet — run the sample to see the engine output.</Mono>}
        {analyses.map((a) => (
          <Card key={a.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ ...disp, fontWeight: 800, fontSize: 18, textTransform: "capitalize", color: CHALK }}>{a.movement}</div>
              <div style={{ ...disp, fontWeight: 900, fontSize: 30, color: scoreColor(a.metrics.techniqueScore) }}>{a.metrics.techniqueScore}</div>
            </div>
            <Mono s={{ fontSize: 11, display: "block", marginTop: 2 }} c={ASH}>technique score</Mono>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              <Chip c={BLUE}>{a.metrics.reps} reps</Chip>
              {a.metrics.minKneeAngle != null && <Chip c={ASH}>depth {Math.round(a.metrics.minKneeAngle)}°</Chip>}
              {a.metrics.kneeAsymmetryPct != null && <Chip c={a.metrics.kneeAsymmetryPct > 10 ? AMBER : LIME}>asym {a.metrics.kneeAsymmetryPct.toFixed(0)}%</Chip>}
            </div>
            {a.metrics.flags.length > 0 && (
              <div style={{ marginTop: 10 }}>
                {a.metrics.flags.map((f) => (
                  <Mono key={f} s={{ fontSize: 11, display: "block" }} c={AMBER}>⚠ {f}</Mono>
                ))}
              </div>
            )}
            <Mono s={{ fontSize: 10, display: "block", marginTop: 10 }} c={ASH}>{new Date(a.createdAt).toLocaleString()}</Mono>
          </Card>
        ))}
      </div>
    </div>
  );
}
