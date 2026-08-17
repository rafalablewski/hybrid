import { type RefObject } from "react";
import { View, Text, TextInput } from "react-native";
import {
  macroDraft,
  quickAddDraft,
  PROVENANCE_KEY,
  type PickerAnswer,
  type QuickAddDraft,
  type QuickAddMatch,
} from "@hybrid/core";
import { fs, space, tracking, F, leading, PressScale, FIXED_FONT_SCALE, MAX_FONT_SCALE, HIT_SLOP, HIT_TARGET } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { useLang } from "../../lib/i18n";
import { RADIUS } from "./kit";
import { AuroraIcon, Glyph } from "./icons";
import { PICKER_EDGE, ROW_LEAD } from "./nutrition-kit";

/**
 * THE PICKER FIELD (mobile) — the twin of apps/web/components/aurora/quick-add.tsx.
 *
 * This used to be quick add sitting ABOVE a database search: two inputs, ninety
 * pixels apart, in the same shape with the same left-hand glyph. It is now the
 * screen's ONE field, and quick add is what it does FIRST — the grammar still
 * runs over every keystroke (see core/food-picker.ts), so "40g protein" is still
 * a macro line and "chicken 200g" still resolves to two servings of this
 * athlete's chicken. What was lost is only the duplicate box, and the mono
 * caption underneath that explained how to use it: a field that needs a manual
 * is a field that is not finished, so the question moved into the placeholder.
 *
 * IT STILL SHOWS ITS WORKING. The interpretation is a ROW YOU TAP, never an
 * action already taken, so a phrase that resolved to the wrong chicken is a
 * visible mistake rather than a wrong entry found three days later in the diary.
 * And a gram phrase against a food with no serving weight on record opens the
 * portion editor instead of logging one serving of an unknown weight.
 *
 * The parent owns the text (it also drives the database search off it) and the
 * ANSWER — one read of the grammar, shared, so the field and the screen below it
 * can never disagree about what was typed.
 */

/** The field. The screen's one container; everything else is type on the ground. */
export function PickerField({ value, onChange, onSubmit, onScan, onCancel, inputRef, autoFocus }: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  /** Optional: when the scan lives somewhere always-reachable instead (the
   *  picker moved it to the head, since the field itself is now behind a
   *  toggle and a scanner one tap deeper is a scanner nobody uses). */
  onScan?: () => void;
  /** Leaves search. Rendered as a plain word, never a bordered box — and it has
   *  to exist: the control that OPENED this field is the bottom bar's circle,
   *  and the keyboard covers the bottom bar. An exit you cannot reach while
   *  typing is not an exit. */
  onCancel?: () => void;
  /** So the bar's detached circle can put the cursor here from anywhere on the
   *  screen — the field scrolls away with the content, and once the list is
   *  twenty rows deep there was no way back to it but to scroll. */
  inputRef?: RefObject<TextInput | null>;
  autoFocus?: boolean;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const typed = value.trim().length > 0;

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
    <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: HIT_TARGET, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: space.lg }}>
      <AuroraIcon name="search" size={18} color={C.ash} />
      <TextInput
        ref={inputRef}
        autoFocus={autoFocus}
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        returnKeyType="done"
        placeholder={t("w.recovery.nutrition.pick.placeholder")}
        placeholderTextColor={C.ash}
        accessibilityLabel={t("w.recovery.nutrition.pick.placeholder")}
        autoCorrect={false}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        style={{ flex: 1, color: C.chalk, fontFamily: F.reg, fontSize: fs.bodyLg, paddingVertical: 13 }}
      />
      {typed ? (
        <PressScale onPress={() => onChange("")} accessibilityRole="button" accessibilityLabel={t("w.recovery.nutrition.clear")} hitSlop={HIT_SLOP}>
          <Glyph name="close" size={18} color={C.ash} />
        </PressScale>
      ) : onScan ? (
        // Scanning is the same question asked with a camera, so where the field
        // is always present it stays the field's trailing glyph.
        <PressScale onPress={onScan} accessibilityRole="button" accessibilityLabel={t("w.recovery.nutrition.scan.title")} hitSlop={HIT_SLOP}>
          <Glyph name="barcode" size={20} color={C.ash} />
        </PressScale>
      ) : null}
    </View>
    {onCancel ? (
      <PressScale onPress={onCancel} accessibilityRole="button" hitSlop={HIT_SLOP}>
        <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.semi, fontSize: fs.bodyLg, color: C.ash }}>
          {t("w.recovery.nutrition.cancel")}
        </Text>
      </PressScale>
    ) : null}
    </View>
  );
}

