"use client";

import { useCallback, useEffect, useState } from "react";
import type { OnboardingQuestion, OnboardingChoice } from "@hybrid/core";
import { fs, space, INK, INK2, LINE, LIME, CHALK, ASH, AMBER, VIOLET, RED, disp, cond, mono, Mono, Card, Chip, Select, txt } from "@/lib/ui";

type Draft = {
  key: string;
  kind: OnboardingQuestion["kind"];
  title: string;
  subtitle: string;
  engineKey?: string | null;
  choices: OnboardingChoice[];
  min?: number; max?: number; step?: number;
  defaultValue?: string;
  required: boolean;
  enabled: boolean;
  order: number;
  system: boolean;
  id: string;
};

const CUSTOM_KINDS: OnboardingQuestion["kind"][] = ["single", "multi", "number", "text"];

function toDraft(q: OnboardingQuestion): Draft {
  return {
    key: q.key, kind: q.kind, title: q.title, subtitle: q.subtitle ?? "", engineKey: q.engineKey ?? null,
    choices: q.choices ? q.choices.map((c) => ({ ...c })) : [], min: q.min, max: q.max, step: q.step,
    defaultValue: q.defaultValue != null ? String(q.defaultValue) : undefined,
    required: !!q.required, enabled: q.enabled, order: q.order, system: !!q.system, id: q.id,
  };
}

