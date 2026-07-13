# HYBRID — a16z Investment Committee Memorandum

**Prepared by:** the General Partnership (AI / Enterprise / Consumer / American Dynamism teams)
**Company:** HYBRID — hybrid-athlete training platform; long-range thesis: *the system of record for human performance*
**Round posture:** evaluated as a Seed / Series A opportunity — judged on what it can *become*, not on today's metrics
**Evidence base:** the actual monorepo (`packages/core` engines, `apps/web`, `apps/mobile`, `prisma/schema.prisma`), `economics.ts`, `capabilities.ts`, and the `reference/` strategy corpus. A companion Founders-Fund/Thiel memo (`reference/thiel-investment-memo.md`) argues the bear case; this memo deliberately underwrites the platform arc.

> **Internal note on stance.** Our mandate is not to ask "is this a monopoly today" (it is not). It is to ask whether a focused wedge, owned data, and compounding technology can become the operating system of an industry over ten years — and whether *this* team is the one to do it. We will reward the ambition, but only where a credible mechanism connects today's code to tomorrow's moat. Where that mechanism is missing, we say so.

---

## 1. Executive Summary

HYBRID is a well-architected training platform for the hybrid athlete (strength **and** endurance) that has quietly built the hard, unglamorous half of a much larger company: a pure, tested decision engine that fuses fatigue, readiness, progression, and periodization into an explained daily prescription, plus a proprietary composite score (**HPI**), a tissue-level injury model, a return-to-play framework, a coach/org relational spine, and — critically — a **data-network mechanism already wired into the codebase** (`datanet.ts`, k-anonymous cohort norms that refit priors toward observed data).

The founder is unusually capable across the stack: they scaffolded ten strategic layers, wrote a genuine unit-economics engine with four revenue streams and localized pricing, and — the tell we like most — documented their *own* bear case (`consumer-coaching-master-strategy.md`: "the model is not the product — behavior change is"). This is a decade-thinker with real range and intellectual honesty.

**The bet is not the app. The bet is the flywheel.** Every athlete-day on HYBRID could produce a labeled, longitudinal, cross-domain record — *state → intervention → outcome* — which is the rarest data in sport and exactly what trains better readiness, injury, and prescription models. If HYBRID becomes the place that data lives, it compounds into a moat no frontier model can replicate, because frontier models will be free and this data will not exist anywhere else.

**The honest gap:** the flywheel is built and *empty*. Zero revenue (billing returns 503), no live wearable ingestion, no cross-user data, RLS not yet enabled. The company today is capture-poor in a category that is won capture-first. That is precisely a seed-stage risk profile — and precisely the kind of risk we exist to underwrite when the team and the secret are right.

**Recommendation (detailed in §18): Invest with Milestones.** Seed-scale conviction on the founder and the data thesis, gated on proof of capture and one lighthouse enterprise. If the founder pivots the wedge correctly, this is a company we want to lead the A on.

---

## 2. Why Now

Four independent tailwinds converge, which is what a real "why now" looks like:

1. **The hybrid-athlete category is having its cultural moment.** Hyrox is selling out arenas globally; "run + lift" is the CrossFit of the 2020s. The *specific* persona HYBRID serves is inflecting from niche to movement — a rare case where a vertical wedge is riding a demand wave, not fighting apathy.
2. **Wearable ubiquity finally makes passive capture realistic.** WHOOP, Oura, Garmin, and Apple Watch are mainstream; the athlete already wears the sensor. The `Biometric.source` field is pre-wired for `apple`/`whoop`/`garmin`. Ingestion is now a connector, not a hardware bet.
3. **Frontier AI makes the grounded copilot viable now.** A coach-grade assistant that reads an athlete's real signals and reasons in a methodology was science fiction three years ago; `/api/ai-coach` (on `claude-opus-4-8`, grounded in the last-30 sessions) already exists in the repo. The enabling technology just arrived.
4. **The performance-tech stack is fragmenting *and* consolidating simultaneously.** Catapult (field), WHOOP (recovery), TrainingPeaks (endurance), Hudl (video) each own one column; Teamworks is buying them up. Fragmentation invites a consolidator — the question is whether HYBRID or Teamworks becomes it.

