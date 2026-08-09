"use client";

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
import { fs, CARD_PAD } from "@/lib/ui";
import { useLang } from "@/lib/i18n";
import { LiquidSeg } from "./liquid-seg";
import GroupMark from "./group-mark";

const C = (v: string) => `var(--color-${v})`;

/**
 * NUTRITION TRENDS (web) — the twin of
 * apps/mobile/components/aurora/nutrition-trends.tsx.
 *
 * Renders @hybrid/core's nutritionAnalytics and nothing else: no figure on this
 * screen is computed here, so the phone and the browser cannot reach different
 * conclusions from the same window.
 *
 * ── FINDINGS LEAD, THE TABLE FOLLOWS ──────────────────────────────────────
 * Nine nutrients over ninety days is a lot of numbers, and a screen that opens
 * on numbers makes the reader do the analysis the app was supposed to do. So the
 * findings come first, in plain sentences, and the per-nutrient detail sits
 * under them as the evidence. The engine ships shapes (`{ kind, value }`) and
 * the sentences live in i18n — core carries no English.
 *
 * ── A CEILING IS NOT A TARGET, AND IS NOT COLOURED LIKE ONE ───────────────
 * Salt, sugar and saturates are population REFERENCE MAXIMA; fibre is a
 * reference MINIMUM; the macros are personal targets. Being at 60% of your
 * protein target is a miss, and being at 60% of the salt reference is fine, so
 * the bar's accent is chosen from `stat.kind` rather than from the percentage.
 * Getting this wrong would turn every well-eaten day amber.
 *
 * ── A MISSING DAY DRAWS NOTHING ───────────────────────────────────────────
 * The day strip is bars, not a line, because bars have an honest way to say "no
 * data": no bar. A line would have to either break (and read as a rendering
 * fault at this size) or bridge the gap (and claim an intake nobody logged).
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
  const { t } = useLang();
  const { nutrients, insights, loggedDays, windowDays } = analytics;

  const mono = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".08em",
    textTransform: "uppercase", color: C("ash"), ...extra,
  });

  return (
    <div>
      {/* THE WINDOW. One control for the whole screen — every figure below it
          answers the same question over the same span. */}
      <LiquidSeg
        items={ANALYTICS_WINDOWS.map((w) => ({
          key: String(w),
          label: t(`w.recovery.nutrition.an.window${w}`),
          render: (on: boolean) => (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: on ? C("chalk") : C("ash"), transition: "color .18s ease" }}>
              {t(`w.recovery.nutrition.an.window${w}`)}
            </span>
          ),
        }))}
        index={Math.max(0, ANALYTICS_WINDOWS.indexOf(window))}
        onSelect={(i) => onWindow(ANALYTICS_WINDOWS[i]!)}
        segHeight={36}
        pad={4}
        trackStyle={{ marginTop: 16, background: C("ink2"), border: `1px solid ${C("line")}` }}
      />

      <div style={{ ...mono(), marginTop: 12, textAlign: "center" }}>
        {t("w.recovery.nutrition.an.loggedDays").replace("{n}", String(loggedDays)).replace("{d}", String(windowDays))}
      </div>

      {/* FINDINGS — sentences, not tiles. */}
      <GroupMark label={t("w.recovery.nutrition.an.findings")} mt={28} />
      <div style={{ background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "var(--shadow-card)", padding: CARD_PAD, marginTop: 12 }}>
        {insights.slice(0, MAX_INSIGHTS).map((ins, i) => (
          <p
            key={`${ins.kind}-${ins.nutrient ?? ""}`}
            style={{
              margin: 0, marginTop: i ? 14 : 0, paddingTop: i ? 14 : 0,
              borderTop: i ? `1px solid ${C("line")}` : "none",
              fontFamily: "var(--font-display)", fontSize: fs.body, lineHeight: 1.55,
              color: C("chalk"),
            }}
          >
            {insightText(ins, t)}
          </p>
        ))}
      </div>

      {/* THE EVIDENCE — energy and the macros first, since those carry personal
          targets and are what the athlete steers by. */}
      <GroupMark label={t("w.recovery.nutrition.calories")} mt={32} />
      {(["kcal", "protein", "carbs", "fat"] as NutrientKey[]).map((k) => (
        <NutrientCard key={k} stat={nutrients[k]} units={units} />
      ))}

      <GroupMark label={t("w.recovery.nutrition.facts.title")} mt={32} />
      {(["fiber", "sugar", "satFat", "salt"] as NutrientKey[]).map((k) => (
        <NutrientCard key={k} stat={nutrients[k]} units={units} />
      ))}
      {/* The one caveat that must travel with a reference figure. */}
      <div style={{ ...mono({ textTransform: "none", letterSpacing: 0, fontSize: fs.nano }), marginTop: 12, padding: "0 2px", lineHeight: 1.6, maxWidth: "62ch" }}>
        {t("w.recovery.nutrition.an.refNote")}
      </div>

      <GroupMark label={t("w.recovery.nutrition.water")} mt={32} />
      <NutrientCard stat={nutrients.water} units={units} />
    </div>
  );
}

