import { View, Text } from "react-native";
import { exerciseAnatomy, type MuscleActivation } from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { fs, F } from "../../lib/ui";
import AuroraExerciseAnimation from "./exercise-animation";

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

  return (
    <View style={{ marginTop: 22, marginHorizontal: 2, paddingTop: 18, borderTopWidth: 1, borderTopColor: C.line }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: F.black, fontSize: 18, letterSpacing: -0.3, color: C.chalk }}>{t("w.analyze.exp.anatomy.title")}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: 1, textTransform: "uppercase", color: C.ash }}>
          {a.mechanics === "isolation" ? t("w.analyze.exp.anatomy.isolation") : t("w.analyze.exp.anatomy.compound")}
        </Text>
      </View>

      {/* the movement demo (swappable: procedural skeleton today, professional
          sketch later — see exercise-animation.tsx) */}
      <View style={{ marginTop: 14, borderRadius: 20, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2, paddingVertical: 10, alignItems: "center" }}>
        <View style={{ width: "62%", maxWidth: 240, aspectRatio: 1 }}>
          <AuroraExerciseAnimation name={name} />
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
