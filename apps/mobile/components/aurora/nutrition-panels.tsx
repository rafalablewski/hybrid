import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput } from "react-native";
import Svg, { Path, Circle, Polyline } from "react-native-svg";
import {
  type NutritionGoal, type NutritionNudge as NutritionNudgeShape, type NutritionSummary,
  type WeightPoint,
} from "@hybrid/core";
import { fs, space, leading, tracking, F, PressScale as Pressable, FIXED_FONT_SCALE, MAX_FONT_SCALE } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { usePremiumAccent } from "../../lib/premium-accent";
import { useLang } from "../../lib/i18n";
import { APill, ACard, AHeading, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";
import { Glyph } from "./nutrition-kit";
import { withAlpha } from "./field";

/**
 * NUTRITION PANELS (mobile) — the pieces the hub renders but does not own.
 *
 * The twin of apps/web/components/aurora/nutrition-panels.tsx: the goal
 * overview, the first-run wizard, the coach nudge and the weight trend.
 */

export function CDivider({ label, tier, premium }: { label: string; tier?: string; premium?: boolean }) {
  const { palette: C } = useTheme();
  const pa = usePremiumAccent();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16, marginBottom: 12 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: tracking.caps, color: C.ash }}>{label}</Text>
        {tier ? <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1, borderColor: premium ? `${pa.fill}73` : C.line, color: premium ? pa.text : C.ash }}>{tier}</Text> : null}
      </View>
      <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
    </View>
  );
}

// Bodyweight-trend chart — the mobile parity of the web recharts LineChart
// (aurora/nutrition.tsx). No react-native-svg line: it reuses the native
// bar-trend idiom on the EWMA-smoothed weight series, with the raw latest weight
// + span dates so it reads as a trend at a glance.
export function WeightTrend({ points, color }: { points: WeightPoint[]; color: string }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const series = points.map((p) => p.smoothed);
  const max = Math.max(...series), min = Math.min(...series), range = max - min || 1;
  const first = points[0]!, latest = points[points.length - 1]!;
  return (
    <View style={{ marginTop: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk }}>{latest.smoothed} kg <Text style={{ color: C.ash }}>{t("w.recovery.nutrition.trend")}</Text></Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{latest.raw} kg {t("w.recovery.nutrition.raw")}</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: 64, gap: series.length > 40 ? 1 : 2 }}>
        {series.map((v, i) => (
          <View key={i} style={{ flex: 1, height: 6 + ((v - min) / range) * 58, borderRadius: 2, backgroundColor: i === series.length - 1 ? color : `${color}55` }} />
        ))}
      </View>
      {points.length > 1 && (
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{first.date.slice(5)}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{latest.date.slice(5)}</Text>
        </View>
      )}
    </View>
  );
}


// The coach-voiced "what now?" line — a quiet row (spark glyph + text), coloured
// by kind. No boxed card, no accent bar: it reads like a note, not an alert.
export function NutritionNudgeLine({ nudge }: { nudge: NutritionNudgeShape }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const text =
    nudge.kind === "cold-start" ? t("w.recovery.nutrition.nudgeColdStart")
    : nudge.kind === "protein" ? `${nudge.gap}${t("w.recovery.nutrition.nudgeProteinSuffix")}`
    : nudge.kind === "calories-left" ? `${nudge.gap} ${t("w.recovery.nutrition.nudgeCalSuffix")}`
    : nudge.kind === "over" ? `${nudge.gap} ${t("w.recovery.nutrition.nudgeOverSuffix")}`
    : t("w.recovery.nutrition.nudgeOnTrack");
  const accent = nudge.kind === "over" ? txt(C, C.red) : nudge.kind === "on-track" ? txt(C, C.lime) : txt(C, C.blue);
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 4, paddingTop: 16, paddingBottom: 2 }}>
      {nudge.kind === "on-track"
        ? <AuroraIcon name="check" size={17} color={accent} style={{ marginTop: 1 }} />
        : <View style={{ marginTop: 1 }}><Glyph name="spark" size={17} color={accent} strokeWidth={5} /></View>}
      <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, color: C.chalk, lineHeight: leading(fs.body) }}>{text}</Text>
    </View>
  );
}

