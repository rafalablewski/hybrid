/**
 * HPI Engine Review — the structured findings of the multidisciplinary
 * scientific & engineering review of the Hybrid Performance Engine.
 *
 * This is the single source of truth (in @hybrid/core, so any client can read
 * it) behind the admin "Performance engine" screen. It encodes the review as
 * DATA — layer-by-layer verdicts, missing components, the redesign blueprint,
 * the roadmap and a prioritised implementation plan — rather than prose, so the
 * admin surface can render, filter and (later) tick items off as they ship.
 *
 * The narrative companion lives at reference/performance-engine-review.md.
 *
 * Pure data. No I/O.
 */

/** How strong the evidence behind a recommendation is. */
export type EvidenceGrade =
  | "established" //   broad consensus / replicated
  | "emerging" //      promising, not yet settled
  | "contested" //     genuinely debated in the literature
  | "speculative"; //  plausible, mostly unproven

/** Where a build item sits in the priority stack. */
export type ReviewPriority = "must" | "should" | "nice" | "experimental";

/** The verdict on one layer of the current engine. */
export interface ReviewLayer {
  id: string;
  /** Display title, e.g. "Composite Performance Index". */
  title: string;
  /** The function/file this layer maps to today, if any. */
  sourceRef?: string;
  /** One-line statement of what the engine does here now. */
  current: string;
  /** What is scientifically / mathematically sound and should be kept. */
  correct: string[];
  /** Concrete flaws: math errors, stats bias, physiology, architecture. */
  flaws: string[];
  /** The redesign — what to build instead. */
  recommendation: string;
  /** Evidence grade for the recommendation. */
  evidence: EvidenceGrade;
  /** Severity of the current state, drives sort/colour. */
  severity: "critical" | "major" | "minor" | "ok";
}

export interface MissingComponent {
  id: string;
  title: string;
  /** Why it matters for an elite-grade engine. */
  rationale: string;
  evidence: EvidenceGrade;
}

/** A proposed latent construct in the redesigned conceptual model. */
export interface LatentConstruct {
  id: string;
  title: string;
  /** Observable inputs that load onto this latent factor. */
  indicators: string;
  /** Is this in scope now, or a later horizon. */
  horizon: "core" | "extended" | "research";
}

/** A ranked top-level weakness of the current engine. */
export interface MajorWeakness {
  /** 1 = most severe. Drives display order. */
  rank: number;
  title: string;
  severity: "critical" | "major" | "minor";
  /** Why it matters + the consequence today. */
  detail: string;
  /** The layer id (see `layers`) this traces back to. */
  relatesTo: string;
}

/** One pillar of the recommended redesign — the blueprint, not the backlog. */
export interface RedesignPillar {
  id: string;
  title: string;
  /** One-line statement of the move. */
  summary: string;
  /** Concrete specifics of the pillar. */
  points: string[];
}

export interface RoadmapItem {
  id: string;
  horizon: "now" | "year1" | "year3" | "year10";
  title: string;
  detail: string;
}

export interface PlanItem {
  id: string;
  priority: ReviewPriority;
  title: string;
  detail: string;
  /** Rough lift. */
  effort: "S" | "M" | "L" | "XL";
}

export interface HpiReview {
  version: string;
  /** ISO date of the review pass. */
  reviewedOn: string;
  executiveSummary: string[];
  /** The headline verdict, one line. */
  verdict: string;
  layers: ReviewLayer[];
  latentModel: LatentConstruct[];
  missing: MissingComponent[];
  /** The ranked top-level weaknesses (worst first). */
  majorWeaknesses: MajorWeakness[];
  /** The recommended redesign blueprint. */
  redesign: RedesignPillar[];
  roadmap: RoadmapItem[];
  plan: PlanItem[];
}

// ---------------------------------------------------------------------------
// THE REVIEW
// ---------------------------------------------------------------------------

