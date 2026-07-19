"use client";

import { useState } from "react";
import { fs, space, GOAL_TREE, GOAL_GROUPS, planDetail, srSingleReps, programFor, planProgramView, type GoalNode, type GoalPlan, type PlanProgram } from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import { useMacrocycle } from "@/lib/use-macrocycle";
import { useRevalidate } from "@/lib/use-invalidate";
import { usePlanMaxes, setPlanMax } from "@/lib/plan-maxes";
import ProgramDays from "../program-days";
import { MetaLine } from "./meta";

const C = (v: string) => `var(--color-${v})`;
const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 18 } as const;
const chip = (color: string, label: string) => <span style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color, borderRadius: 999, padding: "3px 12px", fontFamily: "var(--font-mono)", fontSize: fs.micro, marginRight: 6, marginBottom: 4, display: "inline-block" }}>{label}</span>;
const backLink = (onClick: () => void, label: string) => <button onClick={onClick} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 6, fontFamily: "var(--font-mono)", fontSize: fs.caption, textTransform: "uppercase", letterSpacing: ".06em", color: C("ash") }}>← {label}</button>;

/** AURORA Plans (web) — goal grid → plan list → detail + enroll, reusing the
 *  exact GOAL_TREE / planDetail + /api/macrocycles enroll. */
