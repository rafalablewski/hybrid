"use client";

import { useState } from "react";
import {
  ONBOARDING_GOAL_GROUPS,
  type OnboardingQuestion,
} from "@hybrid/core";
import { fs, space,
  INK2, LINE, LIME, CHALK, ASH, VIOLET, RED, ON_ACCENT,
  disp, cond, mono, Mono, Card, txt,
} from "@/lib/ui";
import { useClientPersonaChoice, setClientPersona } from "@/lib/persona";
import { useOnboarding, submitOnboarding, type AnswerValue } from "@/lib/use-onboarding";

// The onboarding questionnaire is now data: the admin-editable question set
// (persona/goal/experience/days/equipment + any custom questions) is fetched and
// rendered generically by kind, so adding/removing/rewording a question in the
// admin instantly changes both clients. Engine-relevant answers feed the plan
// recommendation; the rest are saved to the profile.
export default function Onboarding({ onEnrolled }: { onEnrolled: () => void }) {
  const { questions, answers, setAnswer, plan, loading } = useOnboarding();
  const [enrolling, setEnrolling] = useState(false);
  const [error, setError] = useState("");
  const personaChoice = useClientPersonaChoice();

  const goalQ = questions.find((q) => q.engineKey === "goal");
  const goalAnswered = goalQ ? !!answers[goalQ.key] : true;

  const start = async () => {
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

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ ...disp, fontWeight: 800, fontSize: 22, marginBottom: 4 }}>Let&apos;s set you up</div>
      <Mono s={{ fontSize: fs.body, display: "block", marginBottom: 16 }}>
        Tell us how you train — we&apos;ll shape the app around you.
      </Mono>

      {loading && questions.length === 0 ? (
        <Mono s={{ fontSize: fs.body }}>Loading…</Mono>
      ) : (
        questions.map((q, i) => (
          <QuestionCard
            key={q.key}
            q={q}
            index={i}
            answers={answers}
            setAnswer={setAnswer}
            personaChoice={personaChoice}
          />
        ))
      )}

      {plan ? (
        <Card style={{ borderLeft: `3px solid ${VIOLET}` }}>
          <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={VIOLET}>Your plan</Mono>
          <div style={{ ...disp, fontWeight: 800, fontSize: 22, marginTop: 6 }}>{plan.planName}</div>
          <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 2 }}>{plan.goalLabel} · {plan.weeklyTarget}×/wk · {plan.weeks} weeks · {plan.focus.join(" · ")}</Mono>
          <Mono s={{ fontSize: fs.body, lineHeight: 1.6, display: "block", marginTop: 10 }} c={CHALK}>{plan.why}</Mono>
          {error && <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 8 }} c={RED}>{error}</Mono>}
          <button
            onClick={start}
            disabled={enrolling}
            style={{ ...disp, fontWeight: 800, fontSize: fs.note, background: LIME, color: ON_ACCENT, border: "none", borderRadius: 12, padding: "13px 26px", marginTop: 14, cursor: enrolling ? "default" : "pointer", opacity: enrolling ? 0.6 : 1 }}
          >
            {enrolling ? "Setting up…" : "Start this plan →"}
          </button>
        </Card>
      ) : goalAnswered ? (
        <Card style={{ borderLeft: `3px solid ${VIOLET}` }}>
          <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={VIOLET}>Your plan</Mono>
          <Mono s={{ fontSize: fs.body, lineHeight: 1.6, display: "block", marginTop: 8 }} c={CHALK}>
            {goalQ ? "Plans for this goal are coming soon. Jump into the app now — you can enroll once they land." : "You're all set — jump into the app."}
          </Mono>
          {error && <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 8 }} c={RED}>{error}</Mono>}
          <button
            onClick={start}
            disabled={enrolling}
            style={{ ...disp, fontWeight: 800, fontSize: fs.note, background: LIME, color: ON_ACCENT, border: "none", borderRadius: 12, padding: "13px 26px", marginTop: 14, cursor: enrolling ? "default" : "pointer", opacity: enrolling ? 0.6 : 1 }}
          >
            {enrolling ? "Setting up…" : "Continue to the app →"}
          </button>
        </Card>
      ) : (
        <Mono s={{ fontSize: fs.body }}>Pick a goal to see your recommended plan.</Mono>
      )}
    </div>
  );
}

