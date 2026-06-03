# HYBRID — Performance Platform Master Strategy & Competitive Feature Atlas

> Institutional-grade reverse-engineering of the elite performance technology stack,
> mapped against HYBRID's **actual** codebase (see `packages/core/src/capabilities.ts`).
> Written as Series-A diligence material. Status tags are real, not aspirational:
> **✅ Shipped · 🟡 Blocked (needs X) · 🔵 Planned · ❌ Not started**.

---

## 0. Executive Summary — The Verdict

HYBRID is, today, **unusually deep in the engine/intelligence layer and unusually thin in the capture/integration layer.** Most competitors are the inverse: they own a sensor (Catapult GPS, VALD ForceDecks, WHOOP strap) and bolt thin analytics on top. HYBRID has built the **shared decision engine** — fatigue, readiness, HPI, injury risk + RTP, periodization, prescription, VBT, talent benchmarking, org graph, data-network refit — as pure, unit-tested TypeScript consumed identically by web and mobile, on one Signal ontology.

**The thesis that wins a Series A:** *the value is migrating from the sensor to the model.* Hardware commoditizes; the cross-vendor, cross-modality **athlete model with a network-effect refit loop** is the durable asset. HYBRID is one of the few that started there.

**The thesis that loses it:** without ingestion (wearables OAuth, force-plate/GPS files, bar sensors) and live deployments producing labeled outcomes, the engines run on sample data and the network effect never ignites. **Capture is the gating risk, not intelligence.**

**Three numbers that matter for diligence:**
1. **Time-to-first-insight** for a new athlete (currently strong: manual check-in + logger → Twin in minutes; weak: no automatic wearable backfill — 🟡 wearables).
2. **% of insights backed by ingested vs manually-entered data** (currently low — the integration gap).
3. **Labeled injury/outcome volume** feeding `datanet.ts` refit (currently ~0 in production — the moat is wired but un-ignited).

---

## 1. Competitive Landscape Map

| Product | Primary asset | Core job | Buyer | Where HYBRID overlaps |
|---|---|---|---|---|
| **Catapult** | GPS/IMU pods + Vector | External load (distance, HSR, accel) | Pro team S&C / sports science | Signal kinds (totalDistance/HSR/accelLoad) ✅; ingestion 🟡 |
| **STATSports** | Apex GPS pods | External load, live | Football clubs | same as Catapult |
| **VALD** (ForceDecks/NordBord/ForceFrame/HumanTrak) | Force plates + dynamometry | Neuromuscular & strength asymmetry | Performance/medical | jumpHeight/asymmetry signals ✅; FD file ingest ❌ |
| **Hawkin Dynamics** | Wireless dual force plates | Jump/CMJ profiling, RSImod | Performance | jump metrics model partial ✅ |
| **Sparta Science** | Force plate "Movement Signature" | Scan → risk/readiness score | Enterprise/military | conceptually = HPI + injury-risk ✅ |
| **Output Sports** | Single IMU | VBT, ROM, jump, field tests | S&C, physio | **vbt-engine ✅**, capture 🟡 (vbt-capture) |
| **WHOOP / Oura / Garmin / Polar** | Wearable + recovery score | Recovery, sleep, HRV, strain | Consumer→pro | connectors built ✅, OAuth 🟡 |
| **TrainingPeaks / Final Surge** | Endurance planning | PMC (CTL/ATL/TSB), structured workouts | Endurance coaches | periodization/peaking ✅ (Banister); TSS ingest ❌ |
| **Strava** | Social + segments | Activity feed, network | Consumer | ❌ (social graph) |
| **TeamBuildr / BridgeAthletic / CoachMePlus** | Team workout delivery | Program builder, roster, compliance | HS/college/team S&C | logger/plans/coach-layer ✅; calendar/builder partial |
| **Trainerize / TrueCoach / Everfit** | Remote PT delivery | Workout delivery, messaging, habits, billing | Online/PT | logger ✅; messaging/billing ❌ |
| **Smartabase (Fusion Sport)** | Configurable AMS | Athlete management system of record | Olympic/pro enterprise | org-graph + Signal ontology ✅ (this IS the category) |
| **Kitman Labs** | iP² + medical | Injury risk, availability, medical | Pro clubs | injury-risk + RTP ✅ |
| **Kinduct (Nike)** | AMS + content | Data hub + education | Pro/enterprise | org-graph ✅ |
| **AthleteMonitoring** | Affordable AMS | Wellness, ACWR, RTP | College/national | this IS the mid-market AMS HYBRID can undercut |
| **PhysiApp / Physitrack** | Tele-rehab | Exercise rehab prescription + video | Physio | rtp-panel ✅; rehab library ❌ |