**Why now, in one line:** the culture, the sensors, and the AI all crossed their thresholds in the same 24 months, and the incumbent set is still fragmented enough for a well-architected newcomer to own the join before it closes.

---

## 3. Why This Team

We would take the meeting on the founder alone. Evidence from the artifact:

- **Vision & decade-thinking (9/10):** `north-star-strategy.md` is a genuinely strong piece of category thinking — "we own the *row*; incumbents own a *column*" is the correct, non-obvious framing of the whole opportunity. This person sees the ten-year platform, not the app.
- **Technical ambition & range (8/10):** scaffolded ten layers (injury, RTP, org graph, twin, HPI, tactical, force-plate, video, data-net) in a disciplined pure-engine/two-client architecture — the Palantir "value is the ontology, not the UI" move, executed correctly.
- **Taste (8/10):** the code is honest where most founders fake it — it *flags* estimates (`loadEstimated`, `estimated`, "log this lift and I'll calibrate") rather than presenting guesses as personalization. Restraint is a strong founder signal.
- **SaaS literacy (8/10):** `economics.ts` is a real unit-economics engine (LTV/CAC, Rule of 40, NRR, burn multiple, localized pricing across five markets). This founder understands the business, not just the science.
- **Intellectual honesty & coachability (9/10):** they wrote the bear case against their own company. Founders who can hold the counter-thesis are the ones who survive contact with the market.

**Where we need diligence:** we see one voice across the corpus — **team and recruiting ability are unproven.** The ten-year vision requires recruiting scarce sports-science + applied-ML + enterprise-sales talent. Our single biggest human-side question is not "is the founder good" (clearly yes) but "can they build and lead the team, and will they *focus*." (See §12 founder risks.)

**Would a16z back this founder? On the person: yes, enthusiastically. On the current focus: not yet — we'd back them to make a specific pivot (§17).**

---

## 4. Why This Market

- **TAM is large and legitimately expandable.** Prosumer fitness (WHOOP/Strava-sized, tens of millions of paying users) at the bottom; online coaches / PTs (a large, underserved B2B2C layer) in the middle; pro clubs, federations, NCAA, tactical/SOF, and performance-medicine at the top (six/seven-figure ACVs). The same engine serves a weekend Hyrox athlete and an Olympic federation — that's the a16z "starts niche, expands to industry" shape.
- **The market is fragmented with no system of record.** Today an FC Barcelona sports scientist stitches Catapult + a sleep tool + a wellness survey + an EMR + an Excel strength log by hand. Nobody owns the join. Fragmentation + a real integration pain = a consolidation opportunity.
- **Willingness to pay is highest exactly where the moat is.** A club CFO understands "one prevented hamstring = the annual contract." Injury availability is the largest controllable cost in pro sport. The hardest budget to cut is the one attached to the wedge feature.

**The market risk is not size — it's that the best-monetizing segment (enterprise) and the best-capture segment (prosumer) are different customers requiring different motions. Sequencing across them is the whole game (§9, §17).**

---

## 5. Why This Product

*Does it solve a painful workflow? Is it daily? Would customers depend on it? Could it become mission-critical? Would removing it create chaos?*

- **Today, for the prosumer:** it answers "what should I train, and am I recovered enough to push?" with an *explained* prescription — a mild-to-moderate pain, daily-ish, not yet mission-critical. Honest score: **useful, not indispensable.** The founder's own audit concedes the retention primitives (nutrition log, habit/streak, push ritual) are missing — those are what make it daily.
- **At maturity, for the coach:** the roster triage ("who needs me today"), check-in ritual, and program delivery become the coach's daily operating surface — genuinely sticky, because the coach's *business* runs on it.
- **At maturity, for the elite org:** the injury-risk board + auditable RTP rails + the athlete twin become mission-critical and legally load-bearing. **Removing it would create chaos** — you'd be re-housing every athlete's longitudinal history and losing your defensible medical audit trail. That is the "would customers depend on it" test passing decisively — *at a stage the company has not yet reached.*

**Verdict: the product is not yet indispensable, but there is a credible, concrete path to mission-critical — and it runs through the enterprise/coach surface, not the consumer app.**

