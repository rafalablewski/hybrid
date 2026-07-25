"use client";

import { useState } from "react";
import {
  BODY_FIGURES,
  muscleGlows,
  type BodyFigure,
  type MuscleActivation,
  type MuscleGlow,
} from "@hybrid/core";

const C = (v: string) => `var(--color-${v})`;
const poly = (pts: { x: number; y: number }[]) => pts.map((q) => `${q.x},${q.y}`).join(" ");

// A region's fill opacity: untargeted muscles sit as faint definition; targeted
// ones glow from a visible floor up to full at the top mover.
const fillOpacity = (intensity: number): number =>
  intensity <= 0 ? 0.07 : 0.26 + 0.74 * intensity;

/* ── one schematic figure (front or back) ── */

function Figure({
  fig,
  intensityOf,
  glowOf,
  hovered,
  onHover,
  accent,
}: {
  fig: BodyFigure;
  intensityOf: Record<string, number>;
  glowOf: Record<string, MuscleGlow>;
  hovered: string | null;
  onHover: (m: string | null) => void;
  accent: string;
}) {
  return (
    <svg viewBox="0 0 100 100" width="100%" style={{ display: "block", maxHeight: 220 }} role="img">
      {/* faint silhouette so the mannequin reads even where nothing is targeted */}
      {fig.outline.map((part, i) => (
        <polygon key={`o${i}`} points={poly(part)} fill={C("ash")} opacity={0.09} stroke={C("line")} strokeWidth={0.5} />
      ))}
      <circle cx={fig.head.cx} cy={fig.head.cy} r={fig.head.r} fill={C("ash")} opacity={0.12} stroke={C("line")} strokeWidth={0.5} />
      {/* muscle regions, glowing by share of effort */}
      {fig.regions.map((r) => {
        const intensity = intensityOf[r.muscle] ?? 0;
        const isHover = hovered === r.muscle;
        const g = glowOf[r.muscle];
        return r.shapes.map((shape, j) => (
          <polygon
            key={`${r.muscle}-${j}`}
            points={poly(shape)}
            fill={accent}
            fillOpacity={isHover ? 1 : fillOpacity(intensity)}
            stroke={isHover ? accent : "none"}
            strokeWidth={isHover ? 1 : 0}
            style={{ cursor: g ? "pointer" : "default", transition: "fill-opacity .15s ease" }}
            onMouseEnter={() => g && onHover(r.muscle)}
            onMouseLeave={() => onHover(null)}
          >
            {g && <title>{`${g.short} — ${g.pct}%`}</title>}
          </polygon>
        ));
      })}
    </svg>
  );
}

/* ── legend swatch ── */

function Swatch({ label, opacity, accent }: { label: string; opacity: number; accent: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 11, height: 11, borderRadius: 3, background: accent, opacity, border: `1px solid ${C("line")}` }} />
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: 0.6, color: C("ash") }}>{label}</span>
    </span>
  );
}

/**
 * The exercise BODY-MAP (web): a front + back schematic mannequin whose muscles
 * glow in proportion to that lift's share of effort — the same muscleActivation
 * data as the ranked bars, shown as a picture. Rendered inside the "How it's
 * done" sheet, right above the muscle bars. Pure shared geometry from
 * @hybrid/core (body-map) so it stays at parity with mobile. Hover a muscle for
 * its name + %.
 */
export default function AuroraBodyMap({ activation, t }: { activation: MuscleActivation[]; t: (k: string) => string }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const glow = muscleGlows(activation);
  const intensityOf: Record<string, number> = {};
  const glowOf: Record<string, MuscleGlow> = {};
  for (const g of glow) {
    intensityOf[g.muscle] = g.intensity;
    glowOf[g.muscle] = g;
  }
  const accent = C("lime");
  // the caption defaults to the top mover; hovering swaps it in
  const shown = (hovered && glowOf[hovered]) || glow[0];
  const sides: { fig: BodyFigure; label: string }[] = BODY_FIGURES.map((fig) => ({
    fig,
    label: t(`w.analyze.exp.anatomy.map.${fig.side}`),
  }));

  return (
    <div style={{ marginTop: 12, borderRadius: 20, border: `1px solid ${C("line")}`, background: C("ink2"), padding: "14px 14px 12px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {sides.map(({ fig, label }) => (
          <div key={fig.side}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase", color: C("ash"), textAlign: "center", marginBottom: 2 }}>{label}</div>
            <Figure fig={fig} intensityOf={intensityOf} glowOf={glowOf} hovered={hovered} onHover={setHovered} accent={accent} />
          </div>
        ))}
      </div>
      {/* caption — the hovered muscle, or the top mover by default */}
      <div aria-live="polite" style={{ textAlign: "center", marginTop: 6, minHeight: 18 }}>
        {shown && (
          <span style={{ fontSize: 13, color: C("chalk") }}>
            <span style={{ fontWeight: 700 }}>{shown.short}</span>
            <span style={{ fontFamily: "var(--font-mono)", color: "var(--lime-text)", marginLeft: 8 }}>{shown.pct}%</span>
          </span>
        )}
      </div>
      {/* legend */}
      <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 14, marginTop: 8 }}>
        <Swatch label={t("w.analyze.exp.anatomy.map.primary")} opacity={fillOpacity(1)} accent={accent} />
        <Swatch label={t("w.analyze.exp.anatomy.map.secondary")} opacity={fillOpacity(0.4)} accent={accent} />
        <Swatch label={t("w.analyze.exp.anatomy.map.off")} opacity={fillOpacity(0)} accent={accent} />
      </div>
    </div>
  );
}
