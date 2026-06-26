"use client";

import { useRef, useState } from "react";
import { fs, space } from "@hybrid/core";
import { useRevalidate } from "@/lib/use-invalidate";
import { useLang } from "@/lib/i18n";
import { AuroraIcon } from "./icons";

const C = (v: string) => `var(--color-${v})`;

const RATINGS: { key: "energy" | "sleep" | "soreness" | "mood"; label: string }[] = [
  { key: "energy", label: "w.recovery.checkins.energy" },
  { key: "sleep", label: "w.recovery.checkins.sleep" },
  { key: "soreness", label: "w.recovery.checkins.soreness" },
  { key: "mood", label: "w.recovery.checkins.mood" },
];

type SaveState = "idle" | "saving" | "saved";

/**
 * AURORA Today quick-log (web) — two swipeable widgets in a horizontal
 * scroll-snapping pager: a daily check-in (the four 1–5 readiness ratings) and a
 * nutrition quick-add (kcal + macros). Logging the day's readiness or food is a
 * single swipe from Today, no full Recovery screen needed. Posts to the SAME
 * /api/checkins + /api/signals endpoints as the full screens and revalidates the
 * shared recovery cache. Mirrored 1:1 on mobile (today-quick.tsx there).
 */
export default function TodayQuickLog({ onNavigate }: { onNavigate?: (screen: string) => void }) {
  const { t } = useLang();
  const revalidate = useRevalidate();

  // Pager — track the active card so the dots signal the second widget.
  const pagerRef = useRef<HTMLDivElement>(null);
  const [activeCard, setActiveCard] = useState(0);
  const onPagerScroll = () => {
    const el = pagerRef.current;
    if (!el) return;
    setActiveCard(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  };

  // — Check-in widget —
  const [ratings, setRatings] = useState({ energy: 3, sleep: 3, soreness: 3, mood: 3 });
  const [ciState, setCiState] = useState<SaveState>("idle");
  const [ciErr, setCiErr] = useState("");
  const saveCheckin = async () => {
    setCiState("saving"); setCiErr("");
    try {
      const res = await fetch("/api/checkins", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekOf: new Date().toISOString(), ...ratings }),
      });
      if (res.status === 401) { setCiErr(t("w.home.today.quick.signIn")); setCiState("idle"); return; }
      if (!res.ok) { setCiErr(t("w.home.today.quick.error")); setCiState("idle"); return; }
      setCiState("saved");
      revalidate.recovery();
      window.setTimeout(() => setCiState("idle"), 1800);
    } catch { setCiErr(t("w.home.today.quick.error")); setCiState("idle"); }
  };

  // — Nutrition widget —
  const [macros, setMacros] = useState({ kcal: "", protein: "", carbs: "", fat: "" });
  const [nuState, setNuState] = useState<SaveState>("idle");
  const [nuErr, setNuErr] = useState("");
  const addNutrition = async () => {
    setNuState("saving"); setNuErr("");
    const entries: [string, string, string][] = [
      ["energyIntake", macros.kcal, "kcal"], ["protein", macros.protein, "g"], ["carbs", macros.carbs, "g"], ["fat", macros.fat, "g"],
    ];
    try {
      let any = false;
      for (const [kind, v, unit] of entries) {
        const n = parseFloat(v);
        if (!Number.isFinite(n) || n <= 0) continue;
        any = true;
        const res = await fetch("/api/signals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, value: n, unit, source: "manual" }) });
        if (res.status === 401) { setNuErr(t("w.home.today.quick.signIn")); setNuState("idle"); return; }
        if (!res.ok) { setNuErr(t("w.home.today.quick.error")); setNuState("idle"); return; }
      }
      if (!any) { setNuErr(t("w.home.today.quick.needMacro")); setNuState("idle"); return; }
      setMacros({ kcal: "", protein: "", carbs: "", fat: "" });
      setNuState("saved");
      revalidate.recovery();
      window.setTimeout(() => setNuState("idle"), 1800);
    } catch { setNuErr(t("w.home.today.quick.error")); setNuState("idle"); }
  };

  const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 22, scrollSnapAlign: "start" as const, flex: "0 0 92%", boxSizing: "border-box" as const };
  const numField = { fontFamily: "var(--font-mono)", fontSize: fs.bodyLg, flex: "1 1 64px", minWidth: 0, boxSizing: "border-box" as const, background: C("ink"), color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 14, padding: "12px 12px", outline: "none", textAlign: "center" as const };
  const cta = (st: SaveState) => ({ width: "100%", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.note, background: st === "saved" ? C("blue") : C("lime"), color: C("ink"), border: "none", borderRadius: 999, padding: 13, marginTop: 14, cursor: st === "saving" ? "default" : "pointer", opacity: st === "saving" ? 0.6 : 1 } as const);
  const openLink = { width: "100%", background: "none", border: "none", cursor: "pointer", marginTop: 10, fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash") } as const;

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash"), marginBottom: 10 }}>{t("w.home.today.quick.eyebrow")}</div>

      {/* CHECK-IN ⇄ NUTRITION — horizontal, scroll-snapping pager (two columns) */}
      <div
        ref={pagerRef}
        onScroll={onPagerScroll}
        style={{ display: "flex", gap: 14, overflowX: "auto", scrollSnapType: "x mandatory", scrollbarWidth: "none", paddingBottom: 2, alignItems: "flex-start" }}
      >
        {/* card 1 — daily check-in */}
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: space.ms }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", color: C("lime") }}>{t("w.home.today.quick.checkinTitle")}</span>
            <AuroraIcon name="heart" size={18} color={C("red")} />
          </div>
          <div style={{ fontWeight: 800, fontSize: 20, margin: "6px 0 2px" }}>{t("w.home.today.quick.checkinSub")}</div>
          {RATINGS.map((r) => (
            <div key={r.key} style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 700, fontSize: fs.caption, color: C("ash") }}>{t(r.label)}</div>
              <div style={{ display: "flex", gap: space.xs, marginTop: 6 }}>
                {[1, 2, 3, 4, 5].map((n) => {
                  const sel = ratings[r.key] === n;
                  return (
                    <button key={n} onClick={() => setRatings((s) => ({ ...s, [r.key]: n }))}
                      style={{ flex: 1, height: 38, borderRadius: 999, cursor: "pointer", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.caption, color: sel ? C("ink") : C("ash"), border: `1px solid ${sel ? C("lime") : C("line")}`, background: sel ? C("lime") : "transparent" }}>
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {ciErr && <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("red"), marginTop: 8 }}>{ciErr}</div>}
          <button onClick={saveCheckin} disabled={ciState === "saving"} style={cta(ciState)}>
            {ciState === "saving" ? t("w.home.today.quick.saving") : ciState === "saved" ? t("w.home.today.quick.saved") : t("w.home.today.quick.saveCheckin")}
          </button>
          <button onClick={() => onNavigate?.("checkin")} style={openLink}>{t("w.home.today.quick.openCheckin")}</button>
        </div>

        {/* card 2 — nutrition quick-add */}
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: space.ms }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", color: C("violet") }}>{t("w.home.today.quick.nutritionTitle")}</span>
            <AuroraIcon name="add" size={18} color={C("violet")} />
          </div>
          <div style={{ fontWeight: 800, fontSize: 20, margin: "6px 0 2px" }}>{t("w.home.today.quick.nutritionSub")}</div>
          <div style={{ display: "flex", gap: space.sm, marginTop: 14, flexWrap: "wrap" }}>
            <input value={macros.kcal} onChange={(e) => setMacros((s) => ({ ...s, kcal: e.target.value }))} inputMode="numeric" placeholder="kcal" style={numField} />
            <input value={macros.protein} onChange={(e) => setMacros((s) => ({ ...s, protein: e.target.value }))} inputMode="numeric" placeholder={t("w.recovery.nutrition.proteinPh")} style={numField} />
            <input value={macros.carbs} onChange={(e) => setMacros((s) => ({ ...s, carbs: e.target.value }))} inputMode="numeric" placeholder={t("w.recovery.nutrition.carbsPh")} style={numField} />
            <input value={macros.fat} onChange={(e) => setMacros((s) => ({ ...s, fat: e.target.value }))} inputMode="numeric" placeholder={t("w.recovery.nutrition.fatPh")} style={numField} />
          </div>
          {nuErr && <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("red"), marginTop: 8 }}>{nuErr}</div>}
          <button onClick={addNutrition} disabled={nuState === "saving"} style={cta(nuState)}>
            {nuState === "saving" ? t("w.home.today.quick.adding") : nuState === "saved" ? t("w.home.today.quick.added") : t("w.home.today.quick.add")}
          </button>
          <button onClick={() => onNavigate?.("nutrition")} style={openLink}>{t("w.home.today.quick.openNutrition")}</button>
        </div>
      </div>

      {/* pager dots — a clear "there's a second widget to swipe" affordance */}
      <div style={{ display: "flex", justifyContent: "center", gap: 7, marginTop: 10 }}>
        {[0, 1].map((i) => (
          <span key={i} style={{ width: activeCard === i ? 20 : 7, height: 7, borderRadius: 999, background: activeCard === i ? C("lime") : C("line"), transition: "width .2s" }} />
        ))}
      </div>
    </div>
  );
}
