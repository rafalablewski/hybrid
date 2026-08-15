import { useState } from "react";
import { View, Text, type LayoutChangeEvent } from "react-native";
import Svg, { Path, Circle, Line as SvgLine } from "react-native-svg";
import { NUTRITION_GLYPHS, nutritionHubChart, type HubSeries, type NutritionGlyphName } from "@hybrid/core";
import { fs, F, PressScale , tracking} from "../../lib/ui";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";

/**
 * NUTRITION HUB BENTO (mobile) — twin of apps/web/components/aurora/nutrition-hub.tsx.
 *
 * Replaces the flat wrapped row of mono-uppercase words that used to carry the
 * five deep destinations at the bottom of the Nutrition home. They had no
 * surface, no glyph, no arrow, no state and no data — five links dressed as a
 * caption. They are now a bento, because the five are NOT equals: Diary is
 * opened daily and takes a full-width tile with a real chart; the other four
 * are stat tiles, each a number first and a link second, so the block informs
 * even when nobody taps it.
 *
 * The Diary chart is TWO LINES — the day's target against what was actually
 * logged, with the gap between them shaded. Geometry and series come from
 * @hybrid/core nutrition-hub.ts so this and the web tile plot the same points;
 * see that file for why the chart is not zero-anchored and why an unlogged day
 * breaks the logged line instead of drawing through zero.
 */

/**
 * Chart height in dp. The WIDTH is measured from the tile rather than scaled
 * into from a fixed viewBox: react-native-svg has no dependable
 * `vector-effect: non-scaling-stroke`, so a stretched viewBox would draw the
 * line thicker across than down and the dashes uneven. Measuring keeps the
 * geometry in real pixels, so the stroke is the stroke. (Web can stretch a
 * viewBox safely — browsers honour non-scaling-stroke — and both clients still
 * plot the SAME points, because the maths lives in core.)
 */
const CHART_H = 82;

function Glyph({ name, size = 17, color = "#fff", strokeWidth = 4 }: { name: NutritionGlyphName; size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 72 72" fill="none">
      {NUTRITION_GLYPHS[name].map((d, i) => (
        <Path key={i} d={d} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  );
}

export type HubDest = "diary" | "insights" | "body" | "meals" | "foods";

/**
 * One of the four small tiles: a stat first, a destination second. Declared at
 * module scope, not inside the bento — a component defined in a render body is
 * a NEW type every render, so React would tear down and rebuild each tile (and
 * the PressScale's press animation with it) on every state change.
 */
function StatTile({ glyph, tint, value, unit, caption, name, onPress, palette: C }: {
  glyph: NutritionGlyphName; tint: string; value: string; unit?: string; caption: string;
  name: string; onPress: () => void; palette: ReturnType<typeof useTheme>["palette"];
}) {
  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={name}
      style={{ flex: 1, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 20, padding: 14 }}
    >
      <Glyph name={glyph} size={16} color={tint} strokeWidth={4.5} />
      <Text style={{ fontFamily: F.mono, fontSize: 21, color: C.chalk, marginTop: 9 }} numberOfLines={1}>
        {value}
        {unit ? <Text style={{ fontSize: fs.caption, color: C.ash }}> {unit}</Text> : null}
      </Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.caps, textTransform: "uppercase", color: C.ash, marginTop: 1 }} numberOfLines={1}>{caption}</Text>
      <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: C.chalk, marginTop: 7 }} numberOfLines={2}>{name}</Text>
    </PressScale>
  );
}