export const HPI_REVIEW: HpiReview = {
  version: "1.0",
  reviewedOn: "2026-06-28",
  verdict:
    "The current engine is a clean, well-factored heuristic dashboard — but it is a deterministic readiness display, not a performance model. To serve Olympic→sedentary populations it must move from fixed-weight point estimates to a population-normalised, uncertainty-aware, partially-Bayesian latent-variable model with versioned, explainable outputs.",
  executiveSummary: [
    "HPI today fuses three freshness signals (strength, endurance, recovery) into one 0–100 number with fixed per-archetype weights. It is internally consistent, pure, and unit-tested — strong engineering, but it measures READINESS (state today), while branding itself as a performance INDEX (trait/capacity). These are different constructs and should be separated.",
    "No output carries uncertainty. Every score is a hard point estimate even when it rests on one noisy night of HRV or two weeks of history. For elite and clinical users, a number without a confidence interval is not decision-grade.",
    "Scores are not population-normalised. A '70' has no reference distribution — it is not a percentile against age/sex/training-age/sport peers, so it cannot answer the question every athlete asks: 'good compared to whom?'",
    "ACWR is implemented faithfully but is a contested metric (Lolli, Impellizzeri, Wang et al.); coupled ACWR has known mathematical artefacts. The engine already hedges it in prose — the next step is to demote it from a band to one input among several and add an uncoupled/EWMA + load-trajectory view.",
    "The recovery model is a single additive ±15 nudge from one biometric snapshot. Modern readiness is multi-signal (HRV trend vs. personal baseline, sleep debt, RHR, subjective wellness) with missing-data handling — the engine needs a probabilistic recovery sub-model, not a constant.",
    "There is no predictive layer at all: no 1RM/race-time trajectory, no plateau/overtraining/peaking forecast, no injury-risk model, each with intervals. This is the single biggest capability gap versus WHOOP/TrainingPeaks/AMS platforms.",
    "Architecture is sound for v1 (pure functions in core, consumed by both clients) but has no model versioning, no audit trail of inputs→outputs, no feature store, and no per-athlete personalisation — all required before this is used to make decisions about real athletes.",
    "Recommendation: keep the clean core, but re-architect around (1) a separated Readiness vs. Capacity model, (2) population-normalised percentiles (LMS/quantile) with priors, (3) uncertainty on every output, (4) a latent-variable conceptual model, (5) a versioned predictive layer, and (6) an explainability/audit substrate.",
  ],

  layers: [
    {
      id: "conceptual-model",
      title: "1 · Conceptual model",
      sourceRef: "engines/hpi.ts",
      current:
        "Fitness ≈ strength freshness + endurance freshness + recovery, blended to one number.",
      correct: [
        "Decomposing into interpretable pillars and always exposing a 'limiter' is genuinely good design — explainability-by-construction.",
        "Archetype weighting (powerlifter vs. triathlete vs. hybrid) correctly recognises that 'performance' is sport-relative.",
      ],
      flaws: [
        "Conflates STATE (readiness today) with TRAIT (capacity/fitness level). A fresh beginner can outscore a fatigued world champion — that is correct for readiness, wrong for a 'Performance Index'.",
        "Only three observed pillars; no latent constructs (robustness, movement economy, neuromuscular efficiency, injury resilience, adaptability) that the sports-science literature treats as primary.",
        "Additive linear fusion assumes the pillars are independent and substitutable. They are neither — a structural/causal model (SEM or Bayesian network) represents the dependencies (load→fatigue→recovery→adaptation) far better.",
      ],
      recommendation:
        "Split into two models: a Readiness model (state, daily) and a Capacity model (trait, slow-moving, population-normalised). Represent capacity as latent factors estimated from observed tests via a measurement model (start with confirmatory factor scoring; evolve to a Bayesian network encoding the fitness-fatigue causal structure).",
      evidence: "emerging",
      severity: "critical",
    },
    {
      id: "validation-normalization",
      title: "2 · Validation & normalisation",
      current:
        "Inputs are clamped to 0–100; biometric adjustment bounded to ±15. No population reference, no per-cohort distribution.",
      correct: [
        "Clamping and bounded nudges prevent absurd outputs — sane guardrails.",
      ],
      flaws: [
        "No normalisation against a reference population, so scores are not comparable across athletes and a '70' is meaningless without context.",
        "No age, sex, training-age, body-mass or sport-specific distributions — the same raw input means very different things for a 16-y/o vs. a 55-y/o masters athlete.",
        "No input validation/quality flags (implausible values, stale wearable data, device disagreement) feeding an output confidence.",
      ],
      recommendation:
        "Introduce cohort-aware normalisation: LMS/GAMLSS curves (as used in growth charts) or quantile normalisation to produce age/sex/training-age-adjusted percentiles, with Bayesian shrinkage toward the cohort prior when an athlete has little data. Strength uses validated allometric scaling (DOTS/IPF-GL over Wilks; Sinclair for weightlifting) rather than raw kg or naïve bodyweight ratios.",
      evidence: "established",
      severity: "critical",
    },
    {
      id: "feature-engineering",
      title: "3 · Feature engineering",
      sourceRef: "engines/load.ts · engines/running.ts · engines/velocity.ts",
      current:
        "sRPE load (duration×RPE), endurance saturation via exponential, relative strength as bodyweight ratio; running/velocity engines exist separately.",
      correct: [
        "sRPE (Foster) is a validated, low-cost internal-load measure — a sound default.",
        "Exponential saturation of energy-system load is a reasonable diminishing-returns shape.",
        "Strength duration ≈ sets×3.5min is a defensible approximation when set timestamps are absent.",
      ],
      flaws: [
        "Relative strength should use allometric/validated coefficients (DOTS, IPF GL, Sinclair), not a linear bodyweight ratio which over-rewards light and penalises heavy athletes.",
        "No estimated VO₂max, critical speed/power, W′, or force–velocity profile feeding the model despite the data being collectable.",
        "TRIMP/Banister impulse-response and HR-based load are absent — sRPE alone misses the autonomic cost of sessions.",
      ],
      recommendation:
        "Build a feature store of validated derived metrics: DOTS/IPF-GL/Sinclair for strength; Critical Speed & D′ (running) and Critical Power & W′ (cycling) from the power-duration curve; Banister/EWMA impulse-response load alongside sRPE; FV-profile from VBT. Each feature carries a provenance + quality score.",
      evidence: "established",
      severity: "major",
    },
    {
      id: "domain-scores",
      title: "4 · Domain scores",
      sourceRef: "engines/hpi.ts",
      current:
        "strength = 100 − mean muscle fatigue; endurance = 100 − saturated energy load. Linear, deterministic, no interval.",
      correct: [
        "Inverse-of-fatigue → freshness is intuitive and bounded.",
        "Reporting the components, not just the headline, is the right call.",
      ],
      flaws: [
        "Linear mapping ignores diminishing returns: the same delta near the elite ceiling represents vastly more adaptation than near the floor.",
        "No uncertainty band, so a score built on one data point looks as authoritative as one built on months of history.",
        "Mean over muscle groups hides the limiter at the group level (a fried posterior chain averages away).",
      ],
      recommendation:
        "Map raw capacity → score through a monotone saturating link (logistic/expit on the normalised percentile) so elite gains require exponentially more, and attach a credible interval to every score (propagate input noise + data sufficiency). Keep the limiter but compute it at the sub-system level.",
      evidence: "emerging",
      severity: "major",
    },
    {
      id: "performance-index",
      title: "5 · Composite Performance Index (weights)",
      sourceRef: "engines/hpi.ts · HYBRID_WEIGHTS",
      current:
        "Fixed weights per archetype (0.55/0.45 hybrid, 0.8/0.2 strength, …); recovery as additive ±15.",
      correct: [
        "Configurable weights are better than one-size-fits-all and make the number mean the right thing per athlete.",
      ],
      flaws: [
        "Weights are hand-set constants with no empirical or personalised basis.",
        "Mixing a multiplicative-feeling blend with an additive recovery term is dimensionally awkward and lets recovery dominate or vanish unpredictably near the clamp.",
        "No sport-specific or goal-specific weighting beyond three presets; no learning from the athlete's own response.",
      ],
      recommendation:
        "Make weights a hierarchy: sensible sport priors → optionally personalised via partial pooling (mixed-effects) as data accrues → optionally ML-learned against an outcome (e.g. competition result, test PRs) where labels exist. Fuse pillars and recovery in one coherent (log-odds or weighted-geometric) space so contributions are commensurable, and expose the contribution of each term.",
      evidence: "emerging",
      severity: "major",
    },
    {
      id: "acwr",
      title: "6 · ACWR / workload",
      sourceRef: "engines/load.ts",
      current:
        "Coupled 7d:28d-weekly ACWR with bands, plus monotony & strain; already hedged in prose.",
      correct: [
        "Computing monotony and strain alongside ACWR, and explicitly captioning ACWR as contested, is more honest than most commercial apps.",
        "Absolute weekly load is surfaced, not just the ratio.",
      ],
      flaws: [
        "Coupled ACWR (acute is inside chronic) is mathematically autocorrelated and has been shown to create spurious associations (Lolli 2019, Impellizzeri 2020).",
        "Discrete bands (sweet-spot/danger) imply a sharp risk cliff that the evidence does not support.",
        "Simple rolling windows ignore the decay structure of fitness vs. fatigue.",
      ],
      recommendation:
        "Demote ACWR from a verdict to one input. Default to uncoupled ACWR and an EWMA formulation; add the fitness–fatigue (Banister) impulse-response trajectory and absolute-load trend. Replace hard bands with a continuous, uncertainty-aware load-status signal and always show it next to monotony, strain and ramp rate.",
      evidence: "contested",
      severity: "major",
    },
    {
      id: "recovery",
      title: "7 · Recovery model",
      sourceRef: "engines/readiness.ts · biometricAdjustment",
      current:
        "Single additive ±15 adjustment derived from a biometric snapshot.",
      correct: [
        "Anchoring to the athlete's own baseline (not population norms) is the correct principle for HRV/RHR.",
      ],
      flaws: [
        "One snapshot, not a trend: HRV is only meaningful as a rolling deviation (e.g. 7-day vs. 60-day) given its night-to-night noise.",
        "Single signal: ignores sleep duration/efficiency/debt, RHR trend, subjective wellness (DOMS, mood, stress), all of which add orthogonal information.",
        "No missing-data strategy — absent wearable simply zeroes the term rather than widening uncertainty.",
      ],
      recommendation:
        "Build a multi-signal recovery sub-model: rolling HRV deviation (log-transformed, CV-aware), sleep debt, RHR trend and a short validated subjective survey, fused (Bayesian or weighted with reliability per signal). Output a recovery score WITH an interval; widen the interval (don't blank the score) when signals are missing.",
      evidence: "established",
      severity: "major",
    },
    {
      id: "consistency",
      title: "8 · Consistency / adherence",
      current:
        "Implicit in history length (enoughHistory) and monotony; no first-class consistency metric.",
      correct: [
        "History-length gating before trusting ACWR is the right instinct.",
      ],
      flaws: [
        "Consistency is a strong predictor of adaptation and should be a modelled construct, not a side effect.",
        "No streak/variance/dose-distribution feature feeding capacity confidence.",
      ],
      recommendation:
        "Add a consistency feature (planned-vs-completed adherence, session-frequency stability, load distribution) that directly modulates the CONFIDENCE of capacity estimates and the prior strength in the Bayesian update.",
      evidence: "emerging",
      severity: "minor",
    },
    {
      id: "architecture",
      title: "10 · Software architecture",
      sourceRef: "packages/core/src/engines/*",
      current:
        "Pure, unit-tested functions in @hybrid/core consumed by both clients; no model versioning, audit or persistence of computations.",
      correct: [
        "Pure functions + shared core + tests is exactly the right substrate; clean separation, easy to test, parity-friendly.",
        "Engines are framework-agnostic and side-effect-free.",
      ],
      flaws: [
        "No model/version stamp on outputs — you can't reproduce or audit why an athlete saw a given score last month.",
        "No feature store / no persistence of inputs→features→scores for longitudinal modelling or drift detection.",
        "No per-athlete state (priors, personalised weights) — every call is stateless and population-blind.",
        "No explainability contract beyond the limiter, and no observability/telemetry on engine outputs.",
      ],
      recommendation:
        "Keep pure-core compute, but wrap it in: a versioned EngineResult envelope (engineVersion, inputs hash, timestamp, confidence); a feature store (Supabase tables) persisting inputs/features/scores for longitudinal + drift use; a per-athlete model state (priors/personalisation); and an explainability payload (top contributors + counterfactual 'what would move this'). Add audit + GDPR/locality handling for the health data.",
      evidence: "established",
      severity: "major",
    },
    {
      id: "ml-vs-math",
      title: "11 · Machine learning vs. mathematics",
      current: "Entirely deterministic heuristics; no learned components.",
      correct: [
        "Deterministic, transparent math is the RIGHT default for a v1 health product — it is auditable and never hallucinates.",
      ],
      flaws: [
        "No path for personalisation or for learning the athlete's individual dose-response.",
        "No uncertainty machinery, which ML/Bayesian methods would provide naturally.",
      ],
      recommendation:
        "Hybrid by design: keep mechanistic/physiological math as the backbone (fitness-fatigue, critical power, allometric scaling); add Bayesian hierarchical models for personalisation + uncertainty, Gaussian processes / state-space models for trajectory forecasting, and survival analysis for injury/return-to-play. Reserve gradient-boosting/deep models for where labelled outcomes exist (large cohorts), always behind an explainability + human-in-the-loop layer. Track model drift.",
      evidence: "emerging",
      severity: "minor",
    },
  ],

  latentModel: [
    { id: "capacity-strength", title: "Maximal strength", indicators: "1RM estimates, VBT load-velocity, DOTS/IPF-GL", horizon: "core" },
    { id: "capacity-endurance", title: "Aerobic capacity", indicators: "est. VO₂max, critical speed/power, threshold pace/HR", horizon: "core" },
    { id: "capacity-power", title: "Power / RFD", indicators: "jump height, CMJ on force plate, bar power, sprint splits", horizon: "extended" },
    { id: "robustness", title: "Robustness / injury resilience", indicators: "load tolerance, asymmetry, prior-injury history, mobility", horizon: "extended" },
    { id: "movement-economy", title: "Movement economy", indicators: "running economy, HR:pace coupling, gait symmetry (CV)", horizon: "research" },
    { id: "neuromuscular", title: "Neuromuscular efficiency", indicators: "VBT velocity at load, force-velocity profile, RFD", horizon: "research" },
    { id: "recoverability", title: "Recoverability / fatigue capacity", indicators: "HRV rebound rate, sleep response, load-to-readiness lag", horizon: "extended" },
    { id: "adaptability", title: "Adaptability", indicators: "dose-response slope (PR vs. accumulated load) over time", horizon: "research" },
    { id: "readiness-psych", title: "Psychological readiness", indicators: "wellness survey, mood, perceived stress, motivation", horizon: "extended" },
  ],

  missing: [
    { id: "uncertainty", title: "Uncertainty intervals on every output", rationale: "Decision-grade metrics for elite/clinical use must express confidence; a bare point estimate over-claims precision.", evidence: "established" },
    { id: "normalisation", title: "Population-normalised percentiles", rationale: "Without an age/sex/training-age/sport reference distribution, scores can't answer 'good vs. whom' or scale from beginner to world champion.", evidence: "established" },
    { id: "predictive", title: "Predictive engine", rationale: "1RM & race-time trajectories, plateau/overtraining/peaking detection, injury probability, return-to-play — all with intervals. The biggest gap vs. elite platforms.", evidence: "emerging" },
    { id: "female-physiology", title: "Female physiology", rationale: "Menstrual-cycle phase, and pregnancy/postpartum context, materially change readiness and load tolerance and are absent.", evidence: "emerging" },
    { id: "wearable-ingest", title: "Wearable & lab ingestion", rationale: "HRV/sleep/RHR from WHOOP/Garmin/Oura/Apple, plus DEXA/force-plate/lactate, are the inputs the model is starved of.", evidence: "established" },
    { id: "context", title: "Environmental & life context", rationale: "Heat/altitude/humidity, travel/jet-lag, illness and medication shift both performance and recovery and should down-weight or annotate scores.", evidence: "emerging" },
    { id: "explainability", title: "Explainability & audit substrate", rationale: "Coaches need 'why', and a regulated health platform needs reproducible, versioned, auditable outputs.", evidence: "established" },
    { id: "data-quality", title: "Input quality / confidence flags", rationale: "Implausible values, stale data and device disagreement must feed output confidence rather than silently corrupting scores.", evidence: "established" },
  ],

  majorWeaknesses: [
    {
      rank: 1,
      title: "State/trait conflation in a metric branded as an index",
      severity: "critical",
      relatesTo: "conceptual-model",
      detail: "HPI fuses freshness signals (a daily STATE) but is named and read as a fitness INDEX (a TRAIT). The two move on different time-scales and answer different questions, so the single number is systematically misread: a rested novice outscores a fatigued champion. Until Readiness and Capacity are separated, no downstream layer can be interpreted correctly.",
    },
    {
      rank: 2,
      title: "No uncertainty on any output",
      severity: "critical",
      relatesTo: "domain-scores",
      detail: "Every score is a bare point estimate. A figure built on one noisy night of HRV is presented with the same authority as one built on two years of history. For elite, military and clinical decisions, a metric without a confidence interval over-claims precision and cannot be trusted to gate training.",
    },
    {
      rank: 3,
      title: "No population normalisation",
      severity: "critical",
      relatesTo: "validation-normalization",
      detail: "Scores have no reference distribution, so a '70' is uninterpretable and incomparable across athletes. The engine cannot answer 'good versus whom?' and cannot scale meaningfully from a sedentary beginner to a world champion — the core requirement of the platform.",
    },
    {
      rank: 4,
      title: "Single-snapshot, single-signal recovery",
      severity: "major",
      relatesTo: "recovery",
      detail: "Recovery is one additive ±15 nudge from a single biometric reading. HRV is only meaningful as a rolling deviation; sleep debt, RHR trend and subjective wellness carry orthogonal information that is ignored; and a missing wearable silently zeroes the term instead of widening uncertainty.",
    },
    {
      rank: 5,
      title: "Contested, coupled ACWR presented as a verdict",
      severity: "major",
      relatesTo: "acwr",
      detail: "The coupled acute:chronic ratio is autocorrelated by construction and its injury-risk thresholds are heavily disputed (Lolli 2019; Impellizzeri 2020). Rendering it as discrete bands implies a sharp risk cliff the evidence does not support. It should be one input among several, not the headline.",
    },
    {
      rank: 6,
      title: "Hand-set composite weights with no empirical basis",
      severity: "major",
      relatesTo: "performance-index",
      detail: "Archetype weights are fixed constants, and an additive recovery term is mixed into a multiplicative-feeling blend so contributions are not commensurable and recovery can dominate or vanish near the clamp. There is no personalisation and no learning from the athlete's own response.",
    },
    {
      rank: 7,
      title: "No predictive layer",
      severity: "major",
      relatesTo: "ml-vs-math",
      detail: "The engine is entirely retrospective — it describes today, forecasts nothing. No PR/race-time trajectory, no plateau, overtraining, peaking, injury-risk or return-to-play prediction. This is the single largest capability gap versus WHOOP/TrainingPeaks/AMS platforms.",
    },
    {
      rank: 8,
      title: "No model versioning, feature store or audit trail",
      severity: "major",
      relatesTo: "architecture",
      detail: "Outputs carry no version stamp, inputs→features→scores are not persisted, and there is no per-athlete state. A score shown last month cannot be reproduced or explained — unacceptable for a platform making decisions about real athletes under GDPR/HIPAA-adjacent expectations.",
    },
  ],

  redesign: [
    {
      id: "two-models",
      title: "Two models, not one — Readiness vs. Capacity",
      summary: "Split the single number into a daily STATE model and a slow-moving TRAIT model so each answers its own question.",
      points: [
        "Readiness (state, daily, 0–100 + interval): muscular freshness + energy-system freshness + the new multi-signal recovery sub-model, missing-data-aware.",
        "Capacity / Fitness Level (trait, slow-moving, percentile + interval): latent factors from validated tests, population-normalised with Bayesian shrinkage.",
        "Each surfaces its own limiter; neither is forced to mean the other.",
      ],
    },
    {
      id: "latent-capacity",
      title: "Latent capacity measurement model",
      summary: "Estimate capacity as latent factors from observable indicators rather than averaging proxies into an opaque score.",
      points: [
        "Constructs: maximal strength · aerobic capacity · power/RFD · robustness/injury-resilience · movement economy · neuromuscular efficiency · recoverability · adaptability · psychological readiness.",
        "Each is scored from validated indicators (see the latent model) and carries a credible interval driven by how much data backs it.",
        "Start with confirmatory factor scoring; evolve toward a Bayesian network encoding the load→fatigue→recovery→adaptation causal structure.",
      ],
    },
    {
      id: "load-v2",
      title: "Load model v2",
      summary: "Demote ACWR to one input inside a continuous, uncertainty-aware load-status signal.",
      points: [
        "Default to uncoupled / EWMA ACWR; add the Banister fitness–fatigue trajectory and ramp rate; keep monotony and strain.",
        "Replace hard bands with a continuous risk surface that always shows absolute load alongside the ratio.",
        "Carry uncertainty so a thin training history widens the band rather than asserting a false verdict.",
      ],
    },
    {
      id: "cross-cutting",
      title: "Cross-cutting substrate",
      summary: "The properties every output must gain, regardless of which model produced it.",
      points: [
        "Monotone saturating score links (logistic/expit on the normalised percentile) so elite gains require exponentially more.",
        "A credible interval on every score, propagated from input noise + data sufficiency.",
        "A versioned result envelope { value, interval, confidence, engineVersion, inputsHash, contributors } — non-breaking; callers read .value.",
        "An explainability payload: top contributors plus a counterfactual 'what would move this'.",
      ],
    },
  ],

  roadmap: [
    { id: "r-envelope", horizon: "now", title: "Versioned, uncertainty-bearing result envelope", detail: "Wrap every engine output in { value, interval, confidence, engineVersion, inputsHash, contributors }. Non-breaking — existing callers read .value." },
    { id: "r-readiness-capacity", horizon: "now", title: "Separate Readiness from Capacity", detail: "Rename the daily number to Readiness; introduce a slow-moving Capacity/Fitness-Level model that is population-normalised." },
    { id: "r-recovery", horizon: "year1", title: "Multi-signal recovery sub-model", detail: "Rolling HRV deviation + sleep debt + RHR trend + subjective wellness, with missing-data handling and a reliability-weighted fusion." },
    { id: "r-normalise", horizon: "year1", title: "Cohort normalisation (LMS/quantile + priors)", detail: "Age/sex/training-age/sport percentiles with Bayesian shrinkage; allometric strength scaling (DOTS/IPF-GL/Sinclair)." },
    { id: "r-load", horizon: "year1", title: "Load model v2", detail: "Uncoupled/EWMA ACWR + Banister fitness-fatigue trajectory + ramp rate; ACWR demoted to one input, continuous risk surface." },
    { id: "r-wearables", horizon: "year1", title: "Wearable ingestion + feature store", detail: "WHOOP/Garmin/Oura/Apple OAuth, normalised into a persisted feature store for longitudinal modelling." },
    { id: "r-predict", horizon: "year3", title: "Predictive layer", detail: "Bayesian/GP trajectory forecasting for 1RM, race time, VO₂max; plateau, overtraining and peaking detection — each with credible intervals." },
    { id: "r-injury", horizon: "year3", title: "Injury & return-to-play models", detail: "Survival analysis on load/asymmetry/history; RTP workflow with confidence." },
    { id: "r-personalise", horizon: "year3", title: "Personalisation via partial pooling", detail: "Hierarchical mixed-effects so weights and dose-response are learned per athlete, shrinking to cohort priors when data is thin." },
    { id: "r-cv", horizon: "year10", title: "Computer-vision movement screening", detail: "Pose-estimation squat/gait/mobility scoring feeding movement-economy & robustness latents." },
    { id: "r-digitaltwin", horizon: "year10", title: "Athlete digital twin + causal inference", detail: "A per-athlete simulator for 'what-if' programming; causal graphs to estimate training-effect, federated learning across orgs for privacy-preserving population models." },
    { id: "r-rl", horizon: "year10", title: "RL-assisted adaptive programming", detail: "Human-in-the-loop reinforcement learning that proposes the next block to maximise adaptation subject to injury-risk constraints." },
  ],

  plan: [
    // MUST
    { id: "p-envelope", priority: "must", effort: "M", title: "Result envelope + confidence", detail: "Add { value, interval, confidence, version } to HPI, load and recovery outputs. Foundation for everything else." },
    { id: "p-split", priority: "must", effort: "M", title: "Readiness vs. Capacity split", detail: "Clarify the conceptual model; stop a fresh beginner outscoring a fatigued champion on 'performance'." },
    { id: "p-recovery", priority: "must", effort: "M", title: "HRV-trend recovery", detail: "Replace the single ±15 snapshot with a rolling-deviation, multi-signal recovery score." },
    { id: "p-acwr", priority: "must", effort: "S", title: "ACWR de-risk", detail: "Add uncoupled/EWMA ACWR + ramp rate; keep monotony/strain; demote bands to a continuous signal." },
    // SHOULD
    { id: "p-normalise", priority: "should", effort: "L", title: "Cohort percentiles", detail: "LMS/quantile normalisation with priors; allometric strength scaling." },
    { id: "p-features", priority: "should", effort: "L", title: "Validated feature store", detail: "DOTS/IPF-GL/Sinclair, critical speed/power, W′, FV-profile, Banister load — persisted with provenance." },
    { id: "p-wearables", priority: "should", effort: "L", title: "Wearable ingestion", detail: "OAuth + normalisation for WHOOP/Garmin/Oura/Apple into the feature store (already tracked as a blocked capability)." },
    { id: "p-female", priority: "should", effort: "M", title: "Female physiology context", detail: "Menstrual-phase-aware readiness annotation and load guidance." },
    // NICE
    { id: "p-explain", priority: "nice", effort: "M", title: "Explainability payload", detail: "Top contributors + counterfactual 'what would move this' on every score." },
    { id: "p-admin", priority: "nice", effort: "S", title: "Engine admin/observability", detail: "This screen + telemetry on output distributions and drift." },
    // EXPERIMENTAL
    { id: "p-predict", priority: "experimental", effort: "XL", title: "Predictive trajectory engine", detail: "Bayesian/GP forecasting of PRs/race times with intervals; plateau & overtraining detection." },
    { id: "p-injury", priority: "experimental", effort: "XL", title: "Injury-risk & RTP", detail: "Survival models on load/asymmetry/history." },
    { id: "p-twin", priority: "experimental", effort: "XL", title: "Digital twin + RL programming", detail: "Per-athlete simulator and human-in-the-loop adaptive programming." },
  ],
};

/** Layers sorted critical → ok (for display). */
export function layersBySeverity(): ReviewLayer[] {
  const rank: Record<ReviewLayer["severity"], number> = {
    critical: 0,
    major: 1,
    minor: 2,
    ok: 3,
  };
  return [...HPI_REVIEW.layers].sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** Plan items for one priority bucket. */
export function planByPriority(p: ReviewPriority): PlanItem[] {
  return HPI_REVIEW.plan.filter((x) => x.priority === p);
}

/** Roadmap items for one horizon. */
export function roadmapByHorizon(h: RoadmapItem["horizon"]): RoadmapItem[] {
  return HPI_REVIEW.roadmap.filter((x) => x.horizon === h);
}

/** Major weaknesses, worst first (rank 1 = most severe). */
export function weaknessesByRank(): MajorWeakness[] {
  return [...HPI_REVIEW.majorWeaknesses].sort((a, b) => a.rank - b.rank);
}
