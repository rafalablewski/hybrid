import { useEffect, useRef, useState } from "react";
import { View, Image, AccessibilityInfo } from "react-native";
import Svg, { G, Line as SvgLine, Circle, Polyline, Path, Rect } from "react-native-svg";
import {
  exerciseAnimation,
  skeletonAt,
  type ExerciseAnimation,
  type LoadGlyph,
  type Skeleton,
} from "@hybrid/core";
import { useTheme, type Palette } from "../../lib/theme";

/**
 * The exercise-page MOVEMENT DEMO (mobile) — the swappable animation surface.
 *
 * It resolves the animation spec from @hybrid/core (exerciseAnimation) and
 * switches on its `kind`. TODAY only the procedural `skeleton` renderer exists;
 * when professional SKETCH animation lands, register the asset in core's
 * SKETCH_ANIMATIONS and add the `sketch` branch here — the muscle/cues section
 * (exercise-anatomy.tsx) never changes. Parity:
 * apps/web/components/aurora/exercise-animation.tsx. Returns null for a name the
 * DB doesn't know (custom lifts, cardio sports).
 */
export default function AuroraExerciseAnimation({ name, active = true }: { name: string; active?: boolean }) {
  const { palette: C } = useTheme();
  const anim = exerciseAnimation(name);
  if (!anim) return null;
  switch (anim.kind) {
    case "skeleton":
      return <SkeletonFigure C={C} frames={anim.frames} load={anim.load} cycleMs={anim.cycleMs} active={active} />;
    case "sketch":
      return <SketchFigure anim={anim} active={active} />;
  }
}

/* ── procedural stick-figure renderer (today's default) ── */

function SkeletonFigure({ C, frames, load, cycleMs, active }: { C: Palette; frames: Skeleton[]; load: LoadGlyph; cycleMs: number; active: boolean }) {
  const [phase, setPhase] = useState(0.28);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // Paused (sheet closed) → hold a representative mid-rep pose, no loop.
    if (!active) {
      setPhase(0.28);
      return;
    }
    let cancelled = false;
    let start = 0;
    const loop = (now: number) => {
      if (cancelled) return;
      if (!start) start = now;
      setPhase((((now - start) % cycleMs) / cycleMs));
      rafRef.current = requestAnimationFrame(loop);
    };
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      if (reduce) {
        setPhase(0.28); // a representative mid-rep pose, held still
        return;
      }
      rafRef.current = requestAnimationFrame(loop);
    });
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [cycleMs, active]);

  const s = skeletonAt(frames, phase);
  const seg = (a: { x: number; y: number }, b: { x: number; y: number }, key: string) => (
    <SvgLine key={key} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={C.chalk} strokeWidth={3.4} strokeLinecap="round" />
  );
  const accent = C.lime;
  const barPath = frames.map((f) => `${f.bar.x},${f.bar.y}`).join(" ");

  return (
    <Svg viewBox="0 0 100 100" width="100%" height="100%">
      {/* ground */}
      <SvgLine x1={8} y1={94} x2={92} y2={94} stroke={C.line} strokeWidth={1.5} strokeDasharray="2 3" />
      {/* the bar's travel path — a faint dotted trace of the movement */}
      {frames.length > 1 && load !== "bodyweight" ? (
        <Polyline points={barPath} fill="none" stroke={accent} strokeWidth={1} strokeDasharray="2 2.5" opacity={0.4} />
      ) : null}
      {/* body segments */}
      {seg(s.head, s.shoulder, "neck")}
      {seg(s.shoulder, s.hip, "torso")}
      {seg(s.shoulder, s.elbow, "uarm")}
      {seg(s.elbow, s.hand, "farm")}
      {seg(s.hip, s.knee, "thigh")}
      {seg(s.knee, s.ankle, "shin")}
      {/* foot */}
      <SvgLine x1={s.ankle.x - 1} y1={s.ankle.y} x2={s.ankle.x + 6} y2={s.ankle.y} stroke={C.chalk} strokeWidth={3} strokeLinecap="round" />
      {/* head */}
      <Circle cx={s.head.x} cy={s.head.y} r={5.2} fill={C.ink} stroke={C.chalk} strokeWidth={2.6} />
      {/* joints */}
      {[s.shoulder, s.hip, s.knee, s.elbow].map((j, i) => (
        <Circle key={i} cx={j.x} cy={j.y} r={1.6} fill={C.ash} />
      ))}
      {/* load glyph */}
      <LoadSVG load={load} x={s.bar.x} y={s.bar.y} accent={accent} />
    </Svg>
  );
}

function LoadSVG({ load, x, y, accent }: { load: LoadGlyph; x: number; y: number; accent: string }) {
  if (load === "bodyweight") return null;
  if (load === "kettlebell")
    return (
      <G>
        <Path d={`M${x - 3},${y} q3,-5 6,0`} fill="none" stroke={accent} strokeWidth={2} />
        <Circle cx={x} cy={y + 4} r={4.4} fill={accent} />
      </G>
    );
  if (load === "dumbbell")
    return (
      <G>
        <SvgLine x1={x - 7} y1={y} x2={x + 7} y2={y} stroke={accent} strokeWidth={2.4} strokeLinecap="round" />
        <Rect x={x - 9} y={y - 3.2} width={3} height={6.4} rx={1} fill={accent} />
        <Rect x={x + 6} y={y - 3.2} width={3} height={6.4} rx={1} fill={accent} />
      </G>
    );
  if (load === "fixed") return <Circle cx={x} cy={y} r={3.2} fill="none" stroke={accent} strokeWidth={2.4} />;
  // barbell
  return (
    <G>
      <SvgLine x1={x - 15} y1={y} x2={x + 15} y2={y} stroke={accent} strokeWidth={2.2} strokeLinecap="round" />
      <Rect x={x - 16} y={y - 4} width={3.4} height={8} rx={1} fill={accent} />
      <Rect x={x + 12.6} y={y - 4} width={3.4} height={8} rx={1} fill={accent} />
    </G>
  );
}

/* ── professional sketch renderer (frames cross-faded on a loop) ──
   Wired but dormant until core's SKETCH_ANIMATIONS is populated. Frame refs are
   remote URLs (or bundled asset uris) the illustrator's export provides. */

function SketchFigure({ anim, active }: { anim: Extract<ExerciseAnimation, { kind: "sketch" }>; active: boolean }) {
  const { frames, cycleMs } = anim;
  const [i, setI] = useState(0);

  useEffect(() => {
    if (frames.length <= 1 || !active) return;
    let id: ReturnType<typeof setInterval> | null = null;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) return;
      const per = Math.max(60, cycleMs / frames.length);
      id = setInterval(() => setI((n) => (n + 1) % frames.length), per);
    });
    return () => {
      if (id) clearInterval(id);
    };
  }, [frames.length, cycleMs, active]);

  return (
    <View style={{ width: "100%", aspectRatio: 1 }}>
      {frames.map((src, n) => (
        <Image
          key={n}
          source={{ uri: src }}
          accessibilityIgnoresInvertColors
          resizeMode="contain"
          style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, width: "100%", height: "100%", opacity: n === i ? 1 : 0 }}
        />
      ))}
    </View>
  );
}
