"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  fs,
  space,
  INK2,
  LINE,
  LINE_HEX,
  LIME,
  LIME_HEX,
  CHALK,
  ASH,
  AMBER,
  BLUE,
  VIOLET,
  RED,
  disp,
  mono,
  Mono,
  Card,
  Chip,
  Stat,
  Button,
  txt,
  roleHex,
  roleVar,
} from "@/lib/ui";
import {
  computeEngineTrace,
  ENGINE_FORMULAS,
  ENGINE_FORMULA_GROUPS,
  logisticCurve,
  whatIfLog,
  whatIfBio,
  HYBRID_WEIGHTS,
  STRENGTH_WEIGHTS,
  ENDURANCE_WEIGHTS,
  PRIOR_COEFFS,
  RISK_MODEL_VERSION,
  SAMPLE_TRAINING_LOG,
  SAMPLE_BIOMETRICS,
  riskRole,
  hpiRole,
  readinessRole,
  type Biometrics,
  type CalibrationCoeffs,
  type EngineTrace,
  type HpiWeights,
  type TrainingLog,
} from "@hybrid/core";

// ---------------------------------------------------------------------------
// Engine Room — the transparency console over the intelligence stack.
//
// Runs the REAL @hybrid/core engines client-side (they're pure functions) on
// either the built-in sample athlete or a real athlete's stored inputs fetched
// from /api/admin/engine. One source of truth: the numbers here are produced by
// the exact code the product ships, and the formula sheet renders the live
// ENGINE_FORMULAS registry — it cannot drift from the math.
// ---------------------------------------------------------------------------

type PickedUser = { id: string; name: string | null; email: string };
type Feed = {
  user: PickedUser;
  log: TrainingLog;
  bio: Biometrics | null;
  sessionCount: number;
  calibration: { coeffs: CalibrationCoeffs; version: string; n: number };
};

const PROFILES: { id: string; label: string; weights: HpiWeights }[] = [
  { id: "hybrid", label: "Hybrid 0.55/0.45", weights: HYBRID_WEIGHTS },
  { id: "strength", label: "Strength 0.8/0.2", weights: STRENGTH_WEIGHTS },
  { id: "endurance", label: "Endurance 0.25/0.75", weights: ENDURANCE_WEIGHTS },
];

// Injury component colors (semantic: what KIND of risk, not rank).
const DRIVER_COLOR: Record<string, string> = {
  spike: RED,
  load: AMBER,
  detrain: BLUE,
  recovery: VIOLET,
};
const DRIVER_LABEL: Record<string, string> = {
  spike: "Workload spike",
  load: "Absolute load",
  detrain: "Detraining",
  recovery: "Recovery",
};

type WhatIfState = { loadPct: number; hrv: number | null; restingHr: number | null; sleep: number | null };
const WHATIF_OFF: WhatIfState = { loadPct: 100, hrv: null, restingHr: null, sleep: null };

