"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  INK2,
  LINE,
  LIME,
  CHALK,
  ASH,
  BLUE,
  VIOLET,
  AMBER,
  RED,
  disp,
  mono,
  tip,
  Mono,
  Card,
  Chip,
  Stat,
  ChartFrame,
  txt,
} from "@/lib/ui";
import { useLoggerPrefs } from "@/lib/logger-prefs";
import { useIsMobile } from "@/lib/use-media-query";
import { fmtWeight, fmtTonnage, displayLoad, kgToUnit } from "@hybrid/core";
import {
  currentPhase,
  totalVolume,
  sessionVolume,
  bestE1rmByLift,
  blockBestE1rm,
  prsForSession,
  volumeByMuscle,
  e1rmSeries,
  liftNames,
  blockSummary,
  supersetLabels,
  setType,
  setTypeBadge,
  paceSeries,
  headlineRunMove,
  paceClock,
  cardioPrsForSession,
  type CardioPrHit,
  type LoggedSession,
  type Macrocycle,
  type Biometrics,
} from "@hybrid/core";
import type { RosterRow } from "@/lib/use-roster";
import AskCoach from "./ai-coach";
import ReconciledWeek from "./reconciled-week";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

// HPI / risk band → brand color. Good = lime, watch = blue, caution = amber,
// danger = red — shared by the Performance State HPI band and injury risk band.
const BAND_COLOR = (b: string) =>
  b === "peak" || b === "primed" || b === "low"
    ? LIME
    : b === "moderate"
      ? BLUE
      : b === "compromised" || b === "elevated"
        ? AMBER
        : RED;

// ---------- ANALYTICS: ATHLETE (the Client dashboard) ----------
// Renders the athlete's REAL logged sessions; before anything is logged it
// shows an honest empty state (no sample data).
export function AthleteAnalytics({ sessions = [] }: { sessions?: LoggedSession[] }) {
  if (sessions.length === 0)
    return (
      <Card style={{ textAlign: "center", padding: 60 }}>
        <div style={{ ...disp, fontWeight: 800, fontSize: 20 }}>No analytics yet</div>
        <Mono s={{ fontSize: 14, display: "block", marginTop: 10, maxWidth: 460, marginInline: "auto", lineHeight: 1.6 }}>
          Log a few sessions and your strength trend, volume, PRs and readiness chart out here — all from your real training.
        </Mono>
      </Card>
    );
  return <RealAthlete sessions={sessions} />;
}

