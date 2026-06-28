# Hybrid Performance Engine — Scientific & Engineering Review

**Review v1.0 · 2026-06-28**
Companion to the structured data in `packages/core/src/engines/hpi-review.ts`,
which is rendered in the web admin **Performance engine** screen
(`apps/web/components/admin/performance-engine.tsx`, admin-only).

> Panel: a Stanford statistician, applied mathematician and computer scientist;
> Stanford exercise physiology, biomechanics and sports-medicine faculty; an
> Olympic S&C coach; an AIS sports scientist; a performance engineer
> (WHOOP / Garmin / TrainingPeaks); and a principal ML engineer in
> physiological modelling.

This review covers the engine **as it exists in the repository** — primarily
`engines/hpi.ts` (the Hybrid Performance Index), `engines/load.ts` (training
load / ACWR), `engines/readiness.ts` (`biometricAdjustment`) and the supporting
`fatigue` / `running` / `velocity` / `forceplate` engines — and proposes a
redesign to make it serve everyone from sedentary beginners to world champions.

---

## 1. Executive summary

The current engine is **clean, pure, well-factored and honest** — genuinely
good software engineering. But scientifically it is a **deterministic readiness
dashboard wearing the name of a performance index**. The gap between what it is
and what an Olympic / NCAA / military / clinical platform needs is large but
*bridgeable* without throwing away the core.

Eight headline findings:

1. **State vs. trait confusion.** HPI fuses three *freshness* signals (strength,
   endurance, recovery). That is **readiness** (how ready am I *today*), not
   **capacity / fitness level** (how good am I). A fresh beginner can outscore a
   fatigued world champion. Correct for readiness; wrong for a "Performance
   Index". These must be **two separate models**.
2. **No uncertainty.** Every output is a hard point estimate, whether it rests
   on one noisy night of HRV or two years of history. Not decision-grade.
3. **No population normalisation.** A score of "70" has no reference
   distribution — it is not a percentile against age / sex / training-age / sport
   peers, so it can't answer "good compared to whom?" or scale across abilities.
4. **ACWR is contested** and implemented in its **coupled** (autocorrelated)
   form. The engine already hedges it in prose; the next step is to demote it.
5. **Recovery is a single ±15 nudge** from one biometric snapshot — not a
   multi-signal, trend-based, missing-data-aware model.
6. **No predictive layer at all** — no PR/race-time trajectory, plateau,
   overtraining, peaking, injury-risk or return-to-play forecasting. This is the
   single biggest gap versus elite platforms.
7. **Architecture lacks model versioning, a feature store, per-athlete state
   and an audit trail** — all prerequisites for making real decisions about real
   athletes under GDPR/HIPAA-adjacent expectations.
8. **Recommendation:** keep the pure core; re-architect around (a) Readiness vs.
   Capacity, (b) population-normalised percentiles with Bayesian priors,
   (c) uncertainty on every output, (d) a latent-variable conceptual model,
   (e) a versioned predictive layer, (f) explainability + audit.

---

## 2. Scientific review

### Conceptual model
The three-pillar decomposition with an always-on **limiter** is the engine's
best idea — explainability by construction. The flaw is conceptual scope. The
sports-science literature treats fitness as a **multidimensional latent
construct**: maximal strength, aerobic capacity, power/RFD, robustness/injury
resilience, movement economy, neuromuscular efficiency, recoverability,
adaptability and psychological readiness. The engine models three observable
freshness proxies and calls it performance.

**Recommendation.** Adopt a **latent-variable measurement model**: observed
tests (1RM, VO₂max, CMJ, critical power, VBT) are *indicators* that load onto
latent capacity factors. Start with confirmatory factor scoring; evolve toward a
**Bayesian network / structural equation model** that encodes the known causal
chain *load → fatigue → recovery → adaptation* (the fitness–fatigue paradigm,
Banister/Calvert). This is *emerging* practice — defensible and modular, not yet
universal — so it should ship as an explicit, versioned model, not a black box.

### Physiology
- **sRPE** (Foster) for internal load is **established** and a sound default.
- Inverse-of-fatigue → freshness is intuitive and bounded — keep it.
- **Relative strength as a raw bodyweight ratio is wrong**: it systematically
  over-rewards light and penalises heavy athletes. Use **allometric/validated
  coefficients** — DOTS and IPF GL (which superseded Wilks) for powerlifting,
  Sinclair for weightlifting. *Established.*
