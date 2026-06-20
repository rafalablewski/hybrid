import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, Alert } from "react-native";
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
import { adminGet, adminSend } from "../../lib/admin-api";
import { Card, Mono, Kicker, Loading, F } from "../../lib/ui";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { Banner, ErrorNote, Input, PillBtn, Segmented } from "./_kit";

// Mobile "AI agents" builder — parity with apps/web/components/admin/agents.tsx.
// Roster (GET /api/admin/agents) → select → editor (PATCH /[id]) with a live
// buildSystemPrompt() preview, run a task (NON-streaming POST /[id]/run — RN
// fetch can't easily consume the SSE /stream twin), schedules + run history.

type Preset = { key: string; role: string; mandate: string; model: string; authority: string };
type AgentsResp = { agents?: AgentDefinition[]; presets?: Preset[]; unavailable?: boolean };
type RunStep = { agent: string; role: string; task: string; output: string };
type RunResult = { output: string; steps: RunStep[]; usage: { input: number; output: number } };
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
type Schedule = {
  id: string;
  task: string;
  cadence: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
};

const STATUS_COLOR = (p: Palette): Record<AgentStatus, string> => ({ active: p.lime, paused: p.amber, draft: p.ash });

export default function AdminAgents() {
  const { palette } = useTheme();
  const [agents, setAgents] = useState<AgentDefinition[] | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AgentDefinition | null>(null);
  const [original, setOriginal] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await adminGet<AgentsResp>("/api/admin/agents");
    if (r.ok && r.data) {
      setUnavailable(Boolean(r.data.unavailable));
      setAgents(r.data.agents ?? []);
      setPresets(r.data.presets ?? []);
    } else {
      setAgents([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Snapshot the selected agent into an editable draft on selection change; on a
  // mere refetch of the SAME selection (after a save → load()) re-sync the dirty
  // baseline and adopt fresh values only when there are no unsaved local edits.
  const prevSelId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const a = agents?.find((x) => x.id === selectedId) ?? null;
    const selectionChanged = prevSelId.current !== selectedId;
    prevSelId.current = selectedId;
    if (selectionChanged) {
      setDraft(a ? JSON.parse(JSON.stringify(a)) : null);
      setOriginal(a ? JSON.stringify(a) : "");
      return;
    }
    const next = a ? JSON.stringify(a) : "";
    setDraft((d) => (d && JSON.stringify(d) === original ? (a ? JSON.parse(JSON.stringify(a)) : null) : d));
    setOriginal(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, agents]);

  const dirty = useMemo(() => draft != null && JSON.stringify(draft) !== original, [draft, original]);

  async function createFrom(preset?: string) {
    setBusy(true);
    setErr(null);
    const body = preset
      ? { preset }
      : { role: "Custom", mandate: "Describe this agent's mission.", status: "draft" };
    const r = await adminSend<{ agent?: { id: string } }>("POST", "/api/admin/agents", body);
    setBusy(false);
    if (!r.ok) {
      setErr(r.error || "Could not create the agent.");
      return;
    }
    const newId = r.data?.agent?.id;
    const list = await adminGet<AgentsResp>("/api/admin/agents");
    if (list.ok && list.data) {
      setAgents(list.data.agents ?? []);
      setPresets(list.data.presets ?? []);
    }
    if (newId) setSelectedId(newId);
  }

  async function patch(id: string, body: Partial<AgentDefinition>) {
    setBusy(true);
    setErr(null);
    const r = await adminSend("PATCH", `/api/admin/agents/${id}`, body);
    setBusy(false);
    if (!r.ok) setErr(r.error || "Could not save changes — they were not applied.");
    load();
  }

  async function save() {
    if (!draft) return;
    const { id, name, role, mandate, status, model, effort, authority, reportsTo, responsibilities, kpis, guardrails, escalationThreshold, tone, collaborators, tools, runtime, approvalThresholdUsd, budgetUsd7d } = draft;
    await patch(id, { name, role, mandate, status, model, effort, authority, reportsTo, responsibilities, kpis, guardrails, escalationThreshold, tone, collaborators, tools, runtime, approvalThresholdUsd, budgetUsd7d });
  }

  function remove(id: string) {
    Alert.alert("Delete agent?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          setErr(null);
          const r = await adminSend("DELETE", `/api/admin/agents/${id}`);
          setBusy(false);
          if (!r.ok) {
            setErr(r.error || "Could not delete the agent.");
            return;
          }
          if (selectedId === id) setSelectedId(null);
          load();
        },
      },
    ]);
  }

  function set<K extends keyof AgentDefinition>(key: K, value: AgentDefinition[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  if (agents === null) return <Loading />;

  return (
    <View>
      {unavailable && (
        <Banner tone="amber" title="Agents aren't persisted yet">
          The AgentConfig table doesn't exist yet — run reference/sql-agents.sql in Supabase to make agents persist. You
          can still preview the role presets below.
        </Banner>
      )}

      <ErrorNote error={err} onDismiss={() => setErr(null)} />

      <Mono color={palette.ash} style={{ marginBottom: 14, lineHeight: 18 }}>
        Define your executive team. Edits to a KPI, responsibility, or guardrail rewrite the agent's live system prompt —
        shown in the preview as you edit. The runtime executes these server-side (needs ANTHROPIC_API_KEY).
      </Mono>

      {/* ---- create row ---- */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {presets.map((p) => (
          <PillBtn key={p.key} label={`+ ${p.role}`} outline color={palette.chalk} disabled={busy} onPress={() => createFrom(p.key)} />
        ))}
        <PillBtn label="+ Custom" outline color={palette.ash} disabled={busy} onPress={() => createFrom()} />
      </View>

      {/* ---- roster ---- */}
      {agents.length === 0 ? (
        <Card>
          <Mono color={palette.ash} style={{ textAlign: "center", paddingVertical: 16 }}>
            No agents yet — create one from a preset above.
          </Mono>
        </Card>
      ) : (
        agents.map((a) => (
          <Pressable key={a.id} onPress={() => setSelectedId(a.id === selectedId ? null : a.id)}>
            <Card
              accent={STATUS_COLOR(palette)[a.status]}
              style={selectedId === a.id ? { borderColor: palette.amber, borderWidth: 1 } : undefined}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: 15, color: palette.chalk }} numberOfLines={1}>
                    {a.name}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    <MiniChip color={STATUS_COLOR(palette)[a.status]}>{a.status}</MiniChip>
                    <MiniChip color={a.authority === "executive" ? palette.violet : palette.ash}>{a.role}</MiniChip>
                  </View>
                  <Mono color={palette.ash} style={{ fontSize: 11, marginTop: 6 }}>
                    {a.model.replace("claude-", "")} · effort {a.effort} · {a.kpis.length} KPIs
                  </Mono>
                </View>
                <Toggle
                  on={a.status === "active"}
                  disabled={busy}
                  onToggle={() => patch(a.id, { status: a.status === "active" ? "paused" : "active" })}
                />
              </View>
            </Card>
          </Pressable>
        ))
      )}

      {/* ---- editor ---- */}
      {draft && (
        <Editor
          draft={draft}
          agents={agents}
          dirty={dirty}
          busy={busy}
          set={set}
          onSave={save}
          onDelete={() => remove(draft.id)}
          onError={setErr}
        />
      )}
    </View>
  );
}

