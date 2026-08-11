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
  roleText,
  tint,
} from "@/lib/ui";
import {
  computeEngineTrace,
  deriveHpi,
  deriveReadiness,
  heatAdjustment,
  heatIntensity,
  sampleHeatSignals,
  whatIfHeat,
  HEAT_CREDIT_MAX,
  HEAT_REF_C,
  HEAT_WINDOW_H,
  deriveTissueRisk,
  feelingImpacts,
  FEELING_THRESHOLDS,
  READINESS_FACE,
  ENGINE_FORMULAS,
  ENGINE_FORMULA_GROUPS,
  ALL_MUSCLES,
  logisticCurve,
  whatIfLog,
  whatIfBio,
  EFFORT_BIAS_MAX,
  EFFORT_TREND_MIN_SAMPLES,
  EFFORT_TREND_MIN_DAYS,
  HYBRID_WEIGHTS,
  STRENGTH_WEIGHTS,
  ENDURANCE_WEIGHTS,
  PRIOR_COEFFS,
  RISK_MODEL_VERSION,
  SAMPLE_TRAINING_LOG,
  SAMPLE_BIOMETRICS,
  SPIKE_ONSET_PRIOR,
  SPIKE_ONSET_MIN,
  SPIKE_ONSET_MAX,
  riskRole,
  hpiRole,
  readinessRole,
  readinessRingSegments,
  KEPT_ARC_ALPHA,
  type Derivation,
  type HeatAdjustment,
  type HeatSignalRow,
  type MuscleGroup,
  type Personalization,
  type EffortModel,
  type EffortTrend,
  type Biometrics,
  type CalibrationCoeffs,
  type EngineTrace,
  type HpiWeights,
  type TrainingLog,
  type ReadinessDeficit,
  type ReadinessCost,
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
  /** The athlete's `sauna` / `saunaTemp` rows, queried on their own so an
   *  unrelated stream can't evict them (see lib/athlete-state.ts). */
  heatSignals?: HeatSignalRow[];
  sessionCount: number;
  calibration: { coeffs: CalibrationCoeffs; version: string; n: number };
  personal?: Personalization;
  effort?: { model: EffortModel; trend: EffortTrend | null; rated: number };
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

type WhatIfState = {
  loadPct: number; hrv: number | null; restingHr: number | null; sleep: number | null;
  /** A simulated sitting: minutes, °C, and how long ago. Null = leave the
   *  athlete's real heat log alone (0 minutes is how you ask for "none"). */
  heatMinutes: number | null; heatTempC: number; heatHoursAgo: number;
};
const WHATIF_OFF: WhatIfState = {
  loadPct: 100, hrv: null, restingHr: null, sleep: null,
  heatMinutes: null, heatTempC: HEAT_REF_C, heatHoursAgo: 10,
};

type Scenario = { id: string; name: string; whatIf: WhatIfState };

/** Ready-made scenarios so comparison starts with one click. Biometric
 *  overrides are RELATIVE (pct of baseline) so they fit any athlete. */
const SCENARIO_PRESETS: { name: string; loadPct: number; hrvPct?: number; sleepH?: number; heatMinutes?: number; heatTempC?: number }[] = [
  { name: "Crashed recovery", loadPct: 100, hrvPct: 65, sleepH: 5 },
  { name: "Eased week (50%)", loadPct: 50 },
  { name: "Overreached (150%)", loadPct: 150 },
  // Heat only ever shows on an athlete with NO fresh wearable — the prior
  // stands down for a measurement — so the preset that demonstrates it has to
  // be one, or the panel reads +0 and the slider looks broken.
  { name: "No wearable, sauna last night", loadPct: 100, heatMinutes: 25, heatTempC: 90 },
];

// Feeling accent → the app's semantic tokens (same mapping READINESS_FACE uses).
const FEELING_COLOR: Record<string, string> = { lime: LIME_HEX, blue: BLUE, amber: AMBER, red: RED };

export default function EngineRoom() {
  // ---- source: sample athlete or a real user ----
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickedUser[]>([]);
  const [feed, setFeed] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [profileId, setProfileId] = useState("hybrid");
  const [whatIf, setWhatIf] = useState<WhatIfState>(WHATIF_OFF);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [scenarioName, setScenarioName] = useState("");
  const [tissue, setTissue] = useState<MuscleGroup>("quads");
  const searchSeq = useRef(0);
  const scenarioSeq = useRef(0);

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
  const personal = feed?.personal;
  const spikeOnset = personal?.spikeOnset ?? SPIKE_ONSET_PRIOR;
  const effort = feed?.effort;
  const weights = (PROFILES.find((p) => p.id === profileId) ?? PROFILES[0]!).weights;

  const whatIfActive =
    whatIf.loadPct !== 100 || whatIf.hrv != null || whatIf.restingHr != null || whatIf.sleep != null ||
    whatIf.heatMinutes != null;

  // Frozen once per athlete: `heatAdjustment` decays against the clock, and a
  // console whose arithmetic drifts between two renders cannot be checked
  // against the athlete's card.
  const now = useMemo(() => Date.now(), [feed]);
  const heatSignals: HeatSignalRow[] = useMemo(() => feed?.heatSignals ?? sampleHeatSignals(now), [feed, now]);

  const base = useMemo(
    () => computeEngineTrace(log, bio, { weights, coeffs, spikeOnset, heatSignals, now }),
    [log, bio, weights, coeffs, spikeOnset, heatSignals, now],
  );
  // The transformed inputs are shared by the headline trace, the derivations,
  // and the feeling lab, so everything on screen describes the SAME state.
  const simLog = useMemo(
    () => (whatIfActive ? whatIfLog(log, whatIf.loadPct) : log),
    [whatIfActive, log, whatIf.loadPct],
  );
  const simBio = useMemo(
    () =>
      whatIfActive
        ? whatIfBio(bio, {
            hrv: whatIf.hrv ?? undefined,
            restingHr: whatIf.restingHr ?? undefined,
            sleep: whatIf.sleep ?? undefined,
          })
        : bio,
    [whatIfActive, bio, whatIf],
  );
  const simHeatSignals = useMemo(
    () => (whatIfActive ? whatIfHeat(heatSignals, { heatMinutes: whatIf.heatMinutes ?? undefined, heatTempC: whatIf.heatTempC, heatHoursAgo: whatIf.heatHoursAgo }, now) : heatSignals),
    [whatIfActive, heatSignals, whatIf.heatMinutes, whatIf.heatTempC, whatIf.heatHoursAgo, now],
  );
  const sim = useMemo(
    () =>
      whatIfActive
        ? computeEngineTrace(simLog, simBio, { weights, coeffs, spikeOnset, heatSignals: simHeatSignals, now })
        : base,
    [whatIfActive, simLog, simBio, weights, coeffs, spikeOnset, simHeatSignals, now, base],
  );

  // Step-by-step derivations of the state on screen (simulated when a what-if
  // is active — the math always explains the numbers you're looking at).
  const simHeat = useMemo(
    () => heatAdjustment(simHeatSignals, { now, bio: simBio }),
    [simHeatSignals, now, simBio],
  );
  const readinessDeriv = useMemo(() => deriveReadiness(simLog, simBio, simHeat), [simLog, simBio, simHeat]);
  const hpiDeriv = useMemo(() => deriveHpi(simLog, simBio, weights), [simLog, simBio, weights]);
  const tissueDeriv = useMemo(
    () => deriveTissueRisk(simLog, tissue, simBio, coeffs, spikeOnset),
    [simLog, tissue, simBio, coeffs, spikeOnset],
  );
  const feelings = useMemo(() => feelingImpacts(simLog, simBio), [simLog, simBio]);

  // Named scenarios, each run through the full stack against the ACTUAL inputs.
  const scenarioTraces = useMemo(
    () =>
      scenarios.map((s) => {
        const active =
          s.whatIf.loadPct !== 100 || s.whatIf.hrv != null || s.whatIf.restingHr != null || s.whatIf.sleep != null;
        const t = active
          ? computeEngineTrace(
              whatIfLog(log, s.whatIf.loadPct),
              whatIfBio(bio, {
                hrv: s.whatIf.hrv ?? undefined,
                restingHr: s.whatIf.restingHr ?? undefined,
                sleep: s.whatIf.sleep ?? undefined,
              }),
              { weights, coeffs, spikeOnset },
            )
          : base;
        return { ...s, trace: t };
      }),
    [scenarios, log, bio, weights, coeffs, spikeOnset, base],
  );

  const addScenario = (name: string, w: WhatIfState) => {
    scenarioSeq.current += 1;
    setScenarios((prev) => [...prev, { id: `s${scenarioSeq.current}`, name, whatIf: w }]);
  };
  const addPreset = (p: (typeof SCENARIO_PRESETS)[number]) => {
    addScenario(p.name, {
      ...WHATIF_OFF,
      loadPct: p.loadPct,
      hrv: p.hrvPct != null && bio ? Math.round(bio.hrv.baseline * (p.hrvPct / 100)) : null,
      restingHr: null,
      sleep: p.sleepH ?? null,
      ...(p.heatMinutes != null ? { heatMinutes: p.heatMinutes, heatTempC: p.heatTempC ?? HEAT_REF_C } : {}),
    });
  };

  const t = sim; // what the headline reflects (base when no what-if is active)
  const delta = (a: number, b: number) => {
    const d = a - b;
    return d === 0 ? "±0" : d > 0 ? `+${d}` : `−${Math.abs(d)}`;
  };

  return (
    <div style={{ display: "grid", gap: space.lg }}>
      {/* ---- intro + source picker ---- */}
      <Card style={{ borderLeft: `3px solid ${LIME}` }}>
        <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em" }} c={LIME}>
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
                  <button className="pressable"
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
            <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".12em" }}>HPI weights</Mono>
            {PROFILES.map((p) => (
              <button className="pressable"
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

      {/* ---- WHERE READINESS'S MISSING POINTS WENT ----
           The same split the athlete's ring draws, from the same engine call,
           so the console and the card can be checked against each other rather
           than trusted separately. The row sums to 100 by law (readinessDeficit
           apportions by largest remainder); if it ever doesn't, one of the two
           surfaces is lying and this is where you'd see it. */}
      <DeficitBar deficit={t.deficit} whatIfActive={whatIfActive} />

      {/* ---- THE HEAT PRIOR ----
           Rendered whenever a sitting is in the window, INCLUDING when the
           wearable suppressed it: "computed and stood down" and "never
           computed" are different facts, and this is the only surface where
           that distinction can be checked. */}
      <HeatPanel heat={t.heat} whatIfActive={whatIfActive} />

      {/* ---- why these numbers: step-by-step derivations ---- */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))", gap: space.lg }}>
        <DerivationPanel derivation={readinessDeriv} accent={LIME} whatIfActive={whatIfActive} />
        <DerivationPanel derivation={hpiDeriv} accent={LIME} whatIfActive={whatIfActive} />
      </div>

      {/* ---- what-if simulator ---- */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: space.sm }}>
          <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em" }} c={VIOLET}>
            What-if simulator
          </Mono>
          <div style={{ display: "flex", gap: space.sm, alignItems: "center" }}>
            {whatIfActive && <Chip c={VIOLET}>simulating</Chip>}
            {whatIfActive && <Button label="Reset to actual" variant="outline" onClick={() => setWhatIf(WHATIF_OFF)} />}
          </div>
        </div>
        <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 4, lineHeight: 1.5 }}>
          The sliders transform the INPUTS (last-7-day training scale, today&apos;s wearable readings,
          a simulated sauna) and re-run the whole stack live — the exact engines, not an
          approximation. The heat sliders REPLACE the athlete&apos;s own sittings while active, so
          0&nbsp;minutes answers &ldquo;what if they had not&rdquo;; leave them untouched to read what
          they actually logged.
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
            label="Sauna — minutes"
            value={whatIf.heatMinutes ?? 0}
            display={whatIf.heatMinutes == null ? "as logged" : whatIf.heatMinutes === 0 ? "none" : `${whatIf.heatMinutes} min`}
            min={0}
            max={90}
            step={5}
            onChange={(v) => setWhatIf({ ...whatIf, heatMinutes: v })}
          />
          <Slider
            label="Sauna — temperature"
            disabled={whatIf.heatMinutes == null}
            value={whatIf.heatTempC}
            display={`${whatIf.heatTempC} °C (×${heatIntensity(whatIf.heatTempC).toFixed(2)})`}
            min={40}
            max={110}
            step={5}
            onChange={(v) => setWhatIf({ ...whatIf, heatTempC: v })}
          />
          <Slider
            label="Sauna — hours ago"
            disabled={whatIf.heatMinutes == null}
            value={whatIf.heatHoursAgo}
            display={`${whatIf.heatHoursAgo} h`}
            min={0}
            max={HEAT_WINDOW_H}
            step={1}
            onChange={(v) => setWhatIf({ ...whatIf, heatHoursAgo: v })}
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

        {/* named scenarios — save the sliders, add presets, compare in one table */}
        <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 16, paddingTop: 14 }}>
          <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap", alignItems: "center" }}>
            <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".12em" }}>Scenarios</Mono>
            {SCENARIO_PRESETS.map((p) => (
              <button className="pressable"
                key={p.name}
                onClick={() => addPreset(p)}
                disabled={scenarios.some((s) => s.name === p.name)}
                style={{
                  ...mono,
                  fontSize: fs.micro,
                  color: txt(ASH),
                  background: "transparent",
                  border: `1px dashed ${LINE}`,
                  borderRadius: 999,
                  padding: "5px 10px",
                  cursor: "pointer",
                  opacity: scenarios.some((s) => s.name === p.name) ? 0.4 : 1,
                }}
              >
                + {p.name}
              </button>
            ))}
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center", marginLeft: "auto" }}>
              <input
                value={scenarioName}
                onChange={(e) => setScenarioName(e.target.value)}
                placeholder="Name current sliders…"
                style={{ ...mono, fontSize: fs.micro, color: CHALK, background: INK2, border: `1px solid ${LINE}`, borderRadius: 999, padding: "6px 12px", outline: "none", width: 170 }}
              />
              <Button
                label="Save scenario"
                variant="outline"
                disabled={!whatIfActive}
                onClick={() => {
                  addScenario(scenarioName.trim() || `Scenario ${scenarios.length + 1}`, whatIf);
                  setScenarioName("");
                }}
              />
            </span>
          </div>

          {scenarioTraces.length > 0 && (
            <div style={{ overflowX: "auto", marginTop: 12 }}>
              <table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Scenario", "Inputs", "HPI", "Readiness", "Risk", "p(injury)", "Flagged", ""].map((h) => (
                      <th key={h} style={{ ...mono, fontSize: fs.nano, textTransform: "uppercase", color: txt(ASH), textAlign: "left", padding: "6px 10px", borderBottom: `1px solid ${LINE}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={cellPlain(CHALK)}>Actual</td>
                    <td style={cellPlain(ASH)}>as logged</td>
                    <ScenarioCells trace={base} baseline={base} />
                    <td style={cellPlain(ASH)} />
                  </tr>
                  {scenarioTraces.map((s) => (
                    <tr key={s.id}>
                      <td style={cellPlain(CHALK)}>{s.name}</td>
                      <td style={cellPlain(ASH)}>{describeWhatIf(s.whatIf, bio)}</td>
                      <ScenarioCells trace={s.trace} baseline={base} />
                      <td style={{ padding: "8px 10px", borderBottom: `1px solid ${LINE}` }}>
                        <button className="pressable"
                          onClick={() => setScenarios((prev) => prev.filter((x) => x.id !== s.id))}
                          aria-label={`Remove scenario ${s.name}`}
                          style={{ ...mono, fontSize: fs.micro, color: txt(ASH), background: "transparent", border: "none", cursor: "pointer" }}
                        >
                          remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {/* ---- feeling lab ---- */}
      <Card>
        <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em" }} c={BLUE}>
          Check-in feeling lab – what the one-tap answer does
        </Mono>
        <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 4, lineHeight: 1.5 }}>
          The picker writes a 1–5 rating (energy, sleep, soreness, mood — the quick pick sets all
          four equal). The rating maps to a feeling, and the feeling mechanically scales today&apos;s
          prescribed session. Each row below is the REAL prescription engine run for this athlete
          under that feeling.
        </Mono>
        <div style={{ display: "flex", gap: space.md, flexWrap: "wrap", marginTop: 10 }}>
          {FEELING_THRESHOLDS.map((t) => (
            <Mono key={t.feeling} s={{ fontSize: fs.nano }}>
              <span style={{ color: txt(FEELING_COLOR[READINESS_FACE[t.feeling].accent]) }}>{t.feeling}</span> {t.range}
            </Mono>
          ))}
        </div>
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Feeling", "Load factor", "Sets shed", "Prescribed session", "Moved it?"].map((h) => (
                  <th key={h} style={{ ...mono, fontSize: fs.nano, textTransform: "uppercase", color: txt(ASH), textAlign: "left", padding: "6px 10px", borderBottom: `1px solid ${LINE}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {feelings.map((r) => (
                <tr key={r.feeling}>
                  <td style={{ padding: "8px 10px", borderBottom: `1px solid ${LINE}` }}>
                    <Chip c={FEELING_COLOR[READINESS_FACE[r.feeling].accent]}>{r.feeling}</Chip>
                  </td>
                  <td style={cellPlain(CHALK)}>× {r.factor.toFixed(2)}</td>
                  <td style={cellPlain(r.setAdj ? RED : ASH)}>{r.setAdj || "—"}</td>
                  <td style={cellPlain(CHALK)}>
                    {r.move} – {r.sets} × {r.reps} @ {r.load}{r.load === "BW" ? "" : " kg"}
                  </td>
                  <td style={cellPlain(r.moved ? CHALK : ASH)}>{r.moved ? "yes" : "neutral"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Mono s={{ fontSize: fs.nano, display: "block", marginTop: 10, lineHeight: 1.5 }}>
          The feeling never touches HPI, readiness, or injury risk — those read the objective log
          and wearables. It scales the PRESCRIPTION on top of the progression dose
          (readinessLoadFactor in prescribeSession), and a wrecked day also sheds a set.
        </Mono>
      </Card>

      {/* ---- personal model ---- */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: space.sm }}>
          <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em" }} c={VIOLET}>
            Personal model – this athlete&apos;s ACWR spike onset
          </Mono>
          {personal?.personalized ? <Chip c={VIOLET}>personalized</Chip> : <Chip c={ASH}>population prior</Chip>}
        </div>
        <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 4, lineHeight: 1.5 }}>
          The population model starts ramping spike risk at ACWR {SPIKE_ONSET_PRIOR}. The personal
          onset shrinks toward what this athlete has demonstrated: spikes tolerated without injury
          raise it (max {SPIKE_ONSET_MAX}), recorded injuries lower it (min {SPIKE_ONSET_MIN}).
          {!feed && " The sample athlete has no outcome history, so the prior applies."}
        </Mono>
        {/* onset scale: min .. max with the prior and the personal value marked */}
        <div style={{ marginTop: 16, position: "relative", height: 34 }}>
          <div style={{ position: "absolute", top: 14, left: 0, right: 0, height: 6, background: INK2, borderRadius: 3 }} />
          {[
            { v: SPIKE_ONSET_PRIOR, label: `prior ${SPIKE_ONSET_PRIOR}`, c: ASH, dashed: true },
            ...(spikeOnset !== SPIKE_ONSET_PRIOR
              ? [{ v: spikeOnset, label: `personal ${spikeOnset}`, c: VIOLET, dashed: false }]
              : []),
          ].map((m) => {
            const pct = ((m.v - SPIKE_ONSET_MIN) / (SPIKE_ONSET_MAX - SPIKE_ONSET_MIN)) * 100;
            return (
              <div key={m.label} style={{ position: "absolute", left: `${pct}%`, top: 0, transform: "translateX(-50%)", textAlign: "center" }}>
                <Mono s={{ fontSize: fs.nano, display: "block", whiteSpace: "nowrap" }} c={m.c}>{m.label}</Mono>
                <div style={{ width: m.dashed ? 2 : 4, height: 14, background: m.c, margin: "2px auto 0", borderRadius: 2, opacity: m.dashed ? 0.7 : 1 }} />
              </div>
            );
          })}
          <Mono s={{ fontSize: fs.nano, position: "absolute", left: 0, bottom: -14 }}>{SPIKE_ONSET_MIN}</Mono>
          <Mono s={{ fontSize: fs.nano, position: "absolute", right: 0, bottom: -14 }}>{SPIKE_ONSET_MAX}</Mono>
        </div>
        <div style={{ display: "flex", gap: space.lg, flexWrap: "wrap", marginTop: 26 }}>
          <Mono s={{ fontSize: fs.micro }}>
            evidence: {personal ? `${personal.n} informative outcome${personal.n === 1 ? "" : "s"}` : "none"}
          </Mono>
          <Mono s={{ fontSize: fs.micro }} c={LIME}>
            tolerated spikes: {personal?.toleratedSpikes ?? 0}
          </Mono>
          <Mono s={{ fontSize: fs.micro }} c={RED}>
            injuries: {personal?.injuries ?? 0}
          </Mono>
          <Mono s={{ fontSize: fs.micro, marginLeft: "auto" }}>
            spike formula in effect: ramp(ACWR, {spikeOnset}, {(spikeOnset + 0.9).toFixed(2)}) × 55
          </Mono>
        </div>
      </Card>

      {/* ---- effort model ---- */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: space.sm }}>
          <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em" }} c={VIOLET}>
            Effort model – what this athlete says the work costs them
          </Mono>
          <div style={{ display: "flex", gap: space.sm, alignItems: "baseline" }}>
            {/* Every other card on this screen follows the what-if sliders. This
                one deliberately does not: the sliders transform the CURRENT
                inputs, and an athlete's past answers don't change because an
                operator dragged a slider. Said out loud so a static card next to
                moving ones doesn't read as a bug. */}
            {whatIfActive && <Chip c={ASH}>not simulated</Chip>}
            {effort?.model.personalized ? <Chip c={VIOLET}>personalized</Chip> : <Chip c={ASH}>population prior</Chip>}
          </div>
        </div>
        <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 4, lineHeight: 1.5 }}>
          Two athletes run the same 10 km in the same 40 minutes and the log records the same
          session. The bias is the shrunk mean of (reported session RPE − the RPE the log implies),
          so a positive value means this athlete pays more for the same work. Bounded to
          ±{EFFORT_BIAS_MAX} RPE; it feeds ACWR and injury risk through the training log.
          {!feed && " The sample athlete has no rated sessions, so the prior applies."}
        </Mono>

        {/* bias scale: −max .. +max with the prior (0) and the learned value marked */}
        <div style={{ marginTop: 16, position: "relative", height: 34 }}>
          <div style={{ position: "absolute", top: 14, left: 0, right: 0, height: 6, background: INK2, borderRadius: 3 }} />
          {[
            { v: 0, label: "prior 0", c: ASH, dashed: true },
            ...(effort && effort.model.bias !== 0
              ? [{ v: effort.model.bias, label: `personal ${effort.model.bias > 0 ? "+" : ""}${effort.model.bias}`, c: VIOLET, dashed: false }]
              : []),
          ].map((m) => {
            const pct = ((m.v + EFFORT_BIAS_MAX) / (2 * EFFORT_BIAS_MAX)) * 100;
            return (
              <div key={m.label} style={{ position: "absolute", left: `${pct}%`, top: 0, transform: "translateX(-50%)", textAlign: "center" }}>
                <Mono s={{ fontSize: fs.nano, display: "block", whiteSpace: "nowrap" }} c={m.c}>{m.label}</Mono>
                <div style={{ width: m.dashed ? 2 : 4, height: 14, background: m.c, margin: "2px auto 0", borderRadius: 2, opacity: m.dashed ? 0.7 : 1 }} />
              </div>
            );
          })}
          <Mono s={{ fontSize: fs.nano, position: "absolute", left: 0, bottom: -14 }}>−{EFFORT_BIAS_MAX}</Mono>
          <Mono s={{ fontSize: fs.nano, position: "absolute", right: 0, bottom: -14 }}>+{EFFORT_BIAS_MAX}</Mono>
        </div>

        {/* Does the personalization actually earn its keep? Leave-one-out, so an
            honest "no" is possible — an in-sample fit always looks like a win. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: space.lg, marginTop: 30 }}>
          <Stat label="Rated sessions" value={String(effort?.rated ?? 0)} />
          <Stat
            label="Model error (LOO)"
            value={effort?.model.mae != null ? `${effort.model.mae.toFixed(2)} RPE` : "—"}
            sub="held out"
          />
          <Stat
            label="Engine baseline"
            value={effort?.model.baselineMae != null ? `${effort.model.baselineMae.toFixed(2)} RPE` : "—"}
            sub="no personalization"
          />
          <Stat
            label="Same work over time"
            value={effort?.trend ? `${effort.trend.perMonth > 0 ? "+" : ""}${effort.trend.perMonth} /mo` : "—"}
            sub={effort?.trend ? effort.trend.direction : "not enough data"}
            c={effort?.trend?.direction === "fitter" ? LIME : effort?.trend?.direction === "harder" ? RED : CHALK}
          />
        </div>

        <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 18, lineHeight: 1.6 }}>
          {(() => {
            const m = effort?.model;
            if (!m || m.mae == null || m.baselineMae == null)
              return `Not scored yet — leave-one-out needs at least 3 rated sessions (${effort?.rated ?? 0} so far).`;
            const d = m.baselineMae - m.mae;
            if (d > 0.005)
              return `Personalizing beats the unpersonalised engine by ${d.toFixed(2)} RPE per session, held out. Scored leave-one-out: the bias is refitted without each session before predicting it, so this is not the fit flattering itself.`;
            return "No better than the unpersonalised engine — this athlete reports roughly what their log implies, so there is nothing to personalise. Scored leave-one-out, which is why it can say so.";
          })()}
        </Mono>

        <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 10, lineHeight: 1.6 }} c={effort?.trend?.direction === "fitter" ? LIME : effort?.trend?.direction === "harder" ? RED : undefined}>
          {effort?.trend
            ? effort.trend.direction === "fitter"
              ? `The same objective work is reporting ${Math.abs(effort.trend.perMonth)} RPE easier per month across ${effort.trend.n} sessions over ${effort.trend.days} days — the one fitness read a self-report can honestly give.`
              : effort.trend.direction === "harder"
                ? `The same objective work is reporting ${effort.trend.perMonth} RPE harder per month across ${effort.trend.n} sessions over ${effort.trend.days} days — worth reading next to load and recovery.`
                : `Flat across ${effort.trend.n} sessions over ${effort.trend.days} days: the same work costs them the same as it did.`
            : `No trend yet — it needs ${EFFORT_TREND_MIN_SAMPLES} rated sessions spanning ${EFFORT_TREND_MIN_DAYS} days, because a slope through fewer points in one week is a line through noise.`}
        </Mono>
      </Card>

      {/* ---- trajectory + calibration curve ---- */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: space.lg }}>
        <Card>
          <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em" }} c={ASH}>
            14-day trajectory
          </Mono>
          <TrajectoryChart trace={t} />
        </Card>
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: space.sm }}>
            <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em" }} c={ASH}>
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
        <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em" }} c={ASH}>
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
        <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em" }} c={ASH}>
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

        {/* per-tissue derivation — pick a tissue, see the substituted math */}
        <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 14, paddingTop: 14 }}>
          <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap", alignItems: "center" }}>
            <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".12em" }}>Show the math for</Mono>
            {ALL_MUSCLES.map((m) => (
              <button className="pressable"
                key={m}
                onClick={() => setTissue(m)}
                style={{
                  ...mono,
                  fontSize: fs.micro,
                  textTransform: "capitalize",
                  color: txt(tissue === m ? LIME : ASH),
                  background: tissue === m ? `${LIME_HEX}1c` : "transparent",
                  border: `1px solid ${tissue === m ? LIME : LINE}`,
                  borderRadius: 999,
                  padding: "4px 10px",
                  cursor: "pointer",
                }}
              >
                {m}
              </button>
            ))}
          </div>
          <DerivationSteps derivation={tissueDeriv} />
        </div>
      </Card>

      {/* ---- compare two athletes ---- */}
      <CompareCard weights={weights} whatIfActive={whatIfActive} current={{ label: feed ? (feed.user.name ?? feed.user.email) : "Sample athlete", trace: base, personalOnset: spikeOnset, sessionCount: feed?.sessionCount ?? SAMPLE_TRAINING_LOG.length, bio }} />

      {/* ---- formula sheet ---- */}
      <Card>
        <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em" }} c={ASH}>
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
          <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em" }} c={BLUE}>
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

