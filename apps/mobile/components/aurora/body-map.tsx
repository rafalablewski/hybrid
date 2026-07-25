import { useState } from "react";
import { View, Text } from "react-native";
import Svg, { Polygon, Circle } from "react-native-svg";
import {
  BODY_FIGURES,
  muscleGlows,
  type BodyFigure,
  type MuscleActivation,
  type MuscleGlow,
} from "@hybrid/core";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { F } from "../../lib/ui";

const poly = (pts: { x: number; y: number }[]) => pts.map((q) => `${q.x},${q.y}`).join(" ");

// Untargeted muscles sit as faint definition; targeted ones glow from a visible
// floor up to full at the top mover.
const fillOpacity = (intensity: number): number =>
  intensity <= 0 ? 0.07 : 0.26 + 0.74 * intensity;

/* ── one schematic figure (front or back) ── */

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

/* ── legend swatch ── */

function Swatch({ C, label, opacity }: { C: Palette; label: string; opacity: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 11, height: 11, borderRadius: 3, backgroundColor: C.lime, opacity, borderWidth: 1, borderColor: C.line }} />
      <Text style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: 0.6, color: C.ash }}>{label}</Text>
    </View>
  );
}

/**
 * The exercise BODY-MAP (mobile): a front + back schematic mannequin whose
 * muscles glow in proportion to that lift's share of effort — the same
 * muscleActivation data as the ranked bars, shown as a picture. Rendered inside
 * the "How it's done" sheet, right above the muscle bars. Pure shared geometry
 * from @hybrid/core (body-map) so it stays at parity with web. Parity:
 * apps/web/components/aurora/body-map.tsx. Tap a muscle for its name + %.
 */
export default function AuroraBodyMap({ activation, t }: { activation: MuscleActivation[]; t: (k: string) => string }) {
  const { palette: C } = useTheme();
  const [selected, setSelected] = useState<string | null>(null);
  const glow = muscleGlows(activation);
  const intensityOf: Record<string, number> = {};
  const glowOf: Record<string, MuscleGlow> = {};
  for (const g of glow) {
    intensityOf[g.muscle] = g.intensity;
    glowOf[g.muscle] = g;
  }
  // the caption defaults to the top mover; tapping swaps it in
  const shown = (selected && glowOf[selected]) || glow[0];
  const sides: { fig: BodyFigure; label: string }[] = BODY_FIGURES.map((fig) => ({
    fig,
    label: t(`w.analyze.exp.anatomy.map.${fig.side}`),
  }));

  return (
    <View style={{ marginTop: 12, borderRadius: 20, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12 }}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {sides.map(({ fig, label }) => (
          <View key={fig.side} style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase", color: C.ash, textAlign: "center", marginBottom: 2 }}>{label}</Text>
            <View style={{ width: "100%", aspectRatio: 1 }}>
              <Figure C={C} fig={fig} intensityOf={intensityOf} selected={selected} onSelect={setSelected} />
            </View>
          </View>
        ))}
      </View>
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
