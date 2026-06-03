"use client";

import { useEffect, useMemo, useState } from "react";
import { athleteSegment, SEGMENT_LABELS, type AthleteSegment } from "@hybrid/core";
import {
  INK2, LINE, LIME, CHALK, ASH, BLUE, VIOLET, AMBER, RED,
  disp, cond, mono, Mono, Card, Chip,
} from "@/lib/ui";

type SquadRow = {
  linkId: string;
  name: string;
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

const readinessColor = (r: number) => (r >= 70 ? LIME : r >= 55 ? AMBER : RED);
const riskColor = (r: number) => (r < 33 ? LIME : r < 66 ? AMBER : RED);
const acwrColor = (band: string) =>
  band === "sweet-spot" ? LIME : band === "caution" ? AMBER : band === "danger" ? RED : band === "detraining" ? BLUE : ASH;

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";

export default function TeamMonitor() {
  const [squad, setSquad] = useState<SquadRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<"readiness" | "acwr" | "risk">("readiness");
  const [seg, setSeg] = useState<AthleteSegment | "all">("all");

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

  if (loading) return <Mono s={{ fontSize: 13 }}>Loading squad…</Mono>;

  if (squad.length === 0)
    return (
      <Card style={{ borderLeft: `3px solid ${AMBER}` }}>
        <div style={{ ...disp, fontWeight: 700, fontSize: 17, marginBottom: 6 }}>No athletes to monitor yet</div>
        <Mono s={{ fontSize: 13, lineHeight: 1.6 }}>
          The squad monitor is the screen you open every morning: each athlete&apos;s readiness (RAG),
          training-load ACWR, and injury-risk flag at a glance. It reads your <b>active roster</b>
          {" "}(Coach screen → accepted clients) and computes from their real sessions + check-ins.
        </Mono>
      </Card>
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
  const filtered = squad.filter((a) => seg === "all" || segOf(a) === seg);
  const sorted = [...filtered].sort((a, b) =>
    sort === "readiness" ? a.readiness - b.readiness // worst first
    : sort === "acwr" ? b.acwr - a.acwr
    : b.riskOverall - a.riskOverall,
  );
  const SEGS: (AthleteSegment | "all")[] = ["all", "needs-attention", "dormant", "new", "on-track"];
  const segColor = (s: AthleteSegment) =>
    s === "needs-attention" ? RED : s === "dormant" ? VIOLET : s === "new" ? BLUE : LIME;

  return (
    <div>
      {/* summary strip */}
      {summary && (
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <SummaryCard label="Athletes" value={summary.athletes} c={CHALK} />
          <SummaryCard label="Low readiness" value={summary.redReadiness} c={summary.redReadiness ? RED : LIME} />
          <SummaryCard label="ACWR flags" value={summary.acwrFlags} c={summary.acwrFlags ? AMBER : LIME} />
          <SummaryCard label="Injury flags" value={summary.injuryFlags} c={summary.injuryFlags ? RED : LIME} />
        </div>
      )}

      {/* auto-segment filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }}>Segment</Mono>
        {SEGS.map((s) => (
          <button key={s} onClick={() => setSeg(s)} style={pill(seg === s)}>
            {s === "all" ? `All ${squad.length}` : `${SEGMENT_LABELS[s]} ${counts[s] ?? 0}`}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }}>Sort by</Mono>
        {(["readiness", "acwr", "risk"] as const).map((k) => (
          <button key={k} onClick={() => setSort(k)} style={pill(sort === k)}>{k}</button>
        ))}
      </div>

      <Card style={{ overflowX: "auto", padding: 0 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", ...mono, fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: ASH }}>
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
              <tr key={a.linkId} style={{ borderTop: `1px solid ${LINE}` }}>
                <td style={{ ...td, color: CHALK, fontFamily: "inherit" }}>{a.name}</td>
                <td style={tdC}><Chip c={segColor(segOf(a))}>{SEGMENT_LABELS[segOf(a)]}</Chip></td>
                <td style={tdC}><Dot c={readinessColor(a.readiness)} /> {a.readiness}</td>
                <td style={tdC}>
                  <span style={{ color: acwrColor(a.acwrBand) }}>{a.acwr || "—"}</span>
                  <Mono s={{ fontSize: 10, display: "block" }} c={acwrColor(a.acwrBand)}>{a.acwrBand}</Mono>
                </td>
                <td style={tdC}>{a.acute || "—"}</td>
                <td style={tdC}>
                  <span style={{ color: riskColor(a.riskOverall) }}>{a.riskOverall}</span>
                  {a.flagged && <Mono s={{ fontSize: 10, display: "block" }} c={RED}>{a.flagged}</Mono>}
                </td>
                <td style={tdC}>{a.hpi}</td>
                <td style={tdR}>{fmtDate(a.lastSession)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Mono s={{ fontSize: 11, display: "block", marginTop: 10 }}>
        ACWR (acute:chronic workload, 7d vs 28d-weekly) is a guide, not a verdict — read it with acute load
        and injury risk. Sweet-spot ≈ 0.8–1.3; caution 1.3–1.5; danger &gt;1.5; detraining &lt;0.8.
      </Mono>
    </div>
  );
}

function SummaryCard({ label, value, c }: { label: string; value: number; c: string }) {
  return (
    <Card style={{ flex: 1, minWidth: 130 }}>
      <div style={{ ...disp, fontWeight: 800, fontSize: 30, color: c }}>{value}</div>
      <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em" }}>{label}</Mono>
    </Card>
  );
}

function Dot({ c }: { c: string }) {
  return <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 5, background: c, marginRight: 6 }} />;
}

function pill(active: boolean) {
  return {
    ...cond, fontSize: 12, fontWeight: 700, textTransform: "uppercase" as const, padding: "5px 12px",
    borderRadius: 999, cursor: "pointer",
    border: `1px solid ${active ? LIME : LINE}`, background: active ? `${LIME}1a` : "transparent", color: active ? LIME : ASH,
  };
}

const th = { padding: "14px 16px", fontWeight: 600, textTransform: "uppercase" as const, fontSize: 10, letterSpacing: ".08em" };
const thC = { ...th, textAlign: "center" as const };
const thR = { ...th, textAlign: "right" as const };
const td = { padding: "12px 16px" };
const tdC = { ...td, textAlign: "center" as const, color: CHALK };
const tdR = { ...td, textAlign: "right" as const, color: ASH };