function cellPlain(color: string): React.CSSProperties {
  return { ...mono, fontSize: fs.caption, padding: "8px 10px", color: txt(color), borderBottom: `1px solid ${LINE}` };
}

/** Human line for a scenario's transformed inputs. */
function describeWhatIf(w: WhatIfState, bio?: Biometrics): string {
  const parts: string[] = [];
  if (w.loadPct !== 100) parts.push(`load ${w.loadPct}%`);
  if (w.hrv != null) parts.push(`HRV ${w.hrv}${bio ? ` (base ${bio.hrv.baseline})` : ""}`);
  if (w.restingHr != null) parts.push(`RHR ${w.restingHr}`);
  if (w.sleep != null) parts.push(`sleep ${w.sleep} h`);
  return parts.length ? parts.join(", ") : "as logged";
}

/** The four metric cells of a scenario row, with deltas vs the actual state. */
function ScenarioCells({ trace, baseline }: { trace: EngineTrace; baseline: EngineTrace }) {
  const d = (a: number, b: number) => {
    const x = a - b;
    return x === 0 ? "" : x > 0 ? ` (+${x})` : ` (−${Math.abs(x)})`;
  };
  const same = trace === baseline;
  return (
    <>
      <td style={cellPlain(CHALK)}>
        {trace.state.hpi.score}
        {!same && <span style={{ color: txt(ASH) }}>{d(trace.state.hpi.score, baseline.state.hpi.score)}</span>}
      </td>
      <td style={cellPlain(CHALK)}>
        {trace.state.readiness.score}
        {!same && <span style={{ color: txt(ASH) }}>{d(trace.state.readiness.score, baseline.state.readiness.score)}</span>}
      </td>
      <td style={cellPlain(CHALK)}>
        {trace.injury.overall}
        {!same && <span style={{ color: txt(ASH) }}>{d(trace.injury.overall, baseline.injury.overall)}</span>}
      </td>
      <td style={cellPlain(CHALK)}>{(trace.injury.prob * 100).toFixed(1)}%</td>
      <td style={cellPlain(trace.injury.flagged.length ? RED : ASH)}>{trace.injury.flagged.length}</td>
    </>
  );
}

