"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { fs, space,
  INK2,
  LINE,
  LIME,
  CHALK,
  ASH,
  BLUE,
  VIOLET,
  AMBER,
  disp,
  cond,
  mono,
  tip,
  Mono,
  Card,
  ChartFrame,
} from "@/lib/ui";

type Athlete = {
  linkId: string;
  name: string;
  e1rm: number;
  bestVel: number;
  volume: number;
  reps: number;
  sessions: number;
  estVel1rm: number;
};

type CompareResponse = { lift: string | null; lifts: string[]; athletes: Athlete[] };

const METRICS = [
  { key: "e1rm", label: "Best e1RM", unit: "kg", color: LIME },
  { key: "estVel1rm", label: "1RM (velocity)", unit: "kg", color: VIOLET },
  { key: "bestVel", label: "Best bar speed", unit: "m/s", color: BLUE },
  { key: "volume", label: "Total volume", unit: "kg", color: AMBER },
  { key: "reps", label: "Total reps", unit: "", color: ASH },
] as const;

type MetricKey = (typeof METRICS)[number]["key"];

export default function TeamCompare() {
  const [data, setData] = useState<CompareResponse | null>(null);
  const [lift, setLift] = useState<string>("");
  const [metric, setMetric] = useState<MetricKey>("e1rm");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const q = lift ? `?lift=${encodeURIComponent(lift)}` : "";
    fetch(`/api/coach/compare${q}`)
      .then((r) => (r.ok ? r.json() : { lift: null, lifts: [], athletes: [] }))
      .then((d: CompareResponse) => {
        setData(d);
        if (!lift && d.lift) setLift(d.lift);
      })
      .catch(() => setData({ lift: null, lifts: [], athletes: [] }))
      .finally(() => setLoading(false));
  }, [lift]);

  const meta = METRICS.find((m) => m.key === metric)!;
  const athletes = data?.athletes ?? [];
  const lifts = data?.lifts ?? [];

  const chartData = useMemo(
    () =>
      [...athletes]
        .sort((a, b) => (b[metric] as number) - (a[metric] as number))
        .map((a) => ({ name: a.name, value: a[metric] as number })),
    [athletes, metric],
  );

  if (loading)
    return <Mono s={{ fontSize: fs.body }}>Loading roster…</Mono>;

  if (athletes.length === 0)
    return (
      <Card style={{ borderLeft: `3px solid ${AMBER}` }}>
        <div style={{ ...disp, fontWeight: 700, fontSize: 17, marginBottom: 6 }}>
          No comparable athletes yet
        </div>
        <Mono s={{ fontSize: fs.body, lineHeight: 1.6 }}>
          Team Compare lines up your athletes side by side on any lift — best e1RM, the
          velocity-based 1RM, bar speed, volume and reps. It reads your <b>active roster</b>
          {" "}(Coach screen → accepted clients) and computes from their real logged sessions.
          Invite and connect athletes, have them log strength work, and they&apos;ll appear here.
        </Mono>
      </Card>
    );

  return (
    <div>
      {/* lift + metric selectors */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: space.lg, marginBottom: 16 }}>
        <div>
          <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 6 }}>
            Exercise
          </Mono>
          <div style={{ display: "flex", flexWrap: "wrap", gap: space.xs }}>
            {lifts.map((l) => (
              <button
                key={l}
                onClick={() => setLift(l)}
                style={pill(lift === l, LIME)}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 6 }}>
            Metric
          </Mono>
          <div style={{ display: "flex", flexWrap: "wrap", gap: space.xs }}>
            {METRICS.map((m) => (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                style={pill(metric === m.key, m.color)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ChartFrame title={`${data?.lift ?? lift} · ${meta.label}`} kicker="team comparison" c={meta.color}>
        <ResponsiveContainer width="100%" height={Math.max(160, chartData.length * 46)}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 16, right: 24 }}>
            <CartesianGrid stroke={LINE} strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tick={{ fill: ASH, fontSize: fs.micro }} stroke={LINE} />
            <YAxis
              type="category"
              dataKey="name"
              width={90}
              tick={{ fill: ASH, fontSize: fs.caption }}
              stroke={LINE}
            />
            <Tooltip
              contentStyle={tip}
              cursor={{ fill: `${meta.color}14` }}
              formatter={(v) => [`${v}${meta.unit ? " " + meta.unit : ""}`, meta.label]}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={meta.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>

      {/* full table */}
      <Card style={{ marginTop: 16, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", ...mono, fontSize: fs.body }}>
          <thead>
            <tr style={{ textAlign: "left", color: ASH }}>
              <th style={th}>Athlete</th>
              <th style={thR}>e1RM</th>
              <th style={thR}>1RM (vel)</th>
              <th style={thR}>Bar speed</th>
              <th style={thR}>Volume</th>
              <th style={thR}>Reps</th>
              <th style={thR}>Sessions</th>
            </tr>
          </thead>
          <tbody>
            {[...athletes]
              .sort((a, b) => (b[metric] as number) - (a[metric] as number))
              .map((a) => (
                <tr key={a.linkId} style={{ borderTop: `1px solid ${LINE}` }}>
                  <td style={{ ...td, color: CHALK }}>{a.name}</td>
                  <td style={tdR}>{a.e1rm || "—"} {a.e1rm ? "kg" : ""}</td>
                  <td style={tdR}>{a.estVel1rm || "—"} {a.estVel1rm ? "kg" : ""}</td>
                  <td style={tdR}>{a.bestVel || "—"} {a.bestVel ? "m/s" : ""}</td>
                  <td style={tdR}>{a.volume.toLocaleString()} kg</td>
                  <td style={tdR}>{a.reps}</td>
                  <td style={tdR}>{a.sessions}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function pill(active: boolean, c: string) {
  return {
    ...cond,
    fontSize: fs.body,
    fontWeight: 700,
    padding: "6px 14px",
    borderRadius: 999,
    cursor: "pointer",
    border: `1px solid ${active ? c : LINE}`,
    background: active ? `${c}1a` : "transparent",
    color: active ? c : ASH,
  } as const;
}

const th = { padding: "0 0 8px", fontWeight: 600, textTransform: "uppercase" as const, fontSize: fs.nano, letterSpacing: ".08em" };
const thR = { ...th, textAlign: "right" as const };
const td = { padding: "9px 0" };
const tdR = { ...td, textAlign: "right" as const, color: ASH };
