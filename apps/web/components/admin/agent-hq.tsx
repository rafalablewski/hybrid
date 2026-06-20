"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { fs, space, INK, INK2, CARD, LINE, LIME, CHALK, ASH, AMBER, VIOLET, BLUE, RED, disp, cond, mono, Mono, Card, Chip, Stat, Select, txt } from "@/lib/ui";
import { useIsMobile } from "@/lib/use-media-query";
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
type Kpi = { metric: string; target: string; targetValue?: number | null };
type Actual = { value: number; at: string; history: number[] };
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
  actuals: Record<string, Actual>;
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
    pendingApprovals: number;
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
  { id: "approvals", label: "Approvals" },
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
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("command");

  const load = useCallback(() => {
    setErr(null);
    fetch("/api/admin/agents/overview")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setData(d))
      .catch(() => { setData(null); setErr("Couldn't load the operations center — try refreshing."); });
  }, []);
  useEffect(load, [load]);

  return (
    <div>
      <div style={{ display: "flex", gap: space.xs, marginBottom: 18, borderBottom: `1px solid ${LINE}`, overflowX: "auto" }}>
        {TABS.map((t) => {
          const badge = t.id === "inbox" ? data?.stats.attention ?? 0 : t.id === "approvals" ? data?.stats.pendingApprovals ?? 0 : 0;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                ...disp,
                fontSize: fs.bodyLg,
                fontWeight: 700,
                padding: "9px 16px",
                cursor: "pointer",
                border: "none",
                background: "transparent",
                color: txt(tab === t.id ? CHALK : ASH),
                borderBottom: `2px solid ${tab === t.id ? AMBER : "transparent"}`,
                marginBottom: -1,
                flexShrink: 0,
                whiteSpace: "nowrap",
              }}
            >
              {t.label}
              {badge > 0 && (
                <span style={{ ...mono, fontSize: fs.micro, fontWeight: 700, marginLeft: 6, padding: "3px 6px", borderRadius: 99, background: RED, color: "#fff" }}>{badge}</span>
              )}
            </button>
          );
        })}
        <button onClick={load} style={{ ...mono, marginLeft: "auto", fontSize: fs.body, color: txt(ASH), background: "transparent", border: "none", cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}>
          ↻ refresh
        </button>
      </div>

      {tab === "command" && <Command data={data} err={err} />}
      {tab === "scorecards" && <Scorecards data={data} onChange={load} />}
      {tab === "work" && <Work data={data} onRan={load} />}
      {tab === "approvals" && <Approvals onChange={load} />}
      {tab === "inbox" && <Inbox data={data} onChange={load} />}
      {tab === "reports" && <AdminAgentRuns />}
    </div>
  );
}

// ---- Command center ------------------------------------------------------

