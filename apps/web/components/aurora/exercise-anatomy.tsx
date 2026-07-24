"use client";

import { useEffect, useRef, useState } from "react";
import {
  exerciseAnatomy,
  skeletonAt,
  fs,
  type LoadGlyph,
  type MuscleActivation,
  type Skeleton,
} from "@hybrid/core";
import { useLang } from "@/lib/i18n";

const C = (v: string) => `var(--color-${v})`;
const monoRow = (size: number, color: string) => ({
  fontFamily: "var(--font-mono)" as const,
  fontSize: size,
  letterSpacing: 0.6,
  color,
});

/* ── the looping stick-figure animation (schematic side profile) ── */

function FigureSVG({ frames, load, cycleMs }: { frames: Skeleton[]; load: LoadGlyph; cycleMs: number }) {
  const [phase, setPhase] = useState(0);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setPhase(0.28); // a representative mid-rep pose, held still
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      setPhase((((now - start) % cycleMs) / cycleMs));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [cycleMs]);

  const s = skeletonAt(frames, phase);
  const line = (a: { x: number; y: number }, b: { x: number; y: number }, key: string) => (
    <line key={key} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={C("chalk")} strokeWidth={3.4} strokeLinecap="round" />
  );
  const accent = C("lime");
  const barPath = frames.map((f) => `${f.bar.x},${f.bar.y}`).join(" ");

  return (
    <svg viewBox="0 0 100 100" width="100%" style={{ display: "block", maxHeight: 240 }} aria-hidden>
      {/* ground */}
      <line x1={8} y1={94} x2={92} y2={94} stroke={C("line")} strokeWidth={1.5} strokeDasharray="2 3" />
      {/* the bar's travel path — a faint dotted trace of the movement */}
      {frames.length > 1 && load !== "bodyweight" && (
        <polyline points={barPath} fill="none" stroke={accent} strokeWidth={1} strokeDasharray="2 2.5" opacity={0.4} />
      )}
      {/* body segments */}
      {line(s.head, s.shoulder, "neck")}
      {line(s.shoulder, s.hip, "torso")}
      {line(s.shoulder, s.elbow, "uarm")}
      {line(s.elbow, s.hand, "farm")}
      {line(s.hip, s.knee, "thigh")}
      {line(s.knee, s.ankle, "shin")}
      {/* foot */}
      <line x1={s.ankle.x - 1} y1={s.ankle.y} x2={s.ankle.x + 6} y2={s.ankle.y} stroke={C("chalk")} strokeWidth={3} strokeLinecap="round" />
      {/* head */}
      <circle cx={s.head.x} cy={s.head.y} r={5.2} fill={C("ink")} stroke={C("chalk")} strokeWidth={2.6} />
      {/* joints */}
      {[s.shoulder, s.hip, s.knee, s.elbow].map((j, i) => (
        <circle key={i} cx={j.x} cy={j.y} r={1.6} fill={C("ash")} />
      ))}
      {/* the load glyph at the hands/bar */}
      <LoadSVG load={load} x={s.bar.x} y={s.bar.y} accent={accent} />
    </svg>
  );
}

function LoadSVG({ load, x, y, accent }: { load: LoadGlyph; x: number; y: number; accent: string }) {
  if (load === "bodyweight") return null;
  if (load === "kettlebell")
    return (
      <g>
        <path d={`M${x - 3},${y} q3,-5 6,0`} fill="none" stroke={accent} strokeWidth={2} />
        <circle cx={x} cy={y + 4} r={4.4} fill={accent} />
      </g>
    );
  if (load === "dumbbell")
    return (
      <g stroke={accent} strokeWidth={2.4} strokeLinecap="round">
        <line x1={x - 7} y1={y} x2={x + 7} y2={y} />
        <rect x={x - 9} y={y - 3.2} width={3} height={6.4} rx={1} fill={accent} stroke="none" />
        <rect x={x + 6} y={y - 3.2} width={3} height={6.4} rx={1} fill={accent} stroke="none" />
      </g>
    );
  if (load === "fixed")
    return <circle cx={x} cy={y} r={3.2} fill="none" stroke={accent} strokeWidth={2.4} />;
  // barbell
  return (
    <g stroke={accent} strokeWidth={2.2} strokeLinecap="round">
      <line x1={x - 15} y1={y} x2={x + 15} y2={y} />
      <rect x={x - 16} y={y - 4} width={3.4} height={8} rx={1} fill={accent} stroke="none" />
      <rect x={x + 12.6} y={y - 4} width={3.4} height={8} rx={1} fill={accent} stroke="none" />
    </g>
  );
}

/* ── the muscle-activation bars ── */

