import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { ago, until } from "@hybrid/core";
import { adminGet, adminSend } from "../../lib/admin-api";
import { fs, space, Card, Mono, Kicker, Loading, F } from "../../lib/ui";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { Stat, ErrorNote, Segmented, PillBtn } from "./_kit";

// Mobile "Agent HQ" command center — parity with apps/web/components/admin/
// agent-hq.tsx (+ agent-runs.tsx as the Reports tab). recharts is web-only, so
// the 7-day activity / cost data render as compact bar-rows / Stat tiles. Tabs
// via <Segmented/>. Mutations mirror the web optimistic+resync flow.

// ---- types (mirror the web overview/route shapes) ------------------------

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

const TABS = [
  { value: "command", label: "Command" },
  { value: "scorecards", label: "Scorecards" },
  { value: "approvals", label: "Approvals" },
  { value: "inbox", label: "Inbox" },
  { value: "digest", label: "Digest" },
  { value: "cost", label: "Cost" },
  { value: "reports", label: "Reports" },
] as const;
type TabId = (typeof TABS)[number]["value"];

// ---- formatting ----------------------------------------------------------

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
const DOT = (p: Palette): Record<string, string> => ({ active: p.lime, paused: p.amber, draft: p.ash });

// ---- root ----------------------------------------------------------------