function Command({ data, err }: { data: Overview | null; err?: string | null }) {
  const isMobile = useIsMobile();
  if (err) return <Mono s={{ display: "block", padding: 20 }} c={RED}>{err}</Mono>;
  if (!data) return <Mono s={{ display: "block", padding: 20 }} c={ASH}>Loading the operations center…</Mono>;
  const { stats, agents, trend, recent, upcoming } = data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.lg }}>
      {/* metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: space.md }}>
        <Stat label="Active agents" value={stats.agents.active} sub={`${stats.agents.total} total · ${stats.agents.paused} paused`} c={LIME} />
        <Stat label="Runs today" value={stats.runs.today} sub={`${stats.runs.week} this week`} />
        <Stat label="Success rate 7d" value={stats.runs.successRate == null ? "—" : `${stats.runs.successRate}%`} c={stats.runs.successRate != null && stats.runs.successRate < 80 ? AMBER : LIME} />
        <Stat label="Cost 7d" value={fmtUsd(stats.cost.week)} sub={`${fmtUsd(stats.cost.today)} today · ${fmtTok(stats.tokens.week)} tok`} />
        <Stat label="Scheduled" value={stats.schedules.enabled} sub={`${stats.schedules.total} total`} c={VIOLET} />
        {stats.attention > 0 && <Stat label="Needs attention" value={stats.attention} sub="see Inbox" c={RED} />}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.4fr 1fr", gap: space.lg, alignItems: "start" }}>
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
                <XAxis dataKey="day" tick={{ fill: ASH, fontSize: fs.caption }} stroke={LINE} />
                <Tooltip
                  cursor={{ fill: `${AMBER}14` }}
                  contentStyle={{ background: INK, border: `1px solid ${LINE}`, borderRadius: "var(--r-field)", fontFamily: "'JetBrains Mono', monospace", fontSize: fs.body }}
                />
                <Bar dataKey="ok" stackId="a" fill={LIME} radius={[0, 0, 0, 0]} />
                <Bar dataKey="error" stackId="a" fill={RED} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: space.lg, alignItems: "start" }}>
        {/* recent activity feed */}
        <Card>
          <SectionHead title="Recent activity" kicker="latest runs across the org" />
          {recent.length === 0 ? (
            <Empty>No runs yet.</Empty>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {recent.map((r) => (
                <div key={r.id} style={{ display: "flex", gap: space.ms, alignItems: "baseline", padding: "9px 0", borderBottom: `1px solid ${LINE}` }}>
                  <span style={{ width: 7, height: 7, borderRadius: 99, background: r.status === "ok" ? LIME : RED, flexShrink: 0, marginTop: 5 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ ...disp, fontSize: fs.bodyLg, fontWeight: 700, color: CHALK }}>
                      {r.agentName} <span style={{ color: txt(ASH), fontWeight: 400 }}>· {r.agentRole}</span>
                      {r.delegations > 0 && <span style={{ color: txt(VIOLET), fontSize: fs.caption }}> · {r.delegations} delegated</span>}
                    </div>
                    <Mono s={{ fontSize: fs.caption, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} c={ASH}>{r.task}</Mono>
                  </div>
                  <Mono s={{ fontSize: fs.micro, flexShrink: 0 }} c={ASH}>{ago(r.createdAt)}</Mono>
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
                <div key={u.id} style={{ display: "flex", gap: space.ms, alignItems: "baseline", padding: "9px 0", borderBottom: `1px solid ${LINE}` }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ ...disp, fontSize: fs.bodyLg, fontWeight: 700, color: CHALK }}>
                      {u.agentName} <Chip c={VIOLET}>{u.cadence}</Chip>
                    </div>
                    <Mono s={{ fontSize: fs.caption, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} c={ASH}>{u.task}</Mono>
                  </div>
                  <Mono s={{ fontSize: fs.micro, flexShrink: 0 }} c={u.status === "active" ? BLUE : AMBER}>{u.status === "active" ? until(u.nextRunAt) : "paused"}</Mono>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: space.lg }}>
        <DigestCard />
        <MonthlyCostCard />
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
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: space.md }}>
      {groups.out.map((g) => (
        <div key={g.head.id} style={{ background: INK, border: `1px solid ${LINE}`, borderRadius: "var(--r-card)", padding: 12 }}>
          <Node a={g.head} head />
          {g.reports.length > 0 && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${LINE}`, display: "flex", flexDirection: "column", gap: space.sm }}>
              {g.reports.map((r) => <Node key={r.id} a={r} />)}
            </div>
          )}
        </div>
      ))}
      {groups.independents.length > 0 && (
        <div style={{ background: INK, border: `1px solid ${LINE}`, borderRadius: "var(--r-card)", padding: 12 }}>
          <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", display: "block", marginBottom: 8 }} c={ASH}>Independent</Mono>
          <div style={{ display: "flex", flexDirection: "column", gap: space.sm }}>
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
        <div style={{ ...disp, fontWeight: head ? 800 : 600, fontSize: head ? 15 : 14, color: CHALK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {a.name}
        </div>
        <Mono s={{ fontSize: fs.micro, display: "block" }} c={ASH}>
          {a.role} · {a.model.replace("claude-", "")}{a.runtime === "managed" ? " · 🧠" : ""}
        </Mono>
      </div>
    </div>
  );
}

// ---- Work ----------------------------------------------------------------

function Work({ data, onRan }: { data: Overview | null; onRan: () => void }) {
  const isMobile = useIsMobile();
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
      else if (d.pending) setResult({ output: `⏳ Queued for a second operator's approval${d.estimate != null ? ` (est $${d.estimate.toFixed(2)})` : ""} — see the Approvals tab.` });
      else setResult({ output: d.output ?? "(no output)" });
      onRan();
    } catch {
      setResult({ output: "request failed", error: true });
    }
    setBusy(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.lg }}>
      {/* drag-to-assign */}
      <Card>
        <SectionHead title="Drag to assign" kicker="drag an agent onto the dropzone, then add a task below" />
        <div style={{ display: "flex", gap: space.lg, flexWrap: "wrap", alignItems: "stretch" }}>
          <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap", flex: 1, minWidth: 220, alignContent: "flex-start" }}>
            {active.map((a) => (
              <div
                key={a.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/agent", a.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                title="Drag me onto the dropzone"
                style={{ ...cond, fontSize: fs.bodyLg, fontWeight: 700, padding: "10px 12px", borderRadius: "var(--r-field)", cursor: "grab", border: `1px solid ${agentId === a.id ? LIME : LINE}`, background: agentId === a.id ? `${LIME}1f` : INK2, color: txt(agentId === a.id ? LIME : CHALK), display: "flex", alignItems: "center", gap: 7 }}
              >
                <span style={{ color: txt(ASH) }}>⠿</span>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: DOT[a.status] ?? ASH }} />
                {a.name}
              </div>
            ))}
            {active.length === 0 && <Mono s={{ fontSize: fs.body }} c={AMBER}>No active agents — activate one in “AI agents”.</Mono>}
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
            style={{ flex: 1, minWidth: 220, border: `2px dashed ${dragOver ? LIME : LINE}`, borderRadius: "var(--r-card)", padding: 20, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: dragOver ? `${LIME}12` : "transparent", transition: "all .12s", minHeight: 88 }}
          >
            {assignedName ? (
              <Mono s={{ fontSize: fs.bodyLg, fontWeight: 700, textAlign: "center" }} c={LIME}>✓ {assignedName} assigned — add a task below</Mono>
            ) : (
              <Mono s={{ fontSize: fs.body, textAlign: "center" }} c={ASH}>Drop an agent here to assign work</Mono>
            )}
          </div>
        </div>
      </Card>

      {/* assign work */}
      <Card>
        <SectionHead title="Assign work" kicker="hand a task to an agent" />
        <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap" }}>
          <Select value={agentId} onChange={(e) => setAgentId(e.target.value)} style={{ minWidth: 200 }}>
            <option value="">Select an active agent…</option>
            {active.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.role})</option>)}
          </Select>
          <input
            style={{ ...mono, flex: 1, minWidth: 220, fontSize: fs.bodyLg, padding: "10px 10px", borderRadius: "var(--r-field)", background: INK2, color: CHALK, border: `1px solid ${LINE}`, outline: "none" }}
            placeholder="Task, e.g. Summarize this week's priorities."
            value={task}
            onChange={(e) => setTask(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
          />
          <button
            disabled={busy || !agentId || !task.trim()}
            onClick={run}
            style={{ ...cond, fontSize: fs.bodyLg, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".04em", padding: "10px 18px", borderRadius: "var(--r-field)", cursor: "pointer", border: `1px solid ${LIME}`, background: `${LIME}22`, color: txt(LIME), opacity: busy || !agentId || !task.trim() ? 0.5 : 1 }}
          >
            {busy ? "Running…" : "Run"}
          </button>
        </div>
        {active.length === 0 && <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 8 }} c={AMBER}>No active agents — activate one in “AI agents” first.</Mono>}
        {result && (
          <div style={{ ...mono, marginTop: 12, fontSize: fs.bodyLg, lineHeight: 1.6, color: txt(result.error ? AMBER : CHALK), background: INK, border: `1px solid ${LINE}`, borderRadius: "var(--r-card)", padding: 14, whiteSpace: "pre-wrap" }}>
            {result.output}
          </div>
        )}
        <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 8 }} c={ASH}>
          Tip: for the live streamed view + delegation trace, use the Run panel in “AI agents”.
        </Mono>
      </Card>

      {/* board */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: space.lg, alignItems: "start" }}>
        <Card>
          <SectionHead title="Queued" kicker="scheduled, waiting to fire" />
          {!data || data.upcoming.length === 0 ? (
            <Empty>Nothing queued.</Empty>
          ) : (
            data.upcoming.map((u) => (
              <div key={u.id} style={{ padding: "9px 0", borderBottom: `1px solid ${LINE}` }}>
                <div style={{ ...disp, fontSize: fs.bodyLg, fontWeight: 700, color: CHALK }}>{u.agentName} <Chip c={VIOLET}>{u.cadence}</Chip></div>
                <Mono s={{ fontSize: fs.caption, display: "block" }} c={ASH}>{u.task}</Mono>
                <Mono s={{ fontSize: fs.micro }} c={u.status === "active" ? BLUE : AMBER}>{u.status === "active" ? until(u.nextRunAt) : "agent paused"}</Mono>
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
              <div key={r.id} style={{ display: "flex", gap: space.sm, alignItems: "baseline", padding: "9px 0", borderBottom: `1px solid ${LINE}` }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: r.status === "ok" ? LIME : RED, flexShrink: 0, marginTop: 5 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ ...disp, fontSize: fs.bodyLg, fontWeight: 700, color: CHALK }}>{r.agentName}</div>
                  <Mono s={{ fontSize: fs.caption, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} c={ASH}>{r.task}</Mono>
                </div>
                <Mono s={{ fontSize: fs.micro, flexShrink: 0 }} c={ASH}>{ago(r.createdAt)}</Mono>
              </div>
            ))
          )}
        </Card>
      </div>
    </div>
  );
}

