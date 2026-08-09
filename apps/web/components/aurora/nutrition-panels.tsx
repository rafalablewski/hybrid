"use client";

import { useEffect, useRef, useState } from "react";
import {
  type NutritionGoal, type NutritionNudge as NutritionNudgeShape, type NutritionSummary,
} from "@hybrid/core";
import { fs, CARD_PAD } from "@/lib/ui";
import { useLang } from "@/lib/i18n";
import { AuroraIcon } from "./icons";
import { Glyph } from "./nutrition-kit";

/**
 * NUTRITION PANELS (web) — the pieces the hub renders but does not own.
 *
 * The goal-progress overview, the first-run goal wizard, the coach nudge, the
 * calorie ring and the two small dividers. Each already took explicit props and
 * held no screen state; they lived in nutrition.tsx only because that is where
 * they were written.
 *
 * The twin is apps/mobile/components/aurora/nutrition-panels.tsx.
 */

const C = (v: string) => `var(--color-${v})`;

export function CDivider({ label, tier, premium }: { label: string; tier?: string; premium?: boolean }) {
  const C = (v: string) => `var(--color-${v})`;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0 12px" }}>
      <span style={{ flex: 1, height: 1, background: C("line") }} />
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>{label}</span>
        {tier && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: ".08em", textTransform: "uppercase", padding: "2px 8px", borderRadius: 999, border: `1px solid ${premium ? `color-mix(in srgb, var(--premium-accent) 45%, transparent)` : C("line")}`, color: premium ? "var(--premium-accent-text)" : C("ash") }}>{tier}</span>}
      </span>
      <span style={{ flex: 1, height: 1, background: C("line") }} />
    </div>
  );
}

// The coach-voiced "what now?" line — a quiet row (spark glyph + text), coloured
// by kind. No boxed card, no accent bar: it reads like a note, not an alert.
export function NutritionNudgeLine({ nudge }: { nudge: NutritionNudgeShape }) {
  const { t } = useLang();
  const C = (v: string) => `var(--color-${v})`;
  const text =
    nudge.kind === "cold-start" ? t("w.recovery.nutrition.nudgeColdStart")
    : nudge.kind === "protein" ? `${nudge.gap}${t("w.recovery.nutrition.nudgeProteinSuffix")}`
    : nudge.kind === "calories-left" ? `${nudge.gap} ${t("w.recovery.nutrition.nudgeCalSuffix")}`
    : nudge.kind === "over" ? `${nudge.gap} ${t("w.recovery.nutrition.nudgeOverSuffix")}`
    : t("w.recovery.nutrition.nudgeOnTrack");
  const accent = nudge.kind === "over" ? "var(--red-text)" : nudge.kind === "on-track" ? "var(--lime-text)" : "var(--blue-text)";
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "16px 4px 2px" }}>
      {nudge.kind === "on-track"
        ? <AuroraIcon name="check" size={17} color={accent} style={{ marginTop: 1, flexShrink: 0 }} />
        : <Glyph name="spark" size={17} color={accent} style={{ marginTop: 1, flexShrink: 0 }} />}
      <div style={{ fontSize: fs.body, lineHeight: 1.5, color: C("chalk") }}>{text}</div>
    </div>
  );
}

// The calorie RING — one SVG: a background track circle + a single round-capped
// progress arc (2 nodes where the old 52-tick-pair span dial burned 104).
export function Ring({ value, color, size = 44, center }: { value: number; color: string; size?: number; center?: React.ReactNode }) {
  const C = (v: string) => `var(--color-${v})`;
  const pct = Math.max(0, Math.min(100, value));
  const sw = 10;
  const r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0, display: "grid", placeItems: "center" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C("line")} strokeWidth={sw} />
        {pct > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeDasharray={`${(pct / 100) * circ} ${circ}`} />}
      </svg>
      <span style={{ position: "relative" }}>{center}</span>
    </div>
  );
}

// 0 → 1 once on mount, rAF-driven with a cubic ease-out. Under
// prefers-reduced-motion the factor stays at 1 (no animation, no flash) — and
// staying at 1 is also what SSR/hydration render, so the markup never counts
// again on later data refreshes.
export function useCountUpFactor(ms = 700): number {
  const [f, setF] = useState(1);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      setF(1 - Math.pow(1 - p, 3));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    setF(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ms]);
  return f;
}

