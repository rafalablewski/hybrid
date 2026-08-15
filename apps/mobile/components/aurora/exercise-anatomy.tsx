import { useState } from "react";
import { View, Text, ScrollView } from "react-native";
import Svg, { Path } from "react-native-svg";
import { exerciseAnatomy, type ExerciseAnatomy, type MuscleActivation } from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { leading, tracking, fs, F, PressScale as Pressable, FIXED_FONT_SCALE } from "../../lib/ui";
import AuroraExerciseMedia from "./exercise-media";
import AuroraBodyMap from "./body-map";
import Sheet from "./sheet";

/* ── muscle-activation bars ── */

function MuscleBar({ C, m, t }: { C: Palette; m: MuscleActivation; t: (k: string) => string }) {
  const primary = m.tier === "primary";
  const barColor = primary ? C.lime : C.ash;
  return (
    <View style={{ marginTop: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <Text maxFontSizeMultiplier={FIXED_FONT_SCALE}
          numberOfLines={1}
          style={{ flex: 1, fontFamily: primary ? F.bold : F.reg, fontSize: fs.body, color: primary ? C.chalk : C.ash }}
        >
          {m.label}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, color: primary ? txt(C, C.lime) : C.ash }}>
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
    <View style={{ marginTop: 16 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.caps, textTransform: "uppercase", color: C.ash }}>{label}</Text>
      {rows.map((m) => <MuscleBar key={m.muscle} C={C} m={m} t={t} />)}
    </View>
  );
}

/* ── the sheet body: the movement demo + muscles + stabilizers + cues ── */

function AnatomyBody({ C, a, name, active, t }: { C: Palette; a: ExerciseAnatomy; name: string; active: boolean; t: (k: string) => string }) {
  return (
    <>
      {/* the movement demo — whatever exerciseMedia resolves: the hand-drawn
          sketch once it exists, the procedural skeleton as today's placeholder
          (see exercise-media.tsx). Loops only while open. */}
      <AuroraExerciseMedia name={name} active={active} />
      <Text style={{ marginTop: 12, marginHorizontal: 2, fontFamily: F.reg, fontSize: fs.body, lineHeight: leading(fs.body), color: C.ash }}>{a.emphasis}</Text>

      {/* muscles worked */}
      <View style={{ marginTop: 20 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.caps, textTransform: "uppercase", color: txt(C, C.lime) }}>{t("w.analyze.exp.anatomy.muscles")}</Text>
        {/* the front/back body-map — the visual, then the ranked bars below */}
        <AuroraBodyMap name={name} t={t} />
        <Group C={C} label={t("w.analyze.exp.anatomy.primary")} rows={a.primary} t={t} />
        <Group C={C} label={t("w.analyze.exp.anatomy.secondary")} rows={a.secondary} t={t} />
      </View>

      {/* stabilizers */}
      <View style={{ marginTop: 20 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.caps, textTransform: "uppercase", color: C.ash }}>{t("w.analyze.exp.anatomy.stabilizers")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          {a.stabilizers.map((sName) => (
            <Text key={sName} style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: tracking.label, color: C.ash, paddingVertical: 5, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2 }}>{sName}</Text>
          ))}
        </View>
      </View>

      {/* how it's done */}
      <View style={{ marginTop: 24 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.caps, textTransform: "uppercase", color: C.ash }}>{t("w.analyze.exp.anatomy.howto")}</Text>
        <View style={{ marginTop: 12, gap: 10 }}>
          {a.cues.map((cue, i) => (
            <View key={cue} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
              <Text style={{ width: 22, fontFamily: F.monoBold, fontSize: fs.caption, color: txt(C, C.lime), lineHeight: leading(fs.caption, "relaxed") }}>{String(i + 1).padStart(2, "0")}</Text>
              <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, lineHeight: leading(fs.body), color: C.chalk }}>{cue}</Text>
            </View>
          ))}
        </View>
      </View>
    </>
  );
}

/**
 * The exercise-page "How it's done" surface (mobile): a compact PILL under the
 * exercise name that opens a BOTTOM SHEET with the movement animation, the
 * muscles it works (with a share-of-effort %), the stabilizers and the form
 * cues. Keeping it in a sheet leaves the page as a clean stats view for the many
 * athletes who already know the lift; the animation only loops while the sheet
 * is open (active={open}). Data comes from @hybrid/core (exercise-anatomy) so
 * this stays at parity with web. Parity:
 * apps/web/components/aurora/exercise-anatomy.tsx. Returns null for a name the
 * DB doesn't know (custom lifts, cardio sports).
 */
export default function AuroraExerciseAnatomy({ name }: { name: string }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const a = exerciseAnatomy(name);
  if (!a) return null;
  const meta = a.mechanics === "isolation" ? t("w.analyze.exp.anatomy.isolation") : t("w.analyze.exp.anatomy.compound");
  // No haptic here, deliberately. Opening a disclosure sheet is presentation,
  // not a state change with consequence — and this was the ONLY sheet in the app
  // that buzzed, so it read as a glitch rather than as feedback. Haptics stay
  // where there is a real detent: a set banked, a rest target reached, a drag
  // picked up or dropped (workout.tsx, use-drag-reorder.ts).
  const openSheet = () => setOpen(true);

  return (
    <>
      <Pressable
        onPress={openSheet}
        accessibilityRole="button"
        style={{
          marginTop: 16, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8,
          borderWidth: 1, borderColor: `${C.lime}66`, backgroundColor: `${C.lime}14`,
          borderRadius: 999, paddingVertical: 8, paddingHorizontal: 16,
        }}
      >
        <Svg viewBox="0 0 16 16" width={13} height={13}><Path d="M5 3.5v9l7-4.5-7-4.5Z" fill={txt(C, C.lime)} /></Svg>
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, letterSpacing: tracking.label, color: txt(C, C.lime) }}>{t("w.analyze.exp.anatomy.title")}</Text>
      </Pressable>

      <Sheet visible={open} onClose={() => setOpen(false)} scroll={false}>
            <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10, flexShrink: 1 }}>
                <Text style={{ fontFamily: F.black, fontSize: fs.heading, letterSpacing: tracking.display, color: C.chalk }}>{t("w.analyze.exp.anatomy.title")}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }}>{meta}</Text>
              </View>
              <Pressable onPress={() => setOpen(false)} hitSlop={12} accessibilityRole="button" accessibilityLabel={t("w.analyze.exp.anatomy.close")}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>✕</Text>
              </Pressable>
            </View>
            {/* No trailing pad — the Sheet's own bottom pad sits below this. */}
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 16 }}>
              <AnatomyBody C={C} a={a} name={name} active={open} t={t} />
            </ScrollView>
      </Sheet>
    </>
  );
}
