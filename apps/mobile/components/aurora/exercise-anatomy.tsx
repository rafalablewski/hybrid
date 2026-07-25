import { useState } from "react";
import { View, Text, Pressable, Modal, ScrollView } from "react-native";
import Svg, { Path } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { exerciseAnatomy, type ExerciseAnatomy, type MuscleActivation } from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useLoggerPrefs } from "../../lib/logger-prefs";
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

/* ── the sheet body: the movement demo + muscles + stabilizers + cues ── */

function AnatomyBody({ C, a, name, active, t }: { C: Palette; a: ExerciseAnatomy; name: string; active: boolean; t: (k: string) => string }) {
  return (
    <>
      {/* the movement demo (swappable: procedural skeleton today, professional
          sketch later — see exercise-animation.tsx). Loops only while open. */}
      <View style={{ borderRadius: 20, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2, paddingVertical: 10, alignItems: "center" }}>
        <View style={{ width: "58%", maxWidth: 220, aspectRatio: 1 }}>
          <AuroraExerciseAnimation name={name} active={active} />
        </View>
      </View>
      <Text style={{ marginTop: 13, marginHorizontal: 2, fontFamily: F.reg, fontSize: fs.body, lineHeight: 19, color: C.ash }}>{a.emphasis}</Text>

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
  const haptics = useLoggerPrefs().haptics;
  const [open, setOpen] = useState(false);
  const a = exerciseAnatomy(name);
  if (!a) return null;
  const meta = a.mechanics === "isolation" ? t("w.analyze.exp.anatomy.isolation") : t("w.analyze.exp.anatomy.compound");
  // a light tap as the sheet opens (respecting the user's haptics preference)
  const openSheet = () => {
    if (haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setOpen(true);
  };

  return (
    <>
      <Pressable
        onPress={openSheet}
        accessibilityRole="button"
        style={{
          marginTop: 16, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 9,
          borderWidth: 1, borderColor: `${C.lime}66`, backgroundColor: `${C.lime}14`,
          borderRadius: 999, paddingVertical: 9, paddingHorizontal: 15,
        }}
      >
        <Svg viewBox="0 0 16 16" width={13} height={13}><Path d="M5 3.5v9l7-4.5-7-4.5Z" fill={txt(C, C.lime)} /></Svg>
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, letterSpacing: 0.4, color: txt(C, C.lime) }}>{t("w.analyze.exp.anatomy.title")}</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: "#0009", justifyContent: "flex-end" }}>
          <Pressable
            onPress={() => {}}
            style={{ maxHeight: "88%", backgroundColor: C.card, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderColor: C.line, paddingTop: 10, paddingHorizontal: 20 }}
          >
            <View style={{ width: 38, height: 4, borderRadius: 3, backgroundColor: C.line, alignSelf: "center", marginTop: 2, marginBottom: 14 }} />
            <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10, flexShrink: 1 }}>
                <Text style={{ fontFamily: F.black, fontSize: 20, letterSpacing: -0.3, color: C.chalk }}>{t("w.analyze.exp.anatomy.title")}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: 1, textTransform: "uppercase", color: C.ash }}>{meta}</Text>
              </View>
              <Pressable onPress={() => setOpen(false)} hitSlop={12} accessibilityRole="button" accessibilityLabel={t("w.analyze.exp.anatomy.close")}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>✕</Text>
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 14, paddingBottom: 30 }}>
              <AnatomyBody C={C} a={a} name={name} active={open} t={t} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
