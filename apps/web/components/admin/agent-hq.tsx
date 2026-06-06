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
  agentName: string;
  agentRole: string;
  status: string;
  runtime: string;
  task: string;
  delegations: number;
  inputTokens: number;
  outputTokens: number;
  createdAt: string;
};
type Upcoming = { id: string; agentName: string; role: string; status: string; task: string; cadence: string; nextRunAt: string | null };
type Overview = {
  agents: AgentLite[];
  stats: {
    agents: { total: number; active: number; paused: number; draft: number };
    runs: { today: number; week: number; successRate: number | null };
    tokens: { today: number; week: number };
    schedules: { total: number; enabled: number };
  };
  trend: { day: string; ok: number; error: number }[];
  recent: RunLite[];
  upcoming: Upcoming[];
};

const DOT: Record<string, string> = { active: LIME, paused: AMBER, draft: ASH };
const TABS = [
  { id: "command", label: "Command center" },
  { id: "work", label: "Work" },
  { id: "reports", label: "Reports" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function fmtTok(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
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
        {TABS.map((t) => (
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
          </button>
        ))}
        <button onClick={load} style={{ ...mono, marginLeft: "auto", fontSize: 12, color: ASH, background: "transparent", border: "none", cursor: "pointer" }}>
          ↻ refresh
        </button>
      </div>

      {tab === "command" && <Command data={data} />}
      {tab === "work" && <Work data={data} onRan={load} />}
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
        <Stat label="Tokens 7d" value={fmtTok(stats.tokens.week)} sub={`${fmtTok(stats.tokens.today)} today`} />
        <Stat label="Scheduled" value={stats.schedules.enabled} sub={`${stats.schedules.total} total`} c={VIOLET} />
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

  const active = (data?.agents ?? []).filter((a) => a.status === "active");

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
