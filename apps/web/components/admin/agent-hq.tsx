"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { INK, INK2, CARD, LINE, LIME, CHALK, ASH, AMBER, VIOLET, BLUE, RED, disp, cond, mono, Mono, Card, Chip, Stat, Select } from "@/lib/ui";
import AdminAgentRuns from "./agent-runs";

type AgentLite = {
  id: string;
  name: string;
  role: string;
  status: string;
  model: string;
  authority: string;
  reportsTo: string | null;
  runtime: string;
  kpis: number;
};
type RunLite = {
  id: string;
  agentId: string;
  agentName: string;
  agentRole: string;
  status: string;
  runtime: string;
  task: string;
  delegations: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  createdAt: string;
};
type Upcoming = { id: string; agentName: string; role: string; status: string; task: string; cadence: string; nextRunAt: string | null };
type Kpi = { metric: string; target: string };
type Scorecard = {
  id: string;
  name: string;
  role: string;
  status: string;
  model: string;
  authority: string;
  runtime: string;
  kpis: Kpi[];
  runs7d: number;
  successRate: number | null;
  tokens7d: number;
  cost7d: number;
  lastRunAt: string | null;
};
type BrokenSchedule = { id: string; agentId: string; agentName: string; cadence: string; task: string; reason: string };
type Overview = {
  agents: AgentLite[];
  stats: {
    agents: { total: number; active: number; paused: number; draft: number };
    runs: { today: number; week: number; successRate: number | null };
    tokens: { today: number; week: number };
    cost: { today: number; week: number };
    schedules: { total: number; enabled: number };
    attention: number;
  };
  trend: { day: string; ok: number; error: number }[];
  recent: RunLite[];
  upcoming: Upcoming[];
  scorecards: Scorecard[];
  attention: { failed: RunLite[]; brokenSchedules: BrokenSchedule[] };
};