**Strategic read:** the market splits into (a) **hardware+analytics point solutions** (Catapult, VALD, Hawkin, WHOOP) and (b) **Athlete Management Systems / systems of record** (Smartabase, Kitman, Kinduct, AthleteMonitoring). HYBRID is architected as a **(b) that ships its own (a)-grade intelligence and can ingest any (a)**. The wedge is: *AMS-grade model + consumer-grade UX + open ingestion.*

---

## 2. THE FEATURE ATLAS

### 2A. TABLE STAKES — expected in any modern coaching platform

| Feature | Who uses it | Why it matters | Data collected | Frequency | UX expectation | HYBRID |
|---|---|---|---|---|---|---|
| Workout/session builder | Coach, PT | The atomic unit of delivery | exercises, sets×reps×load, rest | daily | Drag-drop, templates, supersets, copy-week | ✅ logger; ❌ drag-drop builder/supersets |
| Exercise library | Coach, athlete | Standardized movement vocabulary | name, pattern, muscles, media | constant | Search, video demo, swap | ✅ MOVEMENTS map; ❌ video demos/large library |
| Training calendar | All | Schedule & adherence | events, dates, assignment | daily | Month/week, drag-reschedule, recurring | 🔵 Event model exists; ❌ calendar UI |
| Progress tracking | Athlete, coach | Motivation + decisions | e1RM, volume, bodyweight | weekly | Charts, trend arrows | ✅ dashboards/e1RM series |
| PR tracking | Athlete | Dopamine + benchmarks | best lifts, times | per session | Auto-detect, celebrate | ✅ bestE1rmByLift |
| Bodyweight/measurement log | Athlete | Composition trend | mass, girths, photos | weekly | Quick entry, graph | ✅ bodyMass signal; ❌ photos/girths |
| Messaging | Coach↔athlete | Retention, accountability | text, attachments | daily | In-context, push, read receipts | ❌ (coach notes only ✅) |
| Attendance/check-in | Team coach | Compliance | present/absent, session done | per session | One-tap, roster grid | partial (adherence calc ✅) |
| Habit/nutrition basics | PT, online | Behavior change | water, steps, macros, photos | daily | Streaks, reminders | ❌ |
| Notifications/reminders | All | Adherence | schedule triggers | daily | Push + email, quiet hours | 🟡 (needs mobile push infra) |
| Auth + roles | All | Access | identity, role | constant | SSO, social login | ✅ email; 🟡 social |
| Billing/payments | PT, online | Revenue for coach | plans, invoices | monthly | Stripe, packages | ❌ |

**Verdict on Table Stakes:** HYBRID has the *intelligence-adjacent* table stakes (logging, progress, PRs, dashboards) but is **missing the "delivery business" table stakes** that retain PTs and online coaches: **drag-drop builder, exercise video library, true calendar, in-app messaging, habit/nutrition tracking, billing.** These are unglamorous but are the reason Trainerize/TrueCoach have hundreds of thousands of seats. **Cannot win SMB coaching without them.**

---

### 2B. PROFESSIONAL — serious coaches & performance facilities

#### RPE / sRPE session load
- **Role:** S&C, sport coach. **Workflow:** post-session 0–10 RPE × duration → arbitrary units; rolls into weekly load. **Decision impact:** flag spikes, manage weekly progression. **Data model:** `Signal{kind:"sessionLoad"}` derivable; today RPE lives in `StrengthSet.rpe`/conditioning. **Dashboard:** weekly load bar + monotony/strain. **HYBRID:** RPE ✅; sRPE/monotony/strain ❌ (easy add to fatigue/twin).

#### Wellness questionnaire (sleep/soreness/mood/stress)
- **Role:** athlete daily; S&C reads. **Workflow:** 4–6 sliders at wake. **Decision:** adjust session, flag red. **Data model:** Signals (sleep, soreness, mood, stress). **Dashboard:** team red/amber/green grid. **HYBRID:** biocheckin ✅ (HRV/RHR/sleep/soreness/mood/stress) → Signal ontology; team grid ❌.

#### Velocity-Based Training
- **Role:** S&C, powerlifting/team. **Workflow:** measure mean concentric velocity per set; autoregulate load; stop on velocity loss. **Decision:** daily load, fatigue management. **Data model:** per-set velocity → load–velocity profile → est 1RM. **Dashboard:** L-V profile, zones, est 1RM. **HYBRID:** **vbt-engine ✅** (profile, zones, est 1RM, %1RM↔v, loss autoreg, recommender), **velocity-aware prescription ✅**, web + mobile screens ✅, manual/derived input ✅; **live capture 🟡 (vbt-capture — bar sensor/camera SDK).**

#### Readiness scoring
- **Role:** all. **Decision:** push/hold/deload. **Data model:** fatigue (muscle/system decay) + biometric z-scores. **HYBRID:** ✅ readiness engine + HPI; surfaced everywhere.

