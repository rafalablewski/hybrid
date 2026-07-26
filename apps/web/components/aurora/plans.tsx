"use client";

import { useState } from "react";
import { fs, space, GOAL_TREE, GOAL_CATEGORIES, filterGoalGroups, planDetail, srSingleReps, programFor, planProgramView, planHeroView, type GoalCategory, type GoalNode, type GoalPlan, type PlanProgram } from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import { useMacrocycle } from "@/lib/use-macrocycle";
import { usePlanMaxes, setPlanMax } from "@/lib/plan-maxes";
import LeavePlanSection from "./leave-plan";
import ProgramDays from "../program-days";
import { AuroraIcon } from "./icons";
import { MetaLine } from "./meta";

const C = (v: string) => `var(--color-${v})`;
const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "var(--shadow-card)", padding: 18 } as const;
const chip = (color: string, label: string) => <span style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color, borderRadius: 999, padding: "3px 12px", fontFamily: "var(--font-mono)", fontSize: fs.micro, marginRight: 6, marginBottom: 4, display: "inline-block" }}>{label}</span>;
const backLink = (onClick: () => void, label: string) => <button onClick={onClick} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 6, fontFamily: "var(--font-mono)", fontSize: fs.caption, textTransform: "uppercase", letterSpacing: ".06em", color: C("ash") }}>← {label}</button>;

/** AURORA Plans (web) — goal grid → plan list → detail + enroll, reusing the
 *  exact GOAL_TREE / planDetail + /api/macrocycles enroll. */
export default function AuroraPlans({ onEnrolled }: { onEnrolled?: () => void }) {
  const { t } = useLang();
  const [goalId, setGoalId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  // Browse filter — narrows the goal grid by discipline and/or free-text so the
  // library stays findable as it grows past a scroll-it-all list.
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<GoalCategory | "all">("all");
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
      <FilterBar query={query} setQuery={setQuery} cat={cat} setCat={setCat} />
      {(() => {
        const groups = filterGoalGroups(query, cat);
        if (groups.length === 0) return <p style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("ash"), padding: "8px 2px" }}>{t("w.train.plans.noMatches")}</p>;
        return groups.map((group) => (
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
        ));
      })()}
    </div>
  );
}

// Browse filter for the goal grid — a search field over a full-bleed row of
// discipline chips (All + each category). Both levers feed the shared
// filterGoalGroups() so web + mobile narrow the library identically.
function FilterBar({ query, setQuery, cat, setCat }: { query: string; setQuery: (v: string) => void; cat: GoalCategory | "all"; setCat: (c: GoalCategory | "all") => void }) {
  const { t } = useLang();
  const cats: (GoalCategory | "all")[] = ["all", ...GOAL_CATEGORIES];
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ position: "relative", marginBottom: 12 }}>
        <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", display: "flex", pointerEvents: "none" }}><AuroraIcon name="search" size={16} color={C("ash")} /></span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("w.train.plans.searchGoals")}
          aria-label={t("w.train.plans.searchGoals")}
          style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px 12px 40px", background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 16, color: C("chalk"), fontFamily: "var(--font-mono)", fontSize: fs.body, outline: "none" }}
        />
      </div>
      <div style={{ display: "flex", gap: 8, overflowX: "auto", scrollbarWidth: "none", marginLeft: "calc(-1 * var(--page-pad-x, 16px))", marginRight: "calc(-1 * var(--page-pad-x, 16px))", padding: "0 var(--page-pad-x, 16px)" }}>
        {cats.map((c) => {
          const on = c === cat;
          return (
            <button key={c} onClick={() => setCat(c)} aria-pressed={on} style={{ flex: "0 0 auto", fontFamily: "var(--font-mono)", fontSize: fs.caption, fontWeight: 600, letterSpacing: ".02em", padding: "8px 14px", borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap", background: on ? C("lime") : C("ink2"), color: on ? C("ink") : C("ash"), border: `1px solid ${on ? C("lime") : C("line")}` }}>
              {c === "all" ? t("w.train.plans.allCats") : c}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The season you're currently enrolled in, shown above the goal grid.
 *  INFO-ONLY by design: no leave affordance here — a permanent exit button on
 *  the browse surface reads as an invitation to quit. Leaving lives at the
 *  bottom of the enrolled plan's own detail page (LeavePlanSection). */
function EnrolledCard() {
  const { t } = useLang();
  const { macro, planId, planStartedAt } = useMacrocycle();
  if (!macro) return null;

  const planName = GOAL_TREE.flatMap((g) => g.plans).find((p) => p.id === planId)?.name ?? macro.goalOrSport;
  const started = planStartedAt ? new Date(planStartedAt) : null;
  return (
    <div style={{ ...card, marginBottom: 24 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("lime") }}>{t("w.train.plans.currentPlan")}</div>
      <div style={{ fontWeight: 800, fontSize: fs.title, marginTop: 4 }}>{planName}</div>
      {started && <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 2 }}>{t("w.train.plans.startedOn")} {started.toLocaleDateString()}</div>}
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
      <LeavePlanSection forPlanId={plan.id} />
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
  const hero = planHeroView(plan, program);
  const rule = `color-mix(in srgb, ${C("chalk")} 18%, transparent)`;
  return (
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      {/* The Columns hero — gradient panel: back + loading tag, goal chip, big title. */}
      <div style={{ position: "relative", overflow: "hidden", borderRadius: 28, border: `1px solid ${C("line")}`, boxShadow: "var(--shadow-card)", padding: "18px 20px 24px", marginBottom: 18, background: `radial-gradient(130% 110% at 88% -10%, color-mix(in srgb, ${C("lime")} 16%, transparent), transparent 55%), linear-gradient(165deg, color-mix(in srgb, ${C("lime")} 9%, ${C("ink2")}), ${C("ink2")} 78%)` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <button onClick={back} aria-label={`← ${goal.name}`} style={{ width: 42, height: 42, borderRadius: 14, background: `color-mix(in srgb, ${C("chalk")} 10%, transparent)`, border: "none", color: C("chalk"), cursor: "pointer", fontSize: 17, lineHeight: "42px" }}>←</button>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, letterSpacing: ".22em", textTransform: "uppercase", color: C("chalk") }}>{hero.navLabel}</span>
        </div>
        <span style={{ display: "inline-block", background: C("chalk"), color: C("ink"), fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.micro, letterSpacing: ".18em", textTransform: "uppercase", borderRadius: 999, padding: "10px 16px", marginBottom: 14 }}>{goal.name}</span>
        <h2 style={{ fontWeight: 900, fontSize: "clamp(30px, 6vw, 38px)", lineHeight: 1.05, letterSpacing: "-.02em", margin: 0, textWrap: "balance" }}>{plan.name}</h2>
      </div>

      {/* Rule-topped editorial stat columns: duration, frequency, discipline volume. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18, marginBottom: 14 }}>
        {hero.stats.map((s) => (
          <div key={s.label} style={{ borderTop: `2px solid ${rule}`, paddingTop: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 28, letterSpacing: "-.02em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
              {s.value}{s.unit && <span style={{ fontSize: 15, color: C("ash"), fontWeight: 700 }}>{s.unit}</span>}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".14em", textTransform: "uppercase", color: C("ash"), marginTop: 6 }}>{s.label}</div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: fs.bodyLg, lineHeight: 1.55, color: C("ash"), margin: "0 0 16px", maxWidth: "62ch" }}>{hero.blurb}</p>

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
      <LeavePlanSection forPlanId={plan.id} />
    </div>
  );
}
