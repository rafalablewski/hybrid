# 13 — The a16z × SoftBank × Google Strategic Audit (August 2026)

**Question under audit:** is this a well-designed fitness tracker, or is there a major consumer technology company hidden inside it — and if so, exactly where?

**Method.** Same evidence base as `audit/12` (four independent code sweeps of the repo at 2026-08-16 HEAD: engines, mobile surface, design system, data model + capabilities registry), plus a close read of the founder's own investor corpus in `reference/`. This audit does not repeat audit/12's inventory; it uses it. Where a number appears without a citation, it was established there.

**A disclosure and a finding before the lenses.** The repo already contains a self-authored `reference/a16z-investment-memo.md` ("Invest with Milestones, $4–6M seed") and a self-authored Thiel memo ("Pass"). The a16z memo is well-argued — and it is **out of date with the company's own decisions**: it underwrites an enterprise arc (lighthouse clubs, RLS-gated org graph, tactical/SOF, `economics.ts`, `tactical.ts`, `video.ts`) whose assets the capabilities registry has since **retired** with explicit reasoning (`org-graph`, `tactical-vertical`, `longevity-vertical`, `video-intel`, `forceplate-ingest`, `financials-model` — six strategic kills). The strategy corpus describes two different companies. The registry — the document that governs what actually gets built — chose the consumer/coach company. This audit evaluates the company the registry chose, and will hold the memos to it.

---

# LENS 1 — a16z CONSUMER

## 1. Product–Market Fit: who desperately wants this?

**The obsessed user is the seam athlete.** 25–40, trains 5–6 days a week, identifies as an athlete rather than an exerciser, and — the defining trait — trains *across* disciplines: lifts and runs, Hyrox or CrossFit or combat sports plus a barbell. Their current stack is 2–4 apps with a seam down the middle of their body: Hevy or Strong for the barbell (which cannot see the road), Strava or Garmin for the road (which cannot see the barbell), MyFitnessPal (which cannot see either), and possibly WHOOP (which sees neither the sets nor the food, and charges $30/month for a black-box score). They already pay **$40–80/month combined** for a stack that cannot answer their actual daily question: *"given everything I did, what should I do today?"* Willingness to pay is proven by the stack itself; frequency is daily by definition of the training life. The frustration is not missing features — it is that **no product is accountable for the whole athlete.**

**The beachhead: the Hyrox ecosystem.** It is the fastest-growing fitness competition format on earth, structurally hybrid (a Hyrox workout is *not representable* in Strava or Hevy — half run, half sled and wall balls), evangelical, event-organized (physical funnels on a calendar), and unowned by any incumbent. And there is a smaller, sharper beachhead inside it that the repo has already voted for without noticing: the app ships English, Polish, and German — and the entire hand-verified food tier (`verified-foods.ts`, 4 foods, 2 sources) is **Lidl and a Polish burger chain**. The founder's proximity market is the Polish/German Hyrox and hybrid scene: small enough to own, dense enough to seed attestation and coach graphs, and in the sport's European heartland.

The indefensible fact against this: **the Hyrox, CrossFit, and powerlifting plan shelves are literally empty** (`plans: []`, 13 of 19 goals unauthored). The beachhead's front door is a screen that says "No plans here yet."

## 2. Why Now?

Five tailwinds, four real:

1. **The hybrid category's cultural moment.** "Run + lift" is the CrossFit of the 2020s; Hyrox sells out arenas. A vertical wedge riding a demand wave rather than fighting apathy — the rarest kind.
2. **Wearable ubiquity + HealthKit maturity.** The sensor is already on the athlete's wrist; ingestion is a connector, not a hardware bet. The repo's device-truth discipline (measured outranks typed) is only *possible* now.
3. **Frontier AI at near-zero marginal cost.** A grounded coach that reads the athlete's actual history (`/api/ai-coach`, grounded in the last 30 sessions), vision-based label scanning, NL quick-add — all already in the tree, all economically impossible in 2015.
4. **Black-box fatigue.** Consumers are souring on WHOOP-style unexplained scores. An "honest instrument" — provenance labels, error bars, refusal to fabricate — is a positioning whose time has specifically arrived.
5. **AI-native development velocity** — this codebase (199k LOC, 8 days) is itself the evidence. But this tailwind blows for everyone, which is why it appears in the threat column too.