#### Movement screen / mobility (FMS, overhead squat, ROM)
- **Role:** S&C, physio. **Workflow:** periodic scored screen. **Decision:** corrective programming, risk. **Data model:** test battery, scores, asymmetry. **Dashboard:** screen card + history. **HYBRID:** asymmetry from video ✅; structured screen battery ❌.

#### Exercise compliance / completion
- **Role:** online/remote coach. **Workflow:** athlete marks done + actuals; coach reviews variance. **HYBRID:** sessions logged ✅; **planned-vs-actual variance ❌** (high value for remote).

#### Team scheduling & periodized calendar
- **Role:** team S&C. **HYBRID:** macrocycle/periodize ✅; team calendar & per-group assignment ❌ (Event model exists, UI missing).

#### Athlete notes (private/shared)
- **HYBRID:** CoachNote private/shared ✅.

#### Group/squad comparison
- **HYBRID:** **team-compare ✅** (rank roster on any lift: e1RM, velocity-1RM, bar speed, volume, reps).

**Verdict on Professional:** HYBRID is **strong-to-leading** here — VBT, readiness, fatigue, athlete notes, squad comparison are shipped, several at elite quality. Gaps: **sRPE/monotony/strain, planned-vs-actual compliance, structured movement screens, the team calendar UI, and the wellness red/amber/green squad grid** (the single most-used screen in pro team settings).

---

### 2C. ELITE — pro clubs, Olympic programs, sports science departments

#### Force-plate testing (CMJ, IMTP, drop jump, RSImod, DSI, asymmetry)
- **Orgs:** every Tier-1 club, Olympic. **Hardware:** Hawkin, VALD ForceDecks, Kistler. **Inputs:** force-time curves @1000Hz. **Algorithms:** jump height (impulse-momentum), RSImod, eccentric/concentric metrics, L/R asymmetry, dynamic strength index. **Reporting:** daily CMJ neuromuscular readiness vs baseline; flag >X% drop. **Competitive importance:** the gold standard for **neuromuscular fatigue**. **HYBRID:** jumpHeight/asymmetry signal kinds ✅; **force-time ingestion + jump battery model ❌** (high-priority elite gap).

#### GPS / LPS external load
- **Orgs:** football, rugby, NFL. **Hardware:** Catapult, STATSports. **Inputs:** position @10Hz → distance, HSR, sprints, accel/decel, metabolic power, player load. **Algorithms:** zone thresholds, ACWR per metric. **Reporting:** session/microcycle load, individual vs squad. **HYBRID:** signal kinds ✅; **file/API ingest + per-metric ACWR dashboards ❌.**

#### HRV / recovery monitoring
- **Orgs:** all. **Hardware:** WHOOP/Oura/Polar/morning HRV. **Algorithms:** rolling baseline + CV, oriented z. **HYBRID:** ✅ engine (rollingBaseline, orientedZ) + manual; **auto wearable sync 🟡.**

#### Acute:Chronic Workload Ratio (ACWR) & load metrics
- **Orgs:** all pro. **Algorithm:** 7d:28d coupled/uncoupled, EWMA variant; "sweet spot" 0.8–1.3. **Caveat:** scientifically contested — must present with monotony/strain + context. **HYBRID:** **ACWR is computed inside injury.ts per tissue ✅** but **not surfaced as the canonical load dashboard ❌** (cheap, high-credibility win).

#### Neuromuscular fatigue detection
- **Inputs:** CMJ trend, VBT velocity at fixed load, HRV, sRPE. **HYBRID:** fatigue engine + VBT ✅; CMJ-based ❌ (needs force plate).

#### Injury-risk modeling
- **Orgs:** Kitman, Sparta, Zone7, in-house. **Inputs:** load, ACWR, history, age, screen, wellness. **Algorithms:** logistic/ML, survival models. **HYBRID:** **injury.ts ✅** — per-tissue 0–100 + ACWR + recovery suppression → versioned logistic calibration → P(injury); **refit loop wired ✅** (needs labeled data to ignite).

#### Return-to-play protocols
- **Orgs:** medical depts. **Workflow:** staged gates, multi-discipline sign-off, audit. **HYBRID:** **rtp.ts ✅** — 5 gated stages, blocks advancement until gates met, immutable audit log; **medical-only override gating 🔵.**

#### Biomechanical / markerless motion analysis
- **Orgs:** biomech labs, increasingly phone-based. **HYBRID:** **video.ts ✅** (joint angles, rep count, asymmetry, depth, technique score) → asymmetry Signal feeds injury risk; **on-device pose capture ❌ (native module).**

#### Athlete availability forecasting / squad management
- **Orgs:** clubs. **Output:** who's available match-day, projected. **HYBRID:** org-graph ✅, Twin per athlete ✅; **availability forecast & squad board ❌.**

#### Multi-disciplinary collaboration (S&C + medical + nutrition + coach)
- **HYBRID:** org-graph roles + data-sensitivity RBAC ✅ (COACH sees performance, MEDICAL sees medical); shared records ✅.