- **HRV anchored to the athlete's own baseline is correct** — but a single
  snapshot is not. HRV is meaningful only as a **rolling deviation** (e.g. 7-day
  vs. 60-day), log-transformed, because night-to-night noise is large
  (Plews et al.). *Established.*
- **Missing physiology:** estimated VO₂max, critical speed/power & W′/D′,
  force–velocity profile, female-physiology context (menstrual phase,
  pregnancy/postpartum), heat/altitude, illness/medication.

### Evidence grading (applied throughout)
- **Established** — sRPE, allometric strength scaling, HRV-as-deviation,
  uncertainty quantification, population normalisation (LMS/growth-chart method).
- **Emerging** — latent-variable fitness models, personalised dose-response,
  trajectory forecasting.
- **Contested** — ACWR (Lolli 2019; Impellizzeri 2020; Wang 2020), hard
  injury-risk thresholds.
- **Speculative** — RL-driven autonomous programming, digital-twin simulation.

---

## 3. Mathematical review

- **Linear domain scores ignore diminishing returns.** `score = 100 − fatigue`
  treats a unit of improvement at the elite ceiling as equal to one at the floor.
  Map normalised capacity → score through a **monotone saturating link**
  (logistic/expit) so elite gains require exponentially more.
- **Dimensional inconsistency in the composite.** HPI blends pillars
  multiplicatively-in-feel, then adds a ±15 recovery term. Near the 0/100 clamp
  the recovery term's effective influence is unstable. Fuse all terms in **one
  coherent space** (log-odds or weighted-geometric) so contributions are
  commensurable and individually attributable.
- **Coupled ACWR is autocorrelated by construction** (the acute window is inside
  the chronic window), which manufactures spurious ratio–injury associations.
  Prefer **uncoupled ACWR** and/or **EWMA**, and report the **Banister
  fitness–fatigue trajectory** and **ramp rate** alongside.
- **Mean-over-muscle-groups averages away the limiter.** Compute the limiter at
  the **sub-system** level before aggregating.

---

## 4. Statistical review

- **No reference distribution → scores aren't comparable.** Introduce
  **cohort-aware normalisation**: **LMS/GAMLSS** curves (the growth-chart method)
  or **quantile normalisation** to age/sex/training-age/sport percentiles.
  *Established.*
- **Small-sample over-confidence.** With little athlete history, shrink toward
  the cohort prior via **Bayesian partial pooling / mixed-effects** — the score
  starts near the population and personalises as evidence accrues. This *also*
  yields the missing uncertainty intervals for free.
- **No data-quality propagation.** Implausible values, stale wearable data and
  device disagreement must widen the output interval (or flag low confidence),
  never silently corrupt the score.
- **Hard bands imply false precision.** Replace discrete ACWR/HPI bands with a
  **continuous, uncertainty-aware** status; show the band only as a coarse label
  over a continuous signal.

---

## 5. Software-architecture review

What's right: **pure, side-effect-free functions in `@hybrid/core`, unit-tested,
consumed by both clients.** This is the correct substrate and should be kept.

What's missing for production at scale:
- **Versioned result envelope.** Every output should carry
  `{ value, interval, confidence, engineVersion, inputsHash, timestamp,
  contributors }`. Non-breaking: existing callers read `.value`.
- **Feature store.** Persist inputs → features → scores (Supabase tables) for
  longitudinal modelling, drift detection and reproducibility.
- **Per-athlete model state** — priors and personalised weights; today every
  call is stateless and population-blind.
- **Explainability contract** beyond the limiter — top contributors plus a
  counterfactual ("what would move this").
- **Observability / audit / privacy** — telemetry on output distributions and
  drift; an audit trail of how a score was produced; data-locality and consent
  handling for health data (GDPR; HIPAA-adjacent for clinical/military deploys).
- **Model version control** so a score shown last month can be reproduced.

Keep compute **pure**; wrap it in these substrates rather than entangling them.

---

## 6. Machine-learning review

Deterministic, transparent math is the **right default** for a v1 health product
— auditable, never hallucinating. The engine should stay **hybrid**:

- **Mechanistic backbone (keep as math):** fitness–fatigue impulse-response,
  critical power/speed, allometric scaling. Physiologically interpretable.
- **Bayesian hierarchical models:** personalisation + uncertainty + partial
  pooling. The highest-leverage addition.
- **Gaussian processes / state-space models:** trajectory forecasting (PRs,
  race times, VO₂max) with credible intervals.
- **Survival analysis:** injury risk and return-to-play timing.
- **Gradient boosting / deep learning:** only where **labelled outcomes** exist
  at cohort scale (e.g. competition results), always behind explainability +
  human-in-the-loop, with **drift monitoring**.
