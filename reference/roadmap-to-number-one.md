# HYBRID — Roadmap to #1 Training App

A professional, phased roadmap built off the VC-style audit (Thiel + a16z lens),
grounded in what HYBRID has actually shipped vs. what is credential-blocked.

The spine running through every phase: **you don't win by adding features — you
win by converting your already-built breadth into a defensible data moat, one
wedge at a time.**

---

## North Star

**Become the system of record for hybrid training** — the default app an athlete
*and* their coach *and* their team all work from. "#1" is not most downloads; it's
**most labeled outcome data per athlete**, because that's the only thing
incumbents can't copy.

**Sequencing principle (the audit's fix):** breadth is a *sunk asset*, not ongoing
scope. Keep the platform built; point distribution at **one consumer wedge for
volume + one B2B wedge for high-quality labels.** Reveal depth later.

---

## Phase 0 — Unblock & Instrument (Weeks 0–6)

*The audit mistook "blocked" for "unbuilt." Prove it wrong by shipping in weeks,
not quarters.*

| Action | Tied to | Done when |
|---|---|---|
| Apple Developer + Expo token → EAS build → TestFlight | `mobile-preview` (blocked) | App live on real devices |
| Stripe account + keys → turn on billing | `billing` (blocked) | First charge processes |
| Push credentials (APNs/FCM) | `push-notifications` (blocked) | Accountability nudges deliver |
| First wearable OAuth (start with **one**: WHOOP *or* Apple Health) | `wearables` (blocked) | One provider syncs to the Twin |
| Wire analytics on the funnel | new | Retention/conversion observable |

**Exit gate:** app installable, chargeable, push-capable, and every funnel step
measured. **No new core engineering** — this is purely de-risking.

---

## Phase 1 — Win the Wedge (Months 2–6)

*"Launch narrow and own it." Two wedges, two different jobs.*

### 1A. Consumer wedge — Hyrox / strength-endurance amateurs (volume engine)

- Position the **Fitness GPS + HPI** as *the* hybrid score; "Strava measures your
  run, HYBRID measures your *athlete*."
- Exploit **guest-first** (train before sign-up) to crush CAC; convert via the
  "Save & track → free account" flow.
- Turn on the retention loop: **weekly recap shareable cards** (organic
  distribution), **accountability engine** push nudges, **Future Self** projection.
- **KPIs:** 30-day retention ≥ 35%, weekly active training days, guest→account
  conversion, free→Pro conversion, recap-share rate.

### 1B. Tactical pilot — one unit/contract (label engine, founder-led)

- Sell the **Deployment Readiness Index + gated RTP + role-scoped org graph +
  audit trail** — where injury prediction is a *procurement requirement*, not a
  liability.
- *Why parallel:* tactical produces **labeled injury/RTP outcomes fastest per
  user** — the fuel your moat needs.
- **KPIs:** 1 signed pilot, labeled-outcome count, weekly active medical/coach seats.

**Exit gate:** consumer retention curve flattens above target AND the tactical
pilot is logging real outcome labels.

---

## Phase 2 — Distribution Flywheel via Coaches (Months 5–10)

*B2B2C: coaches bring their own clients — the cheapest distribution you have.*

- Onboard online coaches/PTs onto the **squad monitor (RAG/ACWR), check-in
  heartbeat, workout builder, team-compare**.
- Each coach imports their roster → instant athlete acquisition at ~zero CAC.
- Monetize **coach seats ($29/$79/$199)** + clients convert to **Pro**.
- Partnerships: **Hyrox affiliates/boxes, force-plate makers, a wearable** —
  distribution + credibility.
- **KPIs:** coaches onboarded, athletes-per-coach, coach seat MRR, coach-driven
  athlete retention (should beat solo B2C).

**Exit gate:** coach channel CAC < direct consumer CAC, proving the flywheel.

---

## Phase 3 — Activate the Data Moat (Months 9–15)

*The audit's central truth: today the moat is a **thesis**, not an asset. This
phase makes it real.*

- Cross the threshold where **`refitCalibration`** retrains the injury logistic on
  *your own* labeled outcomes (≥ the sample floor), and **`shrinkNorm`** pulls
  benchmark norms off synthetic priors onto observed population data.
- Surface "calibrated on N,000 real athletes" as a **public credibility moat**
  incumbents can't match.
- Deepen the Twin: nightly materialization, **video pose-capture** and **VBT
  bar-sensor capture** (`video-intel`, `vbt-capture` — currently blocked on
  capture hardware/CV).
- **KPIs:** model accuracy lift vs. v0 prior, consented-data coverage,
  k-anonymized cohort count, injury-prediction precision.

**Exit gate:** proprietary models measurably outperform the cold-start heuristics
— the first thing a competitor *cannot* clone.

---

## Phase 4 — Category Leadership & Platform Expansion (Months 12–24)

*Now — and only now — reveal the breadth you already built.*

- Open the **Team Operating System** to clubs and federations (org graph, talent
  graph, peaking optimizer, competition intel).
- Launch **org/enterprise pricing (~$40–80/athlete/yr)** for predictable,
  high-retention revenue.
- Expand verticals already coded: **longevity/performance medicine**, broader
  **tactical** rollout.
- Lean on the **AI agent org** to run ops/marketing/finance at low headcount — a
  structural margin advantage.
- **KPIs:** enterprise logos, net revenue retention > 110%, multi-segment ARPU,
  Rule of 40.

---

## Phase 5 — #1 / Defensible Network Effects (Months 24–36+)

- The **data network** becomes a sellable benchmarking-intelligence layer
  (aggregates, never raw rows) — a fourth revenue line *and* a federation-grade moat.
- Athletes → coaches → teams → federations form a multi-sided network where each
  side makes the others more valuable.
- "#1" achieved = the **default system of record**: when a serious hybrid athlete,
  their coach, and their club all assume HYBRID is where the data lives.

---

## The Metrics Spine (instrument from Day 1)

| Layer | North-star metric |
|---|---|
| Consumer | 30-day retention, weekly active training days |
| Monetization | free→Pro conversion, coach-seat MRR, NRR |
| Distribution | athletes-per-coach, channel CAC, recap-share rate |
| **Moat (the one that matters most)** | **labeled outcomes captured, model accuracy lift over baseline** |

---

## Top Risks → Mitigations

1. **Consumer churn (high-churn category)** → guest-first + accountability engine +
   coach-anchored retention.
2. **"Me-too integrator" perception** → race to the labeled-data threshold
   (Phase 3) before incumbents; tactical pilot accelerates it.
3. **Liability on injury/RTP** → audit trail, medical-tier gating, and positioning
   RTP as decision-support, not diagnosis (already architected).
4. **Scope creep** → enforced by the sequencing rule: breadth stays dark until each
   wedge's exit gate is met.

---

The whole roadmap is one bet expressed in stages: **convert built features →
distribution → labeled data → models incumbents can't copy → category default.**