**The 2015 test cuts, and it cuts where the effort went.** The strength logger, the food diary, the social feed — the *most-built* parts of this product — could all have shipped identically in 2015 (Strong, MFP, and Fitocracy did). What could not exist in 2015: device-truth, the adaptive MRV estimator, the grounded coach, the k-anonymous cohort engine, cheap multimodal capture. **The product's effort distribution is inverted relative to its why-now.** That is the single most a16z-relevant criticism in this audit.

## 3. The Retention Engine

The strongest loop this product can run — every arc annotated with its build status:

**Log** (✓ excellent) → **personal model updates** (✓ built: adaptive MRV, recovery-rate estimation, readiness baselines) → **visible insight with provenance** (✗ — *the model moves silently; there is no surface where the athlete watches the product learn them*) → **adjusted prescription** (△ thin: 4 hardcoded lifts) → **performance win** (✓ live PR detection, co-sign attestation) → **share** (✓ built: `workout-wrapped.tsx`, four story slides via view-shot) → **social reinforcement** (✗ empty network) → **return trigger** (✗ push notifications blocked; the APS entitlement is actively stripped) → Log.

Four of eight arcs exist. The two missing ones that matter most are the *insight surface* and the *return trigger* — the loop currently has no mouth and no bell.

- **Day 1 value:** real — guest-first workout before signup, a genuinely superior logger, derived (not interrogated) nutrition targets. Missing: history import, so the engines start blind and the user starts from zero.
- **Day 7:** first explained readiness ring, first PR, first device-matched session. This is where the product must land one insight the incumbent stack could not produce — and currently doesn't.
- **Day 30:** the adaptive landmarks have begun to move — *your* volume ceiling, with an honest confidence interval. This is the differentiated retention asset, and today it is invisible relative to its strategic weight.
- **Day 365:** a fitted personal model (tolerance, recovery rate, program response) plus a witness-signed record ledger. Leaving no longer means exporting a diary; it means abandoning a calibrated instrument and your proof. **That is the real switching cost, and nothing else in the product is one.**

**What compounds:** the model and the ledger. What does not compound: logs, streaks, features.

## 4. Network Effects — proven or not

- **Athlete → athlete (feed, kudos, leaderboards):** *not a network effect.* Substitutable content consumption; against Strava's decade-old graph it loses on its own terms. Built anyway, at full depth. This was mis-allocated effort.
- **Athlete → coach / coach → athlete:** *real, and the only edge with an economic engine.* The registry's own policy (`coach-tooling-free`): one coach brings 30–200 athletes at zero CAC, tooling free forever, monetize the marketplace. A coach's business living here (roster, programs, storefront, reviews) is genuine lock-in, and the coach *transfers retention* to athletes (accountability is the strongest known fitness retention mechanism).
- **Athlete → athlete via attestation:** *a genuinely novel local-graph seed.* A witness co-sign physically requires a second account in the same gym — adoption propagates through real space, gym by gym. No incumbent has this mechanic.
- **Cohort data network:** every enrollee sharpens the Program Efficacy Index and the k-anon priors — value flows from past users to future users. Real physics, floor of k=5, currently starved.
- **Athlete → club/team:** absent by choice (`org-graph` retired — correctly).

**Does each additional user make existing users better off today? No** — marginally worse (feed noise) until cohorts clear k=5 and gyms reach attestation density. **The evolution path — single-player utility → coach-mediated multiplayer → marketplace ecosystem — is credible, but only in that order, and the product is currently building all three layers simultaneously.**

## 5. The Explosion Test

- **10,000 users:** cohort priors (`shrinkNorm`) get real fuel; efficacy windows start clearing k=5 for the six authored programs; attestation becomes possible in dense gyms. But: **nobody would know** — analytics is a documented no-op (`lib/track.ts`), so the explosion would be invisible to the company; and the set data sits in a JSON column, so cohort analytics run as app-code scans.
- **100,000:** cold-start prescription measurably beats any single-column competitor (the priors now encode real hybrid athletes); the efficacy index becomes a public product; the coach marketplace has browse-worthy supply. The JSON-set decision becomes a forced re-architecture under load.
- **1,000,000:** the injury calibration (`refitCalibration` + `RiskOutcome`) has enough labeled outcomes to stop being a heuristic; HPI has a shot at becoming vocabulary; marketplace liquidity is real.
- **10,000,000:** the corpus is the reference dataset for concurrent-training response — something no lab has ever assembled — and the company is a data-and-models business wearing an app.