export default function AdminAgentHQ() {
  const { palette } = useTheme();
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("command");

  const load = useCallback(async () => {
    setErr(null);
    const r = await adminGet<Overview>("/api/admin/agents/overview");
    if (r.ok && r.data) setData(r.data);
    else {
      setData(null);
      setErr("Couldn't load the operations center — try refreshing.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View>
      <Segmented options={TABS.map((t) => ({ value: t.value, label: tabLabel(t, data) }))} value={tab} onChange={(v) => setTab(v as TabId)} />
      <Pressable onPress={load} style={{ alignSelf: "flex-end", marginBottom: 8 }} hitSlop={8}>
        <Mono color={palette.ash}>↻ refresh</Mono>
      </Pressable>

      {tab === "command" && <Command data={data} err={err} />}
      {tab === "scorecards" && <Scorecards data={data} onChange={load} />}
      {tab === "approvals" && <Approvals onChange={load} />}
      {tab === "inbox" && <Inbox data={data} onChange={load} />}
      {tab === "digest" && <DigestTab />}
      {tab === "cost" && <CostTab />}
      {tab === "reports" && <Reports />}
    </View>
  );
}

function tabLabel(t: (typeof TABS)[number], data: Overview | null): string {
  if (t.value === "inbox" && data?.stats.attention) return `${t.label} (${data.stats.attention})`;
  if (t.value === "approvals" && data?.stats.pendingApprovals) return `${t.label} (${data.stats.pendingApprovals})`;
  return t.label;
}

// ---- Command center ------------------------------------------------------

function Command({ data, err }: { data: Overview | null; err: string | null }) {
  const { palette } = useTheme();
  if (err) return <ErrorNote error={err} />;
  if (!data) return <Loading />;
  const { stats, agents, trend, recent, upcoming } = data;

  return (
    <View>
      <Row2>
        <Stat label="Active agents" value={stats.agents.active} sub={`${stats.agents.total} total – ${stats.agents.paused} paused`} color={palette.lime} />
        <Stat label="Runs today" value={stats.runs.today} sub={`${stats.runs.week} this week`} />
      </Row2>
      <Row2>
        <Stat
          label="Success rate 7d"
          value={stats.runs.successRate == null ? "—" : `${stats.runs.successRate}%`}
          color={stats.runs.successRate != null && stats.runs.successRate < 80 ? palette.amber : palette.lime}
        />
        <Stat label="Cost 7d" value={fmtUsd(stats.cost.week)} sub={`${fmtUsd(stats.cost.today)} today – ${fmtTok(stats.tokens.week)} tok`} />
      </Row2>
      <Row2>
        <Stat label="Scheduled" value={stats.schedules.enabled} sub={`${stats.schedules.total} total`} color={palette.violet} />
        {stats.attention > 0 ? (
          <Stat label="Needs attention" value={stats.attention} sub="see Inbox" color={palette.red} />
        ) : (
          <Stat label="Pending approvals" value={stats.pendingApprovals} color={stats.pendingApprovals > 0 ? palette.amber : palette.ash} />
        )}
      </Row2>

      {/* org chart as a status list */}
      <Card>
        <Kicker color={palette.amber}>Org chart – the executive team</Kicker>
        <View style={{ marginTop: 10 }}>
          <OrgChart agents={agents} />
        </View>
      </Card>

      {/* 7-day activity as bar rows (recharts is web-only) */}
      <Card>
        <Kicker color={palette.amber}>Activity – runs – last 7 days</Kicker>
        <View style={{ flexDirection: "row", gap: space.md, marginTop: 8, marginBottom: 6 }}>
          <Legend color={palette.lime} label="ok" />
          <Legend color={palette.red} label="error" />
        </View>
        {(() => {
          const max = Math.max(1, ...trend.map((d) => d.ok + d.error));
          return trend.map((d) => (
            <View key={d.day} style={{ marginBottom: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Mono color={palette.ash} style={{ fontSize: fs.micro }}>{d.day}</Mono>
                <Mono color={palette.ash} style={{ fontSize: fs.micro }}>{d.ok + d.error}</Mono>
              </View>
              <StackBar ok={d.ok} error={d.error} max={max} />
            </View>
          ));
        })()}
      </Card>

      {/* recent activity feed */}
      <Card>
        <Kicker color={palette.amber}>Recent activity – latest runs</Kicker>
        <View style={{ marginTop: 8 }}>
          {recent.length === 0 ? (
            <Mono color={palette.ash}>No runs yet.</Mono>
          ) : (
            recent.map((r) => (
              <FeedRow key={r.id} dot={r.status === "ok" ? palette.lime : palette.red} title={`${r.agentName} – ${r.agentRole}`} body={r.task} right={ago(r.createdAt)} />
            ))
          )}
        </View>
      </Card>

      {/* upcoming scheduled work */}
      <Card>
        <Kicker color={palette.amber}>Upcoming work – next scheduled runs</Kicker>
        <View style={{ marginTop: 8 }}>
          {upcoming.length === 0 ? (
            <Mono color={palette.ash}>Nothing scheduled.</Mono>
          ) : (
            upcoming.map((u) => (
              <FeedRow
                key={u.id}
                title={`${u.agentName} – ${u.cadence}`}
                body={u.task}
                right={u.status === "active" ? until(u.nextRunAt) : "paused"}
                rightColor={u.status === "active" ? palette.blue : palette.amber}
              />
            ))
          )}
        </View>
      </Card>
    </View>
  );
}

function OrgChart({ agents }: { agents: AgentLite[] }) {
  const { palette } = useTheme();
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

  if (agents.length === 0) return <Mono color={palette.ash}>No agents yet — create your team in "AI agents".</Mono>;

  return (
    <View style={{ gap: space.md }}>
      {groups.out.map((g) => (
        <View key={g.head.id} style={{ backgroundColor: palette.ink, borderWidth: 1, borderColor: palette.line, borderRadius: 12, padding: 12 }}>
          <Node a={g.head} head />
          {g.reports.length > 0 && (
            <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: palette.line, gap: space.sm }}>
              {g.reports.map((r) => <Node key={r.id} a={r} />)}
            </View>
          )}
        </View>
      ))}
      {groups.independents.length > 0 && (
        <View style={{ backgroundColor: palette.ink, borderWidth: 1, borderColor: palette.line, borderRadius: 12, padding: 12 }}>
          <Kicker color={palette.ash}>Independent</Kicker>
          <View style={{ marginTop: 8, gap: space.sm }}>
            {groups.independents.map((r) => <Node key={r.id} a={r} />)}
          </View>
        </View>
      )}
    </View>
  );
}

function Node({ a, head }: { a: AgentLite; head?: boolean }) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
      <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: DOT(palette)[a.status] ?? palette.ash }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: head ? F.bold : F.semi, fontSize: head ? 15 : 13, color: palette.chalk }} numberOfLines={1}>
          {a.name}
        </Text>
        <Mono color={palette.ash} style={{ fontSize: fs.micro }}>
          {a.role} – {a.model.replace("claude-", "")}{a.runtime === "managed" ? " – 🧠" : ""}
        </Mono>
      </View>
    </View>
  );
}

