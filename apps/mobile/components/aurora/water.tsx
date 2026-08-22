import { useState } from "react";
import { View, Text, type StyleProp, type ViewStyle } from "react-native";
import {
  formatVolume,
  hydrationPresets,
  hydrationVessels,
  type Hydration,
  type HydrationPreset,
  type WeightUnit,
} from "@hybrid/core";
import { fs, space, tracking, F, leading, PressScale, FIXED_FONT_SCALE, MAX_FONT_SCALE, HIT_SLOP } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { useLang } from "../../lib/i18n";
import { ACard, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";
import Sheet from "./sheet";

/**
 * WATER (mobile).
 *
 * See that file's note for the reasoning: every figure comes from @hybrid/core's
 * hydration engine (so the two clients cannot disagree about the target, the
 * pace or the state), the day is drawn as a VESSEL ROW rather than a fourth
 * macro hairline, and the pace is stated in prose rather than marked with a tick
 * that would need a legend.
 */
export default function WaterCard({
  h,
  units,
  onAdd,
  onUndo,
  canUndo,
  style,
}: {
  h: Hydration;
  units: WeightUnit;
  onAdd: (ml: number) => void;
  onUndo?: () => void;
  canUndo?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const [basis, setBasis] = useState(false);
  const presets = hydrationPresets(units);
  const vessels = hydrationVessels(h, units);
  const met = h.state === "met";

  const stateLine =
    h.state === "met"
      ? { text: t("w.recovery.nutrition.waterMet"), color: txt(C, C.lime) }
      : h.state === "behind"
        ? { text: t("w.recovery.nutrition.waterBehind").replace("{v}", formatVolume(h.behindMl, units)), color: txt(C, C.amber) }
        : h.state === "empty"
          ? { text: t("w.recovery.nutrition.waterEmpty"), color: C.ash }
          : { text: t("w.recovery.nutrition.waterOnTrack"), color: C.ash };

  const mono = { fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking(fs.nano, "label"), color: C.ash } as const;

  return (
    <ACard style={style}>
      {/* HEAD — title left, the one piece of state right. No marker on the
          left (house rule). */}
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.md }}>
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={{ fontFamily: F.black, fontSize: fs.title, lineHeight: leading(fs.title, "snug"), color: C.chalk, flexShrink: 1 }}
        >
          {t("w.recovery.nutrition.water")}
        </Text>
        <Text
          maxFontSizeMultiplier={FIXED_FONT_SCALE}
          style={{ ...mono, color: stateLine.color, textAlign: "right", flexShrink: 1 }}
        >
          {stateLine.text}
        </Text>
      </View>

      {/* THE FIGURE — what is in, against what the day asked for. */}
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm, marginTop: space.lg }}>
        <Text
          maxFontSizeMultiplier={FIXED_FONT_SCALE}
          style={{ fontFamily: F.black, fontSize: 38, lineHeight: 40, color: met ? txt(C, C.lime) : C.chalk, fontVariant: ["tabular-nums"] }}
        >
          {formatVolume(h.ml, units)}
        </Text>
        <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>
          / {formatVolume(h.target, units)}
        </Text>
        {/* ⓘ is ALREADY a ring — no second ring is drawn around it. */}
        <PressScale
          onPress={() => setBasis(true)}
          accessibilityRole="button"
          accessibilityLabel={t("w.recovery.nutrition.waterBasis")}
          hitSlop={HIT_SLOP}
          style={{ marginLeft: "auto", padding: 4 }}
        >
          <AuroraIcon name="info" size={17} color={C.ash} />
        </PressScale>
      </View>

      {/* THE VESSEL ROW — length from the target, fill from the day. */}
      <View
        accessibilityRole="image"
        accessibilityLabel={`${formatVolume(h.ml, units)} / ${formatVolume(h.target, units)}`}
        style={{ flexDirection: "row", gap: 4, marginTop: space.lg }}
      >
        {Array.from({ length: vessels.total }, (_, i) => (
          <View
            key={i}
            style={{ flex: 1, height: 8, borderRadius: RADIUS.mark, backgroundColor: i < vessels.filled ? C.lime : C.line }}
          />
        ))}
      </View>

      {/* What is left, and — on a training day — where the extra came from. */}
      {(!met || h.trained) && (
        <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ ...mono, marginTop: space.sm, lineHeight: leading(fs.nano, "relaxed") }}>
          {!met ? t("w.recovery.nutrition.waterLeft").replace("{v}", formatVolume(h.leftMl, units)) : ""}
          {!met && h.trained ? "\n" : ""}
          {h.trained ? t("w.recovery.nutrition.waterSweat").replace("{v}", formatVolume(h.sweatMl, units)) : ""}
        </Text>
      )}

      {/* ADD — one tap per vessel. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.lg }}>
        {presets.map((p: HydrationPreset) => (
          <PressScale
            key={p.ml}
            onPress={() => onAdd(p.ml)}
            accessibilityRole="button"
            accessibilityLabel={t("w.recovery.nutrition.waterAdd").replace("{v}", formatVolume(p.ml, units))}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
              borderWidth: 1,
              borderColor: C.lime,
              borderRadius: RADIUS.pill,
              paddingVertical: 10,
              paddingHorizontal: 4,
            }}
          >
            <AuroraIcon name="add" size={13} color={txt(C, C.lime)} />
            <Text
              maxFontSizeMultiplier={FIXED_FONT_SCALE}
              style={{ fontFamily: F.monoBold, fontSize: fs.caption, color: txt(C, C.lime) }}
            >
              {formatVolume(p.ml, units)}
            </Text>
          </PressScale>
        ))}
      </View>

      {canUndo && onUndo && (
        <PressScale
          onPress={onUndo}
          accessibilityRole="button"
          accessibilityLabel={t("w.recovery.nutrition.waterUndo")}
          hitSlop={HIT_SLOP}
          style={{ marginTop: space.sm, alignSelf: "flex-start", paddingVertical: 4 }}
        >
          <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ ...mono, textTransform: "uppercase" }}>
            {t("w.recovery.nutrition.waterUndo")}
          </Text>
        </PressScale>
      )}

      <Sheet visible={basis} onClose={() => setBasis(false)} title={t("w.recovery.nutrition.waterBasis")} detents={["medium", "large"]}>
        <Text
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={{ fontFamily: F.reg, fontSize: fs.body, lineHeight: leading(fs.body, "relaxed"), color: C.chalk }}
        >
          {t("w.recovery.nutrition.waterBasisBody")}
        </Text>
      </Sheet>
    </ACard>
  );
}
