"use client";

import { useEffect, useMemo, useState } from "react";
import { fs, todayNutrition, adaptiveTargets, type Signal } from "@hybrid/core";
import { useLang } from "@/lib/i18n";

const C = (v: string) => `var(--color-${v})`;

type Row = { userId: string; kind: string; value: number; unit: string; source: string; ts: string };

/**
 * AURORA Today widgets (web) — the daily check-in + nutrition as two SQUARE,
 * iPhone-home-screen-style widgets side by side. Each shows a glanceable state
 * (have you checked in today? today's calories vs target) and opens the full
 * Check-in / Nutrition screen on tap — the logging itself lives on those
 * screens, so the widgets stay small and scannable. Mirrored on mobile
 * (today-quick.tsx there).
 */
export default function TodayWidgets({ onNavigate }: { onNavigate?: (screen: string) => void }) {
  const { t } = useLang();
  const [signals, setSignals] = useState<Signal[]>([]);
  // null = still loading; true/false once /api/checkins returns.
  const [checkedToday, setCheckedToday] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/signals");
        if (r.ok) {
          const d = (await r.json()) as { signals?: Row[] };
          if (alive) setSignals((d.signals ?? []).map((s) => ({ athleteId: s.userId, kind: s.kind as Signal["kind"], value: s.value, unit: s.unit, source: s.source, ts: s.ts })));
        }
      } catch { /* leave empty */ }
      try {
        const r = await fetch("/api/checkins");
        if (r.ok) {
          const d = (await r.json()) as { checkins?: { weekOf: string }[] };
          const today = new Date().toDateString();
          if (alive) setCheckedToday((d.checkins ?? []).some((c) => new Date(c.weekOf).toDateString() === today));
        } else if (alive) setCheckedToday(false);
      } catch { if (alive) setCheckedToday(false); }
    })();
    return () => { alive = false; };
  }, []);

  const today = useMemo(() => todayNutrition(signals), [signals]);
  const targets = useMemo(() => adaptiveTargets(signals, { goal: "maintain" }), [signals]);
  const kcalPct = targets.kcal > 0 ? Math.min(1, today.kcal / targets.kcal) : 0;
  const done = checkedToday === true;

  // FEEL section → blue accents (the spectrum's Feel band), clean & icon-free.
  // minWidth:0 lets each 1fr grid track shrink below the button's content size —
  // without it the tracks hold their intrinsic min-width and the two-up grid
  // blows past the viewport on narrow phones (≤360dp), causing horizontal scroll.
  const widget = { minWidth: 0, aspectRatio: "1 / 1", borderRadius: 26, border: `1px solid ${C("line")}`, background: C("ink2"), boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 18, display: "flex", flexDirection: "column" as const, cursor: "pointer", textAlign: "left" as const, color: C("chalk"), overflow: "hidden" };
  const wname = { fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase" as const, color: "var(--blue-text)" };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      {/* CHECK-IN */}
      <button onClick={() => onNavigate?.("checkin")} style={widget} aria-label={t("w.home.today.w.checkin")}>
        <div style={wname}>{t("w.home.today.w.checkin")}</div>
        <div style={{ fontWeight: 800, fontSize: done ? 24 : 21, lineHeight: 1.12, marginTop: 8 }}>
          {done ? t("w.home.today.w.checkinDone") : t("w.home.today.w.checkinPrompt")}
        </div>
        <div style={{ marginTop: "auto", borderRadius: 999, textAlign: "center", fontWeight: 700, fontSize: 13, padding: "11px 0", background: done ? "transparent" : C("blue"), color: done ? C("ash") : "#fff", border: done ? `1px solid ${C("line")}` : "none" }}>
          {done ? t("w.home.today.w.view") : t("w.home.today.w.logReadiness")}
        </div>
      </button>

      {/* NUTRITION */}
      <button onClick={() => onNavigate?.("nutrition")} style={widget} aria-label={t("w.home.today.w.nutrition")}>
        <div style={wname}>{t("w.home.today.w.nutrition")}</div>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 28, lineHeight: 1.05, marginTop: 6 }}>
          {Math.round(today.kcal).toLocaleString()}
          <span style={{ fontSize: 13, color: C("ash"), fontWeight: 600 }}> / {targets.kcal.toLocaleString()}</span>
        </div>
        <div style={{ height: 7, borderRadius: 4, background: C("ink"), overflow: "hidden", marginTop: 8 }}>
          <div style={{ width: `${kcalPct * 100}%`, height: "100%", background: today.kcal > targets.kcal * 1.05 ? C("red") : C("blue") }} />
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: C("ash") }}>
          <span>P <b style={{ color: C("chalk"), fontWeight: 700 }}>{Math.round(today.protein)}g</b></span>
          <span>C <b style={{ color: C("chalk"), fontWeight: 700 }}>{Math.round(today.carbs)}g</b></span>
          <span>F <b style={{ color: C("chalk"), fontWeight: 700 }}>{Math.round(today.fat)}g</b></span>
        </div>
        <div style={{ marginTop: "auto", borderRadius: 999, textAlign: "center", fontWeight: 700, fontSize: 13, padding: "11px 0", border: `1px solid ${C("line")}`, color: C("chalk") }}>
          {t("w.home.today.w.addMeal")}
        </div>
      </button>
    </div>
  );
}
