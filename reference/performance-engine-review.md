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

Headline findings (✅ = now addressed in the engine, 🟡 = partially addressed):

1. **State vs. trait confusion.** HPI fuses three *freshness* signals (strength,
   endurance, recovery). That is **readiness** (how ready am I *today*), not
   **capacity / fitness level** (how good am I). A fresh beginner can outscore a
   fatigued world champion. Correct for readiness; wrong for a "Performance
   Index". These must be **two separate models**.
2. 🟡 **Uncertainty — partially fixed.** `computeHpi` now returns a
   data-sufficiency **confidence** (0–1) and a clamped **credible interval** that
   widens when inputs are thin. *Remaining:* extend the same envelope (plus a
   model version) to the load and recovery outputs.
3. **No population normalisation.** A score of "70" has no reference
   distribution — it is not a percentile against age / sex / training-age / sport
   peers, so it can't answer "good compared to whom?" or scale across abilities.
4. ✅ **ACWR — de-risked.** `computeLoad` now reports **uncoupled** ACWR and
   **EWMA** ACWR (`acwrEwma`/`bandEwma`, recommended) plus a **ramp rate**; the
   autocorrelated coupled ratio is demoted to one labelled input. *Remaining:* a
   Banister fitness–fatigue trajectory + a fully continuous risk surface.
5. 🟡 **Recovery — partially fixed.** `biometricAdjustment` now folds in the
   wearable **sleep score** it previously ignored. *Remaining:* it's still a
   snapshot — rolling HRV deviation, sleep debt and RHR trend need a biometric
   time-series the current input type doesn't carry.
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
  (Plews et al.). *Established.* 🟡 *Partly addressed:* recovery is now
  multi-signal (the wearable sleep score was folded in), but it remains a
  single-day snapshot until a biometric time-series exists.
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
- ✅ **Coupled ACWR autocorrelation — addressed.** It was autocorrelated by
  construction (the acute window inside the chronic window), manufacturing
  spurious ratio–injury associations. `computeLoad` now computes **uncoupled
  ACWR** and **EWMA** ACWR and a **ramp rate** as the primary signals; the
  coupled ratio is retained only as one labelled input. *Remaining:* report a
  **Banister fitness–fatigue trajectory** alongside.
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
  starts near the population and personalises as evidence accrues. 🟡 *Partly
  addressed:* HPI now ships a **data-sufficiency confidence + interval** (a
  pragmatic stand-in); the principled shrinkage version still needs a cohort
  prior and a feature store.
- **No data-quality propagation.** Implausible values, stale wearable data and
  device disagreement must widen the output interval (or flag low confidence),
  never silently corrupt the score.
- **Hard bands imply false precision.** Replace discrete ACWR/HPI bands with a
  **continuous, uncertainty-aware** status; show the band only as a coarse label
  over a continuous signal. 🟡 *Partly addressed:* the load read now exposes
  continuous `acwrEwma`/`acwrUncoupled`/`rampRate` values beneath the bands;
  fully retiring the bands for a continuous risk surface is the remaining step.

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

Ranked worst-first. Each traces to the layer it comes from (§2/§3) and the
build-plan item that fixes it (§12). Mirrors `majorWeaknesses` in the structured
data (`weaknessesByRank()`). Resolved items have been **removed** from the list;
partially-resolved ones are marked 🟡. *Removed since last pass:* the contested
coupled-ACWR weakness — now de-risked (uncoupled + EWMA + ramp rate; coupled
demoted to one input), tracked only as a minor residual in the ACWR layer.