// The SUMMARY dashboard — a week/month rollup of stat tiles + macro balance.
// The goal overview. Its own 7/30 toggle was REMOVED when the trends screen
// above it gained a 7/30/90 one: two window controls on one screen, offering
// different spans, is a screen that cannot say what period it is describing.
export function SummaryDashboard({ summary, window, goal, weightChangeKg, onUpgrade, full }: { summary: NutritionSummary; window: number; goal: NutritionGoal; weightChangeKg: number | null; onUpgrade: () => void; full: boolean }) {
  const { palette: C } = useTheme();
  const pa = usePremiumAccent();
  const { t } = useLang();
  const goalLabel = t(goal === "lose" ? "w.recovery.nutrition.goalLose" : goal === "gain" ? "w.recovery.nutrition.goalGain" : "w.recovery.nutrition.goalMaintain");
  // Generic stats stay neutral (ash); the macro-average tile keeps its violet.
  const tiles: [string, string, string, string][] = [
    [t("w.recovery.nutrition.avgIntake"), summary.avgKcal != null ? String(summary.avgKcal) : "—", t("w.recovery.nutrition.perDay"), C.ash],
    [t("w.recovery.nutrition.adherence"), summary.adherencePct != null ? String(summary.adherencePct) : "—", t("w.recovery.nutrition.ofDays"), C.ash],
    [t("w.recovery.nutrition.proteinHit"), `${summary.proteinHitDays}/${summary.loggedDays}`, t("w.recovery.nutrition.daysUnit"), C.ash],
    [t("w.recovery.nutrition.protein"), summary.avgProtein != null ? `${summary.avgProtein}g` : "—", t("w.recovery.nutrition.perDay").replace("kcal", "avg"), txt(C, C.violet)],
  ];
  return (
    <ACard solid style={{ marginTop: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{t("w.recovery.nutrition.summary")}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }}>{t(`w.recovery.nutrition.an.window${window}`)}</Text>
      </View>
      {summary.loggedDays === 0 ? (
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 12 }}>{t("w.recovery.nutrition.summaryEmpty")}</Text>
      ) : (
        <>
          {/* Goal-progress strip — goal + measured 28-day weight change. */}
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 16, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 16 }}>
            <View>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: txt(C, C.lime) }}>{t("w.recovery.nutrition.goalProgress")} — {goalLabel}</Text>
              <Text style={{ fontFamily: F.black, fontSize: 22, letterSpacing: tracking.display, color: C.chalk, marginTop: 4 }}>{weightChangeKg != null ? `${weightChangeKg > 0 ? "+" : ""}${weightChangeKg.toFixed(1)} kg` : "—"}</Text>
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{t("w.recovery.nutrition.per28d")}</Text>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
            {tiles.map(([label, val, unit, col]) => (
              <View key={label} style={{ width: "47%", flexGrow: 1, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 16 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: col }}>{label}</Text>
                <Text style={{ fontFamily: F.black, fontSize: 23, letterSpacing: tracking.display, color: C.chalk, marginTop: 6 }}>{val}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{unit}</Text>
              </View>
            ))}
          </View>
          {summary.macroSplit ? (
            <View style={{ marginTop: 16 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash, marginBottom: 10 }}>{t("w.recovery.nutrition.macroBalance")}</Text>
              {([["w.recovery.nutrition.protein", summary.macroSplit.protein, C.blue, txt(C, C.blue)], ["w.recovery.nutrition.carbs", summary.macroSplit.carbs, C.amber, txt(C, C.amber)], ["w.recovery.nutrition.fat", summary.macroSplit.fat, C.violet, txt(C, C.violet)]] as const).map(([label, pct, col, colT]) => (
                <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: tracking.label, textTransform: "uppercase", color: colT, width: 52 }}>{t(label)}</Text>
                  <View style={{ flex: 1, height: 4, borderRadius: RADIUS.pill, backgroundColor: C.ink2, overflow: "hidden" }}><View style={{ width: `${pct}%`, height: 4, borderRadius: RADIUS.pill, backgroundColor: col }} /></View>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, width: 30, textAlign: "right" }}>{pct}%</Text>
                </View>
              ))}
            </View>
          ) : null}
          {!full ? (
            <Pressable onPress={onUpgrade} style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16, backgroundColor: `${pa.fill}17`, borderWidth: 1, borderColor: `${pa.fill}4d`, borderRadius: 16, padding: 16 }}>
              <Glyph name="spark" size={19} color={pa.text} strokeWidth={5} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{t("w.recovery.nutrition.deepInsights")}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{t("w.recovery.nutrition.deepInsightsSub")}</Text>
              </View>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: pa.text }}>✦ {t("w.account.settings.full")}</Text>
            </Pressable>
          ) : null}
        </>
      )}
    </ACard>
  );
}

