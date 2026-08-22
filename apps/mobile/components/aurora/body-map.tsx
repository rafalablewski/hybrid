import { useState } from "react";
import { View, Text, Image } from "react-native";
import Svg, { Path, Circle, Defs, ClipPath, G, Line as SvgLine } from "react-native-svg";
import {
  exerciseBodyMap,
  bodyPath,
  muscleFibres,
  type BodyFigure,
  type ExerciseBodyMap,
  type MuscleGlow,
  type Muscle,
} from "@hybrid/core";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { fs, tracking, F } from "../../lib/ui";
import { RADIUS } from "./kit";


// Untargeted muscles sit as faint definition; targeted ones glow from a visible
// floor up to full at the top mover.
const fillOpacity = (intensity: number): number =>
  intensity <= 0 ? 0.07 : 0.26 + 0.74 * intensity;

/**
 * THE FIGURE IS A TRACE — the instrument family's own form, applied to the one
 * picture that was still a set of filled blobs.
 *
 * This is what closes the "commissioned anatomical illustration" case rather
 * than buying it. What separates an anatomical drawing from a silhouette is not
 * resolution: it is that the muscles are DRAWN — a contour, and fibres running
 * the length of the belly. Both are geometry, and core already holds it
 * (`bodyPath` for the contour, `muscleFibres` for the grain).
 *
 * So intensity is carried by INK rather than by paint: a worked muscle gets a
 * firmer contour and darker fibres, an untouched one stays a hairline. The fill
 * remains, faint, only so a muscle is a tappable area rather than a set of
 * lines with gaps between them.
 */
/** The contour's weight — a hairline when untouched, drawn when worked. */
const strokeWeight = (intensity: number): number => 0.45 + 0.75 * intensity;
/** The grain's ink. Never zero: an untouched muscle is still anatomy. */
const fibreOpacity = (intensity: number): number => 0.12 + 0.55 * intensity;
/** A filled muscle would fight its own contour, so the fill is a whisper. */
const areaOpacity = (intensity: number): number => (intensity <= 0 ? 0.03 : 0.05 + 0.22 * intensity);

/**
 * The exercise BODY-MAP (mobile) — a front + back mannequin whose muscles glow
 * in proportion to that lift's share of effort (the same muscleActivation data
 * as the ranked bars). Resolves the spec from @hybrid/core (exerciseBodyMap)
 * and switches on its `kind`: TODAY the procedural `schematic` renderer; when
 * commissioned anatomical illustration lands, populate core's SKETCH_BODY_ART
 * and the `sketch` branch composites base art + per-muscle overlays — the
 * muscle/cues section never changes. Returns null for an unknown name.
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

function Shell({ C, map, selectedGlow, t, children }: { C: Palette; map: ExerciseBodyMap; selectedGlow: MuscleGlow | null; t: (k: string) => string; children: React.ReactNode }) {
  const shown = selectedGlow || map.glow[0];
  return (
    <View style={{ marginTop: 12, borderRadius: RADIUS.card, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 }}>
      {children}
      {/* caption — the selected muscle, or the top mover by default */}
      <View style={{ alignItems: "center", marginTop: 6, minHeight: 20 }}>
        {shown ? (
          <Text style={{ fontSize: fs.body, color: C.chalk }}>
            <Text style={{ fontFamily: F.bold }}>{shown.short}</Text>
            <Text style={{ fontFamily: F.mono, color: txt(C, C.lime) }}>{`   ${shown.pct}%`}</Text>
          </Text>
        ) : null}
      </View>
      {/* legend */}
      <View style={{ flexDirection: "row", justifyContent: "center", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
        <Swatch C={C} label={t("w.analyze.exp.anatomy.map.primary")} opacity={fillOpacity(1)} />
        <Swatch C={C} label={t("w.analyze.exp.anatomy.map.secondary")} opacity={fillOpacity(0.4)} />
        <Swatch C={C} label={t("w.analyze.exp.anatomy.map.off")} opacity={fillOpacity(0)} />
      </View>
    </View>
  );
}

function Swatch({ C, label, opacity }: { C: Palette; label: string; opacity: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 11, height: 11, borderRadius: RADIUS.mark, backgroundColor: C.lime, opacity, borderWidth: 1, borderColor: C.line }} />
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, color: C.ash }}>{label}</Text>
    </View>
  );
}

function SideCol({ label, C, children }: { label: string; C: Palette; children: React.ReactNode }) {
  return (
    <View style={{ flex: 1 }}>
      {label ? (
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.caps, textTransform: "uppercase", color: C.ash, textAlign: "center", marginBottom: 2 }}>{label}</Text>
      ) : null}
      <View style={{ width: "100%", aspectRatio: 1 }}>{children}</View>
    </View>
  );
}

/**
 * THE MANNEQUIN PAIR — front and back, muscles lit by whatever intensities the
 * caller resolved. Exported because the session summary's body panel draws the
 * same figure as this page: it feeds `sessionMuscleGlows` where the exercise
 * page feeds `muscleGlows`, and a second copy of the renderer is exactly how
 * the two would come to disagree about what "lit" means.
 *
 * It carries no card, no caption and no legend — those belong to whichever
 * surface is showing it.
 */