// The SUMMARY dashboard — goal progress, week/month stat tiles, macro balance
// and (for free users) the deep-insights ✦ Full lock.
// The goal overview. Its own 7/30 toggle was REMOVED when the trends screen
// above it gained a 7/30/90 one: two window controls on one screen, offering
// different spans, is a screen that cannot say what period it is describing.
export function SummaryDashboard({ summary, window, goal, weightChangeKg, onUpgrade, full }: { summary: NutritionSummary; window: number; goal: NutritionGoal; weightChangeKg: number | null; onUpgrade: () => void; full: boolean }) {
  const { t } = useLang();
  const C = (v: string) => `var(--color-${v})`;
  const goalLabel = t(goal === "lose" ? "w.recovery.nutrition.goalLose" : goal === "gain" ? "w.recovery.nutrition.goalGain" : "w.recovery.nutrition.goalMaintain");
  // Generic stats stay neutral (ash); the macro-average tile keeps its violet.
  const tiles: [string, string, string, string][] = [
    [t("w.recovery.nutrition.avgIntake"), summary.avgKcal != null ? String(summary.avgKcal) : "—", t("w.recovery.nutrition.perDay"), C("ash")],
    [t("w.recovery.nutrition.adherence"), summary.adherencePct != null ? String(summary.adherencePct) : "—", t("w.recovery.nutrition.ofDays"), C("ash")],
    [t("w.recovery.nutrition.proteinHit"), `${summary.proteinHitDays}/${summary.loggedDays}`, t("w.recovery.nutrition.daysUnit"), C("ash")],
    [t("w.recovery.nutrition.protein"), summary.avgProtein != null ? `${summary.avgProtein}g` : "—", t("w.recovery.nutrition.perDay").replace("kcal", "avg"), "var(--violet-text)"],
  ];
  return (
    <div style={{ ...cardStyle(C), marginTop: 16, padding: CARD_PAD }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <b style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.note }}>{t("w.recovery.nutrition.summary")}</b>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".08em", textTransform: "uppercase", color: C("ash") }}>{t(`w.recovery.nutrition.an.window${window}`)}</span>
      </div>
      {summary.loggedDays === 0 ? (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 12 }}>{t("w.recovery.nutrition.summaryEmpty")}</div>
      ) : (
        <>
          {/* Goal-progress strip — the chosen goal + the measured 28-day weight
              change (the real signal we have; no invented target). */}
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginTop: 16, background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "12px 16px" }}>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--lime-text)" }}>{t("w.recovery.nutrition.goalProgress")} — {goalLabel}</div>
              <div style={{ fontWeight: 900, fontSize: 22, letterSpacing: "-.02em", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{weightChangeKg != null ? `${weightChangeKg > 0 ? "+" : ""}${weightChangeKg.toFixed(1)} kg` : "—"}</div>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash") }}>{t("w.recovery.nutrition.per28d")}</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
            {tiles.map(([label, val, unit, col]) => (
              <div key={label} style={{ background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: 16 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".08em", textTransform: "uppercase", color: col }}>{label}</div>
                <div style={{ fontWeight: 900, fontSize: 24, letterSpacing: "-.02em", marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{val}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 2 }}>{unit}</div>
              </div>
            ))}
          </div>
          {summary.macroSplit && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".08em", textTransform: "uppercase", color: C("ash"), marginBottom: 10 }}>{t("w.recovery.nutrition.macroBalance")}</div>
              {([["w.recovery.nutrition.protein", summary.macroSplit.protein, C("blue"), "var(--blue-text)"], ["w.recovery.nutrition.carbs", summary.macroSplit.carbs, C("amber"), "var(--amber-text)"], ["w.recovery.nutrition.fat", summary.macroSplit.fat, C("violet"), "var(--violet-text)"]] as const).map(([label, pct, col, colT]) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: colT, width: 52, textTransform: "uppercase", letterSpacing: ".08em" }}>{t(label)}</span>
                  <div style={{ flex: 1, height: 4, borderRadius: 999, background: C("ink2"), overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: col }} /></div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, width: 30, textAlign: "right", color: C("ash"), fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
                </div>
              ))}
            </div>
          )}
          {!full && (
            <button className="pressable" onClick={onUpgrade} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, marginTop: 16, textAlign: "left", background: `color-mix(in srgb, var(--premium-accent) 9%, ${C("ink")})`, border: `1px solid color-mix(in srgb, var(--premium-accent) 30%, transparent)`, borderRadius: 16, padding: 16, cursor: "pointer", color: C("chalk") }}>
              <Glyph name="spark" size={19} color="var(--premium-accent-text)" />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: fs.body }}>{t("w.recovery.nutrition.deepInsights")}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 2 }}>{t("w.recovery.nutrition.deepInsightsSub")}</div>
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--premium-accent-text)" }}>✦ {t("w.account.settings.full")}</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}

