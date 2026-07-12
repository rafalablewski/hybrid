"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildSystemPrompt,
  MODELS,
  EFFORTS,
  RUNTIMES,
  CADENCES,
  AUTHORITY_LEVELS,
  TOOL_OPTIONS,
  AGENT_STATUSES,
  type AgentDefinition,
  type AgentStatus,
  type Kpi,
} from "@hybrid/core";
import { fs, space, INK, INK2, LINE, LIME, CHALK, ASH, AMBER, VIOLET, disp, cond, mono, Mono, Card, Chip, Select, txt } from "@/lib/ui";
import { useIsMobile } from "@/lib/use-media-query";

type Preset = { key: string; role: string; mandate: string; model: string; authority: string };
type RunStep = { agent: string; role: string; task: string; output: string };
type RunResult = { output: string; steps: RunStep[]; usage: { input: number; output: number } };
type RunEvent =
  | { type: "status"; message: string }
  | { type: "text"; delta: string }
  | { type: "delegate_start"; role: string; agent: string; task: string }
  | { type: "delegate_end"; role: string; agent: string; output: string }
  | { type: "done"; result: RunResult }
  | { type: "error"; message: string }
  | { type: "pending"; estimate: number | null };
type RunRow = {
  id: string;
  task: string;
  output: string;
  steps: RunStep[];
  inputTokens: number;
  outputTokens: number;
  status: string;
  runtime: string;
  ranByEmail: string | null;
  createdAt: string;
};
type TimelineItem = { id: string; ts: string; kind: "audit" | "run" | "approval"; title: string; detail: string; actor: string };
type Schedule = {
  id: string;
  task: string;
  cadence: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
};

const STATUS_COLOR: Record<AgentStatus, string> = { active: LIME, paused: AMBER, draft: ASH };

