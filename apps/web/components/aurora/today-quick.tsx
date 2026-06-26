"use client";

import { useEffect, useMemo, useState } from "react";
import { fs, todayNutrition, adaptiveTargets, type Signal } from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import { AuroraIcon } from "./icons";

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
  const hasNutrition = today.kcal > 0;
  const done = checkedToday === true;

  const widget = { aspectRatio: "1 / 1", borderRadius: 26, border: `1px solid ${C("line")}`, background: C("ink2"), boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 16, display: "flex", flexDirection: "column" as const, cursor: "pointer", textAlign: "left" as const, color: C("chalk") };
  const wicon = (bg: string, fg: string) => ({ width: 30, height: 30, borderRadius: 10, display: "grid", placeItems: "center", background: bg, color: fg });
  const wname = { fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase" as const, color: C("ash"), marginTop: 12 };
  const tag = { fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".06em", textTransform: "uppercase" as const, color: C("ash") };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      {/* CHECK-IN */}
      <button onClick={() => onNavigate?.("checkin")} style={widget} aria-label={t("w.home.today.w.checkin")}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={wicon("rgba(224,98,94,.16)", C("red"))}><AuroraIcon name="heart" size={16} color={C("red")} /></span>
          <span style={tag}>{done ? t("w.home.today.w.done") : t("w.home.today.w.tapLog")}</span>
        </div>
        <div style={wname}>{t("w.home.today.w.checkin")}</div>
        <div style={{ fontWeight: 800, fontSize: done ? 26 : 21, lineHeight: 1.08, marginTop: 6 }}>
          {done ? t("w.home.today.w.checkinDone") : t("w.home.today.w.checkinPrompt")}
        </div>
        <div style={{ marginTop: "auto", borderRadius: 999, textAlign: "center", fontWeight: 700, fontSize: 13, padding: "9px 0", background: done ? "transparent" : C("lime"), color: done ? C("ash") : C("ink"), border: done ? `1px solid ${C("line")}` : "none" }}>
          {done ? t("w.home.today.w.view") : t("w.home.today.w.checkinCta")}
        </div>
      </button>

      {/* NUTRITION */}
      <button onClick={() => onNavigate?.("nutrition")} style={widget} aria-label={t("w.home.today.w.nutrition")}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={wicon("rgba(196,240,53,.14)", C("lime"))}><AuroraIcon name="heart" size={16} color={C("lime")} /></span>
          <span style={tag}>{t("w.home.today.w.today")}</span>
        </div>
        <div style={wname}>{t("w.home.today.w.nutrition")}</div>
        <div style={{ fontWeight: 900, fontSize: 28, lineHeight: 1.05, marginTop: 2 }}>
          {Math.round(today.kcal).toLocaleString()}
          <span style={{ fontSize: 13, color: C("ash"), fontWeight: 600 }}> / {targets.kcal.toLocaleString()}</span>
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C("ash"), marginTop: 2 }}>kcal</div>
        <div style={{ height: 7, borderRadius: 4, background: C("ink"), overflow: "hidden", marginTop: 10 }}>
          <div style={{ width: `${kcalPct * 100}%`, height: "100%", background: today.kcal > targets.kcal * 1.05 ? C("red") : C("lime") }} />
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: C("ash") }}>
          <span>P {Math.round(today.protein)}</span><span>C {Math.round(today.carbs)}</span><span>F {Math.round(today.fat)}</span>
        </div>
        <div style={{ marginTop: "auto", borderRadius: 999, textAlign: "center", fontWeight: 700, fontSize: 13, padding: "9px 0", border: `1px solid ${C("line")}`, color: C("chalk") }}>
          {hasNutrition ? t("w.home.today.w.add") : t("w.home.today.w.addFirst")}
        </div>
      </button>
    </div>
  );
}
