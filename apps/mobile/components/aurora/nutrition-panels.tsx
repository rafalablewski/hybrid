import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput } from "react-native";
import Svg, { Path, Circle, Polyline } from "react-native-svg";
import {
  type NutritionGoal, type NutritionNudge as NutritionNudgeShape, type NutritionSummary,
  type WeightPoint,
  ALPHA,
} from "@hybrid/core";
import { fs, space, leading, tracking, F, PressScale as Pressable } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { usePremiumAccent } from "../../lib/premium-accent";
import { useLang } from "../../lib/i18n";
import { APill, ACard, AChoice, ASection, AMeter, RADIUS } from "./kit";
import { AuroraIcon, Glyph } from "./icons";
import { haptic } from "../../lib/haptics";
import { withAlpha } from "./field";

/**
 * NUTRITION PANELS (mobile) — the pieces the hub renders but does not own.
 *
 * The goal overview, the first-run wizard, the coach nudge and the weight
 * trend — rendered by the hub, owned here.
 */

export function CDivider({ label, tier, premium }: { label: string; tier?: string; premium?: boolean }) {
  const { palette: C } = useTheme();
  const pa = usePremiumAccent();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16, marginBottom: 12 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: tracking.caps, color: C.ash }}>{label}</Text>
        {tier ? <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: premium ? withAlpha(pa.fill, ALPHA.rim) : C.line, color: premium ? pa.text : C.ash }}>{tier}</Text> : null}
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
          <View key={i} style={{ flex: 1, height: 6 + ((v - min) / range) * 58, borderRadius: 2, backgroundColor: i === series.length - 1 ? color : withAlpha(color, ALPHA.line) }} />
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
        : <View style={{ marginTop: 1 }}><Glyph name="spark" size={17} color={accent} /></View>}
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
  // Generic stats stay neutral (ash); the macro-average tile keeps its Muskmelon.
  const tiles: [string, string, string, string][] = [
    [t("w.recovery.nutrition.avgIntake"), summary.avgKcal != null ? String(summary.avgKcal) : "—", t("w.recovery.nutrition.perDay"), C.ash],
    [t("w.recovery.nutrition.adherence"), summary.adherencePct != null ? String(summary.adherencePct) : "—", t("w.recovery.nutrition.ofDays"), C.ash],
    [t("w.recovery.nutrition.proteinHit"), `${summary.proteinHitDays}/${summary.loggedDays}`, t("w.recovery.nutrition.daysUnit"), C.ash],
    [t("w.recovery.nutrition.protein"), summary.avgProtein != null ? `${summary.avgProtein}g` : "—", t("w.recovery.nutrition.perDay").replace("kcal", "avg"), txt(C, C.red)],
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
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 16, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingVertical: 12, paddingHorizontal: 16 }}>
            <View>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: txt(C, C.lime) }}>{t("w.recovery.nutrition.goalProgress")} — {goalLabel}</Text>
              <Text style={{ fontFamily: F.black, fontSize: fs.headline, letterSpacing: tracking.display, color: C.chalk, marginTop: 4 }}>{weightChangeKg != null ? `${weightChangeKg > 0 ? "+" : ""}${weightChangeKg.toFixed(1)} kg` : "—"}</Text>
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{t("w.recovery.nutrition.per28d")}</Text>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
            {tiles.map(([label, val, unit, col]) => (
              <View key={label} style={{ width: "47%", flexGrow: 1, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, padding: 16 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: col }}>{label}</Text>
                <Text style={{ fontFamily: F.black, fontSize: 23, letterSpacing: tracking.display, color: C.chalk, marginTop: 6 }}>{val}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{unit}</Text>
              </View>
            ))}
          </View>
          {/* MACRO BALANCE — the last hand-drawn proportion in nutrition, and
              now the shared meter like every other.

              It was a `label | 4dp track | 52dp value` row, three of them
              stacked: a fifth track height (4 against AMeter's 6), a fifth
              radius, a label column sized to a magic 52dp — and the label wore
              its macro's accent as TYPE while the fill beside it wore the same
              accent. One quantity, painted twice, in the one place the app had
              already settled: the fill carries the colour, the label is ash.

              The row also broke in the two ways a hand-sized label column
              always does: "Kohlenhydrate" in a 52dp box, and a value column
              wide enough for "9%" but not for a figure that grew. AMeter puts
              the label and its value on one row ABOVE the track, so both are
              free to take the width they need, and all three tracks share a
              baseline.

              These are shares of ENERGY, not amounts against a target, so they
              stay their own block rather than joining the ledger — the ledger's
              form is `have/want` and a split has no `want`. */}
          {summary.macroSplit ? (
            <View style={{ marginTop: 16 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }}>{t("w.recovery.nutrition.macroBalance")}</Text>
              {([["w.recovery.nutrition.protein", summary.macroSplit.protein, C.blue], ["w.recovery.nutrition.carbs", summary.macroSplit.carbs, C.amber], ["w.recovery.nutrition.fat", summary.macroSplit.fat, C.red]] as const).map(([label, pct, col]) => (
                <AMeter key={label} label={t(label)} value={`${pct}%`} pct={pct} color={col} />
              ))}
            </View>
          ) : null}
          {!full ? (
            <Pressable onPress={onUpgrade} style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16, backgroundColor: withAlpha(pa.fill, ALPHA.wash), borderWidth: 1, borderColor: withAlpha(pa.fill, ALPHA.line), borderRadius: RADIUS.field, padding: 16 }}>
              <Glyph name="spark" size={19} color={pa.text} />
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
  /* The wizard OPTION ROW is the kit's `AChoice` — the same component the
     onboarding wizard uses, not a copy of it. This row used to be a copy that
     cited onboarding by name in a comment, and it had drifted exactly as far as
     a copy drifts: the title a rung small, the blurb in MONO at fs.nano, the
     picked label never tinting. A control that needs prose to stay in step
     wants to be a component. */
  const primary = (label: string, onPress: () => void) => (
    <APill label={label} onPress={onPress} style={{ marginTop: 6 }} />
  );
  return (
    <View style={{ marginTop: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        {step > 0 ? <Pressable onPress={() => setStep((s) => s - 1)} accessibilityLabel={t("w.recovery.nutrition.back")} style={{ width: 36, height: 36, borderRadius: RADIUS.inner, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}><AuroraIcon name="back" size={16} color={C.chalk} /></Pressable> : null}
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: tracking.caps, textTransform: "uppercase", color: C.ash }}>{t("w.recovery.nutrition.stepOf").replace("{n}", String(step + 1))}</Text>
      </View>
      <View style={{ height: 4, borderRadius: RADIUS.pill, backgroundColor: C.ink, overflow: "hidden", marginTop: 12 }}><View style={{ width: `${((step + 1) / 3) * 100}%`, height: 4, backgroundColor: C.lime }} /></View>

      {step === 0 ? (
        <View style={{ marginTop: 24 }}>
          <ASection title={t("w.recovery.nutrition.pickGoal")} style={{ marginTop: 0, marginBottom: 0 }} />
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 6, marginBottom: 16 }}>{t("w.recovery.nutrition.pickGoalSub")}</Text>
          <View style={{ gap: space.ms }}>
            {GOAL_OPTS.map((o) => <AChoice key={o.id} active={goal === o.id} title={o.label} sub={o.sub} onPress={() => { haptic.selection(); setGoal(o.id); }} />)}
          </View>
          {primary(t("w.recovery.nutrition.continue"), () => setStep(1))}
        </View>
      ) : null}

      {step === 1 ? (
        <View style={{ marginTop: 24 }}>
          <ASection title={t("w.recovery.nutrition.pickActivity")} style={{ marginTop: 0, marginBottom: 0 }} />
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 6, marginBottom: 16 }}>{t("w.recovery.nutrition.pickActivitySub")}</Text>
          <View style={{ gap: space.ms }}>
            {MACT.map((a) => <AChoice key={a.id} active={activity === a.id} title={t(a.labelKey)} sub={t(a.subKey)} onPress={() => { haptic.selection(); setActivity(a.id); }} />)}
          </View>
          <ACard solid style={{ marginTop: 4 }}>
            {currentWeightKg != null ? (
              /* Profile already has a weight — reuse it, don't ask again. */
              <>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: tracking.caps, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.currentWeight")}</Text>
                <Text style={{ fontFamily: F.black, fontSize: fs.display, letterSpacing: tracking.display, color: C.chalk, marginTop: 6 }}>{currentWeightKg}<Text style={{ fontFamily: F.mono, fontSize: fs.bodyLg, color: C.ash }}> kg</Text></Text>
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
          <ACard solid style={{ alignItems: "center", paddingVertical: 20, backgroundColor: withAlpha(pa.fill, ALPHA.wash), borderColor: withAlpha(pa.fill, ALPHA.line) }}>
            <View style={{ backgroundColor: withAlpha(pa.fill, ALPHA.solid), borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 6 }}><Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.caps, textTransform: "uppercase", color: pa.text }}>✦ {t("w.account.settings.full")}</Text></View>
            <ASection title={t("w.recovery.nutrition.trialTitle")} style={{ marginTop: 16, marginBottom: 0, justifyContent: "center" }} titleStyle={{ fontSize: fs.headline, lineHeight: leading(fs.headline, "snug"), textAlign: "center" }} />
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 8, textAlign: "center", lineHeight: leading(fs.caption) }}>{t("w.recovery.nutrition.trialSub")}</Text>
            <Text style={{ fontFamily: F.black, fontSize: fs.display, letterSpacing: tracking.display, color: C.chalk, marginTop: 16 }}>$9.99<Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}> {t("w.account.upgrade.per-month")}</Text></Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.lime), marginTop: 3 }}>{t("w.recovery.nutrition.trialNote")}</Text>
            <Pressable onPress={onUpgrade} style={{ alignSelf: "stretch", flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, backgroundColor: pa.fill, borderRadius: RADIUS.field, paddingVertical: 16, marginTop: 16 }}><Text style={{ fontFamily: F.monoBold, fontSize: fs.subtitle, color: pa.ink }}>{t("w.recovery.nutrition.startTrial")}</Text><Glyph name="chevron" size={15} color={pa.ink} /></Pressable>
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
            <Pressable onPress={onContinueFree} accessibilityRole="button" style={{ marginTop: 16, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, paddingVertical: 16, alignItems: "center" }}>
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
    <View style={{ flexGrow: 1, flexBasis: "46%", backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 5, marginTop: 4 }}>
        <TextInput value={value} onChangeText={onChange} keyboardType="numeric" placeholder="0" placeholderTextColor={C.ash} accessibilityLabel={`${label} (${unit})`} testID={`quad-${field}`} style={{ flex: 1, fontFamily: F.black, fontSize: fs.display, letterSpacing: tracking.display, color: C.chalk, paddingVertical: 2 }} />
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