export default function EngineRoom() {
  // ---- source: sample athlete or a real user ----
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickedUser[]>([]);
  const [feed, setFeed] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [profileId, setProfileId] = useState("hybrid");
  const [whatIf, setWhatIf] = useState<WhatIfState>(WHATIF_OFF);
  const searchSeq = useRef(0);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const seq = ++searchSeq.current;
    const t = setTimeout(() => {
      fetch(`/api/admin/users?q=${encodeURIComponent(query)}&pageSize=8`)
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d: { users: PickedUser[] }) => {
          if (searchSeq.current === seq) setResults(d.users);
        })
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const pick = async (u: PickedUser) => {
    setLoading(true);
    setErr("");
    setResults([]);
    setQ("");
    setWhatIf(WHATIF_OFF);
    try {
      const r = await fetch(`/api/admin/engine?user=${encodeURIComponent(u.id)}`);
      if (!r.ok) throw new Error();
      setFeed((await r.json()) as Feed);
    } catch {
      setErr("Failed to load athlete inputs.");
      setFeed(null);
    } finally {
      setLoading(false);
    }
  };

  const useSample = () => {
    setFeed(null);
    setErr("");
    setWhatIf(WHATIF_OFF);
  };

  // ---- active inputs ----
  const log: TrainingLog = feed ? feed.log : SAMPLE_TRAINING_LOG;
  const bio: Biometrics | undefined = feed ? (feed.bio ?? undefined) : SAMPLE_BIOMETRICS;
  const coeffs = feed ? feed.calibration.coeffs : PRIOR_COEFFS;
  const modelVersion = feed ? feed.calibration.version : RISK_MODEL_VERSION;
  const weights = (PROFILES.find((p) => p.id === profileId) ?? PROFILES[0]!).weights;

  const whatIfActive =
    whatIf.loadPct !== 100 || whatIf.hrv != null || whatIf.restingHr != null || whatIf.sleep != null;

  const base = useMemo(
    () => computeEngineTrace(log, bio, { weights, coeffs }),
    [log, bio, weights, coeffs],
  );
  const sim = useMemo(
    () =>
      whatIfActive
        ? computeEngineTrace(
            whatIfLog(log, whatIf.loadPct),
            whatIfBio(bio, {
              hrv: whatIf.hrv ?? undefined,
              restingHr: whatIf.restingHr ?? undefined,
              sleep: whatIf.sleep ?? undefined,
            }),
            { weights, coeffs },
          )
        : base,
    [whatIfActive, log, bio, weights, coeffs, whatIf, base],
  );

  const t = sim; // what the headline reflects (base when no what-if is active)
  const delta = (a: number, b: number) => {
    const d = a - b;
    return d === 0 ? "±0" : d > 0 ? `+${d}` : `−${Math.abs(d)}`;
  };

  return (
    <div style={{ display: "grid", gap: space.lg }}>
      {/* ---- intro + source picker ---- */}
      <Card style={{ borderLeft: `3px solid ${LIME}` }}>
        <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>
          Engine room – the live intelligence stack
        </Mono>
        <Mono s={{ fontSize: fs.body, display: "block", marginTop: 6, lineHeight: 1.5 }} c={CHALK}>
          Every number below is computed in this browser by the same pure @hybrid/core engines the
          product ships — fatigue, readiness, HPI, per-tissue ACWR, injury risk and its calibrated
          p(injury). Pick an athlete, drag the what-if sliders, and read the math that produced
          each figure.
        </Mono>

        <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap", alignItems: "center", marginTop: 14 }}>
          <Button label="Sample athlete" onClick={useSample} variant={feed ? "outline" : "fill"} />
          <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 340 }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search a real athlete (name or email)…"
              style={{
                width: "100%",
                ...mono,
                fontSize: fs.body,
                color: CHALK,
                background: INK2,
                border: `1px solid ${LINE}`,
                borderRadius: 9,
                padding: "9px 12px",
                outline: "none",
              }}
            />
            {results.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  left: 0,
                  right: 0,
                  zIndex: 20,
                  background: INK2,
                  border: `1px solid ${LINE}`,
                  borderRadius: 9,
                  overflow: "hidden",
                }}
              >
                {results.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => pick(u)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 12px",
                      background: "transparent",
                      border: "none",
                      borderBottom: `1px solid ${LINE}`,
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ ...disp, fontSize: fs.body, fontWeight: 600, color: CHALK }}>
                      {u.name ?? u.email}
                    </span>
                    <Mono s={{ fontSize: fs.micro, display: "block" }}>{u.email}</Mono>
                  </button>
                ))}
              </div>
            )}
          </div>
          {feed && (
            <Chip c={BLUE}>
              {feed.user.name ?? feed.user.email} – {feed.sessionCount} session{feed.sessionCount === 1 ? "" : "s"}
            </Chip>
          )}
          {loading && <Mono s={{ fontSize: fs.caption }}>Loading…</Mono>}
          {err && <Mono s={{ fontSize: fs.caption }} c={RED}>{err}</Mono>}

          <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".1em" }}>HPI weights</Mono>
            {PROFILES.map((p) => (
              <button
                key={p.id}
                onClick={() => setProfileId(p.id)}
                style={{
                  ...mono,
                  fontSize: fs.micro,
                  color: txt(profileId === p.id ? LIME : ASH),
                  background: profileId === p.id ? `${LIME_HEX}1c` : "transparent",
                  border: `1px solid ${profileId === p.id ? LIME : LINE}`,
                  borderRadius: 999,
                  padding: "5px 10px",
                  cursor: "pointer",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {feed && feed.log.length === 0 && (
          <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 10 }} c={AMBER}>
            No sessions logged — the engines run honestly on an empty log (resting baseline, no
            fabricated data).
          </Mono>
        )}
        {feed && !feed.bio && (
          <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 6 }} c={AMBER}>
            No wearable signals — readiness and risk run load-only; the biometric sliders are
            disabled.
          </Mono>
        )}
      </Card>

      {/* ---- headline ---- */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 170px), 1fr))", gap: space.md }}>
        <Stat
          label="HPI"
          value={t.state.hpi.score}
          sub={whatIfActive ? `${delta(t.state.hpi.score, base.state.hpi.score)} vs actual` : t.state.hpi.band}
          c={roleVar(hpiRole(t.state.hpi.band))}
        />
        <Stat
          label="Readiness"
          value={t.state.readiness.score}
          sub={whatIfActive ? `${delta(t.state.readiness.score, base.state.readiness.score)} vs actual` : `bio ${t.state.readiness.bioAdj >= 0 ? "+" : ""}${t.state.readiness.bioAdj}`}
          c={roleVar(readinessRole(t.state.readiness.score))}
        />
        <Stat
          label="Injury risk"
          value={t.injury.overall}
          sub={whatIfActive ? `${delta(t.injury.overall, base.injury.overall)} vs actual` : t.injury.band}
          c={roleVar(riskRole(t.injury.band))}
        />
        <Stat
          label="p(injury)"
          value={`${(t.injury.prob * 100).toFixed(1)}%`}
          sub={whatIfActive ? undefined : "highest-risk tissue"}
          c={roleVar(riskRole(t.injury.band))}
        />
      </div>

      {/* ---- what-if simulator ---- */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: space.sm }}>
          <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={VIOLET}>
            What-if simulator
          </Mono>
          <div style={{ display: "flex", gap: space.sm, alignItems: "center" }}>
            {whatIfActive && <Chip c={VIOLET}>simulating</Chip>}
            {whatIfActive && <Button label="Reset to actual" variant="outline" onClick={() => setWhatIf(WHATIF_OFF)} />}
          </div>
        </div>
        <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 4, lineHeight: 1.5 }}>
          The sliders transform the INPUTS (last-7-day training scale, today&apos;s wearable readings)
          and re-run the whole stack live — the exact engines, not an approximation.
        </Mono>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: space.lg, marginTop: 14 }}>
          <Slider
            label="Recent training load"
            value={whatIf.loadPct}
            display={`${whatIf.loadPct}%`}
            min={0}
            max={200}
            step={5}
            onChange={(v) => setWhatIf({ ...whatIf, loadPct: v })}
          />
          <Slider
            label="HRV today"
            disabled={!bio}
            value={whatIf.hrv ?? bio?.hrv.today ?? 0}
            display={bio ? `${whatIf.hrv ?? bio.hrv.today} ${bio.hrv.unit} (base ${bio.hrv.baseline})` : "no signal"}
            min={bio ? Math.round(bio.hrv.baseline * 0.5) : 0}
            max={bio ? Math.round(bio.hrv.baseline * 1.5) : 1}
            step={1}
            onChange={(v) => setWhatIf({ ...whatIf, hrv: v })}
          />
          <Slider
            label="Resting HR today"
            disabled={!bio}
            value={whatIf.restingHr ?? bio?.restingHr.today ?? 0}
            display={bio ? `${whatIf.restingHr ?? bio.restingHr.today} ${bio.restingHr.unit} (base ${bio.restingHr.baseline})` : "no signal"}
            min={bio ? Math.round(bio.restingHr.baseline * 0.7) : 0}
            max={bio ? Math.round(bio.restingHr.baseline * 1.4) : 1}
            step={1}
            onChange={(v) => setWhatIf({ ...whatIf, restingHr: v })}
          />
          <Slider
            label="Sleep today"
            disabled={!bio}
            value={whatIf.sleep ?? bio?.sleep.today ?? 0}
            display={bio ? `${(whatIf.sleep ?? bio.sleep.today).toFixed(1)} h (base ${bio.sleep.baseline})` : "no signal"}
            min={3}
            max={10}
            step={0.5}
            onChange={(v) => setWhatIf({ ...whatIf, sleep: v })}
          />
        </div>
      </Card>

      {/* ---- trajectory + calibration curve ---- */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: space.lg }}>
        <Card>
          <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={ASH}>
            14-day trajectory
          </Mono>
          <TrajectoryChart trace={t} />
        </Card>
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: space.sm }}>
            <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={ASH}>
              Calibration – score → p(injury)
            </Mono>
            <Chip c={BLUE}>{modelVersion}</Chip>
          </div>
          <LogisticChart coeffs={coeffs} score={t.injury.overall} p={t.injury.prob} />
          <Mono s={{ fontSize: fs.nano, display: "block", marginTop: 8, lineHeight: 1.5 }}>
            p(injury) = σ(a + b × score/100), a={coeffs.intercept.toFixed(2)}, b={coeffs.slope.toFixed(2)}.
            Refit on labeled outcomes in Capabilities &amp; data → Data network.
          </Mono>
        </Card>
      </div>

      {/* ---- LLM explain ---- */}
      <ExplainCard userId={feed?.user.id} whatIf={whatIf} whatIfActive={whatIfActive} />

      {/* ---- state drivers ---- */}
      <Card>
        <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={ASH}>
          State drivers – why the score is what it is
        </Mono>
        <Mono s={{ fontSize: fs.body, display: "block", marginTop: 8 }} c={CHALK}>
          {t.state.summary}
        </Mono>
        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          {t.state.drivers.length === 0 && (
            <Mono s={{ fontSize: fs.caption }}>No meaningful drivers — nothing is dragging or lifting the state.</Mono>
          )}
          {t.state.drivers.map((d) => (
            <div key={d.factor} style={{ display: "flex", alignItems: "center", gap: space.md }}>
              <div style={{ width: 150, flexShrink: 0 }}>
                <Mono s={{ fontSize: fs.caption }} c={CHALK}>{d.factor}</Mono>
              </div>
              <div style={{ flex: 1, height: 8, background: INK2, borderRadius: 4, overflow: "hidden" }}>
                <div
                  style={{
                    width: `${Math.round(d.weight * 100)}%`,
                    height: "100%",
                    borderRadius: 4,
                    background: d.impact === "negative" ? roleHex("danger") : LIME_HEX,
                  }}
                />
              </div>
              <div style={{ width: 210, flexShrink: 0 }}>
                <Mono s={{ fontSize: fs.micro }}>{d.detail}</Mono>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ---- per-tissue injury table ---- */}
      <Card>
        <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={ASH}>
          Per-tissue injury risk – ACWR, components, calibrated probability
        </Mono>
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 700, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Tissue", "Fatigue", "ACWR", "Components", "Risk", "p(injury)", "Band"].map((h) => (
                  <th key={h} style={{ ...mono, fontSize: fs.nano, textTransform: "uppercase", color: txt(ASH), textAlign: "left", padding: "6px 10px", borderBottom: `1px solid ${LINE}` }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.injury.tissues.map((tissue) => (
                <tr key={tissue.tissue}>
                  <td style={cell(CHALK)}>{tissue.tissue}</td>
                  <td style={cell(ASH)}>{t.state.fatigue.muscles[tissue.tissue]}/100</td>
                  <td style={cell(tissue.enoughHistory ? CHALK : ASH)}>
                    {tissue.enoughHistory ? tissue.acwr.toFixed(2) : "no history"}
                  </td>
                  <td style={{ padding: "8px 10px", borderBottom: `1px solid ${LINE}`, minWidth: 160 }}>
                    <ComponentBar drivers={tissue.drivers} risk={tissue.risk} />
                  </td>
                  <td style={cell(CHALK)}>{tissue.risk}</td>
                  <td style={cell(CHALK)}>{(tissue.prob * 100).toFixed(1)}%</td>
                  <td style={{ padding: "8px 10px", borderBottom: `1px solid ${LINE}` }}>
                    <Chip c={roleHex(riskRole(tissue.band))}>{tissue.band}</Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", gap: space.md, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
          {Object.entries(DRIVER_LABEL).map(([k, label]) => (
            <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: DRIVER_COLOR[k], display: "inline-block" }} />
              <Mono s={{ fontSize: fs.nano }}>{label}</Mono>
            </span>
          ))}
          <Mono s={{ fontSize: fs.nano, marginLeft: "auto" }}>
            flagged (≥50): {t.injury.flagged.length ? t.injury.flagged.map((f) => f.tissue).join(", ") : "none"}
          </Mono>
        </div>
      </Card>

      {/* ---- formula sheet ---- */}
      <Card>
        <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={ASH}>
          Formula sheet – the live math, rendered from the code
        </Mono>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: space.lg, marginTop: 12 }}>
          {ENGINE_FORMULA_GROUPS.map((g) => (
            <div key={g.id} style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: space.sm, flexWrap: "wrap" }}>
                <span style={{ ...disp, fontWeight: 800, fontSize: fs.bodyLg, color: CHALK }}>{g.label}</span>
                <Mono s={{ fontSize: fs.nano }}>{g.source}</Mono>
              </div>
              {ENGINE_FORMULAS.filter((f) => f.engine === g.id).map((f) => (
                <div key={f.id} style={{ marginTop: 12 }}>
                  <Mono s={{ fontSize: fs.caption, fontWeight: 700 }} c={CHALK}>{f.name}</Mono>
                  <code
                    style={{
                      ...mono,
                      display: "block",
                      fontSize: fs.caption,
                      color: txt(LIME),
                      background: INK2,
                      border: `1px solid ${LINE}`,
                      borderRadius: 7,
                      padding: "7px 10px",
                      marginTop: 5,
                      overflowX: "auto",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {f.expression}
                  </code>
                  {f.constants.length > 0 && (
                    <div style={{ marginTop: 5 }}>
                      {f.constants.map((c) => (
                        <Mono key={c.symbol} s={{ fontSize: fs.nano, display: "block" }}>
                          {c.symbol} = {c.value} — {c.meaning}
                        </Mono>
                      ))}
                    </div>
                  )}
                  <Mono s={{ fontSize: fs.nano, display: "block", marginTop: 4, lineHeight: 1.5 }}>{f.note}</Mono>
                </div>
              ))}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// "Explain this athlete" — asks the server to recompute the state and narrate
// it via Claude, grounded on the structured engine output. Degrades to the
// engines' own deterministic explanation (labelled) when no API key is set.
function ExplainCard({
  userId,
  whatIf,
  whatIfActive,
}: {
  userId?: string;
  whatIf: WhatIfState;
  whatIfActive: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ source: string; text: string; note?: string } | null>(null);
  const [err, setErr] = useState("");

  const explain = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/admin/engine/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          whatIf: whatIfActive
            ? {
                loadPct: whatIf.loadPct,
                hrv: whatIf.hrv ?? undefined,
                restingHr: whatIf.restingHr ?? undefined,
                sleep: whatIf.sleep ?? undefined,
              }
            : undefined,
        }),
      });
      if (!r.ok) throw new Error();
      setResult((await r.json()) as { source: string; text: string; note?: string });
    } catch {
      setErr("Explanation failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: space.sm }}>
        <div>
          <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={BLUE}>
            Explain this athlete – grounded narrative
          </Mono>
          <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 4, lineHeight: 1.5 }}>
            The server recomputes the engine state and asks Claude to narrate it — grounded only on
            the structured output above{whatIfActive ? ", including the active what-if" : ""}. Falls
            back to the deterministic engine explanation without an API key.
          </Mono>
        </div>
        <Button label={busy ? "Explaining…" : "Explain"} onClick={explain} disabled={busy} />
      </div>
      {err && <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 10 }} c={RED}>{err}</Mono>}
      {result && (
        <div style={{ marginTop: 12, borderTop: `1px solid ${LINE}`, paddingTop: 12 }}>
          <Chip c={result.source === "ai" ? LIME_HEX : AMBER}>
            {result.source === "ai" ? "Claude" : "engine fallback"}
          </Chip>
          <span style={{ ...disp, display: "block", fontSize: fs.bodyLg, lineHeight: 1.6, color: CHALK, marginTop: 8 }}>
            {result.text}
          </span>
          {result.note && (
            <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 8 }} c={AMBER}>{result.note}</Mono>
          )}
        </div>
      )}
    </Card>
  );
}