#### Talent ID / benchmarking vs population
- **HYBRID:** **benchmarks.ts + talent-graph ✅** (percentile norms, maturation-adjusted projection, consent-gated discovery).

**Verdict on Elite:** HYBRID's **model coverage rivals or exceeds** Kitman/Sparta on paper (injury risk, RTP, twin, benchmarking, periodization, video). The **two decisive elite gaps are CAPTURE (force plate + GPS ingestion)** and **the canonical load/ACWR + squad availability dashboards** that performance directors live in.

---

### 2D. 10X DIFFERENTIATORS — invent the un-built

> Format: Problem · Why current solutions fail · How it works · Data required · Difficulty (1–5) · Defensibility · Investor attractiveness · Revenue.

**① Cross-vendor Athlete Digital Twin (the "Bloomberg terminal for the body")**
- *Problem:* every vendor is a silo; the athlete's truth is fragmented across 6 apps. *Why fail:* Catapult won't model WHOOP; WHOOP won't model ForceDecks. *How:* universal Signal ontology fuses every source into one Performance State with ranked "why it moved" drivers. *Data:* all signals. *Difficulty:* 3. *Defensibility:* HIGH (the schema + the fusion). *Investor:* this is the platform story. *Revenue:* per-athlete SaaS + enterprise. **HYBRID: ✅ shipped (twin.ts, signals.ts) — lead with this.**

**② Self-calibrating injury model with a data-network refit loop**
- *Problem:* injury models are generic, un-calibrated, distrusted. *Why fail:* vendors don't pool labeled outcomes across clubs. *How:* every RTP/injury outcome labels the data; `refitCalibration` re-fits the logistic; norms shrink toward observed population (k-anonymized). The model gets sharper as the network grows — **a literal data network effect.** *Data:* load + outcomes. *Difficulty:* 4. *Defensibility:* VERY HIGH (compounding, hard to copy late). *Investor:* THE moat slide. *Revenue:* premium + data layer. **HYBRID: ✅ wired (datanet.ts); 🟡 un-ignited (needs deployments).**

**③ Velocity-autoregulated prescription**
- *Problem:* %1RM programs ignore daily readiness; RPE is subjective. *How:* load anchors to the *velocity-estimated* 1RM (moves daily) + target bar speed; load auto-adjusts off measured bar speed. *Difficulty:* 3. *Defensibility:* MED (engine + data). **HYBRID: ✅ shipped (velocity-aware prescribeSession).**

**④ AI Performance Analyst / Copilot (grounded + agentic)**
- *Problem:* directors drown in dashboards; insight needs a human analyst. *Why fail:* generic chatbots hallucinate, ungrounded in the athlete's data. *How:* an agent grounded in the Twin + the club's methodology, drafts plans as editable objects, cites the athlete's own data, proposes (never auto-commits) changes, full audit. *Data:* Twin + sessions + methodology docs. *Difficulty:* 4. *Defensibility:* MED-HIGH (grounding + proprietary methodology RAG). *Investor:* the AI headline. *Revenue:* seat upsell. **HYBRID: 🟡 ai-coach wired w/ engine fallback (needs ANTHROPIC_API_KEY); 🔵 agentic copilot.**

**⑤ Video + wearable fusion ("technique breakdown lines up with fatigue")**
- *Problem:* form analysis (Hudl) and load monitoring are separate worlds. *How:* markerless technique score time-aligned with neuromuscular fatigue → "his knee valgus appears at exactly the load/fatigue threshold." *Difficulty:* 4 (capture). *Defensibility:* HIGH. **HYBRID: ✅ engine fusion (video→asymmetry→injury); ❌ capture.**

**⑥ Performance & career-trajectory forecasting**
- *Problem:* clubs invest on gut; no probabilistic projection. *How:* maturation-adjusted benchmarks + Banister fitness-fatigue → "P(this U16 reaches first-team threshold by 19)" and "form on event day." *Difficulty:* 4. *Defensibility:* HIGH (needs population data). **HYBRID: ✅ peaking + benchmarks; 🔵 longitudinal career model.**

**⑦ Automatic training-load optimizer (closed loop)**
- *Problem:* coaches hand-tune load. *How:* given event date + readiness + risk constraints, solve the microcycle that maximizes form while keeping every tissue ACWR in range — an optimizer, not a calculator. *Difficulty:* 4. *Defensibility:* HIGH. **HYBRID: partial (peaking optimizes peak; 🔵 constrained load optimizer).**

**⑧ Organizational Intelligence Layer (board-grade)**
- *Problem:* HP directors can't answer "is our methodology working?" across squads/seasons. *How:* roll Twins up the org graph → squad availability %, injury burden, load compliance, methodology efficacy vs outcomes; board/ownership reports. *Difficulty:* 3. *Defensibility:* HIGH (switching cost). *Investor:* enterprise ACV expander. **HYBRID: org-graph ✅; 🔵 rollup reporting.**