- **Reinforcement learning:** reserve for *experimental* human-in-the-loop
  adaptive programming — never autonomous over an athlete's health.

---

## 7. Missing components (gap list)

Uncertainty intervals · population-normalised percentiles · predictive engine ·
female physiology · wearable & lab ingestion (WHOOP/Garmin/Oura/Apple; DEXA,
force plate, lactate) · environmental & life context (heat/altitude, travel,
illness, medication) · explainability & audit substrate · input-quality
confidence flags. (Each is graded in the structured data.)

---

## 8. Major weaknesses (ranked)

1. State/trait conflation in a metric branded as an index. *(critical)*
2. No uncertainty on any output. *(critical)*
3. No population normalisation. *(critical)*
4. Single-snapshot, single-signal recovery. *(major)*
5. Contested, coupled ACWR presented as a verdict. *(major)*
6. Hand-set composite weights with no empirical/personalised basis. *(major)*
7. No predictive layer. *(major)*
8. No model versioning / feature store / audit. *(major)*

---

## 9. Recommended redesign

**Two models, not one.**
- **Readiness** (state, daily, 0–100 + interval): muscular freshness +
  energy-system freshness + multi-signal recovery (HRV-deviation, sleep debt,
  RHR trend, subjective wellness), missing-data-aware.
- **Capacity / Fitness Level** (trait, slow-moving, **percentile** + interval):
  latent factors estimated from validated tests, population-normalised with
  Bayesian shrinkage.

**Latent capacity model (measurement model).** Maximal strength · aerobic
capacity · power/RFD · robustness/injury-resilience · movement economy ·
neuromuscular efficiency · recoverability · adaptability · psychological
readiness — each estimated from observable indicators (see structured data for
the indicator → latent mapping and the core/extended/research horizons).

**Load model v2.** Uncoupled/EWMA ACWR + Banister fitness–fatigue trajectory +
ramp rate + monotony/strain → one **continuous, uncertainty-aware** load-status
signal. ACWR demoted to one input.

**Everywhere:** monotone saturating score links, credible intervals,
explainability payloads, versioned envelopes.

---

## 10. Production-ready architecture (target)

```
inputs (logs, wearables, lab, surveys)
  → validation + quality scoring
  → feature store (persisted, versioned, provenance)
  → mechanistic features (sRPE, Banister, critical power, allometric scaling)
  → normalisation (LMS / quantile + cohort priors)
  → models:  Readiness (state) | Capacity (latent, trait) | Load v2 | Predictive
  → result envelope { value, interval, confidence, version, contributors }
  → explainability + audit + telemetry
  → clients (web + mobile, identical core)
```

Pure compute in `@hybrid/core`; persistence/versioning/audit in the backend
(`apps/web/app/api/*`); both clients consume the same envelope (web↔mobile
parity preserved).

---

## 11. Research roadmap

**Now** — versioned uncertainty-bearing result envelope; separate Readiness from
Capacity; ACWR de-risk.
**Year 1** — multi-signal recovery; cohort normalisation (LMS/quantile +
priors); load model v2; wearable ingestion + feature store.
**3-year vision** — predictive layer (trajectory forecasting, plateau /
overtraining / peaking) with intervals; injury & return-to-play (survival
models); personalisation via partial pooling.
**10-year vision** — computer-vision movement screening feeding movement-economy
& robustness; per-athlete **digital twin** + causal inference; federated
learning across orgs; human-in-the-loop **RL** adaptive programming.

---

## 12. Prioritised implementation plan

- **Must have** — result envelope + confidence; Readiness vs. Capacity split;
  HRV-trend recovery; ACWR de-risk.
- **Should have** — cohort percentiles; validated feature store; wearable
  ingestion; female-physiology context.
- **Nice to have** — explainability payload; engine admin/observability (this
  screen + drift telemetry).
- **Experimental** — predictive trajectory engine; injury-risk & RTP; digital
  twin + RL programming.

See `packages/core/src/engines/hpi-review.ts` for the machine-readable version
(efforts, evidence grades, per-layer findings) rendered in the admin console.

---

### What to keep (so this reads as a redesign, not a teardown)
The pure-core architecture, the limiter/explainability instinct, sRPE, the
own-baseline HRV principle, configurable archetype weighting, and the honesty of
captioning ACWR as contested are all genuinely good and **should survive the
redesign**. The work is to make the engine **uncertainty-aware,
population-normalised, predictive and versioned** — not to discard what works.
