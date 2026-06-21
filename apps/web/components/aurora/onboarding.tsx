"use client";

import { useState } from "react";
import { fs, space,
  ONBOARDING_GOAL_GROUPS,
  type OnboardingQuestion,
} from "@hybrid/core";
import { useClientPersonaChoice, setClientPersona } from "@/lib/persona";
import { useOnboarding, submitOnboarding, type AnswerValue } from "@/lib/use-onboarding";
import { AuroraIcon } from "./icons";

/** AURORA onboarding (web) — the stepped wizard parity of the mobile flow, now
 *  driven by the admin-editable question set: one question per step, then the
 *  recommended plan. Engine answers feed recommendFromAnswers; the rest are saved. */
export default function AuroraOnboarding({ onEnrolled }: { onEnrolled: () => void }) {
  const { questions, answers, setAnswer, plan, loading } = useOnboarding();
  const personaChoice = useClientPersonaChoice();
  const [idx, setIdx] = useState(0);
  const [enrolling, setEnrolling] = useState(false);
  const [error, setError] = useState("");
  const C = (v: string) => `var(--color-${v})`;

  // The wizard steps = each question, then a final "plan" review step.
  const total = questions.length + 1;
  const onPlanStep = idx >= questions.length;
  const q = onPlanStep ? null : questions[idx]!;

  const finish = async () => {
    setEnrolling(true);
    setError("");
    try {
      const { ok, status } = await submitOnboarding(questions, answers, plan);
      if (status === 401) { setError("Sign in to save your plan (demo mode doesn't persist)."); setEnrolling(false); return; }
      if (!ok) { setError(`Couldn't enroll (HTTP ${status}).`); setEnrolling(false); return; }
      onEnrolled();
    } catch {
      setError("Network error — try again.");
      setEnrolling(false);
    }
  };

  const next = () => (idx < total - 1 ? setIdx((i) => i + 1) : finish());
  const back = () => idx > 0 && setIdx((i) => i - 1);

  // Can advance? Required questions must be answered (persona/goal too).
  const answered = (qq: OnboardingQuestion): boolean => {
    if (qq.kind === "persona") return !!(answers[qq.key] ?? personaChoice);
    const v = answers[qq.key];
    if (!qq.required) return true;
    return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
  };
  const canNext = onPlanStep ? true : answered(q!);

  if (loading && questions.length === 0) {
    return <div style={{ maxWidth: 520, margin: "0 auto", color: C("ash"), fontFamily: "var(--font-mono)" }}>Loading…</div>;
  }

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", fontFamily: "var(--font-display)" }}>
      <div style={{ display: "flex", gap: 7 }}>
        {Array.from({ length: total }).map((_, i) => (
          <span key={i} style={{ flex: 1, height: 5, borderRadius: 3, background: i <= idx ? C("lime") : C("line") }} />
        ))}
      </div>

      <div style={{ marginTop: 22 }}>
        {q ? (
          <Step title={q.title} sub={q.subtitle}>
            <QuestionBody q={q} answers={answers} setAnswer={setAnswer} personaChoice={personaChoice} C={C} />
          </Step>
        ) : (
          <Step title="Your plan" sub={plan ? "" : "Pick a goal to see a recommendation."}>
            {plan ? (
              <div style={{ background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 20 }}>
                <div style={{ fontWeight: 900, fontSize: 22 }}>{plan.planName}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 4 }}>{plan.goalLabel} · {plan.weeklyTarget}×/wk · {plan.weeks} weeks</div>
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
          {onPlanStep ? (enrolling ? "Setting up…" : plan ? "Start this plan" : "Continue") : "Next"}
        </button>
      </div>
    </div>
  );
}

function QuestionBody({
  q, answers, setAnswer, personaChoice, C,
}: {
  q: OnboardingQuestion;
  answers: Record<string, AnswerValue | null | undefined>;
  setAnswer: (key: string, value: AnswerValue) => void;
  personaChoice: "casual" | "athlete" | null;
  C: (v: string) => string;
}) {
  const choice = (active: boolean): React.CSSProperties => ({ display: "flex", alignItems: "center", gap: space.ms, border: `1px solid ${active ? C("lime") : C("line")}`, background: active ? "rgba(196,240,53,.08)" : C("ink2"), borderRadius: 16, padding: 15, cursor: "pointer", textAlign: "left", width: "100%", color: C("chalk") });

  if (q.kind === "persona") {
    const selected = (answers[q.key] as string) ?? personaChoice;
    return (
      <>
        {(q.choices ?? []).map((o) => (
          <button key={o.value} onClick={() => { setAnswer(q.key, o.value); if (o.value === "casual" || o.value === "athlete") setClientPersona(o.value); }} style={choice(selected === o.value)}>
            {selected === o.value && <AuroraIcon name="check" size={22} color={C("lime")} />}
            <span><b style={{ fontSize: fs.note, color: selected === o.value ? C("lime") : C("chalk") }}>{o.label}</b>{o.blurb && <><br /><span style={{ fontSize: fs.caption, color: C("ash") }}>{o.blurb}</span></>}</span>
          </button>
        ))}
      </>
    );
  }

  if (q.kind === "goal") {
    const selected = answers[q.key] as string | undefined;
    return (
      <>
        {ONBOARDING_GOAL_GROUPS.map((g) => (
          <div key={g.category}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".1em", textTransform: "uppercase", color: C("ash"), margin: "12px 0 6px" }}>{g.category}</div>
            {g.goals.map((gl) => (
              <button key={gl.id} onClick={() => setAnswer(q.key, gl.id)} style={{ ...choice(selected === gl.id), marginBottom: 8 }}>
                {selected === gl.id && <AuroraIcon name="check" size={20} color={C("lime")} />}
                <span><b style={{ fontSize: fs.bodyLg, color: selected === gl.id ? C("lime") : C("chalk") }}>{gl.label}</b><br /><span style={{ fontSize: fs.caption, color: C("ash") }}>{gl.blurb}</span></span>
              </button>
            ))}
          </div>
        ))}
      </>
    );
  }

  if (q.kind === "number") {
    const min = q.min ?? 1, max = q.max ?? 7, step = q.step ?? 1;
    const value = Number(answers[q.key] ?? q.defaultValue ?? min);
    const opts: number[] = [];
    for (let v = min; v <= max; v += step) opts.push(v);
    return <Seg options={opts.map((d) => ({ id: String(d), label: `${d}×` }))} value={String(value)} onPick={(v) => setAnswer(q.key, Number(v))} C={C} />;
  }

  if (q.kind === "text") {
    const value = (answers[q.key] as string) ?? "";
    return (
      <input value={value} onChange={(e) => setAnswer(q.key, e.target.value)}
        style={{ fontFamily: "var(--font-mono)", fontSize: fs.bodyLg, width: "100%", padding: "13px 14px", borderRadius: 14, background: C("ink2"), color: C("chalk"), border: `1px solid ${C("line")}`, outline: "none" }} />
    );
  }

  // single / multi
  const multi = q.kind === "multi";
  const current = answers[q.key];
  const selectedSet = new Set(multi ? ((current as string[]) ?? []) : current != null ? [String(current)] : []);
  if (multi) {
    return (
      <>
        {(q.choices ?? []).map((o) => {
          const on = selectedSet.has(o.value);
          const toggle = () => { const arr = new Set(selectedSet); if (arr.has(o.value)) arr.delete(o.value); else arr.add(o.value); setAnswer(q.key, [...arr]); };
          return (
            <button key={o.value} onClick={toggle} style={choice(on)}>
              {on && <AuroraIcon name="check" size={20} color={C("lime")} />}
              <span><b style={{ fontSize: fs.note, color: on ? C("lime") : C("chalk") }}>{o.label}</b>{o.blurb && <><br /><span style={{ fontSize: fs.caption, color: C("ash") }}>{o.blurb}</span></>}</span>
            </button>
          );
        })}
      </>
    );
  }
  return <Seg options={(q.choices ?? []).map((o) => ({ id: o.value, label: o.label }))} value={String(current ?? "")} onPick={(v) => setAnswer(q.key, v)} C={C} />;
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

function Seg({ options, value, onPick, C }: { options: { id: string; label: string }[]; value: string; onPick: (v: string) => void; C: (v: string) => string }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: space.xxs, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 999, padding: 4 }}>
      {options.map((o) => {
        const on = value === o.id;
        return <button key={o.id} onClick={() => onPick(o.id)} style={{ flex: "1 0 auto", padding: "11px 16px", borderRadius: 999, border: "none", cursor: "pointer", fontWeight: 700, fontSize: fs.body, background: on ? C("lime") : "transparent", color: on ? C("ink") : C("ash") }}>{o.label}</button>;
      })}
    </div>
  );
}
