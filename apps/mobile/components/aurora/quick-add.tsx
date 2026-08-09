import { useMemo, useState } from "react";
import { View, Text, TextInput } from "react-native";
import {
  macroDraft,
  parseQuickAdd,
  quickAddDraft,
  quickAddVocab,
  resolveQuickAdd,
  type QuickAddCandidate,
  type QuickAddDraft,
  type QuickAddMatch,
} from "@hybrid/core";
import { fs, space, tracking, F, leading, PressScale, FIXED_FONT_SCALE, MAX_FONT_SCALE, HIT_SLOP } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { useLang } from "../../lib/i18n";
import { RADIUS } from "./kit";
import { AuroraIcon } from "./icons";

/**
 * QUICK ADD (mobile) — the twin of apps/web/components/aurora/quick-add.tsx.
 *
 * See that file's note. In short: one field parsed live by @hybrid/core, sitting
 * at the top of the picker rather than behind navigation; it SHOWS WHAT IT
 * UNDERSTOOD as a row you tap and does nothing until you tap it, so a wrong
 * match is a visible mistake rather than a wrong diary entry found days later;
 * and a gram phrase against a food with no serving weight on record opens the
 * portion editor instead of logging one serving of an unknown weight.
 */
export default function QuickAdd({
  candidates,
  onLog,
  onPortion,
  entryName,
}: {
  candidates: QuickAddCandidate[];
  onLog: (draft: QuickAddDraft) => void;
  onPortion: (match: QuickAddMatch) => void;
  entryName: string;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const [text, setText] = useState("");

  // The vocabulary is the athlete's language, not English — see quick-add.ts.
  const vocab = useMemo(() => quickAddVocab(t), [t]);
  const parsed = useMemo(() => parseQuickAdd(text, vocab), [text, vocab]);
  const matches = useMemo(() => resolveQuickAdd(parsed, candidates), [parsed, candidates]);

  const typed = text.trim().length > 0;
  const mono = { fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, color: C.ash } as const;

  const commit = (draft: QuickAddDraft) => { onLog(draft); setText(""); };

  const macroPhrase = parsed.kind === "macros"
    ? [
        parsed.facts.kcal != null ? `${parsed.facts.kcal} kcal` : null,
        parsed.facts.protein != null ? `${parsed.facts.protein} g ${t("w.recovery.nutrition.protein")}` : null,
        parsed.facts.carbs != null ? `${parsed.facts.carbs} g ${t("w.recovery.nutrition.carbs")}` : null,
        parsed.facts.fat != null ? `${parsed.facts.fat} g ${t("w.recovery.nutrition.fat")}` : null,
      ].filter(Boolean).join(", ")
    : "";

  const submit = () => {
    // Enter commits the FIRST interpretation, which is the one on screen —
    // never a second-best the reader cannot see.
    if (parsed.kind === "macros") commit(macroDraft(parsed, entryName));
    else if (matches[0] && !matches[0].needsPortion) commit(quickAddDraft(matches[0]));
    else if (matches[0]) onPortion(matches[0]);
  };

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 16 }}>
        <AuroraIcon name="bolt" size={17} color={C.ash} />
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={submit}
          returnKeyType="done"
          placeholder={t("w.recovery.nutrition.qa.placeholder")}
          placeholderTextColor={C.ash}
          accessibilityLabel={t("w.recovery.nutrition.qa.hint")}
          autoCorrect={false}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={{ flex: 1, color: C.chalk, fontFamily: F.reg, fontSize: fs.bodyLg, paddingVertical: 12 }}
        />
        {typed ? (
          <PressScale onPress={() => setText("")} accessibilityRole="button" accessibilityLabel={t("w.recovery.nutrition.clear")} hitSlop={HIT_SLOP}>
            <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: 17, color: C.ash }}>×</Text>
          </PressScale>
        ) : null}
      </View>

      {!typed ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ ...mono, marginTop: space.sm, lineHeight: leading(fs.nano, "normal") }}>
          {t("w.recovery.nutrition.qa.hint")}
        </Text>
      ) : null}

      {/* WHAT IT UNDERSTOOD — a row you tap, never an action already taken. */}
      {typed && parsed.kind === "macros" ? (
        <PressScale
          onPress={() => commit(macroDraft(parsed, entryName))}
          accessibilityRole="button"
          accessibilityLabel={t("w.recovery.nutrition.qa.logMacros").replace("{v}", macroPhrase)}
          style={{ flexDirection: "row", alignItems: "center", gap: space.md, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 14, paddingBottom: 4, paddingHorizontal: 2, marginTop: space.sm }}
        >
          <View style={{ width: 34, height: 34, borderRadius: RADIUS.pill, borderWidth: 1.6, borderColor: C.lime, alignItems: "center", justifyContent: "center" }}>
            <AuroraIcon name="add" size={15} color={txt(C, C.lime)} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>
              {t("w.recovery.nutrition.qa.logMacros").replace("{v}", macroPhrase)}
            </Text>
            {parsed.derivedKcal ? (
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ ...mono, marginTop: 2 }}>
                {t("w.recovery.nutrition.qa.derived")}
              </Text>
            ) : null}
          </View>
        </PressScale>
      ) : null}

      {typed && parsed.kind === "food" ? (
        matches.length === 0 ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: space.md, paddingHorizontal: 2, lineHeight: leading(fs.caption, "relaxed") }}>
            {t("w.recovery.nutrition.qa.noMatch")}
          </Text>
        ) : (
          matches.map((m, i) => (
            <PressScale
              key={m.candidate.id}
              onPress={() => (m.needsPortion ? onPortion(m) : commit(quickAddDraft(m)))}
              accessibilityRole="button"
              accessibilityLabel={m.candidate.name}
              style={{ flexDirection: "row", alignItems: "center", gap: space.md, borderTopWidth: 1, borderTopColor: C.line, paddingVertical: 12, paddingHorizontal: 2, marginTop: i === 0 ? space.sm : 0 }}
            >
              <View style={{ width: 34, height: 34, borderRadius: RADIUS.pill, borderWidth: 1.6, borderColor: m.needsPortion ? C.line : C.lime, alignItems: "center", justifyContent: "center" }}>
                <AuroraIcon name={m.needsPortion ? "chevron-down" : "add"} size={15} color={m.needsPortion ? C.ash : txt(C, C.lime)} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: i === 0 ? F.bold : F.semi, fontSize: fs.body, color: C.chalk }}>
                  {m.candidate.name}
                </Text>
                {/* The QUANTITY it computed, stated — this is the number the
                    reader is being asked to approve. */}
                {m.needsPortion ? (
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.nano, color: txt(C, C.amber), marginTop: 2 }}>
                    {t("w.recovery.nutrition.qa.needsPortion")}
                  </Text>
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm, marginTop: 2 }}>
                    <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>
                      {t("w.recovery.nutrition.qa.servings").replace("{n}", String(m.qty)).replace("{v}", m.candidate.servingLabel)}
                    </Text>
                    <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.chalk, fontVariant: ["tabular-nums"] }}>
                      {Math.round(m.candidate.facts.kcal * m.qty)} kcal
                    </Text>
                  </View>
                )}
              </View>
            </PressScale>
          ))
        )
      ) : null}
    </View>
  );
}