// The guided 3-step onboarding: goal → activity + weigh-in → ✦ trial. Choice
// cards carry no emoji — the label, sub and radio do the work.
const MACT: { id: string; labelKey: string; subKey: string }[] = [
  { id: "light", labelKey: "w.recovery.nutrition.actLight", subKey: "w.recovery.nutrition.actLightSub" },
  { id: "moderate", labelKey: "w.recovery.nutrition.actModerate", subKey: "w.recovery.nutrition.actModerateSub" },
  { id: "high", labelKey: "w.recovery.nutrition.actHigh", subKey: "w.recovery.nutrition.actHighSub" },
];
export function OnboardingGoal({ goal, setGoal, onUpgrade, onWeighIn, onContinueFree, currentWeightKg }: { goal: NutritionGoal; setGoal: (g: NutritionGoal) => void; onUpgrade: () => void; onWeighIn: (kg: number) => void; onContinueFree: () => void; currentWeightKg?: number }) {
  const { palette: C } = useTheme();
  const pa = usePremiumAccent();
  const { t } = useLang();
  const [step, setStep] = useState(0);
  const [activity, setActivity] = useState("moderate");
  const [weight, setWeight] = useState("");
  const GOAL_OPTS: { id: NutritionGoal; label: string; sub: string }[] = [
    { id: "lose", label: t("w.recovery.nutrition.goalLose"), sub: t("w.recovery.nutrition.goalLoseSub") },
    { id: "maintain", label: t("w.recovery.nutrition.goalMaintain"), sub: t("w.recovery.nutrition.goalMaintainSub") },
    { id: "gain", label: t("w.recovery.nutrition.goalGain"), sub: t("w.recovery.nutrition.goalGainSub") },
  ];
  /* The wizard OPTION ROW — the app's standard for this lives in the onboarding
     wizard (aurora/onboarding.tsx `Choice`, and the web twin): RADIUS.field at
     padding 16, a 1px border that swaps line → lime when picked, and a lime wash
     at 8% behind it. This row drew its selected state by widening its own border
     to 2 and taking a pixel off the padding to compensate — so picking an option
     nudged its label; web meanwhile faked the same second border with a shadow
     ring, on a row it had built at the CARD radius. One control, two shapes and
     two techniques. Now both read the standard. */
  const choice = (on: boolean, label: string, sub: string, onPress: () => void) => (
    <Pressable key={label} onPress={onPress} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: on ? withAlpha(C.lime, 0.08) : C.ink2, borderWidth: 1, borderColor: on ? C.lime : C.line, borderRadius: RADIUS.field, padding: 16, marginBottom: 10 }}>
      <View style={{ flex: 1 }}><Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{label}</Text><Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 3 }}>{sub}</Text></View>
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? C.lime : C.line, backgroundColor: on ? C.lime : "transparent", alignItems: "center", justifyContent: "center" }}>{on ? <AuroraIcon name="check" size={12} color={C.onAccent} /> : null}</View>
    </Pressable>
  );
  const primary = (label: string, onPress: () => void) => (
    <APill label={label} onPress={onPress} style={{ marginTop: 6 }} />
  );
  return (
    <View style={{ marginTop: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        {step > 0 ? <Pressable onPress={() => setStep((s) => s - 1)} accessibilityLabel={t("w.recovery.nutrition.back")} style={{ width: 36, height: 36, borderRadius: 12, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}><AuroraIcon name="back" size={16} color={C.chalk} /></Pressable> : null}
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: tracking.caps, textTransform: "uppercase", color: C.ash }}>{t("w.recovery.nutrition.stepOf").replace("{n}", String(step + 1))}</Text>
      </View>
      <View style={{ height: 4, borderRadius: RADIUS.pill, backgroundColor: C.ink, overflow: "hidden", marginTop: 12 }}><View style={{ width: `${((step + 1) / 3) * 100}%`, height: 4, backgroundColor: C.lime }} /></View>

      {step === 0 ? (
        <View style={{ marginTop: 24 }}>
          <AHeading style={{ fontSize: fs.title }}>{t("w.recovery.nutrition.pickGoal")}</AHeading>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 6, marginBottom: 16 }}>{t("w.recovery.nutrition.pickGoalSub")}</Text>
          {GOAL_OPTS.map((o) => choice(goal === o.id, o.label, o.sub, () => setGoal(o.id)))}
          {primary(t("w.recovery.nutrition.continue"), () => setStep(1))}
        </View>
      ) : null}

      {step === 1 ? (
        <View style={{ marginTop: 24 }}>
          <AHeading style={{ fontSize: fs.title }}>{t("w.recovery.nutrition.pickActivity")}</AHeading>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 6, marginBottom: 16 }}>{t("w.recovery.nutrition.pickActivitySub")}</Text>
          {MACT.map((a) => choice(activity === a.id, t(a.labelKey), t(a.subKey), () => setActivity(a.id)))}
          <ACard solid style={{ marginTop: 4 }}>
            {currentWeightKg != null ? (
              /* Profile already has a weight — reuse it, don't ask again. */
              <>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: tracking.caps, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.currentWeight")}</Text>
                <Text style={{ fontFamily: F.black, fontSize: 26, letterSpacing: tracking.display, color: C.chalk, marginTop: 6 }}>{currentWeightKg}<Text style={{ fontFamily: F.mono, fontSize: 14, color: C.ash }}> kg</Text></Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 6 }}>{t("w.recovery.nutrition.weightFromProfile")}</Text>
              </>
            ) : (
              <>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: tracking.caps, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.addWeighIn")}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 5 }}>{t("w.recovery.nutrition.addWeighInSub")}</Text>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                  <TextInput value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="kg" placeholderTextColor={C.ash} accessibilityLabel={t("w.recovery.nutrition.addWeighIn")} style={{ flex: 1, fontFamily: F.mono, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 12, paddingVertical: 12, textAlign: "center" }} />
                  <Pressable onPress={() => { const kg = parseFloat(weight); if (Number.isFinite(kg) && kg > 0) onWeighIn(kg); }} style={{ borderWidth: 1, borderColor: C.lime, borderRadius: RADIUS.field, paddingHorizontal: 16, justifyContent: "center" }}><Text style={{ fontFamily: F.monoBold, fontSize: fs.body, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.save")}</Text></Pressable>
                </View>
              </>
            )}
          </ACard>
          {primary(t("w.recovery.nutrition.continue"), () => setStep(2))}
        </View>
      ) : null}

      {step === 2 ? (
        <View style={{ marginTop: 24 }}>
          <ACard solid style={{ alignItems: "center", paddingVertical: 20, backgroundColor: `${pa.fill}14`, borderColor: `${pa.fill}4d` }}>
            <View style={{ backgroundColor: `${pa.fill}28`, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}><Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: tracking.caps, textTransform: "uppercase", color: pa.text }}>✦ {t("w.account.settings.full")}</Text></View>
            <AHeading style={{ fontSize: 22, marginTop: 16, textAlign: "center" }}>{t("w.recovery.nutrition.trialTitle")}</AHeading>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 8, textAlign: "center", lineHeight: leading(fs.caption) }}>{t("w.recovery.nutrition.trialSub")}</Text>
            <Text style={{ fontFamily: F.black, fontSize: 26, letterSpacing: tracking.display, color: C.chalk, marginTop: 16 }}>$9.99<Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ash }}> {t("w.account.upgrade.per-month")}</Text></Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.lime), marginTop: 3 }}>{t("w.recovery.nutrition.trialNote")}</Text>
            <Pressable onPress={onUpgrade} style={{ alignSelf: "stretch", flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, backgroundColor: pa.fill, borderRadius: 16, paddingVertical: 16, marginTop: 16 }}><Text style={{ fontFamily: F.monoBold, fontSize: fs.subtitle, color: pa.ink }}>{t("w.recovery.nutrition.startTrial")}</Text><Glyph name="chevron" size={15} color={pa.ink} strokeWidth={6} /></Pressable>
          </ACard>
          {/* The FREE alternative — a limited plan to start on now, no card
              needed. Full is the trial card above; this is the way out that
              isn't an upgrade. */}
          <ACard solid style={{ marginTop: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{t("w.recovery.nutrition.freePlanTitle")}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: tracking.label, color: C.ash }}>{t("w.recovery.nutrition.freePlanSub")}</Text>
            </View>
            <View style={{ marginTop: 12 }}>
              {["w.recovery.nutrition.freeBulletLogging", "w.recovery.nutrition.freeBulletMeals", "w.recovery.nutrition.freeBulletProducts", "w.recovery.nutrition.freeBulletInsights"].map((k) => (
                <View key={k} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 }}>
                  <AuroraIcon name="check" size={15} color={txt(C, C.lime)} />
                  <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk }}>{t(k)}</Text>
                </View>
              ))}
            </View>
            <Pressable onPress={onContinueFree} accessibilityRole="button" style={{ marginTop: 16, borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingVertical: 16, alignItems: "center" }}>
              <Text style={{ fontFamily: F.monoBold, fontSize: fs.subtitle, color: C.chalk }}>{t("w.recovery.nutrition.continueFree")}</Text>
            </Pressable>
          </ACard>
        </View>
      ) : null}
    </View>
  );
}