/** Step list of a derivation — label + the substituted arithmetic. */
function DerivationSteps({ derivation }: { derivation: Derivation }) {
  return (
    <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
      {derivation.steps.map((s) => (
        <div key={s.label} style={{ display: "grid", gap: 2 }}>
          <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".08em" }}>{s.label}</Mono>
          <code style={{ ...mono, fontSize: fs.caption, color: txt(CHALK), background: INK2, border: `1px solid ${LINE}`, borderRadius: 7, padding: "6px 10px", overflowX: "auto", whiteSpace: "nowrap" }}>
            {s.math}
          </code>
          {s.note && <Mono s={{ fontSize: fs.nano, lineHeight: 1.5 }}>{s.note}</Mono>}
        </div>
      ))}
    </div>
  );
}

/** A headline derivation as a collapsible card ("How is this calculated?"). */
/**
 * THE HEAT PRIOR, WITH ITS REASONING SHOWN.
 *
 * Two things this must never do, both of which the readiness card has been
 * caught doing before with other terms:
 *
 *  1. Show a bare total. The credit is a product of a temperature ramp, a
 *     saturating dose and a decay, and an operator asked "why is this +2" needs
 *     all three, not the 2.
 *  2. Go quiet when the term contributed nothing. A SUPPRESSED prior and an
 *     absent one are different states — the first means the wearable is
 *     carrying the answer, the second means nothing was logged — and if the
 *     panel renders identically for both, the suppression rule is unauditable
 *     and might as well not exist.
 *
 * So the arithmetic is printed whenever a sitting is in the window, and the
 * headline says WHY it is worth what it is worth.
 */