function MuscleBar({ m, t }: { m: MuscleActivation; t: (k: string) => string }) {
  const primary = m.tier === "primary";
  const barColor = primary ? C("lime") : C("ash");
  const levelKey = `w.analyze.exp.anatomy.level.${m.level}`;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", rowGap: 4, columnGap: 10, marginTop: 12 }}>
      <span style={{ fontSize: fs.body, fontWeight: primary ? 700 : 500, color: primary ? C("chalk") : C("ash"), minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.label}</span>
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8, whiteSpace: "nowrap" }}>
        <span style={monoRow(9, primary ? "var(--lime-text)" : C("ash"))}>{t(levelKey)}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, fontWeight: 700, color: C("chalk") }}>{m.pct}%</span>
      </span>
      <span style={{ gridColumn: "1 / -1", height: 4, borderRadius: 3, background: C("line"), overflow: "hidden" }}>
        <span style={{ display: "block", height: "100%", borderRadius: 3, width: `${m.pct}%`, background: barColor, opacity: primary ? 1 : 0.6 }} />
      </span>
    </div>
  );
}

function Group({ label, rows, t }: { label: string; rows: MuscleActivation[]; t: (k: string) => string }) {
  if (rows.length === 0) return null;
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ ...monoRow(9.5, C("ash")), letterSpacing: 1.2, textTransform: "uppercase" }}>{label}</div>
      {rows.map((m) => <MuscleBar key={m.muscle} m={m} t={t} />)}
    </div>
  );
}

/**
 * The exercise-page ANATOMY section (web): a looping schematic animation of the
 * movement, the muscles it works with a share-of-effort %, the stabilizers that
 * brace it, and the step-by-step form cues. Data + geometry come from
 * @hybrid/core (exercise-anatomy) so this renders identically on mobile. Returns
 * null for a name the exercise DB doesn't know (custom lifts, cardio sports).
 */
export default function AuroraExerciseAnatomy({ name }: { name: string }) {
  const { t } = useLang();
  const a = exerciseAnatomy(name);
  if (!a) return null;
  const { animation } = a;

  return (
    <section style={{ margin: "22px 2px 0", paddingTop: 18, borderTop: `1px solid ${C("line")}` }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <h2 style={{ fontWeight: 900, fontSize: 18, letterSpacing: -0.3, margin: 0, color: C("chalk") }}>{t("w.analyze.exp.anatomy.title")}</h2>
        <span style={{ ...monoRow(9.5, C("ash")), letterSpacing: 1, textTransform: "uppercase" }}>{a.mechanics === "isolation" ? t("w.analyze.exp.anatomy.isolation") : t("w.analyze.exp.anatomy.compound")}</span>
      </div>

      {/* the animated figure */}
      <div style={{ marginTop: 14, borderRadius: 20, border: `1px solid ${C("line")}`, background: C("ink2"), padding: "10px 14px", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "62%", maxWidth: 240 }}>
          <FigureSVG frames={animation.frames} load={animation.load} cycleMs={animation.cycleMs} />
        </div>
      </div>
      <p style={{ margin: "12px 2px 0", fontSize: fs.body, lineHeight: 1.5, color: C("ash") }}>{a.emphasis}</p>

      {/* muscles worked */}
      <div style={{ marginTop: 20 }}>
        <div style={{ ...monoRow(9.5, C("ash")), letterSpacing: 1.4, textTransform: "uppercase", color: "var(--lime-text)" }}>{t("w.analyze.exp.anatomy.muscles")}</div>
        <Group label={t("w.analyze.exp.anatomy.primary")} rows={a.primary} t={t} />
        <Group label={t("w.analyze.exp.anatomy.secondary")} rows={a.secondary} t={t} />
      </div>

      {/* stabilizers */}
      <div style={{ marginTop: 20 }}>
        <div style={{ ...monoRow(9.5, C("ash")), letterSpacing: 1.2, textTransform: "uppercase" }}>{t("w.analyze.exp.anatomy.stabilizers")}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
          {a.stabilizers.map((sName) => (
            <span key={sName} style={{ ...monoRow(10.5, C("ash")), padding: "5px 11px", borderRadius: 999, border: `1px solid ${C("line")}`, background: C("ink2") }}>{sName}</span>
          ))}
        </div>
      </div>

      {/* how it's done */}
      <div style={{ marginTop: 22 }}>
        <div style={{ ...monoRow(9.5, C("ash")), letterSpacing: 1.2, textTransform: "uppercase" }}>{t("w.analyze.exp.anatomy.howto")}</div>
        <ol style={{ margin: "12px 0 0", padding: 0, listStyle: "none" }}>
          {a.cues.map((cue, i) => (
            <li key={cue} style={{ display: "grid", gridTemplateColumns: "22px 1fr", gap: 10, alignItems: "start", marginTop: 10 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, fontWeight: 700, color: "var(--lime-text)", lineHeight: 1.5 }}>{String(i + 1).padStart(2, "0")}</span>
              <span style={{ fontSize: fs.body, lineHeight: 1.5, color: C("chalk") }}>{cue}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