// ---- editor --------------------------------------------------------------

function Editor({
  draft,
  agents,
  dirty,
  busy,
  set,
  onSave,
  onDelete,
  onError,
}: {
  draft: AgentDefinition;
  agents: AgentDefinition[];
  dirty: boolean;
  busy: boolean;
  set: <K extends keyof AgentDefinition>(key: K, value: AgentDefinition[K]) => void;
  onSave: () => void;
  onDelete: () => void;
  onError: (e: string | null) => void;
}) {
  const { palette } = useTheme();
  const preview = useMemo(() => buildSystemPrompt(draft), [draft]);
  const [showPrompt, setShowPrompt] = useState(false);

  return (
    <Card style={{ marginTop: 6 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <Text style={{ fontFamily: F.black, fontSize: 18, color: palette.chalk }}>Edit agent</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <PillBtn label={dirty ? "Save" : "Saved"} disabled={busy || !dirty} onPress={onSave} />
          <PillBtn label="Delete" outline color={palette.ash} disabled={busy} onPress={onDelete} />
        </View>
      </View>

      <Input label="Name" value={draft.name} onChangeText={(v) => set("name", v)} />
      <Input label="Role / title" value={draft.role} onChangeText={(v) => set("role", v)} />

      <FieldLabel>Status</FieldLabel>
      <Segmented
        options={AGENT_STATUSES.map((s) => ({ value: s, label: s }))}
        value={draft.status}
        onChange={(v) => set("status", v as AgentStatus)}
      />

      <Input label="Reports to (blank = the human admin)" value={draft.reportsTo ?? ""} onChangeText={(v) => set("reportsTo", v || null)} />

      <FieldLabel>Model</FieldLabel>
      <Segmented
        options={MODELS.map((m) => ({ value: m.id, label: m.label.replace("Claude ", "") }))}
        value={draft.model}
        onChange={(v) => set("model", v as AgentDefinition["model"])}
      />

      <FieldLabel>Effort · thinking depth / token spend</FieldLabel>
      <Segmented
        options={EFFORTS.map((e) => ({ value: e, label: e }))}
        value={draft.effort}
        onChange={(v) => set("effort", v as AgentDefinition["effort"])}
      />

      <FieldLabel>Authority level</FieldLabel>
      <Segmented
        options={AUTHORITY_LEVELS.map((a) => ({ value: a.value, label: a.value }))}
        value={draft.authority}
        onChange={(v) => set("authority", v as AgentDefinition["authority"])}
      />

      <FieldLabel>Runtime · managed = durable memory across runs</FieldLabel>
      <Segmented
        options={RUNTIMES.map((r) => ({ value: r.value, label: r.value }))}
        value={draft.runtime}
        onChange={(v) => set("runtime", v as AgentDefinition["runtime"])}
      />

      <Input label="Mandate · the spine of the prompt" multiline value={draft.mandate} onChangeText={(v) => set("mandate", v)} />

      <SectionHead title="Responsibilities" />
      <StringList items={draft.responsibilities} onChange={(v) => set("responsibilities", v)} placeholder="+ Add a responsibility" />

      <SectionHead title="KPIs" hint="what the agent is steered + evaluated on" />
      <KpiList items={draft.kpis} onChange={(v) => set("kpis", v)} />

      <SectionHead title="Guardrails & ethics" />
      <StringList items={draft.guardrails} onChange={(v) => set("guardrails", v)} placeholder="+ Add a hard limit" />

      <Input label="Escalation threshold · when to stop and ask the admin" multiline value={draft.escalationThreshold} onChangeText={(v) => set("escalationThreshold", v)} />
      <Input label="Tone & communication" multiline value={draft.tone} onChangeText={(v) => set("tone", v)} />

      <SectionHead title="Collaborators" />
      <StringList items={draft.collaborators} onChange={(v) => set("collaborators", v)} placeholder="+ Add a role" />

      <SectionHead title="Tools" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {TOOL_OPTIONS.map((t) => {
          const on = draft.tools.includes(t.value);
          return (
            <ToolToggle
              key={t.value}
              label={t.label}
              on={on}
              onPress={() => set("tools", on ? draft.tools.filter((x) => x !== t.value) : [...draft.tools, t.value])}
            />
          );
        })}
      </View>

      <SectionHead title="Spend controls" hint="0 = off" />
      <Input
        label="Approval threshold ($) · hold for a 2nd operator at/above this est. cost"
        keyboardType="numeric"
        value={draft.approvalThresholdUsd != null ? String(draft.approvalThresholdUsd) : ""}
        onChangeText={(v) => set("approvalThresholdUsd", v === "" ? 0 : Number(v) || 0)}
      />
      <Input
        label="Weekly budget cap ($) · auto-pause at/above 7-day spend"
        keyboardType="numeric"
        value={draft.budgetUsd7d != null ? String(draft.budgetUsd7d) : ""}
        onChangeText={(v) => set("budgetUsd7d", v === "" ? 0 : Number(v) || 0)}
      />

      {/* ---- run ---- */}
      <SectionHead title="Run" hint="give the agent a task and see its response" />
      <RunPanel draft={draft} dirty={dirty} onError={onError} />

      {/* ---- schedules ---- */}
      <SectionHead title="Schedules" hint="standing tasks on a cadence (fires via cron; only while active)" />
      <Schedules agentId={draft.id} onError={onError} />

      {/* ---- run history ---- */}
      <SectionHead title="History" hint="recent runs (transcripts)" />
      <History agentId={draft.id} />

      {/* ---- live prompt preview ---- */}
      <SectionHead title="Live system prompt" hint="exactly what the agent runs on" />
      <Pressable onPress={() => setShowPrompt((s) => !s)}>
        <Mono color={palette.lime} style={{ marginBottom: 8 }}>{showPrompt ? "▾ hide" : "▸ show"} generated prompt</Mono>
      </Pressable>
      {showPrompt && (
        <View style={{ backgroundColor: palette.ink, borderWidth: 1, borderColor: palette.line, borderRadius: 12, padding: 14 }}>
          <Mono color={palette.chalk} style={{ fontSize: 11, lineHeight: 17 }}>{preview}</Mono>
        </View>
      )}
    </Card>
  );
}

// ---- run -----------------------------------------------------------------

function RunPanel({ draft, dirty, onError }: { draft: AgentDefinition; dirty: boolean; onError: (e: string | null) => void }) {
  const { palette } = useTheme();
  const [task, setTask] = useState("");
  const [runBusy, setRunBusy] = useState(false);
  const [run, setRun] = useState<{ output: string; steps: RunStep[]; usage?: { input: number; output: number } } | null>(null);

  if (draft.status !== "active") {
    return <Mono color={palette.ash}>Activate the agent (status → active) to run it.</Mono>;
  }

  async function runTask() {
    if (!task.trim()) return;
    setRunBusy(true);
    setRun(null);
    onError(null);
    // NON-streaming twin of /stream (RN fetch can't easily read SSE).
    const r = await adminSend<{
      output?: string;
      steps?: RunStep[];
      usage?: { input: number; output: number };
      error?: string;
      source?: string;
      pending?: boolean;
      estimate?: number | null;
    }>("POST", `/api/admin/agents/${draft.id}/run`, { task: task.trim() });
    setRunBusy(false);
    const d = r.data ?? {};
    if (!r.ok || d.error || d.source === "unconfigured") {
      setRun({ output: d.error ?? d.output ?? "request failed", steps: [] });
      return;
    }
    if (d.pending) {
      setRun({
        output: `Queued for a second operator's approval${d.estimate != null ? ` (est $${d.estimate.toFixed(2)})` : ""}. Approve it in Agent HQ → Approvals.`,
        steps: [],
      });
      return;
    }
    setRun({ output: d.output ?? "(no output)", steps: d.steps ?? [], usage: d.usage });
  }

  return (
    <View>
      <Input
        multiline
        value={task}
        onChangeText={setTask}
        placeholder="e.g. Draft a Q3 priority and pull in finance + marketing input."
      />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <PillBtn label={runBusy ? "Running…" : "Run agent"} disabled={runBusy || dirty || !task.trim()} onPress={runTask} />
        {dirty && <Mono color={palette.amber} style={{ fontSize: 11 }}>Save your changes before running.</Mono>}
      </View>
      {run && (
        <View style={{ marginTop: 12 }}>
          {run.steps.map((s, i) => (
            <View key={i} style={{ marginBottom: 10, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: palette.violet }}>
              <Mono color={palette.violet} style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8 }}>
                ↳ delegated to {s.role} — {s.agent}
              </Mono>
              <Mono color={palette.ash} style={{ fontSize: 11, marginVertical: 2 }}>"{s.task}"</Mono>
              <Mono color={palette.chalk} style={{ fontSize: 12, lineHeight: 18 }}>{s.output}</Mono>
            </View>
          ))}
          <View style={{ backgroundColor: palette.ink, borderWidth: 1, borderColor: palette.line, borderRadius: 12, padding: 14 }}>
            <Mono color={palette.chalk} style={{ fontSize: 13, lineHeight: 20 }}>{run.output || "(no output)"}</Mono>
          </View>
          {run.usage && (run.usage.input > 0 || run.usage.output > 0) && (
            <Mono color={palette.ash} style={{ fontSize: 11, marginTop: 6 }}>
              {run.usage.input.toLocaleString()} in · {run.usage.output.toLocaleString()} out tokens
            </Mono>
          )}
        </View>
      )}
    </View>
  );
}