const DOT: Record<string, string> = { active: LIME, paused: AMBER, draft: ASH };
const TABS = [
  { id: "command", label: "Command center" },
  { id: "scorecards", label: "Scorecards" },
  { id: "work", label: "Work" },
  { id: "inbox", label: "Inbox" },
  { id: "reports", label: "Reports" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function fmtTok(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
function fmtUsd(n: number): string {
  if (n >= 100) return `$${Math.round(n)}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n > 0) return `$${n.toFixed(3)}`;
  return "$0";
}
function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function until(iso: string | null): string {
  if (!iso) return "—";
  const s = (new Date(iso).getTime() - Date.now()) / 1000;
  if (s < 0) return "due now";
  if (s < 3600) return `in ${Math.ceil(s / 60)}m`;
  if (s < 86400) return `in ${Math.round(s / 3600)}h`;
  return `in ${Math.round(s / 86400)}d`;
}

export default function AgentHQ() {
  const [data, setData] = useState<Overview | null>(null);
  const [tab, setTab] = useState<TabId>("command");

  const load = useCallback(() => {
    fetch("/api/admin/agents/overview")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null));
  }, []);
  useEffect(load, [load]);

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 18, borderBottom: `1px solid ${LINE}` }}>
        {TABS.map((t) => {
          const badge = t.id === "inbox" ? data?.stats.attention ?? 0 : 0;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                ...disp,
                fontSize: 14,
                fontWeight: 700,
                padding: "9px 16px",
                cursor: "pointer",
                border: "none",
                background: "transparent",
                color: tab === t.id ? CHALK : ASH,
                borderBottom: `2px solid ${tab === t.id ? AMBER : "transparent"}`,
                marginBottom: -1,
              }}
            >
              {t.label}
              {badge > 0 && (
                <span style={{ ...mono, fontSize: 10, fontWeight: 700, marginLeft: 6, padding: "1px 6px", borderRadius: 99, background: RED, color: "#fff" }}>{badge}</span>
              )}
            </button>
          );
        })}
        <button onClick={load} style={{ ...mono, marginLeft: "auto", fontSize: 12, color: ASH, background: "transparent", border: "none", cursor: "pointer" }}>
          ↻ refresh
        </button>
      </div>

      {tab === "command" && <Command data={data} />}
      {tab === "scorecards" && <Scorecards data={data} />}
      {tab === "work" && <Work data={data} onRan={load} />}
      {tab === "inbox" && <Inbox data={data} />}
      {tab === "reports" && <AdminAgentRuns />}
    </div>
  );
}

// ---- Command center ------------------------------------------------------

function Command({ data }: { data: Overview | null }) {
  if (!data) return <Mono s={{ display: "block", padding: 20 }} c={ASH}>Loading the operations center…</Mono>;
  const { stats, agents, trend, recent, upcoming } = data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <Stat label="Active agents" value={stats.agents.active} sub={`${stats.agents.total} total · ${stats.agents.paused} paused`} c={LIME} />
        <Stat label="Runs today" value={stats.runs.today} sub={`${stats.runs.week} this week`} />
        <Stat label="Success rate 7d" value={stats.runs.successRate == null ? "—" : `${stats.runs.successRate}%`} c={stats.runs.successRate != null && stats.runs.successRate < 80 ? AMBER : LIME} />
        <Stat label="Cost 7d" value={fmtUsd(stats.cost.week)} sub={`${fmtUsd(stats.cost.today)} today · ${fmtTok(stats.tokens.week)} tok`} />
        <Stat label="Scheduled" value={stats.schedules.enabled} sub={`${stats.schedules.total} total`} c={VIOLET} />
        {stats.attention > 0 && <Stat label="Needs attention" value={stats.attention} sub="see Inbox" c={RED} />}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16, alignItems: "start" }}>
        {/* org chart */}
        <Card>
          <SectionHead title="Org chart" kicker="the executive team" />
          <OrgChart agents={agents} />
        </Card>

        {/* 7-day activity */}
        <Card>
          <SectionHead title="Activity" kicker="runs · last 7 days" />
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke={LINE} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: ASH, fontSize: 11 }} stroke={LINE} />
                <Tooltip
                  cursor={{ fill: `${AMBER}14` }}
                  contentStyle={{ background: INK, border: `1px solid ${LINE}`, borderRadius: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}
                />
                <Bar dataKey="ok" stackId="a" fill={LIME} radius={[0, 0, 0, 0]} />
                <Bar dataKey="error" stackId="a" fill={RED} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
        {/* recent activity feed */}
        <Card>
          <SectionHead title="Recent activity" kicker="latest runs across the org" />
          {recent.length === 0 ? (
            <Empty>No runs yet.</Empty>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {recent.map((r) => (
                <div key={r.id} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "9px 0", borderBottom: `1px solid ${LINE}` }}>
                  <span style={{ width: 7, height: 7, borderRadius: 99, background: r.status === "ok" ? LIME : RED, flexShrink: 0, marginTop: 5 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ ...disp, fontSize: 13, fontWeight: 700, color: CHALK }}>
                      {r.agentName} <span style={{ color: ASH, fontWeight: 400 }}>· {r.agentRole}</span>
                      {r.delegations > 0 && <span style={{ color: VIOLET, fontSize: 11 }}> · {r.delegations} delegated</span>}
                    </div>
                    <Mono s={{ fontSize: 11, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} c={ASH}>{r.task}</Mono>
                  </div>
                  <Mono s={{ fontSize: 10, flexShrink: 0 }} c={ASH}>{ago(r.createdAt)}</Mono>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* upcoming scheduled work */}
        <Card>
          <SectionHead title="Upcoming work" kicker="next scheduled runs" />
          {upcoming.length === 0 ? (
            <Empty>Nothing scheduled.</Empty>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {upcoming.map((u) => (
                <div key={u.id} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "9px 0", borderBottom: `1px solid ${LINE}` }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ ...disp, fontSize: 13, fontWeight: 700, color: CHALK }}>
                      {u.agentName} <Chip c={VIOLET}>{u.cadence}</Chip>
                    </div>
                    <Mono s={{ fontSize: 11, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} c={ASH}>{u.task}</Mono>
                  </div>
                  <Mono s={{ fontSize: 10, flexShrink: 0 }} c={u.status === "active" ? BLUE : AMBER}>{u.status === "active" ? until(u.nextRunAt) : "paused"}</Mono>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function OrgChart({ agents }: { agents: AgentLite[] }) {
  const groups = useMemo(() => {
    const execs = agents.filter((a) => a.authority === "executive");
    const assigned = new Set<string>();
    const out = execs.map((e) => {
      assigned.add(e.id);
      const reports = agents.filter((a) => a.id !== e.id && (a.reportsTo ?? "").trim().toUpperCase() === e.role.trim().toUpperCase());
      reports.forEach((r) => assigned.add(r.id));
      return { head: e, reports };
    });
    const independents = agents.filter((a) => !assigned.has(a.id));
    return { out, independents };
  }, [agents]);

  if (agents.length === 0) return <Empty>No agents yet — create your team in “AI agents”.</Empty>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
      {groups.out.map((g) => (
        <div key={g.head.id} style={{ background: INK, border: `1px solid ${LINE}`, borderRadius: 12, padding: 12 }}>
          <Node a={g.head} head />
          {g.reports.length > 0 && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${LINE}`, display: "flex", flexDirection: "column", gap: 8 }}>
              {g.reports.map((r) => <Node key={r.id} a={r} />)}
            </div>
          )}
        </div>
      ))}
      {groups.independents.length > 0 && (
        <div style={{ background: INK, border: `1px solid ${LINE}`, borderRadius: 12, padding: 12 }}>
          <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".12em", display: "block", marginBottom: 8 }} c={ASH}>Independent</Mono>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {groups.independents.map((r) => <Node key={r.id} a={r} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function Node({ a, head }: { a: AgentLite; head?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <span style={{ width: 9, height: 9, borderRadius: 99, background: DOT[a.status] ?? ASH, flexShrink: 0, boxShadow: a.status === "active" ? `0 0 6px ${LIME}` : undefined }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ ...disp, fontWeight: head ? 800 : 600, fontSize: head ? 15 : 13, color: CHALK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {a.name}
        </div>
        <Mono s={{ fontSize: 10, display: "block" }} c={ASH}>
          {a.role} · {a.model.replace("claude-", "")}{a.runtime === "managed" ? " · 🧠" : ""}
        </Mono>
      </div>
    </div>
  );
}

// ---- Work ----------------------------------------------------------------

function Work({ data, onRan }: { data: Overview | null; onRan: () => void }) {
  const [agentId, setAgentId] = useState("");
  const [task, setTask] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ output: string; error?: boolean } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const active = (data?.agents ?? []).filter((a) => a.status === "active");
  const assignedName = active.find((a) => a.id === agentId)?.name ?? null;

  async function run() {
    if (!agentId || !task.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch(`/api/admin/agents/${agentId}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task: task.trim() }),
      });
      const d = await r.json();
      if (d.error || d.source === "unconfigured") setResult({ output: d.error ?? d.output, error: true });
      else setResult({ output: d.output ?? "(no output)" });
      onRan();
    } catch {
      setResult({ output: "request failed", error: true });
    }
    setBusy(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* drag-to-assign */}
      <Card>
        <SectionHead title="Drag to assign" kicker="drag an agent onto the dropzone, then add a task below" />
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "stretch" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: 1, minWidth: 220, alignContent: "flex-start" }}>
            {active.map((a) => (
              <div
                key={a.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/agent", a.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                title="Drag me onto the dropzone"
                style={{ ...cond, fontSize: 13, fontWeight: 700, padding: "8px 12px", borderRadius: 9, cursor: "grab", border: `1px solid ${agentId === a.id ? LIME : LINE}`, background: agentId === a.id ? `${LIME}1f` : INK2, color: agentId === a.id ? LIME : CHALK, display: "flex", alignItems: "center", gap: 7 }}
              >
                <span style={{ color: ASH }}>⠿</span>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: DOT[a.status] ?? ASH }} />
                {a.name}
              </div>
            ))}
            {active.length === 0 && <Mono s={{ fontSize: 12 }} c={AMBER}>No active agents — activate one in “AI agents”.</Mono>}
          </div>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/agent");
              if (id) setAgentId(id);
              setDragOver(false);
            }}
            style={{ flex: 1, minWidth: 220, border: `2px dashed ${dragOver ? LIME : LINE}`, borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: dragOver ? `${LIME}12` : "transparent", transition: "all .12s", minHeight: 88 }}
          >
            {assignedName ? (
              <Mono s={{ fontSize: 13, fontWeight: 700, textAlign: "center" }} c={LIME}>✓ {assignedName} assigned — add a task below</Mono>
            ) : (
              <Mono s={{ fontSize: 12, textAlign: "center" }} c={ASH}>Drop an agent here to assign work</Mono>
            )}
          </div>
        </div>
      </Card>

      {/* assign work */}
      <Card>
        <SectionHead title="Assign work" kicker="hand a task to an agent" />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Select value={agentId} onChange={(e) => setAgentId(e.target.value)} style={{ minWidth: 200 }}>
            <option value="">Select an active agent…</option>
            {active.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.role})</option>)}
          </Select>
          <input
            style={{ ...mono, flex: 1, minWidth: 220, fontSize: 13, padding: "8px 10px", borderRadius: 9, background: INK2, color: CHALK, border: `1px solid ${LINE}`, outline: "none" }}
            placeholder="Task, e.g. Summarize this week's priorities."
            value={task}
            onChange={(e) => setTask(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
          />
          <button
            disabled={busy || !agentId || !task.trim()}
            onClick={run}
            style={{ ...cond, fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".04em", padding: "8px 18px", borderRadius: 9, cursor: "pointer", border: `1px solid ${LIME}`, background: `${LIME}22`, color: LIME, opacity: busy || !agentId || !task.trim() ? 0.5 : 1 }}
          >
            {busy ? "Running…" : "Run"}
          </button>
        </div>
        {active.length === 0 && <Mono s={{ fontSize: 11, display: "block", marginTop: 8 }} c={AMBER}>No active agents — activate one in “AI agents” first.</Mono>}
        {result && (
          <div style={{ ...mono, marginTop: 12, fontSize: 13, lineHeight: 1.6, color: result.error ? AMBER : CHALK, background: INK, border: `1px solid ${LINE}`, borderRadius: 10, padding: 14, whiteSpace: "pre-wrap" }}>
            {result.output}
          </div>
        )}
        <Mono s={{ fontSize: 10, display: "block", marginTop: 8 }} c={ASH}>
          Tip: for the live streamed view + delegation trace, use the Run panel in “AI agents”.
        </Mono>
      </Card>

      {/* board */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
        <Card>
          <SectionHead title="Queued" kicker="scheduled, waiting to fire" />
          {!data || data.upcoming.length === 0 ? (
            <Empty>Nothing queued.</Empty>
          ) : (
            data.upcoming.map((u) => (
              <div key={u.id} style={{ padding: "9px 0", borderBottom: `1px solid ${LINE}` }}>
                <div style={{ ...disp, fontSize: 13, fontWeight: 700, color: CHALK }}>{u.agentName} <Chip c={VIOLET}>{u.cadence}</Chip></div>
                <Mono s={{ fontSize: 11, display: "block" }} c={ASH}>{u.task}</Mono>
                <Mono s={{ fontSize: 10 }} c={u.status === "active" ? BLUE : AMBER}>{u.status === "active" ? until(u.nextRunAt) : "agent paused"}</Mono>
              </div>
            ))
          )}
        </Card>
        <Card>
          <SectionHead title="Recent" kicker="completed runs" />
          {!data || data.recent.length === 0 ? (
            <Empty>No runs yet.</Empty>
          ) : (
            data.recent.slice(0, 8).map((r) => (
              <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "9px 0", borderBottom: `1px solid ${LINE}` }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: r.status === "ok" ? LIME : RED, flexShrink: 0, marginTop: 5 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ ...disp, fontSize: 13, fontWeight: 700, color: CHALK }}>{r.agentName}</div>
                  <Mono s={{ fontSize: 11, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} c={ASH}>{r.task}</Mono>
                </div>
                <Mono s={{ fontSize: 10, flexShrink: 0 }} c={ASH}>{ago(r.createdAt)}</Mono>
              </div>
            ))
          )}
        </Card>
      </div>
    </div>
  );
}

// ---- Scorecards ----------------------------------------------------------

function Scorecards({ data }: { data: Overview | null }) {
  if (!data) return <Mono s={{ display: "block", padding: 20 }} c={ASH}>Loading scorecards…</Mono>;
  if (data.scorecards.length === 0) return <Empty>No agents yet — create your team in “AI agents”.</Empty>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))", gap: 16 }}>
      {data.scorecards.map((s) => <ScorecardCard key={s.id} s={s} />)}
    </div>
  );
}

function ScorecardCard({ s }: { s: Scorecard }) {
  const sr = s.successRate;
  const srColor = sr == null ? ASH : sr >= 90 ? LIME : sr >= 70 ? AMBER : RED;
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
        <span style={{ width: 9, height: 9, borderRadius: 99, background: DOT[s.status] ?? ASH, flexShrink: 0 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ ...disp, fontWeight: 800, fontSize: 16, color: CHALK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
          <Mono s={{ fontSize: 10, display: "block" }} c={ASH}>{s.role} · {s.model.replace("claude-", "")}{s.runtime === "managed" ? " · 🧠" : ""}</Mono>
        </div>
        <Chip c={s.authority === "executive" ? VIOLET : ASH}>{s.authority}</Chip>
      </div>

      {/* success rate vs a 90% target */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em" }} c={ASH}>Success rate (7d)</Mono>
          <Mono s={{ fontSize: 11, fontWeight: 700 }} c={srColor}>{sr == null ? "no runs" : `${sr}%`}</Mono>
        </div>
        <div style={{ position: "relative", height: 7, borderRadius: 99, background: INK2, overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, width: `${sr ?? 0}%`, background: srColor, borderRadius: 99 }} />
          {/* 90% target marker */}
          <div style={{ position: "absolute", top: -2, bottom: -2, left: "90%", width: 2, background: CHALK, opacity: 0.5 }} title="target 90%" />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
        <Mini label="Runs 7d" value={String(s.runs7d)} />
        <Mini label="Cost 7d" value={fmtUsd(s.cost7d)} />
        <Mini label="Last run" value={s.lastRunAt ? ago(s.lastRunAt) : "—"} />
      </div>

      <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 6 }} c={AMBER}>KPI targets</Mono>
      {s.kpis.length === 0 ? (
        <Mono s={{ fontSize: 11, display: "block" }} c={ASH}>No KPIs set.</Mono>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {s.kpis.map((k, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
              <span style={{ ...disp, color: CHALK, fontWeight: 600 }}>{k.metric}</span>
              <Mono s={{ fontSize: 11, textAlign: "right", flexShrink: 0, maxWidth: "55%" }} c={ASH}>{k.target || "—"}</Mono>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: INK, border: `1px solid ${LINE}`, borderRadius: 9, padding: "8px 10px" }}>
      <Mono s={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".08em", display: "block" }} c={ASH}>{label}</Mono>
      <div style={{ ...disp, fontWeight: 800, fontSize: 16, color: CHALK, marginTop: 2 }}>{value}</div>
    </div>
  );
}

// ---- Inbox ---------------------------------------------------------------

function Inbox({ data }: { data: Overview | null }) {
  if (!data) return <Mono s={{ display: "block", padding: 20 }} c={ASH}>Loading inbox…</Mono>;
  const { failed, brokenSchedules } = data.attention;
  if (failed.length === 0 && brokenSchedules.length === 0)
    return (
      <Card>
        <Mono s={{ fontSize: 14, display: "block", textAlign: "center", padding: 28 }} c={LIME}>✓ All clear — nothing needs attention.</Mono>
      </Card>
    );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {failed.length > 0 && (
        <Card style={{ borderLeft: `3px solid ${RED}` }}>
          <SectionHead title="Failed runs" kicker={`${failed.length} need a look`} />
          {failed.map((r) => (
            <div key={r.id} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "9px 0", borderBottom: `1px solid ${LINE}` }}>
              <span style={{ width: 7, height: 7, borderRadius: 99, background: RED, flexShrink: 0, marginTop: 5 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ ...disp, fontSize: 13, fontWeight: 700, color: CHALK }}>{r.agentName} <span style={{ color: ASH, fontWeight: 400 }}>· {r.agentRole}</span> <Chip c={ASH}>{r.runtime}</Chip></div>
                <Mono s={{ fontSize: 11, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} c={ASH}>{r.task}</Mono>
              </div>
              <Mono s={{ fontSize: 10, flexShrink: 0 }} c={ASH}>{ago(r.createdAt)}</Mono>
            </div>
          ))}
          <Mono s={{ fontSize: 10, display: "block", marginTop: 8 }} c={ASH}>Full transcripts in the Reports tab.</Mono>
        </Card>
      )}
      {brokenSchedules.length > 0 && (
        <Card style={{ borderLeft: `3px solid ${AMBER}` }}>
          <SectionHead title="Schedules that can't fire" kicker="the agent isn't active" />
          {brokenSchedules.map((b) => (
            <div key={b.id} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "9px 0", borderBottom: `1px solid ${LINE}` }}>
              <span style={{ width: 7, height: 7, borderRadius: 99, background: AMBER, flexShrink: 0, marginTop: 5 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ ...disp, fontSize: 13, fontWeight: 700, color: CHALK }}>{b.agentName} <Chip c={VIOLET}>{b.cadence}</Chip> <Chip c={AMBER}>{b.reason}</Chip></div>
                <Mono s={{ fontSize: 11, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} c={ASH}>{b.task}</Mono>
              </div>
            </div>
          ))}
          <Mono s={{ fontSize: 10, display: "block", marginTop: 8 }} c={ASH}>Activate the agent (AI agents → status) so these fire.</Mono>
        </Card>
      )}
    </div>
  );
}

// ---- shared bits ---------------------------------------------------------

function SectionHead({ title, kicker }: { title: string; kicker?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {kicker && <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".12em", display: "block" }} c={AMBER}>{kicker}</Mono>}
      <div style={{ ...disp, fontWeight: 800, fontSize: 18, marginTop: 2 }}>{title}</div>
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <Mono s={{ fontSize: 12, display: "block", padding: "16px 0", textAlign: "center" }} c={ASH}>{children}</Mono>;
}
