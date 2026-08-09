import { useMemo, useState } from "react";
import { View, Text } from "react-native";
import {
  copyDayPlan,
  copySources,
  type CopyableEntry,
  type CopyPlan,
  type CopySource,
} from "@hybrid/core";
import { fs, space, tracking, F, leading, PressScale, FIXED_FONT_SCALE, MAX_FONT_SCALE } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { useLang } from "../../lib/i18n";
import { RADIUS } from "./kit";
import { AuroraIcon } from "./icons";
import Sheet from "./sheet";

/**
 * COPY A DAY (mobile) — the twin of apps/web/components/aurora/copy-day.tsx.
 *
 * See that file's note. In short: two steps, and the second is the point — the
 * sheet states the plan (how many items, how much energy, and whether the
 * target already has food) before it writes it, computed by the SAME
 * @hybrid/core copyDayPlan that produces the rows, so the sentence agreed to
 * and the entries that land cannot disagree. Copying appends and never
 * replaces, and the confirm step says so in words when the target is not empty.
 */
export default function CopyDaySheet({
  visible,
  onClose,
  logs,
  to,
  toLabel,
  partLabel,
  onCopy,
  busy,
  message,
}: {
  visible: boolean;
  onClose: () => void;
  logs: CopyableEntry[];
  /** the day being copied INTO */
  to: string;
  /** localized label for the target day */
  toLabel: string;
  /** localized name for a part key */
  partLabel: (key: string) => string;
  onCopy: (plan: CopyPlan) => void;
  busy?: boolean;
  message?: string;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const [from, setFrom] = useState<string | null>(null);
  const [parts, setParts] = useState<string[] | null>(null); // null = whole day

  const sources = useMemo(() => copySources(logs, { to }), [logs, to]);
  const source = sources.find((s) => s.date === from) ?? null;
  const plan = useMemo(
    () => (from ? copyDayPlan(logs, { from, to, parts: parts ?? undefined }) : null),
    [logs, from, to, parts],
  );

  const mono = { fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, color: C.ash } as const;

  const sourceLabel = (s: CopySource) =>
    s.daysAgo === 1
      ? t("w.recovery.nutrition.copyYesterday")
      : t("w.recovery.nutrition.copyDaysAgo").replace("{n}", String(s.daysAgo));

  const close = () => { setFrom(null); setParts(null); onClose(); };

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={t("w.recovery.nutrition.copyDay")}
      sub={t("w.recovery.nutrition.copyTo").replace("{v}", toLabel)}
    >
      {sources.length === 0 ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, lineHeight: leading(fs.caption, "relaxed"), paddingVertical: space.sm, paddingHorizontal: 2 }}>
          {t("w.recovery.nutrition.copyNoSources")}
        </Text>
      ) : (
        <>
          {/* STEP ONE — which day. Each row states what is actually on it, so
              the choice is made from content rather than from a bare date. */}
          <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ ...mono, textTransform: "uppercase" }}>
            {t("w.recovery.nutrition.copyFrom")}
          </Text>
          {sources.map((s, i) => {
            const on = s.date === from;
            return (
              <PressScale
                key={s.date}
                onPress={() => { setFrom(s.date); setParts(null); }}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={sourceLabel(s)}
                style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: 12, paddingHorizontal: 2, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}
              >
                <View style={{
                  width: 22, height: 22, borderRadius: RADIUS.pill,
                  borderWidth: 2, borderColor: on ? C.lime : C.line,
                  backgroundColor: on ? C.lime : "transparent",
                  alignItems: "center", justifyContent: "center",
                }}>
                  {on ? <AuroraIcon name="check" size={11} color={C.onAccent} /> : null}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>
                    {sourceLabel(s)}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm, marginTop: 2 }}>
                    <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.chalk, fontVariant: ["tabular-nums"] }}>
                      {s.kcal} kcal
                    </Text>
                    <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>
                      {t("w.recovery.nutrition.copyEntries").replace("{n}", String(s.entries))}
                    </Text>
                  </View>
                </View>
              </PressScale>
            );
          })}

          {/* STEP TWO — how much of it. Absent until a day is picked: parts of
              a day nobody has chosen are chips that mean nothing. No heading —
              the first chip IS the label. */}
          {source ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.lg }}>
              <Chip label={t("w.recovery.nutrition.copyWhole")} on={parts === null} onPress={() => setParts(null)} />
              {source.parts.map((p) => (
                <Chip key={p} label={partLabel(p)} on={parts?.length === 1 && parts[0] === p} onPress={() => setParts([p])} />
              ))}
            </View>
          ) : null}

          {/* THE PLAN — stated before it happens. */}
          {plan && plan.entries.length > 0 ? (
            <View style={{ marginTop: space.xl, paddingTop: space.md, borderTopWidth: 1, borderTopColor: C.line }}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, lineHeight: leading(fs.caption, "relaxed") }}>
                {t("w.recovery.nutrition.copyTimes")}
              </Text>
              {plan.targetEntries > 0 ? (
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.amber), lineHeight: leading(fs.caption, "relaxed") }}>
                  {t("w.recovery.nutrition.copyAppends").replace("{n}", String(plan.targetEntries))}
                </Text>
              ) : null}
              <PressScale
                onPress={busy ? () => {} : () => onCopy(plan)}
                accessibilityRole="button"
                accessibilityState={{ disabled: !!busy }}
                accessibilityLabel={t("w.recovery.nutrition.copyConfirm").replace("{n}", String(plan.entries.length)).replace("{kcal}", String(plan.kcal))}
                style={{ backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingVertical: 14, alignItems: "center", marginTop: space.md, opacity: busy ? 0.6 : 1 }}
              >
                <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.body, color: C.onAccent }}>
                  {t("w.recovery.nutrition.copyConfirm").replace("{n}", String(plan.entries.length)).replace("{kcal}", String(plan.kcal))}
                </Text>
              </PressScale>
            </View>
          ) : null}
        </>
      )}

      {message ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime), marginTop: space.lg, paddingHorizontal: 2 }}>
          {message}
        </Text>
      ) : null}
    </Sheet>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const { palette: C } = useTheme();
  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
      style={{
        backgroundColor: on ? C.lime : "transparent",
        borderWidth: 1, borderColor: on ? C.lime : C.line,
        borderRadius: RADIUS.pill, paddingVertical: 8, paddingHorizontal: 14,
      }}
    >
      <Text
        maxFontSizeMultiplier={FIXED_FONT_SCALE}
        style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", fontWeight: on ? "700" : "500", color: on ? C.onAccent : C.ash }}
      >
        {label}
      </Text>
    </PressScale>
  );
}
