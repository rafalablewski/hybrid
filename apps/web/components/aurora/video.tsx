"use client";

import { useEffect, useState } from "react";
import { fs, space } from "@hybrid/core";
import { useLang } from "@/lib/i18n";


type Metrics = { movement: string; reps: number; minKneeAngle: number | null; kneeAsymmetryPct: number | null; techniqueScore: number; flags: string[] };
type Analysis = { id: string; movement: string; metrics: Metrics; createdAt: string };
const C = (v: string) => `var(--color-${v})`;
const scoreVar = (s: number) => (s >= 85 ? "lime" : s >= 70 ? "blue" : s >= 50 ? "amber" : "red");
const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "var(--shadow-card)", padding: 20 } as const;
const chip = (color: string, label: string) => <span style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color, borderRadius: 999, padding: "3px 12px", fontFamily: "var(--font-mono)", fontSize: fs.nano }}>{label}</span>;

/** AURORA Video (web) — markerless technique-analysis results, reusing /api/video. */
export default function AuroraVideo() {
  const { t } = useLang();
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  useEffect(() => { (async () => { const res = await fetch("/api/video"); if (res.ok) setAnalyses(((await res.json()) as { analyses: Analysis[] }).analyses); })(); }, []);

  return (
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk"), display: "grid", gap: space.lg }}>
      <h1 style={{ fontWeight: 900, fontSize: fs.display, margin: 0 }}>{t("w.analyze.vid.title")}</h1>
      <div style={card}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>{t("w.analyze.vid.intel")}</div>
        <p style={{ fontSize: fs.body, lineHeight: 1.5, marginTop: 6 }}>{t("w.analyze.vid.intelBody")}</p>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, marginTop: 12, color: C("ash") }}>{t("w.analyze.vid.captureNote")}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
        {analyses.length === 0 && <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("ash") }}>{t("w.analyze.vid.empty")}</span>}
        {analyses.map((a) => (
          <div key={a.id} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontWeight: 800, fontSize: fs.title, textTransform: "capitalize" }}>{a.movement}</div>
              <div style={{ fontWeight: 900, fontSize: 30, color: C(scoreVar(a.metrics.techniqueScore)) }}>{a.metrics.techniqueScore}</div>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, marginTop: 2, color: C("ash") }}>{t("w.analyze.vid.techniqueScore")}</div>
            <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap", marginTop: 10 }}>
              {chip(C("ash"), `${a.metrics.reps} ${t("w.analyze.vid.reps")}`)}
              {a.metrics.minKneeAngle != null && chip(C("ash"), `${t("w.analyze.vid.depth")} ${Math.round(a.metrics.minKneeAngle)}°`)}
              {a.metrics.kneeAsymmetryPct != null && chip(a.metrics.kneeAsymmetryPct > 10 ? C("amber") : C("lime"), `${t("w.analyze.vid.asym")} ${a.metrics.kneeAsymmetryPct.toFixed(0)}%`)}
            </div>
            {a.metrics.flags.length > 0 && <div style={{ marginTop: 10 }}>{a.metrics.flags.map((f) => <div key={f} style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("amber") }}>⚠ {f}</div>)}</div>}
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, marginTop: 10, color: C("ash") }}>{new Date(a.createdAt).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