// One quadrant tile of the compact Add-a-meal entry: a labelled big-number field
// (kcal / protein / carbs / fat) in the macro's own colour.
export function QuadTile({ field, label, unit, color, value, onChange }: { field: string; label: string; unit: string; color: string; value: string; onChange: (v: string) => void }) {
  const { palette: C } = useTheme();
  return (
    <View style={{ flexGrow: 1, flexBasis: "46%", backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 5, marginTop: 4 }}>
        <TextInput value={value} onChangeText={onChange} keyboardType="numeric" placeholder="0" placeholderTextColor={C.ash} accessibilityLabel={`${label} (${unit})`} testID={`quad-${field}`} style={{ flex: 1, fontFamily: F.black, fontSize: 26, letterSpacing: tracking.display, color: C.chalk, paddingVertical: 2 }} />
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginBottom: 6 }}>{unit}</Text>
      </View>
    </View>
  );
}

export function Cell({ value, onChange, ph, inputRef }: { value: string; onChange: (v: string) => void; ph: string; inputRef?: React.RefObject<TextInput | null> }) {
  const { palette: C } = useTheme();
  return (
    <TextInput
      ref={inputRef}
      value={value}
      onChangeText={onChange}
      placeholder={ph}
      placeholderTextColor={C.ash}
      keyboardType="numeric"
      style={{ flex: 1, fontFamily: F.mono, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 8, paddingVertical: 12, textAlign: "center" }}
    />
  );
}