**The distinction the test asks for:** this product is *architecturally designed* to become more intelligent, personalized, and defensible with scale — the superlinear terms genuinely exist in the code (`datanet.ts`, efficacy, attestation), which is rare and to its enormous credit. **But every superlinear term is currently behind a blocked or empty prerequisite.** As shipped today, more users = a larger database of workout logs plus a louder empty feed.

## 6. Distribution

Ranked, non-obvious first:

1. **Coaches as zero-CAC distribution nodes.** Already policy, already built (invite by QR/link/email, roster, program delivery). The motion: recruit 50 hybrid coaches, white-glove them, let them bring 30–200 athletes each. This is the only channel where someone else does the convincing.
2. **The share loop is already built and unaimed.** `workout-wrapped.tsx` renders four story-slides per session — that is TikTok/Instagram distribution infrastructure sitting in the repo. Add the verified-record mark to the PR slide and every co-signed PR becomes branded, *provable* social content — the one thing fitness Instagram is starving for.
3. **Hyrox events as physical funnels.** Event-day leaderboards, division rankings, "log your Hyrox" — a calendar of thousand-person rooms full of exactly the beachhead user, with no incumbent app presence.
4. **Efficacy pages as content/SEO.** Public `/programs` pages showing measured outcomes ("this program's median e1RM delta, adherence, dropout") are content no competitor can publish without the data. Evidence is the only fitness content with zero supply.
5. App Store editorial — the design quality gives a legitimate shot at featuring; wasted until the build is verified and the funnel is instrumented.

**What's missing entirely:** referral mechanics, ASO, any measurement of any funnel. Distribution is currently a set of assets with no motion.

## 7. AI-Native Product

If AI is free and capable, the correct end state is not "AI coach" (a chat tab). It is an **inversion: the logger stops being the product and becomes the sensor array for an agent.** Concretely, in this codebase's terms: quick-add NL (built for food) becomes the input grammar for everything; `silent-logging` (planned in the registry — "sets detected, not typed") removes the logging tax entirely; device auto-import (built, blocked) makes cardio ambient; the grounded coach (built, thin) becomes the negotiation surface — the agent proposes the day, the athlete accepts or pushes back, the outcome trains the agent.

The honest gap: **the agent cannot currently re-plan.** `buildMacrocycle(goalOrSport, eventInWeeks)` — the periodization engine's entire input surface — reads *nothing* about the athlete: not fatigue, not history, not landmarks, not nutrition. The pieces that would let a real agent operate (goals, constraints, schedule, injury state as *inputs* to planning) are not modeled. The product understands its user's past far better than any competitor could, and cannot yet act on it beyond tomorrow's session.

## 8. a16z Investment Decision

- **Would I invest? MAYBE — as a pre-seed on the founder-plus-wedge, not a seed on the product.** The repo's own a16z memo says $4–6M seed at $18–28M post. On the consumer lens, that is a round ahead of the evidence: there is no capture, no cohort, no retention curve, and the retention loop's mouth and bell are unbuilt.
- **Stage: pre-seed** (a small check to fund the 90-day proof), with the seed gated on the metric below.
- **What would stop me:** the effort-inversion (§2) continuing — 95-commit days spent on surface while capture stays blocked; solo-founder recruiting risk; consumer fitness CAC history.
- **What would make me say YES immediately:** 500 Hyrox athletes on a verified TestFlight build with **40%+ week-12 retained weekly logging**, a third of them arriving via a coach.
- **The metric I demand:** week-12 retained weekly-active logging cohort (not installs, not DAU), plus % of sessions device-matched (the capture-quality proxy).
- **The single product change that most increases valuation:** ship the **visible personal-model surface** — a monthly "what we learned about you," with provenance, powered by the adaptive-MRV stack that already exists. It converts the invisible moat into the demo, the retention hook, and the fundraising slide in one feature.

---

