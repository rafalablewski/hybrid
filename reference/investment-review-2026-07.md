# HYBRID — Investment Review, July 2026

**Lenses:** Peter Thiel / Founders Fund (contrarian truth, monopoly, power law) and
a16z (wedge, why-now, compounding moat, founder leverage).
**Evidence:** the repo as of `3bccd04` — `packages/core` engines, `apps/web`,
`apps/mobile`, `prisma/schema.prisma`, `capabilities.ts`, `economics.ts`, `access.ts`,
and the 167 API routes.
**Supersedes:** `thiel-investment-memo.md` and `a16z-investment-memo.md` (both written
at the Jul 21 import boundary). This is a re-underwrite, not a restatement — the
question is whether four days of intense work moved either verdict.

> **Caveat on history.** The git clone is shallow (`.git/shallow`, 6 entries); the
> Jul 21 first commit is an import boundary, not the project's birth. Velocity figures
> below describe the visible window only.

---

## 0. The finding that reframes everything

Between the last two memos and today:

| | Jul 21 (memo date) | Jul 25 (now) | Δ |
|---|---|---|---|
| Capabilities **shipped** | 233 | 261 | **+28** |
| Capabilities **planned** | 23 | 20 | −3 |
| Capabilities **blocked** | **30** | **30** | **0** |

77 commits. 210 files changed. +17,363 / −3,348 lines. And the blocked count did not
move by one.

That is not a coincidence, it's a diagnosis. Every one of the 30 blocked items is
gated on an *external* action — a Stripe account, an OAuth credential, a SQL file
pasted into the Supabase editor, a TestFlight verify. None of them is gated on code.
And the 30 blocked items are, almost exactly, the list of things that convert this
from a codebase into a company:

- **Every revenue mechanism** — `full-billing-stripe`, `full-billing-iap`,
  `entitlement-mirror`, `billing`, `social-paid-coaching`. `/api/billing/checkout`,
  `/portal`, `/webhook` and `/iap/verify` all still return **503**.
- **Every capture mechanism** — `wearables`, `apple-healthkit`, `push-notifications`,
  `auth-social`, `social-schema`, `funnel-analytics`.
- **The security floor for any B2B sale** — `schema-tenant-isolation-rls` and
  `schema-deletion-cascade`, both blocked on running `reference/sql-all.sql`.

Meanwhile the +28 shipped in those four days were: nutrition diary edit/delete,
premade meals, food sub-names, exercise anatomy animation, dumbbell tonnage
convention, Today cockpit quick-start, Analytics parity, check-in on Today.

**Excellent consumer-app polish, aimed at a user base of approximately zero.**

Both prior memos said the gating risk was *capture*, not *code*. Four days later the
answer is empirical: given a free choice of what to work on, this team ships more
surface. That is the single most important fact in this review, and neither prior memo
could have known it, because it required a second observation.

---

# Part I — The Thiel Lens

## 1. The seven questions

| | Question | Honest answer |
|---|---|---|
| Engineering | Breakthrough, or incremental? | **Incremental, well-built.** `prescription.ts` fusing fatigue + readiness + progression with a confidence score that rises with log depth (0.45 → 0.95) is genuinely good. It is not 10× better than Fitbod's adaptive engine in a way a user can feel in week one. |
| Timing | Why now? | **Real.** Hyrox, the run-and-lift convergence. The category is inflecting. This is the strongest of the seven. |
| Monopoly | Big share of a small market? | **No.** Zero share of an enormous market. Inverted from what you want. |
| People | Right team? | **Extraordinary throughput, misallocated.** See §3. |
| Distribution | How do you deliver? | **Unanswered.** No funnel instrumentation (`funnel-analytics` blocked — no provider even *chosen*), no push, no social auth, no ASO artifact, no content engine. Chapter 11 of the book is the chapter this company hasn't read. |
| Durability | Defensible in 10 years? | **Only via `datanet.ts`.** Built, k-anonymous at K=5, refits priors toward observed data — and holding zero rows. A flywheel with no first turn is a diagram. |
| Secret | What do you know that others don't? | The plausible one: *labeled state → intervention → outcome records across strength and endurance in the same athlete don't exist anywhere at scale.* That is a real secret. Nothing in the last four days advanced it. |

