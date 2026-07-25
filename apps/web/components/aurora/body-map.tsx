"use client";

import { useState } from "react";
import {
  exerciseBodyMap,
  type BodyFigure,
  type ExerciseBodyMap,
  type MuscleGlow,
  type Muscle,
} from "@hybrid/core";

const C = (v: string) => `var(--color-${v})`;
const poly = (pts: { x: number; y: number }[]) => pts.map((q) => `${q.x},${q.y}`).join(" ");

// A region's fill opacity: untargeted muscles sit as faint definition; targeted
// ones glow from a visible floor up to full at the top mover.
const fillOpacity = (intensity: number): number =>
  intensity <= 0 ? 0.07 : 0.26 + 0.74 * intensity;

/**
 * The exercise BODY-MAP (web) — a front + back mannequin whose muscles glow in
 * proportion to that lift's share of effort (the same muscleActivation data as
 * the ranked bars). Resolves the spec from @hybrid/core (exerciseBodyMap) and
 * switches on its `kind`: TODAY the procedural `schematic` renderer; when
 * commissioned anatomical illustration lands, populate core's SKETCH_BODY_ART
 * and the `sketch` branch composites base art + per-muscle overlays — the
 * muscle/cues section never changes. Pure shared geometry so it stays at parity
 * with mobile. Returns null for a name the DB doesn't know.
 */
export default function AuroraBodyMap({ name, t }: { name: string; t: (k: string) => string }) {
  const map = exerciseBodyMap(name);
  if (!map) return null;
  switch (map.kind) {
    case "schematic":
      return <SchematicBody map={map} t={t} />;
    case "sketch":
      return <SketchBody map={map} t={t} />;
  }
}

/* ── shared chrome: card + caption + legend ── */

function Shell({ map, hovered, t, children }: { map: ExerciseBodyMap; hovered: MuscleGlow | null; t: (k: string) => string; children: React.ReactNode }) {
  const shown = hovered || map.glow[0];
  return (
    <div style={{ marginTop: 12, borderRadius: 20, border: `1px solid ${C("line")}`, background: C("ink2"), padding: "14px 14px 12px" }}>
      {children}
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
        <Swatch label={t("w.analyze.exp.anatomy.map.primary")} opacity={fillOpacity(1)} />
        <Swatch label={t("w.analyze.exp.anatomy.map.secondary")} opacity={fillOpacity(0.4)} />
        <Swatch label={t("w.analyze.exp.anatomy.map.off")} opacity={fillOpacity(0)} />
      </div>
    </div>
  );
}

function Swatch({ label, opacity }: { label: string; opacity: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 11, height: 11, borderRadius: 3, background: C("lime"), opacity, border: `1px solid ${C("line")}` }} />
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: 0.6, color: C("ash") }}>{label}</span>
    </span>
  );
}

function SideCol({ side, label, children }: { side: string; label: string; children: React.ReactNode }) {
  return (
    <div key={side}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase", color: C("ash"), textAlign: "center", marginBottom: 2 }}>{label}</div>
      {children}
    </div>
  );
}

/* ── procedural schematic renderer (today's default) ── */

function SchematicBody({ map, t }: { map: ExerciseBodyMap; t: (k: string) => string }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const glowOf: Record<string, MuscleGlow> = {};
  for (const g of map.glow) glowOf[g.muscle] = g;
  const accent = C("lime");

  return (
    <Shell map={map} hovered={(hovered && glowOf[hovered]) || null} t={t}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {map.figures.map((fig) => (
          <SideCol key={fig.side} side={fig.side} label={t(`w.analyze.exp.anatomy.map.${fig.side}`)}>
            <Figure fig={fig} intensityOf={map.intensityOf} glowOf={glowOf} hovered={hovered} onHover={setHovered} accent={accent} />
          </SideCol>
        ))}
      </div>
    </Shell>
  );
}

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

/* ── professional sketch renderer (base art + per-muscle overlays) ──
   Wired but dormant until core's SKETCH_BODY_ART is populated. Asset refs are
   URLs/data-URIs the illustrator's export provides; each muscle's overlay is
   composited at its glow intensity — the SAME data that drives the schematic. */

function SketchBody({ map, t }: { map: ExerciseBodyMap; t: (k: string) => string }) {
  const art = map.sketch;
  if (!art) return null;
  const muscles = Object.keys(map.intensityOf) as Muscle[];
  return (
    <Shell map={map} hovered={null} t={t}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {(["front", "back"] as const).map((side) => (
          <SideCol key={side} side={side} label={t(`w.analyze.exp.anatomy.map.${side}`)}>
            <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={art[side]} alt="" aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
              {muscles.map((m) => {
                const overlay = art.overlays[m]?.[side];
                const intensity = map.intensityOf[m] ?? 0;
                if (!overlay || intensity <= 0) return null;
                // eslint-disable-next-line @next/next/no-img-element
                return <img key={m} src={overlay} alt="" aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", opacity: fillOpacity(intensity) }} />;
              })}
            </div>
          </SideCol>
        ))}
      </div>
    </Shell>
  );
}
