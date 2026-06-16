"use client";

import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  exerciseHistory,
  exerciseDashboard,
  paceClock,
  type LoggedSession,
  type ExercisePeriod,
  type ExerciseStats,
} from "@hybrid/core";
import { INK2, LINE, LIME, CHALK, ASH, BLUE, disp, mono, tip, Mono, Card, ChartFrame } from "@/lib/ui";

const PERIODS: { id: ExercisePeriod; label: string }[] = [
  { id: "8w", label: "8 wk" },
  { id: "6m", label: "6 mo" },
  { id: "1y", label: "1 yr" },
  { id: "all", label: "All" },
];

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });

function Stat({ label, value, c = CHALK }: { label: string; value: string | number; c?: string }) {
  return (
    <Card>
      <div style={{ ...disp, fontWeight: 800, fontSize: 24, color: c }}>{value}</div>
      <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", marginTop: 4 }}>{label}</Mono>
    </Card>
  );
}

export default function Exercises({ sessions, focus }: { sessions: LoggedSession[]; focus?: string }) {
  const history = useMemo(() => exerciseHistory(sessions), [sessions]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string>("");
  const [period, setPeriod] = useState<ExercisePeriod>("all");

  // Focus a specific lift when the Trends hub deep-links into a movement.
  useEffect(() => {
    if (focus) setSelected(focus);
  }, [focus]);

  const active = selected || history[0]?.name || "";
  const filtered = history.filter((e) => e.name.toLowerCase().includes(query.toLowerCase()));
  const stats = useMemo(
    () => (active ? exerciseDashboard(sessions, active, period) : null),
    [sessions, active, period],
  );

  if (history.length === 0) {
    return (
      <div style={{ maxWidth: 760 }}>
        <Header />
        <Card style={{ textAlign: "center", padding: 40 }}>
          <Mono s={{ fontSize: 14 }}>No exercises logged yet. Log a workout and every movement you train gets its own progress dashboard here.</Mono>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 280px) 1fr", gap: 20, alignItems: "start", maxWidth: 1040 }}>
      {/* Exercise list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Header />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search exercises…"
          style={{ ...mono, fontSize: 13, background: INK2, color: CHALK, border: `1px solid ${LINE}`, borderRadius: 10, padding: "9px 12px" }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 560, overflowY: "auto" }}>
          {filtered.map((e) => {
            const on = e.name === active;
            return (
              <button
                key={e.name}
                onClick={() => setSelected(e.name)}
                style={{
                  textAlign: "left",
                  background: on ? `${LIME}1a` : "transparent",
                  border: `1px solid ${on ? LIME : LINE}`,
                  borderRadius: 10,
                  padding: "9px 12px",
                  cursor: "pointer",
                }}
              >
                <div style={{ ...mono, fontSize: 13, color: CHALK, fontWeight: on ? 700 : 400 }}>{e.name}</div>
                <div style={{ ...mono, fontSize: 10, color: ASH, marginTop: 2 }}>
                  {e.kind} · {e.count}×
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && <Mono s={{ fontSize: 12, padding: 8 }}>No match.</Mono>}
        </div>
      </div>

      {/* Dashboard */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div style={{ ...disp, fontWeight: 800, fontSize: 22 }}>{active}</div>
          <div style={{ display: "flex", gap: 4 }}>
            {PERIODS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                style={{
                  ...mono,
                  fontSize: 12,
                  padding: "5px 11px",
                  borderRadius: 999,
                  cursor: "pointer",
                  color: period === p.id ? LIME : ASH,
                  background: period === p.id ? `${LIME}1a` : "transparent",
                  border: `1px solid ${period === p.id ? LIME : LINE}`,
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {stats && <Dashboard stats={stats} />}
      </div>
    </div>
  );
}

function Dashboard({ stats }: { stats: ExerciseStats }) {
  if (stats.kind === "cardio") {
    const paceData = stats.pace.map((p) => ({ w: fmtDate(p.date), pace: p.secPerKm }));
    const empty = stats.efforts === 0;
    return (
      <>
        {empty ? (
          <Card style={{ textAlign: "center", padding: 32 }}>
            <Mono s={{ fontSize: 13 }}>No runs of this movement in this period.</Mono>
          </Card>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              <Stat label="Runs" value={stats.efforts} />
              <Stat label="Distance" value={`${stats.distanceKm} km`} c={BLUE} />
              <Stat label="Longest" value={`${stats.longestKm} km`} />
              <Stat label="Best pace" value={stats.bestPaceSecPerKm != null ? `${paceClock(stats.bestPaceSecPerKm)}` : "–"} c={BLUE} />
            </div>
            {paceData.length > 1 && (
              <ChartFrame title="Pace" kicker="Lower is faster" c={BLUE}>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={paceData}>
                    <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
                    <XAxis dataKey="w" stroke={ASH} style={{ ...mono, fontSize: 11 }} />
                    <YAxis stroke={ASH} style={{ ...mono, fontSize: 11 }} reversed domain={["auto", "auto"]} tickFormatter={(v: number) => paceClock(v)} width={48} />
                    <Tooltip contentStyle={tip} formatter={(v) => `${paceClock(Number(v))} /km`} />
                    <Line type="monotone" dataKey="pace" stroke={BLUE} strokeWidth={2.5} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartFrame>
            )}
          </>
        )}
      </>
    );
  }

  const e1rmData = stats.e1rm.map((p) => ({ w: fmtDate(p.date), e1rm: p.e1rm }));
  if (stats.workingSets === 0) {
    return (
      <Card style={{ textAlign: "center", padding: 32 }}>
        <Mono s={{ fontSize: 13 }}>No working sets of this lift in this period.</Mono>
      </Card>
    );
  }
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <Stat label="Best e1RM" value={`${stats.bestE1rm} kg`} c={LIME} />
        <Stat label="Working sets" value={stats.workingSets} />
        <Stat label="Volume" value={`${(stats.volume / 1000).toFixed(1)} t`} />
        <Stat label="Sessions" value={stats.sessions} />
      </div>
      {e1rmData.length > 1 ? (
        <ChartFrame title="Estimated 1RM" kicker="Working sets · warm-ups excluded" c={LIME}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={e1rmData}>
              <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
              <XAxis dataKey="w" stroke={ASH} style={{ ...mono, fontSize: 11 }} />
              <YAxis stroke={ASH} style={{ ...mono, fontSize: 11 }} domain={["auto", "auto"]} width={44} />
              <Tooltip contentStyle={tip} formatter={(v) => `${v} kg`} />
              <Line type="monotone" dataKey="e1rm" stroke={LIME} strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>
      ) : (
        <Card>
          <Mono s={{ fontSize: 12 }}>Log this lift across a few sessions to see an e1RM trend.</Mono>
        </Card>
      )}
      {stats.bestSet && (
        <Card>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>Best set</Mono>
          <div style={{ ...mono, fontSize: 15, color: CHALK, marginTop: 8 }}>
            {stats.bestSet.load} kg × {stats.bestSet.reps} <span style={{ color: ASH }}>· e1RM {stats.bestSet.e1rm} kg · {fmtDate(stats.bestSet.when)}</span>
          </div>
          <Mono s={{ fontSize: 11, color: ASH, display: "block", marginTop: 8 }}>
            {stats.totalReps} reps · heaviest {stats.heaviestLoad} kg · all-time best e1RM {stats.bestE1rmAllTime} kg
          </Mono>
        </Card>
      )}
    </>
  );
}

function Header() {
  return (
    <div>
      <div style={{ ...disp, fontWeight: 800, fontSize: 22 }}>Exercises</div>
      <Mono s={{ fontSize: 12, display: "block", marginTop: 4 }}>Open any movement for its full progress history.</Mono>
    </div>
  );
}