function cell(color: string): React.CSSProperties {
  return { ...mono, fontSize: fs.caption, padding: "8px 10px", color: txt(color), borderBottom: `1px solid ${LINE}`, textTransform: "capitalize" };
}

// ---- small controls -------------------------------------------------------

function Slider({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <label style={{ display: "block", opacity: disabled ? 0.45 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: space.sm, marginBottom: 6 }}>
        <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".1em" }}>{label}</Mono>
        <Mono s={{ fontSize: fs.micro }} c={CHALK}>{display}</Mono>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: LIME_HEX }}
      />
    </label>
  );
}

/** Stacked per-tissue component bar — 2px gaps between segments (mark spec). */
function ComponentBar({ drivers, risk }: { drivers: { kind: string; contribution: number }[]; risk: number }) {
  if (risk === 0 || drivers.length === 0)
    return <div style={{ height: 10, background: INK2, borderRadius: 5 }} />;
  return (
    <div style={{ display: "flex", gap: 2, height: 10, alignItems: "stretch" }} title={drivers.map((d) => `${DRIVER_LABEL[d.kind] ?? d.kind}: ${d.contribution}`).join(" – ")}>
      {drivers.map((d) => (
        <div
          key={d.kind}
          style={{
            width: `${Math.max(3, d.contribution)}%`,
            background: DRIVER_COLOR[d.kind] ?? ASH,
            borderRadius: 3,
          }}
        />
      ))}
    </div>
  );
}