**⑨ Federated benchmarking / clean-room for federations**
- *Problem:* federations want norms without exposing athletes. *How:* k-anonymized aggregates + clean-room export; the sellable data layer (not raw rows). *Difficulty:* 4. *Defensibility:* VERY HIGH. **HYBRID: datanet aggregate ✅; 🔵 clean-room export.**

**⑩ Real-time session copilot (on the gym floor / pitch-side)**
- *Problem:* decisions happen live; dashboards are post-hoc. *How:* live bar speed / GPS → instant "stop the set" / "pull him" with a one-line reason. *Difficulty:* 5 (capture + latency). *Defensibility:* MED-HIGH. **HYBRID: feedback view concept; 🟡 needs live capture.**

**⑪ "Bring-your-own-sensor" universal ingestion + auto-mapping**
- *Problem:* onboarding a new device is a services project. *How:* a connector SDK + LLM-assisted field mapping that normalizes any vendor export into the Signal ontology in minutes. *Difficulty:* 4. *Defensibility:* HIGH (the integration graph becomes the moat — see Plaid). **HYBRID: connectors registry + parsers ✅; 🟡 OAuth + generic importer.**

**⑫ Consumer↔Pro continuum (one model, every tier)**
- *Problem:* everyday users and Olympians use totally different tools; talent is invisible until late. *How:* the same engine serves a beginner and a pro; talent-graph surfaces high-potential amateurs into a discovery layer (consent-gated). *Defensibility:* network effect across tiers. **HYBRID: ✅ architecturally (shared core, talent-graph) — rare and valuable.**

---

## 3. PERFORMANCE DATA ARCHITECTURE

```
                         CAPTURE / SOURCES                         INGEST            CANONICAL STORE            ENGINES (pure TS)              SURFACES
  ┌───────────────────────────────────────────────────┐   ┌──────────────────┐   ┌──────────────────┐   ┌───────────────────────────┐   ┌────────────────────┐
  │ Wearables    WHOOP/Oura/Garmin/Polar/Apple  HRV,   │   │ OAuth + webhook  │   │                  │   │ fatigue • readiness • HPI │   │ Athlete: dashboard │
  │              RHR, sleep, strain                    │──▶│ parsers          │   │                  │   │ progression • prescription│   │   twin, velocity   │
  │ GPS/LPS      Catapult/STATSports  dist,HSR,accel   │──▶│ file/API import  │   │   SIGNAL         │   │ periodization • peaking   │   │ Coach: roster,     │
  │ Force plate  Hawkin/VALD/Kistler  CMJ,IMTP,asym    │──▶│ CSV/force-time   │──▶│   ONTOLOGY       │──▶│ injury risk + RTP gates   │──▶│   team-compare,    │
  │ Bar sensor   IMU/encoder  velocity, ROM, bar path  │──▶│ BLE (vbt-capture)│   │  (one shape:     │   │ video (markerless)        │   │   notes            │
  │ Heart rate   chest/optical  zones, TRIMP           │──▶│ stream           │   │   kind,value,    │   │ velocity (VBT, L-V profile)│  │ Medical: RTP,      │
  │ Sleep        Oura/Eight  duration, stages          │──▶│ sync             │   │   unit,source,ts)│   │ benchmarks/talent         │   │   injury board     │
  │ Manual       check-in, screen, RPE, wellness       │──▶│ /api/signals POST│   │                  │   │ tactical • longevity      │   │ Director: org      │
  │ Workout logs sets×reps×load×RPE×velocity           │──▶│ /api/sessions    │   │ + Session,       │   │ org RBAC (canSeeAthlete)  │   │   rollup, datanet  │
  │ Video        phone pose keypoints                  │──▶│ /api/video       │   │   Macrocycle,    │   │ datanet aggregate+refit   │   │ AI Coach (grounded)│
  │ Nutrition    macros, hydration, weight             │──▶│ (planned)        │   │   Connection,    │   └───────────────────────────┘   └────────────────────┘
  │ Medical      injuries, treatments, screens         │──▶│ (planned/RBAC)   │   │   Org/Team/Member)│           │                                    ▲
  └───────────────────────────────────────────────────┘   └──────────────────┘   └──────────────────┘           ▼                                    │
                                                                                       ▲             ┌──────────────────────────┐                      │
                                                                                       │             │ DATA NETWORK (k-anon)    │  refit norms/calibration│
                                                                                       └─────────────│ shrinkNorm + refitLogistic│─────────────────────┘
                                                                                                     └──────────────────────────┘
```

