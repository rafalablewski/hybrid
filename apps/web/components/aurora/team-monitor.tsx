"use client";

import { useEffect, useState } from "react";
import { athleteSegment, SEGMENT_LABELS, type AthleteSegment } from "@hybrid/core";

type SquadRow = {
  linkId: string;
  name: string;
  tags?: string[];
  sessions: number;
  lastSession: string | null;
  readiness: number;
  hpi: number;
  hpiBand: string;
  acwr: number;
  acwrBand: string;
  acute: number;
  strain: number;
  riskOverall: number;
  riskBand: string;
  flagged: string | null;
};
type Summary = { athletes: number; redReadiness: number; acwrFlags: number; injuryFlags: number };

const C = (v: string) => `var(--color-${v})`;

const readinessColor = (r: number) => (r >= 70 ? "lime" : r >= 55 ? "amber" : "red");
const riskColor = (r: number) => (r < 33 ? "lime" : r < 66 ? "amber" : "red");
const acwrColor = (band: string) =>
  band === "sweet-spot" ? "lime" : band === "caution" ? "amber" : band === "danger" ? "red" : band === "detraining" ? "blue" : "ash";

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";

/** AURORA Team Monitor (web) — same /api/coach/squad flow + athleteSegment
 *  engine: the morning squad screen with RAG readiness, ACWR and injury-risk
 *  flags, auto-segment + tag filters and sort, in the rounded Aurora style. */
