"use client";

import { useEffect, useState } from "react";
import { LINE, LIME, CHALK, ASH, BLUE, VIOLET, AMBER, ON_ACCENT, disp, mono, Mono, Card, Chip, Stat } from "@/lib/ui";
import { METRIC_LABEL, K_ANON, type BenchmarkMetric } from "@hybrid/core";

type Norm = { cohortKey: string; sport: string; sex: string; ageBand: string; metric: BenchmarkMetric; n: number; mean: number; sd: number; p10: number; p50: number; p90: number };
type Stats = { observations: number; athletes: number; cohorts: number; releasableCohorts: number };
type Calibration = { version: string; n: number; outcomes: number; positives: number; negatives: number; coeffs: { intercept: number; slope: number } };

// Admin-only benchmarking-intelligence view — the data product. Aggregates over
// consented (discoverable) profiles, suppressing cohorts below K athletes.
export default function DataNet() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [norms, setNorms] = useState<Norm[]>([]);
  const [cal, setCal] = useState<Calibration | null>(null);
  const [refitMsg, setRefitMsg] = useState("");

  const load = () =>
    fetch("/api/datanet").then(async (res) => {
      if (res.ok) {
        const d = (await res.json()) as { stats: Stats; norms: Norm[]; calibration: Calibration };
        setStats(d.stats);
        setNorms(d.norms);
        setCal(d.calibration);
      }
    });
  useEffect(() => {
    load();
  }, []);

  const refit = async () => {
    setRefitMsg("Refitting…");
    const res = await fetch("/api/datanet/refit", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (res.ok) {
      const d = (await res.json()) as { persisted: boolean; sampleCount: number; fit: { n: number } };
      setRefitMsg(d.persisted ? `Refit on ${d.fit.n} samples — now live.` : `${d.sampleCount} labeled outcome(s) — need ≥30 to refit (still on prior).`);
      load();
    } else setRefitMsg("refit failed");
  };

  const snapshot = async () => {
    setRefitMsg("Snapshotting…");
    const res = await fetch("/api/datanet/snapshot", { method: "POST" });
    if (res.ok) {
      const d = (await res.json()) as { written: number; skipped: number };
      setRefitMsg(`Recorded ${d.written} negative sample(s) (${d.skipped} skipped — injured or already today).`);
      load();
    } else setRefitMsg("snapshot failed");
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card style={{ borderLeft: `3px solid ${VIOLET}` }}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={VIOLET}>
          Data network · benchmarking intelligence
        </Mono>
        <Mono s={{ fontSize: 13, display: "block", marginTop: 6, lineHeight: 1.5 }} c={CHALK}>
          The flywheel: every consented athlete sharpens the cohort norms and (with labeled
          outcomes) the injury calibration. De-identified — only cohorts with ≥ {K_ANON} athletes
          are released. This is the sellable data layer, not raw rows.
        </Mono>
      </Card>

      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
          <Stat label="Athletes (consented)" value={stats.athletes} c={LIME} />
          <Stat label="Observations" value={stats.observations} c={BLUE} />
          <Stat label="Cohorts" value={stats.cohorts} c={CHALK} />
          <Stat label={`Releasable (≥${K_ANON})`} value={stats.releasableCohorts} c={VIOLET} />
        </div>
      )}

      {cal && (
        <Card style={{ borderLeft: `3px solid ${cal.n > 0 ? LIME : ASH}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
            <div>
              <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={BLUE}>Injury calibration</Mono>
              <Mono s={{ fontSize: 13, display: "block", marginTop: 4 }} c={CHALK}>
                model {cal.version} · {cal.n > 0 ? `refit on ${cal.n} outcomes` : "synthetic prior"}
              </Mono>
              <Mono s={{ fontSize: 11, display: "block", marginTop: 2 }} c={ASH}>
                labels: {cal.positives} injured · {cal.negatives} healthy · σ(a + b·score): a={cal.coeffs.intercept.toFixed(2)}, b={cal.coeffs.slope.toFixed(2)}
              </Mono>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={snapshot} style={{ ...disp, fontWeight: 800, fontSize: 13, background: "transparent", color: CHALK, border: `1px solid ${LINE}`, borderRadius: 9, padding: "9px 14px", cursor: "pointer" }}>
                Snapshot negatives
              </button>
              <button onClick={refit} style={{ ...disp, fontWeight: 800, fontSize: 13, background: LIME, color: ON_ACCENT, border: "none", borderRadius: 9, padding: "9px 16px", cursor: "pointer" }}>
                Refit now
              </button>
            </div>
          </div>
          {refitMsg && <Mono s={{ fontSize: 11, display: "block", marginTop: 8 }} c={AMBER}>{refitMsg}</Mono>}
        </Card>
      )}

      <Card>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }}>Cohort norms (released)</Mono>
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          {norms.length === 0 ? (
            <Mono s={{ fontSize: 13 }}>
              No cohort has reached {K_ANON} consented athletes yet — aggregates are suppressed until
              then. As discoverable profiles accumulate, norms refit from these and replace the priors.
            </Mono>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Cohort", "Metric", "n", "Mean", "SD", "P10", "P50", "P90"].map((h) => (
                    <th key={h} style={{ ...mono, fontSize: 10, textTransform: "uppercase", color: ASH, textAlign: "left", padding: "6px 10px", borderBottom: `1px solid ${LINE}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {norms.map((nrm) => (
                  <tr key={nrm.cohortKey}>
                    <td style={{ ...mono, fontSize: 12, padding: "8px 10px", color: CHALK, borderBottom: `1px solid ${LINE}` }}>
                      {nrm.sport} · {nrm.sex} · {nrm.ageBand}
                    </td>
                    <td style={{ padding: "8px 10px", borderBottom: `1px solid ${LINE}` }}><Chip c={BLUE}>{METRIC_LABEL[nrm.metric]}</Chip></td>
                    <td style={{ ...mono, fontSize: 12, padding: "8px 10px", color: CHALK, borderBottom: `1px solid ${LINE}` }}>{nrm.n}</td>
                    <td style={{ ...mono, fontSize: 12, padding: "8px 10px", color: CHALK, borderBottom: `1px solid ${LINE}` }}>{nrm.mean}</td>
                    <td style={{ ...mono, fontSize: 12, padding: "8px 10px", color: ASH, borderBottom: `1px solid ${LINE}` }}>{nrm.sd}</td>
                    <td style={{ ...mono, fontSize: 12, padding: "8px 10px", color: ASH, borderBottom: `1px solid ${LINE}` }}>{nrm.p10}</td>
                    <td style={{ ...mono, fontSize: 12, padding: "8px 10px", color: CHALK, borderBottom: `1px solid ${LINE}` }}>{nrm.p50}</td>
                    <td style={{ ...mono, fontSize: 12, padding: "8px 10px", color: ASH, borderBottom: `1px solid ${LINE}` }}>{nrm.p90}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <Mono s={{ fontSize: 10, display: "block", marginTop: 10 }} c={ASH}>
          shrinkNorm blends these toward the synthetic prior until n is large; refitCalibration
          re-fits the injury model once labeled outcomes exist.
        </Mono>
      </Card>
    </div>
  );
}