// ---- Scorecards ----------------------------------------------------------

function Scorecards({ data, onChange }: { data: Overview | null; onChange: () => void }) {
  const { palette } = useTheme();
  if (!data) return <Loading />;
  if (data.scorecards.length === 0) return <Mono color={palette.ash}>No agents yet — create your team in "AI agents".</Mono>;
  return (
    <View>
      {data.scorecards.map((s) => <ScorecardCard key={s.id} s={s} onChange={onChange} />)}
    </View>
  );
}

function ScorecardCard({ s, onChange }: { s: Scorecard; onChange: () => void }) {
  const { palette } = useTheme();
  const sr = s.successRate;
  const srColor = sr == null ? palette.ash : sr >= 90 ? palette.lime : sr >= 70 ? palette.amber : palette.red;
  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 10 }}>
        <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: DOT(palette)[s.status] ?? palette.ash }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: palette.chalk }} numberOfLines={1}>{s.name}</Text>
          <Mono color={palette.ash} style={{ fontSize: fs.micro }}>{s.role} – {s.model.replace("claude-", "")}{s.runtime === "managed" ? " – 🧠" : ""}</Mono>
        </View>
        <MiniChip color={s.authority === "executive" ? palette.violet : palette.ash}>{s.authority}</MiniChip>
      </View>

      <View style={{ marginBottom: 10 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
          <Mono color={palette.ash} style={{ fontSize: fs.micro }}>Success rate (7d)</Mono>
          <Mono color={srColor} style={{ fontSize: fs.micro }}>{sr == null ? "no runs" : `${sr}%`}</Mono>
        </View>
        <View style={{ height: 7, borderRadius: 4, backgroundColor: palette.ink2, overflow: "hidden" }}>
          <View style={{ width: `${sr ?? 0}%`, height: "100%", backgroundColor: srColor, borderRadius: 4 }} />
        </View>
      </View>

      <Row2>
        <Mini label="Runs 7d" value={String(s.runs7d)} />
        <Mini label="Cost 7d" value={fmtUsd(s.cost7d)} />
      </Row2>
      <Mono color={palette.ash} style={{ fontSize: fs.micro, marginTop: 6 }}>last run {s.lastRunAt ? ago(s.lastRunAt) : "—"} – {fmtTok(s.tokens7d)} tok</Mono>

      <Kicker color={palette.amber}>{"\n"}KPIs — target vs actual</Kicker>
      {s.kpis.length === 0 ? (
        <Mono color={palette.ash} style={{ marginTop: 6 }}>No KPIs set.</Mono>
      ) : (
        <View style={{ marginTop: 8, gap: space.ms }}>
          {s.kpis.map((k, i) => <KpiRow key={i} agentId={s.id} k={k} actual={s.actuals[k.metric]} onLogged={onChange} />)}
        </View>
      )}
    </Card>
  );
}

