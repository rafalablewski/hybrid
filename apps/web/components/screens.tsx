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
import { fmtWeight, fmtTonnage, displayLoad, kgToUnit } from "@hybrid/core";
import {
  buildMacrocycle,
  currentPhase,
  prescribeSession,
  computePerformanceState,
  computeInjuryRisk,
  toTrainingLog,
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
import BioCheckin from "./biocheckin";
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
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
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
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
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
  const avgAdh = Math.round(roster.reduce((s, c) => s + c.adherence, 0) / roster.length);
  const reads = roster.filter((c) => typeof c.readiness === "number");
  const avgRead = reads.length
    ? Math.round(reads.reduce((s, c) => s + (c.readiness ?? 0), 0) / reads.length)
    : null;
  const totalVol = roster.reduce((s, c) => s + c.volume, 0);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
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
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
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
      </ChartFrame>
    </div>
  );
}

// ---------- ANALYTICS: OPERATOR (admin) ----------
export function OperatorAnalytics() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [err, setErr] = useState(false);
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
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
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

// ---------- DASHBOARD (mirror of the mobile home) ----------
// Real engine output from @hybrid/core — not mock copy.
const SEASON_WEEK = 5;

export function DashboardMirror({
  sessions = [],
  bio,
  onCheckin,
}: {
  sessions?: LoggedSession[];
  bio?: Biometrics | null;
  onCheckin?: () => void;
}) {
  if (sessions.length === 0)
    return (
      <Card style={{ textAlign: "center", padding: 60 }}>
        <div style={{ ...disp, fontWeight: 800, fontSize: 20 }}>Your dashboard is empty</div>
        <Mono s={{ fontSize: 14, display: "block", marginTop: 10, maxWidth: 460, marginInline: "auto", lineHeight: 1.6 }}>
          Log a workout from the <b style={{ color: txt(LIME) }}>Log session</b> tab — your route, Athlete
          Twin, injury risk and trends are all computed from your real sessions.
        </Mono>
      </Card>
    );

  const macro = buildMacrocycle("Hybrid");
  const { block: phase, micro } = currentPhase(macro, SEASON_WEEK);
  const log = toTrainingLog(sessions);
  const theBio = bio ?? undefined;
  const rx = prescribeSession(log, theBio);
  const state = computePerformanceState(log, theBio);
  const risk = computeInjuryRisk(log, theBio);
  const primaryName = rx.blocks[0]!.name;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
      <Card style={{ borderLeft: `3px solid ${LIME}` }}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>
          Training for · {macro.goalOrSport} · {phase.label} phase
        </Mono>
        <div style={{ ...disp, fontWeight: 900, fontSize: 26, margin: "8px 0 4px" }}>
          Today · {primaryName} + Engine
        </div>
        <Mono s={{ fontSize: 13 }}>
          Week {SEASON_WEEK} of {macro.totalWeeks} · {micro.kind} week · {phase.focus.toLowerCase()}
        </Mono>
        <div style={{ display: "flex", gap: 3, height: 8, borderRadius: 4, overflow: "hidden", margin: "16px 0" }}>
          {macro.blocks.map((b) => (
            <div
              key={b.key}
              title={`${b.label} · ${b.weeks} wk`}
              style={{
                flex: b.weeks,
                background: b.key === phase.key ? b.color : `${b.color}33`,
              }}
            />
          ))}
        </div>
        <button
          style={{
            fontFamily: "'Archivo', sans-serif",
            fontWeight: 800,
            fontSize: 15,
            background: LIME,
            color: INK2,
            border: "none",
            borderRadius: 12,
            padding: "14px 28px",
            cursor: "pointer",
          }}
        >
          Start session →
        </button>
      </Card>
      <Card style={{ borderLeft: `3px solid ${VIOLET}` }}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={VIOLET}>
          AI Coach
        </Mono>
        <div style={{ ...disp, fontWeight: 700, fontSize: 18, margin: "8px 0 6px" }}>
          Readiness {rx.readiness}/100
        </div>
        <Mono s={{ fontSize: 13, lineHeight: 1.5 }}>{rx.why}</Mono>
        <Mono s={{ fontSize: 11, display: "block", marginTop: 10 }} c={ASH}>
          confidence {Math.round(rx.confidence * 100)}% · grows as you log
        </Mono>
        <AskCoach />
      </Card>

      <Card span={2} style={{ borderLeft: `3px solid ${BLUE}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={BLUE}>
              Performance State · Athlete Twin
            </Mono>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, margin: "8px 0 2px" }}>
              <div style={{ ...disp, fontWeight: 900, fontSize: 44, color: txt(BAND_COLOR(state.hpi.band)) }}>
                {state.hpi.score}
              </div>
              <div>
                <Mono s={{ fontSize: 13 }}>HPI · Hybrid Performance Index</Mono>
                <div style={{ marginTop: 4 }}>
                  <Chip c={BAND_COLOR(state.hpi.band)}>{state.hpi.band}</Chip>
                  <Chip c={AMBER}>limiter · {state.hpi.limiter}</Chip>
                </div>
              </div>
            </div>
          </div>
          <div style={{ minWidth: 200, flex: 1, maxWidth: 320 }}>
            {(
              [
                ["Strength", state.hpi.components.strength, LIME],
                ["Endurance", state.hpi.components.endurance, BLUE],
                ["Recovery", Math.max(0, Math.min(100, Math.round(50 + state.hpi.components.recovery * (50 / 15)))), VIOLET],
              ] as const
            ).map(([label, val, color]) => (
              <div key={label} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <Mono s={{ fontSize: 11 }}>{label}</Mono>
                  <Mono s={{ fontSize: 11 }} c={color}>{val}</Mono>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: INK2, marginTop: 3, overflow: "hidden" }}>
                  <div style={{ width: `${val}%`, height: "100%", background: color }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <Mono s={{ fontSize: 13, lineHeight: 1.5, display: "block", margin: "6px 0 12px" }} c={CHALK}>
          {state.summary}
        </Mono>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em" }} c={ASH}>Why · top drivers</Mono>
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              {state.drivers.map((d, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                  <span style={{ color: txt(d.impact === "positive" ? LIME : AMBER), fontWeight: 900 }}>
                    {d.impact === "positive" ? "+" : "−"}
                  </span>
                  <Mono s={{ fontSize: 12 }} c={CHALK}>{d.factor}</Mono>
                  <Mono s={{ fontSize: 11 }} c={ASH}>{d.detail}</Mono>
                </div>
              ))}
            </div>
          </div>
          <div>
            <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em" }} c={ASH}>Injury risk · by tissue</Mono>
            <div style={{ marginTop: 8 }}>
              {risk.flagged.length === 0 ? (
                <Mono s={{ fontSize: 12 }} c={LIME}>No tissues flagged · overall {risk.overall}/100 ({risk.band})</Mono>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {risk.flagged.map((t) => (
                    <div key={t.tissue} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                      <Chip c={BAND_COLOR(t.band)}>{t.risk}</Chip>
                      <Mono s={{ fontSize: 12, textTransform: "capitalize" }} c={CHALK}>{t.tissue}</Mono>
                      <Mono s={{ fontSize: 11 }} c={ASH}>{t.drivers[0]?.label ?? ""}</Mono>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      {onCheckin && <BioCheckin onSaved={onCheckin} />}

    </div>
  );
}

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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
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
function SessionDetail({
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
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

      <div style={{ display: "grid", gridTemplateColumns: series.length > 1 ? "repeat(2, 1fr)" : "1fr", gap: 16 }}>
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

// ---------- ROLES & ACCESS (the permission model) ----------
const PERMISSIONS = [
  { cap: "Own training data & analytics", client: "full", coach: "own", admin: "no" },
  { cap: "Other athletes' data", client: "no", coach: "consented only", admin: "aggregate" },
  { cap: "Leave coaching notes", client: "no", coach: "yes (+private)", admin: "no" },
  { cap: "Private coach notes visible", client: "no", coach: "own", admin: "no" },
  { cap: "Adjust someone's plan", client: "no", coach: "consented only", admin: "no" },
  { cap: "Platform metrics (MAU, retention)", client: "no", coach: "no", admin: "yes" },
  { cap: "Manage content & languages", client: "no", coach: "no", admin: "yes" },
  { cap: "Manage accounts & verify coaches", client: "no", coach: "no", admin: "yes" },
];

export function RolesScreen() {
  const cell = (v: string) => {
    const yes = v === "full" || v === "yes" || v === "yes (+private)";
    const no = v === "no";
    return (
      <td
        style={{
          ...mono,
          fontSize: 12,
          textAlign: "center",
          padding: "11px 6px",
          borderBottom: `1px solid ${LINE}`,
          color: txt(no ? ASH : yes ? LIME : AMBER),
        }}
      >
        {no ? "—" : v}
      </td>
    );
  };

  return (
    <div>
      <Mono s={{ fontSize: 13, display: "block", marginBottom: 18 }}>
        Three roles, each scoped. Access is enforced server-side by <i>relationship</i>, not role
        label alone.
      </Mono>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 20 }}>
        {(
          [
            ["Client", LIME, "Owns their own data. Sees only themselves. Private coach notes stay hidden."],
            ["Coach", VIOLET, "Sees only athletes who accepted them (mutual consent). Can leave private notes. Also a client."],
            ["Admin", AMBER, "Platform aggregates & content. No silent access to private training data; support access is audited."],
          ] as const
        ).map(([n, c, d]) => (
          <Card key={n} style={{ borderLeft: `3px solid ${c}` }}>
            <div style={{ ...disp, fontWeight: 800, fontSize: 18, color: txt(c) }}>{n}</div>
            <Mono s={{ fontSize: 13, lineHeight: 1.5, display: "block", marginTop: 8 }} c={CHALK}>
              {d}
            </Mono>
          </Card>
        ))}
      </div>
      <Card>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 14 }}>
          Permission matrix
        </Mono>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Capability", "Client", "Coach", "Admin"].map((h, i) => (
                <th
                  key={h}
                  style={{
                    ...mono,
                    fontSize: 11,
                    color: txt(i === 0 ? ASH : i === 1 ? LIME : i === 2 ? VIOLET : AMBER),
                    textTransform: "uppercase",
                    textAlign: i === 0 ? "left" : "center",
                    padding: "8px 6px",
                    borderBottom: `1px solid ${LINE}`,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS.map((p) => (
              <tr key={p.cap}>
                <td style={{ ...disp, fontWeight: 600, fontSize: 13, padding: "11px 6px", borderBottom: `1px solid ${LINE}` }}>
                  {p.cap}
                </td>
                {cell(p.client)}
                {cell(p.coach)}
                {cell(p.admin)}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
