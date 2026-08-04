"use client";

import { NUTRITION_GLYPHS, nutritionHubChart, type HubSeries, type NutritionGlyphName } from "@hybrid/core";
import { fs } from "@/lib/ui";
import { useLang } from "@/lib/i18n";

/**
 * NUTRITION HUB BENTO (web) — twin of apps/mobile/components/aurora/nutrition-hub.tsx.
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
 * @hybrid/core nutrition-hub.ts so this and the mobile tile plot the same
 * points; see that file for why the chart is not zero-anchored and why an
 * unlogged day breaks the logged line instead of drawing through zero.
 */

const C = (v: string) => `var(--color-${v})`;

// The chart's own coordinate space. The <svg> scales to the tile's width, so
// these are aspect units, not pixels; strokes are kept in screen space by
// vector-effect so a wide tile doesn't draw a fatter line than a narrow one.
const BOX = { width: 300, height: 92 };

function Glyph({ name, size = 17, color = "currentColor" }: { name: NutritionGlyphName; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" fill="none" aria-hidden="true" style={{ display: "block", flexShrink: 0 }}>
      {NUTRITION_GLYPHS[name].map((d, i) => (
        <path key={i} d={d} stroke={color} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

export type HubDest = "diary" | "insights" | "body" | "meals" | "foods";

const tile = {
  background: C("ink2"),
  border: `1px solid ${C("line")}`,
  borderRadius: 20,
  padding: 14,
  textAlign: "left" as const,
  cursor: "pointer",
  color: C("chalk"),
  display: "block",
  width: "100%",
};
const keyLabel = {
  fontFamily: "var(--font-mono)",
  fontSize: fs.nano,
  fontWeight: 600,
  letterSpacing: ".12em",
  textTransform: "uppercase" as const,
  color: C("ash"),
};
const nameLabel = { fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.note, letterSpacing: "-.015em" };
const valueLabel = { fontFamily: "var(--font-mono)", fontWeight: 700, fontVariantNumeric: "tabular-nums" as const };

/** One of the four small tiles: a stat first, a destination second. */
function StatTile({ glyph, tint, value, unit, caption, name, onClick }: {
  glyph: NutritionGlyphName; tint: string; value: string; unit?: string; caption: string; name: string; onClick: () => void;
}) {
  return (
    <button className="pressable" onClick={onClick} aria-label={name} style={tile}>
      <Glyph name={glyph} size={16} color={tint} />
      <div style={{ ...valueLabel, fontSize: 21, marginTop: 9 }}>
        {value}
        {unit ? <span style={{ fontSize: fs.caption, color: C("ash"), fontWeight: 600 }}> {unit}</span> : null}
      </div>
      <div style={{ ...keyLabel, marginTop: 1 }}>{caption}</div>
      <div style={{ ...nameLabel, fontSize: fs.caption, marginTop: 7 }}>{name}</div>
    </button>
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
  const chart = nutritionHubChart(series.days, BOX);
  const { today, deltaToday } = series;
  const num = (n: number) => Math.round(n).toLocaleString();

  // The delta reads as a verdict, so it takes the app's existing colour
  // grammar: past the same +5% grace the hero ring uses it is a breach
  // (terracotta), a real shortfall is sand, and inside the band it is go.
  const overFactor = today.logged != null && today.target > 0 ? today.logged / today.target : 1;
  const deltaTone = today.logged == null ? C("ash")
    : overFactor > 1.05 ? "var(--red-text)"
    : overFactor < 0.9 ? "var(--amber-text)"
    : "var(--lime-text)";
  const deltaText = today.logged == null ? ""
    : overFactor > 1.05 || overFactor < 0.9
      ? t(deltaToday > 0 ? "w.recovery.nutrition.hubOver" : "w.recovery.nutrition.hubUnder").replace("{n}", num(Math.abs(deltaToday)))
      : t("w.recovery.nutrition.hubOnTarget");

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
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "28px 2px 10px" }}>
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18, color: C("chalk") }}>{t("w.recovery.nutrition.hubTitle")}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
        {/* ── DIARY — the lead tile, target vs logged over the last week ── */}
        <button className="pressable" onClick={() => onOpen("diary")} aria-label={t("w.recovery.nutrition.menuDiary")} style={{ ...tile, gridColumn: "1 / -1", padding: 15 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <Glyph name="diary" size={17} color={C("lime")} />
            <span style={{ ...nameLabel, flex: 1 }}>{t("w.recovery.nutrition.menuDiary")}</span>
            {deltaText ? <span style={{ ...valueLabel, fontSize: fs.caption, color: deltaTone }}>{deltaText}</span> : null}
            <Glyph name="chevron" size={13} color={C("ash")} />
          </div>

          {/* Legend — the two lines are only readable if the dash means something. */}
          <div style={{ display: "flex", gap: 14, marginTop: 11 }}>
            <span style={{ ...keyLabel, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <i style={{ display: "block", width: 13, borderTop: `2px dashed ${C("ash")}` }} />{t("w.recovery.nutrition.hubTarget")}
            </span>
            <span style={{ ...keyLabel, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <i style={{ display: "block", width: 13, borderTop: `2px solid ${C("lime")}` }} />{t("w.recovery.nutrition.hubLogged")}
            </span>
          </div>

          <svg
            viewBox={`0 0 ${BOX.width} ${BOX.height}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={today.logged == null
              ? t("w.recovery.nutrition.hubDiaryEmpty").replace("{target}", num(today.target))
              : t("w.recovery.nutrition.hubDiaryCaption").replace("{logged}", num(today.logged)).replace("{target}", num(today.target))}
            style={{ display: "block", width: "100%", height: 82, marginTop: 7, overflow: "visible" }}
          >
            {/* the gap between what the day asked for and what went in */}
            {chart.bandPaths.map((d, i) => <path key={`b${i}`} d={d} fill={C("chalk")} fillOpacity={0.055} />)}
            {/* target — training-aware, so it steps up on the hard days */}
            <path d={chart.targetPath} fill="none" stroke={C("ash")} strokeWidth={1.6} strokeDasharray="4 3.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            {/* logged — broken wherever a day carries no intake at all */}
            {chart.loggedPaths.map((d, i) => (
              <path key={`l${i}`} d={d} fill="none" stroke={C("lime")} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            ))}
            {chart.isolated.map((p, i) => <circle key={`i${i}`} cx={p.x} cy={p.y} r={2.4} fill={C("lime")} />)}
            {chart.last && <circle cx={chart.last.x} cy={chart.last.y} r={3.4} fill={C("lime")} stroke={C("ink2")} strokeWidth={2} vectorEffect="non-scaling-stroke" />}
          </svg>

          <div style={{ display: "flex", marginTop: 5 }}>
            {series.days.map((d, i) => (
              <span key={d.date} style={{ flex: 1, textAlign: i === 0 ? "left" : d.today ? "right" : "center", fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".06em", color: d.today ? "var(--lime-text)" : C("ash"), fontWeight: d.today ? 700 : 500, opacity: d.today ? 1 : 0.7 }}>
                {dayLabel(d.date)}
              </span>
            ))}
          </div>

          <div style={{ ...keyLabel, marginTop: 8 }}>
            {series.loggedDays === 0
              ? t("w.recovery.nutrition.hubNoHistory")
              : today.logged == null
                ? t("w.recovery.nutrition.hubDiaryEmpty").replace("{target}", num(today.target))
                : t("w.recovery.nutrition.hubDiaryCaption").replace("{logged}", num(today.logged)).replace("{target}", num(today.target))}
          </div>
        </button>

        <StatTile glyph="chart" tint="var(--blue-text)" value={avgKcal == null ? "—" : num(avgKcal)} caption={t("w.recovery.nutrition.hubAvg7")} name={t("w.recovery.nutrition.menuInsights")} onClick={() => onOpen("insights")} />
        <StatTile glyph="scale" tint="var(--amber-text)" value={weightKg == null ? "—" : weightKg.toFixed(1)} unit={weightKg == null ? undefined : "kg"} caption={weightKg == null ? t("w.recovery.nutrition.hubNoWeigh") : rate} name={t("w.recovery.nutrition.menuBody")} onClick={() => onOpen("body")} />
        <StatTile glyph="bowl" tint="var(--red-text)" value={String(mealCount)} caption={t("w.recovery.nutrition.hubSaved")} name={t("w.recovery.nutrition.yourMeals")} onClick={() => onOpen("meals")} />
        <StatTile glyph="box" tint={C("ash")} value={String(productCount)} caption={t("w.recovery.nutrition.hubSaved")} name={t("w.recovery.nutrition.yourProducts")} onClick={() => onOpen("foods")} />
      </div>
    </>
  );
}

export default NutritionHubBento;
