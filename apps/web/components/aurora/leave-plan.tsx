"use client";

import { useState } from "react";
import { fs, space } from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import { useMacrocycle } from "@/lib/use-macrocycle";
import { useRevalidate } from "@/lib/use-invalidate";

const C = (v: string) => `var(--color-${v})`;
const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 20 } as const;

/** The leave-plan flow: a quiet text link that expands into the explicit
 *  keep-vs-delete choice for the workouts logged during the plan, with a
 *  typed-DELETE confirm arming the destructive branch (the account danger-zone
 *  pattern). Deliberately NOT a persistent button — an ever-visible exit reads
 *  as an invitation to quit.
 *
 *  Renders ONLY when the active season matches `forPlanId`:
 *  - a named plan's detail page passes its plan id (bottom of the page);
 *  - Periodize passes null, covering goal-only seasons (no plan page to host
 *    the link — e.g. a coach-programmed or goal-only onboarding enrollment). */
export default function LeavePlanSection({ forPlanId }: { forPlanId: string | null }) {
  const { t } = useLang();
  const { planId: enrolledPlanId, macroId, refresh } = useMacrocycle();
  const revalidate = useRevalidate();
  const [open, setOpen] = useState(false);
  const [wipe, setWipe] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  if (!macroId || enrolledPlanId !== forPlanId) return null;

  const armed = !wipe || confirmText.trim().toUpperCase() === "DELETE";

  const leave = async () => {
    if (!armed || busy) return;
    setBusy(true);
    setError(false);
    try {
      const res = await fetch(`/api/macrocycles/${macroId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteHistory: wipe }),
      });
      if (!res.ok) { setError(true); setBusy(false); return; }
      if (wipe) void revalidate.sessions();
      await refresh();
      setBusy(false);
      setOpen(false);
      setWipe(false);
      setConfirmText("");
    } catch {
      setError(true);
      setBusy(false);
    }
  };

  const option = (selected: boolean, tone: string, title: string, sub: string, pick: () => void) => (
    <div
      role="radio" aria-checked={selected} tabIndex={0} onClick={pick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } }}
      style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 16px", borderRadius: 16, cursor: "pointer", background: selected ? `color-mix(in srgb, ${tone} 10%, transparent)` : C("ink"), border: `1px solid ${selected ? tone : C("line")}` }}
    >
      <span aria-hidden style={{ fontWeight: 800, color: tone, width: 16 }}>{selected ? "✓" : ""}</span>
      <div>
        <div style={{ fontWeight: 700, fontSize: fs.body }}>{title}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 2 }}>{sub}</div>
      </div>
    </div>
  );

  return (
    <div style={{ marginTop: 28 }}>
      {!open && (
        <button onClick={() => setOpen(true)} style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}>
          {t("w.train.plans.leavePlan")}…
        </button>
      )}

      {open && (
        <div style={card}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("red"), marginBottom: 10 }}>{t("w.train.plans.leavePlan")}</div>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, lineHeight: 1.6, color: C("chalk"), margin: 0 }}>{t("w.train.plans.leaveExplain")}</p>
          <div style={{ display: "grid", gap: space.sm, marginTop: 16 }} role="radiogroup" aria-label={t("w.train.plans.leavePlan")}>
            {option(!wipe, C("lime"), t("w.train.plans.leaveKeep"), t("w.train.plans.leaveKeepSub"), () => setWipe(false))}
            {option(wipe, C("red"), t("w.train.plans.leaveWipe"), t("w.train.plans.leaveWipeSub"), () => setWipe(true))}
          </div>
          {wipe && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginBottom: 6 }}>{t("w.train.plans.leaveTypeDelete")}</div>
              <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" autoCapitalize="characters" style={{ fontFamily: "var(--font-mono)", fontSize: fs.note, width: "100%", maxWidth: 240, padding: "10px 12px", borderRadius: 12, background: C("ink"), color: C("chalk"), border: `1px solid ${armed ? C("red") : C("line")}`, outline: "none" }} />
            </div>
          )}
          {error && <div role="alert" style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, marginTop: 10, color: C("red") }}>{t("w.train.plans.leaveError")}</div>}
          <div style={{ display: "flex", gap: space.ms, marginTop: 16, alignItems: "center" }}>
            <button onClick={leave} disabled={!armed || busy} style={{ fontWeight: 800, fontSize: fs.note, color: "#fff", background: armed && !busy ? C("red") : `color-mix(in srgb, ${C("red")} 33%, transparent)`, border: "none", borderRadius: 999, padding: "12px 20px", cursor: armed && !busy ? "pointer" : "not-allowed" }}>
              {busy ? t("w.train.plans.leaving") : wipe ? t("w.train.plans.leaveWipeCta") : t("w.train.plans.leaveCta")}
            </button>
            <button onClick={() => { setOpen(false); setWipe(false); setConfirmText(""); setError(false); }} style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("ash"), background: "none", border: "none", cursor: "pointer" }}>
              {t("w.train.plans.leaveCancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