# LENS 2 — SOFTBANK / VISION FUND

## 9. The $100 Billion Question

Work backwards from $100B: it requires being the **operating system for human physical performance** — consumer scale (hundreds of millions), a marketplace take-rate on the global coaching economy, and the data/infrastructure layer sold to sport, medicine, insurance, and defense. That is the company described in `reference/north-star-strategy.md` (FC Barcelona, federations, SOF units).

**The finding that decides this lens: the founder already killed that company.** The capabilities registry retired `org-graph` ("TeamBuildr wins that market on athletic-director relationships and procurement cycles"), `tactical-vertical` ("a different company"), `longevity-vertical` ("diagnostic-adjacent claims from a company with no clinician"), `video-intel`, `forceplate-ingest`, and `financials-model` — each with reasoning this audit endorses. **Those kills were correct for the company and disqualifying for this fund.** SoftBank's shape of bet — pour capital on a horizontal moonshot — is precisely what the registry's judgment forecloses.

The realistic staircase: **$1B plausible** (own the hybrid category + coach marketplace with take-rate + subscription — a WHOOP/Strava-class outcome). **$10B requires the data thesis maturing** (the labeled-outcome corpus priced as infrastructure, efficacy as industry standard, marketplace liquidity). **$50B+ requires re-entering the retired verticals from a position of consumer strength** — which the registry itself sequences as "revisit after 100k consumers, or spin it out." The honest answer to Masa: *come back in five years, if the clock has been running.*

## 10. Global Scale

- **Europe first, and the repo agrees:** Hyrox's heartland, metric-native (the app thinks in kg), EN/PL/DE shipped, GDPR posture aided by the consent/honesty brand. The DACH + Poland + Nordics hybrid scene is a coherent first continent.
- **US:** the biggest prize, the worst CAC, and the strongest incumbency; enter via the coach channel and Hyrox US, not paid social.
- **China: no** (ecosystem, regulatory, and distribution realities; WeChat-native incumbents). **Japan/Korea:** strong cultural fit for precision/quantified training — later, with real localization. **India:** price-sensitive, cricket-shaped, wearable-sparse — not this decade's market. **LatAm/Middle East:** moderate; CrossFit/Hyrox pockets; follow the events.
- The genuinely global assets are the food layer (Open Food Facts is worldwide; the verified tier localizes per retail market) and the sport catalog. The genuinely local asset is the coach graph — which is the point: it localizes *itself* through coaches.

## 11. Platform Potential

