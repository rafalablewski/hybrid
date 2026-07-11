"use client";

import { useEffect, useMemo, useState } from "react";
import { fs, space } from "@hybrid/core";
import { useLang } from "@/lib/i18n";

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

const C = (v: string) => `var(--color-${v})`;

const METRICS = [
  { key: "e1rm", label: "w.teams.compare.metricE1rm", unit: "kg", color: "lime" },
  { key: "estVel1rm", label: "w.teams.compare.metricVel1rm", unit: "kg", color: "violet" },
  { key: "bestVel", label: "w.teams.compare.metricBarSpeed", unit: "m/s", color: "blue" },
  { key: "volume", label: "w.teams.compare.metricVolume", unit: "kg", color: "amber" },
  { key: "reps", label: "w.teams.compare.metricReps", unit: "", color: "ash" },
] as const;

type MetricKey = (typeof METRICS)[number]["key"];

const tip = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 14, fontFamily: "var(--font-mono)", fontSize: fs.caption } as const;

/** AURORA Team Compare (web) — same /api/coach/compare flow: lines athletes up
 *  side by side on any lift across e1RM / velocity-1RM / bar speed / volume /
 *  reps, in the rounded Aurora style with themed recharts bars. */
export default function AuroraTeamCompare() {
  const { t } = useLang();
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

  const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 20 } as const;
  const kicker = (color: string): React.CSSProperties => ({ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C(color) });

  if (loading)
    return <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("ash") }}>{t("w.teams.compare.loadingRoster")}</span>;

  if (athletes.length === 0)
    return (
      <div style={{ ...card, fontFamily: "var(--font-display)", color: C("chalk") }}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, marginBottom: 6 }}>
          {t("w.teams.compare.emptyTitle")}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, lineHeight: 1.6, color: C("ash") }}>
          {t("w.teams.compare.emptyBody")}
        </div>
      </div>
    );

  return (
    <div style={{ fontFamily: "var(--font-display)", color: C("chalk") }}>
      {/* lift + metric selectors */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: space.lg, marginBottom: 16 }}>
        <div>
          <div style={{ ...kicker("ash"), fontSize: fs.nano, marginBottom: 6 }}>{t("w.teams.compare.exercise")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: space.xs }}>
            {lifts.map((l) => (
              <button key={l} onClick={() => setLift(l)} style={pill(lift === l, "lime")}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ ...kicker("ash"), fontSize: fs.nano, marginBottom: 6 }}>{t("w.teams.compare.metric")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: space.xs }}>
            {METRICS.map((m) => (
              <button key={m.key} onClick={() => setMetric(m.key)} style={pill(metric === m.key, m.color)}>
                {t(m.label)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={card}>
        <div style={{ marginBottom: 14 }}>
          <div style={kicker(meta.color)}>{t("w.teams.compare.teamComparison")}</div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, marginTop: 2 }}>{data?.lift ?? lift}</div>
        </div>
        <ResponsiveContainer width="100%" height={Math.max(160, chartData.length * 46)}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 16, right: 24 }}>
            <CartesianGrid stroke={C("line")} strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tick={{ fill: C("ash"), fontSize: fs.micro }} stroke={C("line")} />
            <YAxis
              type="category"
              dataKey="name"
              width={90}
              tick={{ fill: C("ash"), fontSize: fs.caption }}
              stroke={C("line")}
            />
            <Tooltip
              contentStyle={tip}
              cursor={{ fill: `color-mix(in srgb, ${C(meta.color)} 8%, transparent)` }}
              formatter={(v) => [`${v}${meta.unit ? " " + meta.unit : ""}`, t(meta.label)]}
            />
            <Bar dataKey="value" radius={[0, 6, 6, 0]}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={C(meta.color)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* full table */}
      <div style={{ ...card, marginTop: 16, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-mono)", fontSize: fs.body }}>
          <thead>
            <tr style={{ textAlign: "left", color: C("ash") }}>
              <th style={th}>{t("w.teams.compare.thAthlete")}</th>
              <th style={thR}>e1RM</th>
              <th style={thR}>{t("w.teams.compare.thVel1rm")}</th>
              <th style={thR}>{t("w.teams.compare.thBarSpeed")}</th>
              <th style={thR}>{t("w.teams.compare.thVolume")}</th>
              <th style={thR}>{t("w.teams.compare.thReps")}</th>
              <th style={thR}>{t("w.teams.compare.thSessions")}</th>
            </tr>
          </thead>
          <tbody>
            {[...athletes]
              .sort((a, b) => (b[metric] as number) - (a[metric] as number))
              .map((a) => (
                <tr key={a.linkId} style={{ borderTop: `1px solid ${C("line")}` }}>
                  <td style={{ ...td, color: C("chalk") }}>{a.name}</td>
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
      </div>
    </div>
  );
}

function pill(active: boolean, c: string): React.CSSProperties {
  return {
    fontFamily: "var(--font-display)",
    fontSize: fs.body,
    fontWeight: 700,
    padding: "8px 16px",
    borderRadius: 999,
    cursor: "pointer",
    border: `1px solid ${active ? C(c) : C("line")}`,
    background: active ? `color-mix(in srgb, ${C(c)} 16%, transparent)` : "transparent",
    color: active ? C(c) : C("ash"),
  };
}

const th: React.CSSProperties = { padding: "0 0 8px", fontWeight: 600, textTransform: "uppercase", fontSize: fs.nano, letterSpacing: ".08em" };
const thR: React.CSSProperties = { ...th, textAlign: "right" };
const td: React.CSSProperties = { padding: "9px 0" };
const tdR: React.CSSProperties = { ...td, textAlign: "right", color: C("ash") };
