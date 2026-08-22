import { useEffect, useState } from "react";
import { View, Text, TextInput } from "react-native";
import {
  TARGET_FIELDS,
  cleanTargetOverride,
  hasOverride,
  type MacroTargets,
  type TargetField,
  type TargetOverride,
} from "@hybrid/core";
import { F, FIXED_FONT_SCALE, fs, leading, MAX_FONT_SCALE, PressScale, space, tracking, ty } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { useLang } from "../../lib/i18n";
import { APill, RADIUS } from "./kit";
import Sheet from "./sheet";

/**
 * MANUAL TARGETS (mobile).
 *
 * FOUR BOXES, AND AN EMPTY ONE MEANS SOMETHING: blank is not zero and not
 * unset — it means that figure keeps adapting, and the placeholder shows what
 * the engine currently computes for it. The fields are deliberately NOT
 * pre-filled with the adaptive values, because pre-filling would silently turn
 * every figure into a manual one the moment anybody opened this sheet.
 */
export default function TargetSheet({
  visible,
  onClose,
  adaptive,
  override,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  /** what the engine computes today, for the placeholders */
  adaptive: MacroTargets;
  override: TargetOverride | null;
  /** null clears the override entirely and hands the numbers back */
  onSave: (next: TargetOverride | null) => void;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const [form, setForm] = useState<Record<TargetField, string>>({ kcal: "", protein: "", carbs: "", fat: "" });
  const [fuel, setFuel] = useState(true);

  // Re-seed on every open: the sheet edits what is SAVED, and a stale draft
  // from a cancelled edit must not be what the athlete sees next time.
  useEffect(() => {
    if (!visible) return;
    setForm({
      kcal: override?.kcal != null ? String(override.kcal) : "",
      protein: override?.protein != null ? String(override.protein) : "",
      carbs: override?.carbs != null ? String(override.carbs) : "",
      fat: override?.fat != null ? String(override.fat) : "",
    });
    setFuel(override?.trainingFuel !== false);
  }, [visible, override]);

  const label: Record<TargetField, string> = {
    kcal: t("w.recovery.nutrition.calories"),
    protein: t("w.recovery.nutrition.protein"),
    carbs: t("w.recovery.nutrition.carbs"),
    fat: t("w.recovery.nutrition.fat"),
  };
  const unit: Record<TargetField, string> = { kcal: "kcal", protein: "g", carbs: "g", fat: "g" };
  const tint: Record<TargetField, string> = {
    kcal: txt(C, C.lime), protein: txt(C, C.blue), carbs: txt(C, C.amber), fat: txt(C, C.red),
  };
  const mono = { fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking(fs.nano, "label"), color: C.ash } as const;

  const save = () => {
    const ov = cleanTargetOverride({ ...form, trainingFuel: fuel });
    // Every box emptied IS a clear — see the prefs route's note.
    onSave(hasOverride(ov) ? ov : null);
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t("w.recovery.nutrition.tg.title")} sub={t("w.recovery.nutrition.tg.sub")}>
      <View style={{ gap: space.sm }}>
        {TARGET_FIELDS.map((f) => (
          <View
            key={f}
            style={{ flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 16 }}
          >
            <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ ...mono, textTransform: "uppercase", color: tint[f], flex: 1 }}>
              {label[f]}
            </Text>
            <TextInput
              value={form[f]}
              onChangeText={(v) => setForm((s) => ({ ...s, [f]: v }))}
              keyboardType="numeric"
              // The placeholder is the ADAPTIVE figure — the number the athlete
              // is choosing to leave alone by leaving the box empty.
              placeholder={t("w.recovery.nutrition.tg.placeholder").replace("{v}", String(adaptive[f]))}
              placeholderTextColor={C.ash}
              accessibilityLabel={label[f]}
              maxFontSizeMultiplier={MAX_FONT_SCALE}
              style={{ width: 140, color: C.chalk, fontFamily: F.black, fontSize: fs.bodyLg, textAlign: "right", paddingVertical: 12 }}
            />
            <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ ...mono, width: 30 }}>{unit[f]}</Text>
          </View>
        ))}
      </View>

      {/* The training bump survives a manual target by default — the app's
          whole thesis is eating for the work done. */}
      <PressScale
        onPress={() => setFuel((v) => !v)}
        accessibilityRole="switch"
        accessibilityState={{ checked: fuel }}
        accessibilityLabel={t("w.recovery.nutrition.tg.fuel")}
        style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingTop: space.lg, paddingHorizontal: 2 }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>
            {t("w.recovery.nutrition.tg.fuel")}
          </Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ ...mono, marginTop: 3, lineHeight: leading(fs.nano, "normal") }}>
            {t("w.recovery.nutrition.tg.fuelSub")}
          </Text>
        </View>
        <View style={{ width: 46, height: 28, borderRadius: RADIUS.pill, backgroundColor: fuel ? C.lime : C.line, justifyContent: "center", padding: 3 }}>
          <View style={{ width: 22, height: 22, borderRadius: RADIUS.pill, backgroundColor: fuel ? C.onAccent : C.ash, transform: [{ translateX: fuel ? 18 : 0 }] }} />
        </View>
      </PressScale>

      <View style={{ gap: space.sm, marginTop: space.xxl }}>
        <APill label={t("w.recovery.nutrition.tg.save")} onPress={save} />
        {hasOverride(override) ? (
          <PressScale
            onPress={() => { onSave(null); onClose(); }}
            accessibilityRole="button"
            accessibilityLabel={t("w.recovery.nutrition.tg.clear")}
            style={{ paddingVertical: 8, alignItems: "center" }}
          >
            <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ ...mono, textTransform: "uppercase" }}>
              {t("w.recovery.nutrition.tg.clear")}
            </Text>
          </PressScale>
        ) : null}
      </View>
    </Sheet>
  );
}

/** The one-line contradiction notice. Rendered where the TARGETS live, not
 *  inside the form, because a mismatch is a standing fact about the athlete's
 *  setup rather than feedback about an edit. */
export function TargetMismatchLine({ macroKcal, deltaKcal }: { macroKcal: number; deltaKcal: number }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const key = deltaKcal > 0 ? "w.recovery.nutrition.tg.mismatchOver" : "w.recovery.nutrition.tg.mismatchUnder";
  return (
    <View style={{ marginTop: space.sm, paddingHorizontal: 2 }}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ ...ty(C, "caption", txt(C, C.amber)) }}>
        {t(key).replace("{n}", String(macroKcal)).replace("{d}", `${Math.abs(deltaKcal)} kcal`)}
      </Text>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ ...ty(C, "caption") }}>
        {t("w.recovery.nutrition.tg.mismatchNote")}
      </Text>
    </View>
  );
}