function HeatPanel({ heat, whatIfActive }: { heat: HeatAdjustment; whatIfActive: boolean }) {
  const has = heat.sittings.length > 0;
  const accent = heat.suppressed ? ASH : AMBER;
  return (
    <Card style={{ borderLeft: `3px solid ${has ? accent : LINE}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: space.sm, flexWrap: "wrap" }}>
        <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em" }} c={has ? accent : ASH}>
          Heat prior – the one input no device measures
        </Mono>
        <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".12em" }} c={ASH}>
          {whatIfActive ? "simulated – " : ""}
          {has ? `${heat.sittings.length} sitting${heat.sittings.length === 1 ? "" : "s"} in ${HEAT_WINDOW_H} h` : `nothing logged in ${HEAT_WINDOW_H} h`}
        </Mono>
      </div>

      {!has ? (
        <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 6, lineHeight: 1.5 }}>
          No sauna in the window, so the term contributes +0. Both halves of this input are TYPED
          (how long, how hot) — there is no device to sync and nothing to wait for.
        </Mono>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: space.md, marginTop: 10, flexWrap: "wrap" }}>
            <span style={{ ...disp, fontSize: 34, lineHeight: 1, color: txt(has && !heat.suppressed ? AMBER : ASH) }}>
              {heat.suppressed ? "+0" : `+${heat.points}`}
            </span>
            <Mono s={{ fontSize: fs.caption, lineHeight: 1.5 }}>
              {heat.suppressed
                ? "SUPPRESSED — a fresh wearable reading already measures what the sauna did, so the prior stands down rather than stacking on it."
                : `no fresh wearable reading, so the prior applies — capped at ${HEAT_CREDIT_MAX}, one fifth of the wearable's ±15.`}
            </Mono>
          </div>

          <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
            {heat.sittings.map((x) => (
              <code key={x.ts} style={{ ...mono, fontSize: fs.caption, color: txt(CHALK), background: INK2, border: `1px solid ${LINE}`, borderRadius: 7, padding: "6px 10px", overflowX: "auto", whiteSpace: "nowrap" }}>
                {new Date(x.ts).toLocaleString()} – {x.minutes} min @ {x.tempC}&deg;C
                {x.assumedTemp ? " (assumed)" : ""} &rarr; {x.equivMin.toFixed(1)} equiv min
              </code>
            ))}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: `4px ${space.lg}px`, marginTop: 12 }}>
            <HeatFig label="equivalent min" value={heat.equivMin.toFixed(1)} />
            <HeatFig label="dose" value={heat.dose.toFixed(2)} />
            <HeatFig label="hours since" value={(heat.hoursSince ?? 0).toFixed(1)} />
            <HeatFig label="decay" value={heat.decay.toFixed(2)} />
            <HeatFig label="dose × decay" value={(heat.dose * heat.decay).toFixed(2)} />
          </div>

          {heat.assumed && (
            <Mono s={{ fontSize: fs.nano, display: "block", marginTop: 10, lineHeight: 1.5 }} c={ASH}>
              A sitting carried no temperature and was read at the {HEAT_REF_C}&deg;C reference. It still
              counts, and it is marked — a stated assumption can be argued with, an invisible one cannot.
            </Mono>
          )}
        </>
      )}
    </Card>
  );
}

