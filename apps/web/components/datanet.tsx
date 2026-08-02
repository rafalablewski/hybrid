"use client";

import { useEffect, useState } from "react";
import { fs, space, LINE, LINE_HEX, LIME, LIME_HEX, CHALK, ASH, BLUE, VIOLET, AMBER, ON_ACCENT, disp, mono, txt, Mono, Card, Chip, Stat } from "@/lib/ui";
import { METRIC_LABEL, K_ANON, type BenchmarkMetric, type ReliabilityBucket } from "@hybrid/core";

type Norm = { cohortKey: string; sport: string; sex: string; ageBand: string; metric: BenchmarkMetric; n: number; mean: number; sd: number; p10: number; p50: number; p90: number };
type Stats = { observations: number; athletes: number; cohorts: number; releasableCohorts: number };
type Calibration = { version: string; n: number; outcomes: number; positives: number; negatives: number; coeffs: { intercept: number; slope: number } };
type Evals = { auc: number | null; brierActive: number | null; brierPrior: number | null; n: number };
type Fit = { version: string; intercept: number; slope: number; n: number; createdAt: string };

// Admin-only benchmarking-intelligence view — the data product. Aggregates over
// consented (discoverable) profiles, suppressing cohorts below K athletes.
export default function DataNet() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [norms, setNorms] = useState<Norm[]>([]);
  const [cal, setCal] = useState<Calibration | null>(null);
  const [evals, setEvals] = useState<Evals | null>(null);
  const [reliability, setReliability] = useState<ReliabilityBucket[]>([]);
  const [fits, setFits] = useState<Fit[]>([]);
  const [refitMsg, setRefitMsg] = useState("");

  const load = () =>
    fetch("/api/datanet").then(async (res) => {
      if (res.ok) {
        const d = (await res.json()) as {
          stats: Stats;
          norms: Norm[];
          calibration: Calibration;
          evals?: Evals;
          reliability?: ReliabilityBucket[];
          fits?: Fit[];
        };
        setStats(d.stats);
        setNorms(d.norms);
        setCal(d.calibration);
        setEvals(d.evals ?? null);
        setReliability(d.reliability ?? []);
        setFits(d.fits ?? []);
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
    <div style={{ display: "grid", gap: space.lg }}>
      <Card style={{ borderLeft: `3px solid ${VIOLET}` }}>
        <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em" }} c={VIOLET}>
          Data network – benchmarking intelligence
        </Mono>
        <Mono s={{ fontSize: fs.body, display: "block", marginTop: 6, lineHeight: 1.5 }} c={CHALK}>
          The flywheel: every consented athlete sharpens the cohort norms and (with labeled
          outcomes) the injury calibration. De-identified — only cohorts with ≥ {K_ANON} athletes
          are released. This is the sellable data layer, not raw rows.
        </Mono>
      </Card>

      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: space.md }}>
          <Stat label="Athletes (consented)" value={stats.athletes} c={LIME} />
          <Stat label="Observations" value={stats.observations} c={BLUE} />
          <Stat label="Cohorts" value={stats.cohorts} c={CHALK} />
          <Stat label={`Releasable (≥${K_ANON})`} value={stats.releasableCohorts} c={VIOLET} />
        </div>
      )}

      {cal && (
        <Card style={{ borderLeft: `3px solid ${cal.n > 0 ? LIME : ASH}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: space.sm }}>
            <div>
              <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em" }} c={BLUE}>Injury calibration</Mono>
              <Mono s={{ fontSize: fs.body, display: "block", marginTop: 4 }} c={CHALK}>
                model {cal.version} – {cal.n > 0 ? `refit on ${cal.n} outcomes` : "synthetic prior"}
              </Mono>
              <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 2 }} c={ASH}>
                labels: {cal.positives} injured – {cal.negatives} healthy – σ(a + b·score): a={cal.coeffs.intercept.toFixed(2)}, b={cal.coeffs.slope.toFixed(2)}
              </Mono>
            </div>
            <div style={{ display: "flex", gap: space.sm }}>
              <button className="pressable" onClick={snapshot} style={{ ...disp, fontWeight: 800, fontSize: fs.body, background: "transparent", color: CHALK, border: `1px solid ${LINE}`, borderRadius: 9, padding: "9px 14px", cursor: "pointer" }}>
                Snapshot negatives
              </button>
              <button className="pressable" onClick={refit} style={{ ...disp, fontWeight: 800, fontSize: fs.body, background: LIME, color: ON_ACCENT, border: "none", borderRadius: 9, padding: "9px 16px", cursor: "pointer" }}>
                Refit now
              </button>
            </div>
          </div>
          {refitMsg && <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 8 }} c={AMBER}>{refitMsg}</Mono>}
        </Card>
      )}

      {/* ---- offline evaluation: does the model actually predict? ---- */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: space.lg }}>
        <Card>
          <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em" }} c={ASH}>
            Model evaluation – on the labeled outcomes
          </Mono>
          {!evals || evals.n === 0 ? (
            <Mono s={{ fontSize: fs.body, display: "block", marginTop: 10, lineHeight: 1.5 }}>
              No labeled outcomes yet — evaluation needs RiskOutcome rows (positives from opened
              RTP protocols, negatives from snapshots). Until then there is honestly nothing to
              score.
            </Mono>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: space.md, marginTop: 12 }}>
                <div>
                  <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", display: "block" }}>ROC AUC</Mono>
                  <span style={{ ...disp, fontWeight: 800, fontSize: 26, color: CHALK }}>
                    {evals.auc == null ? "—" : evals.auc.toFixed(3)}
                  </span>
                  <Mono s={{ fontSize: fs.nano, display: "block" }}>score ranking (0.5 = none, 1 = perfect)</Mono>
                </div>
                <div>
                  <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", display: "block" }}>Brier (live)</Mono>
                  <span style={{ ...disp, fontWeight: 800, fontSize: 26, color: CHALK }}>
                    {evals.brierActive == null ? "—" : evals.brierActive.toFixed(4)}
                  </span>
                  <Mono s={{ fontSize: fs.nano, display: "block" }}>calibration error (lower = better)</Mono>
                </div>
                <div>
                  <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", display: "block" }}>Brier (prior)</Mono>
                  <span style={{ ...disp, fontWeight: 800, fontSize: 26, color: txt(ASH) }}>
                    {evals.brierPrior == null ? "—" : evals.brierPrior.toFixed(4)}
                  </span>
                  <Mono s={{ fontSize: fs.nano, display: "block" }}>
                    {evals.brierActive != null && evals.brierPrior != null
                      ? evals.brierActive < evals.brierPrior
                        ? "refit beats the prior"
                        : evals.brierActive > evals.brierPrior
                          ? "prior still ahead"
                          : "no refit applied yet"
                      : "the un-fitted baseline"}
                  </Mono>
                </div>
              </div>
              {evals.auc == null && (
                <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 10 }} c={AMBER}>
                  AUC needs BOTH classes — record negatives with Snapshot (and positives arrive when
                  an RTP protocol opens).
                </Mono>
              )}
            </>
          )}
        </Card>

        <Card>
          <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em" }} c={ASH}>
            Reliability – predicted vs observed
          </Mono>
          {reliability.length === 0 ? (
            <Mono s={{ fontSize: fs.body, display: "block", marginTop: 10, lineHeight: 1.5 }}>
              Appears once labeled outcomes exist: samples are binned by predicted p(injury) and
              compared with the observed injury rate — a calibrated model sits on the diagonal.
            </Mono>
          ) : (
            <ReliabilityChart buckets={reliability} />
          )}
        </Card>
      </div>

      {/* ---- fit history ---- */}
      {fits.length > 0 && (
        <Card>
          <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em" }} c={ASH}>
            Calibration fit history
          </Mono>
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 520, borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Version", "Intercept a", "Slope b", "Samples", "Fitted"].map((h) => (
                    <th key={h} style={{ ...mono, fontSize: fs.nano, textTransform: "uppercase", color: txt(ASH), textAlign: "left", padding: "6px 10px", borderBottom: `1px solid ${LINE}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fits.map((f, i) => (
                  <tr key={`${f.version}-${f.createdAt}`}>
                    <td style={{ padding: "8px 10px", borderBottom: `1px solid ${LINE}` }}>
                      <Chip c={i === 0 ? LIME : ASH}>{i === 0 ? `${f.version} – live` : f.version}</Chip>
                    </td>
                    <td style={{ ...mono, fontSize: fs.caption, padding: "8px 10px", color: CHALK, borderBottom: `1px solid ${LINE}` }}>{f.intercept.toFixed(3)}</td>
                    <td style={{ ...mono, fontSize: fs.caption, padding: "8px 10px", color: CHALK, borderBottom: `1px solid ${LINE}` }}>{f.slope.toFixed(3)}</td>
                    <td style={{ ...mono, fontSize: fs.caption, padding: "8px 10px", color: CHALK, borderBottom: `1px solid ${LINE}` }}>{f.n}</td>
                    <td style={{ ...mono, fontSize: fs.caption, padding: "8px 10px", color: txt(ASH), borderBottom: `1px solid ${LINE}` }}>{f.createdAt.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card>
        <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em" }}>Cohort norms (released)</Mono>
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          {norms.length === 0 ? (
            <Mono s={{ fontSize: fs.body }}>
              No cohort has reached {K_ANON} consented athletes yet — aggregates are suppressed until
              then. As discoverable profiles accumulate, norms refit from these and replace the priors.
            </Mono>
          ) : (
            <table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Cohort", "Metric", "n", "Mean", "SD", "P10", "P50", "P90"].map((h) => (
                    <th key={h} style={{ ...mono, fontSize: fs.nano, textTransform: "uppercase", color: ASH, textAlign: "left", padding: "6px 10px", borderBottom: `1px solid ${LINE}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {norms.map((nrm) => (
                  <tr key={nrm.cohortKey}>
                    <td style={{ ...mono, fontSize: fs.caption, padding: "8px 10px", color: CHALK, borderBottom: `1px solid ${LINE}` }}>
                      {nrm.sport} – {nrm.sex} – {nrm.ageBand}
                    </td>
                    <td style={{ padding: "8px 10px", borderBottom: `1px solid ${LINE}` }}><Chip c={BLUE}>{METRIC_LABEL[nrm.metric]}</Chip></td>
                    <td style={{ ...mono, fontSize: fs.caption, padding: "8px 10px", color: CHALK, borderBottom: `1px solid ${LINE}` }}>{nrm.n}</td>
                    <td style={{ ...mono, fontSize: fs.caption, padding: "8px 10px", color: CHALK, borderBottom: `1px solid ${LINE}` }}>{nrm.mean}</td>
                    <td style={{ ...mono, fontSize: fs.caption, padding: "8px 10px", color: ASH, borderBottom: `1px solid ${LINE}` }}>{nrm.sd}</td>
                    <td style={{ ...mono, fontSize: fs.caption, padding: "8px 10px", color: ASH, borderBottom: `1px solid ${LINE}` }}>{nrm.p10}</td>
                    <td style={{ ...mono, fontSize: fs.caption, padding: "8px 10px", color: CHALK, borderBottom: `1px solid ${LINE}` }}>{nrm.p50}</td>
                    <td style={{ ...mono, fontSize: fs.caption, padding: "8px 10px", color: ASH, borderBottom: `1px solid ${LINE}` }}>{nrm.p90}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <Mono s={{ fontSize: fs.nano, display: "block", marginTop: 10 }} c={ASH}>
          shrinkNorm blends these toward the synthetic prior until n is large; refitCalibration
          re-fits the injury model once labeled outcomes exist.
        </Mono>
      </Card>
    </div>
  );
}

// Reliability (calibration) diagram — one dot per predicted-probability bin,
// against the perfect-calibration diagonal. Dot area is NOT encoded (n is in
// the tooltip) so a big bin can't visually outweigh a miscalibrated one.
function ReliabilityChart({ buckets }: { buckets: ReliabilityBucket[] }) {
  const W = 320;
  const H = 220;
  const P = { l: 38, r: 12, t: 10, b: 30 };
  const max = Math.max(0.2, ...buckets.map((b) => Math.max(b.meanPredicted, b.observedRate))) * 1.1;
  const x = (v: number) => P.l + (v / max) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - v / max) * (H - P.t - P.b);
  return (
    <div style={{ marginTop: 10 }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 380, height: "auto", display: "block" }} role="img" aria-label="Reliability diagram: predicted probability vs observed injury rate per bin">
        {[0, max / 2, max].map((v) => (
          <g key={v}>
            <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke={LINE_HEX} strokeWidth={1} />
            <text x={P.l - 5} y={y(v) + 3} textAnchor="end" fontSize={9} fill={ASH} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {Math.round(v * 100)}%
            </text>
            <text x={x(v)} y={H - 16} textAnchor="middle" fontSize={9} fill={ASH} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {Math.round(v * 100)}%
            </text>
          </g>
        ))}
        {/* perfect calibration */}
        <line x1={x(0)} y1={y(0)} x2={x(max)} y2={y(max)} stroke={ASH} strokeWidth={1} strokeDasharray="4 4" />
        {buckets.map((b) => (
          <circle key={b.lo} cx={x(b.meanPredicted)} cy={y(b.observedRate)} r={5} fill={LIME_HEX} stroke="#0c0d0c" strokeWidth={2}>
            <title>{`predicted ${(b.meanPredicted * 100).toFixed(1)}% – observed ${(b.observedRate * 100).toFixed(1)}% – n=${b.n}`}</title>
          </circle>
        ))}
        <text x={(W + P.l - P.r) / 2} y={H - 3} textAnchor="middle" fontSize={9} fill={ASH} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          predicted p(injury)
        </text>
      </svg>
      <Mono s={{ fontSize: fs.nano, display: "block", marginTop: 6, lineHeight: 1.5 }}>
        Dots on the dashed diagonal = the probabilities mean what they say. Above it the model
        under-predicts, below it over-predicts. Hover a dot for its sample count.
      </Mono>
    </div>
  );
}