// ---- schedules -----------------------------------------------------------

function Schedules({ agentId, onError }: { agentId: string; onError: (e: string | null) => void }) {
  const { palette } = useTheme();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [newTask, setNewTask] = useState("");
  const [newCadence, setNewCadence] = useState<string>("daily");

  const load = useCallback(async () => {
    const r = await adminGet<{ schedules?: Schedule[] }>(`/api/admin/agents/${agentId}/schedules`);
    setSchedules(r.ok && r.data ? r.data.schedules ?? [] : []);
  }, [agentId]);

  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    if (!newTask.trim()) return;
    onError(null);
    const r = await adminSend("POST", `/api/admin/agents/${agentId}/schedules`, { task: newTask.trim(), cadence: newCadence });
    if (!r.ok) {
      onError(r.error || "Could not add the schedule.");
      return;
    }
    setNewTask("");
    load();
  }

  async function toggle(s: Schedule) {
    onError(null);
    const r = await adminSend("PATCH", `/api/admin/agents/${agentId}/schedules/${s.id}`, { enabled: !s.enabled });
    if (!r.ok) onError(r.error || "Could not update the schedule.");
    load();
  }

  function del(id: string) {
    Alert.alert("Delete schedule?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          onError(null);
          const r = await adminSend("DELETE", `/api/admin/agents/${agentId}/schedules/${id}`);
          if (!r.ok) onError(r.error || "Could not delete the schedule.");
          load();
        },
      },
    ]);
  }

  return (
    <View style={{ gap: 8 }}>
      {schedules.map((s) => (
        <View key={s.id} style={{ flexDirection: "row", gap: 8, backgroundColor: palette.ink, borderWidth: 1, borderColor: palette.line, borderRadius: 12, padding: 10 }}>
          <Toggle on={s.enabled} onToggle={() => toggle(s)} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", gap: 6 }}>
              <MiniChip color={s.enabled ? palette.lime : palette.ash}>{s.cadence}</MiniChip>
              <MiniChip color={palette.ash}>{s.enabled ? "on" : "off"}</MiniChip>
            </View>
            <Mono color={palette.chalk} style={{ fontSize: 12, marginTop: 4 }}>{s.task}</Mono>
            <Mono color={palette.ash} style={{ fontSize: 11, marginTop: 4 }}>
              {s.lastRunAt ? `last ${new Date(s.lastRunAt).toLocaleDateString()}` : "never run"}
              {s.enabled && s.nextRunAt ? ` · next ${new Date(s.nextRunAt).toLocaleDateString()}` : ""}
            </Mono>
          </View>
          <Pressable onPress={() => del(s.id)} hitSlop={8}>
            <Mono color={palette.ash} style={{ fontSize: 18 }}>×</Mono>
          </Pressable>
        </View>
      ))}
      {schedules.length === 0 && <Mono color={palette.ash}>No schedules yet.</Mono>}

      <Input value={newTask} onChangeText={setNewTask} placeholder="Standing task, e.g. Daily ops status." />
      <Segmented
        options={CADENCES.map((c) => ({ value: c.value, label: c.label }))}
        value={newCadence}
        onChange={setNewCadence}
      />
      <PillBtn label="Add schedule" disabled={!newTask.trim()} onPress={add} />
    </View>
  );
}