function KpiRow({ agentId, k, actual, onLogged }: { agentId: string; k: Kpi; actual?: Actual; onLogged: () => void }) {
  const { palette } = useTheme();
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);

  const target = k.targetValue ?? null;
  const pct = target != null && target !== 0 && actual ? Math.round((actual.value / target) * 100) : null;
  const onTarget = pct != null && pct >= 100;
  const targetLabel = k.target.trim() || (target != null ? String(target) : "—");

  async function log() {
    const n = Number(val);
    if (val === "" || Number.isNaN(n)) return;
    setBusy(true);
    await adminSend("POST", `/api/admin/agents/${agentId}/kpis`, { metric: k.metric, value: n });
    setBusy(false);
    setVal("");
    onLogged();
  }

  return (
    <View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: F.semi, fontSize: fs.body, color: palette.chalk, flex: 1 }}>{k.metric}</Text>
        <Mono color={palette.ash} style={{ fontSize: fs.micro }}>target {targetLabel}</Mono>
      </View>
      <Mono color={actual ? (target != null ? (onTarget ? palette.lime : palette.amber) : palette.chalk) : palette.ash} style={{ fontSize: fs.caption, marginTop: 2 }}>
        {actual ? `actual ${actual.value}${pct != null ? ` – ${pct}% of target` : ""}` : "no actual logged"}
      </Mono>
      {target != null && actual && (
        <View style={{ height: 5, borderRadius: 3, backgroundColor: palette.ink2, marginTop: 5, overflow: "hidden" }}>
          <View style={{ height: "100%", width: `${Math.min(100, Math.max(0, pct ?? 0))}%`, backgroundColor: onTarget ? palette.lime : palette.amber, borderRadius: 3 }} />
        </View>
      )}
      <View style={{ flexDirection: "row", gap: space.xs, marginTop: 6, alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <InlineNumberInput value={val} onChangeText={setVal} placeholder="log actual…" />
        </View>
        <PillBtn label="log" disabled={busy || val === ""} onPress={log} />
      </View>
    </View>
  );
}

// ---- Approvals -----------------------------------------------------------

type Approval = { id: string; agentName: string; task: string; estimateUsd: number; runtime: string; requestedByEmail: string | null; createdAt: string };

function Approvals({ onChange }: { onChange: () => void }) {
  const { palette } = useTheme();
  const [items, setItems] = useState<Approval[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await adminGet<{ approvals?: Approval[] }>("/api/admin/approvals");
    setItems(r.ok && r.data ? r.data.approvals ?? [] : []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(id: string, decision: "approve" | "deny") {
    setBusy(id);
    setErr(null);
    const r = await adminSend<{ error?: string }>("POST", `/api/admin/approvals/${id}`, { decision });
    setBusy(null);
    // Server enforces the two-person rule — surface its 409 error.
    if (!r.ok || r.data?.error) setErr(r.data?.error || r.error || "Could not decide this approval.");
    load();
    onChange();
  }

  if (items === null) return <Loading />;
  if (items.length === 0)
    return (
      <Card>
        <Mono color={palette.lime} style={{ textAlign: "center", paddingVertical: 24 }}>✓ No runs awaiting approval.</Mono>
      </Card>
    );

  return (
    <View>
      <Mono color={palette.ash} style={{ marginBottom: 10 }}>
        {items.length} run(s) held for a second operator. You can't approve your own request.
      </Mono>
      <ErrorNote error={err} onDismiss={() => setErr(null)} />
      {items.map((a) => (
        <Card key={a.id} accent={palette.amber}>
          <View style={{ flexDirection: "row", gap: space.xs, flexWrap: "wrap", alignItems: "center" }}>
            <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: palette.chalk }}>{a.agentName}</Text>
            <MiniChip color={palette.ash}>{a.runtime}</MiniChip>
            {a.estimateUsd > 0 && <MiniChip color={palette.violet}>est ${a.estimateUsd.toFixed(2)}</MiniChip>}
          </View>
          <Mono color={palette.ash} style={{ fontSize: fs.caption, marginTop: 4 }}>{a.task}</Mono>
          <Mono color={palette.ash} style={{ fontSize: fs.micro, marginTop: 4 }}>requested by {a.requestedByEmail ?? "—"} – {ago(a.createdAt)}</Mono>
          <View style={{ flexDirection: "row", gap: space.sm, marginTop: 10 }}>
            <PillBtn label="Approve & run" disabled={busy === a.id} onPress={() => decide(a.id, "approve")} />
            <PillBtn label="Deny" outline color={palette.ash} disabled={busy === a.id} onPress={() => decide(a.id, "deny")} />
          </View>
        </Card>
      ))}
    </View>
  );
}