---

## 6. Technology Assessment — ordinary engineering vs. proprietary technology

We separate the two honestly.

**Ordinary (good) engineering — the current engine.** `readiness.ts` (baseline-deviation clamp, 35–98), `fatigue.ts` (per-muscle/per-system load, 2-day half-life decay), `prescription.ts` (rule-based most-recovered-pattern picker), `periodization.ts` (Hamilton apportionment back-solving a taper to an event date). These are physiologically sound heuristics with excellent taste. They are **reproducible by a strong team in 2–4 weeks** and are *not*, by themselves, defensible. We must underwrite them as table stakes, not moat.

**Where proprietary technology can be built (and partly is scaffolded):**

| Technology | Status in repo | Path to defensibility |
|---|---|---|
| **Domain-specific injury-hazard model** | `injury.ts`, *versioned* `heuristic-cal-v0` (a documented prior, not fit on outcomes) | Becomes defensible the moment it's trained on the proprietary outcome corpus — calibrated, per-tissue, per-athlete. This is the crown jewel. |
| **Readiness/performance forecasting** | reactive readiness shipped; forecast planned | Next-7-day trajectory + overreaching early-warning; defensible via longitudinal data. |
| **Recommendation / prescription RL loop** | `prescription.ts` heuristic; `confidence` rises with log depth | Turn prescription→logged-outcome into a reinforcement loop; defensible via per-athlete adaptation velocity. |
| **Data-network optimization engine** | `datanet.ts` — k-anon (K=5) cohort norms that refit priors toward observed data | The mechanism is *built*; defensibility = the data volume it never yet had. |
| **Computer vision (markerless biomechanics)** | `video.ts` / force-plate scaffolding | Phone-based motion capture fused to physiology — something a pure video tool (Hudl) structurally can't do. |
| **Agent orchestration** | `/api/ai-coach` shipped; agentic copilot planned | Roster-sweep agents (Haiku) + hard-reasoning (Opus), grounded + cite-or-abstain. |

**The technology that compounds — ranked:** (1) the injury/forecast models trained on the outcome corpus, (2) the benchmark/percentile engine, (3) the RL prescription loop, (4) the CV-to-physiology fusion. **The technology that does *not* compound:** the hand-tuned heuristics as sold today. The strategic imperative is to move value from column two of nothing into models fed by proprietary data.

---

## 7. Proprietary Data Analysis — *the most important section*

This is where the venture-scale case lives or dies.

**What unique data is generated?** Potentially the rarest data in sport: an **outcome-labeled, cross-domain, longitudinal** record per athlete — training load + recovery (HRV/RHR/sleep) + subjective wellness + (eventually) GPS/force-plate/video/blood/injury/competition — *all joined to the same person over time*, with the intervention and the outcome both recorded. State → intervention → outcome. Nobody has this at scale because nobody owns the join.

**Who else owns it?** No one owns the *joined* version. WHOOP owns recovery, Catapult owns field load, TrainingPeaks owns endurance, Hudl owns video, EMRs own injury — each owns one column of the row. Teamworks is assembling columns by acquisition but still has to *join and label* them.