export default function AdminAgents() {
  const isMobile = useIsMobile();
  const [agents, setAgents] = useState<AgentDefinition[] | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AgentDefinition | null>(null);
  const [original, setOriginal] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [task, setTask] = useState("");
  const [runBusy, setRunBusy] = useState(false);
  const [run, setRun] = useState<RunResult | null>(null);
  const [liveText, setLiveText] = useState("");
  const [liveSteps, setLiveSteps] = useState<RunStep[]>([]);
  const [runStatus, setRunStatus] = useState("");
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [newTask, setNewTask] = useState("");
  const [newCadence, setNewCadence] = useState<string>("daily");

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

  // When a selection changes, snapshot the agent into an editable draft and
  // clear the transient run/task state. When `agents` is merely refetched for
  // the SAME selection (e.g. after a save calls load()), we must NOT wipe the
  // editor — only re-sync the dirty baseline so `dirty` clears, and adopt the
  // refreshed values into the draft only if there are no unsaved local edits.
  const prevSelId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const a = agents?.find((x) => x.id === selectedId) ?? null;
    const selectionChanged = prevSelId.current !== selectedId;
    prevSelId.current = selectedId;
    if (selectionChanged) {
      setDraft(a ? structuredClone(a) : null);
      setOriginal(a ? JSON.stringify(a) : "");
      setRun(null);
      setLiveText("");
      setLiveSteps([]);
      setRunStatus("");
      setTask("");
      return;
    }
    const next = a ? JSON.stringify(a) : "";
    setDraft((d) => (d && JSON.stringify(d) === original ? (a ? structuredClone(a) : null) : d));
    setOriginal(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `original` is read as the pre-refresh baseline; including it would loop.
  }, [selectedId, agents]);

  const loadRuns = useCallback(() => {
    if (!selectedId) {
      setRuns([]);
      return;
    }
    fetch(`/api/admin/agents/${selectedId}/runs`)
      .then((r) => r.json())
      .then((d) => setRuns(d.runs ?? []))
      .catch(() => setRuns([]));
  }, [selectedId]);

  useEffect(loadRuns, [loadRuns]);

  const loadTimeline = useCallback(() => {
    if (!selectedId) {
      setTimeline([]);
      return;
    }
    fetch(`/api/admin/agents/${selectedId}/timeline`)
      .then((r) => r.json())
      .then((d) => setTimeline(d.items ?? []))
      .catch(() => setTimeline([]));
  }, [selectedId]);

  useEffect(loadTimeline, [loadTimeline]);

  const loadSchedules = useCallback(() => {
    if (!selectedId) {
      setSchedules([]);
      return;
    }
    fetch(`/api/admin/agents/${selectedId}/schedules`)
      .then((r) => r.json())
      .then((d) => setSchedules(d.schedules ?? []))
      .catch(() => setSchedules([]));
  }, [selectedId]);

  useEffect(loadSchedules, [loadSchedules]);

  async function addSchedule() {
    if (!selectedId || !newTask.trim()) return;
    setErr(null);
    const res = await fetch(`/api/admin/agents/${selectedId}/schedules`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ task: newTask.trim(), cadence: newCadence }),
    }).catch(() => null);
    if (!res || !res.ok) {
      const d = res ? await res.json().catch(() => ({})) : {};
      setErr(d.error || "Could not add the schedule.");
      return;
    }
    setNewTask("");
    loadSchedules();
  }

  async function toggleSchedule(s: Schedule) {
    setErr(null);
    const res = await fetch(`/api/admin/agents/${selectedId}/schedules/${s.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: !s.enabled }),
    }).catch(() => null);
    if (!res || !res.ok) setErr("Could not update the schedule.");
    loadSchedules();
  }

  async function deleteSchedule(id: string) {
    setErr(null);
    const res = await fetch(`/api/admin/agents/${selectedId}/schedules/${id}`, { method: "DELETE" }).catch(() => null);
    if (!res || !res.ok) setErr("Could not delete the schedule.");
    loadSchedules();
  }

  const dirty = useMemo(() => draft != null && JSON.stringify(draft) !== original, [draft, original]);
  const preview = useMemo(() => (draft ? buildSystemPrompt(draft) : ""), [draft]);

  async function createFrom(preset?: string) {
    setBusy(true);
    setErr(null);
    const body = preset
      ? { preset }
      : { role: "Custom", mandate: "Describe this agent's mission.", status: "draft" };
    const r = await fetch("/api/admin/agents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r || !r.ok) {
      setErr(d.error || "Could not create the agent.");
      return;
    }
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
    setErr(null);
    const res = await fetch(`/api/admin/agents/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    setBusy(false);
    if (!res || !res.ok) {
      const d = res ? await res.json().catch(() => ({})) : {};
      setErr(d.error || "Could not save changes — they were not applied.");
    }
    load();
  }

  async function save() {
    if (!draft) return;
    const { id, name, role, mandate, status, model, effort, authority, reportsTo, responsibilities, kpis, guardrails, escalationThreshold, tone, collaborators, tools, runtime, approvalThresholdUsd, budgetUsd7d } = draft;
    await patch(id, { name, role, mandate, status, model, effort, authority, reportsTo, responsibilities, kpis, guardrails, escalationThreshold, tone, collaborators, tools, runtime, approvalThresholdUsd, budgetUsd7d });
  }

  async function remove(id: string) {
    if (!confirm("Delete this agent? This cannot be undone.")) return;
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/admin/agents/${id}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (!res || !res.ok) {
      const d = res ? await res.json().catch(() => ({})) : {};
      setErr(d.error || "Could not delete the agent.");
      return;
    }
    if (selectedId === id) setSelectedId(null);
    load();
  }

  function set<K extends keyof AgentDefinition>(key: K, value: AgentDefinition[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  function handleEvent(ev: RunEvent) {
    switch (ev.type) {
      case "status":
        setRunStatus(ev.message);
        break;
      case "text":
        setLiveText((t) => t + ev.delta);
        break;
      case "delegate_start":
        setRunStatus(`Delegating to ${ev.role}…`);
        setLiveSteps((s) => [...s, { agent: ev.agent, role: ev.role, task: ev.task, output: "" }]);
        break;
      case "delegate_end":
        setLiveSteps((s) => {
          const copy = [...s];
          for (let i = copy.length - 1; i >= 0; i--) {
            if (copy[i]!.agent === ev.agent && copy[i]!.output === "") {
              copy[i] = { ...copy[i]!, output: ev.output };
              break;
            }
          }
          return copy;
        });
        break;
      case "done":
        setRun(ev.result);
        setLiveText(ev.result.output);
        setLiveSteps(ev.result.steps);
        setRunStatus("");
        break;
      case "error":
        setRun({ output: `⚠ ${ev.message}`, steps: [], usage: { input: 0, output: 0 } });
        setRunStatus("");
        break;
      case "pending":
        setRun({
          output: `⏳ Queued for a second operator's approval${ev.estimate != null ? ` (est $${ev.estimate.toFixed(2)})` : ""}. Approve it in Agent HQ → Approvals.`,
          steps: [],
          usage: { input: 0, output: 0 },
        });
        setRunStatus("");
        break;
    }
  }

  async function runTask() {
    if (!draft || !task.trim()) return;
    setRunBusy(true);
    setRun(null);
    setLiveText("");
    setLiveSteps([]);
    setRunStatus("Starting…");
    try {
      const resp = await fetch(`/api/admin/agents/${draft.id}/stream`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task: task.trim() }),
      });
      if (!resp.body) throw new Error("no stream");
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          try {
            handleEvent(JSON.parse(line.slice(5).trim()) as RunEvent);
          } catch {
            /* ignore malformed frame */
          }
        }
      }
    } catch {
      setRun({ output: "⚠ request failed", steps: [], usage: { input: 0, output: 0 } });
      setRunStatus("");
    }
    setRunBusy(false);
    loadRuns();
    loadTimeline();
  }

  return (
    <div>
      {unavailable && (
        <Card style={{ borderLeft: `3px solid ${AMBER}`, marginBottom: 16 }}>
          <div style={{ ...disp, fontWeight: 800, fontSize: fs.subtitle, marginBottom: 6 }}>Agents aren&apos;t persisted yet</div>
          <Mono s={{ fontSize: fs.body, lineHeight: 1.6, display: "block" }} c={CHALK}>
            The <b>AgentConfig</b> table doesn&apos;t exist yet — run{" "}
            <span style={{ color: txt(AMBER) }}>reference/sql-agents.sql</span> in Supabase to make agents persist. You can
            still preview the role presets below.
          </Mono>
        </Card>
      )}

      {err && (
        <Card style={{ borderLeft: `3px solid ${AMBER}`, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: space.md }}>
          <div role="alert"><Mono s={{ fontSize: fs.body }} c={AMBER}>{err}</Mono></div>
          <button onClick={() => setErr(null)} style={{ ...mono, fontSize: fs.caption, background: "transparent", border: `1px solid ${LINE}`, borderRadius: 6, padding: "6px 8px", color: txt(ASH), cursor: "pointer" }}>
            Dismiss
          </button>
        </Card>
      )}

      <Mono s={{ fontSize: fs.caption, display: "block", marginBottom: 12 }} c={ASH}>
        Define your executive team. Edits to a KPI, responsibility, or guardrail rewrite the agent&apos;s live system
        prompt — shown in the preview as you type. The runtime executes these server-side (needs ANTHROPIC_API_KEY).
      </Mono>

      {/* ---- create row ---- */}
      <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap", marginBottom: 16 }}>
        {presets.map((p) => (
          <button key={p.key} disabled={busy} onClick={() => createFrom(p.key)} style={presetBtn}>
            + {p.role}
          </button>
        ))}
        <button disabled={busy} onClick={() => createFrom()} style={{ ...presetBtn, borderStyle: "dashed", color: txt(ASH) }}>
          + Custom
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(260px, 340px) 1fr", gap: space.lg, alignItems: "start" }}>
        {/* ---- roster ---- */}
        <div style={{ display: "flex", flexDirection: "column", gap: space.sm }}>
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
              <div style={{ display: "flex", justifyContent: "space-between", gap: space.sm, alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ ...disp, fontWeight: 800, fontSize: fs.note, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {a.name}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <Chip c={STATUS_COLOR[a.status]}>{a.status}</Chip>
                    <Chip c={a.authority === "executive" ? VIOLET : ASH}>{a.role}</Chip>
                  </div>
                  <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 6 }} c={ASH}>
                    {a.model.replace("claude-", "")} – effort {a.effort} – {a.kpis.length} KPIs
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
              <Mono s={{ fontSize: fs.bodyLg, textAlign: "center", display: "block", padding: 20 }} c={ASH}>
                No agents yet — create one from a preset above.
              </Mono>
            </Card>
          )}
        </div>

        {/* ---- editor ---- */}
        {draft ? (
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: space.sm }}>
              <div style={{ ...disp, fontWeight: 800, fontSize: fs.title }}>Edit agent</div>
              <div style={{ display: "flex", gap: space.sm }}>
                <button disabled={busy || !dirty} onClick={save} style={{ ...primaryBtn, opacity: dirty ? 1 : 0.5 }}>
                  {dirty ? "Save changes" : "Saved"}
                </button>
                <button disabled={busy} onClick={() => remove(draft.id)} style={dangerBtn}>
                  Delete
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: space.md }}>
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
              <Field label="Authority level">
                <Select value={draft.authority} onChange={(e) => set("authority", e.target.value as AgentDefinition["authority"])} style={{ width: "100%" }}>
                  {AUTHORITY_LEVELS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </Select>
              </Field>
              <Field label="Runtime" hint="managed = durable memory across runs">
                <Select value={draft.runtime} onChange={(e) => set("runtime", e.target.value as AgentDefinition["runtime"])} style={{ width: "100%" }}>
                  {RUNTIMES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </Select>
              </Field>
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
              <div style={{ display: "flex", flexWrap: "wrap", gap: space.sm }}>
                {TOOL_OPTIONS.map((t) => {
                  const on = draft.tools.includes(t.value);
                  return (
                    <button
                      key={t.value}
                      onClick={() => set("tools", on ? draft.tools.filter((x) => x !== t.value) : [...draft.tools, t.value])}
                      style={{ ...chipBtn, background: on ? `color-mix(in srgb, var(--color-lime) 12%, transparent)` : INK2, color: txt(on ? LIME : ASH), borderColor: on ? LIME : LINE }}
                    >
                      {on ? "✓ " : "+ "}{t.label}
                    </button>
                  );
                })}
              </div>
            </Section>

            {/* ---- spend controls ---- */}
            <Section title="Spend controls" hint="0 = off">
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: space.md }}>
                <Field label="Approval threshold ($)" hint="hold for a 2nd operator when est. run cost ≥ this">
                  <input
                    style={input}
                    type="number"
                    min={0}
                    step="0.5"
                    value={draft.approvalThresholdUsd || ""}
                    onChange={(e) => set("approvalThresholdUsd", e.target.value === "" ? 0 : Number(e.target.value))}
                  />
                </Field>
                <Field label="Weekly budget cap ($)" hint="auto-pause when 7-day spend ≥ this">
                  <input
                    style={input}
                    type="number"
                    min={0}
                    step="1"
                    value={draft.budgetUsd7d || ""}
                    onChange={(e) => set("budgetUsd7d", e.target.value === "" ? 0 : Number(e.target.value))}
                  />
                </Field>
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
                <Mono s={{ fontSize: fs.body, display: "block" }} c={ASH}>
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
                  <div style={{ display: "flex", alignItems: "center", gap: space.ms, marginTop: 8 }}>
                    <button
                      disabled={runBusy || dirty || !task.trim()}
                      onClick={runTask}
                      style={{ ...primaryBtn, opacity: runBusy || dirty || !task.trim() ? 0.5 : 1 }}
                    >
                      {runBusy ? "Running…" : "Run agent"}
                    </button>
                    {dirty && (
                      <Mono s={{ fontSize: fs.caption }} c={AMBER}>
                        Save your changes before running.
                      </Mono>
                    )}
                    {runBusy && runStatus && (
                      <Mono s={{ fontSize: fs.caption }} c={LIME}>
                        {runStatus}
                      </Mono>
                    )}
                  </div>

                  {(run || liveText || liveSteps.length > 0) && (
                    <div style={{ marginTop: 12 }}>
                      {liveSteps.map((s, i) => (
                        <div key={i} style={{ marginBottom: 10, paddingLeft: 10, borderLeft: `2px solid ${VIOLET}` }}>
                          <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".08em", display: "block" }} c={VIOLET}>
                            ↳ delegated to {s.role} — {s.agent}
                          </Mono>
                          <Mono s={{ fontSize: fs.caption, display: "block", margin: "2px 0 4px" }} c={ASH}>
                            “{s.task}”
                          </Mono>
                          <div style={{ ...mono, fontSize: fs.body, lineHeight: 1.5, color: CHALK, whiteSpace: "pre-wrap" }}>
                            {s.output || (runBusy ? "…" : "")}
                          </div>
                        </div>
                      ))}
                      <div
                        style={{
                          ...mono,
                          fontSize: fs.bodyLg,
                          lineHeight: 1.6,
                          color: CHALK,
                          background: INK,
                          border: `1px solid ${LINE}`,
                          borderRadius: "var(--r-card)",
                          padding: 14,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {(run ? run.output : liveText) || (runBusy ? "…" : "(no output)")}
                      </div>
                      {run && (run.usage.input > 0 || run.usage.output > 0) && (
                        <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 6 }} c={ASH}>
                          {run.usage.input.toLocaleString()} in – {run.usage.output.toLocaleString()} out tokens
                        </Mono>
                      )}
                    </div>
                  )}
                </>
              )}
            </Section>

            {/* ---- schedules ---- */}
            <Section title="Schedules" hint="standing tasks the agent runs on a cadence (fires via cron; only while active)">
              <div style={{ display: "flex", flexDirection: "column", gap: space.sm }}>
                {schedules.map((s) => (
                  <div key={s.id} style={{ display: "flex", gap: space.sm, alignItems: "flex-start", background: INK, border: `1px solid ${LINE}`, borderRadius: "var(--r-card)", padding: "10px 12px" }}>
                    <button onClick={() => toggleSchedule(s)} style={toggle(s.enabled)} title={s.enabled ? "Disable" : "Enable"}>
                      <span style={knob(s.enabled)} />
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div>
                        <Chip c={s.enabled ? LIME : ASH}>{s.cadence}</Chip>
                        <Chip c={ASH}>{s.enabled ? "on" : "off"}</Chip>
                      </div>
                      <div style={{ ...mono, fontSize: fs.body, color: CHALK, whiteSpace: "pre-wrap", marginTop: 4 }}>{s.task}</div>
                      <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 4 }} c={ASH}>
                        {s.lastRunAt ? `last ${new Date(s.lastRunAt).toLocaleString()}` : "never run"}
                        {s.enabled && s.nextRunAt ? ` – next ${new Date(s.nextRunAt).toLocaleString()}` : ""}
                      </Mono>
                    </div>
                    <button aria-label="Delete" style={removeBtn} title="Delete" onClick={() => deleteSchedule(s.id)}>×</button>
                  </div>
                ))}

                <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap" }}>
                  <input
                    style={{ ...input, flex: "1 1 200px", width: "auto" }}
                    placeholder="Standing task, e.g. Daily ops status across the team."
                    value={newTask}
                    onChange={(e) => setNewTask(e.target.value)}
                  />
                  <Select value={newCadence} onChange={(e) => setNewCadence(e.target.value)} style={{ flexShrink: 0 }}>
                    {CADENCES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </Select>
                  <button style={{ ...primaryBtn, flexShrink: 0, opacity: newTask.trim() ? 1 : 0.5 }} disabled={!newTask.trim()} onClick={addSchedule}>
                    Add
                  </button>
                </div>
              </div>
            </Section>

            {/* ---- activity timeline ---- */}
            {timeline.length > 0 && (
              <Section title="Timeline" hint="config edits – runs – approvals">
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {timeline.map((t) => {
                    const c = t.kind === "run" ? LIME : t.kind === "approval" ? AMBER : VIOLET;
                    return (
                      <div key={t.id} style={{ display: "flex", gap: space.ms, alignItems: "baseline", padding: "8px 0", borderBottom: `1px solid ${LINE}` }}>
                        <span style={{ width: 7, height: 7, borderRadius: 99, background: c, flexShrink: 0, marginTop: 5 }} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ ...disp, fontSize: fs.bodyLg, fontWeight: 700, color: CHALK }}>
                            {t.title} <Mono s={{ fontSize: fs.micro }} c={c}>{t.kind}</Mono>
                          </div>
                          {t.detail && <Mono s={{ fontSize: fs.caption, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} c={ASH}>{t.detail}</Mono>}
                        </div>
                        <Mono s={{ fontSize: fs.micro, flexShrink: 0 }} c={ASH}>{new Date(t.ts).toLocaleString()} – {t.actor}</Mono>
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            {/* ---- run history ---- */}
            {runs.length > 0 && (
              <Section title="History" hint={`${runs.length} recent run${runs.length === 1 ? "" : "s"} (transcripts)`}>
                <div style={{ display: "flex", flexDirection: "column", gap: space.sm }}>
                  {runs.map((r) => (
                    <details key={r.id} style={{ background: INK, border: `1px solid ${LINE}`, borderRadius: "var(--r-card)", padding: "10px 12px" }}>
                      <summary style={{ ...mono, fontSize: fs.body, color: CHALK, cursor: "pointer", listStyle: "none" }}>
                        <Chip c={r.status === "ok" ? LIME : "#e06666"}>{r.status}</Chip>
                        <Chip c={ASH}>{r.runtime}</Chip>
                        <span style={{ color: txt(ASH) }}>{new Date(r.createdAt).toLocaleString()}</span>
                        <div style={{ marginTop: 4, color: CHALK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.task}</div>
                      </summary>
                      <div style={{ marginTop: 8 }}>
                        {r.steps.map((s, i) => (
                          <div key={i} style={{ marginBottom: 8, paddingLeft: 8, borderLeft: `2px solid ${VIOLET}` }}>
                            <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", display: "block" }} c={VIOLET}>↳ {s.role}</Mono>
                            <div style={{ ...mono, fontSize: fs.caption, color: CHALK, whiteSpace: "pre-wrap" }}>{s.output}</div>
                          </div>
                        ))}
                        <div style={{ ...mono, fontSize: fs.body, color: CHALK, whiteSpace: "pre-wrap" }}>{r.output}</div>
                        <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 6 }} c={ASH}>
                          {r.inputTokens.toLocaleString()} in – {r.outputTokens.toLocaleString()} out – {r.ranByEmail ?? "—"}
                        </Mono>
                      </div>
                    </details>
                  ))}
                </div>
              </Section>
            )}

            {/* ---- live prompt preview ---- */}
            <Section title="Live system prompt" hint="generated from the fields above — exactly what the agent runs on">
              <pre
                style={{
                  ...mono,
                  fontSize: fs.caption,
                  lineHeight: 1.55,
                  color: CHALK,
                  background: INK,
                  border: `1px solid ${LINE}`,
                  borderRadius: "var(--r-card)",
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
            <Mono s={{ fontSize: fs.bodyLg, textAlign: "center", display: "block", padding: 40 }} c={ASH}>
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
      <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 5 }} c={ASH}>
        {label}
        {hint ? <span style={{ textTransform: "none", letterSpacing: 0, color: txt(ASH) }}> – {hint}</span> : null}
      </Mono>
      {children}
    </label>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${LINE}` }}>
      <Mono s={{ fontSize: fs.caption, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 10 }} c={AMBER}>
        {title}
        {hint ? <span style={{ textTransform: "none", letterSpacing: 0, color: txt(ASH) }}> – {hint}</span> : null}
      </Mono>
      {children}
    </div>
  );
}

function StringList({ items, onChange, placeholder }: { items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: "flex", gap: space.xs }}>
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
    <div style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
      {items.map((k, i) => (
        <div key={i} style={{ display: "flex", gap: space.xs, flexWrap: "wrap" }}>
          <input
            style={{ ...input, flex: "1 1 120px", width: "auto" }}
            placeholder="metric"
            value={k.metric}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, metric: e.target.value } : x)))}
          />
          <input
            style={{ ...input, flex: "2 1 120px", width: "auto" }}
            placeholder="target (text)"
            value={k.target}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)))}
          />
          <input
            style={{ ...input, flex: "0 1 96px" }}
            type="number"
            placeholder="# target"
            title="Optional numeric target for the scorecard"
            value={k.targetValue ?? ""}
            onChange={(e) =>
              onChange(items.map((x, j) => (j === i ? { ...x, targetValue: e.target.value === "" ? null : Number(e.target.value) } : x)))
            }
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
  fontSize: fs.bodyLg,
  width: "100%",
  padding: "10px 10px",
  borderRadius: "var(--r-field)",
  background: INK2,
  color: CHALK,
  border: `1px solid ${LINE}`,
  outline: "none",
};
const presetBtn: React.CSSProperties = {
  ...cond,
  fontSize: fs.bodyLg,
  fontWeight: 700,
  padding: "10px 14px",
  borderRadius: "var(--r-field)",
  cursor: "pointer",
  border: `1px solid ${LINE}`,
  background: INK2,
  color: CHALK,
};
const primaryBtn: React.CSSProperties = {
  ...cond,
  fontSize: fs.body,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: ".04em",
  padding: "10px 14px",
  borderRadius: "var(--r-field)",
  cursor: "pointer",
  border: `1px solid ${LIME}`,
  background: `color-mix(in srgb, var(--color-lime) 13%, transparent)`,
  color: txt(LIME),
};
const dangerBtn: React.CSSProperties = {
  ...cond,
  fontSize: fs.body,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: ".04em",
  padding: "10px 14px",
  borderRadius: "var(--r-field)",
  cursor: "pointer",
  border: `1px solid ${LINE}`,
  background: "transparent",
  color: txt(ASH),
};
const addBtn: React.CSSProperties = {
  ...cond,
  fontSize: fs.body,
  fontWeight: 600,
  textAlign: "left",
  padding: "9px 10px",
  borderRadius: "var(--r-field)",
  cursor: "pointer",
  border: `1px dashed ${LINE}`,
  background: "transparent",
  color: txt(ASH),
};
const removeBtn: React.CSSProperties = {
  ...mono,
  fontSize: fs.subtitle,
  lineHeight: 1,
  width: 34,
  flexShrink: 0,
  borderRadius: "var(--r-field)",
  cursor: "pointer",
  border: `1px solid ${LINE}`,
  background: INK2,
  color: txt(ASH),
};
const chipBtn: React.CSSProperties = {
  ...cond,
  fontSize: fs.body,
  fontWeight: 600,
  padding: "8px 11px",
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
    background: on ? `color-mix(in srgb, var(--color-lime) 20%, transparent)` : INK2,
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