function HeatFig({ label, value }: { label: string; value: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 7 }}>
      <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".1em" }} c={ASH}>{label}</Mono>
      <Mono s={{ fontSize: fs.caption }} c={CHALK}>{value}</Mono>
    </span>
  );
}

/**
 * THE DEFICIT, AS ONE BAR. Readiness is 100 minus what today's training and
 * recovery took, and this is that subtraction drawn: the kept run, then one run
 * per cause, in the same fixed order and the same semantic colours the
 * athlete's ring uses. Two surfaces, one `readinessDeficit` call — so a
 * disagreement between the console and the card is impossible rather than
 * merely unlikely.
 */
function DeficitBar({ deficit, whatIfActive }: { deficit: ReadinessDeficit; whatIfActive: boolean }) {
  // Built from the SAME segments the athlete's ring draws, including the paint:
  // the kept run in its band's hue held back to KEPT_ARC_ALPHA, every cause at
  // full strength. Deriving the colours here instead is how the athlete's card
  // ended up drawing a −3 wearable in the same sand as seventeen ticks of kept
  // score, and an operator surface that claims to mirror the card has to mirror
  // the thing that was wrong with it too.
  const runs = readinessRingSegments(deficit).map((s) => ({
    label: s.kind === "kept" ? "kept" : COST_LABEL[s.kind],
    points: s.points,
    color: s.dim ? tint(roleText(s.role), Math.round(KEPT_ARC_ALPHA * 100)) : roleText(s.role),
  }));
  const sums = deficit.kept + deficit.costs.reduce((a, c) => a + c.points, 0);
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: space.sm, flexWrap: "wrap" }}>
        <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em" }} c={LIME}>
          Readiness deficit – where the points went
        </Mono>
        <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".12em" }} c={sums === 100 ? ASH : RED}>
          {sums === 100 ? "sums to 100" : `SUM LAW BROKEN: ${sums}`}
          {whatIfActive ? " – simulated inputs" : ""}
          {deficit.clamped ? ` – clamped at the ${deficit.clamped}` : ""}
        </Mono>
      </div>
      <div style={{ display: "flex", gap: 2, height: 26, marginTop: space.sm, borderRadius: 8, overflow: "hidden" }}>
        {runs.map((r, i) => (
          <div key={i} style={{ flex: r.points, background: r.color }} title={`${r.label} ${r.points}`} />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: `4px ${space.md}px`, marginTop: space.sm }}>
        {runs.map((r, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: r.color }} />
            <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".08em" }}>
              {r.label} {r.points}
            </Mono>
          </span>
        ))}
      </div>
    </Card>
  );
}