// The guided 3-step onboarding: goal → activity + weigh-in → ✦ trial. A progress
// bar + Back/Continue drive the wizard; the weigh-in posts a real bodyMass signal
// so targets can personalize. Choice cards carry no emoji — the label, sub and
// radio do the work.
const ACTIVITY: { id: string; labelKey: string; subKey: string }[] = [
  { id: "light", labelKey: "w.recovery.nutrition.actLight", subKey: "w.recovery.nutrition.actLightSub" },
  { id: "moderate", labelKey: "w.recovery.nutrition.actModerate", subKey: "w.recovery.nutrition.actModerateSub" },
  { id: "high", labelKey: "w.recovery.nutrition.actHigh", subKey: "w.recovery.nutrition.actHighSub" },
];
export function OnboardingGoal({ goal, setGoal, onUpgrade, onWeighIn, onContinueFree, currentWeightKg }: { goal: NutritionGoal; setGoal: (g: NutritionGoal) => void; onUpgrade: () => void; onWeighIn: (kg: number) => void; onContinueFree: () => void; currentWeightKg?: number }) {
  const { t } = useLang();
  const C = (v: string) => `var(--color-${v})`;
  const [step, setStep] = useState(0);
  const [activity, setActivity] = useState("moderate");
  const [weight, setWeight] = useState("");
  const field = { fontFamily: "var(--font-mono)", fontSize: fs.bodyLg, minWidth: 0, boxSizing: "border-box" as const, background: C("ink"), color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "12px 12px", outline: "none", textAlign: "center" as const };
  const GOAL_OPTS: { id: NutritionGoal; label: string; sub: string }[] = [
    { id: "lose", label: t("w.recovery.nutrition.goalLose"), sub: t("w.recovery.nutrition.goalLoseSub") },
    { id: "maintain", label: t("w.recovery.nutrition.goalMaintain"), sub: t("w.recovery.nutrition.goalMaintainSub") },
    { id: "gain", label: t("w.recovery.nutrition.goalGain"), sub: t("w.recovery.nutrition.goalGainSub") },
  ];
  /* A wizard OPTION ROW (label + sub + radio) — the app already has a standard
     for this, in the onboarding wizard (aurora/onboarding.tsx `choice`, and the
     mobile `Choice`): RADIUS 16 at padding 16, a 1px border that swaps line →
     lime when picked, and a lime wash at 8% behind it — sitting inside the
     wizard's own r28/20 card. This row was the only one off it: radius 28 here
     against 16 on mobile (so the same control was card-shaped on one client and
     field-shaped on the other), and a `0 0 0 1px` shadow ring faking the second
     border that mobile drew by widening its own. Both are gone; the row now
     states selection the way the other three wizards in the app do. */
  const choiceCard = (on: boolean, label: string, sub: string, onClick: () => void) => (
    <button className="pressable" onClick={onClick} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left", background: on ? `color-mix(in srgb, ${C("lime")} 8%, transparent)` : C("ink2"), border: `1px solid ${on ? C("lime") : C("line")}`, borderRadius: 16, boxShadow: "var(--shadow-card)", padding: 16, marginBottom: 10, cursor: "pointer", color: C("chalk") }}>
      <div style={{ flex: 1 }}><div style={{ fontWeight: 800, fontSize: fs.bodyLg }}>{label}</div><div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 3 }}>{sub}</div></div>
      <span style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${on ? C("lime") : C("line")}`, background: on ? C("lime") : "transparent", display: "grid", placeItems: "center" }}>{on && <AuroraIcon name="check" size={12} color="var(--on-accent)" />}</span>
    </button>
  );
  const primary = (label: string, onClick: () => void) => (
    <button className="pressable" onClick={onClick} style={{ width: "100%", fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.subtitle, background: C("lime"), color: "var(--on-accent)", border: "none", borderRadius: 999, padding: 16, marginTop: 6, cursor: "pointer" }}>{label}</button>
  );
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {step > 0 && <button className="pressable" onClick={() => setStep((s) => s - 1)} aria-label={t("w.recovery.nutrition.back")} style={{ width: 36, height: 36, borderRadius: 12, border: `1px solid ${C("line")}`, background: "var(--back-surface)", color: C("chalk"), cursor: "pointer", display: "grid", placeItems: "center" }}><AuroraIcon name="back" size={16} color={C("chalk")} /></button>}
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash") }}>{t("w.recovery.nutrition.stepOf").replace("{n}", String(step + 1))}</div>
      </div>
      <div style={{ height: 4, borderRadius: 999, background: C("ink"), overflow: "hidden", marginTop: 12 }}><div style={{ width: `${((step + 1) / 3) * 100}%`, height: "100%", background: C("lime"), transition: "width .3s" }} /></div>

      {step === 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.heading, letterSpacing: "-.02em" }}>{t("w.recovery.nutrition.pickGoal")}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 6, marginBottom: 16 }}>{t("w.recovery.nutrition.pickGoalSub")}</div>
          {GOAL_OPTS.map((o) => <div key={o.id}>{choiceCard(goal === o.id, o.label, o.sub, () => setGoal(o.id))}</div>)}
          {primary(t("w.recovery.nutrition.continue"), () => setStep(1))}
        </div>
      )}

      {step === 1 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.heading, letterSpacing: "-.02em" }}>{t("w.recovery.nutrition.pickActivity")}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 6, marginBottom: 16 }}>{t("w.recovery.nutrition.pickActivitySub")}</div>
          {ACTIVITY.map((a) => <div key={a.id}>{choiceCard(activity === a.id, t(a.labelKey), t(a.subKey), () => setActivity(a.id))}</div>)}
          <div style={{ ...cardStyle(C), padding: CARD_PAD, marginTop: 4 }}>
            {currentWeightKg != null ? (
              /* Profile already has a weight — reuse it (one canonical source),
                 don't ask again. */
              <>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--lime-text)" }}>{t("w.recovery.nutrition.currentWeight")}</div>
                <div style={{ fontWeight: 900, fontSize: 26, letterSpacing: "-.02em", marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{currentWeightKg}<span style={{ fontWeight: 400, fontSize: 14, color: C("ash") }}> kg</span></div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 6 }}>{t("w.recovery.nutrition.weightFromProfile")}</div>
              </>
            ) : (
              <>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--lime-text)" }}>{t("w.recovery.nutrition.addWeighIn")}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 5 }}>{t("w.recovery.nutrition.addWeighInSub")}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <input value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal" placeholder="kg" aria-label={t("w.recovery.nutrition.addWeighIn")} style={{ ...field, flex: 1 }} />
                  <button className="pressable" onClick={() => { const kg = parseFloat(weight); if (Number.isFinite(kg) && kg > 0) onWeighIn(kg); }} style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.body, background: "transparent", color: "var(--lime-text)", border: `1px solid ${C("lime")}`, borderRadius: 16, padding: "0 16px", cursor: "pointer" }}>{t("w.recovery.nutrition.save")}</button>
                </div>
              </>
            )}
          </div>
          {primary(t("w.recovery.nutrition.continue"), () => setStep(2))}
        </div>
      )}

      {step === 2 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ ...cardStyle(C), padding: CARD_PAD, textAlign: "center", background: `color-mix(in srgb, var(--premium-accent) 8%, ${C("ink2")})`, borderColor: `color-mix(in srgb, var(--premium-accent) 30%, ${C("line")})` }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--premium-accent-text)", background: `color-mix(in srgb, var(--premium-accent) 16%, transparent)`, borderRadius: 999, padding: "6px 12px" }}>✦ {t("w.account.settings.full")}</span>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 22, letterSpacing: "-.02em", marginTop: 16 }}>{t("w.recovery.nutrition.trialTitle")}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 8, lineHeight: 1.5 }}>{t("w.recovery.nutrition.trialSub")}</div>
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 900, fontSize: 26, letterSpacing: "-.02em" }}>$9.99<span style={{ fontWeight: 400, fontSize: 13, color: C("ash") }}> {t("w.account.upgrade.per-month")}</span></div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: "var(--lime-text)", marginTop: 3 }}>{t("w.recovery.nutrition.trialNote")}</div>
            </div>
            <button className="pressable" onClick={onUpgrade} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.subtitle, color: "var(--premium-accent-ink)", background: "var(--premium-accent)", border: "none", borderRadius: 16, padding: 16, marginTop: 16, cursor: "pointer" }}>{t("w.recovery.nutrition.startTrial")} <Glyph name="chevron" size={15} color="var(--premium-accent-ink)" /></button>
          </div>
          {/* The FREE alternative — a limited plan the user can start on now,
              no card needed. Full is the trial card above; this is the way out
              that isn't an upgrade. */}
          <div style={{ ...cardStyle(C), padding: CARD_PAD, marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.note }}>{t("w.recovery.nutrition.freePlanTitle")}</div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>{t("w.recovery.nutrition.freePlanSub")}</span>
            </div>
            <div style={{ marginTop: 12 }}>
              {["w.recovery.nutrition.freeBulletLogging", "w.recovery.nutrition.freeBulletMeals", "w.recovery.nutrition.freeBulletProducts", "w.recovery.nutrition.freeBulletInsights"].map((k) => (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0" }}>
                  <AuroraIcon name="check" size={15} color="var(--lime-text)" />
                  <span style={{ fontSize: fs.body }}>{t(k)}</span>
                </div>
              ))}
            </div>
            <button className="pressable" onClick={onContinueFree} style={{ width: "100%", marginTop: 16, fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.subtitle, background: "transparent", color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 999, padding: 16, cursor: "pointer" }}>{t("w.recovery.nutrition.continueFree")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function cardStyle(C: (v: string) => string) {
  return { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "var(--shadow-card)" } as const;
}