/** WHAT IT UNDERSTOOD — the macro line, or the athlete's own foods ranked across
 *  all four sources. Each row says where it came from, because one list mixing
 *  four sources without saying so is worse than four lists, not better. */
export function Understood({ answer, entryName, onLog, onPortion }: {
  answer: PickerAnswer;
  entryName: string;
  onLog: (draft: QuickAddDraft) => void;
  onPortion: (match: QuickAddMatch) => void;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const mono = { fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, color: C.ash } as const;

  if (answer.kind === "macros") {
    const f = answer.macros.facts;
    const phrase = [
      f.kcal != null && !answer.macros.derivedKcal ? `${f.kcal} kcal` : null,
      f.protein != null ? `${f.protein} g ${t("w.recovery.nutrition.protein")}` : null,
      f.carbs != null ? `${f.carbs} g ${t("w.recovery.nutrition.carbs")}` : null,
      f.fat != null ? `${f.fat} g ${t("w.recovery.nutrition.fat")}` : null,
    ].filter(Boolean).join(", ") || `${f.kcal ?? 0} kcal`;
    return (
      <PressScale
        onPress={() => onLog(macroDraft(answer.macros, entryName))}
        accessibilityRole="button"
        accessibilityLabel={t("w.recovery.nutrition.qa.logMacros").replace("{v}", phrase)}
        style={{ flexDirection: "row", alignItems: "center", gap: space.lg, paddingVertical: 12, paddingHorizontal: PICKER_EDGE, borderBottomWidth: 1, borderBottomColor: C.line }}
      >
        <View style={{ width: ROW_LEAD, height: ROW_LEAD, borderRadius: RADIUS.pill, borderWidth: 1.6, borderColor: C.lime, alignItems: "center", justifyContent: "center" }}>
          <AuroraIcon name="add" size={18} color={txt(C, C.lime)} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>
            {t("w.recovery.nutrition.qa.logMacros").replace("{v}", phrase)}
          </Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ ...mono, marginTop: 3, textTransform: "none" }}>
            {answer.macros.derivedKcal
              ? `${f.kcal} kcal – ${t("w.recovery.nutrition.qa.derived")}`
              : `${f.kcal} kcal`}
          </Text>
        </View>
      </PressScale>
    );
  }

  if (answer.kind !== "matches" || answer.matches.length === 0) return null;

  return (
    <>
      {answer.matches.map((m) => (
        <PressScale
          key={m.candidate.id}
          onPress={() => (m.needsPortion ? onPortion(m) : onLog(quickAddDraft(m)))}
          accessibilityRole="button"
          accessibilityLabel={m.candidate.name}
          style={{ flexDirection: "row", alignItems: "center", gap: space.lg, paddingVertical: 12, paddingHorizontal: PICKER_EDGE, borderBottomWidth: 1, borderBottomColor: C.line }}
        >
          <View style={{ width: ROW_LEAD, height: ROW_LEAD, borderRadius: RADIUS.pill, borderWidth: 1.6, borderColor: m.needsPortion ? C.line : C.lime, alignItems: "center", justifyContent: "center" }}>
            <AuroraIcon name={m.needsPortion ? "chevron-down" : "add"} size={18} color={m.needsPortion ? C.ash : txt(C, C.lime)} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>
              {m.candidate.name}
            </Text>
            {/* The QUANTITY it computed, stated — this is the number the reader
                is being asked to approve. */}
            {m.needsPortion ? (
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.amber), marginTop: 3 }}>
                {t("w.recovery.nutrition.qa.needsPortion")}
              </Text>
            ) : (
              <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 3 }}>
                {t("w.recovery.nutrition.qa.servings").replace("{n}", String(m.qty)).replace("{v}", m.candidate.servingLabel)}
                {"  –  "}
                {Math.round(m.candidate.facts.kcal * m.qty)} kcal
              </Text>
            )}
          </View>
          <Text
            maxFontSizeMultiplier={FIXED_FONT_SCALE}
            style={{ fontFamily: F.monoBold, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }}
          >
            {t(PROVENANCE_KEY[m.candidate.source])}
          </Text>
        </PressScale>
      ))}
    </>
  );
}

/** The line the screen shows when nothing of the athlete's own matched — said
 *  once, above the database results, rather than as an error. */
export function NoneOfYours({ query }: { query: string }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  return (
    <Text
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, paddingVertical: 14, paddingHorizontal: PICKER_EDGE, lineHeight: leading(fs.caption, "relaxed") }}
    >
      {t("w.recovery.nutrition.pick.noneYours").replace("{v}", query)}
    </Text>
  );
}