**Architectural principles (HYBRID, real):**
1. **One Signal shape for everything.** HRV today, force-time tomorrow, blood next — zero new engine types. (`signals.ts` ✅)
2. **Engines are pure & client-agnostic.** Same fatigue/readiness/HPI/VBT run on web and mobile. (`packages/core` ✅)
3. **Source of record = Signals + Sessions + Org graph.** Wearables write Signals without touching engines. (✅)
4. **Privacy by construction.** RBAC by role × data sensitivity × team subtree; RLS in Supabase; private notes. (`org.ts`, RLS ✅)
5. **The refit loop closes.** Outcomes → recalibrate model → norms shrink toward observed. (`datanet.ts` ✅, un-ignited 🟡)

**Biggest architectural debt:** ingestion adapters (force-time CSV, GPS exports, BLE bar sensor, wearable OAuth) and a **canonical load/ACWR materialization** (currently computed ad hoc inside injury.ts rather than stored as derived Signals).

---

## 4. THE COACH OPERATING SYSTEM (ideal daily workflow)

**Personal Trainer (in-person + a few remote)**
- AM: check overnight check-ins (RAG grid); 2 reds → auto-suggested deloads to approve.
- Pre-session: pull client's prescribed session (velocity-aware), tweak in builder.
- In-session: log sets; bar speed auto-stops sets at velocity-loss cap.
- Post: planned-vs-actual auto-logged; quick message + next session auto-drafted.
- Weekly: progress recap auto-generated; billing/renewal nudge.
- *HYBRID today:* logging/prescription/VBT ✅; **builder, messaging, billing, auto-recap ❌.**

**S&C Coach (team)**
- AM: squad RAG wellness grid; load compliance vs plan; availability board.
- Plan: assign periodized microcycle to groups; individualize outliers.
- Training: capture VBT/GPS; live load accumulation vs target.
- Post: ACWR per athlete per metric; flag sweet-spot breaches; notes.
- *HYBRID:* periodize/team-compare/prescription ✅; **RAG grid, group assignment UI, GPS, ACWR dashboard ❌.**

**Sports Scientist**
- Owns testing calendar (CMJ, IMTP, sprint, VO2); reviews force-time quality.
- Maintains baselines/z-scores; investigates Twin driver attributions.
- Builds/curates injury-risk calibration; runs datanet refit.
- *HYBRID:* signals/baselines/twin/refit ✅; **force-plate ingest + test battery scheduler ❌.**

**Head Coach (sport)**
- Wants one screen: who's fresh, who's flagged, who's available — and why, in plain English.
- *HYBRID:* Twin summary + drivers ✅; **squad availability board ❌ (the screen they actually open).**

**Physiotherapist / Rehab**
- Injury intake → RTP protocol with gated stages; prescribe rehab (video); sign-off with audit.
- Tracks asymmetry/ROM convergence to clearance gates.
- *HYBRID:* RTP gates + audit ✅, asymmetry from video ✅; **rehab exercise library + PhysiApp-style delivery ❌, medical-only override gating 🔵.**

**High-Performance Director**
- Org rollup: availability %, injury burden, load adherence, methodology efficacy vs results; board report.
- Cross-squad benchmarking; vendor/data governance.
- *HYBRID:* org-graph + RBAC ✅; **rollup reporting + board export ❌ (🔵).**

---

## 5. THE FC BARCELONA TEST — brutally honest gap analysis

*"If Barça's Head of Performance reviewed this tomorrow, what's still missing?"*

He would respect the model depth immediately — and then refuse to deploy until these exist:

1. **Force-plate ingestion (Hawkin/ForceDecks).** Non-negotiable. CMJ neuromuscular readiness is the daily heartbeat of elite training. **Currently signal kinds only — no force-time ingest or jump battery model.** ⛔ blocker.
2. **GPS/LPS ingestion (Catapult/STATSports) + per-metric ACWR dashboards.** Football performance *is* external load management. **Missing the canonical load screen.** ⛔ blocker.
3. **Squad availability board** (match-day fit/projected, by position). The screen he opens first. ❌
4. **The RAG wellness grid** for the full squad in one view. ❌
5. **Medical-grade data governance:** audit on *every* read, role-segregated medical records, GDPR/Spanish data-protection, configurable consent, on-prem/EU residency. Partial (RBAC + RLS + RTP audit ✅) but **not enterprise-complete.**
6. **Configurability without engineering.** Smartabase wins on infinitely configurable forms/dashboards. **HYBRID is opinionated/hard-coded** — great for SMB, a liability for a club that wants its own metrics. 🔵
7. **Reliability/validity provenance.** Elite staff demand documented test-retest reliability, smallest worthwhile change, CV per metric. **Engines are documented but not clinically validated/published.**
8. **Calendar + planning at squad scale** (travel, fixtures, congestion). ❌
9. **Nutrition + body-composition + sleep environment** integrated (DEXA, gut, chronobiology). ❌
10. **Integrations he already paid for must not be thrown away** — bring-your-own-sensor importer. 🟡