/** Console-side names for the deficit's causes. The athlete's copy resolves
 *  through READINESS_COST_KEY; this surface is operator-only and English. */
const COST_LABEL: Record<ReadinessCost["kind"], string> = {
  tissue: "tissue",
  conditioning: "conditioning",
  wearable: "wearable",
  ceiling: "scale ceiling",
};

function DerivationPanel({ derivation, accent, whatIfActive }: { derivation: Derivation; accent: string; whatIfActive: boolean }) {
  return (
    <Card>
      <details>
        <summary style={{ cursor: "pointer", listStyle: "none", display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: space.sm, flexWrap: "wrap" }}>
          <span>
            <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em" }} c={accent}>
              How is this calculated – {derivation.title}
            </Mono>
            <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 3 }} c={CHALK}>
              {derivation.result}
              {whatIfActive ? " (simulated inputs)" : ""}
            </Mono>
          </span>
          <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".12em" }}>expand ▾</Mono>
        </summary>
        <DerivationSteps derivation={derivation} />
      </details>
    </Card>
  );
}

/** Side-by-side athlete comparison — why does one athlete read better? */
function CompareCard({
  weights,
  whatIfActive,
  current,
}: {
  weights: HpiWeights;
  whatIfActive: boolean;
  current: { label: string; trace: EngineTrace; personalOnset: number; sessionCount: number; bio?: Biometrics };
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickedUser[]>([]);
  const [other, setOther] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const seq = useRef(0);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const mySeq = ++seq.current;
    const t = setTimeout(() => {
      fetch(`/api/admin/users?q=${encodeURIComponent(query)}&pageSize=8`)
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d: { users: PickedUser[] }) => {
          if (seq.current === mySeq) setResults(d.users);
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
    try {
      const r = await fetch(`/api/admin/engine?user=${encodeURIComponent(u.id)}`);
      if (!r.ok) throw new Error();
      setOther((await r.json()) as Feed);
    } catch {
      setErr("Failed to load the comparison athlete.");
      setOther(null);
    } finally {
      setLoading(false);
    }
  };

  const otherTrace = useMemo(
    () =>
      other
        ? computeEngineTrace(other.log, other.bio ?? undefined, {
            weights,
            coeffs: other.calibration.coeffs,
            spikeOnset: other.personal?.spikeOnset,
          })
        : null,
    [other, weights],
  );

  // The deterministic "why": which HPI pillar diverges most between the two.
  const why = useMemo(() => {
    if (!otherTrace) return null;
    const a = current.trace.state;
    const b = otherTrace.state;
    const gaps: { name: string; d: number; av: number; bv: number }[] = [
      { name: "strength freshness", d: a.hpi.components.strength - b.hpi.components.strength, av: a.hpi.components.strength, bv: b.hpi.components.strength },
      { name: "endurance freshness", d: a.hpi.components.endurance - b.hpi.components.endurance, av: a.hpi.components.endurance, bv: b.hpi.components.endurance },
      { name: "recovery signal", d: a.hpi.components.recovery - b.hpi.components.recovery, av: a.hpi.components.recovery, bv: b.hpi.components.recovery },
    ].sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
    const top = gaps[0]!;
    if (top.d === 0) return "The two states are effectively identical on every pillar.";
    const ahead = top.d > 0 ? current.label : (other?.user.name ?? other?.user.email ?? "the other athlete");
    return `Biggest divergence: ${top.name} (${top.av} vs ${top.bv}) — ${ahead} is ahead there. Each side's drivers below show what produced it.`;
  }, [otherTrace, current, other]);

  const row = (label: string, av: React.ReactNode, bv: React.ReactNode) => (
    <tr>
      <td style={cellPlain(ASH)}>{label}</td>
      <td style={cellPlain(CHALK)}>{av}</td>
      <td style={cellPlain(CHALK)}>{bv}</td>
    </tr>
  );

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: space.sm }}>
        <div>
          <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em" }} c={AMBER}>
            Compare athletes – why does one read better?
          </Mono>
          <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 4, lineHeight: 1.5 }}>
            Both columns are ACTUAL states (what-if excluded{whatIfActive ? " — your simulation stays on the main view" : ""}),
            each computed with that athlete&apos;s own inputs, calibration, and personal spike onset.
          </Mono>
        </div>
        <div style={{ position: "relative", flex: "0 1 260px" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Compare with… (name or email)"
            style={{ width: "100%", ...mono, fontSize: fs.body, color: CHALK, background: INK2, border: `1px solid ${LINE}`, borderRadius: 9, padding: "8px 12px", outline: "none" }}
          />
          {results.length > 0 && (
            <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 20, background: INK2, border: `1px solid ${LINE}`, borderRadius: 9, overflow: "hidden" }}>
              {results.map((u) => (
                <button className="pressable" key={u.id} onClick={() => pick(u)} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: "transparent", border: "none", borderBottom: `1px solid ${LINE}`, cursor: "pointer" }}>
                  <span style={{ ...disp, fontSize: fs.body, fontWeight: 600, color: CHALK }}>{u.name ?? u.email}</span>
                  <Mono s={{ fontSize: fs.micro, display: "block" }}>{u.email}</Mono>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {loading && <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 10 }}>Loading…</Mono>}
      {err && <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 10 }} c={RED}>{err}</Mono>}

      {other && otherTrace && (
        <>
          <div style={{ overflowX: "auto", marginTop: 14 }}>
            <table style={{ width: "100%", minWidth: 560, borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...mono, fontSize: fs.nano, textTransform: "uppercase", color: txt(ASH), textAlign: "left", padding: "6px 10px", borderBottom: `1px solid ${LINE}` }}>Metric</th>
                  <th style={{ ...mono, fontSize: fs.nano, textTransform: "uppercase", color: txt(LIME), textAlign: "left", padding: "6px 10px", borderBottom: `1px solid ${LINE}` }}>{current.label}</th>
                  <th style={{ ...mono, fontSize: fs.nano, textTransform: "uppercase", color: txt(BLUE), textAlign: "left", padding: "6px 10px", borderBottom: `1px solid ${LINE}` }}>{other.user.name ?? other.user.email}</th>
                </tr>
              </thead>
              <tbody>
                {row("HPI", `${current.trace.state.hpi.score} (${current.trace.state.hpi.band})`, `${otherTrace.state.hpi.score} (${otherTrace.state.hpi.band})`)}
                {row("Limiter", current.trace.state.hpi.limiter, otherTrace.state.hpi.limiter)}
                {row("Readiness", current.trace.state.readiness.score, otherTrace.state.readiness.score)}
                {row("Wearable adjustment", `${current.trace.state.readiness.bioAdj >= 0 ? "+" : ""}${current.trace.state.readiness.bioAdj}`, `${otherTrace.state.readiness.bioAdj >= 0 ? "+" : ""}${otherTrace.state.readiness.bioAdj}`)}
                {row("Injury risk", `${current.trace.injury.overall} (${current.trace.injury.band})`, `${otherTrace.injury.overall} (${otherTrace.injury.band})`)}
                {row("p(injury)", `${(current.trace.injury.prob * 100).toFixed(1)}%`, `${(otherTrace.injury.prob * 100).toFixed(1)}%`)}
                {row("Personal spike onset", current.personalOnset.toFixed(2), (other.personal?.spikeOnset ?? 1.3).toFixed(2))}
                {row("Sessions in the log", current.sessionCount, other.sessionCount)}
                {row("Wearables", current.bio ? "connected" : "none", other.bio ? "connected" : "none")}
              </tbody>
            </table>
          </div>
          {why && (
            <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 12, lineHeight: 1.55 }} c={CHALK}>
              {why}
            </Mono>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: space.lg, marginTop: 12 }}>
            {[{ label: current.label, tr: current.trace, c: LIME }, { label: other.user.name ?? other.user.email, tr: otherTrace, c: BLUE }].map((side) => (
              <div key={side.label} style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: 12 }}>
                <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".12em" }} c={side.c}>{side.label} – drivers</Mono>
                {side.tr.state.drivers.length === 0 && <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 6 }}>nothing notable</Mono>}
                {side.tr.state.drivers.map((d) => (
                  <Mono key={d.factor} s={{ fontSize: fs.micro, display: "block", marginTop: 6 }} c={d.impact === "negative" ? RED : LIME}>
                    {d.impact === "negative" ? "−" : "+"} {d.factor}: <span style={{ color: txt(ASH) }}>{d.detail}</span>
                  </Mono>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
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
        <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".12em" }}>{label}</Mono>
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
