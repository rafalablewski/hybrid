"use client";

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
} from "@/lib/ui";
import {
  buildMacrocycle,
  currentPhase,
  prescribeSession,
  SAMPLE_TRAINING_LOG,
  SAMPLE_BIOMETRICS,
} from "@hybrid/core";

// ---------- data (ported from reference/HybridWeb.jsx) ----------
const STRENGTH = [
  { w: "Wk1", squat: 142, bench: 110, dl: 180 },
  { w: "Wk2", squat: 146, bench: 112, dl: 184 },
  { w: "Wk3", squat: 145, bench: 113, dl: 184 },
  { w: "Wk4", squat: 151, bench: 116, dl: 188 },
  { w: "Wk5", squat: 154, bench: 118, dl: 192 },
];
const ENGINE = [
  { w: "Wk1", pace: 118, vo2: 51 },
  { w: "Wk2", pace: 116, vo2: 52 },
  { w: "Wk3", pace: 115, vo2: 53 },
  { w: "Wk4", pace: 113, vo2: 54 },
  { w: "Wk5", pace: 112, vo2: 55 },
];
const LOADVOL = [
  { w: "Wk1", load: 60, vol: 90 },
  { w: "Wk2", load: 64, vol: 88 },
  { w: "Wk3", load: 68, vol: 82 },
  { w: "Wk4", load: 40, vol: 45 },
  { w: "Wk5", load: 80, vol: 65 },
];
const READINESS = [
  { d: "M", r: 82 },
  { d: "T", r: 74 },
  { d: "W", r: 68 },
  { d: "T", r: 79 },
  { d: "F", r: 86 },
  { d: "S", r: 72 },
  { d: "S", r: 90 },
];
const PRS = [
  { lift: "Back Squat", e1rm: "154 kg", chg: "+12", when: "May 28" },
  { lift: "Deadlift", e1rm: "192 kg", chg: "+12", when: "May 26" },
  { lift: "Bench Press", e1rm: "118 kg", chg: "+8", when: "May 24" },
  { lift: "2k Row", e1rm: "1:52 /500", chg: "−6s", when: "May 22" },
  { lift: "Front Squat", e1rm: "120 kg", chg: "+5", when: "May 19" },
];

const ROSTER = [
  { name: "Marek W.", goal: "Hyrox", readiness: 82, adherence: 94, trend: "up", injury: null },
  { name: "Ola K.", goal: "Powerlifting", readiness: 61, adherence: 88, trend: "flat", injury: "Lower back" },
  { name: "Tomasz R.", goal: "Bodybuilding", readiness: 90, adherence: 100, trend: "up", injury: null },
  { name: "Ewa S.", goal: "Hybrid", readiness: 45, adherence: 62, trend: "down", injury: "Right knee" },
  { name: "Piotr L.", goal: "Triathlon", readiness: 75, adherence: 91, trend: "up", injury: null },
];
const COACH_PROGRESS = [
  { w: "Wk1", avg: 71 },
  { w: "Wk2", avg: 73 },
  { w: "Wk3", avg: 72 },
  { w: "Wk4", avg: 76 },
  { w: "Wk5", avg: 79 },
];

const MAU = [
  { m: "Jan", u: 3800 },
  { m: "Feb", u: 5200 },
  { m: "Mar", u: 7100 },
  { m: "Apr", u: 9800 },
  { m: "May", u: 13400 },
  { m: "Jun", u: 17900 },
];
const RETENTION = [
  { d: "D1", r: 100 },
  { d: "D7", r: 68 },
  { d: "D14", r: 54 },
  { d: "D30", r: 43 },
  { d: "D60", r: 38 },
  { d: "D90", r: 35 },
];
const PLAN_POP = [
  { p: "Hybrid Base", n: 4200 },
  { p: "PPL", n: 3800 },
  { p: "Hyrox Prep", n: 2900 },
  { p: "Lin. Prog.", n: 2400 },
  { p: "Tri Strength", n: 1600 },
];
const LANG_SPLIT = [
  { l: "English", n: 58 },
  { l: "Polski", n: 28 },
  { l: "Deutsch", n: 14 },
];

