import { useState } from "react";
import { View, Text, Image } from "react-native";
import Svg, { Polygon, Circle } from "react-native-svg";
import {
  exerciseBodyMap,
  type BodyFigure,
  type ExerciseBodyMap,
  type MuscleGlow,
  type Muscle,
} from "@hybrid/core";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { F } from "../../lib/ui";

const poly = (pts: { x: number; y: number }[]) => pts.map((q) => `${q.x},${q.y}`).join(" ");

// Untargeted muscles sit as faint definition; targeted ones glow from a visible
// floor up to full at the top mover.
const fillOpacity = (intensity: number): number =>
  intensity <= 0 ? 0.07 : 0.26 + 0.74 * intensity;

/**
 * The exercise BODY-MAP (mobile) — a front + back mannequin whose muscles glow
 * in proportion to that lift's share of effort (the same muscleActivation data
 * as the ranked bars). Resolves the spec from @hybrid/core (exerciseBodyMap) and
 * switches on its `kind`: TODAY the procedural `schematic` renderer; when
 * commissioned anatomical illustration lands, populate core's SKETCH_BODY_ART
 * and the `sketch` branch composites base art + per-muscle overlays — the
 * muscle/cues section never changes. Parity:
 * apps/web/components/aurora/body-map.tsx. Returns null for an unknown name.
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
    <View style={{ marginTop: 12, borderRadius: 28, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12 }}>
      {children}
      {/* caption — the selected muscle, or the top mover by default */}
      <View style={{ alignItems: "center", marginTop: 6, minHeight: 20 }}>
        {shown ? (
          <Text style={{ fontSize: 13, color: C.chalk }}>
            <Text style={{ fontFamily: F.bold }}>{shown.short}</Text>
            <Text style={{ fontFamily: F.mono, color: txt(C, C.lime) }}>{`   ${shown.pct}%`}</Text>
          </Text>
        ) : null}
      </View>
      {/* legend */}
      <View style={{ flexDirection: "row", justifyContent: "center", flexWrap: "wrap", gap: 14, marginTop: 8 }}>
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
      <View style={{ width: 11, height: 11, borderRadius: 3, backgroundColor: C.lime, opacity, borderWidth: 1, borderColor: C.line }} />
      <Text style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: 0.6, color: C.ash }}>{label}</Text>
    </View>
  );
}

function SideCol({ label, C, children }: { label: string; C: Palette; children: React.ReactNode }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase", color: C.ash, textAlign: "center", marginBottom: 2 }}>{label}</Text>
      <View style={{ width: "100%", aspectRatio: 1 }}>{children}</View>
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
      <View style={{ flexDirection: "row", gap: 8 }}>
        {map.figures.map((fig) => (
          <SideCol key={fig.side} C={C} label={t(`w.analyze.exp.anatomy.map.${fig.side}`)}>
            <Figure C={C} fig={fig} intensityOf={map.intensityOf} selected={selected} onSelect={setSelected} />
          </SideCol>
        ))}
      </View>
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
      {/* faint silhouette so the mannequin reads even where nothing is targeted */}
      {fig.outline.map((part, i) => (
        <Polygon key={`o${i}`} points={poly(part)} fill={C.ash} fillOpacity={0.09} stroke={C.line} strokeWidth={0.5} />
      ))}
      <Circle cx={fig.head.cx} cy={fig.head.cy} r={fig.head.r} fill={C.ash} fillOpacity={0.12} stroke={C.line} strokeWidth={0.5} />
      {/* muscle regions, glowing by share of effort */}
      {fig.regions.map((r) => {
        const intensity = intensityOf[r.muscle] ?? 0;
        const isSel = selected === r.muscle;
        return r.shapes.map((shape, j) => (
          <Polygon
            key={`${r.muscle}-${j}`}
            points={poly(shape)}
            fill={C.lime}
            fillOpacity={isSel ? 1 : fillOpacity(intensity)}
            stroke={isSel ? C.lime : "none"}
            strokeWidth={isSel ? 1 : 0}
            onPress={() => onSelect(r.muscle)}
          />
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
