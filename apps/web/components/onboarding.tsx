"use client";

import { useMemo, useState } from "react";
import {
  recommendPlan,
  ONBOARDING_GOALS,
  type OnboardingGoal,
  type Experience,
  type Equipment,
} from "@hybrid/core";
import {
  INK2, LINE, LIME, CHALK, ASH, VIOLET, RED,
  disp, cond, mono, Mono, Card,
} from "@/lib/ui";

const EXP: Experience[] = ["beginner", "intermediate", "advanced"];
const EQUIP: Equipment[] = ["full", "home", "minimal"];

export default function Onboarding({ onEnrolled }: { onEnrolled: () => void }) {
  const [goal, setGoal] = useState<OnboardingGoal | null>(null);
  const [experience, setExperience] = useState<Experience>("beginner");
  const [days, setDays] = useState(3);
  const [equipment, setEquipment] = useState<Equipment>("full");
  const [enrolling, setEnrolling] = useState(false);
  const [error, setError] = useState("");

  const plan = useMemo(
    () => (goal ? recommendPlan({ goal, experience, daysPerWeek: days, equipment }) : null),
    [goal, experience, days, equipment],
  );

  const start = async () => {
    if (!plan) return;
    setEnrolling(true);
    setError("");
    try {
      const res = await fetch("/api/macrocycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: plan.goalLabel }),
      });
      if (res.status === 401) { setError("Sign in to save your plan (demo mode doesn't persist)."); setEnrolling(false); return; }
      if (!res.ok) { setError(`Couldn't enroll (HTTP ${res.status}).`); setEnrolling(false); return; }
      onEnrolled();
    } catch {
      setError("Network error — try again.");
      setEnrolling(false);
    }
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ ...disp, fontWeight: 800, fontSize: 22, marginBottom: 4 }}>Let&apos;s build your first plan</div>
      <Mono s={{ fontSize: 13, display: "block", marginBottom: 16 }}>
        Four quick questions — we&apos;ll match you to a plan you&apos;ll actually finish.
      </Mono>

      <Card style={{ marginBottom: 14 }}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>1 · Your main goal</Mono>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
          {ONBOARDING_GOALS.map((g) => (
            <button
              key={g.id}
              onClick={() => setGoal(g.id)}
              style={{ textAlign: "left", cursor: "pointer", borderRadius: 12, padding: 12, border: `1px solid ${goal === g.id ? LIME : LINE}`, background: goal === g.id ? `${LIME}14` : "transparent" }}
            >
              <div style={{ ...disp, fontWeight: 700, fontSize: 15, color: goal === g.id ? LIME : CHALK }}>{g.label}</div>
              <Mono s={{ fontSize: 11 }}>{g.blurb}</Mono>
            </button>
          ))}
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <Card>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>2 · Experience</Mono>
          <Pills options={EXP} value={experience} onPick={(v) => setExperience(v as Experience)} />
        </Card>
        <Card>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>4 · Equipment</Mono>
          <Pills options={EQUIP} value={equipment} onPick={(v) => setEquipment(v as Equipment)} />
        </Card>
      </div>

      <Card style={{ marginBottom: 14 }}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>3 · Days per week</Mono>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 10 }}>
          <button onClick={() => setDays((d) => Math.max(1, d - 1))} style={step}>−</button>
          <span style={{ ...disp, fontWeight: 800, fontSize: 26, color: CHALK, minWidth: 48, textAlign: "center" }}>{days}×</span>
          <button onClick={() => setDays((d) => Math.min(7, d + 1))} style={step}>+</button>
        </div>
      </Card>

      {plan ? (
        <Card style={{ borderLeft: `3px solid ${VIOLET}` }}>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={VIOLET}>Your plan</Mono>
          <div style={{ ...disp, fontWeight: 800, fontSize: 22, marginTop: 6 }}>{plan.planName}</div>
          <Mono s={{ fontSize: 12, display: "block", marginTop: 2 }}>{plan.goalLabel} · {plan.weeklyTarget}×/wk · {plan.weeks} weeks · {plan.focus.join(" · ")}</Mono>
          <Mono s={{ fontSize: 13, lineHeight: 1.6, display: "block", marginTop: 10 }} c={CHALK}>{plan.why}</Mono>
          {error && <Mono s={{ fontSize: 12, display: "block", marginTop: 8 }} c={RED}>{error}</Mono>}
          <button
            onClick={start}
            disabled={enrolling}
            style={{ ...disp, fontWeight: 800, fontSize: 15, background: LIME, color: "#0c0d0c", border: "none", borderRadius: 12, padding: "13px 26px", marginTop: 14, cursor: enrolling ? "default" : "pointer", opacity: enrolling ? 0.6 : 1 }}
          >
            {enrolling ? "Setting up…" : "Start this plan →"}
          </button>
        </Card>
      ) : (
        <Mono s={{ fontSize: 13 }}>Pick a goal to see your recommended plan.</Mono>
      )}
    </div>
  );
}

function Pills({ options, value, onPick }: { options: string[]; value: string; onPick: (v: string) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onPick(o)}
          style={{ ...cond, fontSize: 13, fontWeight: 700, textTransform: "capitalize", padding: "6px 14px", borderRadius: 999, cursor: "pointer", border: `1px solid ${value === o ? LIME : LINE}`, background: value === o ? `${LIME}1a` : "transparent", color: value === o ? LIME : ASH }}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

const step = {
  ...disp, fontWeight: 800, fontSize: 22, width: 46, height: 42, borderRadius: 10,
  border: `1px solid ${LINE}`, background: INK2, color: LIME, cursor: "pointer",
} as const;
