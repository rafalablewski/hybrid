"use client";

import { useState } from "react";
import { GOAL_TREE, GOAL_GROUPS, planDetail, srSingleReps, programFor, planProgramView, type GoalNode, type GoalPlan, type PlanProgram } from "@hybrid/core";
import { fs, space, INK2, LINE, LIME, CHALK, ASH, AMBER, ON_ACCENT, disp, mono, Mono, Card, Chip } from "@/lib/ui";
import ProgramDays from "./program-days";

// Plans library — reads the shared GOAL_TREE / PLAN_DETAIL from @hybrid/core,
// the exact same source the mobile app renders. Goal → plans → full detail.
export default function PlansScreen({ onEnrolled }: { onEnrolled?: () => void }) {
  const [goalId, setGoalId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);

  const goal = GOAL_TREE.find((g) => g.id === goalId) ?? null;
  const plan = goal?.plans.find((p) => p.id === planId) ?? null;

  if (plan && goal) {
    const program = programFor(plan.id);
    if (program)
      return <PercentProgramView goal={goal} plan={plan} program={program} back={() => setPlanId(null)} onEnrolled={onEnrolled} />;
    return <PlanDetailView goal={goal} plan={plan} back={() => setPlanId(null)} onEnrolled={onEnrolled} />;
  }
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
      <Mono s={{ fontSize: fs.body, display: "block", marginBottom: 16 }}>
        Start with your goal — we&apos;ll show the plans built for it.
      </Mono>
      {GOAL_GROUPS.map((group) => (
        <div key={group.category} style={{ marginBottom: 24 }}>
          <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", display: "block", marginBottom: 10 }} c={ASH}>
            {group.category}
          </Mono>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: space.lg }}>
            {group.goals.map((g) => (
              <Card
                key={g.id}
                style={{ borderLeft: `3px solid ${g.color}`, cursor: "pointer" }}
                onClick={() => pick(g.id)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: space.ms }}>
                  <span style={{ fontSize: 22, color: g.color }}>{g.icon}</span>
                  <div style={{ ...disp, fontWeight: 800, fontSize: fs.title }}>{g.name}</div>
                </div>
                <Mono s={{ fontSize: fs.caption, lineHeight: 1.5, display: "block", marginTop: 8 }}>{g.blurb}</Mono>
                <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 10 }} c={g.color}>
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
      <div style={{ display: "flex", alignItems: "center", gap: space.ms, margin: "6px 0 16px" }}>
        <span style={{ fontSize: 24, color: goal.color }}>{goal.icon}</span>
        <h2 style={{ ...disp, fontWeight: 900, fontSize: fs.display }}>{goal.name}</h2>
      </div>
      {goal.plans.length === 0 && (
        <Mono s={{ fontSize: fs.body, lineHeight: 1.6, display: "block" }}>
          No plans here yet — plans for this goal are on the way.
        </Mono>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: space.lg }}>
        {goal.plans.map((p) => (
          <Card
            key={p.id}
            style={{ borderLeft: `3px solid ${p.hot ? LIME : LINE}` }}
            onClick={() => pick(p.id)}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ ...disp, fontWeight: 800, fontSize: fs.title }}>{p.name}</div>
              {p.hot && <Chip c={LIME}>Popular</Chip>}
            </div>
            <Mono s={{ fontSize: fs.caption, display: "block", margin: "6px 0 10px" }}>
              {p.weeks} wks · {p.sessions}×/wk · {p.tag}
            </Mono>
            <Mono s={{ fontSize: fs.body, lineHeight: 1.5, display: "block" }} c={CHALK}>
              {p.desc}
            </Mono>
            <div style={{ display: "flex", gap: space.sm, marginTop: 12, flexWrap: "wrap" }}>
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
        body: JSON.stringify({ goal: goal.name, planId: plan.id }),
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
      <div style={{ display: "flex", alignItems: "center", gap: space.ms, margin: "6px 0 4px" }}>
        <h2 style={{ ...disp, fontWeight: 900, fontSize: 28 }}>{plan.name}</h2>
        {plan.hot && <Chip c={LIME}>Popular</Chip>}
      </div>
      <Mono s={{ fontSize: fs.body, display: "block", marginBottom: 16 }}>
        {plan.weeks} weeks · {plan.sessions}×/week · {d.level}
      </Mono>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: space.md, marginBottom: 16 }}>
        <Info label="Who it's for" value={d.forWho} />
        <Info label="Outcome" value={d.outcome} />
        <Info label="Session length" value={d.sessionLength} />
        <Info label="Equipment" value={d.equipment} />
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>
          Weekly split
        </Mono>
        <div style={{ display: "flex", gap: space.xs, marginTop: 10, flexWrap: "wrap" }}>
          {d.split.map((day, i) => (
            <div
              key={i}
              style={{
                ...mono,
                fontSize: fs.caption,
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
          <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={AMBER}>
            {session.day}
          </Mono>
          <div style={{ overflowX: "auto", maxWidth: "100%" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, minWidth: 420 }}>
            <thead>
              <tr>
                {["Exercise", "Sets×Reps", "Rest", "RPE"].map((h) => (
                  <th
                    key={h}
                    style={{ ...mono, fontSize: fs.micro, color: ASH, textTransform: "uppercase", textAlign: "left", padding: "6px 0", borderBottom: `1px solid ${LINE}` }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {session.items?.map((it, i) => (
                <tr key={i}>
                  <td style={{ ...disp, fontWeight: 600, fontSize: fs.bodyLg, padding: "10px 0", borderBottom: `1px solid ${LINE}` }}>{it.name}</td>
                  <td style={{ ...mono, fontSize: fs.body, color: CHALK, padding: "10px 0", borderBottom: `1px solid ${LINE}` }}>{srSingleReps(it.sr)}</td>
                  <td style={{ ...mono, fontSize: fs.body, color: ASH, padding: "10px 0", borderBottom: `1px solid ${LINE}` }}>{it.rest}</td>
                  <td style={{ ...mono, fontSize: fs.body, color: ASH, padding: "10px 0", borderBottom: `1px solid ${LINE}` }}>{it.rpe}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Card>
      ))}

      <Info label="Progression" value={d.progression} />

      <button
        onClick={enroll}
        disabled={state === "busy" || state === "done"}
        style={{
          ...disp,
          fontWeight: 800,
          fontSize: fs.note,
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
        <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 10 }} c={AMBER}>
          Couldn&apos;t enroll — sign in (real auth) and try again.
        </Mono>
      )}
    </div>
  );
}

// Discipline-shaped program view — renders ANY PlanProgram (Olympic-weightlifting
// % blocks, endurance pace plans, …) through the SAME shared planProgramView, so
// every plan comes out in one consistent HYBRID layout: a week selector, the
// discipline's volume label, AM/PM or weekday cards, the prescription KEPT as
// written, and a "fill in your numbers" panel (strength maxes → kg, or goal paces).
function PercentProgramView({
  goal,
  plan,
  program,
  back,
  onEnrolled,
}: {
  goal: GoalNode;
  plan: GoalPlan;
  program: PlanProgram;
  back: () => void;
  onEnrolled?: () => void;
}) {
  const [week, setWeek] = useState(1);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const maxes: Record<string, number> = {};
  for (const i of program.inputs) {
    if (i.kind !== "number") continue;
    const n = parseFloat(vals[i.key] ?? "");
    if (Number.isFinite(n) && n > 0) maxes[i.key] = n;
  }
  const view = planProgramView(program, { week, maxes });

  const enroll = async () => {
    setState("busy");
    try {
      const res = await fetch("/api/macrocycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: goal.name, planId: plan.id }),
      });
      if (!res.ok) return setState("error");
      setState("done");
      onEnrolled?.();
    } catch {
      setState("error");
    }
  };

  return (
    <div style={{ maxWidth: 860 }}>
      <BackLink onClick={back} label={goal.name} />
      <h2 style={{ ...disp, fontWeight: 900, fontSize: 28, margin: "6px 0 4px" }}>{plan.name}</h2>
      <Mono s={{ fontSize: fs.body, display: "block", marginBottom: 14 }}>
        {plan.weeks} week{plan.weeks === 1 ? "" : "s"} · {plan.sessions}×/week · {plan.tag}
        {view.peakNote ? ` · ${view.peakNote.toLowerCase()}` : ""}
      </Mono>

      {/* Inputs — strength maxes (→ kg) or goal paces. Optional; the plan reads the same either way. */}
      <Card style={{ marginBottom: 16 }}>
        <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>
          {view.inputsTitle}
        </Mono>
        <div style={{ display: "flex", gap: space.sm, marginTop: 10, flexWrap: "wrap" }}>
          {view.inputs.map((inp) => (
            <label key={inp.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <Mono s={{ fontSize: fs.nano }} c={ASH}>{inp.label}</Mono>
              <input
                type={inp.kind === "number" ? "number" : "text"}
                inputMode={inp.kind === "number" ? "numeric" : undefined}
                placeholder={inp.placeholder ?? ""}
                value={vals[inp.key] ?? ""}
                onChange={(e) => setVals((v) => ({ ...v, [inp.key]: e.target.value }))}
                style={{ ...mono, width: inp.kind === "number" ? 78 : 116, fontSize: fs.body, color: CHALK, background: INK2, border: `1px solid ${LINE}`, borderRadius: 8, padding: "7px 9px", outline: "none" }}
              />
            </label>
          ))}
        </div>
      </Card>

      {/* Week selector (hidden for a single-week plan) + week volume. */}
      {(view.weeks.length > 1 || view.weekVolume) && (
        <div style={{ display: "flex", gap: space.xs, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          {view.weeks.length > 1 &&
            view.weeks.map((w) => (
              <button
                key={w}
                onClick={() => setWeek(w)}
                style={{ ...mono, fontSize: fs.caption, color: w === view.week ? ON_ACCENT : CHALK, background: w === view.week ? LIME : INK2, border: `1px solid ${w === view.week ? LIME : LINE}`, borderRadius: 8, padding: "7px 12px", cursor: "pointer" }}
              >
                Wk {w}
              </button>
            ))}
          {view.weekVolume && (
            <Mono s={{ fontSize: fs.caption, marginLeft: "auto" }} c={ASH}>
              {view.weekVolume} this week
            </Mono>
          )}
        </div>
      )}

      <ProgramDays days={view.days} week={view.week} peakNote={view.peakNote} />

      <Info label="How it progresses" value={view.progression} />

      <button
        onClick={enroll}
        disabled={state === "busy" || state === "done"}
        style={{ ...disp, fontWeight: 800, fontSize: fs.note, background: state === "done" ? INK2 : LIME, color: state === "done" ? LIME : ON_ACCENT, border: state === "done" ? `1px solid ${LIME}` : "none", borderRadius: 12, padding: "14px 28px", cursor: state === "busy" || state === "done" ? "default" : "pointer", marginTop: 18 }}
      >
        {state === "busy" ? "Enrolling…" : state === "done" ? "✓ Enrolled — see Periodize" : `Enroll in ${plan.name} →`}
      </button>
      {state === "error" && (
        <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 10 }} c={AMBER}>
          Couldn&apos;t enroll — sign in (real auth) and try again.
        </Mono>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }}>{label}</Mono>
      <Mono s={{ fontSize: fs.body, lineHeight: 1.5, display: "block", marginTop: 6 }} c={CHALK}>
        {value}
      </Mono>
    </Card>
  );
}

function BackLink({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 6 }}>
      <Mono s={{ fontSize: fs.caption, textTransform: "uppercase", letterSpacing: ".06em" }} c={ASH}>
        ← {label}
      </Mono>
    </button>
  );
}