export default function AuroraPlans({ onEnrolled }: { onEnrolled?: () => void }) {
  const { t } = useLang();
  const [goalId, setGoalId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const goal = GOAL_TREE.find((g) => g.id === goalId) ?? null;
  const plan = goal?.plans.find((p) => p.id === planId) ?? null;

  if (plan && goal) {
    const program = programFor(plan.id);
    if (program) return <PercentDetail goal={goal} plan={plan} program={program} back={() => setPlanId(null)} onEnrolled={onEnrolled} />;
    return <Detail goal={goal} plan={plan} back={() => setPlanId(null)} onEnrolled={onEnrolled} />;
  }
  if (goal) return <List goal={goal} pick={setPlanId} back={() => { setGoalId(null); setPlanId(null); }} />;

  return (
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <h1 style={{ fontWeight: 900, fontSize: fs.display, margin: "0 0 8px" }}>{t("w.train.plans.title")}</h1>
      <p style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("ash"), marginBottom: 16 }}>{t("w.train.plans.chooseGoal")}</p>
      <EnrolledCard />
      {GOAL_GROUPS.map((group) => (
        <div key={group.category} style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", marginBottom: 10, color: C("ash") }}>{group.category}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: space.lg }}>
            {group.goals.map((g) => (
              <div key={g.id} role="button" tabIndex={0} style={{ ...card, cursor: "pointer" }} onClick={() => setGoalId(g.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setGoalId(g.id); } }}>
                <div style={{ display: "flex", alignItems: "center", gap: space.ms }}><span style={{ fontSize: 22, color: g.color }}>{g.icon}</span><div style={{ fontWeight: 800, fontSize: fs.title }}>{g.name}</div></div>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, lineHeight: 1.5, marginTop: 8, color: C("ash") }}>{g.blurb}</p>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, marginTop: 10, color: g.color }}>{g.plans.length} {t("w.train.plans.plansCount")}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The season you're currently enrolled in, shown above the goal grid — with
 *  the leave flow: an explicit keep-vs-delete choice for the workouts logged
 *  during the plan, and a typed-DELETE confirm arming the destructive branch
 *  (same pattern as the account danger zone). */
function EnrolledCard() {
  const { t } = useLang();
  const { macro, planId, planStartedAt, macroId, refresh } = useMacrocycle();
  const revalidate = useRevalidate();
  const [open, setOpen] = useState(false);
  const [wipe, setWipe] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  if (!macro || !macroId) return null;

  const planName = GOAL_TREE.flatMap((g) => g.plans).find((p) => p.id === planId)?.name ?? macro.goalOrSport;
  const started = planStartedAt ? new Date(planStartedAt) : null;
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
      style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px", borderRadius: 16, cursor: "pointer", background: selected ? `color-mix(in srgb, ${tone} 10%, transparent)` : C("ink"), border: `1px solid ${selected ? tone : C("line")}` }}
    >
      <span aria-hidden style={{ fontWeight: 800, color: tone, width: 16 }}>{selected ? "✓" : ""}</span>
      <div>
        <div style={{ fontWeight: 700, fontSize: fs.body }}>{title}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 2 }}>{sub}</div>
      </div>
    </div>
  );

  return (
    <div style={{ ...card, marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: space.md, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("lime") }}>{t("w.train.plans.currentPlan")}</div>
          <div style={{ fontWeight: 800, fontSize: fs.title, marginTop: 4 }}>{planName}</div>
          {started && <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 2 }}>{t("w.train.plans.startedOn")} {started.toLocaleDateString()}</div>}
        </div>
        {!open && (
          <button onClick={() => setOpen(true)} style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("red"), background: "none", border: `1px solid ${C("line")}`, borderRadius: 999, padding: "9px 16px", cursor: "pointer" }}>
            {t("w.train.plans.leavePlan")}
          </button>
        )}
      </div>

      {open && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C("line")}` }}>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, lineHeight: 1.6, color: C("chalk"), margin: 0 }}>{t("w.train.plans.leaveExplain")}</p>
          <div style={{ display: "grid", gap: space.sm, marginTop: 14 }} role="radiogroup" aria-label={t("w.train.plans.leavePlan")}>
            {option(!wipe, C("lime"), t("w.train.plans.leaveKeep"), t("w.train.plans.leaveKeepSub"), () => setWipe(false))}
            {option(wipe, C("red"), t("w.train.plans.leaveWipe"), t("w.train.plans.leaveWipeSub"), () => setWipe(true))}
          </div>
          {wipe && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginBottom: 6 }}>{t("w.train.plans.leaveTypeDelete")}</div>
              <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" autoCapitalize="characters" style={{ fontFamily: "var(--font-mono)", fontSize: fs.note, width: "100%", maxWidth: 240, padding: "10px 12px", borderRadius: 12, background: C("ink"), color: C("chalk"), border: `1px solid ${armed ? C("red") : C("line")}`, outline: "none" }} />
            </div>
          )}
          {error && <div role="alert" style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, marginTop: 10, color: C("red") }}>{t("w.train.plans.leaveError")}</div>}
          <div style={{ display: "flex", gap: space.ms, marginTop: 16, alignItems: "center" }}>
            <button onClick={leave} disabled={!armed || busy} style={{ fontWeight: 800, fontSize: fs.note, color: "#fff", background: armed && !busy ? C("red") : `color-mix(in srgb, ${C("red")} 33%, transparent)`, border: "none", borderRadius: 999, padding: "12px 22px", cursor: armed && !busy ? "pointer" : "not-allowed" }}>
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

function List({ goal, pick, back }: { goal: GoalNode; pick: (id: string) => void; back: () => void }) {
  const { t } = useLang();
  return (
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      {backLink(back, t("w.train.plans.allGoals"))}
      <div style={{ display: "flex", alignItems: "center", gap: space.ms, margin: "6px 0 16px" }}><span style={{ fontSize: 24, color: goal.color }}>{goal.icon}</span><h2 style={{ fontWeight: 900, fontSize: fs.display, margin: 0 }}>{goal.name}</h2></div>
      {goal.plans.length === 0 && <p style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("ash") }}>{t("w.train.plans.noPlansYet")}</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: space.lg }}>
        {goal.plans.map((p) => (
          <div key={p.id} role="button" tabIndex={0} style={{ ...card, cursor: "pointer" }} onClick={() => pick(p.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(p.id); } }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div style={{ fontWeight: 800, fontSize: fs.title }}>{p.name}</div>{p.hot && chip(C("lime"), t("w.train.plans.popular"))}</div>
            <MetaLine parts={[`${p.weeks} ${t("w.train.plans.wks")}`, `${p.sessions}${t("w.train.plans.perWk")}`, p.tag]} style={{ display: "flex", fontFamily: "var(--font-mono)", fontSize: fs.caption, margin: "6px 0 10px", color: C("ash") }} />
            <p style={{ fontSize: fs.body, lineHeight: 1.5 }}>{p.desc}</p>
            <div style={{ marginTop: 12 }}>{p.focus.map((f) => <span key={f}>{chip(C("ash"), f)}</span>)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Detail({ goal, plan, back, onEnrolled }: { goal: GoalNode; plan: GoalPlan; back: () => void; onEnrolled?: () => void }) {
  const { t } = useLang();
  const d = planDetail(plan.id, plan);
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const enroll = async () => {
    setState("busy");
    try { const res = await fetch("/api/macrocycles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal: goal.name, planId: plan.id }) }); if (!res.ok) return setState("error"); setState("done"); onEnrolled?.(); }
    catch { setState("error"); }
  };
  return (
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      {backLink(back, goal.name)}
      <div style={{ display: "flex", alignItems: "center", gap: space.ms, margin: "6px 0 4px" }}><h2 style={{ fontWeight: 900, fontSize: 28, margin: 0 }}>{plan.name}</h2>{plan.hot && chip(C("lime"), t("w.train.plans.popular"))}</div>
      <MetaLine parts={[`${plan.weeks} ${t("w.train.plans.weeks")}`, `${plan.sessions}${t("w.train.plans.perWeek")}`, d.level]} style={{ display: "flex", fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("ash"), marginBottom: 16 }} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: space.md, marginBottom: 16 }}>
        <Info label={t("w.train.plans.forWho")} value={d.forWho} /><Info label={t("w.train.plans.outcome")} value={d.outcome} /><Info label={t("w.train.plans.sessionLength")} value={d.sessionLength} /><Info label={t("w.train.plans.equipment")} value={d.equipment} />
      </div>

      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("lime") }}>{t("w.train.plans.weeklySplit")}</div>
        <div style={{ display: "flex", gap: space.xs, marginTop: 10, flexWrap: "wrap" }}>
          {d.split.map((day, i) => <div key={i} style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: day.toLowerCase() === "rest" ? C("ash") : C("chalk"), background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 14, padding: "8px 12px" }}>{day}</div>)}
        </div>
      </div>

      {d.days.map((session, di) => (
        <div key={di} style={{ ...card, marginBottom: 16 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>{session.day}</div>
          <div style={{ overflowX: "auto", maxWidth: "100%", marginTop: 10 }}>
          <table style={{ width: "100%", minWidth: 340, borderCollapse: "collapse" }}>
            <thead><tr>{[t("w.train.plans.exercise"), t("w.train.plans.setsReps"), t("w.train.plans.rest"), "RPE"].map((h) => <th key={h} style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), textTransform: "uppercase", textAlign: "left", padding: "6px 0", borderBottom: `1px solid ${C("line")}` }}>{h}</th>)}</tr></thead>
            <tbody>{session.items?.map((it, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600, fontSize: fs.bodyLg, padding: "10px 0", borderBottom: `1px solid ${C("line")}` }}>{it.name}</td>
                <td style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("chalk"), padding: "10px 0", borderBottom: `1px solid ${C("line")}` }}>{srSingleReps(it.sr)}</td>
                <td style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("ash"), padding: "10px 0", borderBottom: `1px solid ${C("line")}` }}>{it.rest}</td>
                <td style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("ash"), padding: "10px 0", borderBottom: `1px solid ${C("line")}` }}>{it.rpe}</td>
              </tr>
            ))}</tbody>
          </table>
          </div>
        </div>
      ))}

      <Info label={t("w.train.plans.progression")} value={d.progression} />
      <button onClick={enroll} disabled={state === "busy" || state === "done"} style={{ fontWeight: 800, fontSize: fs.note, background: state === "done" ? C("ink2") : C("lime"), color: state === "done" ? C("lime") : C("ink"), border: state === "done" ? `1px solid ${C("lime")}` : "none", borderRadius: 999, padding: "14px 28px", cursor: state === "busy" || state === "done" ? "default" : "pointer", marginTop: 18 }}>
        {state === "busy" ? t("w.train.plans.enrolling") : state === "done" ? t("w.train.plans.enrolledSee") : `${t("w.train.plans.enrollIn")} ${plan.name} →`}
      </button>
      {state === "error" && <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, marginTop: 10, color: C("red") }}>{t("w.train.plans.enrollError")}</div>}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div style={card}><div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>{label}</div><p style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, lineHeight: 1.5, marginTop: 6, color: C("chalk") }}>{value}</p></div>;
}

// Aurora rendering of a discipline-shaped program (OWL % blocks, endurance pace
// plans, …) — same shared planProgramView as the classic web + mobile, in the
// rounded Aurora skin.
function PercentDetail({ goal, plan, program, back, onEnrolled }: { goal: GoalNode; plan: GoalPlan; program: PlanProgram; back: () => void; onEnrolled?: () => void }) {
  const { t } = useLang();
  const [week, setWeek] = useState(1);
  // The athlete's maxes persist on-device (shared with Today) — seed each input
  // from the store; the transient `vals` holds only the text being typed.
  const storedMaxes = usePlanMaxes();
  const [vals, setVals] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const inputValue = (key: string) => vals[key] ?? (storedMaxes[key] != null ? String(storedMaxes[key]) : "");
  const onMaxChange = (key: string, text: string) => {
    setVals((v) => ({ ...v, [key]: text }));
    const n = parseFloat(text);
    setPlanMax(key, Number.isFinite(n) && n > 0 ? n : null);
  };
  const maxes: Record<string, number> = {};
  for (const i of program.inputs) { if (i.kind !== "number") continue; const n = parseFloat(inputValue(i.key)); if (Number.isFinite(n) && n > 0) maxes[i.key] = n; }
  const view = planProgramView(program, { week, maxes });
  const enroll = async () => {
    setState("busy");
    try { const res = await fetch("/api/macrocycles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal: goal.name, planId: plan.id }) }); if (!res.ok) return setState("error"); setState("done"); onEnrolled?.(); }
    catch { setState("error"); }
  };
  return (
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      {backLink(back, goal.name)}
      <h2 style={{ fontWeight: 900, fontSize: 28, margin: "6px 0 4px" }}>{plan.name}</h2>
      <MetaLine parts={[plan.weeks === 1 ? t("w.train.plans.week1") : `${plan.weeks} ${t("w.train.plans.weeks")}`, `${plan.sessions}${t("w.train.plans.perWeek")}`, plan.tag, view.peakNote ? view.peakNote.toLowerCase() : ""]} style={{ display: "flex", fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("ash"), marginBottom: 14 }} />

      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("lime") }}>{view.inputsTitle}</div>
        <div style={{ display: "flex", gap: space.sm, marginTop: 10, flexWrap: "wrap" }}>
          {view.inputs.map((inp) => (
            <label key={inp.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash") }}>{inp.label}</span>
              <input type={inp.kind === "number" ? "number" : "text"} inputMode={inp.kind === "number" ? "numeric" : undefined} placeholder={inp.placeholder ?? ""} value={inputValue(inp.key)} onChange={(e) => (inp.kind === "number" ? onMaxChange(inp.key, e.target.value) : setVals((v) => ({ ...v, [inp.key]: e.target.value })))} style={{ fontFamily: "var(--font-mono)", width: inp.kind === "number" ? 78 : 116, fontSize: fs.body, color: C("chalk"), background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 12, padding: "8px 10px", outline: "none" }} />
            </label>
          ))}
        </div>
      </div>

      {(view.weeks.length > 1 || view.weekVolume) && (
        <div style={{ display: "flex", gap: space.xs, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          {view.weeks.length > 1 && view.weeks.map((w) => (
            <button key={w} onClick={() => setWeek(w)} style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: w === view.week ? C("ink") : C("chalk"), background: w === view.week ? C("lime") : C("ink"), border: `1px solid ${w === view.week ? C("lime") : C("line")}`, borderRadius: 999, padding: "7px 14px", cursor: "pointer" }}>{t("w.train.plans.wkShort")} {w}</button>
          ))}
          {view.weekVolume && <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginLeft: "auto" }}>{view.weekVolume} {t("w.train.plans.thisWeek")}</span>}
        </div>
      )}

      <ProgramDays days={view.days} week={view.week} peakNote={view.peakNote} />

      <Info label={t("w.train.plans.progression")} value={view.progression} />
      <button onClick={enroll} disabled={state === "busy" || state === "done"} style={{ fontWeight: 800, fontSize: fs.note, background: state === "done" ? C("ink2") : C("lime"), color: state === "done" ? C("lime") : C("ink"), border: state === "done" ? `1px solid ${C("lime")}` : "none", borderRadius: 999, padding: "14px 28px", cursor: state === "busy" || state === "done" ? "default" : "pointer", marginTop: 18 }}>
        {state === "busy" ? t("w.train.plans.enrolling") : state === "done" ? t("w.train.plans.enrolledSee") : `${t("w.train.plans.enrollIn")} ${plan.name} →`}
      </button>
      {state === "error" && <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, marginTop: 10, color: C("red") }}>{t("w.train.plans.enrollError")}</div>}
    </div>
  );
}