/* ── one nutrient ─────────────────────────────────────────────────────────── */

function NutrientCard({ stat, units }: { stat: NutrientStat; units: WeightUnit }) {
  const { t } = useLang();
  const label = t(NUTRIENT_LABEL_KEY[stat.key]);
  const has = stat.avg != null;

  // A ceiling reads well when it is UNDER; a target and a floor read well when
  // they are met. The accent is chosen from what the figure means, never from
  // the percentage alone.
  const good =
    stat.pctOfTarget == null
      ? null
      : stat.kind === "ceiling"
        ? stat.pctOfTarget <= 100
        : stat.pctOfTarget >= 90;
  const accent = good == null ? C("ash") : good ? C("lime") : stat.kind === "ceiling" ? C("red") : C("amber");

  const targetWord =
    stat.kind === "ceiling" ? t("w.recovery.nutrition.an.ceiling")
      : stat.kind === "floor" ? t("w.recovery.nutrition.an.floor")
        : t("w.recovery.nutrition.an.target");

  const fmt = (v: number) => (stat.key === "water" ? formatVolume(v, units) : stat.key === "kcal" ? `${Math.round(v)} kcal` : `${v} g`);

  return (
    <div style={{ background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "var(--shadow-card)", padding: CARD_PAD, marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <b style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18, color: C("chalk") }}>{label}</b>
        {stat.trend && stat.trend.direction !== "flat" && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".08em", textTransform: "uppercase", color: C("ash") }}>
            {t(stat.trend.direction === "up" ? "w.recovery.nutrition.an.trendUp" : "w.recovery.nutrition.an.trendDown").replace("{n}", String(Math.abs(stat.trend.pct)))}
          </span>
        )}
      </div>

      {!has ? (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 10 }}>
          {t("w.recovery.nutrition.an.noData")}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 30, letterSpacing: "-.03em", lineHeight: 1, color: C("chalk"), fontVariantNumeric: "tabular-nums" }}>
              {fmt(stat.avg!)}
            </span>
            {stat.target != null && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>
                {targetWord} {fmt(stat.target)}
              </span>
            )}
          </div>

          <DayBars stat={stat} accent={accent} />

          {/* How much of the window this figure actually rests on. For a panel
              nutrient that is the difference between a fact and a guess. */}
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".08em", color: C("ash"), marginTop: 10 }}>
            {t("w.recovery.nutrition.an.statedDays").replace("{n}", String(stat.statedDays)).replace("{d}", String(stat.series.length))}
          </div>
        </>
      )}
    </div>
  );
}

/** The day strip. Zero-anchored — this is an AMOUNT, and a fitted baseline
 *  would make a 5 g day and a 40 g day look comparable. A day with no data
 *  draws nothing at all rather than a zero-height bar. */
function DayBars({ stat, accent }: { stat: NutrientStat; accent: string }) {
  const values = stat.series.filter((v): v is number => v != null);
  const peak = Math.max(stat.target ?? 0, ...(values.length ? values : [1]));
  const targetPct = stat.target && peak > 0 ? (stat.target / peak) * 100 : null;
  // Long windows get thinner bars rather than a scroller: the strip is a shape
  // to glance at, not a chart to read a value off.
  const gap = stat.series.length > 45 ? 1 : 2;

  return (
    <div style={{ position: "relative", height: 46, marginTop: 14 }}>
      {targetPct != null && targetPct <= 100 && (
        <div
          aria-hidden
          style={{
            position: "absolute", left: 0, right: 0, bottom: `${targetPct}%`,
            height: 1, background: C("line"),
          }}
        />
      )}
      <div style={{ display: "flex", alignItems: "flex-end", gap, height: "100%" }}>
        {stat.series.map((v, i) => (
          <div key={i} style={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end", minWidth: 0 }}>
            {v != null && (
              <div
                style={{
                  width: "100%",
                  height: `${Math.max(3, (v / peak) * 100)}%`,
                  background: accent,
                  borderRadius: 2,
                  opacity: 0.85,
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── copy ─────────────────────────────────────────────────────────────────── */

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

/** Turn a finding's SHAPE into its sentence. Core ships `{ kind, value }`; every
 *  word of this lives in i18n, which is why the mapping is here and not there. */
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
