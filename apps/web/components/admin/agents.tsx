"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildSystemPrompt,
  MODELS,
  EFFORTS,
  AUTHORITY_LEVELS,
  TOOL_OPTIONS,
  AGENT_STATUSES,
  type AgentDefinition,
  type AgentStatus,
  type Kpi,
} from "@hybrid/core";
import { INK, INK2, LINE, LIME, CHALK, ASH, AMBER, VIOLET, disp, cond, mono, Mono, Card, Chip, Select } from "@/lib/ui";

type Preset = { key: string; role: string; mandate: string; model: string; authority: string };
type RunStep = { agent: string; role: string; task: string; output: string };
type RunResult = { output: string; steps: RunStep[]; usage: { input: number; output: number } };

const STATUS_COLOR: Record<AgentStatus, string> = { active: LIME, paused: AMBER, draft: ASH };

export default function AdminAgents() {
  const [agents, setAgents] = useState<AgentDefinition[] | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AgentDefinition | null>(null);
  const [original, setOriginal] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [task, setTask] = useState("");
  const [runBusy, setRunBusy] = useState(false);
  const [run, setRun] = useState<RunResult | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/agents")
      .then((r) => r.json())
      .then((d) => {
        setUnavailable(Boolean(d.unavailable));
        setAgents(d.agents ?? []);
        setPresets(d.presets ?? []);
      })
      .catch(() => setAgents([]));
  }, []);

  useEffect(load, [load]);

  // When a selection changes, snapshot the agent into an editable draft.
  useEffect(() => {
    const a = agents?.find((x) => x.id === selectedId) ?? null;
    setDraft(a ? structuredClone(a) : null);
    setOriginal(a ? JSON.stringify(a) : "");
    setRun(null);
    setTask("");
  }, [selectedId, agents]);

  const dirty = useMemo(() => draft != null && JSON.stringify(draft) !== original, [draft, original]);
  const preview = useMemo(() => (draft ? buildSystemPrompt(draft) : ""), [draft]);

  async function createFrom(preset?: string) {
    setBusy(true);
    const body = preset
      ? { preset }
      : { role: "Custom", mandate: "Describe this agent's mission.", status: "draft" };
    const r = await fetch("/api/admin/agents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (d.agent?.id) {
      await new Promise<void>((res) => {
        fetch("/api/admin/agents")
          .then((x) => x.json())
          .then((dd) => {
            setAgents(dd.agents ?? []);
            setPresets(dd.presets ?? []);
            setSelectedId(d.agent.id);
            res();
          })
          .catch(() => res());
      });
    }
  }

  async function patch(id: string, body: Partial<AgentDefinition>) {
    setBusy(true);
    await fetch(`/api/admin/agents/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    load();
  }

  async function save() {
    if (!draft) return;
    const { id, name, role, mandate, status, model, effort, authority, reportsTo, responsibilities, kpis, guardrails, escalationThreshold, tone, collaborators, tools } = draft;
    await patch(id, { name, role, mandate, status, model, effort, authority, reportsTo, responsibilities, kpis, guardrails, escalationThreshold, tone, collaborators, tools });
  }

  async function remove(id: string) {
    if (!confirm("Delete this agent? This cannot be undone.")) return;
    setBusy(true);
    await fetch(`/api/admin/agents/${id}`, { method: "DELETE" });
    setBusy(false);
    if (selectedId === id) setSelectedId(null);
    load();
  }

  function set<K extends keyof AgentDefinition>(key: K, value: AgentDefinition[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  async function runTask() {
    if (!draft || !task.trim()) return;
    setRunBusy(true);
    setRun(null);
    try {
      const r = await fetch(`/api/admin/agents/${draft.id}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task: task.trim() }),
      });
      const d = await r.json();
      if (d.error) setRun({ output: `⚠ ${d.error}`, steps: [], usage: { input: 0, output: 0 } });
      else setRun({ output: d.output ?? "", steps: d.steps ?? [], usage: d.usage ?? { input: 0, output: 0 } });
    } catch {
      setRun({ output: "⚠ request failed", steps: [], usage: { input: 0, output: 0 } });
    }
    setRunBusy(false);
  }

  return (
    <div>
      {unavailable && (
        <Card style={{ borderLeft: `3px solid ${AMBER}`, marginBottom: 16 }}>
          <div style={{ ...disp, fontWeight: 800, fontSize: 16, marginBottom: 6 }}>Agents aren&apos;t persisted yet</div>
          <Mono s={{ fontSize: 12, lineHeight: 1.6, display: "block" }} c={CHALK}>
            The <b>AgentConfig</b> table doesn&apos;t exist yet — run{" "}
            <span style={{ color: AMBER }}>reference/sql-agents.sql</span> in Supabase to make agents persist. You can
            still preview the role presets below.
          </Mono>
        </Card>
      )}

      <Mono s={{ fontSize: 11, display: "block", marginBottom: 12 }} c={ASH}>
        Define your executive team. Edits to a KPI, responsibility, or guardrail rewrite the agent&apos;s live system
        prompt — shown in the preview as you type. The runtime executes these server-side (needs ANTHROPIC_API_KEY).
      </Mono>

      {/* ---- create row ---- */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {presets.map((p) => (
          <button key={p.key} disabled={busy} onClick={() => createFrom(p.key)} style={presetBtn}>
            + {p.role}
          </button>
        ))}
        <button disabled={busy} onClick={() => createFrom()} style={{ ...presetBtn, borderStyle: "dashed", color: ASH }}>
          + Custom
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 340px) 1fr", gap: 16, alignItems: "start" }}>
        {/* ---- roster ---- */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {agents?.map((a) => (
            <Card
              key={a.id}
              onClick={() => setSelectedId(a.id)}
              style={{
                borderLeft: `3px solid ${STATUS_COLOR[a.status]}`,
                padding: 14,
                outline: selectedId === a.id ? `1px solid ${AMBER}` : undefined,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ ...disp, fontWeight: 800, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {a.name}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <Chip c={STATUS_COLOR[a.status]}>{a.status}</Chip>
                    <Chip c={a.authority === "executive" ? VIOLET : ASH}>{a.role}</Chip>
                  </div>
                  <Mono s={{ fontSize: 10, display: "block", marginTop: 6 }} c={ASH}>
                    {a.model.replace("claude-", "")} · effort {a.effort} · {a.kpis.length} KPIs
                  </Mono>
                </div>
                <button
                  disabled={busy}
                  title={a.status === "active" ? "Pause" : "Activate"}
                  onClick={(e) => {
                    e.stopPropagation();
                    patch(a.id, { status: a.status === "active" ? "paused" : "active" });
                  }}
                  style={toggle(a.status === "active")}
                >
                  <span style={knob(a.status === "active")} />
                </button>
              </div>
            </Card>
          ))}
          {agents && agents.length === 0 && (
            <Card>
              <Mono s={{ fontSize: 13, textAlign: "center", display: "block", padding: 20 }} c={ASH}>
                No agents yet — create one from a preset above.
              </Mono>
            </Card>
          )}
        </div>

        {/* ---- editor ---- */}
        {draft ? (
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 8 }}>
              <div style={{ ...disp, fontWeight: 800, fontSize: 18 }}>Edit agent</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button disabled={busy || !dirty} onClick={save} style={{ ...primaryBtn, opacity: dirty ? 1 : 0.5 }}>
                  {dirty ? "Save changes" : "Saved"}
                </button>
                <button disabled={busy} onClick={() => remove(draft.id)} style={dangerBtn}>
                  Delete
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Name">
                <input style={input} value={draft.name} onChange={(e) => set("name", e.target.value)} />
              </Field>
              <Field label="Role / title">
                <input style={input} value={draft.role} onChange={(e) => set("role", e.target.value)} />
              </Field>
              <Field label="Status">
                <Select value={draft.status} onChange={(e) => set("status", e.target.value as AgentStatus)} style={{ width: "100%" }}>
                  {AGENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </Field>
              <Field label="Reports to" hint="blank = the human admin">
                <input style={input} value={draft.reportsTo ?? ""} onChange={(e) => set("reportsTo", e.target.value || null)} />
              </Field>
              <Field label="Model">
                <Select value={draft.model} onChange={(e) => set("model", e.target.value as AgentDefinition["model"])} style={{ width: "100%" }}>
                  {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </Select>
              </Field>
              <Field label="Effort" hint="thinking depth / token spend">
                <Select value={draft.effort} onChange={(e) => set("effort", e.target.value as AgentDefinition["effort"])} style={{ width: "100%" }}>
                  {EFFORTS.map((e) => <option key={e} value={e}>{e}</option>)}
                </Select>
              </Field>
              <div style={{ gridColumn: "span 2" }}>
                <Field label="Authority level">
                  <Select value={draft.authority} onChange={(e) => set("authority", e.target.value as AgentDefinition["authority"])} style={{ width: "100%" }}>
                    {AUTHORITY_LEVELS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </Select>
                </Field>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <Field label="Mandate" hint="one or two sentences — the spine of the prompt">
                <textarea style={{ ...input, minHeight: 60, resize: "vertical" }} value={draft.mandate} onChange={(e) => set("mandate", e.target.value)} />
              </Field>
            </div>

            <Section title="Responsibilities">
              <StringList items={draft.responsibilities} onChange={(v) => set("responsibilities", v)} placeholder="Add a responsibility…" />
            </Section>

            <Section title="KPIs" hint="what the agent is steered + evaluated on">
              <KpiList items={draft.kpis} onChange={(v) => set("kpis", v)} />
            </Section>

            <Section title="Guardrails & ethics">
              <StringList items={draft.guardrails} onChange={(v) => set("guardrails", v)} placeholder="Add a hard limit…" />
            </Section>

            <div style={{ marginTop: 12 }}>
              <Field label="Escalation threshold" hint="when to stop and ask the human admin">
                <textarea style={{ ...input, minHeight: 48, resize: "vertical" }} value={draft.escalationThreshold} onChange={(e) => set("escalationThreshold", e.target.value)} />
              </Field>
            </div>
            <div style={{ marginTop: 12 }}>
              <Field label="Tone & communication">
                <textarea style={{ ...input, minHeight: 48, resize: "vertical" }} value={draft.tone} onChange={(e) => set("tone", e.target.value)} />
              </Field>
            </div>

            <Section title="Collaborators">
              <StringList items={draft.collaborators} onChange={(v) => set("collaborators", v)} placeholder="Add a role…" />
            </Section>

            <Section title="Tools">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {TOOL_OPTIONS.map((t) => {
                  const on = draft.tools.includes(t.value);
                  return (
                    <button
                      key={t.value}
                      onClick={() => set("tools", on ? draft.tools.filter((x) => x !== t.value) : [...draft.tools, t.value])}
                      style={{ ...chipBtn, background: on ? `${LIME}1f` : INK2, color: on ? LIME : ASH, borderColor: on ? LIME : LINE }}
                    >
                      {on ? "✓ " : "+ "}{t.label}
                    </button>
                  );
                })}
              </div>
            </Section>

            {/* ---- run ---- */}
            <Section
              title="Run"
              hint={
                draft.authority === "executive" && reportsOf(agents, draft.role).length
                  ? `coordinates ${reportsOf(agents, draft.role).map((a) => a.role).join(", ")}`
                  : "give the agent a task and see its response"
              }
            >
              {draft.status !== "active" ? (
                <Mono s={{ fontSize: 12, display: "block" }} c={ASH}>
                  Activate the agent (status → active) to run it.
                </Mono>
              ) : (
                <>
                  <textarea
                    style={{ ...input, minHeight: 60, resize: "vertical" }}
                    placeholder="e.g. Draft a Q3 priority for the team and pull in finance + marketing input."
                    value={task}
                    onChange={(e) => setTask(e.target.value)}
                  />
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                    <button
                      disabled={runBusy || dirty || !task.trim()}
                      onClick={runTask}
                      style={{ ...primaryBtn, opacity: runBusy || dirty || !task.trim() ? 0.5 : 1 }}
                    >
                      {runBusy ? "Running…" : "Run agent"}
                    </button>
                    {dirty && (
                      <Mono s={{ fontSize: 11 }} c={AMBER}>
                        Save your changes before running.
                      </Mono>
                    )}
                  </div>

                  {run && (
                    <div style={{ marginTop: 12 }}>
                      {run.steps.map((s, i) => (
                        <div key={i} style={{ marginBottom: 10, paddingLeft: 10, borderLeft: `2px solid ${VIOLET}` }}>
                          <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", display: "block" }} c={VIOLET}>
                            ↳ delegated to {s.role} — {s.agent}
                          </Mono>
                          <Mono s={{ fontSize: 11, display: "block", margin: "2px 0 4px" }} c={ASH}>
                            “{s.task}”
                          </Mono>
                          <div style={{ ...mono, fontSize: 12, lineHeight: 1.5, color: CHALK, whiteSpace: "pre-wrap" }}>{s.output}</div>
                        </div>
                      ))}
                      <div
                        style={{
                          ...mono,
                          fontSize: 13,
                          lineHeight: 1.6,
                          color: CHALK,
                          background: INK,
                          border: `1px solid ${LINE}`,
                          borderRadius: 10,
                          padding: 14,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {run.output || "(no output)"}
                      </div>
                      {(run.usage.input > 0 || run.usage.output > 0) && (
                        <Mono s={{ fontSize: 10, display: "block", marginTop: 6 }} c={ASH}>
                          {run.usage.input.toLocaleString()} in · {run.usage.output.toLocaleString()} out tokens
                        </Mono>
                      )}
                    </div>
                  )}
                </>
              )}
            </Section>

            {/* ---- live prompt preview ---- */}
            <Section title="Live system prompt" hint="generated from the fields above — exactly what the agent runs on">
              <pre
                style={{
                  ...mono,
                  fontSize: 11,
                  lineHeight: 1.55,
                  color: CHALK,
                  background: INK,
                  border: `1px solid ${LINE}`,
                  borderRadius: 10,
                  padding: 14,
                  margin: 0,
                  maxHeight: 360,
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {preview}
              </pre>
            </Section>
          </Card>
        ) : (
          <Card>
            <Mono s={{ fontSize: 13, textAlign: "center", display: "block", padding: 40 }} c={ASH}>
              Select an agent to edit, or create one from a preset.
            </Mono>
          </Card>
        )}
      </div>
    </div>
  );
}

// ---- small editors -------------------------------------------------------

/** Active agents that report to `role` — for the coordinator hint. */
function reportsOf(agents: AgentDefinition[] | null, role: string): AgentDefinition[] {
  const key = role.trim().toUpperCase();
  return (agents ?? []).filter((a) => a.status === "active" && (a.reportsTo ?? "").trim().toUpperCase() === key);
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 5 }} c={ASH}>
        {label}
        {hint ? <span style={{ textTransform: "none", letterSpacing: 0, color: ASH }}> · {hint}</span> : null}
      </Mono>
      {children}
    </label>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${LINE}` }}>
      <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 10 }} c={AMBER}>
        {title}
        {hint ? <span style={{ textTransform: "none", letterSpacing: 0, color: ASH }}> · {hint}</span> : null}
      </Mono>
      {children}
    </div>
  );
}

function StringList({ items, onChange, placeholder }: { items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: "flex", gap: 6 }}>
          <input
            style={input}
            value={it}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
          />
          <button style={removeBtn} title="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))}>
            ×
          </button>
        </div>
      ))}
      <button style={addBtn} onClick={() => onChange([...items, ""])}>
        {placeholder}
      </button>
    </div>
  );
}

function KpiList({ items, onChange }: { items: Kpi[]; onChange: (v: Kpi[]) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {items.map((k, i) => (
        <div key={i} style={{ display: "flex", gap: 6 }}>
          <input
            style={{ ...input, flex: "0 0 40%" }}
            placeholder="metric"
            value={k.metric}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, metric: e.target.value } : x)))}
          />
          <input
            style={input}
            placeholder="target"
            value={k.target}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)))}
          />
          <button style={removeBtn} title="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))}>
            ×
          </button>
        </div>
      ))}
      <button style={addBtn} onClick={() => onChange([...items, { metric: "", target: "" }])}>
        + Add KPI
      </button>
    </div>
  );
}

// ---- styles --------------------------------------------------------------

const input: React.CSSProperties = {
  ...mono,
  fontSize: 13,
  width: "100%",
  padding: "8px 10px",
  borderRadius: 9,
  background: INK2,
  color: CHALK,
  border: `1px solid ${LINE}`,
  outline: "none",
};
const presetBtn: React.CSSProperties = {
  ...cond,
  fontSize: 13,
  fontWeight: 700,
  padding: "8px 14px",
  borderRadius: 9,
  cursor: "pointer",
  border: `1px solid ${LINE}`,
  background: INK2,
  color: CHALK,
};
const primaryBtn: React.CSSProperties = {
  ...cond,
  fontSize: 12,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: ".04em",
  padding: "8px 14px",
  borderRadius: 9,
  cursor: "pointer",
  border: `1px solid ${LIME}`,
  background: `${LIME}22`,
  color: LIME,
};
const dangerBtn: React.CSSProperties = {
  ...cond,
  fontSize: 12,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: ".04em",
  padding: "8px 14px",
  borderRadius: 9,
  cursor: "pointer",
  border: `1px solid ${LINE}`,
  background: "transparent",
  color: ASH,
};
const addBtn: React.CSSProperties = {
  ...cond,
  fontSize: 12,
  fontWeight: 600,
  textAlign: "left",
  padding: "7px 10px",
  borderRadius: 8,
  cursor: "pointer",
  border: `1px dashed ${LINE}`,
  background: "transparent",
  color: ASH,
};
const removeBtn: React.CSSProperties = {
  ...mono,
  fontSize: 16,
  lineHeight: 1,
  width: 34,
  flexShrink: 0,
  borderRadius: 8,
  cursor: "pointer",
  border: `1px solid ${LINE}`,
  background: INK2,
  color: ASH,
};
const chipBtn: React.CSSProperties = {
  ...cond,
  fontSize: 12,
  fontWeight: 600,
  padding: "6px 11px",
  borderRadius: 999,
  cursor: "pointer",
  border: `1px solid ${LINE}`,
};

function toggle(on: boolean): React.CSSProperties {
  return {
    width: 42,
    height: 24,
    borderRadius: 999,
    border: `1px solid ${on ? LIME : LINE}`,
    background: on ? `${LIME}33` : INK2,
    cursor: "pointer",
    padding: 2,
    display: "flex",
    justifyContent: on ? "flex-end" : "flex-start",
    alignItems: "center",
    flexShrink: 0,
  };
}
function knob(on: boolean): React.CSSProperties {
  return { width: 18, height: 18, borderRadius: 999, background: on ? LIME : ASH, display: "block" };
}