export function BodyFigures({
  figures,
  intensityOf,
  selected,
  onSelect,
  label,
  gap = 8,
}: {
  figures: BodyFigure[];
  intensityOf: Record<string, number>;
  selected?: string | null;
  onSelect?: (m: string) => void;
  label?: (side: BodyFigure["side"]) => string;
  gap?: number;
}) {
  const { palette: C } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap }}>
      {figures.map((fig) => (
        <SideCol key={fig.side} C={C} label={label ? label(fig.side) : ""}>
          <Figure C={C} fig={fig} intensityOf={intensityOf} selected={selected ?? null} onSelect={onSelect ?? (() => {})} />
        </SideCol>
      ))}
    </View>
  );
}

/* ── procedural schematic renderer (today's default) ── */

function SchematicBody({ map, t }: { map: ExerciseBodyMap; t: (k: string) => string }) {
  const { palette: C } = useTheme();
  const [selected, setSelected] = useState<string | null>(null);
  const glowOf: Record<string, MuscleGlow> = {};
  for (const g of map.glow) glowOf[g.muscle] = g;

  return (
    <Shell C={C} map={map} selectedGlow={(selected && glowOf[selected]) || null} t={t}>
      <BodyFigures
        figures={map.figures}
        intensityOf={map.intensityOf}
        selected={selected}
        onSelect={setSelected}
        label={(side) => t(`w.analyze.exp.anatomy.map.${side}`)}
      />
    </Shell>
  );
}

function Figure({
  C,
  fig,
  intensityOf,
  selected,
  onSelect,
}: {
  C: Palette;
  fig: BodyFigure;
  intensityOf: Record<string, number>;
  selected: string | null;
  onSelect: (m: string) => void;
}) {
  return (
    <Svg viewBox="0 0 100 100" width="100%" height="100%">
      <Defs>
        {/* One clip per muscle shape, so its grain stops at its own edge. */}
        {fig.regions.map((r) =>
          r.shapes.map((shape, j) => (
            <ClipPath key={`c-${r.muscle}-${j}`} id={`c-${fig.side}-${r.muscle}-${j}`}>
              <Path d={bodyPath(shape)} />
            </ClipPath>
          )),
        )}
      </Defs>

      {/* THE SILHOUETTE, DRAWN. Smoothed by core's `bodyPath`, which fits a
          spline THROUGH the authored points — the anatomy stays where it was
          placed and the segments between arrive curved. As straight polygons
          the arms were literal rectangles and the figure read as a toy. */}
      {fig.outline.map((part, i) => (
        <Path key={`o${i}`} d={bodyPath(part)} fill={C.ash} fillOpacity={0.05} stroke={C.ash} strokeOpacity={0.34} strokeWidth={0.5} />
      ))}
      <Circle cx={fig.head.cx} cy={fig.head.cy} r={fig.head.r} fill={C.ash} fillOpacity={0.05} stroke={C.ash} strokeOpacity={0.34} strokeWidth={0.5} />

      {/* EVERY MUSCLE: a whisper of area so it is tappable, its own contour,
          and the grain inside it. Intensity rides the INK. */}
      {fig.regions.map((r) => {
        const intensity = intensityOf[r.muscle] ?? 0;
        const isSel = selected === r.muscle;
        const ink = isSel ? 1 : intensity;
        return r.shapes.map((shape, j) => (
          <G key={`${r.muscle}-${j}`} onPress={() => onSelect(r.muscle)}>
            <Path d={bodyPath(shape)} fill={C.lime} fillOpacity={isSel ? 0.34 : areaOpacity(intensity)} />
            <G clipPath={`url(#c-${fig.side}-${r.muscle}-${j})`}>
              {muscleFibres(shape).map(([a, b], k) => (
                <SvgLine
                  key={k}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={C.lime}
                  strokeOpacity={fibreOpacity(ink)}
                  strokeWidth={0.42}
                  strokeLinecap="round"
                />
              ))}
            </G>
            <Path
              d={bodyPath(shape)}
              fill="none"
              stroke={C.lime}
              strokeOpacity={isSel ? 1 : 0.24 + 0.66 * intensity}
              strokeWidth={strokeWeight(ink)}
              strokeLinejoin="round"
            />
          </G>
        ));
      })}
    </Svg>
  );
}

/* ── professional sketch renderer (base art + per-muscle overlays) ──
   Wired but dormant until core's SKETCH_BODY_ART is populated. Asset refs are
   remote URLs (or bundled asset uris); each muscle's overlay is composited at
   its glow intensity — the SAME data that drives the schematic. */

function SketchBody({ map, t }: { map: ExerciseBodyMap; t: (k: string) => string }) {
  const { palette: C } = useTheme();
  const art = map.sketch;
  if (!art) return null;
  const muscles = Object.keys(map.intensityOf) as Muscle[];
  return (
    <Shell C={C} map={map} selectedGlow={null} t={t}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {(["front", "back"] as const).map((side) => (
          <SideCol key={side} C={C} label={t(`w.analyze.exp.anatomy.map.${side}`)}>
            <Image source={{ uri: art[side] }} resizeMode="contain" accessibilityIgnoresInvertColors style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, width: "100%", height: "100%" }} />
            {muscles.map((m) => {
              const overlay = art.overlays[m]?.[side];
              const intensity = map.intensityOf[m] ?? 0;
              if (!overlay || intensity <= 0) return null;
              return <Image key={m} source={{ uri: overlay }} resizeMode="contain" accessibilityIgnoresInvertColors style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, width: "100%", height: "100%", opacity: fillOpacity(intensity) }} />;
            })}
          </SideCol>
        ))}
      </View>
    </Shell>
  );
}
