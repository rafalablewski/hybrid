import { useEffect, useRef, useState } from "react";
import { View, Text, AccessibilityInfo } from "react-native";
import Svg, { G, Line as SvgLine, Circle, Polyline, Path, Rect } from "react-native-svg";
import {
  exerciseAnatomy,
  skeletonAt,
  type LoadGlyph,
  type MuscleActivation,
  type Skeleton,
} from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { fs, F } from "../../lib/ui";

/* ── the looping stick-figure animation (schematic side profile) ── */

function FigureSVG({ C, frames, load, cycleMs }: { C: Palette; frames: Skeleton[]; load: LoadGlyph; cycleMs: number }) {
  const [phase, setPhase] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
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
  }, [cycleMs]);

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

/* ── muscle-activation bars ── */

function MuscleBar({ C, m, t }: { C: Palette; m: MuscleActivation; t: (k: string) => string }) {
  const primary = m.tier === "primary";
  const barColor = primary ? C.lime : C.ash;
  return (
    <View style={{ marginTop: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <Text
          numberOfLines={1}
          style={{ flex: 1, fontFamily: primary ? F.bold : F.reg, fontSize: fs.body, color: primary ? C.chalk : C.ash }}
        >
          {m.label}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 0.6, color: primary ? txt(C, C.lime) : C.ash }}>
            {t(`w.analyze.exp.anatomy.level.${m.level}`)}
          </Text>
          <Text style={{ fontFamily: F.monoBold, fontSize: fs.body, color: C.chalk }}>{m.pct}%</Text>
        </View>
      </View>
      <View style={{ height: 4, borderRadius: 3, backgroundColor: C.line, overflow: "hidden", marginTop: 5 }}>
        <View style={{ height: "100%", borderRadius: 3, width: `${m.pct}%`, backgroundColor: barColor, opacity: primary ? 1 : 0.6 }} />
      </View>
    </View>
  );
}

function Group({ C, label, rows, t }: { C: Palette; label: string; rows: MuscleActivation[]; t: (k: string) => string }) {
  if (rows.length === 0) return null;
  return (
    <View style={{ marginTop: 18 }}>
      <Text style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: 1.2, textTransform: "uppercase", color: C.ash }}>{label}</Text>
      {rows.map((m) => <MuscleBar key={m.muscle} C={C} m={m} t={t} />)}
    </View>
  );
}

/**
 * The exercise-page ANATOMY section (mobile): a looping schematic animation of
 * the movement, the muscles it works with a share-of-effort %, the stabilizers
 * that brace it, and the step-by-step form cues. Data + geometry come from
 * @hybrid/core (exercise-anatomy) so this renders identically on web. Parity:
 * apps/web/components/aurora/exercise-anatomy.tsx. Returns null for a name the
 * exercise DB doesn't know (custom lifts, cardio sports).
 */
export default function AuroraExerciseAnatomy({ name }: { name: string }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const a = exerciseAnatomy(name);
  if (!a) return null;
  const { animation } = a;

  return (
    <View style={{ marginTop: 22, marginHorizontal: 2, paddingTop: 18, borderTopWidth: 1, borderTopColor: C.line }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: F.black, fontSize: 18, letterSpacing: -0.3, color: C.chalk }}>{t("w.analyze.exp.anatomy.title")}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: 1, textTransform: "uppercase", color: C.ash }}>
          {a.mechanics === "isolation" ? t("w.analyze.exp.anatomy.isolation") : t("w.analyze.exp.anatomy.compound")}
        </Text>
      </View>

      {/* the animated figure */}
      <View style={{ marginTop: 14, borderRadius: 20, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2, paddingVertical: 10, alignItems: "center" }}>
        <View style={{ width: "62%", maxWidth: 240, aspectRatio: 1 }}>
          <FigureSVG C={C} frames={animation.frames} load={animation.load} cycleMs={animation.cycleMs} />
        </View>
      </View>
      <Text style={{ marginTop: 12, marginHorizontal: 2, fontFamily: F.reg, fontSize: fs.body, lineHeight: 19, color: C.ash }}>{a.emphasis}</Text>

      {/* muscles worked */}
      <View style={{ marginTop: 20 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: 1.4, textTransform: "uppercase", color: txt(C, C.lime) }}>{t("w.analyze.exp.anatomy.muscles")}</Text>
        <Group C={C} label={t("w.analyze.exp.anatomy.primary")} rows={a.primary} t={t} />
        <Group C={C} label={t("w.analyze.exp.anatomy.secondary")} rows={a.secondary} t={t} />
      </View>

      {/* stabilizers */}
      <View style={{ marginTop: 20 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: 1.2, textTransform: "uppercase", color: C.ash }}>{t("w.analyze.exp.anatomy.stabilizers")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
          {a.stabilizers.map((sName) => (
            <Text key={sName} style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 0.6, color: C.ash, paddingVertical: 5, paddingHorizontal: 11, borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2 }}>{sName}</Text>
          ))}
        </View>
      </View>

      {/* how it's done */}
      <View style={{ marginTop: 22 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: 1.2, textTransform: "uppercase", color: C.ash }}>{t("w.analyze.exp.anatomy.howto")}</Text>
        <View style={{ marginTop: 12, gap: 10 }}>
          {a.cues.map((cue, i) => (
            <View key={cue} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
              <Text style={{ width: 22, fontFamily: F.monoBold, fontSize: fs.caption, color: txt(C, C.lime), lineHeight: 19 }}>{String(i + 1).padStart(2, "0")}</Text>
              <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, lineHeight: 19, color: C.chalk }}>{cue}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