Two of seven. Founders Fund funds companies that clear five or six.

## 2. Definite versus indefinite optimism

The book's actual distinction: a definite optimist has a *specific plan* — this thing,
this order, this reason. An indefinite optimist believes the future is bright and keeps
options open.

**A 311-item capabilities registry is the purest artifact of indefinite optimism I have
seen in a codebase.** It is not a roadmap; it is an inventory of hedges. 261 shipped
features against no users is not evidence of execution — it is evidence of an unwillingness
to make the bet that would prove the thesis wrong. Breadth feels like progress and
costs nothing emotionally, because nothing can fail.

The power law applies to *effort*, not just returns. One thing matters more than
everything else combined. In this company it is unambiguously: **does a stranger pay
you, and does their data make the model better for the next stranger?** Neither has
been attempted once.

## 3. The founder question

The throughput here is abnormal. In the visible five-day window: ~130k lines of
TypeScript across 797 files, 67 Prisma models, 167 API routes, 1,074 unit tests in 96
files, CI guards enforcing web↔mobile parity and i18n key collapse, a capabilities
registry maintained in the same commit as the features it describes. The engineering
*discipline* is real — the shared-core architecture is the correct Palantir move
(value in the model, not the UI), and it was executed properly.

Read plainly: **this founder has solved build cost.** Whatever the leverage — and the
agent conventions in `CLAUDE.md` suggest a great deal of it — features are no longer
the scarce resource.

Which makes the verdict worse, not better. When code is nearly free, *choosing to spend
your only genuinely scarce resource — attention — on more code* is the revealed
preference of someone avoiding the market test. Building is the comfortable thing. The
uncomfortable thing takes an afternoon: open a Stripe account, paste `sql-all.sql` into
the Supabase editor, ship to TestFlight, and ask ten strangers for $12.99.

The last one is the hard one, which is why 17,000 lines of nutrition diary happened
instead.

## 4. Competition

Competition is for losers — and a €9.99–$12.99/mo freemium fitness subscription
competing with Strava, WHOOP, Fitbod, Strong, TrainingPeaks, MacroFactor, Hevy and
Apple Fitness+ is the most competitive consumer software market that exists. Near-zero
switching costs, CAC set by the Meta auction, and a monetizable-download economics
structure that punishes exactly the "great app, no distribution" profile.

The escape hatch is in the schema, not the app: `Organization` / `Team` / `Membership`,
`CoachLink` with mutual consent, private `CoachNote`, `rtp.ts` for return-to-play. A
single Hyrox gym chain or a university S&C department is a market small enough to
monopolize and rich enough in labeled outcomes to start the flywheel. That's the Thiel
move — start absurdly small, own it completely.

Nothing in the last four days went there either.

## 5. Thiel verdict

**PASS — with the same door open, now on a shorter hinge.**

The prior memo passed on grounds of unproven capture. I pass on stronger grounds: I now
have a *behavioural* observation, not just a snapshot. Given four days and total freedom,
the company built features. The bear case is no longer "they haven't captured yet"; it
is "capture is not what they do."

I would reverse on one piece of evidence, and it is not a feature: **ten paying
strangers and a cohort norm computed from real users.** That is a two-week test. If it
takes a quarter, the answer was no.

---

# Part II — The a16z Lens

## 6. What we underwrite

The bear case above is correct about today and, we think, wrong about the shape of the
opportunity. Three things are genuinely unusual here.

**1. The hard half is done, and it's the half that's normally hand-waved.** Most
"human performance OS" pitches are a deck and a Figma. Here the ontology exists in
Postgres (67 models spanning athlete, org, coach, session, biometric, injury, plan,
nutrition), the decision engine is pure and unit-tested (1,074 tests), and the network
mechanism is written down as code with privacy built in (`datanet.ts`, K_ANON = 5).
Companies usually reach Series A without the ontology settled. This one has it before
seed.

**2. Build cost is solved.** We invest in founders whose iteration loop is faster than
the market's. Whatever leverage produces ~200k lines with parity CI and a maintained
capability ledger in a working week, it is a durable advantage in a category where
incumbents ship quarterly. Post-funding, this converts directly into speed against
Fitbod and Hevy.

