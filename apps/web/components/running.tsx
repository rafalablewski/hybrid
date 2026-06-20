"use client";

import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  runTotals,
  runStats,
  weeklyMileage,
  paceEffortSplit,
  pacedRunMoves,
  paceSeries,
  paceClock,
  type LoggedSession,
} from "@hybrid/core";
import { INK2, LINE, LIME, CHALK, ASH, BLUE, AMBER, RED, disp, mono, tip, Mono, Card, ChartFrame, Select } from "@/lib/ui";

const fmtWeek = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function Stat({ label, value, c = CHALK }: { label: string; value: string | number; c?: string }) {
  return (
    <Card>
      <div style={{ ...disp, fontWeight: 800, fontSize: 26, color: c }}>{value}</div>
      <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", marginTop: 4 }}>{label}</Mono>
    </Card>
  );
}

export default function Running({ sessions }: { sessions: LoggedSession[] }) {
  const totals = useMemo(() => runTotals(sessions), [sessions]);
  const stats = useMemo(() => runStats(sessions), [sessions]);
  const mileage = useMemo(() => weeklyMileage(sessions, 8), [sessions]);
  const split = useMemo(() => paceEffortSplit(sessions), [sessions]);
  const paceMoves = useMemo(() => pacedRunMoves(sessions), [sessions]);
  const [move, setMove] = useState("");
  const active = paceMoves.includes(move) ? move : (paceMoves[0] ?? "");

  if (totals.efforts === 0) {
    return (
      <div style={{ maxWidth: 760 }}>
        <Header />
        <Card style={{ textAlign: "center", padding: 40 }}>
          <Mono s={{ fontSize: 14 }}>
            No cardio logged yet. Log a run or row (with distance + minutes) and your mileage, pace and
            easy/hard split show up here.
          </Mono>
        </Card>
      </div>
    );
  }

  const mileageData = mileage.map((w) => ({ w: fmtWeek(w.weekStart), km: w.km }));
  const paceData = active ? paceSeries(sessions, active).map((p) => ({ w: fmtWeek(p.date), pace: p.secPerKm })) : [];
  const splitTotal = split.easy + split.moderate + split.hard;
  const hasEffort = splitTotal > 0;
  const easyPct = hasEffort ? Math.round((split.easy / splitTotal) * 100) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 980 }}>
      <Header />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 140px), 1fr))", gap: 14 }}>
        <Stat label="Runs" value={totals.efforts} />
        <Stat label="Distance" value={`${totals.distanceKm} km`} c={BLUE} />
        <Stat label="Time" value={`${Math.round(totals.minutes / 6) / 10} h`} />
        {easyPct != null && <Stat label="Easy %" value={`${easyPct}%`} c={LIME} />}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        <ChartFrame title="Weekly mileage" kicker="Last 8 weeks" c={BLUE}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={mileageData}>
              <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
              <XAxis dataKey="w" stroke={ASH} style={{ ...mono, fontSize: 11 }} />
              <YAxis stroke={ASH} style={{ ...mono, fontSize: 11 }} />
              <Tooltip contentStyle={tip} formatter={(v) => `${v} km`} />
              <Bar dataKey="km" fill={BLUE} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>

        {paceData.length > 1 && (
          <ChartFrame title={`${active} · pace`} kicker="Lower is faster" c={BLUE}>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={paceData}>
                <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
                <XAxis dataKey="w" stroke={ASH} style={{ ...mono, fontSize: 11 }} />
                <YAxis stroke={ASH} style={{ ...mono, fontSize: 11 }} reversed domain={["auto", "auto"]} tickFormatter={(v: number) => paceClock(v)} width={48} />
                <Tooltip contentStyle={tip} formatter={(v) => `${paceClock(Number(v))} /km`} />
                <Line type="monotone" dataKey="pace" name="pace" stroke={BLUE} strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartFrame>
        )}
      </div>

      {/* Easy / moderate / hard split (the 80/20 lens) — only when intensity was logged */}
      {hasEffort && (
        <Card>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>
            Pace zones · minutes (from pace)
          </Mono>
          <div style={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden", marginTop: 12, background: INK2 }}>
            {([["easy", split.easy, LIME], ["moderate", split.moderate, AMBER], ["hard", split.hard, RED]] as const).map(
              ([k, v, c]) => v > 0 && <div key={k} style={{ width: `${(v / splitTotal) * 100}%`, background: c }} />,
            )}
          </div>
          <div style={{ display: "flex", gap: 18, marginTop: 10, flexWrap: "wrap" }}>
            <Legend c={LIME} label={`Easy · ${split.easy} min`} />
            <Legend c={AMBER} label={`Steady · ${split.moderate} min`} />
            <Legend c={RED} label={`Hard · ${split.hard} min`} />
          </div>
          <Mono s={{ fontSize: 11, lineHeight: 1.5, display: "block", marginTop: 10 }} c={ASH}>
            Intensity is judged from pace, relative to your best for each movement — no manual input.
          </Mono>
        </Card>
      )}

      {paceMoves.length > 1 && (
        <Card>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", display: "block", marginBottom: 6 }}>Pace chart move</Mono>
          <Select value={active} onChange={(e) => setMove(e.target.value)} style={{ width: 240 }}>
            {paceMoves.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </Select>
        </Card>
      )}

      {/* Per-move table */}
      <Card>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={BLUE}>
          By movement
        </Mono>
        <div style={{ marginTop: 12, overflowX: "auto", maxWidth: "100%" }}>
          <div style={{ minWidth: 480 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 8, paddingBottom: 6, borderBottom: `1px solid ${LINE}` }}>
            {["move", "runs", "km", "longest", "best pace"].map((h) => (
              <Mono key={h} s={{ fontSize: 10, textTransform: "uppercase" }}>{h}</Mono>
            ))}
          </div>
          {stats.map((r) => (
            <div key={r.move} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 8, padding: "8px 0", borderTop: `1px solid ${LINE}` }}>
              <Mono s={{ fontSize: 13 }} c={CHALK}>{r.move}</Mono>
              <Mono s={{ fontSize: 13 }}>{r.efforts}</Mono>
              <Mono s={{ fontSize: 13 }}>{r.distanceKm}</Mono>
              <Mono s={{ fontSize: 13 }}>{r.longestKm || "–"}</Mono>
              <Mono s={{ fontSize: 13 }} c={r.bestPaceSecPerKm != null ? BLUE : ASH}>
                {r.bestPaceSecPerKm != null ? `${paceClock(r.bestPaceSecPerKm)} /km` : "–"}
              </Mono>
            </div>
          ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

function Header() {
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ ...disp, fontWeight: 800, fontSize: 26 }}>Running</div>
      <Mono s={{ fontSize: 13, display: "block", marginTop: 4 }}>
        Mileage, pace and the easy/hard balance — read straight off your logged cardio.
      </Mono>
    </div>
  );
}

function Legend({ c, label }: { c: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: c }} />
      <Mono s={{ fontSize: 12 }}>{label}</Mono>
    </div>
  );
}