**Verdict:** Barça is a **lighthouse, not a launch customer.** Pursue a **mid-tier pro club / national federation / NCAA program** first; use them to build force-plate + GPS ingest and the availability board; *then* approach a Barça-tier org. Selling top-down now burns 18 months on bespoke integrations.

---

## 6. THE OLYMPIC TEST — federation-wide, all sports

Adopting HYBRID across an entire federation surfaces requirements an athlete-centric build doesn't have:

1. **Sport extensibility framework.** 40+ sports with wildly different demands (archery vs marathon vs judo). Need a **sport-definition layer** (custom tests, metrics, periodization templates) — config, not code. (sport-engine ✅ for 6 sports; **generalize 🔵.**)
2. **Multi-sport benchmarking & talent transfer.** "This rower's profile suggests cross-country skiing potential." (benchmarks ✅; **transfer model 🔵.**)
3. **Anti-doping / whereabouts / ABP awareness.** Biological passport markers, test scheduling, TUE flags. ❌ (compliance-grade.)
4. **Carding/funding decisions.** Objective athlete ranking for funding allocation — must be auditable & contestable. (talent-graph adjacent; **governance 🔵.**)
5. **Centralized vs decentralized coaching.** National staff + personal coaches + club coaches on one athlete — **multi-tenant consent across orgs.** (org-graph single-tenant-ish; **cross-org sharing 🔵.**)
6. **Para-sport classification & adapted norms.** ❌
7. **Quadrennial periodization** (4-year Olympic cycle planning + qualification pathways). (peaking is event-level; **multi-year 🔵.**)
8. **Environmental & travel physiology** (heat/altitude/time-zone load). 🔵 (already flagged in competition-intel "next").
9. **Languages & accessibility** at scale. (i18n EN/PL/DE ✅; **expand 🔵.**)
10. **Data sovereignty per nation** + research/clean-room export for federation scientists. (datanet ✅; **export 🔵.**)

**Verdict:** Olympic federations are the **ideal data-network ignition customer** (many sports, central mandate, willing to standardize) — but require a **configuration layer + compliance layer** HYBRID hasn't built. This is a Series-B motion, not Series-A.

---

## 7. THE a16z INVESTMENT TEST

**Market size.**
- Pro/elite AMS (Smartabase/Kitman/Kinduct tier): small # of seats, high ACV ($50k–$500k+), maybe ~$1–2B addressable.
- Mid-market team/college S&C (TeamBuildr/Bridge/CoachMePlus): tens of thousands of programs, mid ACV — the volume tier.
- Online/PT coaching (Trainerize/TrueCoach/Everfit): **hundreds of thousands of coaches**, low ACV, huge TAM, consumer-adjacent.
- Wearable/consumer (WHOOP/Oura/Strava): tens of millions, but a different (D2C) game.
- **The a16z-shaped story:** start mid-market + serious individual/online coaches (winnable, fast), expand up to elite (ACV) and down to consumer (volume). **One model, every tier** is the expansion narrative.

**Defensibility / Moat.**
- *Weak moats:* the UI, the workout builder, generic dashboards (commoditized).
- *Real moats:* (a) the **Signal ontology + cross-vendor Twin** (schema lock-in + switching cost), (b) the **self-calibrating injury/benchmark model that improves with pooled outcomes** (compounding data-network effect), (c) **integration graph** (every connector raises the switching cost à la Plaid), (d) **org graph** (multi-disciplinary switching cost once a club runs its season on it).

**Network effects.** Present and *designed in* (datanet refit, talent-graph discovery, benchmark shrinkage) — but **un-ignited** (need deployments producing labeled outcomes). **This is the single most important diligence question:** *what is the data flywheel's current velocity?* Today: ~zero. The plan to ignite it is the pitch.

**Data advantages.** The architecture to pool, anonymize, and refit is built (rare). The data itself isn't there yet. **Build = de-risked; data = the bet.**

**AI opportunities.** Grounded copilot, auto-reporting, load optimizer, talent/career forecasting, anomaly attribution. All **grounded in proprietary Twin data** → defensible AI, not wrapper AI.

**Expansion.** Verticals already prototyped: tactical/SOF (✅), longevity/performance-medicine (✅), talent marketplace (✅). Each is a separate TAM on the same core — strong "second act" optionality.

**a16z verdict (simulated):** *"Exceptional engineering and architectural foresight — they built the hard, defensible middle layer first. We'd fund the model and the network thesis. Our concern is go-to-market and data ignition: intelligence without ingestion and live deployments is a beautiful engine with no fuel. Show us 5–10 paying programs, a working wearable + one hardware ingest, and a flywheel producing labeled outcomes, and this is a clear term sheet."*

**Investability:** **High, conditional on capture + commercial proof.** The technical risk is largely retired; the remaining risk is distribution and data ignition — exactly what a Series A funds.