Feature → app → **product (today)** → platform → ecosystem → infrastructure. Highest credible evolution: **infrastructure — the performance graph and its models as the layer others build on** (query-the-athlete APIs, connector certification, efficacy as the industry's evidence standard). What prevents it, in order: zero users; the JSON set-store (an infrastructure company cannot be built on unqueryable primary data); no developer surface or story; and — structurally — platform status must be *earned from* the data, which requires the consumer/coach product to win first. Platform is a consequence here, not a strategy.

## 12. AI + Physical World

The thesis SoftBank would actually like: **the intelligence layer above every device** — All devices → performance intelligence → human. The schema is literally drawn for it: `Signal` with `source: apple | whoop | garmin | catapult | manual`, a connector registry with seven providers, device-truth as law. Reality: **one of seven connectors functions (Apple), summaries only, blocked on device verification; the other six return 501 for lack of OAuth credentials.** And the structural problem is bigger than credentials: **Apple owns the sensor bus** and is moving up the stack; Garmin and WHOOP treat their streams as the moat and their APIs as leverage. Being "Switzerland" above the devices requires either partnerships (capital, BD, years) or being so good at the *join* that users manually route their data to you — which is a product argument, not a platform argument. The intelligence-layer thesis is real and this codebase is the best-prepared small entrant I have seen for it — but the door is held by the device makers, not by software quality.

## 13. Capital Intensity

- **Cheap (proven):** software. Eight days, 199k LOC. The marginal cost of product here is approximately zero — which is exactly why *product* cannot absorb capital productively.
- **Expensive at scale:** consumer CAC (the fitness graveyard's cause of death), plan/content authoring and localization, wearable partnership BD, marketplace liquidity subsidies (paying the first 500 coaches to move their business), eventually data infrastructure and applied-ML hiring. AI inference: modest and falling; a rounding error next to CAC.
- **Could enormous capital accelerate this dramatically? Not today.** $100M into this company this quarter buys nothing the company needs — its binding constraints (verified build, retention truth, elapsed athlete-weeks) are bought with calendar time, not money. Capital leverage inverts *after* PMF: then money buys coaches, events, countries, and data-team depth. **This is a company to fund in sips until the clock is running, then in gulps.** That profile is the opposite of the Vision Fund instrument.

## 14. SoftBank Investment Decision

| Dimension | Score |
|---|---|
| Vision | 8/10 — the north-star corpus sees the decade clearly |
| Global Scale | 6/10 — EU-credible now; US expensive; Asia distant |
| Platform Potential | 5/10 — real, but strictly downstream of a consumer win |
| AI Potential | 7/10 — genuinely AI-native architecture; agent gap remains |
| Capital Leverage | 3/10 — constraints are temporal, not financial |
| $100B Potential | 2/10 — the founder already (correctly) killed the $100B company |

**Verdict: PASS** — with a standing WATCH trigger: retained six-figure user base or visible coach-marketplace GMV. This is not an insult; it is a statement that the company's own best judgment (the retired-verticals ledger) makes it the wrong shape for this fund and the right shape for surviving.

---

# LENS 3 — GOOGLE PRODUCT + TECHNOLOGY

## 15. The Information Graph

Could this create a unified Human Performance Graph? **The schema already is one — that is the most Google-shaped fact in the repo.** Fifty-five models forming a real ontology: an athlete node joined to sessions (with per-set RPE, velocity, ROM, actual rest), device recordings, a universal time-series (`Signal`: HRV, RHR, sleep, water, and — typed but unread — energy, protein, carbs), check-ins with decay context (`CheckinRead.sinceSessionH`), body composition, food with provenance, programs, enrollments, coaches, witnessed records, and labeled injury outcomes (`RiskOutcome`) with versioned model fits (`ModelFit`). Nobody in the comp set has this ontology; each incumbent has one aggressively-indexed column.

What the graph is missing: **streams** (HR series, GPS, splits — summaries only), **the nutrition edges into the training subgraph** (typed, unread — the join that is the product's whole thesis), a cross-user knowledge layer beyond k-anon cohort priors, and a queryable set store (the graph's densest data lives in a JSON blob). A Google review would approve the ontology and fail the storage layer in the same meeting.

## 16. Search → Answers → Action

The fitness equivalent, mapped to this codebase honestly:

| Stage | Status |
|---|---|
| **LOG** | 9/10 — the best thing here; guest-first, offline, device-truthed |
| **UNDERSTAND** | 6/10 — explained readiness (the deficit ring that sums to 100), provenance labels; genuinely differentiated |
| **PREDICT** | 2/10 — injury model is an admitted un-fit prior; `future-self.ts` (trajectory projection, goal ETA, probability-of-target) is **fully built and imported by nothing** |
| **RECOMMEND** | 4/10 — prescription picks from four hardcoded lifts; periodization reads no athlete data |
| **ACT** | 3/10 — plan enrollment, coach assignment; the agent cannot re-plan |
| **AUTOMATE** | 1/10 — device auto-import built-but-blocked; silent logging planned |

The product is at stage two of six, with stage-five ambitions and — notably — a dead stage-three module already written. "What would it look like if the user barely managed fitness manually?" — the registry knows: `silent-logging`, `ai-copilot`, auto-import. The gap is not vision; it is that stages 3–6 are exactly the stages that require the data the product hasn't started collecting.

## 17. The Personal Fitness Model

The audit's strongest finding across all three lenses: **every example sentence in this section's brief is computable from this specific schema.** "You perform best when sleep > X" — `Signal(sleep)` joined to session e1RM series. "Your squat plateaus after four high-volume weeks" — the landmark-replay machinery *already computes this shape* (evidence-gated weekly verdicts). "Running improves when carbs rise before hard sessions" — `FoodLog` × session join: **typed, present, and unwired.** "Reduce lower-body volume tomorrow" — ACWR + per-muscle fatigue + adaptive MRV: shipped. The recovery-rate estimator (`recovery-pairs.ts` — personal fatigue clearance from paired same-day reads, with confound rejection) is a personal-model feature no shipping consumer product has.

**Is it defensible? Yes — this is the one durable advantage available to this company.** A fitted personal model is non-portable (it lives in the joins, not in an exportable CSV), compounds with time, and cannot be cold-started by a competitor with more capital. The prerequisite is the one resource the company hasn't banked: longitudinal athlete-weeks.

## 18. The Google-Scale Data Flywheel

Users → data → models → recommendations → outcomes → trust → usage → data. Where it is **strong** in this repo: the labeling machinery (outcomes, enrollment windows, evidence-gated MRV updates) and — rare in consumer software — **honest offline evaluation** (`datanet.ts` computes Brier scores, ROC-AUC, and reliability buckets, and reports "refit beats the prior" or "prior still ahead" truthfully). That evaluation discipline is Google-grade and is the difference between a flywheel and a story. Where it is **weak**: capture (blocked), instrumentation (none — the company cannot currently measure its own flywheel), storage (JSON sets), streams (absent), and trust-at-scale (a brand asset that must be earned before users grant the joins). **What makes catch-up hard, if it spins:** elapsed time × retained users × label density. A year-five entrant can replicate the software in a quarter and cannot fast-forward five years of labeled human outcomes. Time is the only input here that cannot be bought — by anyone.

## 19. AI Agent

*"Sub-40 10K while gaining 3 kg of muscle"* — what happens today: the system knows the athlete's current 5K-equivalent pace (median of logged runs), their e1RMs, their readiness, their volume ceilings. It cannot take the sentence: goals are not a modeled input, constraints and schedule are not modeled, `buildMacrocycle` accepts a sport and a week-count and consults nothing else, and the nutrition half of "gaining 3 kg" is disconnected from the training half. The gap between the grounded coach (chat that reads history) and an agent (a planner accountable to a goal) is the entire remaining product.

**Is the future a logger, or is the logger the data-collection layer for an agent? The second — and the repo half-knows it** (`silent-logging`, `ai-copilot` planned; auto-import built). The strategic restatement: *the logger's excellence is not the product; it is the sensor quality of the agent's instrument.* Ship the agent's first vertebra — goal-aware replanning — before the fifth analysis screen.

## 20. The Google Product Test

**Would Google build this? No.** Google's organizational history in this exact territory — Google Fit's decay, the Fitbit acquisition's dissipation — demonstrates the mismatch: a vertical, taste-driven, community-dependent consumer subscription with a decade-long data patience requirement is everything Google's incentive structure discards. **Trivial for Google:** the infrastructure, the CRUD, the model serving, the connector layer. **Strategically valuable to Google:** the labeled outcome corpus and the *consumer trust to collect it* — trust an advertising company structurally cannot buy in health data. **Hard even for Google:** the coach graph (relationship acquisition), the honest-instrument brand (Google cannot credibly sell restraint), the taste, and shipping fast for a niche.

**The real platform threat is not Google — it is Apple**, which owns the sensor, the OS, the identity layer, and is walking readiness scores upward from the wrist. The defense is the same as the offense: own the *join* (training + nutrition + coaching) that Apple's privacy posture and generality prevent it from owning, and hold the coach relationships Apple will never do BD for.

---

# PART IV — CROSS-EXAMINATION

| Question | a16z Consumer | SoftBank | Google |
|---|---|---|---|
| Biggest opportunity | Hyrox/hybrid wedge + coach-led distribution | Marketplace take-rate on the global coaching economy | The personal performance model on the joined graph |
| Biggest weakness | Retention loop has no mouth (insight surface) and no bell (push) | Capital cannot buy the binding constraint (elapsed time) | Stages 3–6 of the value chain unbuilt; sets in JSON |
| Biggest moat | Coach lock-in + verified ledger | Data-as-infrastructure, someday | Fitted per-athlete models + labeled corpus + eval discipline |
| Biggest threat | Consumer fitness CAC + cold-start death | Founder (correctly) killed the fund-sized company | Apple absorbing the join at OS level |
| Most important feature | Visible "what we learned about you" | Coach marketplace payments (Stripe Connect) | Goal-aware replanning (the agent's first vertebra) |
| Most important metric | W12 retained weekly-active logging | Marketplace GMV / take-rate | Labeled athlete-weeks; % sessions device-matched |
| Why users stay | The product visibly knows them | Their coach runs their business here | The model is non-portable and compounding |
| Why users leave | Empty network, thin week-one intelligence, no re-engagement | No reason to believe scale story yet | The model never became visible or actionable |
| AI opportunity | Agent negotiation replaces logging | Intelligence layer above all devices | Longitudinal personal models, honestly evaluated |
| Network opportunity | Coach graph + gym-local attestation | Two-sided marketplace | Cohort priors + efficacy evidence commons |
| Data opportunity | Provenance-labeled capture at the seam | Corpus priced as infrastructure | The only labeled concurrent-training dataset on earth |
| Platform potential | Modest; product-first | The whole thesis, strictly sequenced last | Real, contingent on storage + capture re-architecture |
| Global potential | EU heartland first | Genuine, coach-localized | Universal (physiology has no locale) |
| Investment verdict | **MAYBE — pre-seed, milestone the seed** | **PASS, watch trigger set** | **Would not build; would fear it in five years — validates thesis** |

# PART V — THE CONTRADICTION TEST

The three theses in one line each: a16z says **the coach network is the company**; SoftBank says **the platform/marketplace is the company**; Google says **the personal model is the company.**

**The strongest is Google's — because it is the only thesis that works at n = 1.** A single retained athlete gets compounding value from their own model on day 30, with zero network density and zero marketplace liquidity. The coach network needs tens of coaches to matter; the marketplace needs thousands of users; the personal model needs one user and time. And it is the *enabling* thesis for the other two: the model is why athletes stay (retention → the a16z network becomes seedable), and the models-plus-outcomes corpus is what the SoftBank platform eventually sells.

**They coexist only in strict sequence:** personal model → coach network → marketplace → data platform. The contradiction is not between the theses — it is between the sequence and the repo, which shows all four layers being built simultaneously (62 routes, a full social suite, marketplace scaffolding, an agent-ops console) while layer one's visible surface remains unbuilt. Pick the Google thesis first; the other two are its consequences.

# PART VI — WHAT IS THIS ACTUALLY?

**"We are building the personal performance model for athletes who train across disciplines — the one system accountable for the whole athlete."**

**"Today it looks like a fitness app, but eventually it becomes** the intelligence layer between a person and their training: an agent that plans, a ledger that proves, and a marketplace where coaching and programs are sold on measured evidence."

**"The reason this could become enormous is** that nobody owns the join — every incumbent owns one column of the athlete's life, the joined-and-labeled row is the rarest dataset in sport, and the coach channel distributes it at zero CAC while the hybrid wave supplies the beachhead."

**"The moat is** elapsed athlete-time: fitted personal models that cannot be exported, labeled outcomes that cannot be fast-forwarded, witnessed records that cannot be faked, and evidence-priced programs that unproven marketplaces cannot list against."

**"The biggest thing that could kill the company is** the founder's own velocity — building at AI speed feels like progress while the only uncopyable asset, athlete-weeks inside the loop, accrues at exactly zero. Second: Apple walking the join up from the wrist while the beachhead stays unclaimed."

# PART VII — WHAT TO BUILD NEXT

**BUILD NOW** (the 90-day proof; nothing else until these ship)
1. The verified device build — TestFlight on physical iPhones; flip HealthKit, auto-import, barcode, IAP from blocked to seen-working.
2. Push notifications (the bell) + Sentry + analytics (the eyes) + billing credentials (the till).
3. History import — Hevy/Strong/Strava/CSV; the switching mechanism and the engines' cold-start fix in one feature.
4. The nutrition→training join — energy availability into readiness and MRV; the thesis, finished.
5. The visible model surface — "what we learned about you," provenance-labeled, powered by the landmark stack that already exists.
6. Hyrox + CrossFit + powerlifting shelves authored (or the empty shelves cut).

**BUILD NEXT** (retention and differentiation)
- Coach onboarding as a first-class funnel (roster import, white-glove the first 50).
- Verified-record mark on the wrapped share slides; event-day Hyrox leaderboards.
- Goal-aware replanning — `buildMacrocycle` reads the athlete (the agent's first vertebra).
- Live Activity rest timer; row swipe actions; per-set table migration out of JSON (while the table is small).

**BUILD LATER** (needs scale to matter)
- Marketplace payments (Stripe Connect) and the take-rate; public efficacy as content/SEO; clubs and challenges; streams ingestion (HR series, GPS, splits); silent logging; developer/API surface.

**DO NOT BUILD**
- Anything the registry already retired (org/enterprise, tactical, longevity, video, force plates) — the kills were correct; keep them dead.
- DMs, additional languages, the watch app, more admin/agent-ops tooling, more design-law ratchets, an eleventh analysis surface.

**REMOVE** (unchanged from audit/12, still true)
- The fake GPS map; the Messages tab from the tab bar; the agent-org console from the consumer binary; the dead Reanimated dependency and dead template branches; the analysis-screen sprawl (ten surfaces → two); emoji as UI.

# PART VIII — THE 2035 VISION

Not a better logger. By 2035, if this works: **training is ambient and the model is the product.** The athlete doesn't log — the wrist, the bar, and the phone's camera detect the work; typing is a correction, not an act. Each morning the agent has already negotiated the day against the athlete's fitted model — tolerance, recovery rate, goal trajectory, last night's sleep, yesterday's meals — and explains itself with provenance when challenged, because the honest-instrument covenant is the brand. Coaches are supervisors of AI-drafted programming, selling judgment rather than spreadsheets, running businesses entirely on the platform; programs are listed with measured efficacy the way funds list returns, and unproven programming cannot command a price. The verified ledger is amateur sport's proof layer — records, qualifications, and match-fit claims are co-signed, device-corroborated entries, and "is it on HYBRID?" is the sentence that settled arguments replaced "video or it didn't happen" with. The company owns the actuarial table of human training adaptation — what programming does to whom, at what cost, joined and labeled across a decade — and licenses the models, never the data. The user cannot leave because leaving means becoming unmeasured: going back to being a stranger to their own body. **To make that future possible, the only thing that must start today is the clock.**

---

# FINAL SCORECARD

| Category | /10 | | Category | /10 |
|---|---|---|---|---|
| Product | 6 | | Distribution | 4 |
| UX | 6.5 | | Defensibility | 2 |
| Consumer Appeal | 7 | | Monetization | 4 |
| Retention | 3.5 | | Category Creation | 6 |
| Network Effects | 2.5 | | $10B Potential | 4 |
| AI Potential | 7.5 | | $100B Potential | 1.5 |
| Data Moat | 5 | | Technical Potential | 8 |
| Platform Potential | 5 | | **Overall** | **5.5** |
| Global Scale | 6 | | | |

**a16z Score: 5/10** — a fundable wedge and founder at pre-seed; a round short of its own memo's terms.
**SoftBank Score: 2.5/10** — the fund-sized company was correctly killed by its own founder; pass with a watch trigger.
**Google Score: 6.5/10** — the strongest thesis validation: the graph is real, the model is defensible, and Google itself couldn't hold the patience to build it.

# FINAL VERDICT

**GO, BUT CHANGE THE STRATEGY.** Should you go all-in? Yes — on a different allocation of the same energy. The opportunity is real: an inflecting category with no incumbent at the seam, a coach channel with zero-CAC physics, a data thesis whose machinery you have already built with unusual honesty, and a personal-model moat that compounds with the one resource nobody can manufacture. What must change is the definition of progress. For eight days, progress has meant more product — and the product is now three rounds of funding ahead of the company. Progress must start meaning *evidence*: a verified build in real hands, a bell that rings, eyes that see the funnel, a till that opens, a hundred Hyrox athletes, and a retention curve that tells the truth. Everything on the BUILD NOW list is within days of your demonstrated velocity; none of it is code you haven't already proven you can write.

**The ONE insight:** every input to this company can now be manufactured at AI speed — code, design, strategy, even these audits — **except one: elapsed time of real athletes inside the loop.** Longitudinal data has a clock that cannot be compressed, parallelized, or generated. The moat you have correctly designed is denominated in athlete-weeks, and your current balance is zero — it has been zero on every one of the 239 commits, and it will still be zero after the next 239 unless a verified build reaches real hands. You are one week of work from starting a clock that should have been your company's first metric. Start the clock.