// ---------- ANALYTICS: ATHLETE ----------
export function AthleteAnalytics() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
      <Stat label="Squat e1RM" value="154kg" sub="+12 / 5wk" c={LIME} />
      <Stat label="2k Row" value="1:52" sub="−6s / 5wk" c={BLUE} />
      <Stat label="Weekly volume" value="18.2k" sub="kg" />
      <Stat label="Adherence" value="94%" sub="+4%" c={LIME} />

      <ChartFrame span={2} title="Strength e1RM" kicker="Cross-domain · strength">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={STRENGTH}>
            <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
            <XAxis dataKey="w" stroke={ASH} style={{ ...mono, fontSize: 11 }} />
            <YAxis stroke={ASH} style={{ ...mono, fontSize: 11 }} />
            <Tooltip contentStyle={tip} />
            <Line type="monotone" dataKey="squat" stroke={LIME} strokeWidth={2.5} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="bench" stroke={VIOLET} strokeWidth={2.5} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="dl" stroke={AMBER} strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
        <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
          <Chip c={LIME}>Squat</Chip>
          <Chip c={VIOLET}>Bench</Chip>
          <Chip c={AMBER}>Deadlift</Chip>
        </div>
      </ChartFrame>

      <ChartFrame span={2} title="Engine · pace & VO₂" kicker="Cross-domain · conditioning" c={BLUE}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={ENGINE}>
            <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
            <XAxis dataKey="w" stroke={ASH} style={{ ...mono, fontSize: 11 }} />
            <YAxis stroke={ASH} style={{ ...mono, fontSize: 11 }} />
            <Tooltip contentStyle={tip} />
            <Line type="monotone" dataKey="vo2" stroke={BLUE} strokeWidth={2.5} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="pace" stroke={LIME} strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
        <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
          <Chip c={BLUE}>VO₂ max</Chip>
          <Chip c={LIME}>2k pace (s)</Chip>
        </div>
      </ChartFrame>

      <ChartFrame span={2} title="Load vs volume · macrocycle" kicker="Periodization" c={AMBER}>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={LOADVOL}>
            <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
            <XAxis dataKey="w" stroke={ASH} style={{ ...mono, fontSize: 11 }} />
            <YAxis stroke={ASH} style={{ ...mono, fontSize: 11 }} />
            <Tooltip contentStyle={tip} />
            <Area type="monotone" dataKey="vol" stroke={BLUE} fill={`${BLUE}22`} strokeWidth={2} />
            <Area type="monotone" dataKey="load" stroke={AMBER} fill={`${AMBER}22`} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
        <Mono s={{ fontSize: 11, display: "block", marginTop: 6 }}>
          Wk4 deload visible — volume &amp; intensity both drop.
        </Mono>
      </ChartFrame>

      <ChartFrame span={2} title="Readiness · last 7 days" kicker="Recovery">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={READINESS}>
            <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
            <XAxis dataKey="d" stroke={ASH} style={{ ...mono, fontSize: 11 }} />
            <YAxis stroke={ASH} domain={[0, 100]} style={{ ...mono, fontSize: 11 }} />
            <Tooltip contentStyle={tip} />
            <Bar dataKey="r" fill={LIME} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>

      <ChartFrame span={4} title="Personal records" kicker="All-time">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Lift", "Best", "Change", "When"].map((h) => (
                <th
                  key={h}
                  style={{
                    ...mono,
                    fontSize: 11,
                    color: ASH,
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
            {PRS.map((p) => (
              <tr key={p.lift}>
                <td style={{ ...disp, fontWeight: 600, fontSize: 14, padding: "12px 0", borderBottom: `1px solid ${LINE}` }}>
                  {p.lift}
                </td>
                <td style={{ ...mono, fontSize: 14, color: CHALK, padding: "12px 0", borderBottom: `1px solid ${LINE}` }}>
                  {p.e1rm}
                </td>
                <td style={{ ...mono, fontSize: 14, padding: "12px 0", borderBottom: `1px solid ${LINE}` }}>
                  <span style={{ color: LIME }}>{p.chg}</span>
                </td>
                <td style={{ ...mono, fontSize: 13, color: ASH, padding: "12px 0", borderBottom: `1px solid ${LINE}` }}>
                  {p.when}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ChartFrame>
    </div>
  );
}

// ---------- ANALYTICS: COACH ----------
export function CoachAnalytics() {
  const flagged = ROSTER.filter((c) => c.injury).length;
  const avgAdh = Math.round(ROSTER.reduce((s, c) => s + c.adherence, 0) / ROSTER.length);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
      <Stat label="Clients" value={ROSTER.length} c={VIOLET} />
      <Stat label="Flagged" value={flagged} sub="injuries" c={RED} />
      <Stat label="Avg adherence" value={avgAdh + "%"} sub="+3%" c={LIME} />
      <Stat
        label="Avg readiness"
        value={Math.round(ROSTER.reduce((s, c) => s + c.readiness, 0) / ROSTER.length)}
        c={BLUE}
      />

      <ChartFrame span={2} title="Roster average readiness" kicker="Across all clients" c={VIOLET}>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={COACH_PROGRESS}>
            <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
            <XAxis dataKey="w" stroke={ASH} style={{ ...mono, fontSize: 11 }} />
            <YAxis stroke={ASH} domain={[60, 90]} style={{ ...mono, fontSize: 11 }} />
            <Tooltip contentStyle={tip} />
            <Area type="monotone" dataKey="avg" stroke={VIOLET} fill={`${VIOLET}22`} strokeWidth={2.5} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartFrame>

      <ChartFrame span={2} title="Adherence by client" kicker="This week">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={ROSTER} layout="vertical" margin={{ left: 20 }}>
            <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
            <XAxis type="number" domain={[0, 100]} stroke={ASH} style={{ ...mono, fontSize: 11 }} />
            <YAxis type="category" dataKey="name" stroke={ASH} width={70} style={{ ...mono, fontSize: 10 }} />
            <Tooltip contentStyle={tip} />
            <Bar dataKey="adherence" fill={LIME} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>

      <ChartFrame span={4} title="Client roster" kicker="Status grid" c={VIOLET}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Athlete", "Goal", "Readiness", "Adherence", "Trend", "Flag"].map((h) => (
                <th
                  key={h}
                  style={{
                    ...mono,
                    fontSize: 11,
                    color: ASH,
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
            {ROSTER.map((c) => (
              <tr key={c.name}>
                <td style={{ ...disp, fontWeight: 600, fontSize: 14, padding: "12px 0", borderBottom: `1px solid ${LINE}` }}>
                  {c.name}
                </td>
                <td style={{ padding: "12px 0", borderBottom: `1px solid ${LINE}` }}>
                  <Chip c={ASH}>{c.goal}</Chip>
                </td>
                <td
                  style={{
                    ...mono,
                    fontSize: 14,
                    padding: "12px 0",
                    borderBottom: `1px solid ${LINE}`,
                    color: c.readiness > 70 ? LIME : c.readiness > 50 ? AMBER : RED,
                  }}
                >
                  {c.readiness}
                </td>
                <td style={{ ...mono, fontSize: 14, color: CHALK, padding: "12px 0", borderBottom: `1px solid ${LINE}` }}>
                  {c.adherence}%
                </td>
                <td
                  style={{
                    ...mono,
                    fontSize: 14,
                    padding: "12px 0",
                    borderBottom: `1px solid ${LINE}`,
                    color: c.trend === "up" ? LIME : c.trend === "down" ? RED : ASH,
                  }}
                >
                  {c.trend === "up" ? "↗" : c.trend === "down" ? "↘" : "→"}
                </td>
                <td style={{ padding: "12px 0", borderBottom: `1px solid ${LINE}` }}>
                  {c.injury ? <Chip c={RED}>{c.injury}</Chip> : <Mono s={{ fontSize: 13 }}>—</Mono>}
                </td>
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
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
      <Stat label="Total users" value="17.9k" sub="+34% MoM" c={LIME} />
      <Stat label="MAU" value="11.3k" sub="+28%" c={LIME} />
      <Stat label="D30 retention" value="43%" sub="vs 5% category" c={LIME} />
      <Stat label="Coaches" value="214" sub="avg 13 clients" c={VIOLET} />

      <ChartFrame span={2} title="Monthly active users" kicker="Growth" c={LIME}>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={MAU}>
            <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
            <XAxis dataKey="m" stroke={ASH} style={{ ...mono, fontSize: 11 }} />
            <YAxis stroke={ASH} style={{ ...mono, fontSize: 11 }} />
            <Tooltip contentStyle={tip} />
            <Area type="monotone" dataKey="u" stroke={LIME} fill={`${LIME}22`} strokeWidth={2.5} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartFrame>

      <ChartFrame span={2} title="Retention cohort" kicker="The number that matters" c={BLUE}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={RETENTION}>
            <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
            <XAxis dataKey="d" stroke={ASH} style={{ ...mono, fontSize: 11 }} />
            <YAxis stroke={ASH} domain={[0, 100]} style={{ ...mono, fontSize: 11 }} />
            <Tooltip contentStyle={tip} />
            <Line type="monotone" dataKey="r" stroke={BLUE} strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
        <Mono s={{ fontSize: 11, display: "block", marginTop: 6 }}>
          D30 holds at 43% — ~8× the consumer-fitness norm.
        </Mono>
      </ChartFrame>

      <ChartFrame span={2} title="Plan popularity" kicker="Enrollments">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={PLAN_POP}>
            <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
            <XAxis dataKey="p" stroke={ASH} style={{ ...mono, fontSize: 10 }} />
            <YAxis stroke={ASH} style={{ ...mono, fontSize: 11 }} />
            <Tooltip contentStyle={tip} />
            <Bar dataKey="n" fill={LIME} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>

      <ChartFrame span={2} title="Language split" kicker="User base" c={AMBER}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 8 }}>
          {LANG_SPLIT.map((l) => (
            <div key={l.l}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <Mono s={{ fontSize: 13 }} c={CHALK}>
                  {l.l}
                </Mono>
                <Mono s={{ fontSize: 13 }} c={AMBER}>
                  {l.n}%
                </Mono>
              </div>
              <div style={{ height: 10, borderRadius: 5, background: INK2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${l.n}%`, background: AMBER, borderRadius: 5 }} />
              </div>
            </div>
          ))}
        </div>
      </ChartFrame>
    </div>
  );
}

// ---------- DASHBOARD (mirror of the mobile home) ----------
// Real engine output from @hybrid/core — not mock copy.
const SEASON_WEEK = 5;

export function DashboardMirror() {
  const macro = buildMacrocycle("Hybrid");
  const { block: phase, micro } = currentPhase(macro, SEASON_WEEK);
  const rx = prescribeSession(SAMPLE_TRAINING_LOG, SAMPLE_BIOMETRICS);
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
      </Card>
      <Card span={2}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }}>This week</Mono>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 10, marginTop: 14 }}>
          {(
            [
              ["Mon", "Lower+Engine", 1],
              ["Tue", "Easy Run", 0],
              ["Wed", "Rest", -1],
              ["Thu", "Upper", 1],
              ["Fri", "Intervals", 0],
              ["Sat", "Long", 0],
              ["Sun", "Rest", -1],
            ] as const
          ).map(([d, s, k]) => (
            <div
              key={d}
              style={{
                textAlign: "center",
                padding: "12px 4px",
                borderRadius: 10,
                background: k === 1 ? `${LIME}1a` : INK2,
                border: `1px solid ${k === 1 ? LIME : LINE}`,
              }}
            >
              <Mono s={{ fontSize: 10, textTransform: "uppercase" }}>{d}</Mono>
              <div
                style={{
                  fontFamily: "'Archivo Narrow', sans-serif",
                  fontSize: 12,
                  fontWeight: 600,
                  marginTop: 6,
                  color: k === -1 ? ASH : CHALK,
                }}
              >
                {s}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ---------- PERIODIZE (real macrocycle from the engine) ----------
export function PeriodizeScreen() {
  const macro = buildMacrocycle("Hybrid");
  const { block: current } = currentPhase(macro, SEASON_WEEK);

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>
          {macro.goalOrSport} · {macro.model}
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
              <div style={{ ...disp, fontWeight: 800, fontSize: 18, color: b.color }}>{b.label}</div>
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
                    background: m.week === SEASON_WEEK ? `${LIME}1a` : INK2,
                    border: `1px solid ${m.week === SEASON_WEEK ? LIME : LINE}`,
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
          color: no ? ASH : yes ? LIME : AMBER,
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
            <div style={{ ...disp, fontWeight: 800, fontSize: 18, color: c }}>{n}</div>
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
                    color: i === 0 ? ASH : i === 1 ? LIME : i === 2 ? VIOLET : AMBER,
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