---

## 8. MASTER PRIORITY RANKING

> Ranked for a Series-A-stage company that must (a) become deployable to real programs, (b) ignite the data flywheel, (c) show the AI/moat story.

### 1) MUST BUILD NOW (deployability + flywheel ignition)
1. **Wearable OAuth sync (WHOOP/Oura/Garmin/Apple)** — unblock 🟡 `wearables`. Without auto data, every insight runs on manual entry. *The #1 credibility + retention unlock.*
2. **Workout builder (drag-drop, supersets, templates, copy-week) + exercise video library** — table-stakes for any paying coach; blocks SMB entirely.
3. **In-app messaging + push notifications** — retention table stakes; needs mobile push infra (also unblocks reminders).
4. **Team RAG wellness grid + squad load/ACWR dashboard** — the screens pro/team coaches actually open daily; cheap (data exists) and decisive.
5. **Planned-vs-actual compliance view** — the core of remote coaching value.
6. **Training calendar UI** (Event model exists) — scheduling + recurring + per-group assignment.
7. **AI coach key (ANTHROPIC_API_KEY)** — flip ai-coach from engine-fallback to LLM; the demo-able AI story (low effort, high narrative value).
8. **One hardware ingest path** — pick **VBT bar sensor (vbt-capture)** *or* **force-plate CSV**; ship the first real device loop to prove "capture-agnostic."
9. **Mobile EAS build → TestFlight** — unblock `mobile-preview` (Apple Developer + Expo token); you can't sell a mobile-first product you can't install.

### 2) BUILD NEXT (elite credibility + ACV)
10. **Force-plate ingestion + CMJ/IMTP jump battery model** (if not chosen above) — the elite daily heartbeat.
11. **GPS/LPS ingestion + per-metric load dashboards** — football/rugby/NFL unlock.
12. **Squad availability board** (match-day fit/projected).
13. **Agentic AI copilot** (drafts editable plans, cites data, human-in-loop) — `ai-copilot` 🔵.
14. **Org rollup / board reporting** — enterprise ACV expander.
15. **Structured movement screen + test-battery scheduler** (FMS/ROM/sprint) with reliability/CV provenance.
16. **sRPE + monotony/strain** added to fatigue/twin (trivial, expected).
17. **Billing/payments (Stripe)** for the PT/online tier.
18. **Bring-your-own-sensor generic importer** (CSV + LLM field mapping) — integration-graph moat.

### 3) BUILD LATER (federation/enterprise + second acts)
19. **Configuration layer** (custom metrics/forms/dashboards without code) — required for Smartabase-tier and federations.
20. **Cross-org / multi-tenant consent** (national + club + personal coach on one athlete).
21. **Constrained training-load optimizer** (closed-loop microcycle solver).
22. **Career-trajectory / multi-year (quadrennial) forecasting.**
23. **Federated clean-room export** for federations/research.
24. **Nutrition + body-composition + sleep-environment** modules.
25. **Compliance/medical-grade** (anti-doping/ABP awareness, deeper audit, EU residency, HIPAA/GDPR certifications).
26. **Real-time pitch-side/floor copilot** (live capture + low latency).
27. **Vertical deepening:** tactical/SOF, longevity, talent marketplace (already prototyped — productize when core matures).

### 4) IGNORE (for now)
- **Building proprietary hardware** (sensor/strap/GPS pod) — capital-intensive, commoditizing; *be the model that ingests all of them.* (Revisit only if a capture gap is strategically un-closable via partners.)
- **Consumer social network / feed (Strava-style)** — different game, distracts from B2B2C wedge.
- **Generic habit-tracker breadth** beyond what coaching delivery needs.
- **On-prem for every small customer** — cloud-first; reserve on-prem/residency for marquee enterprise.
- **Chasing FC Barça as a first customer** — lighthouse later; mid-market/federation/NCAA first.

---

## 9. ONE-PARAGRAPH STRATEGIC SUMMARY (for the deck)

HYBRID built the part everyone else bolts on as an afterthought: a **cross-vendor athlete model** — fatigue, readiness, HPI, tissue-level injury risk with a self-calibrating data-network refit, gated return-to-play, velocity-based autoregulated prescription, markerless video fusion, periodization/peaking, talent benchmarking, and a role-aware org graph — all as **pure, tested, shared logic on one Signal ontology, live on web and mobile.** The technical moat (schema lock-in + a compounding outcomes-trained model + an integration graph) is real and largely de-risked. The bet a Series A funds is **ignition: ingestion (wearables + one hardware loop), the daily screens coaches live in (RAG grid, load/ACWR, availability), and 5–10 live programs generating the labeled outcomes that turn the wired flywheel into a spinning one.** Own the model, ingest every sensor, let the network compound — that's the 10x and the defensibility in one sentence.