// ---- Inbox / notifications -----------------------------------------------

type Notif = { id: string; kind: string; agentName: string | null; title: string; body: string | null; severity: string; read: boolean; createdAt: string };

function Inbox({ data, onChange }: { data: Overview | null; onChange: () => void }) {
  const { palette } = useTheme();
  const [notifs, setNotifs] = useState<Notif[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await adminGet<{ notifications?: Notif[] }>("/api/admin/notifications");
    setNotifs(r.ok && r.data ? r.data.notifications ?? [] : []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function markRead(id?: string) {
    setBusy(true);
    await adminSend("POST", "/api/admin/notifications", id ? { id } : { all: true });
    setBusy(false);
    load();
    onChange();
  }

  const brokenSchedules = data?.attention.brokenSchedules ?? [];
  const list = notifs ?? [];
  const unread = list.filter((n) => !n.read).length;
  const sevColor = (s: string) => (s === "error" ? palette.red : s === "info" ? palette.blue : palette.amber);

  if (notifs === null) return <Loading />;
  if (list.length === 0 && brokenSchedules.length === 0)
    return (
      <Card>
        <Mono color={palette.lime} style={{ textAlign: "center", paddingVertical: 24 }}>✓ All clear — nothing needs attention.</Mono>
      </Card>
    );

  return (
    <View>
      {list.length > 0 && (
        <Card accent={palette.red}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <Kicker color={palette.amber}>Notifications – {unread} unread</Kicker>
            {unread > 0 && <PillBtn label="Mark all read" outline color={palette.ash} disabled={busy} onPress={() => markRead()} />}
          </View>
          {list.map((n) => (
            <View key={n.id} style={{ flexDirection: "row", gap: space.ms, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: palette.line, opacity: n.read ? 0.5 : 1 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: sevColor(n.severity), marginTop: 5 }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: F.semi, fontSize: fs.body, color: palette.chalk }}>{n.title}</Text>
                {n.body && <Mono color={palette.ash} style={{ fontSize: fs.micro }} numberOfLines={2}>{n.body}</Mono>}
              </View>
              <Mono color={palette.ash} style={{ fontSize: fs.micro }}>{ago(n.createdAt)}</Mono>
              {!n.read && (
                <Pressable onPress={() => markRead(n.id)} disabled={busy} hitSlop={8}>
                  <Mono color={palette.ash} style={{ fontSize: fs.bodyLg }}>✕</Mono>
                </Pressable>
              )}
            </View>
          ))}
        </Card>
      )}
      {brokenSchedules.length > 0 && (
        <Card accent={palette.amber}>
          <Kicker color={palette.amber}>Schedules that can't fire – the agent isn't active</Kicker>
          <View style={{ marginTop: 8 }}>
            {brokenSchedules.map((b) => (
              <View key={b.id} style={{ flexDirection: "row", gap: space.ms, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: palette.line }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: palette.amber, marginTop: 5 }} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: "row", gap: space.xs, flexWrap: "wrap", alignItems: "center" }}>
                    <Text style={{ fontFamily: F.semi, fontSize: fs.body, color: palette.chalk }}>{b.agentName}</Text>
                    <MiniChip color={palette.violet}>{b.cadence}</MiniChip>
                    <MiniChip color={palette.amber}>{b.reason}</MiniChip>
                  </View>
                  <Mono color={palette.ash} style={{ fontSize: fs.micro }} numberOfLines={1}>{b.task}</Mono>
                </View>
              </View>
            ))}
          </View>
        </Card>
      )}
    </View>
  );
}

