import { View, Text } from "react-native";
import {
  ANALYTICS_WINDOWS,
  formatVolume,
  MAX_INSIGHTS,
  type AnalyticsWindow,
  type NutrientKey,
  type NutrientStat,
  type NutritionAnalytics,
  type NutritionInsight,
  type WeightUnit,
} from "@hybrid/core";
import { fs, space, tracking, F, leading, FIXED_FONT_SCALE, MAX_FONT_SCALE } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { useLang } from "../../lib/i18n";
import { ACard, ASegment, RADIUS } from "./kit";
import GroupMark from "./group-mark";

/**
 * NUTRITION TRENDS (mobile) — the twin of
 * apps/web/components/aurora/nutrition-trends.tsx.
 *
 * See that file's note. In short: every figure comes from @hybrid/core's
 * nutritionAnalytics and none is computed here; findings lead and the
 * per-nutrient detail follows as the evidence; a ceiling is coloured by what it
 * MEANS rather than by its percentage (being under the salt reference is good,
 * being under your protein target is not); and a day with no data draws no bar,
 * because bars have an honest way to say "nothing was logged" and a line does
 * not.
 */
export default function NutritionTrends({
  analytics,
  window,
  onWindow,
  units,
}: {
  analytics: NutritionAnalytics;
  window: AnalyticsWindow;
  onWindow: (w: AnalyticsWindow) => void;
  units: WeightUnit;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const { nutrients, insights, loggedDays, windowDays } = analytics;

  return (
    <View>
      {/* THE WINDOW. One control for the whole screen. */}
      <View style={{ marginTop: space.lg }}>
        <ASegment
          options={ANALYTICS_WINDOWS.map((w) => ({ id: String(w) as `${AnalyticsWindow}`, label: t(`w.recovery.nutrition.an.window${w}`) }))}
          value={String(window) as `${AnalyticsWindow}`}
          onPick={(v) => onWindow(Number(v) as AnalyticsWindow)}
        />
      </View>

      <Text
        maxFontSizeMultiplier={FIXED_FONT_SCALE}
        style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash, marginTop: space.md, textAlign: "center" }}
      >
        {t("w.recovery.nutrition.an.loggedDays").replace("{n}", String(loggedDays)).replace("{d}", String(windowDays))}
      </Text>

      {/* FINDINGS — sentences, not tiles. */}
      <GroupMark label={t("w.recovery.nutrition.an.findings")} mt={28} />
      <ACard style={{ marginTop: space.md }}>
        {insights.slice(0, MAX_INSIGHTS).map((ins, i) => (
          <Text
            key={`${ins.kind}-${ins.nutrient ?? ""}`}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={{
              fontFamily: F.reg, fontSize: fs.body, lineHeight: leading(fs.body, "normal"), color: C.chalk,
              marginTop: i ? space.md : 0, paddingTop: i ? space.md : 0,
              borderTopWidth: i ? 1 : 0, borderTopColor: C.line,
            }}
          >
            {insightText(ins, t)}
          </Text>
        ))}
      </ACard>

      <GroupMark label={t("w.recovery.nutrition.calories")} mt={32} />
      {(["kcal", "protein", "carbs", "fat"] as NutrientKey[]).map((k) => (
        <NutrientCard key={k} stat={nutrients[k]} units={units} />
      ))}

      <GroupMark label={t("w.recovery.nutrition.facts.title")} mt={32} />
      {(["fiber", "sugar", "satFat", "salt"] as NutrientKey[]).map((k) => (
        <NutrientCard key={k} stat={nutrients[k]} units={units} />
      ))}
      <Text
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: space.md, paddingHorizontal: 2, lineHeight: leading(fs.nano, "relaxed") }}
      >
        {t("w.recovery.nutrition.an.refNote")}
      </Text>

      <GroupMark label={t("w.recovery.nutrition.water")} mt={32} />
      <NutrientCard stat={nutrients.water} units={units} />
    </View>
  );
}