// ---- Scorecards ----------------------------------------------------------

function Scorecards({ data, onChange }: { data: Overview | null; onChange: () => void }) {
  if (!data) return <Mono s={{ display: "block", padding: 20 }} c={ASH}>Loading scorecards…</Mono>;
  if (data.scorecards.length === 0) return <Empty>No agents yet — create your team in “AI agents”.</Empty>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))", gap: space.lg }}>
      {data.scorecards.map((s) => <ScorecardCard key={s.id} s={s} onChange={onChange} />)}
    </div>
  );
}

function ScorecardCard({ s, onChange }: { s: Scorecard; onChange: () => void }) {
  const sr = s.successRate;
  const srColor = sr == null ? ASH : sr >= 90 ? LIME : sr >= 70 ? AMBER : RED;
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
        <span style={{ width: 9, height: 9, borderRadius: 99, background: DOT[s.status] ?? ASH, flexShrink: 0 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ ...disp, fontWeight: 800, fontSize: fs.subtitle, color: CHALK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
          <Mono s={{ fontSize: fs.micro, display: "block" }} c={ASH}>{s.role} · {s.model.replace("claude-", "")}{s.runtime === "managed" ? " · 🧠" : ""}</Mono>
        </div>
        <Chip c={s.authority === "executive" ? VIOLET : ASH}>{s.authority}</Chip>
      </div>

      {/* success rate vs a 90% target */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={ASH}>Success rate (7d)</Mono>
          <Mono s={{ fontSize: fs.caption, fontWeight: 700 }} c={srColor}>{sr == null ? "no runs" : `${sr}%`}</Mono>
        </div>
        <div style={{ position: "relative", height: 7, borderRadius: 99, background: INK2, overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, width: `${sr ?? 0}%`, background: srColor, borderRadius: 99 }} />
          {/* 90% target marker */}
          <div style={{ position: "absolute", top: -2, bottom: -2, left: "90%", width: 2, background: CHALK, opacity: 0.5 }} title="target 90%" />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: space.sm, marginBottom: 12 }}>
        <Mini label="Runs 7d" value={String(s.runs7d)} />
        <Mini label="Cost 7d" value={fmtUsd(s.cost7d)} />
        <Mini label="Last run" value={s.lastRunAt ? ago(s.lastRunAt) : "—"} />
      </div>

      <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 6 }} c={AMBER}>KPIs — target vs actual</Mono>
      {s.kpis.length === 0 ? (
        <Mono s={{ fontSize: fs.caption, display: "block" }} c={ASH}>No KPIs set.</Mono>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: space.ms }}>
          {s.kpis.map((k, i) => <KpiRow key={i} agentId={s.id} k={k} actual={s.actuals[k.metric]} onLogged={onChange} />)}
        </div>
      )}
    </Card>
  );
}