// ---- Digest --------------------------------------------------------------

function DigestTab() {
  const { palette } = useTheme();
  const [d, setD] = useState<{ text: string; slackConfigured: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    adminGet<{ text?: string; slackConfigured?: boolean }>("/api/admin/agents/digest").then((r) => {
      if (r.ok && r.data) setD({ text: r.data.text ?? "", slackConfigured: Boolean(r.data.slackConfigured) });
      else setError(r.error || "Failed to load daily digest.");
    });
  }, []);

  async function send() {
    setBusy(true);
    setSent(null);
    const r = await adminSend<{ sent?: boolean; reason?: string; error?: string }>("POST", "/api/admin/agents/digest");
    setBusy(false);
    setSent(r.data?.sent ? "Sent to Slack ✓" : r.data?.reason || r.data?.error || r.error || "not sent");
  }

  return (
    <Card>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <Kicker color={palette.amber}>Daily digest – last 24h</Kicker>
        <PillBtn label={busy ? "Sending…" : "Send to Slack"} outline color={palette.chalk} disabled={busy} onPress={send} />
      </View>
      <View style={{ backgroundColor: palette.ink, borderWidth: 1, borderColor: palette.line, borderRadius: 12, padding: 14 }}>
        <Mono color={error ? palette.amber : palette.chalk} style={{ fontSize: fs.caption, lineHeight: 18 }}>{error ?? (d ? d.text : "Loading…")}</Mono>
      </View>
      <Mono color={sent ? palette.lime : palette.ash} style={{ fontSize: fs.micro, marginTop: 8 }}>
        {sent ?? (d && !d.slackConfigured ? "Set SLACK_WEBHOOK_URL in the server env to enable delivery." : "Posts daily at 08:05 UTC.")}
      </Mono>
    </Card>
  );
}

// ---- Cost report ---------------------------------------------------------

type MonthRep = { month: string; total: number; runs: number; perAgent: { name: string; runs: number; cost: number }[] };

function CostTab() {
  const { palette } = useTheme();
  const [d, setD] = useState<{ current: MonthRep; previous: MonthRep } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    adminGet<{ current?: MonthRep; previous?: MonthRep }>("/api/admin/agents/cost-report").then((r) => {
      if (r.ok && r.data?.current && r.data.previous) setD({ current: r.data.current, previous: r.data.previous });
      else setError(r.error || "Failed to load cost report.");
    });
  }, []);

  async function send() {
    setBusy(true);
    setSent(null);
    const r = await adminSend<{ sent?: boolean; reason?: string; error?: string }>("POST", "/api/admin/agents/cost-report");
    setBusy(false);
    setSent(r.data?.sent ? "Sent to Slack ✓" : r.data?.reason || r.data?.error || r.error || "not sent");
  }

  if (error) return <ErrorNote error={error} />;
  if (!d) return <Loading />;

  return (
    <View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <Kicker color={palette.amber}>Monthly cost – real agent spend</Kicker>
        <PillBtn label={busy ? "Sending…" : "Send to Slack"} outline color={palette.chalk} disabled={busy} onPress={send} />
      </View>
      <Mono color={palette.ash} style={{ fontSize: fs.micro, marginBottom: 8 }}>CSV export is web-only.</Mono>
      {[d.current, d.previous].map((m, i) => (
        <Card key={m.month}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Kicker color={i === 0 ? palette.amber : palette.ash}>{m.month}{i === 0 ? " – MTD" : ""}</Kicker>
          </View>
          <Text style={{ fontFamily: F.black, fontSize: fs.display, color: palette.chalk, marginVertical: 4 }}>{fmtUsd(m.total)}</Text>
          <Mono color={palette.ash} style={{ fontSize: fs.micro }}>{m.runs} runs</Mono>
          <View style={{ marginTop: 8 }}>
            {m.perAgent.length === 0 ? (
              <Mono color={palette.ash} style={{ fontSize: fs.micro }}>No spend this month.</Mono>
            ) : (
              (() => {
                const max = Math.max(1, ...m.perAgent.map((p) => p.cost));
                return m.perAgent.slice(0, 8).map((p) => (
                  <View key={p.name} style={{ marginBottom: 6 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Mono color={palette.ash} style={{ fontSize: fs.micro, flex: 1 }} numberOfLines={1}>{p.name}</Mono>
                      <Mono color={palette.chalk} style={{ fontSize: fs.micro }}>{fmtUsd(p.cost)} – {p.runs}r</Mono>
                    </View>
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: palette.line, overflow: "hidden", marginTop: 2 }}>
                      <View style={{ width: `${Math.max(3, Math.round((p.cost / max) * 100))}%`, height: "100%", backgroundColor: palette.violet, borderRadius: 3 }} />
                    </View>
                  </View>
                ));
              })()
            )}
          </View>
        </Card>
      ))}
      {sent && <Mono color={palette.lime} style={{ fontSize: fs.micro, marginTop: 4 }}>{sent}</Mono>}
    </View>
  );
}