function RealAthlete({ sessions }: { sessions: LoggedSession[] }) {
  const units = useLoggerPrefs().units;
  const isMobile = useIsMobile();
  const vol = totalVolume(sessions);
  const prs = bestE1rmByLift(sessions).slice(0, 6);
  const topLift = liftNames(sessions)[0];
  const series = topLift
    ? e1rmSeries(sessions, topLift).map((p) => ({ w: fmtDate(p.date), e1rm: Math.round(kgToUnit(p.e1rm, units)) }))
    : [];
  const volSeries = [...sessions]
    .slice(0, 8)
    .reverse()
    .map((s) => ({ w: fmtDate(s.startedAt), vol: Math.round(kgToUnit(sessionVolume(s.blocks), units)) }));
  const lastReadiness =
    sessions.find((s) => typeof s.readiness === "number")?.readiness ?? null;
  const best = prs[0];

  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 16 }}>
      <Stat label="Sessions" value={sessions.length} c={LIME} />
      <Stat label="Total volume" value={fmtTonnage(vol, units)} />
      <Stat
        label={best ? `${best.lift} e1RM` : "Best e1RM"}
        value={best ? fmtWeight(best.e1rm, units) : "—"}
        c={LIME}
      />
      <Stat label="Last readiness" value={lastReadiness ?? "—"} c={BLUE} />

      {series.length > 0 && (
        <ChartFrame span={2} title={`${topLift} · e1RM`} kicker="From your logs">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={series}>
              <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
              <XAxis dataKey="w" stroke={ASH} style={{ ...mono, fontSize: 11 }} />
              <YAxis stroke={ASH} style={{ ...mono, fontSize: 11 }} domain={["auto", "auto"]} />
              <Tooltip contentStyle={tip} />
              <Line type="monotone" dataKey="e1rm" stroke={LIME} strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>
      )}

      <ChartFrame span={series.length > 0 ? 2 : 4} title="Volume per session" kicker="Tonnage" c={BLUE}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={volSeries}>
            <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
            <XAxis dataKey="w" stroke={ASH} style={{ ...mono, fontSize: 11 }} />
            <YAxis stroke={ASH} style={{ ...mono, fontSize: 11 }} />
            <Tooltip contentStyle={tip} />
            <Bar dataKey="vol" fill={BLUE} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>

      {prs.length > 0 && (
        <ChartFrame span={4} title="Personal records" kicker="Best e1RM per lift">
          <div style={{ overflowX: "auto", maxWidth: "100%" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 360 }}>
            <thead>
              <tr>
                {["Lift", "Best e1RM", "When"].map((h) => (
                  <th
                    key={h}
                    style={{
                      ...mono,
                      fontSize: 11,
                      color: txt(ASH),
                      textTransform: "uppercase",
                      textAlign: "left",
                      padding: "8px 0",
                      borderBottom: `1px solid ${LINE}`,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {prs.map((p) => (
                <tr key={p.lift}>
                  <td style={{ ...disp, fontWeight: 600, fontSize: 14, padding: "12px 0", borderBottom: `1px solid ${LINE}` }}>
                    {p.lift}
                  </td>
                  <td style={{ ...mono, fontSize: 14, color: CHALK, padding: "12px 0", borderBottom: `1px solid ${LINE}` }}>
                    {fmtWeight(p.e1rm, units)}
                  </td>
                  <td style={{ ...mono, fontSize: 13, color: txt(ASH), padding: "12px 0", borderBottom: `1px solid ${LINE}` }}>
                    {fmtDate(p.when)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </ChartFrame>
      )}
    </div>
  );
}

// ---------- ANALYTICS: COACH ----------
// Real roster data when the coach has active clients; an empty state otherwise.
export function CoachAnalytics({ roster = [] }: { roster?: RosterRow[] }) {
  if (roster.length === 0)
    return (
      <Card style={{ textAlign: "center", padding: 60 }}>
        <div style={{ ...disp, fontWeight: 800, fontSize: 20 }}>No clients yet</div>
        <Mono s={{ fontSize: 14, display: "block", marginTop: 10, maxWidth: 460, marginInline: "auto", lineHeight: 1.6 }}>
          Invite athletes from the <b style={{ color: txt(LIME) }}>Coach</b> tab. Once they accept and train, your roster analytics appear here.
        </Mono>
      </Card>
    );
  return <RealCoach roster={roster} />;
}

function RealCoach({ roster }: { roster: RosterRow[] }) {
  const isMobile = useIsMobile();
  const avgAdh = Math.round(roster.reduce((s, c) => s + c.adherence, 0) / roster.length);
  const reads = roster.filter((c) => typeof c.readiness === "number");
  const avgRead = reads.length
    ? Math.round(reads.reduce((s, c) => s + (c.readiness ?? 0), 0) / reads.length)
    : null;
  const totalVol = roster.reduce((s, c) => s + c.volume, 0);

  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 16 }}>
      <Stat label="Clients" value={roster.length} c={VIOLET} />
      <Stat label="Avg adherence" value={avgAdh + "%"} c={LIME} />
      <Stat label="Avg readiness" value={avgRead ?? "—"} c={BLUE} />
      <Stat label="Roster volume" value={`${(totalVol / 1000).toFixed(1)}k`} sub="kg" />

      <ChartFrame span={4} title="Adherence by client" kicker="Last 7 days">
        <ResponsiveContainer width="100%" height={Math.max(120, roster.length * 44)}>
          <BarChart data={roster} layout="vertical" margin={{ left: 20 }}>
            <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
            <XAxis type="number" domain={[0, 100]} stroke={ASH} style={{ ...mono, fontSize: 11 }} />
            <YAxis type="category" dataKey="name" stroke={ASH} width={90} style={{ ...mono, fontSize: 10 }} />
            <Tooltip contentStyle={tip} />
            <Bar dataKey="adherence" fill={LIME} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>

      <ChartFrame span={4} title="Client roster" kicker="Your consented athletes" c={VIOLET}>
        <div style={{ overflowX: "auto", maxWidth: "100%" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
          <thead>
            <tr>
              {["Athlete", "Readiness", "Adherence", "Sessions", "Last"].map((h) => (
                <th key={h} style={{ ...mono, fontSize: 11, color: txt(ASH), textTransform: "uppercase", textAlign: "left", padding: "8px 0", borderBottom: `1px solid ${LINE}` }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roster.map((c) => (
              <tr key={c.linkId}>
                <td style={{ ...disp, fontWeight: 600, fontSize: 14, padding: "12px 0", borderBottom: `1px solid ${LINE}` }}>{c.name}</td>
                <td style={{ ...mono, fontSize: 14, padding: "12px 0", borderBottom: `1px solid ${LINE}`, color: txt(c.readiness == null ? ASH : c.readiness > 70 ? LIME : c.readiness > 50 ? AMBER : RED) }}>
                  {c.readiness ?? "—"}
                </td>
                <td style={{ ...mono, fontSize: 14, color: CHALK, padding: "12px 0", borderBottom: `1px solid ${LINE}` }}>{c.adherence}%</td>
                <td style={{ ...mono, fontSize: 14, color: CHALK, padding: "12px 0", borderBottom: `1px solid ${LINE}` }}>{c.sessions}</td>
                <td style={{ ...mono, fontSize: 13, color: txt(ASH), padding: "12px 0", borderBottom: `1px solid ${LINE}` }}>{c.lastSession ? fmtDate(c.lastSession) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </ChartFrame>
    </div>
  );
}

// ---------- ANALYTICS: OPERATOR (admin) ----------
export function OperatorAnalytics() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [err, setErr] = useState(false);
  const isMobile = useIsMobile();
  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: AdminStats) => setStats(d))
      .catch(() => setErr(true));
  }, []);

  if (err)
    return (
      <Card style={{ textAlign: "center", padding: 60 }}>
        <Mono s={{ fontSize: 14 }}>Platform analytics are admin-only and computed live from the database.</Mono>
      </Card>
    );
  if (!stats)
    return (
      <Card style={{ textAlign: "center", padding: 60 }}>
        <Mono s={{ fontSize: 14 }}>Loading…</Mono>
      </Card>
    );

  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 16 }}>
      <Stat label="Total users" value={stats.totalUsers.toLocaleString()} sub={`+${stats.newUsers30} / 30d`} c={LIME} />
      <Stat label="Active (30d)" value={stats.mau.toLocaleString()} sub="trained in 30d" c={LIME} />
      <Stat label="Sessions logged" value={stats.sessions.toLocaleString()} c={CHALK} />
      <Stat label="Coaches" value={stats.coaches.toLocaleString()} c={VIOLET} />

      {stats.planPopularity.length > 0 && (
        <ChartFrame span={2} title="Plans enrolled" kicker="By goal" c={LIME}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stats.planPopularity}>
              <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
              <XAxis dataKey="goal" stroke={ASH} style={{ ...mono, fontSize: 11 }} />
              <YAxis stroke={ASH} style={{ ...mono, fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={tip} />
              <Bar dataKey="n" fill={LIME} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>
      )}

      {stats.langSplit.length > 0 && (
        <ChartFrame span={2} title="Language split" kicker="Users by language" c={BLUE}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
            {stats.langSplit.map((l) => (
              <div key={l.lang} style={{ display: "flex", justifyContent: "space-between" }}>
                <Mono s={{ fontSize: 13 }} c={CHALK}>{l.lang}</Mono>
                <Mono s={{ fontSize: 12 }}>{l.n}</Mono>
              </div>
            ))}
          </div>
        </ChartFrame>
      )}

      {stats.totalUsers === 0 && (
        <Card span={4} style={{ textAlign: "center" }}>
          <Mono s={{ fontSize: 13 }}>No users yet.</Mono>
        </Card>
      )}
    </div>
  );
}

type AdminStats = {
  totalUsers: number;
  sessions: number;
  coaches: number;
  mau: number;
  newUsers30: number;
  planPopularity: { goal: string; n: number }[];
  langSplit: { lang: string; n: number }[];
};

// ---------- PERIODIZE (real macrocycle from the engine) ----------
export function PeriodizeScreen({
  macro: enrolled,
  currentWeek = 1,
  sessions = [],
  bio,
}: {
  macro?: Macrocycle | null;
  currentWeek?: number;
  sessions?: LoggedSession[];
  bio?: Biometrics | null;
}) {
  const isMobile = useIsMobile();
  if (!enrolled)
    return (
      <Card style={{ textAlign: "center", padding: 60 }}>
        <div style={{ ...disp, fontWeight: 800, fontSize: 20 }}>No active plan</div>
        <Mono s={{ fontSize: 14, display: "block", marginTop: 10, maxWidth: 460, marginInline: "auto", lineHeight: 1.6 }}>
          Enroll in a plan from the <b style={{ color: txt(LIME) }}>Plans</b> tab — your periodized
          macrocycle (phases, load &amp; recovery weeks) shows up here.
        </Mono>
      </Card>
    );

  const macro = enrolled;
  const week = currentWeek;
  const { block: current } = currentPhase(macro, week);

  return (
    <div>
      {/* this week's reconciled session — the phase made concrete + schedulable */}
      {sessions.length > 0 && (
        <ReconciledWeek macro={macro} currentWeek={week} sessions={sessions} bio={bio ?? undefined} style={{ marginBottom: 16 }} />
      )}
      <Card style={{ marginBottom: 16 }}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>
          {macro.goalOrSport}{macro.model ? ` · ${macro.model}` : enrolled ? " · enrolled" : ""}
        </Mono>
        <div style={{ ...disp, fontWeight: 800, fontSize: 22, margin: "6px 0 12px" }}>
          {macro.totalWeeks}-week macrocycle · now in {current.label}
        </div>
        {/* phase timeline, weighted by weeks */}
        <div style={{ display: "flex", gap: 3, height: 12, borderRadius: 6, overflow: "hidden" }}>
          {macro.blocks.map((b) => (
            <div
              key={b.key}
              title={`${b.label} · ${b.weeks} wk`}
              style={{ flex: b.weeks, background: b.key === current.key ? b.color : `${b.color}40` }}
            />
          ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
          {macro.blocks.map((b) => (
            <div key={b.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: b.color }} />
              <Mono s={{ fontSize: 11 }} c={b.key === current.key ? CHALK : ASH}>
                {b.label}
              </Mono>
            </div>
          ))}
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", gap: 16 }}>
        {macro.blocks.map((b) => (
          <Card key={b.key} style={{ borderLeft: `3px solid ${b.color}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ ...disp, fontWeight: 800, fontSize: 18, color: txt(b.color) }}>{b.label}</div>
              <Mono s={{ fontSize: 12 }}>
                wk {b.startWeek}–{b.endWeek}
              </Mono>
            </div>
            <Mono s={{ fontSize: 12, display: "block", margin: "6px 0 12px" }}>{b.focus}</Mono>
            <div style={{ display: "flex", gap: 6 }}>
              {b.micros.map((m) => (
                <div
                  key={m.week}
                  title={`Week ${m.week} · ${m.kind} · intensity ${m.intensity} / volume ${m.volume}`}
                  style={{
                    flex: 1,
                    textAlign: "center",
                    padding: "8px 2px",
                    borderRadius: 8,
                    background: m.week === week ? `${LIME}1a` : INK2,
                    border: `1px solid ${m.week === week ? LIME : LINE}`,
                  }}
                >
                  <Mono s={{ fontSize: 10, display: "block" }} c={m.kind === "recovery" ? ASH : CHALK}>
                    W{m.week}
                  </Mono>
                  <div
                    style={{
                      height: 4,
                      borderRadius: 2,
                      marginTop: 4,
                      background: m.kind === "recovery" ? ASH : b.color,
                      opacity: 0.4 + (m.intensity / 100) * 0.6,
                    }}
                  />
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------- HISTORY (real logged sessions) ----------
export function HistoryScreen({
  sessions,
  onOpenExercise,
  onChanged,
}: {
  sessions: LoggedSession[];
  onOpenExercise?: (name: string) => void;
  // refresh the live (non-archived) session list after an archive/delete.
  onChanged?: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  // "Archived" is a separate view fetched on demand (GET /api/sessions?archived=1).
  const [showArchived, setShowArchived] = useState(false);
  const [archived, setArchived] = useState<LoggedSession[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const units = useLoggerPrefs().units;

  const loadArchived = async () => {
    try {
      const res = await fetch("/api/sessions?archived=1");
      const d = res.ok ? ((await res.json()) as { sessions?: LoggedSession[] }) : { sessions: [] };
      setArchived(d.sessions ?? []);
    } catch {
      setArchived([]);
    }
  };

  // PATCH archived flag (archive or restore), then refresh both lists. Surfaces
  // a failure instead of silently reloading as if it had worked.
  const setArchivedFlag = async (id: string, value: boolean) => {
    setBusy(id);
    try {
      const res = await fetch(`/api/sessions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: value }),
      });
      if (!res.ok) {
        alert(`Couldn't ${value ? "archive" : "restore"} the workout — try again.`);
        return;
      }
      onChanged?.();
      if (showArchived || value) await loadArchived();
    } catch {
      alert("Network error — try again.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string, title: string) => {
    if (!window.confirm(`Permanently delete “${title}”? This can't be undone.`)) return;
    setBusy(id);
    try {
      const res = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
      if (!res.ok) {
        alert("Couldn't delete the workout — try again.");
        return;
      }
      onChanged?.();
      if (showArchived) await loadArchived();
    } catch {
      alert("Network error — try again.");
    } finally {
      setBusy(null);
    }
  };

  const toggleArchived = () => {
    const next = !showArchived;
    setShowArchived(next);
    if (next) void loadArchived();
  };

  const archivedToggle = (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <button
        onClick={toggleArchived}
        style={{ ...mono, fontSize: 12, color: txt(showArchived ? AMBER : ASH), background: "none", border: `1px solid ${showArchived ? AMBER : LINE}`, borderRadius: 999, padding: "6px 14px", cursor: "pointer" }}
      >
        {showArchived ? "← Back to history" : "Archived ▸"}
      </button>
    </div>
  );

  if (sessions.length === 0 && !showArchived)
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {archivedToggle}
        <Card style={{ textAlign: "center", padding: 60 }}>
          <div style={{ ...disp, fontWeight: 800, fontSize: 20 }}>No sessions yet</div>
          <Mono s={{ fontSize: 14, display: "block", marginTop: 10 }}>
            Log your first workout from the <b style={{ color: txt(LIME) }}>Log session</b> tab — it&apos;ll
            appear here and feed your dashboard.
          </Mono>
        </Card>
      </div>
    );

  const open = openId ? sessions.find((s) => s.id === openId) : null;
  if (open) return <SessionDetail session={open} all={sessions} onBack={() => setOpenId(null)} onOpenExercise={onOpenExercise} />;

  // ARCHIVED view — read-only cards with a Restore + permanent Delete action.
  if (showArchived)
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {archivedToggle}
        {archived.length === 0 ? (
          <Card style={{ textAlign: "center", padding: 40 }}>
            <Mono s={{ fontSize: 14 }}>No archived workouts.</Mono>
          </Card>
        ) : (
          archived.map((s) => (
            <Card key={s.id} style={{ borderLeft: `3px solid ${AMBER}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ ...disp, fontWeight: 800, fontSize: 18 }}>{s.title}</div>
                <Mono s={{ fontSize: 12 }}>{fmtDate(s.startedAt)}</Mono>
              </div>
              <div style={{ display: "flex", gap: 8, margin: "8px 0 12px", flexWrap: "wrap" }}>
                <Chip c={BLUE}>{fmtTonnage(sessionVolume(s.blocks), units)}</Chip>
                <Chip c={ASH}>{s.blocks.length} blocks</Chip>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setArchivedFlag(s.id, false)} disabled={busy === s.id} style={rowBtn(LIME, busy === s.id)}>
                  ↺ Restore
                </button>
                <button onClick={() => remove(s.id, s.title)} disabled={busy === s.id} style={rowBtn(RED, busy === s.id)}>
                  Delete
                </button>
              </div>
            </Card>
          ))
        )}
      </div>
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {archivedToggle}
      {sessions.map((s) => {
        const prCount = prsForSession(sessions, s.id).length;
        return (
          <Card key={s.id}>
            <div onClick={() => setOpenId(s.id)} style={{ cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ ...disp, fontWeight: 800, fontSize: 18 }}>{s.title}</div>
                <Mono s={{ fontSize: 12 }}>{fmtDate(s.startedAt)}</Mono>
              </div>
              <div style={{ display: "flex", gap: 8, margin: "8px 0 12px", flexWrap: "wrap" }}>
                <Chip c={BLUE}>{fmtTonnage(sessionVolume(s.blocks), units)}</Chip>
                <Chip c={ASH}>{s.blocks.length} blocks</Chip>
                {typeof s.readiness === "number" && <Chip c={LIME}>readiness {s.readiness}</Chip>}
                {prCount > 0 && <Chip c={LIME}>🏆 {prCount} PR</Chip>}
              </div>
              {s.blocks.map((b, i) => (
                <div
                  key={i}
                  style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: `1px solid ${LINE}` }}
                >
                  <Mono s={{ fontSize: 13 }} c={CHALK}>
                    {b.name}
                  </Mono>
                  <Mono s={{ fontSize: 13 }}>{blockSummary(b)}</Mono>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, paddingTop: 10, borderTop: `1px solid ${LINE}` }}>
              <Mono s={{ fontSize: 12, cursor: "pointer" }} c={ASH} >
                <span onClick={() => setOpenId(s.id)}>Open the full breakdown →</span>
              </Mono>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setArchivedFlag(s.id, true)} disabled={busy === s.id} style={rowBtn(AMBER, busy === s.id)}>
                  Archive
                </button>
                <button onClick={() => remove(s.id, s.title)} disabled={busy === s.id} style={rowBtn(RED, busy === s.id)}>
                  Delete
                </button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// Small per-row action button (archive / restore / delete) on history cards.
function rowBtn(color: string, disabled: boolean) {
  return {
    ...mono,
    fontSize: 12,
    color: txt(color),
    background: `${color}14`,
    border: `1px solid ${color}55`,
    borderRadius: 8,
    padding: "6px 12px",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.5 : 1,
  } as const;
}

const MUSCLE_LABEL: Record<string, string> = {
  quads: "Quads",
  glutes: "Glutes",
  posterior: "Posterior chain",
  back: "Back",
  chest: "Chest",
  shoulders: "Shoulders",
  triceps: "Triceps",
};

// ---------- SESSION DETAIL (web parity: PRs, e1RM trend, muscle focus) ----------
export function SessionDetail({
  session,
  all,
  onBack,
  onOpenExercise,
}: {
  session: LoggedSession;
  all: LoggedSession[];
  onBack: () => void;
  onOpenExercise?: (name: string) => void;
}) {
  const units = useLoggerPrefs().units;
  const isMobile = useIsMobile();
  const prs = prsForSession(all, session.id);
  const cardioPrs = cardioPrsForSession(all, session.id);
  const prSet = new Set(prs.map((p) => p.lift));
  const ssLabels = supersetLabels(session.blocks);
  const muscles = volumeByMuscle(session.blocks);
  const muscleMax = muscles[0]?.volume || 1;
  const sets = session.blocks.reduce((n, b) => n + (b.kind === "strength" ? b.sets.length : 1), 0);
  const minutes = session.completedAt
    ? Math.max(1, Math.round((Date.parse(session.completedAt) - Date.parse(session.startedAt)) / 60000))
    : null;

  // The session's heaviest lift → its e1RM trend across all history.
  const topLift = session.blocks
    .filter((b) => b.kind === "strength")
    .map((b) => ({ name: b.name, e: blockBestE1rm(b) }))
    .sort((a, b) => b.e - a.e)[0]?.name;
  const series = topLift ? e1rmSeries(all, topLift).map((p) => ({ w: fmtDate(p.date), e1rm: Math.round(kgToUnit(p.e1rm, units)) })) : [];

  // The session's headline run → its pace (sec/km) trend across all history.
  const runMove = headlineRunMove(session.blocks);
  const paceData = runMove ? paceSeries(all, runMove).map((p) => ({ w: fmtDate(p.date), pace: p.secPerKm })) : [];

  const prLine = (p: { lift: string; e1rm: number; previous: number | null }) =>
    p.previous == null ? `${p.lift} ${fmtWeight(p.e1rm, units)} (first!)` : `${p.lift} ${fmtWeight(p.e1rm, units)} (+${fmtWeight(p.e1rm - p.previous, units)})`;
  const cardioPrLine = (p: CardioPrHit) => {
    if (p.kind === "distance")
      return p.previous == null
        ? `${p.move} ${p.value} km (first!)`
        : `${p.move} ${p.value} km (+${Math.round((p.value - p.previous) * 10) / 10})`;
    const delta = p.previous != null ? ` (−${paceClock(p.previous - p.value)})` : "";
    return `${p.move} ${paceClock(p.value)} /km${delta}`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <button
        onClick={onBack}
        style={{ ...mono, fontSize: 13, color: txt(ASH), background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}
      >
        ← History
      </button>

      <div>
        <div style={{ ...disp, fontWeight: 800, fontSize: 26 }}>{session.title}</div>
        <Mono s={{ fontSize: 13, display: "block", marginTop: 4 }}>
          {fmtDate(session.startedAt)}
          {typeof session.readiness === "number" ? ` · readiness ${session.readiness}` : ""}
        </Mono>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 100px), 1fr))", gap: 16 }}>
        <Stat label="Minutes" value={minutes != null ? minutes : "—"} />
        <Stat label="Sets" value={sets} />
        <Stat label="Volume" value={fmtTonnage(sessionVolume(session.blocks), units)} c={LIME} />
      </div>

      {prs.length > 0 && (
        <Card style={{ borderColor: LIME }}>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>
            🏆 {prs.length} new personal record{prs.length > 1 ? "s" : ""}
          </Mono>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {prs.map((p) => (
              <Mono key={p.lift} s={{ fontSize: 13 }} c={CHALK}>
                {prLine(p)}
              </Mono>
            ))}
          </div>
        </Card>
      )}

      {cardioPrs.length > 0 && (
        <Card style={{ borderColor: BLUE }}>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={BLUE}>
            🏃 {cardioPrs.length} new cardio record{cardioPrs.length > 1 ? "s" : ""}
          </Mono>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {cardioPrs.map((p) => (
              <Mono key={`${p.move}-${p.kind}`} s={{ fontSize: 13 }} c={CHALK}>
                {cardioPrLine(p)}
              </Mono>
            ))}
          </div>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: !isMobile && series.length > 1 ? "repeat(2, 1fr)" : "1fr", gap: 16 }}>
        {muscles.length > 0 && (
          <ChartFrame title="Muscle focus" kicker="Tonnage by muscle">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {muscles.map((m) => (
                <div key={m.muscle}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <Mono s={{ fontSize: 13 }} c={CHALK}>{MUSCLE_LABEL[m.muscle] ?? m.muscle}</Mono>
                    <Mono s={{ fontSize: 12 }}>{fmtWeight(m.volume, units)}</Mono>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: INK2, overflow: "hidden" }}>
                    <div style={{ width: `${Math.max(6, (m.volume / muscleMax) * 100)}%`, height: 8, borderRadius: 4, background: LIME }} />
                  </div>
                </div>
              ))}
            </div>
          </ChartFrame>
        )}

        {series.length > 1 && (
          <ChartFrame title={`${topLift} · e1RM`} kicker="Trend across your logs">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={series}>
                <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
                <XAxis dataKey="w" stroke={ASH} style={{ ...mono, fontSize: 11 }} />
                <YAxis stroke={ASH} style={{ ...mono, fontSize: 11 }} domain={["auto", "auto"]} />
                <Tooltip contentStyle={tip} />
                <Line type="monotone" dataKey="e1rm" stroke={LIME} strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartFrame>
        )}
      </div>

      {paceData.length > 1 && (
        <ChartFrame title={`${runMove} · pace`} kicker="Lower is faster · across your logs">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={paceData}>
              <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
              <XAxis dataKey="w" stroke={ASH} style={{ ...mono, fontSize: 11 }} />
              <YAxis
                stroke={ASH}
                style={{ ...mono, fontSize: 11 }}
                reversed
                domain={["auto", "auto"]}
                tickFormatter={(v: number) => paceClock(v)}
                width={48}
              />
              <Tooltip contentStyle={tip} formatter={(v) => `${paceClock(Number(v))} /km`} />
              <Line type="monotone" dataKey="pace" name="pace" stroke={BLUE} strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>
      )}

      {/* Per-exercise breakdown */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {session.blocks.map((b, i) => (
          <Card key={i}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ ...disp, fontWeight: 700, fontSize: 16 }}>
                {prSet.has(b.name) ? "🏆 " : ""}
                {onOpenExercise && b.kind !== "conditioning" ? (
                  <button
                    onClick={() => onOpenExercise(b.name)}
                    style={{ ...disp, fontWeight: 700, fontSize: 16, color: txt(LIME), background: "none", border: "none", padding: 0, cursor: "pointer" }}
                    title="Open this exercise's dashboard"
                  >
                    {b.name} ›
                  </button>
                ) : (
                  b.name
                )}
                {ssLabels[i] && <span style={{ ...mono, fontSize: 11, color: txt(LIME), marginLeft: 8 }}>⛓ {ssLabels[i]}</span>}
              </div>
              {b.kind === "strength" && blockBestE1rm(b) > 0 && (
                <Mono s={{ fontSize: 13 }} c={LIME}>{fmtWeight(blockBestE1rm(b), units)} e1RM</Mono>
              )}
            </div>
            {b.kind === "strength" ? (
              <div style={{ marginTop: 8 }}>
                {b.sets.map((st, j) => {
                  const sType = setType(st);
                  const sAccent = sType === "warmup" ? AMBER : sType === "cooldown" ? BLUE : sType === "drop" ? LIME : ASH;
                  const sTag = sType === "warmup" ? " · warm-up" : sType === "cooldown" ? " · cool-down" : sType === "drop" ? " · drop" : "";
                  return (
                  <div key={j} style={{ display: "flex", gap: 16, padding: "4px 0", borderTop: j ? `1px solid ${LINE}` : undefined }}>
                    <Mono s={{ fontSize: 13, width: 22 }} c={sAccent}>{setTypeBadge(st, j)}</Mono>
                    <Mono s={{ fontSize: 13, flex: 1 }} c={CHALK}>{st.load ? `${displayLoad(st.load, units)} ${units}` : "–"} × {st.reps || "–"}{sTag}</Mono>
                    {st.rpe ? <Mono s={{ fontSize: 13 }}>RPE {st.rpe}</Mono> : null}
                    {st.vel ? <Mono s={{ fontSize: 13 }} c={BLUE}>{st.vel} m/s</Mono> : null}
                  </div>
                  );
                })}
              </div>
            ) : (
              <Mono s={{ fontSize: 13, display: "block", marginTop: 8 }}>{blockSummary(b)}</Mono>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

// Roles & access moved to the admin Governance → Access control screen
// (components/admin/access.tsx). The plan/entitlement matrix lives in the admin
// Business → Financials console. The user-facing Roles screen was retired.