function KpiRow({ agentId, k, actual, onLogged }: { agentId: string; k: Kpi; actual?: Actual; onLogged: () => void }) {
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [series, setSeries] = useState<{ t: string; value: number }[] | null>(null);

  const loadSeries = useCallback(() => {
    fetch(`/api/admin/agents/${agentId}/kpis`)
      .then((r) => r.json())
      .then((d) => {
        const ms = (d.measurements ?? []) as { metric: string; value: number; createdAt: string }[];
        setSeries(
          ms
            .filter((m) => m.metric === k.metric)
            .map((m) => ({ t: new Date(m.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }), value: m.value }))
            .reverse(), // API is newest-first → chart oldest→newest
        );
      })
      .catch(() => setSeries([]));
  }, [agentId, k.metric]);

  function toggleChart() {
    const next = !open;
    setOpen(next);
    if (next && series === null) loadSeries();
  }

  async function log() {
    const n = Number(val);
    if (val === "" || Number.isNaN(n)) return;
    setBusy(true);
    await fetch(`/api/admin/agents/${agentId}/kpis`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ metric: k.metric, value: n }),
    });
    setBusy(false);
    setVal("");
    onLogged();
    if (open) loadSeries();
  }

  const target = k.targetValue ?? null;
  const pct = target != null && target !== 0 && actual ? Math.round((actual.value / target) * 100) : null;
  const onTarget = pct != null && pct >= 100;
  const targetLabel = k.target.trim() || (target != null ? String(target) : "—");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: space.sm, alignItems: "baseline" }}>
        <span style={{ ...disp, color: CHALK, fontWeight: 700, fontSize: fs.bodyLg }}>{k.metric}</span>
        <span style={{ display: "flex", gap: space.sm, alignItems: "baseline", flexShrink: 0 }}>
          <Mono s={{ fontSize: fs.caption }} c={ASH}>target {targetLabel}</Mono>
          <button onClick={toggleChart} title="Trend over time" style={{ background: "transparent", border: "none", cursor: "pointer", color: txt(open ? LIME : ASH), fontSize: fs.body, padding: 0 }}>📈</button>
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: space.sm, alignItems: "baseline", marginTop: 2 }}>
        <Mono s={{ fontSize: fs.body }} c={actual ? (target != null ? (onTarget ? LIME : AMBER) : CHALK) : ASH}>
          {actual ? `actual ${actual.value}${pct != null ? ` · ${pct}% of target` : ""}` : "no actual logged"}
        </Mono>
        {actual && actual.history.length > 1 && <Spark values={[...actual.history].reverse()} up={onTarget} />}
      </div>
      {target != null && actual && (
        <div style={{ height: 5, borderRadius: 99, background: INK2, marginTop: 5, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.min(100, Math.max(0, pct ?? 0))}%`, background: onTarget ? LIME : AMBER, borderRadius: 99 }} />
        </div>
      )}
      <div style={{ display: "flex", gap: space.xs, marginTop: 6 }}>
        <input
          type="number"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && log()}
          placeholder="log actual…"
          style={{ ...mono, fontSize: fs.body, flex: 1, padding: "7px 8px", borderRadius: "var(--r-field)", background: INK2, color: CHALK, border: `1px solid ${LINE}`, outline: "none" }}
        />
        <button
          disabled={busy || val === ""}
          onClick={log}
          style={{ ...cond, fontSize: fs.caption, fontWeight: 700, textTransform: "uppercase", padding: "7px 10px", borderRadius: "var(--r-field)", cursor: "pointer", border: `1px solid ${LINE}`, background: INK2, color: txt(val === "" ? ASH : LIME), opacity: busy ? 0.5 : 1 }}
        >
          log
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 8 }}>
          {series === null ? (
            <Mono s={{ fontSize: fs.caption, display: "block" }} c={ASH}>Loading trend…</Mono>
          ) : series.length === 0 ? (
            <Mono s={{ fontSize: fs.caption, display: "block" }} c={ASH}>No actuals logged yet.</Mono>
          ) : (
            <div style={{ height: 150 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 6, right: 8, left: -22, bottom: 0 }}>
                  <CartesianGrid stroke={LINE} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="t" tick={{ fill: ASH, fontSize: fs.micro }} stroke={LINE} />
                  <YAxis tick={{ fill: ASH, fontSize: fs.micro }} stroke={LINE} width={40} />
                  <Tooltip contentStyle={{ background: INK, border: `1px solid ${LINE}`, borderRadius: "var(--r-field)", fontFamily: "'JetBrains Mono', monospace", fontSize: fs.body }} />
                  {target != null && <ReferenceLine y={target} stroke={ASH} strokeDasharray="4 4" label={{ value: `target ${target}`, fill: ASH, fontSize: fs.micro, position: "insideTopRight" }} />}
                  <Line type="monotone" dataKey="value" stroke={LIME} strokeWidth={2} dot={{ r: 3, fill: LIME }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Spark({ values, up }: { values: number[]; up: boolean }) {
  const max = Math.max(...values, 1);
  return (
    <span style={{ display: "inline-flex", alignItems: "flex-end", gap: 2, height: 16 }}>
      {values.map((v, i) => (
        <span key={i} style={{ width: 3, height: Math.max(2, (v / max) * 16), background: up ? LIME : AMBER, borderRadius: 1, opacity: 0.4 + 0.6 * ((i + 1) / values.length) }} />
      ))}
    </span>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: INK, border: `1px solid ${LINE}`, borderRadius: "var(--r-field)", padding: "10px 10px" }}>
      <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".08em", display: "block" }} c={ASH}>{label}</Mono>
      <div style={{ ...disp, fontWeight: 800, fontSize: fs.subtitle, color: CHALK, marginTop: 2 }}>{value}</div>
    </div>
  );
}

// ---- Approvals -----------------------------------------------------------

type Approval = { id: string; agentName: string; task: string; estimateUsd: number; runtime: string; requestedByEmail: string | null; createdAt: string };

function Approvals({ onChange }: { onChange: () => void }) {
  const [items, setItems] = useState<Approval[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    fetch("/api/admin/approvals")
      .then((r) => r.json())
      .then((d) => setItems(d.approvals ?? []))
      .catch(() => setItems([]));
  }, []);
  useEffect(load, [load]);

  async function decide(id: string, decision: "approve" | "deny") {
    setBusy(id);
    setErr("");
    const r = await fetch(`/api/admin/approvals/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (d.error) setErr(d.error);
    load();
    onChange();
  }

  if (items === null) return <Mono s={{ display: "block", padding: 20 }} c={ASH}>Loading approvals…</Mono>;
  if (items.length === 0)
    return (
      <Card>
        <Mono s={{ fontSize: fs.bodyLg, display: "block", textAlign: "center", padding: 28 }} c={LIME}>✓ No runs awaiting approval.</Mono>
      </Card>
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.ms }}>
      <Mono s={{ fontSize: fs.caption, display: "block" }} c={ASH}>
        {items.length} run(s) held for a second operator. You can&apos;t approve your own request.
      </Mono>
      {err && <Mono s={{ fontSize: fs.body, display: "block" }} c={RED}>{err}</Mono>}
      {items.map((a) => (
        <Card key={a.id} style={{ borderLeft: `3px solid ${AMBER}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: space.md, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ ...disp, fontSize: fs.note, fontWeight: 800, color: CHALK }}>
                {a.agentName} <Chip c={ASH}>{a.runtime}</Chip>{a.estimateUsd > 0 && <Chip c={VIOLET}>est ${a.estimateUsd.toFixed(2)}</Chip>}
              </div>
              <Mono s={{ fontSize: fs.body, display: "block", marginTop: 2, whiteSpace: "pre-wrap" }} c={ASH}>{a.task}</Mono>
              <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 4 }} c={ASH}>requested by {a.requestedByEmail ?? "—"} · {ago(a.createdAt)}</Mono>
            </div>
            <div style={{ display: "flex", gap: space.sm, flexShrink: 0 }}>
              <button disabled={busy === a.id} onClick={() => decide(a.id, "approve")} style={{ ...cond, fontSize: fs.body, fontWeight: 800, textTransform: "uppercase", padding: "10px 14px", borderRadius: "var(--r-field)", cursor: "pointer", border: `1px solid ${LIME}`, background: `${LIME}22`, color: txt(LIME), opacity: busy === a.id ? 0.5 : 1 }}>
                Approve &amp; run
              </button>
              <button disabled={busy === a.id} onClick={() => decide(a.id, "deny")} style={{ ...cond, fontSize: fs.body, fontWeight: 700, textTransform: "uppercase", padding: "10px 14px", borderRadius: "var(--r-field)", cursor: "pointer", border: `1px solid ${LINE}`, background: "transparent", color: txt(ASH) }}>
                Deny
              </button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ---- Daily digest --------------------------------------------------------

function DigestCard() {
  const [d, setD] = useState<{ text: string; slackConfigured: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/agents/digest")
      .then((r) => r.json())
      .then((j) => setD({ text: j.text ?? "", slackConfigured: Boolean(j.slackConfigured) }))
      .catch(() => setD(null));
  }, []);

  async function send() {
    setBusy(true);
    setSent(null);
    const r = await fetch("/api/admin/agents/digest", { method: "POST" });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    setSent(j.sent ? "Sent to Slack ✓" : j.reason || j.error || "not sent");
  }

  return (
    <Card span={2}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <SectionHead title="Daily digest" kicker="last 24h · auto-posts to Slack via cron" />
        <button disabled={busy} onClick={send} style={{ ...cond, fontSize: fs.body, fontWeight: 700, textTransform: "uppercase", padding: "9px 14px", borderRadius: "var(--r-field)", cursor: "pointer", border: `1px solid ${LINE}`, background: INK2, color: CHALK }}>
          {busy ? "Sending…" : "Send to Slack now"}
        </button>
      </div>
      <pre style={{ ...mono, fontSize: fs.body, lineHeight: 1.55, color: CHALK, background: INK, border: `1px solid ${LINE}`, borderRadius: "var(--r-card)", padding: 14, margin: "4px 0 0", whiteSpace: "pre-wrap" }}>
        {d ? d.text : "Loading…"}
      </pre>
      <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 8 }} c={sent ? LIME : ASH}>
        {sent ?? (d && !d.slackConfigured ? "Set SLACK_WEBHOOK_URL in the server env to enable delivery." : "Posts daily at 08:05 UTC (apps/web/vercel.json).")}
      </Mono>
    </Card>
  );
}

// ---- Monthly cost --------------------------------------------------------

type MonthRep = { month: string; total: number; runs: number; perAgent: { name: string; runs: number; cost: number }[] };

function MonthlyCostCard() {
  const [d, setD] = useState<{ current: MonthRep; previous: MonthRep } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/agents/cost-report")
      .then((r) => r.json())
      .then((j) => setD(j.current ? j : null))
      .catch(() => setD(null));
  }, []);

  async function send() {
    setBusy(true);
    setSent(null);
    const r = await fetch("/api/admin/agents/cost-report", { method: "POST" });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    setSent(j.sent ? "Sent to Slack ✓" : j.reason || j.error || "not sent");
  }

  const csv = (month: string) => `/api/admin/agents/cost-report?month=${month}&format=csv`;
  const link: React.CSSProperties = { ...mono, fontSize: fs.caption, color: txt(ASH), border: `1px solid ${LINE}`, borderRadius: "var(--r-field)", padding: "6px 9px", textDecoration: "none" };

  return (
    <Card span={2}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <SectionHead title="Monthly cost" kicker="real agent spend · auto-reports on the 1st" />
        <button disabled={busy} onClick={send} style={{ ...cond, fontSize: fs.body, fontWeight: 700, textTransform: "uppercase", padding: "9px 14px", borderRadius: "var(--r-field)", cursor: "pointer", border: `1px solid ${LINE}`, background: INK2, color: CHALK }}>
          {busy ? "Sending…" : "Send to Slack"}
        </button>
      </div>
      {!d ? (
        <Mono s={{ fontSize: fs.body, display: "block" }} c={ASH}>Loading…</Mono>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: space.md }}>
          {[d.current, d.previous].map((m, i) => (
            <div key={m.month} style={{ background: INK, border: `1px solid ${LINE}`, borderRadius: "var(--r-card)", padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={i === 0 ? AMBER : ASH}>{m.month}{i === 0 ? " · MTD" : ""}</Mono>
                <a href={csv(m.month)} style={link}>⬇ CSV</a>
              </div>
              <div style={{ ...disp, fontWeight: 800, fontSize: fs.display, color: CHALK, margin: "4px 0" }}>{fmtUsd(m.total)}</div>
              <Mono s={{ fontSize: fs.micro, display: "block" }} c={ASH}>{m.runs} runs</Mono>
              {m.perAgent.slice(0, 4).map((p) => (
                <div key={p.name} style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: fs.caption }}>
                  <span style={{ ...mono, color: txt(ASH), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                  <Mono s={{ fontSize: fs.caption, flexShrink: 0 }} c={CHALK}>{fmtUsd(p.cost)}</Mono>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      {sent && <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 8 }} c={LIME}>{sent}</Mono>}
    </Card>
  );
}

// ---- Inbox ---------------------------------------------------------------

type Notif = { id: string; kind: string; agentName: string | null; title: string; body: string | null; severity: string; read: boolean; createdAt: string };

function Inbox({ data, onChange }: { data: Overview | null; onChange: () => void }) {
  const [notifs, setNotifs] = useState<Notif[] | null>(null);
  const [busy, setBusy] = useState(false);

  const loadNotifs = useCallback(() => {
    fetch("/api/admin/notifications")
      .then((r) => r.json())
      .then((d) => setNotifs(d.notifications ?? []))
      .catch(() => setNotifs([]));
  }, []);
  useEffect(loadNotifs, [loadNotifs]);

  async function markRead(id?: string) {
    setBusy(true);
    await fetch("/api/admin/notifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(id ? { id } : { all: true }),
    });
    setBusy(false);
    loadNotifs();
    onChange(); // refresh the HQ badge
  }

  const brokenSchedules = data?.attention.brokenSchedules ?? [];
  const list = notifs ?? [];
  const unread = list.filter((n) => !n.read).length;
  const sevColor = (s: string) => (s === "error" ? RED : s === "info" ? BLUE : AMBER);

  if (notifs !== null && list.length === 0 && brokenSchedules.length === 0)
    return (
      <Card>
        <Mono s={{ fontSize: fs.bodyLg, display: "block", textAlign: "center", padding: 28 }} c={LIME}>✓ All clear — nothing needs attention.</Mono>
      </Card>
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.lg }}>
      {list.length > 0 && (
        <Card style={{ borderLeft: `3px solid ${RED}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <SectionHead title="Notifications" kicker={`${unread} unread · ${list.length} recent`} />
            {unread > 0 && (
              <button disabled={busy} onClick={() => markRead()} style={{ ...cond, fontSize: fs.caption, fontWeight: 700, textTransform: "uppercase", padding: "8px 12px", borderRadius: "var(--r-field)", cursor: "pointer", border: `1px solid ${LINE}`, background: INK2, color: txt(ASH) }}>
                Mark all read
              </button>
            )}
          </div>
          {list.map((n) => (
            <div key={n.id} style={{ display: "flex", gap: space.ms, alignItems: "baseline", padding: "9px 0", borderBottom: `1px solid ${LINE}`, opacity: n.read ? 0.5 : 1 }}>
              <span style={{ width: 7, height: 7, borderRadius: 99, background: sevColor(n.severity), flexShrink: 0, marginTop: 5 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ ...disp, fontSize: fs.bodyLg, fontWeight: 700, color: CHALK }}>{n.title}</div>
                {n.body && <Mono s={{ fontSize: fs.caption, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} c={ASH}>{n.body}</Mono>}
              </div>
              <Mono s={{ fontSize: fs.micro, flexShrink: 0 }} c={ASH}>{ago(n.createdAt)}</Mono>
              {!n.read && (
                <button disabled={busy} onClick={() => markRead(n.id)} title="Dismiss" style={{ ...mono, fontSize: fs.bodyLg, lineHeight: 1, background: "transparent", border: "none", color: txt(ASH), cursor: "pointer", flexShrink: 0 }}>
                  ✕
                </button>
              )}
            </div>
          ))}
          <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 8 }} c={ASH}>Full transcripts in the Reports tab.</Mono>
        </Card>
      )}
      {brokenSchedules.length > 0 && (
        <Card style={{ borderLeft: `3px solid ${AMBER}` }}>
          <SectionHead title="Schedules that can't fire" kicker="the agent isn't active" />
          {brokenSchedules.map((b) => (
            <div key={b.id} style={{ display: "flex", gap: space.ms, alignItems: "baseline", padding: "9px 0", borderBottom: `1px solid ${LINE}` }}>
              <span style={{ width: 7, height: 7, borderRadius: 99, background: AMBER, flexShrink: 0, marginTop: 5 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ ...disp, fontSize: fs.bodyLg, fontWeight: 700, color: CHALK }}>{b.agentName} <Chip c={VIOLET}>{b.cadence}</Chip> <Chip c={AMBER}>{b.reason}</Chip></div>
                <Mono s={{ fontSize: fs.caption, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} c={ASH}>{b.task}</Mono>
              </div>
            </div>
          ))}
          <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 8 }} c={ASH}>Activate the agent (AI agents → status) so these fire.</Mono>
        </Card>
      )}
    </div>
  );
}

// ---- shared bits ---------------------------------------------------------

function SectionHead({ title, kicker }: { title: string; kicker?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {kicker && <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", display: "block" }} c={AMBER}>{kicker}</Mono>}
      <div style={{ ...disp, fontWeight: 800, fontSize: fs.title, marginTop: 2 }}>{title}</div>
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <Mono s={{ fontSize: fs.body, display: "block", padding: "16px 0", textAlign: "center" }} c={ASH}>{children}</Mono>;
}