export function NutritionHubBento({ series, avgKcal, weightKg, ratePerWeek, mealCount, productCount, onOpen }: {
  series: HubSeries;
  /** 7-day average intake, null before anything is logged */
  avgKcal: number | null;
  weightKg: number | null;
  /** kg/week from the smoothed bodyweight trend (negative = losing) */
  ratePerWeek: number;
  mealCount: number;
  productCount: number;
  onOpen: (dest: HubDest) => void;
}) {
  const { t } = useLang();
  const { palette: C } = useTheme();
  // 0 until the tile has laid out; the chart simply holds its height until then
  // rather than drawing a line at a width it will immediately discard.
  const [chartW, setChartW] = useState(0);
  const onChartLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0 && w !== chartW) setChartW(w);
  };
  const chart = nutritionHubChart(series.days, { width: chartW, height: CHART_H });
  const { today, deltaToday } = series;
  const num = (n: number) => Math.round(n).toLocaleString();

  const tile = { backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 20, padding: 14 } as const;
  const keyLabel = { fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.caps, textTransform: "uppercase" as const, color: C.ash };
  const nameLabel = { fontFamily: F.bold, fontSize: fs.note, color: C.chalk };

  // The delta reads as a verdict, so it takes the app's existing colour
  // grammar: past the same +5% grace the hero ring uses it is a breach
  // (terracotta), a real shortfall is sand, and inside the band it is go.
  const overFactor = today.logged != null && today.target > 0 ? today.logged / today.target : 1;
  const deltaTone = today.logged == null ? C.ash
    : overFactor > 1.05 ? txt(C, C.red)
    : overFactor < 0.9 ? txt(C, C.amber)
    : txt(C, C.lime);
  const deltaText = today.logged == null ? ""
    : overFactor > 1.05 || overFactor < 0.9
      ? t(deltaToday > 0 ? "w.recovery.nutrition.hubOver" : "w.recovery.nutrition.hubUnder").replace("{n}", num(Math.abs(deltaToday)))
      : t("w.recovery.nutrition.hubOnTarget");

  const caption = series.loggedDays === 0
    ? t("w.recovery.nutrition.hubNoHistory")
    : today.logged == null
      ? t("w.recovery.nutrition.hubDiaryEmpty").replace("{target}", num(today.target))
      : t("w.recovery.nutrition.hubDiaryCaption").replace("{logged}", num(today.logged)).replace("{target}", num(today.target));

  // Narrow weekday initials in the reader's own locale — the chart's only axis.
  const dayLabel = (date: string) => {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, { weekday: "narrow" });
  };

  const rate = Math.abs(ratePerWeek) < 0.05
    ? t("w.recovery.nutrition.hubRateFlat")
    : t(ratePerWeek < 0 ? "w.recovery.nutrition.hubRateDown" : "w.recovery.nutrition.hubRateUp").replace("{n}", Math.abs(ratePerWeek).toFixed(1));

  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 28, marginBottom: 10, marginHorizontal: 2 }}>
        <Text style={{ fontFamily: F.black, fontSize: 18, color: C.chalk }}>{t("w.recovery.nutrition.hubTitle")}</Text>
      </View>

      {/* ── DIARY — the lead tile, target vs logged over the last week ── */}
      <PressScale onPress={() => onOpen("diary")} accessibilityRole="button" accessibilityLabel={t("w.recovery.nutrition.menuDiary")} style={{ ...tile, padding: 15 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
          <Glyph name="diary" size={17} color={C.lime} strokeWidth={4.5} />
          <Text style={{ ...nameLabel, flex: 1 }}>{t("w.recovery.nutrition.menuDiary")}</Text>
          {deltaText ? <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: deltaTone }}>{deltaText}</Text> : null}
          <Glyph name="chevron" size={13} color={C.ash} strokeWidth={5} />
        </View>

        {/* Legend — the two lines are only readable if the dash means something. */}
        <View style={{ flexDirection: "row", gap: 14, marginTop: 11 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Svg width={13} height={2}><SvgLine x1={0} y1={1} x2={13} y2={1} stroke={C.ash} strokeWidth={2} strokeDasharray="3.5 3" /></Svg>
            <Text style={keyLabel}>{t("w.recovery.nutrition.hubTarget")}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 13, height: 2, backgroundColor: C.lime }} />
            <Text style={keyLabel}>{t("w.recovery.nutrition.hubLogged")}</Text>
          </View>
        </View>

        <View accessible accessibilityLabel={caption} onLayout={onChartLayout} style={{ marginTop: 7, height: CHART_H }}>
          {chartW > 0 ? (
            <Svg width={chartW} height={CHART_H}>
              {/* the gap between what the day asked for and what went in */}
              {chart.bandPaths.map((d, i) => <Path key={`b${i}`} d={d} fill={C.chalk} fillOpacity={0.055} />)}
              {/* target — training-aware, so it steps up on the hard days */}
              <Path d={chart.targetPath} fill="none" stroke={C.ash} strokeWidth={1.6} strokeDasharray="4 3.5" strokeLinecap="round" strokeLinejoin="round" />
              {/* logged — broken wherever a day carries no intake at all */}
              {chart.loggedPaths.map((d, i) => (
                <Path key={`l${i}`} d={d} fill="none" stroke={C.lime} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              ))}
              {chart.isolated.map((p, i) => <Circle key={`i${i}`} cx={p.x} cy={p.y} r={2.4} fill={C.lime} />)}
              {chart.last ? <Circle cx={chart.last.x} cy={chart.last.y} r={3.4} fill={C.lime} stroke={C.ink2} strokeWidth={2} /> : null}
            </Svg>
          ) : null}
        </View>

        <View style={{ flexDirection: "row", marginTop: 5 }}>
          {series.days.map((d, i) => (
            <Text
              key={d.date}
              style={{ flex: 1, textAlign: i === 0 ? "left" : d.today ? "right" : "center", fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, color: d.today ? txt(C, C.lime) : C.ash, opacity: d.today ? 1 : 0.7 }}
            >
              {dayLabel(d.date)}
            </Text>
          ))}
        </View>

        <Text style={{ ...keyLabel, marginTop: 8 }}>{caption}</Text>
      </PressScale>

      <View style={{ flexDirection: "row", gap: 9, marginTop: 9 }}>
        <StatTile palette={C} glyph="chart" tint={txt(C, C.blue)} value={avgKcal == null ? "—" : num(avgKcal)} caption={t("w.recovery.nutrition.hubAvg7")} name={t("w.recovery.nutrition.menuInsights")} onPress={() => onOpen("insights")} />
        <StatTile palette={C} glyph="scale" tint={txt(C, C.amber)} value={weightKg == null ? "—" : weightKg.toFixed(1)} unit={weightKg == null ? undefined : "kg"} caption={weightKg == null ? t("w.recovery.nutrition.hubNoWeigh") : rate} name={t("w.recovery.nutrition.menuBody")} onPress={() => onOpen("body")} />
      </View>
      <View style={{ flexDirection: "row", gap: 9, marginTop: 9 }}>
        <StatTile palette={C} glyph="bowl" tint={txt(C, C.red)} value={String(mealCount)} caption={t("w.recovery.nutrition.hubSaved")} name={t("w.recovery.nutrition.yourMeals")} onPress={() => onOpen("meals")} />
        <StatTile palette={C} glyph="box" tint={C.ash} value={String(productCount)} caption={t("w.recovery.nutrition.hubSaved")} name={t("w.recovery.nutrition.yourProducts")} onPress={() => onOpen("foods")} />
      </View>
    </>
  );
}

export default NutritionHubBento;