function NutrientCard({ stat, units }: { stat: NutrientStat; units: WeightUnit }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const label = t(NUTRIENT_LABEL_KEY[stat.key]);
  const has = stat.avg != null;

  const good =
    stat.pctOfTarget == null
      ? null
      : stat.kind === "ceiling"
        ? stat.pctOfTarget <= 100
        : stat.pctOfTarget >= 90;
  const accent = good == null ? C.ash : good ? C.lime : stat.kind === "ceiling" ? C.red : C.amber;

  const targetWord =
    stat.kind === "ceiling" ? t("w.recovery.nutrition.an.ceiling")
      : stat.kind === "floor" ? t("w.recovery.nutrition.an.floor")
        : t("w.recovery.nutrition.an.target");

  const fmt = (v: number) => (stat.key === "water" ? formatVolume(v, units) : stat.key === "kcal" ? `${Math.round(v)} kcal` : `${v} g`);

  return (
    <ACard style={{ marginTop: space.md }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.md }}>
        <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk, flexShrink: 1 }}>
          {label}
        </Text>
        {stat.trend && stat.trend.direction !== "flat" ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }}>
            {t(stat.trend.direction === "up" ? "w.recovery.nutrition.an.trendUp" : "w.recovery.nutrition.an.trendDown").replace("{n}", String(Math.abs(stat.trend.pct)))}
          </Text>
        ) : null}
      </View>

      {!has ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: space.sm }}>
          {t("w.recovery.nutrition.an.noData")}
        </Text>
      ) : (
        <>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm, marginTop: space.md, flexWrap: "wrap" }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.black, fontSize: 30, lineHeight: 32, color: C.chalk, fontVariant: ["tabular-nums"] }}>
              {fmt(stat.avg!)}
            </Text>
            {stat.target != null ? (
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>
                {targetWord} {fmt(stat.target)}
              </Text>
            ) : null}
          </View>

          <DayBars stat={stat} accent={accent} line={C.line} />

          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, color: C.ash, marginTop: space.sm }}>
            {t("w.recovery.nutrition.an.statedDays").replace("{n}", String(stat.statedDays)).replace("{d}", String(stat.series.length))}
          </Text>
        </>
      )}
    </ACard>
  );
}

/** Zero-anchored, because this is an AMOUNT. A day with no data draws nothing
 *  at all rather than a zero-height bar. */
function DayBars({ stat, accent, line }: { stat: NutrientStat; accent: string; line: string }) {
  const values = stat.series.filter((v): v is number => v != null);
  const peak = Math.max(stat.target ?? 0, ...(values.length ? values : [1]));
  const targetPct = stat.target && peak > 0 ? (stat.target / peak) * 100 : null;
  const gap = stat.series.length > 45 ? 1 : 2;

  return (
    <View style={{ height: 46, marginTop: space.md }}>
      {targetPct != null && targetPct <= 100 ? (
        <View style={{ position: "absolute", left: 0, right: 0, bottom: `${targetPct}%`, height: 1, backgroundColor: line }} />
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap, height: "100%" }}>
        {stat.series.map((v, i) => (
          <View key={i} style={{ flex: 1, height: "100%", justifyContent: "flex-end" }}>
            {v != null ? (
              <View style={{ height: `${Math.max(3, (v / peak) * 100)}%`, backgroundColor: accent, borderRadius: 2, opacity: 0.85 }} />
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const NUTRIENT_LABEL_KEY: Record<NutrientKey, string> = {
  kcal: "w.recovery.nutrition.calories",
  protein: "w.recovery.nutrition.protein",
  carbs: "w.recovery.nutrition.carbs",
  fat: "w.recovery.nutrition.fat",
  fiber: "w.recovery.nutrition.facts.fiber",
  sugar: "w.recovery.nutrition.an.n.sugar",
  satFat: "w.recovery.nutrition.an.n.satFat",
  salt: "w.recovery.nutrition.facts.salt",
  water: "w.recovery.nutrition.water",
};

/** A finding's SHAPE into its sentence. Core ships `{ kind, value }`; every word
 *  of this lives in i18n. Mirrors the web mapping exactly. */
export function insightText(ins: NutritionInsight, t: (k: string) => string): string {
  const n = String(ins.value);
  const m = String(ins.value2 ?? "");
  const v = ins.nutrient ? t(NUTRIENT_LABEL_KEY[ins.nutrient]).toLowerCase() : "";
  const K = "w.recovery.nutrition.an.i.";
  switch (ins.kind) {
    case "logging-sparse": return t(`${K}loggingSparse`).replace("{n}", n);
    case "kcal-under": return t(`${K}kcalUnder`).replace("{n}", n);
    case "kcal-over": return t(`${K}kcalOver`).replace("{n}", n);
    case "kcal-on-track": return t(`${K}kcalOnTrack`);
    case "protein-short": return t(`${K}proteinShort`).replace("{n}", n);
    case "protein-rest-gap": return t(`${K}proteinRestGap`).replace("{n}", n).replace("{m}", m);
    case "fiber-short": return t(`${K}fiberShort`).replace("{n}", n);
    case "salt-high": return t(`${K}saltHigh`).replace("{n}", n);
    case "sugar-high": return t(`${K}sugarHigh`).replace("{n}", n);
    case "trend-up": return t(`${K}trendUp`).replace("{n}", n).replace("{v}", v);
    case "trend-down": return t(`${K}trendDown`).replace("{n}", n).replace("{v}", v);
    case "coverage-low": return t(`${K}coverageLow`).replace("{n}", n).replace("{m}", m).replace("{v}", v);
  }
}