// ---- charts (plain SVG, brand tokens, hover tooltips) ---------------------

const CHART_W = 560;
const CHART_H = 180;
const PAD = { l: 34, r: 64, t: 12, b: 22 };
// raw hexes for SVG presentation attrs (CSS vars are unreliable there — see lib/ui)
const SVG_CHALK = "#f3f4ef";
const SVG_INK = "#0c0d0c";

function TrajectoryChart({ trace }: { trace: EngineTrace }) {
  const [hover, setHover] = useState<number | null>(null);
  const pts = trace.trajectory;
  const n = pts.length;
  const x = (i: number) => PAD.l + (i / Math.max(1, n - 1)) * (CHART_W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / 100) * (CHART_H - PAD.t - PAD.b);
  const line = (get: (p: (typeof pts)[number]) => number) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(get(p)).toFixed(1)}`).join(" ");

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * CHART_W;
    const i = Math.round(((px - PAD.l) / (CHART_W - PAD.l - PAD.r)) * (n - 1));
    setHover(i >= 0 && i < n ? i : null);
  };

  const h = hover != null ? pts[hover] : null;
  return (
    <div style={{ position: "relative", marginTop: 10 }}>
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label="HPI and readiness over the last 14 days"
      >
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={CHART_W - PAD.r} y1={y(v)} y2={y(v)} stroke={LINE_HEX} strokeWidth={1} />
            <text x={PAD.l - 6} y={y(v) + 3} textAnchor="end" fontSize={9} fill={ASH} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {v}
            </text>
          </g>
        ))}
        {[0, 7, 13].map((i) => (
          <text key={i} x={x(i)} y={CHART_H - 6} textAnchor="middle" fontSize={9} fill={ASH} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {pts[i] ? (pts[i]!.daysAgo === 0 ? "today" : `−${pts[i]!.daysAgo}d`) : ""}
          </text>
        ))}
        <path d={line((p) => p.hpi)} fill="none" stroke={LIME_HEX} strokeWidth={2} strokeLinejoin="round" />
        <path d={line((p) => p.readiness)} fill="none" stroke={BLUE} strokeWidth={2} strokeLinejoin="round" />
        {/* direct end labels: ink text beside a colored mark, never colored text */}
        {pts.length > 0 && (
          <>
            <circle cx={x(n - 1)} cy={y(pts[n - 1]!.hpi)} r={4} fill={LIME_HEX} stroke={LINE_HEX} strokeWidth={2} />
            <text x={x(n - 1) + 8} y={y(pts[n - 1]!.hpi) + 3} fontSize={9} fill={SVG_CHALK} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              HPI {pts[n - 1]!.hpi}
            </text>
            <circle cx={x(n - 1)} cy={y(pts[n - 1]!.readiness)} r={4} fill={BLUE} stroke={LINE_HEX} strokeWidth={2} />
            <text x={x(n - 1) + 8} y={y(pts[n - 1]!.readiness) + 3} fontSize={9} fill={ASH} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              Rdy {pts[n - 1]!.readiness}
            </text>
          </>
        )}
        {h && hover != null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={CHART_H - PAD.b} stroke={ASH} strokeWidth={1} strokeDasharray="3 3" />
        )}
      </svg>
      {h && hover != null && (
        <div
          style={{
            position: "absolute",
            left: `${(x(hover) / CHART_W) * 100}%`,
            top: 0,
            transform: `translateX(${hover > n / 2 ? "calc(-100% - 8px)" : "8px"})`,
            background: INK2,
            border: `1px solid ${LINE}`,
            borderRadius: 7,
            padding: "6px 9px",
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          <Mono s={{ fontSize: fs.nano, display: "block" }}>{h.daysAgo === 0 ? "today" : `${h.daysAgo} days ago`}</Mono>
          <Mono s={{ fontSize: fs.micro, display: "block" }} c={CHALK}>HPI {h.hpi} – readiness {h.readiness}</Mono>
        </div>
      )}
      {/* legend (2 series) */}
      <div style={{ display: "flex", gap: space.md, marginTop: 6 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 14, height: 3, background: LIME_HEX, borderRadius: 2, display: "inline-block" }} />
          <Mono s={{ fontSize: fs.nano }}>HPI</Mono>
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 14, height: 3, background: BLUE, borderRadius: 2, display: "inline-block" }} />
          <Mono s={{ fontSize: fs.nano }}>Readiness</Mono>
        </span>
      </div>
    </div>
  );
}

function LogisticChart({ coeffs, score, p }: { coeffs: CalibrationCoeffs; score: number; p: number }) {
  const [hover, setHover] = useState<number | null>(null); // hovered score 0..100
  const pts = useMemo(() => logisticCurve(coeffs, 50), [coeffs]);
  const pMax = Math.max(0.4, pts[pts.length - 1]!.p * 1.1);
  const x = (s: number) => PAD.l + (s / 100) * (CHART_W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / pMax) * (CHART_H - PAD.t - PAD.b);
  const path = pts.map((pt, i) => `${i === 0 ? "M" : "L"}${x(pt.score).toFixed(1)},${y(pt.p).toFixed(1)}`).join(" ");

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * CHART_W;
    const s = Math.round(((px - PAD.l) / (CHART_W - PAD.l - PAD.r)) * 100);
    setHover(s >= 0 && s <= 100 ? s : null);
  };

  const sigma = (s: number) => 1 / (1 + Math.exp(-(coeffs.intercept + coeffs.slope * (s / 100))));
  return (
    <div style={{ position: "relative", marginTop: 10 }}>
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label="Calibration curve mapping risk score to injury probability"
      >
        {[0, pMax / 2, pMax].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={CHART_W - PAD.r} y1={y(v)} y2={y(v)} stroke={LINE_HEX} strokeWidth={1} />
            <text x={PAD.l - 6} y={y(v) + 3} textAnchor="end" fontSize={9} fill={ASH} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {Math.round(v * 100)}%
            </text>
          </g>
        ))}
        {[0, 50, 100].map((s) => (
          <text key={s} x={x(s)} y={CHART_H - 6} textAnchor="middle" fontSize={9} fill={ASH} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {s}
          </text>
        ))}
        <path d={path} fill="none" stroke={LIME_HEX} strokeWidth={2} />
        {/* the athlete's current position: dashed guides + ringed marker */}
        <line x1={x(score)} x2={x(score)} y1={y(p)} y2={CHART_H - PAD.b} stroke={ASH} strokeWidth={1} strokeDasharray="3 3" />
        <line x1={PAD.l} x2={x(score)} y1={y(p)} y2={y(p)} stroke={ASH} strokeWidth={1} strokeDasharray="3 3" />
        <circle cx={x(score)} cy={y(p)} r={5} fill={LIME_HEX} stroke={SVG_INK} strokeWidth={2} />
        <text x={Math.min(x(score) + 9, CHART_W - PAD.r + 2)} y={y(p) - 8} fontSize={9} fill={SVG_CHALK} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          score {score} → {(p * 100).toFixed(1)}%
        </text>
        {hover != null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={CHART_H - PAD.b} stroke={ASH} strokeWidth={1} strokeDasharray="2 3" />
        )}
      </svg>
      {hover != null && (
        <div
          style={{
            position: "absolute",
            left: `${(x(hover) / CHART_W) * 100}%`,
            top: 0,
            transform: `translateX(${hover > 50 ? "calc(-100% - 8px)" : "8px"})`,
            background: INK2,
            border: `1px solid ${LINE}`,
            borderRadius: 7,
            padding: "6px 9px",
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          <Mono s={{ fontSize: fs.micro, display: "block" }} c={CHALK}>
            score {hover} → p {(sigma(hover) * 100).toFixed(1)}%
          </Mono>
        </div>
      )}
    </div>
  );
}