export default function AdminOnboarding() {
  const [questions, setQuestions] = useState<OnboardingQuestion[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // key being edited
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    fetch("/api/admin/onboarding-questions")
      .then((r) => r.json())
      .then((d) => { setUnavailable(Boolean(d.unavailable)); setQuestions(d.questions ?? []); })
      .catch(() => setQuestions([]));
  }, []);
  useEffect(load, [load]);

  async function save(body: Record<string, unknown>, closeEditor = true) {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/admin/onboarding-questions", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "save failed"); }
      if (closeEditor) { setEditing(null); setAdding(false); }
      load();
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't save."); }
    setBusy(false);
  }

  async function remove(q: OnboardingQuestion) {
    if (!confirm(`Delete “${q.title}”? This can't be undone.`)) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/admin/onboarding-questions/${encodeURIComponent(q.id)}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "delete failed"); }
      load();
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't delete."); }
    setBusy(false);
  }

  // Reorder by swapping `order` with the neighbour and saving both.
  async function move(i: number, dir: -1 | 1) {
    if (!questions) return;
    const j = i + dir;
    if (j < 0 || j >= questions.length) return;
    const a = questions[i]!, b = questions[j]!;
    const fields = (q: OnboardingQuestion, order: number) => ({
      key: q.key, title: q.title, subtitle: q.subtitle, kind: q.kind, choices: q.choices,
      min: q.min, max: q.max, step: q.step, defaultValue: q.defaultValue, required: q.required, enabled: q.enabled, order,
    });
    setBusy(true); setErr(null);
    try {
      await fetch("/api/admin/onboarding-questions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(fields(a, b.order)) });
      await fetch("/api/admin/onboarding-questions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(fields(b, a.order)) });
      load();
    } catch { setErr("Couldn't reorder — re-syncing."); }
    setBusy(false);
  }

  function toggleEnabled(q: OnboardingQuestion) {
    // A quick toggle on one row must not discard an open editor on another row.
    save({ key: q.key, title: q.title, subtitle: q.subtitle, kind: q.kind, choices: q.choices, min: q.min, max: q.max, step: q.step, defaultValue: q.defaultValue, required: q.required, enabled: !q.enabled, order: q.order }, false);
  }

  return (
    <div>
      {unavailable && (
        <Card style={{ borderLeft: `3px solid ${AMBER}`, marginBottom: 16 }}>
          <div style={{ ...disp, fontWeight: 800, fontSize: fs.subtitle, marginBottom: 6 }}>Edits aren&apos;t persisted yet</div>
          <Mono s={{ fontSize: fs.body, lineHeight: 1.6, display: "block" }} c={CHALK}>
            The <b>OnboardingQuestion</b> table doesn&apos;t exist yet — run{" "}
            <span style={{ color: txt(AMBER) }}>reference/sql-onboarding.sql</span> in Supabase to make changes stick.
            Until then both clients run on the five built-in questions below.
          </Mono>
        </Card>
      )}

      {err && <Mono s={{ fontSize: fs.body, display: "block", marginBottom: 12 }} c={RED}>{err}</Mono>}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: space.md, flexWrap: "wrap" }}>
        <Mono s={{ fontSize: fs.caption }} c={ASH}>
          {questions ? `${questions.length} questions` : "…"} · changes take effect on the next sign-up — no deploy. Both web & mobile.
        </Mono>
        <button onClick={() => { setAdding((a) => !a); setEditing(null); }} style={primaryBtn}>{adding ? "Cancel" : "+ Add question"}</button>
      </div>

      {adding && (
        <QuestionEditor
          draft={{ key: "", kind: "single", title: "", subtitle: "", choices: [{ value: "", label: "" }], required: false, enabled: true, order: (questions?.length ?? 0) + 10, system: false, id: "" }}
          busy={busy}
          onCancel={() => setAdding(false)}
          onSave={(d) => save(draftToBody(d))}
        />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: space.ms }}>
        {questions?.map((q, i) => (
          <div key={q.key}>
            {editing === q.key ? (
              <QuestionEditor draft={toDraft(q)} busy={busy} onCancel={() => setEditing(null)} onSave={(d) => save(draftToBody(d))} />
            ) : (
              <Card style={{ borderLeft: `3px solid ${q.enabled ? (q.system ? VIOLET : LIME) : ASH}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: space.md, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ marginBottom: 4 }}>
                      <Chip c={q.enabled ? LIME : ASH}>{q.enabled ? "on" : "off"}</Chip>
                      <Chip c={ASH}>{q.kind}</Chip>
                      {q.system ? <Chip c={VIOLET}>built-in</Chip> : <Chip c={AMBER}>custom</Chip>}
                      {q.engineKey && <Chip c={ASH}>→ {q.engineKey}</Chip>}
                      {q.required && <Chip c={ASH}>required</Chip>}
                    </div>
                    <div style={{ ...disp, fontWeight: 800, fontSize: fs.subtitle }}>{q.title}</div>
                    {q.subtitle && <Mono s={{ fontSize: fs.body, lineHeight: 1.5, display: "block", marginTop: 2 }} c={ASH}>{q.subtitle}</Mono>}
                    {q.choices && q.choices.length > 0 && q.kind !== "goal" && (
                      <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 6 }} c={ASH}>{q.choices.map((c) => c.label).join(" · ")}</Mono>
                    )}
                    {q.kind === "number" && <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 6 }} c={ASH}>{q.min ?? 1}–{q.max ?? 7}, step {q.step ?? 1}, default {String(q.defaultValue ?? q.min ?? 1)}</Mono>}
                    {q.kind === "goal" && <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 6 }} c={ASH}>options come from the plan library (goal tree)</Mono>}
                    <Mono s={{ fontSize: fs.nano, display: "block", marginTop: 6 }} c={ASH}>key: {q.key}</Mono>
                  </div>

                  <div style={{ display: "flex", gap: space.sm, alignItems: "center", flexShrink: 0 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <button disabled={busy || i === 0} onClick={() => move(i, -1)} style={iconBtn} title="Move up">↑</button>
                      <button disabled={busy || i === (questions.length - 1)} onClick={() => move(i, 1)} style={iconBtn} title="Move down">↓</button>
                    </div>
                    <button disabled={busy} onClick={() => toggleEnabled(q)} style={toggle(q.enabled)} title={q.enabled ? "Disable" : "Enable"}><span style={knob(q.enabled)} /></button>
                    <button disabled={busy} onClick={() => { setEditing(q.key); setAdding(false); }} style={smallBtn}>edit</button>
                    {!q.system && <button disabled={busy} onClick={() => remove(q)} style={{ ...smallBtn, color: txt(RED) }}>delete</button>}
                  </div>
                </div>
              </Card>
            )}
          </div>
        ))}

        {questions && questions.length === 0 && (
          <Card><Mono s={{ fontSize: fs.bodyLg, textAlign: "center", display: "block", padding: 24 }} c={ASH}>No questions.</Mono></Card>
        )}
      </div>
    </div>
  );
}

function draftToBody(d: Draft): Record<string, unknown> {
  return {
    key: d.key || undefined, kind: d.kind, title: d.title, subtitle: d.subtitle,
    choices: (d.kind === "single" || d.kind === "multi") ? d.choices.filter((c) => c.value && c.label) : undefined,
    min: d.kind === "number" ? d.min : undefined, max: d.kind === "number" ? d.max : undefined,
    step: d.kind === "number" ? d.step : undefined, defaultValue: d.defaultValue,
    required: d.required, enabled: d.enabled, order: d.order,
  };
}

function QuestionEditor({ draft, busy, onSave, onCancel }: { draft: Draft; busy: boolean; onSave: (d: Draft) => void; onCancel: () => void }) {
  const [d, setD] = useState<Draft>(draft);
  const set = (patch: Partial<Draft>) => setD((p) => ({ ...p, ...patch }));
  const lockedKind = d.system; // built-in kind/engineKey/key locked
  const isPersonaOrGoal = d.kind === "persona" || d.kind === "goal";

  return (
    <Card style={{ borderLeft: `3px solid ${AMBER}` }}>
      <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={AMBER}>{d.system ? "Edit built-in question" : d.id ? "Edit question" : "New question"}</Mono>

      <Field label="Question">
        <input value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder="What's your main goal?" style={inp} />
      </Field>
      <Field label="Helper text (optional)">
        <input value={d.subtitle} onChange={(e) => set({ subtitle: e.target.value })} placeholder="We'll shape your plan around it." style={inp} />
      </Field>

      {!lockedKind && (
        <Field label="Type">
          <Select value={d.kind} onChange={(e) => set({ kind: e.target.value as Draft["kind"] })}>
            {CUSTOM_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </Select>
        </Field>
      )}
      {lockedKind && <Mono s={{ fontSize: fs.micro, display: "block", margin: "4px 0 8px" }} c={ASH}>type: {d.kind}{d.engineKey ? ` · feeds → ${d.engineKey}` : ""} (locked — built-in)</Mono>}

      {isPersonaOrGoal ? (
        <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 6 }} c={ASH}>
          {d.kind === "goal" ? "Options come from the plan library (goal tree) — edit the wording above." : "The two persona cards are built in — edit the wording/options below."}
        </Mono>
      ) : null}

      {(d.kind === "single" || d.kind === "multi" || d.kind === "persona") && (
        <Field label="Options">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {d.choices.map((c, i) => (
              <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input value={c.label} onChange={(e) => { const n = [...d.choices]; n[i] = { ...n[i]!, label: e.target.value, value: n[i]!.value || slugify(e.target.value) }; set({ choices: n }); }} placeholder="Label" style={{ ...inp, marginBottom: 0, flex: 1 }} />
                <input value={c.value} onChange={(e) => { const n = [...d.choices]; n[i] = { ...n[i]!, value: e.target.value }; set({ choices: n }); }} placeholder="value" style={{ ...inp, marginBottom: 0, width: 120 }} />
                <button onClick={() => set({ choices: d.choices.filter((_, j) => j !== i) })} style={iconBtn} title="Remove">×</button>
              </div>
            ))}
            <button onClick={() => set({ choices: [...d.choices, { value: "", label: "" }] })} style={{ ...smallBtn, alignSelf: "flex-start" }}>+ option</button>
          </div>
        </Field>
      )}

      {d.kind === "number" && (
        <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap" }}>
          <Field label="Min"><input type="number" value={d.min ?? 1} onChange={(e) => set({ min: Number(e.target.value) })} style={{ ...inp, width: 90 }} /></Field>
          <Field label="Max"><input type="number" value={d.max ?? 7} onChange={(e) => set({ max: Number(e.target.value) })} style={{ ...inp, width: 90 }} /></Field>
          <Field label="Step"><input type="number" value={d.step ?? 1} onChange={(e) => set({ step: Number(e.target.value) })} style={{ ...inp, width: 90 }} /></Field>
          <Field label="Default"><input type="number" value={d.defaultValue ?? ""} onChange={(e) => set({ defaultValue: e.target.value })} style={{ ...inp, width: 90 }} /></Field>
        </div>
      )}

      <div style={{ display: "flex", gap: space.md, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" checked={d.required} onChange={(e) => set({ required: e.target.checked })} />
          <Mono s={{ fontSize: fs.caption }} c={CHALK}>Required</Mono>
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" checked={d.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
          <Mono s={{ fontSize: fs.caption }} c={CHALK}>Enabled</Mono>
        </label>
        <div style={{ flex: 1 }} />
        <button onClick={onCancel} style={smallBtn}>cancel</button>
        <button disabled={busy || !d.title.trim()} onClick={() => onSave(d)} style={primaryBtn}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 8 }}>
      <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 4 }} c={ASH}>{label}</Mono>
      {children}
    </div>
  );
}

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);

const inp: React.CSSProperties = { ...mono, fontSize: fs.body, width: "100%", padding: "9px 11px", borderRadius: 9, background: INK2, color: CHALK, border: `1px solid ${LINE}`, marginBottom: 4, outline: "none" };
const primaryBtn: React.CSSProperties = { ...disp, fontWeight: 800, fontSize: fs.caption, background: LIME, color: INK, border: "none", borderRadius: 9, padding: "9px 16px", cursor: "pointer" };
const smallBtn: React.CSSProperties = { ...cond, fontSize: fs.caption, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", padding: "8px 10px", borderRadius: 9, cursor: "pointer", border: `1px solid ${LINE}`, background: INK, color: txt(ASH) };
const iconBtn: React.CSSProperties = { ...disp, fontSize: fs.body, width: 28, height: 22, borderRadius: 7, border: `1px solid ${LINE}`, background: INK2, color: txt(ASH), cursor: "pointer", lineHeight: 1, padding: 0 };

function toggle(on: boolean): React.CSSProperties {
  return { width: 46, height: 26, borderRadius: 999, border: `1px solid ${on ? LIME : LINE}`, background: on ? `${LIME}33` : INK2, cursor: "pointer", padding: 2, display: "flex", justifyContent: on ? "flex-end" : "flex-start", alignItems: "center", transition: "all .12s" };
}
function knob(on: boolean): React.CSSProperties {
  return { width: 20, height: 20, borderRadius: 999, background: on ? LIME : ASH, display: "block" };
}
