"use client";

import { useMemo, useState } from "react";
import { fs, space,
  recommendPlan,
  ONBOARDING_GOAL_GROUPS,
  type OnboardingGoal,
  type Experience,
  type Equipment,
} from "@hybrid/core";
import { useClientPersonaChoice, setClientPersona } from "@/lib/persona";
import { AuroraIcon } from "./icons";

const EXP: { id: Experience; label: string }[] = [
  { id: "beginner", label: "Beginner" },
  { id: "intermediate", label: "Intermediate" },
  { id: "advanced", label: "Advanced" },
];
const EQUIP: { id: Equipment; label: string }[] = [
  { id: "full", label: "Full gym" },
  { id: "home", label: "Home" },
  { id: "minimal", label: "Minimal" },
];
const DAYS = [2, 3, 4, 5, 6];
const STEPS = ["persona", "goal", "experience", "days", "equipment", "plan"] as const;
type Step = (typeof STEPS)[number];

/** AURORA onboarding (web) — the stepped wizard parity of the mobile flow,
 *  reusing recommendPlan + the same /api/macrocycles enroll. */
export default function AuroraOnboarding({ onEnrolled }: { onEnrolled: () => void }) {
  const persona = useClientPersonaChoice();
  const [idx, setIdx] = useState(0);
  const [goal, setGoal] = useState<OnboardingGoal | null>(null);
  const [experience, setExperience] = useState<Experience>("beginner");
  const [days, setDays] = useState(3);
  const [equipment, setEquipment] = useState<Equipment>("full");
  const [enrolling, setEnrolling] = useState(false);
  const [error, setError] = useState("");
  const C = (v: string) => `var(--color-${v})`;

  const step: Step = STEPS[idx]!;
  const plan = useMemo(() => (goal ? recommendPlan({ goal, experience, daysPerWeek: days, equipment }) : null), [goal, experience, days, equipment]);

  const persistIntake = () => {
    try {
      localStorage.setItem("hybrid.daysPerWeek", String(days));
      localStorage.setItem("hybrid.experience", experience);
      localStorage.setItem("hybrid.equipment", equipment);
    } catch { /* ignore */ }
  };

  const finish = async () => {
    setEnrolling(true);
    setError("");
    try {
      if (plan) {
        const res = await fetch("/api/macrocycles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal: plan.goalLabel, planId: plan.planId }) });
        if (res.status === 401) { setError("Sign in to save your plan (demo mode doesn't persist)."); setEnrolling(false); return; }
        if (!res.ok) { setError(`Couldn't enroll (HTTP ${res.status}).`); setEnrolling(false); return; }
      }
      persistIntake();
      onEnrolled();
    } catch {
      setError("Network error — try again.");
      setEnrolling(false);
    }
  };

  const next = () => (idx < STEPS.length - 1 ? setIdx((i) => i + 1) : finish());
  const back = () => idx > 0 && setIdx((i) => i - 1);
  const canNext = step === "persona" ? !!persona : step === "goal" ? !!goal : true;

  const pill = (active: boolean) => ({ borderRadius: 999, padding: "10px 18px", fontWeight: 700, fontSize: fs.body, cursor: "pointer", border: `1px solid ${active ? C("lime") : C("line")}`, background: active ? C("lime") : "transparent", color: active ? C("ink") : C("ash") });
  const choice = (active: boolean): React.CSSProperties => ({ display: "flex", alignItems: "center", gap: space.ms, border: `1px solid ${active ? C("lime") : C("line")}`, background: active ? "rgba(196,240,53,.08)" : C("ink2"), borderRadius: 16, padding: 15, cursor: "pointer", textAlign: "left", width: "100%", color: C("chalk") });

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", fontFamily: "var(--font-display)" }}>
      <div style={{ display: "flex", gap: 7 }}>
        {STEPS.map((s, i) => <span key={s} style={{ flex: 1, height: 5, borderRadius: 3, background: i <= idx ? C("lime") : C("line") }} />)}
      </div>

      <div style={{ marginTop: 22 }}>
        {step === "persona" && (
          <Step title="How do you want to use HYBRID?" sub="You can switch anytime in Settings.">
            {[{ id: "casual" as const, t: "Just track my training", s: "Log fast, review at home, share your wins." }, { id: "athlete" as const, t: "Train for a goal", s: "Plans, sport S&C, velocity & performance." }].map((o) => (
              <button key={o.id} onClick={() => setClientPersona(o.id)} style={choice(persona === o.id)}>
                {persona === o.id && <AuroraIcon name="check" size={22} color={C("lime")} />}
                <span><b style={{ fontSize: fs.note, color: persona === o.id ? C("lime") : C("chalk") }}>{o.t}</b><br /><span style={{ fontSize: fs.caption, color: C("ash") }}>{o.s}</span></span>
              </button>
            ))}
          </Step>
        )}
        {step === "goal" && (
          <Step title="What is your main goal?" sub="We'll shape your first plan around it.">
            {ONBOARDING_GOAL_GROUPS.map((g) => (
              <div key={g.category}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".1em", textTransform: "uppercase", color: C("ash"), margin: "12px 0 6px" }}>{g.category}</div>
                {g.goals.map((gl) => (
                  <button key={gl.id} onClick={() => setGoal(gl.id)} style={{ ...choice(goal === gl.id), marginBottom: 8 }}>
                    {goal === gl.id && <AuroraIcon name="check" size={20} color={C("lime")} />}
                    <span><b style={{ fontSize: fs.bodyLg, color: goal === gl.id ? C("lime") : C("chalk") }}>{gl.label}</b><br /><span style={{ fontSize: fs.caption, color: C("ash") }}>{gl.blurb}</span></span>
                  </button>
                ))}
              </div>
            ))}
          </Step>
        )}
        {step === "experience" && <Step title="What's your experience?" sub="So we set the right starting load."><Seg options={EXP} value={experience} onPick={setExperience} /></Step>}
        {step === "days" && <Step title="How many days a week?" sub="A plan you'll finish beats an ideal one."><Seg options={DAYS.map((d) => ({ id: String(d), label: `${d}×` }))} value={String(days)} onPick={(v) => setDays(Number(v))} /></Step>}
        {step === "equipment" && <Step title="What equipment do you have?" sub="We'll only prescribe what you can do."><Seg options={EQUIP} value={equipment} onPick={setEquipment} /></Step>}
        {step === "plan" && (
          <Step title="Your plan" sub={plan ? "" : "Pick a goal to see a recommendation."}>
            {plan ? (
              <div style={{ background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 20 }}>
                <div style={{ fontWeight: 900, fontSize: 22 }}>{plan.planName}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 4 }}>{plan.goalLabel} · {plan.weeklyTarget}×/wk · {plan.weeks} wks</div>
                <div style={{ fontSize: fs.bodyLg, color: C("chalk"), marginTop: 12, lineHeight: 1.5 }}>{plan.why}</div>
              </div>
            ) : <div style={{ color: C("ash"), fontSize: fs.bodyLg }}>Plans for this goal are coming soon — jump in now and enroll once they land.</div>}
          </Step>
        )}
        {error && <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("red"), marginTop: 12 }}>{error}</div>}
      </div>

      <div style={{ display: "flex", gap: space.md, alignItems: "center", marginTop: 24 }}>
        <button onClick={back} disabled={idx === 0} style={{ width: 60, height: 52, borderRadius: 999, border: `1px solid ${C("line")}`, background: "transparent", color: C("chalk"), cursor: idx === 0 ? "default" : "pointer", opacity: idx === 0 ? 0.4 : 1, display: "grid", placeItems: "center" }}>
          <AuroraIcon name="back" size={20} />
        </button>
        <button onClick={next} disabled={!canNext || enrolling} style={{ flex: 1, borderRadius: 999, padding: 16, border: "none", background: C("lime"), color: C("ink"), fontWeight: 700, fontSize: fs.subtitle, cursor: canNext ? "pointer" : "default", opacity: !canNext || enrolling ? 0.5 : 1 }}>
          {step === "plan" ? (enrolling ? "Setting up…" : plan ? "Start this plan" : "Continue") : "Next"}
        </button>
      </div>
    </div>
  );
}

function Step({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  const C = (v: string) => `var(--color-${v})`;
  return (
    <div>
      <h1 style={{ fontWeight: 900, fontSize: fs.display, margin: 0, letterSpacing: "-.01em" }}>{title}</h1>
      {sub ? <p style={{ color: C("ash"), fontSize: fs.bodyLg, marginTop: 8 }}>{sub}</p> : null}
      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: space.ms }}>{children}</div>
    </div>
  );
}

function Seg<T extends string>({ options, value, onPick }: { options: { id: T; label: string }[]; value: T; onPick: (v: T) => void }) {
  const C = (v: string) => `var(--color-${v})`;
  return (
    <div style={{ display: "flex", gap: space.xxs, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 999, padding: 4 }}>
      {options.map((o) => {
        const on = value === o.id;
        return <button key={o.id} onClick={() => onPick(o.id)} style={{ flex: 1, padding: "11px 0", borderRadius: 999, border: "none", cursor: "pointer", fontWeight: 700, fontSize: fs.body, background: on ? C("lime") : "transparent", color: on ? C("ink") : C("ash") }}>{o.label}</button>;
      })}
    </div>
  );
}
