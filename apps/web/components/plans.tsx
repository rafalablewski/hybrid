"use client";

import { useState } from "react";
import { GOAL_TREE, GOAL_GROUPS, planDetail, type GoalNode, type GoalPlan } from "@hybrid/core";
import { INK2, LINE, LIME, CHALK, ASH, AMBER, ON_ACCENT, disp, mono, Mono, Card, Chip } from "@/lib/ui";

// Plans library — reads the shared GOAL_TREE / PLAN_DETAIL from @hybrid/core,
// the exact same source the mobile app renders. Goal → plans → full detail.
export default function PlansScreen({ onEnrolled }: { onEnrolled?: () => void }) {
  const [goalId, setGoalId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);

  const goal = GOAL_TREE.find((g) => g.id === goalId) ?? null;
  const plan = goal?.plans.find((p) => p.id === planId) ?? null;

  if (plan && goal)
    return <PlanDetailView goal={goal} plan={plan} back={() => setPlanId(null)} onEnrolled={onEnrolled} />;
  if (goal)
    return (
      <PlanList
        goal={goal}
        pick={setPlanId}
        back={() => {
          setGoalId(null);
          setPlanId(null);
        }}
      />
    );
  return <GoalGrid pick={setGoalId} />;
}

function GoalGrid({ pick }: { pick: (id: string) => void }) {
  return (
    <div>
      <Mono s={{ fontSize: 13, display: "block", marginBottom: 16 }}>
        Start with your goal — we&apos;ll show the plans built for it.
      </Mono>
      {GOAL_GROUPS.map((group) => (
        <div key={group.category} style={{ marginBottom: 24 }}>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em", display: "block", marginBottom: 10 }} c={ASH}>
            {group.category}
          </Mono>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {group.goals.map((g) => (
              <Card
                key={g.id}
                style={{ borderLeft: `3px solid ${g.color}`, cursor: "pointer" }}
                onClick={() => pick(g.id)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 22, color: g.color }}>{g.icon}</span>
                  <div style={{ ...disp, fontWeight: 800, fontSize: 18 }}>{g.name}</div>
                </div>
                <Mono s={{ fontSize: 12, lineHeight: 1.5, display: "block", marginTop: 8 }}>{g.blurb}</Mono>
                <Mono s={{ fontSize: 11, display: "block", marginTop: 10 }} c={g.color}>
                  {g.plans.length} plans →
                </Mono>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PlanList({
  goal,
  pick,
  back,
}: {
  goal: GoalNode;
  pick: (id: string) => void;
  back: () => void;
}) {
  return (
    <div>
      <BackLink onClick={back} label="All goals" />
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "6px 0 16px" }}>
        <span style={{ fontSize: 24, color: goal.color }}>{goal.icon}</span>
        <h2 style={{ ...disp, fontWeight: 900, fontSize: 26 }}>{goal.name}</h2>
      </div>
      {goal.plans.length === 0 && (
        <Mono s={{ fontSize: 13, lineHeight: 1.6, display: "block" }}>
          No plans here yet — plans for this goal are on the way.
        </Mono>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
        {goal.plans.map((p) => (
          <Card
            key={p.id}
            style={{ borderLeft: `3px solid ${p.hot ? LIME : LINE}` }}
            onClick={() => pick(p.id)}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ ...disp, fontWeight: 800, fontSize: 18 }}>{p.name}</div>
              {p.hot && <Chip c={LIME}>Popular</Chip>}
            </div>
            <Mono s={{ fontSize: 12, display: "block", margin: "6px 0 10px" }}>
              {p.weeks} wks · {p.sessions}×/wk · {p.tag}
            </Mono>
            <Mono s={{ fontSize: 13, lineHeight: 1.5, display: "block" }} c={CHALK}>
              {p.desc}
            </Mono>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              {p.focus.map((f) => (
                <Chip key={f} c={ASH}>
                  {f}
                </Chip>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function PlanDetailView({
  goal,
  plan,
  back,
  onEnrolled,
}: {
  goal: GoalNode;
  plan: GoalPlan;
  back: () => void;
  onEnrolled?: () => void;
}) {
  const d = planDetail(plan.id, plan);
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  const enroll = async () => {
    setState("busy");
    try {
      const res = await fetch("/api/macrocycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: goal.name }),
      });
      if (!res.ok) return setState("error");
      setState("done");
      onEnrolled?.();
    } catch {
      setState("error");
    }
  };

  return (
    <div style={{ maxWidth: 820 }}>
      <BackLink onClick={back} label={goal.name} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "6px 0 4px" }}>
        <h2 style={{ ...disp, fontWeight: 900, fontSize: 28 }}>{plan.name}</h2>
        {plan.hot && <Chip c={LIME}>Popular</Chip>}
      </div>
      <Mono s={{ fontSize: 13, display: "block", marginBottom: 16 }}>
        {plan.weeks} weeks · {plan.sessions}×/week · {d.level}
      </Mono>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 16 }}>
        <Info label="Who it's for" value={d.forWho} />
        <Info label="Outcome" value={d.outcome} />
        <Info label="Session length" value={d.sessionLength} />
        <Info label="Equipment" value={d.equipment} />
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>
          Weekly split
        </Mono>
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {d.split.map((day, i) => (
            <div
              key={i}
              style={{
                ...mono,
                fontSize: 12,
                color: day.toLowerCase() === "rest" ? ASH : CHALK,
                background: INK2,
                border: `1px solid ${LINE}`,
                borderRadius: 8,
                padding: "8px 10px",
              }}
            >
              {day}
            </div>
          ))}
        </div>
      </Card>

      {d.days.map((session, di) => (
        <Card key={di} style={{ marginBottom: 16 }}>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={AMBER}>
            {session.day}
          </Mono>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
            <thead>
              <tr>
                {["Exercise", "Sets×Reps", "Rest", "RPE"].map((h) => (
                  <th
                    key={h}
                    style={{ ...mono, fontSize: 11, color: ASH, textTransform: "uppercase", textAlign: "left", padding: "6px 0", borderBottom: `1px solid ${LINE}` }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {session.items?.map((it, i) => (
                <tr key={i}>
                  <td style={{ ...disp, fontWeight: 600, fontSize: 14, padding: "10px 0", borderBottom: `1px solid ${LINE}` }}>{it.name}</td>
                  <td style={{ ...mono, fontSize: 13, color: CHALK, padding: "10px 0", borderBottom: `1px solid ${LINE}` }}>{it.sr}</td>
                  <td style={{ ...mono, fontSize: 13, color: ASH, padding: "10px 0", borderBottom: `1px solid ${LINE}` }}>{it.rest}</td>
                  <td style={{ ...mono, fontSize: 13, color: ASH, padding: "10px 0", borderBottom: `1px solid ${LINE}` }}>{it.rpe}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}

      <Info label="Progression" value={d.progression} />

      <button
        onClick={enroll}
        disabled={state === "busy" || state === "done"}
        style={{
          ...disp,
          fontWeight: 800,
          fontSize: 15,
          background: state === "done" ? INK2 : LIME,
          color: state === "done" ? LIME : ON_ACCENT,
          border: state === "done" ? `1px solid ${LIME}` : "none",
          borderRadius: 12,
          padding: "14px 28px",
          cursor: state === "busy" || state === "done" ? "default" : "pointer",
          marginTop: 18,
        }}
      >
        {state === "busy"
          ? "Enrolling…"
          : state === "done"
            ? "✓ Enrolled — see Periodize"
            : `Enroll in ${plan.name} →`}
      </button>
      {state === "error" && (
        <Mono s={{ fontSize: 12, display: "block", marginTop: 10 }} c={AMBER}>
          Couldn&apos;t enroll — sign in (real auth) and try again.
        </Mono>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }}>{label}</Mono>
      <Mono s={{ fontSize: 13, lineHeight: 1.5, display: "block", marginTop: 6 }} c={CHALK}>
        {value}
      </Mono>
    </Card>
  );
}

function BackLink({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 6 }}>
      <Mono s={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".06em" }} c={ASH}>
        ← {label}
      </Mono>
    </button>
  );
}