**Can competitors buy it? Scrape it?** No and no. It is not for sale (it doesn't exist assembled), and it can't be scraped (it's private, consented, per-athlete, generated only through use). This is the good kind of data moat: accruable only through years of operation.

**Does quality improve with every customer / transaction / location?** *This is the crux, and the honest answer is: by design yes, in practice not yet.* `datanet.ts` refits cohort priors toward observed data and `prescription.ts` confidence rises with log depth — so the *mechanism* to improve-with-N is present. But there is **no data in it.** The flywheel is built and unfed. Every additional athlete *would* sharpen benchmarks and models — once capture is live and retention holds.

**Could it become impossible to replicate?** Yes — this is the strongest part of the thesis. A competitor entering in year five can copy the UI in a quarter but **cannot fast-forward five years of joined human outcomes.** Temporal, outcome-labeled, multi-modal data is the one asset money can't buy.

**Could the dataset become more valuable than the software?** Almost certainly, and that is the whole point. The software is the *instrument* that earns the data; the data is the *asset* that earns the category. In the end HYBRID should be valued as a data-and-models company with a distribution app, not an app with some data.

**The complete data flywheel (target state):**
1. Athlete uses HYBRID + connects wearables → outcome-labeled athlete-days accrue.
2. → better benchmarks (percentile norms) + better models (injury, readiness forecast, prescription, projection).
3. → better predictions and decisions for every user → better product.
4. → more athletes and orgs adopt, existing ones deepen usage and send more signals.
5. → return to (1) with a widening, temporally-locked lead; the benchmark norms become the industry's shared vocabulary (HPI as the "WHOOP Recovery" of hybrid performance), adding a language moat on top of the data moat.

**Diligence verdict:** the flywheel is *architecturally real and commercially unproven.* The single most important seed milestone is to make step (1) actually happen at retained scale. Everything else is downstream.

---

## 8. AI Strategy — where value survives when frontier models are free

Assume inference is nearly free and every competitor has GPT-5-class models. Then:

- **What becomes a commodity:** the hand-tuned engine and the basic AI coach. If any team can wire a frontier model to a fitness prompt, `prescription.ts` and a chat coach are table stakes. *HYBRID's current core is the first thing commoditized.* We must not pay for it as moat.
- **Where proprietary value remains:**
  - **Proprietary datasets** — the outcome-labeled corpus (a free model still can't see data that doesn't exist elsewhere).
  - **Domain-specific models** — an injury-hazard model fit on real outcomes beats any generic model that never saw the labels.
  - **Workflow knowledge & operational context** — the coach ritual, the RTP gates, the org governance; the twin that gives an LLM something real to reason over.
  - **Customer-specific memory** — the athlete's multi-year longitudinal history as persistent context; the club's encoded methodology ("coach *their* way").
  - **Reinforcement loops** — prescription → outcome → better prescription, per athlete (adaptation velocity).
  - **Agent orchestration & decision intelligence** — nightly roster sweeps that pre-read 60 athletes and surface the 4 that matter, grounded and traceable.
- **Why a customer chooses HYBRID over generic AI:** *a generic LLM cannot see the athlete, and a generic dashboard cannot reason.* HYBRID does both — grounded in proprietary joined data, personalized to the coach's methodology, with cite-or-abstain and a medical-grade audit trail. When a club doctor acts on a recommendation, they need provenance a raw chatbot cannot provide.

**AI strategy verdict:** correct and, importantly, *the AI thesis collapses back into the data thesis.* Own the data → the AI is defensible. Don't → the AI is a wrapper. There is exactly one imperative and it is capture.

---

## 9. Expansion Strategy

**Today the company sells:** a consumer Pro subscription ($12.99/mo, $99/yr), coach seats ($29/$79/$199/mo, B2B2C — athletes ride the coach's seat), and a priced-but-unsold org/enterprise tier (~$40–80/athlete/yr). Four streams modeled in `economics.ts`; **$0 collected to date.**

**In five to ten years it could own:**

| Expansion | Credibility | Mechanism |
|---|---|---|
| **Wearable/sensor ingestion layer ("Switzerland")** | High | Neutral normalization of every device; vocabulary lock-in (HPI). Year 1–2. |
| **Embedded finance / payments** | High | Coaches already need to bill clients → Stripe Connect payouts, take-rate on coaching payments. Natural, high-margin. |
| **Talent marketplace ("LinkedIn for athletic talent")** | Medium-High | Two-sided: athletes want discovery, clubs want the deepest pool; every athlete enriches benchmarks. Requires the corpus first. |
| **Benchmarking / data-intelligence product** | Medium-High | Bloomberg-grade anonymized norms sold to federations/leagues/research. Pure data business. |
| **Insurance / risk underwriting** | Medium (long-dated) | Calibrated injury-risk → actuarial product for clubs/leagues. Only after the model is trusted and versioned. |
| **Industry cloud / developer APIs** | Medium | Query-the-twin APIs, connector-cert program, models-as-a-service. Platform phase. |
| **Tactical / American Dynamism (SOF readiness)** | Medium-High | Same engine, high-ACV mission-critical government contracts (`tactical.ts` scaffolding exists). A genuine AmDyn angle. |

**Most credible expansion path:** prosumer/coach wedge (capture the data cheaply, prove retention) → land 1–3 lighthouse elite orgs as design partners (injury-risk ROI) → turn the corpus on (benchmarks + trained models) → embedded finance on the coach layer (near-term revenue) → talent marketplace + data-intelligence product (network-effect platform) → tactical/performance-medicine verticals off the same engine. **Land-and-expand from athlete → coach → org → industry, with the dataset compounding underneath the whole climb.**

---

## 10. Platform Potential

- **Platform / ecosystem:** yes — the connector framework (every device an adapter) + the methodology/template marketplace (elite coaches publish programs) make HYBRID a two-sided ecosystem.
- **Operating system:** the strongest framing — the org graph (U12 → first team, history carried on promotion) becomes the *system of record* an entire club/federation runs on. That is OS-grade lock-in.
- **API / developer platform:** query-the-twin APIs + a connector-certification program create a developer surface in the platform phase (year 4+).
- **AI infrastructure company:** plausible end-state — versioned performance/injury models offered as infrastructure to federations, leagues, insurers, and research. Software → infrastructure, exactly the arc we underwrite.

**Platform verdict:** all four are credible *in sequence*, none are near-term. The correct read is "OS for a club today, industry infrastructure in a decade" — but only if the data moat forms first. Platform emerges *from* the data, not before it.

---

## 11. Network Effects (benchmarked 1–10, today → 10-year potential)

| Effect | Today | 10-yr | Note |
|---|---|---|---|
| Customer/direct network (coach↔athlete↔org graph) | 2 | 8 | `CoachLink` consent spine is the seed; org graph scales it. |
| Data network (every user improves all models) | 1 | 10 | The core thesis; mechanism built (`datanet.ts`), fuel absent. |
| Marketplace (talent, two-sided) | 1 | 8 | Requires the corpus first; strongest network play. |
| Partner ecosystem (device/connector) | 1 | 7 | "Switzerland" ingestion; more devices → more value. |
| Developer ecosystem (APIs/marketplace) | 1 | 6 | Platform-phase. |
| AI feedback loops (RL prescription→outcome) | 2 | 8 | Confidence-grows-with-data is the primitive. |
| Operational learning (benchmark norms) | 1 | 9 | Becomes the industry's shared vocabulary. |
| Community | 2 | 6 | Social surface planned; Hyrox culture is a tailwind. |

**Read:** every score that matters is a right-column bet. That's fine for seed — *we are underwriting the slope, not the level* — but we should be clear-eyed that the level is ~1–2 today.

---

## 12. Moat Evolution

- **Today's moat (weak, ~2/10):** architecture discipline + code taste + a category insight. Nothing a competitor can't out-execute. Brand ~0, switching costs low, data advantage ~0.
- **Tomorrow's moat (2–4 yr, ~6/10):** longitudinal switching costs (the athlete's life stored here) + coach-business lock-in + org-graph history + HPI-as-vocabulary + the first benchmark norms. Real but not yet uncatchable.
- **Ten-year moat (~9/10):** the outcome-labeled, multi-modal, longitudinal data network that no newcomer can fast-forward + benchmark-standard vocabulary + encoded elite methodologies + medical/consent/audit governance holding enterprise & government accounts + the neutral-ingestion position. Data + time + trust — Palantir-grade.

**How defensibility compounds:** each year of operation adds athlete-days that improve models that win customers that add athlete-days. The moat is not a feature you ship; it is a *duration* you accumulate. That is the most defensible kind — and the reason to fund *now* rather than watch, because the clock only starts when capture starts.

---

## 13. Founder Evaluation (rated)

| Dimension | Rating | Evidence |
|---|---|---|
| Vision | 9 | "Own the row" category framing; ten-layer OS thesis. |
| Learning speed | 8 | Self-authored bear case; iterated plan-model redesigns. |
| Technical ambition | 8 | Ten scaffolded layers, pure-engine architecture. |
| Taste | 8 | Honest UX (flags estimates); restraint in the engine. |
| Recruiting ability | ? (unproven) | One voice in the corpus; the key open question. |
| Execution | 7 | Broad, disciplined build; but no revenue/capture shipped. |
| Long-term thinking | 9 | Explicitly thinks in a decade and in verticals-to-industry. |
| Product intuition | 6 | Deep on model, thin on retention primitives (self-admitted). |
| Customer obsession | 6 | Strong on the expert user; weak on the beginner's "show up tomorrow." |
| Intensity | 8 (inferred) | Volume and breadth of output. |
| Coachability | 9 | Writes and holds the counter-thesis. |

**Founder risks & mitigations:**
- **Focus diffusion (highest):** wants consumer + coach + club + federation + tactical simultaneously. *Mitigation:* board-level insistence on one wedge for 18 months; fund the pivot, not the buffet.
- **Engine-love / capture-last:** built the intellectually satisfying half. *Mitigation:* tie the next tranche to capture + retention metrics, not feature count.
- **Team/recruiting unproven:** *Mitigation:* first check partly underwrites two senior hires (applied-ML lead, enterprise/sport GTM) as milestones.
- **Distribution has no wedge yet:** *Mitigation:* pick coach-led B2B2C (coaches bring their client rosters) as the structural channel over paid consumer social.

---

## 14. Venture Scale — the staircase

- **$100M ARR:** predominantly consumer Pro + coach seats at scale, with early enterprise. *Requires:* solving retention (nutrition/habit/push), a working paid-and-organic acquisition motion, and 100k+ paying prosumers + a healthy coach base. This is the "great fitness SaaS" tier and is *reachable without the moat fully forming* — but it's also the tier where you're still exposed.
- **$500M ARR:** enterprise (clubs/federations/NCAA/tactical) contributes materially at six/seven-figure ACVs + the coach B2B2C compounds + the first data-intelligence revenue. *Requires:* a real enterprise sales motion, RLS/governance live, and 10+ marquee org logos.
- **$1B ARR:** the data-network platform — benchmarking product, talent marketplace take-rate, embedded finance on the coach layer, models-as-infrastructure. *Requires:* the flywheel visibly beating newcomers, and the vocabulary standard established.
- **$10B valuation:** achievable at ~$500M–1B ARR with the data moat priced in — the market pays for the compounding, not the current revenue. *Requires:* clear evidence the models improve with N and that switching is prohibitive.
- **$50B valuation:** requires becoming the undisputed industry cloud/infrastructure for human performance across sport + tactical + performance-medicine/longevity — a category-defining outcome contingent on winning the data race outright (and beating Teamworks). Low probability, enormous magnitude. A true power-law tail.

---

## 15. Risks & Mitigations

1. **Capture never happens (existential).** No data → no moat → a good fitness app. *Mitigate:* wearable ingestion + one-tap logging as the immediate roadmap; milestone-gate the next round on retained active capture.
2. **Consumer retention death.** Missing nutrition/habit/push/social. *Mitigate:* build the behavior layer *or* pivot the wedge to coach-led B2B2C where the coach drives retention.
3. **Teamworks (and Kitman) win the enterprise join first.** They're consolidating by acquisition and own the relationships. *Mitigate:* move fast on 1–3 lighthouse design partners; win on the *join + AI reasoning*, not on owning every column; consider the seam (hybrid strength+endurance) they underweight.
4. **Platform risk (Apple/WHOOP).** A free OS-level readiness score guts the consumer prop. *Mitigate:* be the cross-device Switzerland they won't be; go deep on coaching/enterprise where they won't.
5. **AI commoditizes the engine.** *Mitigate:* relocate value to the proprietary data + trust/governance layer (§8).
6. **Regulatory/medical (injury/RTP, minors, GDPR).** Liability once you hold blood/injury/minor data. *Mitigate:* enable RLS now; ship consent + audit as first-class features before touching medical data; treat governance as a moat, not overhead.
7. **Founder focus / team.** (§13.)
8. **Capital intensity.** The data + enterprise + ML build is expensive and slow; consumer CAC is unforgiving. *Mitigate:* stage capital tightly against capture and enterprise milestones; don't over-fund the buffet.
9. **Execution/sequencing.** The whole thesis is a sequencing problem (capture → data → models → platform). *Mitigate:* the board's primary job is enforcing sequence.

---

## 16. Investment Committee Debate

**BULL (Consumer/Marc-lens):** "This is the system of record for the human body. Every signal a person emits flows into one model that says what to do next, with the receipts — for a 15-year-old in an academy and an Olympian on the same engine. Software becomes infrastructure; this is infrastructure for human performance. The founder sees the decade, the architecture is already the Palantir move, and Hyrox is handing us a consumer wedge riding a cultural wave. We fund vision this clear."

**SKEPTIC (Ben-lens):** "We're romanticizing an empty database. Zero revenue, billing throws 503, no wearable is actually connected, RLS isn't even on. The 'network effect made literal' is a comment over `0.45 + log.length*0.08`. And Teamworks is *actively buying* the exact join we're calling unowned — Smartabase, Fusion, Hudl, Catapult, Firstbeat — while our founder's own docs don't mention them once. Consumer fitness is a graveyard. What are we actually paying for?"

**AI (Martin/Anjney-lens):** "The skeptic is right about today and wrong about the shape. When frontier models are free, the only durable value is data the model can't get elsewhere and a workflow it can't reason about blind. HYBRID is *architected* for exactly that — a twin to ground on, a versioned injury model to train, an RL loop, a k-anon aggregator already in the tree. But — and this is the whole investment — none of it has data. So my vote is conditional: I'll fund the mechanism only if we milestone the *fuel*. Prove retained capture and cross-user model lift, and this is defensible AI. Don't, and it's a wrapper."

**ENTERPRISE (David-lens):** "The money and the moat are both in enterprise, and enterprise is the least-built thing here. Org graph exists in the schema, but RLS is off, there's no paying club, no sales motion, no security posture a federation would sign. That said — 'one prevented hamstring = the annual contract' is a real CFO sentence, and the RTP audit trail is a genuine wedge. I want one lighthouse logo before I believe the ACV. Fund it as a design-partner motion, not a product GA."

**TIMING (why-now-lens):** "Three thresholds crossed at once — wearable ubiquity, frontier AI, and the Hyrox culture wave — and the incumbent join is *almost* closed but not yet. That's the window. Wait two years and Teamworks or Apple owns it. The cost of watching is higher than the cost of a milestoned seed."

**Convergence.** The skeptic concedes the *slope* is real and the window is now; the bull concedes the *level* is ~1 and the consumer framing is a trap; the AI and enterprise partners align on the same gating condition from two directions — **capture and one lighthouse.** No one argues for Conviction Lead (too early, no proof of capture) and no one argues for Pass (the founder, the secret, and the timing are too good to walk from). **Consensus lands on Invest with Milestones**, structured as a seed with a clear path to leading the A.

---

## 17. Recommended 10-Year Roadmap (if funded)

**Years 1–2 — Become the place the data lives (System of Record).**
- *Product:* ship the Athlete Twin + unified `Signal` store; turn on wearable ingestion (Apple/WHOOP/Garmin/Oura); build the retention layer (one-tap logging, the daily readiness push ritual, nutrition/habit) *or* explicitly pivot to coach-led B2B2C so coaches drive retention. Ship HPI as the flagship number.
- *Technology:* generalize `Biometric`/session blocks into one time-series (Timescale/hypertable); stand up a model registry + offline eval so every model is versioned and trustworthy.
- *Data:* start accumulating outcome labels deliberately; wire `datanet.ts` to real cohorts.
- *AI:* upgrade `/api/ai-coach` into the grounded, cite-or-abstain copilot rail.
- *Hiring:* applied-ML lead, a coach-GTM lead, a design-partner-facing solutions engineer.
- *Capital:* seed; milestone the A on retained capture + cross-user model lift.

**Years 3–4 — Become enterprise-credible (Risk & Teams).**
- Ship the tissue-level injury-risk engine *trained on outcomes* + auditable RTP rails; ship the org graph with role/medical governance and RLS live. Land 1–3 lighthouse clubs/federations as design partners. Embedded finance (Stripe Connect) on the coach layer for near-term revenue.
- *Capital:* Series A/B against enterprise logos + net revenue retention.

**Years 5–7 — Become a platform (Network & Intelligence).**
- Phone-based markerless biomechanics fused to the twin; competition/peaking intelligence; readiness forecasting. First benchmark norms go live as an industry reference. Launch the talent marketplace + the anonymized data-intelligence product. Developer/connector-cert program opens.
- *International:* Europe (the Hyrox heartland) + strong football/athletics federations first.

**Years 8–10 — Become industry infrastructure (Category).**
- Expand into tactical/SOF (American Dynamism) and performance-medicine/longevity off the same engine and corpus. Models-as-infrastructure to federations, leagues, and insurers. Selective acquisitions (a device/connector or a video-CV team). HYBRID is the reference OS and benchmark standard; the multi-year labeled corpus is uncatchable.
- *Capital:* growth/pre-IPO; the company is valued as data-and-models infrastructure with a distribution app.

---

## 18. Final Investment Memo — Terms & Recommendation

**Recommendation: INVEST WITH MILESTONES** (seed-scale conviction; structured to earn the right to lead the Series A).

- **Suggested ownership target:** 12–15% (seed), with strong pro-rata to defend through the enterprise/data inflection — the moat, if it forms, rewards concentration.
- **Recommended check size:** **$4–6M seed** (lead), potentially structured as an initial **$2M** with a **$2–4M milestone tranche** released on capture proof. We would rather concentrate on conviction than index this.
- **Suggested valuation range:** **$18–28M post** on the seed, justified by founder quality + architecture + the option value of the data thesis, *discounted for zero revenue and unproven capture.*
- **Milestones required before the A (the gate):**
  1. **Capture live and retaining** — wearable ingestion shipped + a cohort with sustained weekly-active logging/connection (real retention, not installs).
  2. **A network effect implemented, not asserted** — the unified Signal store live + at least one model/benchmark measurably improving with N (retire `0.45 + log.length*0.08` as the moat story).
  3. **One paying lighthouse elite org** on injury-risk or the org graph, with a stated ROI — proving enterprise pull and pricing power.
  4. **Focus + governance** — one wedge chosen for 18 months; RLS/billing/consent live in production.
- **Expected exit scenarios:**
  - *Base (most likely):* strategic acquisition by WHOOP/Strava/Garmin/Teamworks or a major sports-data group at $150M–$1B — a solid multiple on a seed check, driven by the team + engine + early data.
  - *Bull:* independent category leader — the OS and benchmark standard for human performance — $5–20B+ outcome, IPO-scale, if capture + enterprise + data all compound.
  - *Bear:* stalls as a $20–80M-revenue fitness SaaS or acqui-hire; capital-efficient downside given the tiny opex (~$72/mo today), so loss severity is modest relative to upside.
- **Expected return multiple (probability-weighted, seed entry):** we underwrite a blended **~5–8x expected** with a fat right tail (a credible, low-probability 50–100x in the bull case). That asymmetry — modest downside, category-defining upside, at a seed entry — is exactly the shape we fund.

---

## 19. Final Question

> *"If this company executes exceptionally over the next decade, could it become one of the defining software platforms in its industry?"*

**Yes — conditionally but genuinely.** If HYBRID (1) makes capture real and retained, (2) turns the built-but-empty flywheel into a compounding data moat, (3) trains its versioned injury/forecast models on that proprietary outcome corpus, and (4) lands and expands the org graph from athlete to coach to club to industry — then it becomes the system of record for human performance: the place an athlete's physiological life lives from age 12 to retirement, the terminal every performance staff opens first, and the benchmark standard the whole industry cites. That is a defining platform, and the mechanism connecting today's code to that outcome is credible, not fantastical.

The honest uncertainty is entirely in *execution and sequencing*, not in the vision or the architecture — which is the best kind of risk to underwrite at seed, and the reason our vote is **Invest with Milestones** rather than Pass. We are funding a decade-thinker with a correct secret and a built-but-unfed flywheel, and we are gating our conviction on the one thing that turns the secret into a moat: **proof that the data starts to compound.**

*Fund the pivot. Enforce the sequence. Earn the A.*