**3. The founder writes their own bear case.** `consumer-coaching-master-strategy.md`
argues "the model is not the product — behavior change is." Founders who can hold the
strongest argument against their own company are the ones who survive contact with
customers.

## 7. Where we disagree with the bear case

The pass rests on "they build instead of selling." Fair. But note *what* got built in
the observation window: the check-in on Today, quick-start routines, the nutrition
diary, the exercise anatomy map. Those are not vanity features — they are the
**engagement substrate the data moat requires**. A flywheel that needs daily labeled
state → outcome records needs a daily-open app first. You cannot collect longitudinal
labels from a product nobody opens on a Tuesday.

The sequencing is defensible. It is just being run without a clock or a counter, which
is the actual defect.

## 8. Where we agree, hard

- **The 6% monthly B2C churn in `DEFAULT_ASSUMPTIONS` is the number to stare at.**
  It implies **47.6% gross revenue retention** — against the >90% benchmark stated in
  the file's own `METRIC_GUIDE`. The model fails its own scorecard.
- **The $25 B2C CAC is fiction.** At a 5% assumed paid conversion, a $25 CAC per
  *paying* user implies a ~$1.25 blended install cost. Real fitness CPI runs $3–8, so
  true CAC lands at $60–150. LTV at 6% churn and ~85% margin is ~$184 — so the
  advertised ~7:1 LTV:CAC is realistically **1.2–3:1**. Paid acquisition does not work
  here. Distribution has to be organic, coach-led, or B2B2C.
- **Free-tier design is a gift.** `access.ts` gates HPI behind Full and fails closed
  on unknown personas — correct engineering. But gating your *differentiator* (the
  composite score nobody else has) means free users never experience the reason to pay.
  Give away HPI; charge for depth, history and the coach relationship.
- **RLS is not a to-do, it's a gate.** `schema-tenant-isolation-rls` blocked means no
  team, club or federation can sign — not for procurement reasons, for real ones. It
  unblocks by running one idempotent SQL file.

## 9. The wedge we'd fund

Not "hybrid athletes" broadly. **Hyrox-format gyms and their coaches.** One box, 60–200
members, one coach who already programs run-and-lift in a spreadsheet. `CoachLink`,
`/api/coach/roster`, groups, bulk assignment and Squad Monitor already exist. The coach
is the distribution (solving §Distribution), the roster is the label density (solving
the empty flywheel), and $79/mo Coach Pro is real revenue against a $180 CAC that
actually pencils — a coach doesn't churn at 6%, they churn at 3% and bring their
athletes with them.

Land 10 gyms, not 10,000 downloads.

## 10. a16z verdict

**INVEST — seed, milestone-gated. Recommendation unchanged from the prior memo, but
we tighten the milestones because the observation window revealed the failure mode.**

Conviction on: the ontology, the engine, the founder's build leverage, the why-now.
The risk is not technical and never was. It is that a team this good at building will
keep building.

Milestones for the A, in order:

1. **Week 1** — run `sql-all.sql` (RLS + cascade + indexes). Stripe live, `/checkout`
   returns 200. Pick an analytics provider and wire `track()`.
2. **Week 2** — TestFlight build out; first 10 paying users; `apple-healthkit` verified
   on device so real biometrics flow.
3. **Weeks 3–6** — 3 signed Hyrox gyms, coach seats paid, ≥50 athletes under a coach.
4. **Week 8** — one cohort norm in `datanet.ts` computed from ≥5 real users. The
   flywheel turns once. That is the whole thesis, demonstrated at n=5.

Every one of those is unblocked by a founder action measured in hours, not a sprint.

---

## 11. Where the two lenses agree

They disagree on the verdict and agree completely on the instruction, which is the
useful part:

- The next unit of work should contain **no new features**.
- The 30-item blocked list is the real roadmap; the 261-item shipped list is a sunk
  asset. Stop adding to the second.
- Ship the security floor (`sql-all.sql`) and the revenue path (Stripe) this week —
  both are afternoons, both have been deferred for four days of full-time output.
- Get one non-friend to pay, and one cohort norm computed from strangers.
- Choose the coach/gym wedge over broad consumer, because it fixes distribution and
  label density with one motion.

The company is one afternoon of unglamorous account-creation away from being
investable, and has spent four days not having that afternoon. That is the entire
finding.