function QuestionCard({
  q, index, answers, setAnswer, personaChoice,
}: {
  q: OnboardingQuestion;
  index: number;
  answers: Record<string, AnswerValue | null | undefined>;
  setAnswer: (key: string, value: AnswerValue) => void;
  personaChoice: "casual" | "athlete" | null;
}) {
  const kicker = q.kind === "persona" ? q.title : `${index + 1} · ${q.title}`;

  if (q.kind === "persona") {
    const selected = (answers[q.key] as string) ?? personaChoice;
    return (
      <Card style={{ marginBottom: 14, borderLeft: `3px solid ${LIME}` }}>
        <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>{q.title}</Mono>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: space.sm, marginTop: 10 }}>
          {(q.choices ?? []).map((o) => (
            <button
              key={o.value}
              onClick={() => { setAnswer(q.key, o.value); if (o.value === "casual" || o.value === "athlete") setClientPersona(o.value); }}
              style={{ textAlign: "left", cursor: "pointer", borderRadius: 12, padding: 12, border: `1px solid ${selected === o.value ? LIME : LINE}`, background: selected === o.value ? `${LIME}14` : "transparent" }}
            >
              <div style={{ ...disp, fontWeight: 700, fontSize: fs.note, color: txt(selected === o.value ? LIME : CHALK) }}>{o.label}</div>
              {o.blurb && <Mono s={{ fontSize: fs.micro, lineHeight: 1.5 }}>{o.blurb}</Mono>}
            </button>
          ))}
        </div>
        {q.subtitle && <Mono s={{ fontSize: fs.nano, display: "block", marginTop: 10, lineHeight: 1.5 }} c={ASH}>{q.subtitle}</Mono>}
      </Card>
    );
  }

  if (q.kind === "goal") {
    const selected = answers[q.key] as string | undefined;
    return (
      <Card style={{ marginBottom: 14 }}>
        <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>{kicker}</Mono>
        {ONBOARDING_GOAL_GROUPS.map((group) => (
          <div key={group.category} style={{ marginTop: 14 }}>
            <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".12em" }} c={ASH}>{group.category}</Mono>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: space.sm, marginTop: 6 }}>
              {group.goals.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setAnswer(q.key, g.id)}
                  style={{ textAlign: "left", cursor: "pointer", borderRadius: 12, padding: 12, border: `1px solid ${selected === g.id ? LIME : LINE}`, background: selected === g.id ? `${LIME}14` : "transparent" }}
                >
                  <div style={{ ...disp, fontWeight: 700, fontSize: fs.note, color: txt(selected === g.id ? LIME : CHALK) }}>{g.label}</div>
                  <Mono s={{ fontSize: fs.micro }}>{g.blurb}</Mono>
                </button>
              ))}
            </div>
          </div>
        ))}
      </Card>
    );
  }

  if (q.kind === "number") {
    const min = q.min ?? 1, max = q.max ?? 7, step = q.step ?? 1;
    const value = Number(answers[q.key] ?? q.defaultValue ?? min);
    return (
      <Card style={{ marginBottom: 14 }}>
        <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>{kicker}</Mono>
        {q.subtitle && <Mono s={{ fontSize: fs.nano, display: "block", marginTop: 4 }} c={ASH}>{q.subtitle}</Mono>}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 10 }}>
          <button onClick={() => setAnswer(q.key, Math.max(min, value - step))} style={stepBtn}>−</button>
          <span style={{ ...disp, fontWeight: 800, fontSize: fs.display, color: CHALK, minWidth: 48, textAlign: "center" }}>{value}×</span>
          <button onClick={() => setAnswer(q.key, Math.min(max, value + step))} style={stepBtn}>+</button>
        </div>
      </Card>
    );
  }

  if (q.kind === "text") {
    const value = (answers[q.key] as string) ?? "";
    return (
      <Card style={{ marginBottom: 14 }}>
        <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>{kicker}</Mono>
        {q.subtitle && <Mono s={{ fontSize: fs.nano, display: "block", marginTop: 4 }} c={ASH}>{q.subtitle}</Mono>}
        <input
          value={value}
          onChange={(e) => setAnswer(q.key, e.target.value)}
          style={{ ...mono, marginTop: 10, fontSize: fs.bodyLg, width: "100%", padding: "11px 12px", borderRadius: 10, background: INK2, color: CHALK, border: `1px solid ${LINE}`, outline: "none" }}
        />
      </Card>
    );
  }

  // single / multi
  const multi = q.kind === "multi";
  const current = answers[q.key];
  const selectedSet = new Set(multi ? ((current as string[]) ?? []) : current != null ? [String(current)] : []);
  const toggle = (v: string) => {
    if (!multi) { setAnswer(q.key, v); return; }
    const arr = new Set(selectedSet);
    if (arr.has(v)) arr.delete(v); else arr.add(v);
    setAnswer(q.key, [...arr]);
  };
  return (
    <Card style={{ marginBottom: 14 }}>
      <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>{kicker}</Mono>
      {q.subtitle && <Mono s={{ fontSize: fs.nano, display: "block", marginTop: 4 }} c={ASH}>{q.subtitle}</Mono>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: space.xs, marginTop: 10 }}>
        {(q.choices ?? []).map((o) => {
          const on = selectedSet.has(o.value);
          return (
            <button
              key={o.value}
              onClick={() => toggle(o.value)}
              style={{ ...cond, fontSize: fs.body, fontWeight: 700, textTransform: "capitalize", padding: "6px 14px", borderRadius: 999, cursor: "pointer", border: `1px solid ${on ? LIME : LINE}`, background: on ? `${LIME}1a` : "transparent", color: txt(on ? LIME : ASH) }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

const stepBtn = {
  ...disp, fontWeight: 800, fontSize: 22, width: 46, height: 42, borderRadius: 10,
  border: `1px solid ${LINE}`, background: INK2, color: txt(LIME), cursor: "pointer",
} as const;