// ---- Reports (agent-runs feed) -------------------------------------------

type ReportRow = {
  id: string;
  agentName: string;
  agentRole: string;
  task: string;
  output: string;
  steps: { agent: string; role: string; task: string; output: string }[];
  inputTokens: number;
  outputTokens: number;
  status: string;
  runtime: string;
  ranByEmail: string | null;
  createdAt: string;
};
const FILTERS = ["all", "ok", "error"] as const;

function Reports() {
  const { palette } = useTheme();
  const [runs, setRuns] = useState<ReportRow[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const qs = filter === "all" ? "" : `?status=${filter}`;
    const r = await adminGet<{ runs?: ReportRow[]; unavailable?: boolean }>(`/api/admin/agent-runs${qs}`);
    if (r.ok && r.data) {
      setUnavailable(Boolean(r.data.unavailable));
      setRuns(r.data.runs ?? []);
    } else setRuns([]);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View>
      {unavailable && (
        <Card accent={palette.amber}>
          <Mono color={palette.chalk}>Run history isn't persisted yet — run reference/sql-agent-runs.sql in Supabase.</Mono>
        </Card>
      )}
      <Segmented options={FILTERS.map((f) => ({ value: f, label: f }))} value={filter} onChange={(v) => setFilter(v as (typeof FILTERS)[number])} />
      <Mono color={palette.ash} style={{ fontSize: fs.micro, marginBottom: 8 }}>CSV / PDF export is web-only.</Mono>

      {runs === null ? (
        <Loading />
      ) : runs.length === 0 ? (
        <Card>
          <Mono color={palette.ash} style={{ textAlign: "center", paddingVertical: 20 }}>
            No runs yet{filter !== "all" ? ` with status "${filter}"` : ""}.
          </Mono>
        </Card>
      ) : (
        runs.map((r) => {
          const open = openId === r.id;
          return (
            <Card key={r.id}>
              <Pressable onPress={() => setOpenId(open ? null : r.id)}>
                <View style={{ flexDirection: "row", gap: space.xs, flexWrap: "wrap", alignItems: "center" }}>
                  <MiniChip color={r.status === "ok" ? palette.lime : palette.red}>{r.status}</MiniChip>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: palette.chalk }}>{r.agentName}</Text>
                  <MiniChip color={palette.ash}>{r.agentRole}</MiniChip>
                  {r.steps.length > 0 && <MiniChip color={palette.violet}>{r.steps.length} delegated</MiniChip>}
                </View>
                <Mono color={palette.ash} style={{ fontSize: fs.micro, marginTop: 2 }}>{new Date(r.createdAt).toLocaleString()}</Mono>
                <Mono color={palette.chalk} style={{ fontSize: fs.caption, marginTop: 4 }} numberOfLines={open ? undefined : 1}>{r.task}</Mono>
              </Pressable>
              {open && (
                <View style={{ marginTop: 10 }}>
                  {r.steps.map((s, i) => (
                    <View key={i} style={{ marginBottom: 8, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: palette.violet }}>
                      <Mono color={palette.violet} style={{ fontSize: fs.micro, textTransform: "uppercase" }}>↳ {s.role} — {s.agent}</Mono>
                      <Mono color={palette.chalk} style={{ fontSize: fs.micro }}>{s.output}</Mono>
                    </View>
                  ))}
                  <View style={{ backgroundColor: palette.ink, borderWidth: 1, borderColor: palette.line, borderRadius: 12, padding: 14 }}>
                    <Mono color={palette.chalk} style={{ fontSize: fs.body, lineHeight: 20 }}>{r.output || "(no output)"}</Mono>
                  </View>
                  <Mono color={palette.ash} style={{ fontSize: fs.micro, marginTop: 8 }}>
                    {r.inputTokens.toLocaleString()} in – {r.outputTokens.toLocaleString()} out – {r.ranByEmail ?? "—"}
                  </Mono>
                </View>
              )}
            </Card>
          );
        })
      )}
    </View>
  );
}

