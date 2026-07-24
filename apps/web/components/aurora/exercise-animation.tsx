"use client";

import { useEffect, useRef, useState } from "react";
import {
  exerciseAnimation,
  skeletonAt,
  type ExerciseAnimation,
  type LoadGlyph,
  type Skeleton,
} from "@hybrid/core";

const C = (v: string) => `var(--color-${v})`;

/**
 * The exercise-page MOVEMENT DEMO (web) — the swappable animation surface.
 *
 * It resolves the animation spec from @hybrid/core (exerciseAnimation) and
 * switches on its `kind`. TODAY only the procedural `skeleton` renderer exists;
 * when professional SKETCH animation lands, register the asset in core's
 * SKETCH_ANIMATIONS and add the `sketch` branch here — the muscle/cues section
 * (exercise-anatomy.tsx) never changes. Returns null for a name the DB doesn't
 * know (custom lifts, cardio sports).
 */
export default function AuroraExerciseAnimation({ name }: { name: string }) {
  const anim = exerciseAnimation(name);
  if (!anim) return null;
  switch (anim.kind) {
    case "skeleton":
      return <SkeletonFigure frames={anim.frames} load={anim.load} cycleMs={anim.cycleMs} />;
    case "sketch":
      return <SketchFigure anim={anim} />;
  }
}

/* ── procedural stick-figure renderer (today's default) ── */

function SkeletonFigure({ frames, load, cycleMs }: { frames: Skeleton[]; load: LoadGlyph; cycleMs: number }) {
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

/* ── professional sketch renderer (frames cross-faded on a loop) ──
   Wired but dormant until core's SKETCH_ANIMATIONS is populated. Frame refs are
   URLs/data-URIs the illustrator's export provides. */

function SketchFigure({ anim }: { anim: Extract<ExerciseAnimation, { kind: "sketch" }> }) {
  const { frames, cycleMs } = anim;
  const [i, setI] = useState(0);

  useEffect(() => {
    if (frames.length <= 1) return;
    const reduce =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const per = Math.max(60, cycleMs / frames.length);
    const id = setInterval(() => setI((n) => (n + 1) % frames.length), per);
    return () => clearInterval(id);
  }, [frames.length, cycleMs]);

  return (
    <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1" }}>
      {frames.map((src, n) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={n}
          src={src}
          alt=""
          aria-hidden
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", opacity: n === i ? 1 : 0, transition: "opacity .12s linear" }}
        />
      ))}
    </div>
  );
}
