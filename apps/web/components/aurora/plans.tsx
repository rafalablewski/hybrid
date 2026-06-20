"use client";

import { useState } from "react";
import { fs, space, GOAL_TREE, GOAL_GROUPS, planDetail, type GoalNode, type GoalPlan } from "@hybrid/core";

const C = (v: string) => `var(--color-${v})`;
const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 18 } as const;
const chip = (color: string, label: string) => <span style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color, borderRadius: 999, padding: "3px 12px", fontFamily: "var(--font-mono)", fontSize: fs.micro, marginRight: 6, marginBottom: 4, display: "inline-block" }}>{label}</span>;
const backLink = (onClick: () => void, label: string) => <button onClick={onClick} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 6, fontFamily: "var(--font-mono)", fontSize: fs.caption, textTransform: "uppercase", letterSpacing: ".06em", color: C("ash") }}>← {label}</button>;

/** AURORA Plans (web) — goal grid → plan list → detail + enroll, reusing the
 *  exact GOAL_TREE / planDetail + /api/macrocycles enroll. */
export default function AuroraPlans({ onEnrolled }: { onEnrolled?: () => void }) {
  const [goalId, setGoalId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const goal = GOAL_TREE.find((g) => g.id === goalId) ?? null;
  const plan = goal?.plans.find((p) => p.id === planId) ?? null;

  if (plan && goal) return <Detail goal={goal} plan={plan} back={() => setPlanId(null)} onEnrolled={onEnrolled} />;
  if (goal) return <List goal={goal} pick={setPlanId} back={() => { setGoalId(null); setPlanId(null); }} />;

  return (
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <h1 style={{ fontWeight: 900, fontSize: fs.display, margin: "0 0 8px" }}>Plans</h1>
      <p style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("ash"), marginBottom: 16 }}>Start with your goal — we&apos;ll show the plans built for it.</p>
      {GOAL_GROUPS.map((group) => (
        <div key={group.category} style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", marginBottom: 10, color: C("ash") }}>{group.category}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: space.lg }}>
            {group.goals.map((g) => (
              <div key={g.id} style={{ ...card, cursor: "pointer" }} onClick={() => setGoalId(g.id)}>
                <div style={{ display: "flex", alignItems: "center", gap: space.ms }}><span style={{ fontSize: 22, color: g.color }}>{g.icon}</span><div style={{ fontWeight: 800, fontSize: fs.title }}>{g.name}</div></div>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, lineHeight: 1.5, marginTop: 8, color: C("ash") }}>{g.blurb}</p>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, marginTop: 10, color: g.color }}>{g.plans.length} plans →</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function List({ goal, pick, back }: { goal: GoalNode; pick: (id: string) => void; back: () => void }) {
  return (
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      {backLink(back, "All goals")}
      <div style={{ display: "flex", alignItems: "center", gap: space.ms, margin: "6px 0 16px" }}><span style={{ fontSize: 24, color: goal.color }}>{goal.icon}</span><h2 style={{ fontWeight: 900, fontSize: fs.display, margin: 0 }}>{goal.name}</h2></div>
      {goal.plans.length === 0 && <p style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("ash") }}>No plans here yet — plans for this goal are on the way.</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: space.lg }}>
        {goal.plans.map((p) => (
          <div key={p.id} style={{ ...card, cursor: "pointer" }} onClick={() => pick(p.id)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div style={{ fontWeight: 800, fontSize: fs.title }}>{p.name}</div>{p.hot && chip(C("lime"), "Popular")}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, margin: "6px 0 10px", color: C("ash") }}>{p.weeks} wks · {p.sessions}×/wk · {p.tag}</div>
            <p style={{ fontSize: fs.body, lineHeight: 1.5 }}>{p.desc}</p>
            <div style={{ marginTop: 12 }}>{p.focus.map((f) => <span key={f}>{chip(C("ash"), f)}</span>)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Detail({ goal, plan, back, onEnrolled }: { goal: GoalNode; plan: GoalPlan; back: () => void; onEnrolled?: () => void }) {
  const d = planDetail(plan.id, plan);
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const enroll = async () => {
    setState("busy");
    try { const res = await fetch("/api/macrocycles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal: goal.name }) }); if (!res.ok) return setState("error"); setState("done"); onEnrolled?.(); }
    catch { setState("error"); }
  };
  return (
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      {backLink(back, goal.name)}
      <div style={{ display: "flex", alignItems: "center", gap: space.ms, margin: "6px 0 4px" }}><h2 style={{ fontWeight: 900, fontSize: 28, margin: 0 }}>{plan.name}</h2>{plan.hot && chip(C("lime"), "Popular")}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("ash"), marginBottom: 16 }}>{plan.weeks} weeks · {plan.sessions}×/week · {d.level}</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: space.md, marginBottom: 16 }}>
        <Info label="Who it's for" value={d.forWho} /><Info label="Outcome" value={d.outcome} /><Info label="Session length" value={d.sessionLength} /><Info label="Equipment" value={d.equipment} />
      </div>

      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("lime") }}>Weekly split</div>
        <div style={{ display: "flex", gap: space.xs, marginTop: 10, flexWrap: "wrap" }}>
          {d.split.map((day, i) => <div key={i} style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: day.toLowerCase() === "rest" ? C("ash") : C("chalk"), background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 14, padding: "8px 12px" }}>{day}</div>)}
        </div>
      </div>

      {d.days.map((session, di) => (
        <div key={di} style={{ ...card, marginBottom: 16 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("amber") }}>{session.day}</div>
          <div style={{ overflowX: "auto", maxWidth: "100%", marginTop: 10 }}>
          <table style={{ width: "100%", minWidth: 340, borderCollapse: "collapse" }}>
            <thead><tr>{["Exercise", "Sets×Reps", "Rest", "RPE"].map((h) => <th key={h} style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), textTransform: "uppercase", textAlign: "left", padding: "6px 0", borderBottom: `1px solid ${C("line")}` }}>{h}</th>)}</tr></thead>
            <tbody>{session.items?.map((it, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600, fontSize: fs.bodyLg, padding: "10px 0", borderBottom: `1px solid ${C("line")}` }}>{it.name}</td>
                <td style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("chalk"), padding: "10px 0", borderBottom: `1px solid ${C("line")}` }}>{it.sr}</td>
                <td style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("ash"), padding: "10px 0", borderBottom: `1px solid ${C("line")}` }}>{it.rest}</td>
                <td style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("ash"), padding: "10px 0", borderBottom: `1px solid ${C("line")}` }}>{it.rpe}</td>
              </tr>
            ))}</tbody>
          </table>
          </div>
        </div>
      ))}

      <Info label="Progression" value={d.progression} />
      <button onClick={enroll} disabled={state === "busy" || state === "done"} style={{ fontWeight: 800, fontSize: fs.note, background: state === "done" ? C("ink2") : C("lime"), color: state === "done" ? C("lime") : C("ink"), border: state === "done" ? `1px solid ${C("lime")}` : "none", borderRadius: 999, padding: "14px 28px", cursor: state === "busy" || state === "done" ? "default" : "pointer", marginTop: 18 }}>
        {state === "busy" ? "Enrolling…" : state === "done" ? "✓ Enrolled — see Periodize" : `Enroll in ${plan.name} →`}
      </button>
      {state === "error" && <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, marginTop: 10, color: C("amber") }}>Couldn&apos;t enroll — sign in (real auth) and try again.</div>}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div style={card}><div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>{label}</div><p style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, lineHeight: 1.5, marginTop: 6, color: C("chalk") }}>{value}</p></div>;
}