// ---- run history ---------------------------------------------------------

function History({ agentId }: { agentId: string }) {
  const { palette } = useTheme();
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    adminGet<{ runs?: RunRow[] }>(`/api/admin/agents/${agentId}/runs`).then((r) => setRuns(r.ok && r.data ? r.data.runs ?? [] : []));
  }, [agentId]);

  if (runs.length === 0) return <Mono color={palette.ash}>No runs yet.</Mono>;

  return (
    <View style={{ gap: 8 }}>
      {runs.map((r) => {
        const open = openId === r.id;
        return (
          <View key={r.id} style={{ backgroundColor: palette.ink, borderWidth: 1, borderColor: palette.line, borderRadius: 12, padding: 12 }}>
            <Pressable onPress={() => setOpenId(open ? null : r.id)}>
              <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <MiniChip color={r.status === "ok" ? palette.lime : palette.red}>{r.status}</MiniChip>
                <MiniChip color={palette.ash}>{r.runtime}</MiniChip>
                <Mono color={palette.ash} style={{ fontSize: 11 }}>{new Date(r.createdAt).toLocaleString()}</Mono>
              </View>
              <Mono color={palette.chalk} style={{ fontSize: 12, marginTop: 4 }} >{r.task}</Mono>
            </Pressable>
            {open && (
              <View style={{ marginTop: 8 }}>
                {r.steps.map((s, i) => (
                  <View key={i} style={{ marginBottom: 8, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: palette.violet }}>
                    <Mono color={palette.violet} style={{ fontSize: 11, textTransform: "uppercase" }}>↳ {s.role}</Mono>
                    <Mono color={palette.chalk} style={{ fontSize: 11 }}>{s.output}</Mono>
                  </View>
                ))}
                <Mono color={palette.chalk} style={{ fontSize: 12, lineHeight: 18 }}>{r.output}</Mono>
                <Mono color={palette.ash} style={{ fontSize: 11, marginTop: 6 }}>
                  {r.inputTokens.toLocaleString()} in · {r.outputTokens.toLocaleString()} out · {r.ranByEmail ?? "—"}
                </Mono>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ---- small editors -------------------------------------------------------

function StringList({ items, onChange, placeholder }: { items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {items.map((it, i) => (
        <View key={i} style={{ flexDirection: "row", gap: 6, alignItems: "flex-start" }}>
          <View style={{ flex: 1 }}>
            <Input value={it} onChangeText={(v) => onChange(items.map((x, j) => (j === i ? v : x)))} style={{ marginBottom: 0 }} />
          </View>
          <Pressable onPress={() => onChange(items.filter((_, j) => j !== i))} hitSlop={8} style={{ paddingTop: 8 }}>
            <Mono color={palette.ash} style={{ fontSize: 18 }}>×</Mono>
          </Pressable>
        </View>
      ))}
      <PillBtn label={placeholder} outline color={palette.ash} onPress={() => onChange([...items, ""])} />
    </View>
  );
}

function KpiList({ items, onChange }: { items: Kpi[]; onChange: (v: Kpi[]) => void }) {
  const { palette } = useTheme();
  return (
    <View style={{ gap: 10 }}>
      {items.map((k, i) => (
        <View key={i} style={{ borderWidth: 1, borderColor: palette.line, borderRadius: 12, padding: 10 }}>
          <Input label="metric" value={k.metric} onChangeText={(v) => onChange(items.map((x, j) => (j === i ? { ...x, metric: v } : x)))} style={{ marginBottom: 6 }} />
          <Input label="target (text)" value={k.target} onChangeText={(v) => onChange(items.map((x, j) => (j === i ? { ...x, target: v } : x)))} style={{ marginBottom: 6 }} />
          <Input
            label="numeric target (optional)"
            keyboardType="numeric"
            value={k.targetValue == null ? "" : String(k.targetValue)}
            onChangeText={(v) => onChange(items.map((x, j) => (j === i ? { ...x, targetValue: v === "" ? null : Number(v) } : x)))}
            style={{ marginBottom: 6 }}
          />
          <PillBtn label="Remove KPI" outline color={palette.ash} onPress={() => onChange(items.filter((_, j) => j !== i))} />
        </View>
      ))}
      <PillBtn label="+ Add KPI" outline color={palette.ash} onPress={() => onChange([...items, { metric: "", target: "" }])} />
    </View>
  );
}

// ---- shared bits ---------------------------------------------------------

function FieldLabel({ children }: { children: React.ReactNode }) {
  const { palette } = useTheme();
  return <Mono color={palette.ash} style={{ fontSize: 11, marginBottom: 6 }}>{children}</Mono>;
}

function SectionHead({ title, hint }: { title: string; hint?: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ marginTop: 16, marginBottom: 10, paddingTop: 14, borderTopWidth: 1, borderTopColor: palette.line }}>
      <Kicker color={palette.amber}>{title}</Kicker>
      {hint ? <Mono color={palette.ash} style={{ fontSize: 11, marginTop: 2 }}>{hint}</Mono> : null}
    </View>
  );
}

function MiniChip({ children, color }: { children: React.ReactNode; color: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ backgroundColor: `${color}1f`, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 2, alignSelf: "flex-start" }}>
      <Text style={{ fontFamily: F.semi, fontSize: 11, color: txt(palette, color), textTransform: "uppercase", letterSpacing: 0.5 }}>
        {children}
      </Text>
    </View>
  );
}

function ToolToggle({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderColor: on ? palette.lime : palette.line,
        backgroundColor: on ? `${palette.lime}1f` : palette.ink2,
        borderRadius: 999,
        paddingVertical: 6,
        paddingHorizontal: 12,
      }}
    >
      <Text style={{ fontFamily: F.semi, fontSize: 12, color: on ? txt(palette, palette.lime) : palette.ash }}>
        {on ? "✓ " : "+ "}{label}
      </Text>
    </Pressable>
  );
}

function Toggle({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      style={{
        width: 44,
        height: 26,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: on ? palette.lime : palette.line,
        backgroundColor: on ? `${palette.lime}33` : palette.ink2,
        padding: 2,
        alignItems: on ? "flex-end" : "flex-start",
        justifyContent: "center",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <View style={{ width: 18, height: 18, borderRadius: 999, backgroundColor: on ? palette.lime : palette.ash }} />
    </Pressable>
  );
}