| # | Weakness | Severity | Layer | Why it matters |
|---|----------|----------|-------|----------------|
| 1 | **State/trait conflation in a metric branded as an index** | critical | Conceptual model | Freshness (a daily STATE) is read as a fitness INDEX (a TRAIT). They move on different time-scales, so the number is systematically misread — a rested novice outscores a fatigued champion. Until Readiness and Capacity are separated, nothing downstream can be interpreted correctly. |
| 2 | 🟡 **Uncertainty only partially propagated** | major | Domain scores | **Fixed for HPI** — it now carries a confidence + credible interval that widens when inputs are thin. **Still open:** the load and recovery outputs carry no interval yet, and there's no model-version stamp, so not every number is reproducible/decision-grade. |
| 3 | **No population normalisation** | critical | Validation & normalisation | Scores have no reference distribution, so "70" is uninterpretable and incomparable across athletes. The engine cannot answer "good versus whom?" or scale from a sedentary beginner to a world champion — the platform's core requirement. |
| 4 | 🟡 **Recovery multi-signal but still a snapshot** | major | Recovery model | **Fixed in part** — the wearable sleep score is now folded in alongside HRV/RHR/sleep-duration. **Still open:** it's a single-day snapshot; rolling HRV deviation, sleep debt and RHR trend need a biometric time-series the input type doesn't carry. |
| 5 | **Hand-set composite weights with no empirical basis** | major | Composite index | Archetype weights are fixed constants, and an additive recovery term mixed into a multiplicative blend is dimensionally incoherent — recovery can dominate or vanish near the clamp. No personalisation, no learning from the athlete's own response. |
| 6 | **No predictive layer** | major | ML vs. mathematics | The engine is entirely retrospective. No PR/race-time trajectory, plateau, overtraining, peaking, injury-risk or return-to-play forecasting — the single largest capability gap versus WHOOP/TrainingPeaks/AMS platforms. |
| 7 | **No model versioning, feature store or audit trail** | major | Software architecture | Outputs carry no version stamp, inputs→features→scores aren't persisted, and there's no per-athlete state. A score shown last month can't be reproduced or explained — unacceptable under GDPR/HIPAA-adjacent expectations. |

---

## 9. Recommended redesign

The **blueprint, not the backlog** (the phased, effort-tagged version is §11–§12).
Keep the clean pure core; re-architect it around four pillars. Mirrors
`redesign` in the structured data.

### Pillar 1 — Two models, not one: Readiness vs. Capacity
Split the single number into a daily STATE model and a slow-moving TRAIT model so
each answers its own question.
- **Readiness** (state, daily, 0–100 + interval): muscular freshness +
  energy-system freshness + the new multi-signal recovery sub-model
  (HRV-deviation, sleep debt, RHR trend, subjective wellness), missing-data-aware.
- **Capacity / Fitness Level** (trait, slow-moving, **percentile** + interval):
  latent factors estimated from validated tests, population-normalised with
  Bayesian shrinkage.
- Each surfaces its own limiter; neither is forced to mean the other.

### Pillar 2 — Latent capacity measurement model
Estimate capacity as latent factors from observable indicators rather than
averaging proxies into an opaque score.
- **Constructs:** maximal strength · aerobic capacity · power/RFD ·
  robustness/injury-resilience · movement economy · neuromuscular efficiency ·
  recoverability · adaptability · psychological readiness.
- Each is scored from validated indicators (see the latent model in the
  structured data) and carries a **credible interval** driven by how much data
  backs it.
- Start with **confirmatory factor scoring**; evolve toward a **Bayesian
  network** encoding the *load → fatigue → recovery → adaptation* causal chain.

### Pillar 3 — Load model v2 — *largely shipped*
Demote ACWR to one input inside a richer, uncertainty-aware load-status read.
- ✅ **Shipped:** **uncoupled** ACWR + **EWMA** ACWR (`acwrEwma`/`bandEwma`) +
  **ramp rate**, alongside monotony and strain; coupled ratio demoted to one
  labelled input.
- *Remaining:* add the **Banister fitness–fatigue trajectory** and replace the
  residual bands with a **continuous risk surface**.
- *Remaining:* carry an explicit interval so a thin training history **widens
  the read** rather than asserting a false verdict.

### Pillar 4 — Cross-cutting substrate — *partially in place*
The properties every output must gain, whichever model produced it.
- ✅ **Shipped for HPI:** a **credible interval** + data-sufficiency
  **confidence** on the headline score.
- *Remaining:* **monotone saturating score links** (logistic/expit on the
  normalised percentile) so elite gains require exponentially more.
- *Remaining:* a **versioned result envelope** `{ value, interval, confidence,
  engineVersion, inputsHash, contributors }` across **all** outputs —
  non-breaking; callers read `.value`.
- *Remaining:* an **explainability payload** — top contributors plus a
  counterfactual ("what would move this").

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