export default function AuroraTeamMonitor() {
  const [squad, setSquad] = useState<SquadRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<"readiness" | "acwr" | "risk">("readiness");
  const [seg, setSeg] = useState<AthleteSegment | "all">("all");
  const [tag, setTag] = useState<string>("");

  useEffect(() => {
    fetch("/api/coach/squad")
      .then((r) => (r.ok ? r.json() : { squad: [], summary: null }))
      .then((d: { squad?: SquadRow[]; summary?: Summary }) => {
        setSquad(d.squad ?? []);
        setSummary(d.summary ?? null);
      })
      .catch(() => setSquad([]))
      .finally(() => setLoading(false));
  }, []);

  const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, padding: 20 } as const;
  const kicker = (color: string): React.CSSProperties => ({ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em", color: C(color) });
  const chip = (color: string, label: React.ReactNode) => <span style={{ background: `color-mix(in srgb, ${C(color)} 14%, transparent)`, color: C(color), borderRadius: 999, padding: "3px 10px", fontFamily: "var(--font-mono)", fontSize: 11, marginRight: 4, marginBottom: 4, display: "inline-block" }}>{label}</span>;

  if (loading) return <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: C("ash") }}>Loading squad…</span>;

  if (squad.length === 0)
    return (
      <div style={{ ...card, fontFamily: "var(--font-display)", color: C("chalk") }}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, marginBottom: 6 }}>No athletes to monitor yet</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 1.6, color: C("ash") }}>
          The squad monitor is the screen you open every morning: each athlete&apos;s readiness (RAG),
          training-load ACWR, and injury-risk flag at a glance. It reads your <b>active roster</b>
          {" "}(Coach screen → accepted clients) and computes from their real sessions + check-ins.
        </div>
      </div>
    );

  const segOf = (a: SquadRow): AthleteSegment =>
    athleteSegment({
      readiness: a.readiness,
      acwrBand: a.acwrBand,
      flagged: !!a.flagged,
      daysSinceLast: a.lastSession ? Math.floor((Date.now() - Date.parse(a.lastSession)) / 86_400_000) : null,
      sessions: a.sessions,
    });

  const counts = squad.reduce((m, a) => { const s = segOf(a); m[s] = (m[s] ?? 0) + 1; return m; }, {} as Record<string, number>);
  const allTags = [...new Set(squad.flatMap((a) => a.tags ?? []))].sort();
  const filtered = squad
    .filter((a) => seg === "all" || segOf(a) === seg)
    .filter((a) => !tag || (a.tags ?? []).includes(tag));
  const sorted = [...filtered].sort((a, b) =>
    sort === "readiness" ? a.readiness - b.readiness // worst first
    : sort === "acwr" ? b.acwr - a.acwr
    : b.riskOverall - a.riskOverall,
  );
  const SEGS: (AthleteSegment | "all")[] = ["all", "needs-attention", "dormant", "new", "on-track"];
  const segColor = (s: AthleteSegment) =>
    s === "needs-attention" ? "red" : s === "dormant" ? "violet" : s === "new" ? "blue" : "lime";

  return (
    <div style={{ fontFamily: "var(--font-display)", color: C("chalk") }}>
      {/* summary strip */}
      {summary && (
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <SummaryCard label="Athletes" value={summary.athletes} c="chalk" />
          <SummaryCard label="Low readiness" value={summary.redReadiness} c={summary.redReadiness ? "red" : "lime"} />
          <SummaryCard label="ACWR flags" value={summary.acwrFlags} c={summary.acwrFlags ? "amber" : "lime"} />
          <SummaryCard label="Injury flags" value={summary.injuryFlags} c={summary.injuryFlags ? "red" : "lime"} />
        </div>
      )}

      {/* auto-segment filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={kicker("ash")}>Segment</span>
        {SEGS.map((s) => (
          <button key={s} onClick={() => setSeg(s)} style={pill(seg === s)}>
            {s === "all" ? `All ${squad.length}` : `${SEGMENT_LABELS[s]} ${counts[s] ?? 0}`}
          </button>
        ))}
      </div>

      {allTags.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={kicker("ash")}>Tag</span>
          <button onClick={() => setTag("")} style={pill(tag === "")}>All</button>
          {allTags.map((t) => (
            <button key={t} onClick={() => setTag(t)} style={pill(tag === t)}>{t}</button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <span style={kicker("ash")}>Sort by</span>
        {(["readiness", "acwr", "risk"] as const).map((k) => (
          <button key={k} onClick={() => setSort(k)} style={pill(sort === k)}>{k}</button>
        ))}
      </div>

      <div style={{ ...card, overflowX: "auto", padding: 0 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-mono)", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: C("ash") }}>
              <th style={th}>Athlete</th>
              <th style={thC}>Segment</th>
              <th style={thC}>Readiness</th>
              <th style={thC}>ACWR</th>
              <th style={thC}>Acute load</th>
              <th style={thC}>Injury risk</th>
              <th style={thC}>HPI</th>
              <th style={thR}>Last</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((a) => (
              <tr key={a.linkId} style={{ borderTop: `1px solid ${C("line")}` }}>
                <td style={{ ...td, color: C("chalk") }}>
                  {a.name}
                  {(a.tags ?? []).length > 0 && (
                    <span style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 3 }}>
                      {a.tags!.map((t) => chip("blue", t))}
                    </span>
                  )}
                </td>
                <td style={tdC}>{chip(segColor(segOf(a)), SEGMENT_LABELS[segOf(a)])}</td>
                <td style={tdC}><Dot c={readinessColor(a.readiness)} /> {a.readiness}</td>
                <td style={tdC}>
                  <span style={{ color: C(acwrColor(a.acwrBand)) }}>{a.acwr || "—"}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, display: "block", color: C(acwrColor(a.acwrBand)) }}>{a.acwrBand}</span>
                </td>
                <td style={tdC}>{a.acute || "—"}</td>
                <td style={tdC}>
                  <span style={{ color: C(riskColor(a.riskOverall)) }}>{a.riskOverall}</span>
                  {a.flagged && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, display: "block", color: C("red") }}>{a.flagged}</span>}
                </td>
                <td style={tdC}>{a.hpi}</td>
                <td style={tdR}>{fmtDate(a.lastSession)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, display: "block", marginTop: 10, color: C("ash") }}>
        ACWR (acute:chronic workload, 7d vs 28d-weekly) is a guide, not a verdict — read it with acute load
        and injury risk. Sweet-spot ≈ 0.8–1.3; caution 1.3–1.5; danger &gt;1.5; detraining &lt;0.8.
      </span>
    </div>
  );
}

function SummaryCard({ label, value, c }: { label: string; value: number; c: string }) {
  return (
    <div style={{ background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, padding: 20, flex: 1, minWidth: 130 }}>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 30, color: C(c) }}>{value}</div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", color: C("ash") }}>{label}</span>
    </div>
  );
}

function Dot({ c }: { c: string }) {
  return <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 5, background: C(c), marginRight: 6 }} />;
}

function pill(active: boolean): React.CSSProperties {
  return {
    fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 700, textTransform: "uppercase", padding: "6px 14px",
    borderRadius: 999, cursor: "pointer",
    border: `1px solid ${active ? C("lime") : C("line")}`, background: active ? `color-mix(in srgb, ${C("lime")} 16%, transparent)` : "transparent", color: active ? C("lime") : C("ash"),
  };
}

const th: React.CSSProperties = { padding: "14px 16px", fontWeight: 600, textTransform: "uppercase", fontSize: 10, letterSpacing: ".08em" };
const thC: React.CSSProperties = { ...th, textAlign: "center" };
const thR: React.CSSProperties = { ...th, textAlign: "right" };
const td: React.CSSProperties = { padding: "12px 16px" };
const tdC: React.CSSProperties = { ...td, textAlign: "center", color: C("chalk") };
const tdR: React.CSSProperties = { ...td, textAlign: "right", color: C("ash") };