// ---- shared bits ---------------------------------------------------------

function Row2({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: "row", gap: space.md }}>{children}</View>;
}

function Legend({ color, label }: { color: string; label: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }} />
      <Mono color={palette.ash} style={{ fontSize: fs.micro }}>{label}</Mono>
    </View>
  );
}

function StackBar({ ok, error, max }: { ok: number; error: number; max: number }) {
  const { palette } = useTheme();
  const okPct = Math.round((ok / max) * 100);
  const errPct = Math.round((error / max) * 100);
  return (
    <View style={{ flexDirection: "row", height: 8, borderRadius: 4, backgroundColor: palette.line, overflow: "hidden", marginTop: 3 }}>
      {ok > 0 && <View style={{ width: `${okPct}%`, backgroundColor: palette.lime }} />}
      {error > 0 && <View style={{ width: `${errPct}%`, backgroundColor: palette.red }} />}
    </View>
  );
}

function FeedRow({ dot, title, body, right, rightColor }: { dot?: string; title: string; body: string; right: string; rightColor?: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: space.ms, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: palette.line }}>
      {dot ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dot, marginTop: 5 }} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: F.semi, fontSize: fs.body, color: palette.chalk }} numberOfLines={1}>{title}</Text>
        <Mono color={palette.ash} style={{ fontSize: fs.micro }} numberOfLines={1}>{body}</Mono>
      </View>
      <Mono color={rightColor ?? palette.ash} style={{ fontSize: fs.micro }}>{right}</Mono>
    </View>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: palette.ink, borderWidth: 1, borderColor: palette.line, borderRadius: 10, padding: 10 }}>
      <Mono color={palette.ash} style={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</Mono>
      <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: palette.chalk, marginTop: 2 }}>{value}</Text>
    </View>
  );
}

function MiniChip({ children, color }: { children: React.ReactNode; color: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ backgroundColor: `${color}1f`, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 2, alignSelf: "flex-start" }}>
      <Text style={{ fontFamily: F.semi, fontSize: fs.micro, color: txt(palette, color), textTransform: "uppercase", letterSpacing: 0.5 }}>
        {children}
      </Text>
    </View>
  );
}

function InlineNumberInput({ value, onChangeText, placeholder }: { value: string; onChangeText: (t: string) => void; placeholder: string }) {
  const { palette } = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={palette.ash}
      keyboardType="numeric"
      style={{
        fontFamily: F.mono,
        fontSize: fs.body,
        color: palette.chalk,
        backgroundColor: palette.ink2,
        borderWidth: 1,
        borderColor: palette.line,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 7,
      }}
    />
  );
}
