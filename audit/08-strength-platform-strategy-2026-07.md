# HYBRID — Can this become the dominant strength-training platform on earth?

**An adversarial strategy review.** Written as if by a panel of Andrew Chen, Lenny
Rachitsky, Julie Zhuo, Brian Balfour and Shreyas Doshi. Assumes the goal is a
$1B+ outcome, not a lifestyle business. Nothing here is polite.

*Date: 27 July 2026. Sources: the repository at commit `37c9b14`, plus public
market research (linked at the end).*

> **Re-audited 9 August 2026** — see **PART XI — Re-audit (2026-08-09)** at the end.
> Two corrections to this document's own facts (the "5 days" clock was a
> shallow-clone artifact; the real history starts 2026-06-02), and a scorecard of
> which recommendations were taken. Short version: the two 10x bets were taken
> (Verified Record tiers 0–2, Adaptive MRV) plus the Program Efficacy Index; the
> Kill List, the four-destination nav, and everything that touches money,
> analytics, or the public App Store were not.

---

## 0. The one fact that reframes everything else

Before a single feature comparison, three numbers from the repo itself:

| Measure | Value |
|---|---|
| First commit | **2026-07-22** |
| Last commit | **2026-07-27** |
| Total elapsed | **5 days** |
| Commits | 160 (121 authored by an AI agent, 39 by the founder) |
| Lines of TS/TSX | ~135,000 |
| Prisma models | 67 |
| Nav destinations | 34 |
| Capabilities marked `shipped` | **279** |
| Capabilities `blocked` | 30 |
| Real users | **0** |
| Paying customers | **0** |
| Analytics provider connected | **none** (`funnel-analytics` = blocked) |
| Row-level security | **not enabled in production** (`schema-tenant-isolation-rls` = blocked) |

You have shipped 56 "capabilities" per day for five days into a product that no
human being has ever used.

This is the entire strategic problem, and everything below is a consequence of it.

**What you have is not a company. It is a very large, very well-engineered
hypothesis.** Hevy has roughly eight capabilities and fourteen million users. You
have 279 capabilities and zero. That ratio is not a sign of velocity; it is a
sign that the feedback loop that converts code into knowledge has never once
closed.

Shreyas would put it this way: you have confused *artifacts* with *outcomes*.
`capabilities.ts` is a beautifully maintained artifact registry. It measures
work done, not value created. The registry itself is the tell — a company with
users measures retention cohorts, not a list of things it built.

Julie would put it this way: the product has no point of view. A product with a
point of view says *no* to things. This one has a Force Plate screen, a Tactical
/ SOF readiness vertical, a Longevity vertical, a Talent Graph, an Org Graph, a
Competition Intelligence engine, a full nutrition stack with a recipe library,
an email marketing automation platform, an AI agent org with Slack approvals,
and a financials & unit-economics console — before it has one retained user.

Andrew would put it this way: there is no distribution insight anywhere in this
repository. Not one line of code, and not one entry in the capability registry,
answers "how does user #2 hear about this from user #1?"

I will spend the rest of this document being useful rather than repeating that.
But hold it in your head, because it is the answer to most of the questions you
asked.

---

# PART I — COMPETITIVE TEARDOWN

## 1.1 The category's brutal economics

Start here, because it determines whether a $1B outcome is even geometrically
possible in this category.

| App | Scale | Monetization | Implied ARPU |
|---|---|---|---|
| **Hevy** | ~14M registered users; ~400k downloads/mo | ~$600k/mo revenue (Feb 2026); Pro at **$2.99/mo, $23.99/yr, $74.99 lifetime** | **≈ $0.50 / registered user / year** |
| **Strong** | Millions; category-defining since 2011 | ~$4.99/mo / ~$29.99/yr | Low; growth flat |
| **JEFIT** | ~12M+ registered (long tail, high churn) | **$12.99/mo, $69.99/yr** | Moderate, weak retention |
| **Fitbod** | Millions | **$15.99/mo, $95.99/yr** (raised in 2026) | Highest in consumer strength |
| **StrengthLog / FitNotes** | Hundreds of thousands | Free / ad-free | ~$0 |
| **TeamBuildr** | ~thousands of orgs | **$900–$2,800/yr per org** | ~$1,500/org/yr |
| **TrainHeroic** | thousands of coaches | ~$2,400/yr at 101+ athletes | ~$2,000/org/yr |

**Read that table again.** The most successful pure workout logger in the world,
with fourteen million users, generates about seven million dollars a year. That
is a very good lifestyle business and a very bad venture business. At a generous
10x revenue multiple, Hevy — the *winner* of this category — is worth roughly
$70M.

**Conclusion #1: You cannot build a $1B company by being a better Hevy.** Not
"it would be hard." It is arithmetically impossible. Hevy's own success proves
the ceiling. If you executed flawlessly and took 100% of Hevy's users at 2x
Hevy's ARPU, you would have a $150M company.

The $1B outcomes adjacent to strength have all been elsewhere: Peloton
(hardware), Whoop (hardware + subscription), Tonal (hardware), Strava (~$1.5B
at ~135M users — and note Strava also monetizes at roughly $1–2/user/year;
its value is the *graph*, not the ARPU).

**Conclusion #2: A $1B strength software company must monetize somewhere other
than $24/yr consumer logging.** The three doors are:

1. **High-ARPU prescription** ($15–30/mo, Fitbod/MacroFactor economics) — you
   have to be a genuine coach substitute, not a notebook.
2. **B2B2C** (coach/gym/team SaaS at $1–5k/yr per org, with the athlete app as
   the delivery mechanism and the acquisition channel).
3. **Owning an asset other institutions pay to read** — a verified record,
   an outcome dataset, a credential. Nobody has built this. It is the only
   genuine $1B+ door in strength software, and I will argue for it hard in §5.

You have code for all three doors. You have a business model for none of them.

---

## 1.2 App-by-app teardown — and *why* each won or lost

### **Hevy** — the benchmark. Won on *taste and restraint*.

**What it is:** The fastest, cleanest, most pleasant place to write down what you
lifted. Plus a friend feed.

**Onboarding:** Under 60 seconds to a logged set. No account wall before value.
No goal quiz, no experience quiz, no equipment quiz. It asks nothing because it
does not need anything — it is not trying to prescribe.

**Logging speed:** The category standard. Big tap targets, previous-set ghost
values pre-filled, one-tap "same as last time," rest timer auto-starts on set
completion, keyboard never fights you. Everything else is judged against this.

**Design quality:** Restrained, high-contrast, essentially one visual idea
executed consistently. It looks like a tool, not a dashboard.

**Premium:** ~$2.99/mo. Gates: >4 routines, advanced analytics, muscle heatmap,
full history graphs beyond ~12 weeks, warm-up calculator, Apple Watch HR.

**Social:** The real weapon. Follow friends, see their workouts, copy their
routines, kudos, comments. This is Strava's loop applied to lifting, and it is
the single reason Hevy beat Strong.

**Why it won:** Three reasons, in order.
1. **Strong stopped shipping.** Hevy launched into a vacuum left by the incumbent's
   stagnation. Timing, not brilliance.
2. **It shipped the social graph nobody else would.** Strong, JEFIT and FitNotes
   all treated lifting as a solo activity. Hevy treated it as a social one, and
   the follow-graph produced both retention and free acquisition.
3. **It refused to become a platform.** Every quarter Hevy chose *not* to add
   nutrition, not to add running, not to add a coach marketplace, not to add
   periodization. That restraint is why the logging loop stayed fast, and speed
   is the only thing that matters in a product used with sweaty hands between
   sets.

**Its weaknesses — these are your attack surface:**
- **It does not know anything.** It records; it does not prescribe, adapt, or
  warn. No readiness, no fatigue model, no autoregulation.
- **The leaderboard and the social graph are fiction.** Anyone can type 300 kg.
  There is no verification, so competition is meaningless and the social loop
  plateaus at "my four gym friends."
- **Analytics are decorative.** Volume charts and a muscle heatmap. Nothing that
  changes a decision.
- **Weak Apple Watch story.** Persistent complaints, especially on Ultra.
- **Data is a dead end.** Your history sits in Hevy and does nothing for you
  anywhere else.
- **$0.50/user/year.** They are leaving enormous value on the table because their
  product cannot justify a higher price.

---

### **Strong** — the original. Lost on *complacency*.

**What it is:** The 2011-era app that invented the modern lifting log. Still the
most beautiful minimalist logger ever made.

**Why it won originally:** It was first with genuinely good taste. Plate
calculator, rest timer, clean history — it made the paper notebook obsolete.

**Why it lost:** It stopped. Release cadence collapsed, the free tier hardened
(3 routines), the social layer never arrived, and Hevy shipped the same product
plus friends plus a better free tier. Revenue still exists (Q3 2025 revenue was
*up* quarter-over-quarter), which is exactly the trap: a stagnant product with a
loyal base makes just enough money to feel fine while its category is taken.

**The lesson for you:** the moat in this category is not features. Strong had
every feature Hevy had. Strong lost because it did not ship a growth loop.

---

### **JEFIT** — the most features. Lost on *incoherence*.

**What it is:** Enormous exercise database (5,000+), extensive analytics, a
community, AI-assisted programming, Apple Watch, and $12.99/mo pricing.

**Why it should have won:** It has been around since 2010, has 12M+ registered
users, and objectively has more capability than Hevy.

**Why it didn't:** Every screen is a compromise between four audiences. Cluttered
IA, dated visual language, aggressive upsells, ads in the free tier, and a
logging flow that is measurably slower than Hevy's. Users describe it as "the
one with everything, that I don't enjoy opening."

**JEFIT is the single most important competitor for you to study, because JEFIT
is what HYBRID is currently on track to become.** More features than anyone,
loved by no one, monetizing at a premium price against a product that cannot
justify it. JEFIT is the cautionary tale of exactly your strategy: capability
maximalism.

---

### **RepCount** — indie, iOS-native, lost on *distribution*.

Beautiful native-iOS execution, great Watch app, sane pricing. Small team, no
growth loop, no social graph. A well-made product that nobody hears about. It is
proof that craft alone does not distribute.

---

### **GymBook** — lost on *platform narrowness and cadence*.

iOS-only, old-school skeuomorphic feel, slow releases. Retains a small devoted
base. Irrelevant to your strategy except as evidence that iOS-only + no social =
ceiling of ~100k users.

---

### **Setgraph** — the sharpest small competitor. Won a niche on *one idea*.

**What it is:** Fast logging with a genuinely better data-visualization angle.
~$59.88/yr. Smaller exercise DB, iOS-focused.

**Why it matters:** Setgraph is the correct *shape* of a competitor — it picked
one axis (visualization) and beat the incumbent on it rather than trying to beat
it on everything. That is the strategy you should be running and are not.

**Its ceiling:** visualization is not a moat. Hevy can copy a chart in a sprint.

---

### **FitNotes** — Android's beloved free logger. Won *hearts*, not a market.

Free, ad-free, offline, ugly, permanent. Power users adore it. It monetizes at
zero by design. Relevant to you only as a floor: the *baseline utility* of
logging is worth $0 to a meaningful slice of the market. Any value you capture
must be above that line.

---

### **Gym Life** — a template-and-social clone. Undifferentiated.

Rides the same loop Hevy does with worse execution. Nothing to learn except that
cloning the social logger is now a commodity strategy with no room left.

---

### **StrengthLog** — won a *vertical*.

Free-and-generous, powerlifting-focused: meet prep, attempt selection,
competition-day mode, Wilks/DOTS totals. Beloved by a specific tribe.

**The lesson:** owning a vertical deeply beats owning the middle broadly. This is
the closest thing in the category to the strategy I will recommend to you — pick
a tribe, be indispensable to it, expand outward. StrengthLog's failure is that it
never monetized and never extended past its tribe.

---

### **StrongLifts 5×5** — the best *acquisition* story in the category.

**What it is:** An app wrapped around a single free program that ranked #1 on
Google for "beginner strength program" for a decade.

**Why it won:** Content-led acquisition. Mehdi wrote the definitive beginner
guide; the app was the conversion surface. Millions of installs at near-zero CAC.

**Why it stalled:** The program is the product, and users outgrow the program in
6–12 months. Retention is structurally capped by the fact that graduating from
5×5 means graduating from the app.

**The lesson for you — and this is the most actionable competitive insight in this
document:** StrongLifts proves that in strength training, *the program is the
acquisition channel*. Not ads. Not virality. The program. People search for a
program, adopt it, and the app that hosts it acquires them for free. You have
19 goals and a discipline-shaped plan engine and you are not using a single one
of them as a distribution asset.

---

### **MacroFactor Workouts** — the most dangerous competitor you have. Launched Jan 2026.

**What it is:** Greg Nuckols and Eric Trexler (Stronger by Science) extended
MacroFactor — already the most respected nutrition app among serious lifters —
into strength training. 900+ exercises, 638 of them with demo videos recorded by
Jeff Nippard.

**Why this is the threat:**
1. **They already have the highest-trust brand in evidence-based lifting.** Nuckols
   and Trexler are the people that serious lifters cite in arguments.
2. **They already have the paying user base.** MacroFactor users pay $6–12/mo and
   *stay*, because MacroFactor's adaptive expenditure algorithm is a genuine
   scientific product, not a UI.
3. **They already have the distribution:** Stronger by Science's audience, plus
   Jeff Nippard's ~5M subscribers baked into the exercise library.
4. **They have the right thesis.** MacroFactor won nutrition by making
   *expenditure* an adaptive per-person estimate instead of a formula. They will
   do the same to training: adaptive per-person *recoverable volume*.

**This is precisely the "operating system for strength" position you want, being
taken by the team best positioned to take it, with distribution you don't have.**

If HYBRID has an existential competitor, it is not Hevy. It is MacroFactor.

---

### The coach/team tier — **TeamBuildr, TrainHeroic, Bridge, Volt**

You have `squad-monitor`, `team-compare`, `org-graph`, `coach-program-builder`,
`tactical-vertical`. So you are, whether you meant to or not, competing here.

| | Price | Moat |
|---|---|---|
| TeamBuildr | $90–$280/mo per org (up to 1,000 athletes), unlimited coaches | Workflow habit + AD/admin relationships + 24/7 human support |
| TrainHeroic | ~$2,400/yr at 101+ athletes | Marketplace of branded programs |
| Bridge Athletic | Higher, enterprise | Pro/college relationships, integrations |
| Volt | Per-seat | AI programming, HS/college |

**Why these win:** none of it is product. It is **relationships, procurement
cycles, and switching cost measured in a coach's season.** A college S&C coach
does not switch platforms mid-season for any feature. They switch when a peer
recommends it at a conference, when the budget cycle opens, and when the
migration is done for them.

**What this means for you:** your Squad Monitor and Org Graph will not win a
single college program on merit. That market is sold, not shipped. And it is
absolutely not winnable by a pre-revenue team in parallel with a consumer app.

---

## 1.3 Competitive scorecard

Scores are 0–10. **HYBRID is scored on what a user would actually experience
today**, not on what the code contains. This distinction is the point.

### Logging loop — the thing that decides everything

| | Usability | Polish | Speed | Innovation | Usefulness | Delight | Retention impact |
|---|---|---|---|---|---|---|---|
| Hevy | 10 | 9 | **10** | 5 | 9 | 8 | **10** |
| Strong | 9 | 9 | 9 | 3 | 8 | 7 | 7 |
| JEFIT | 6 | 5 | 6 | 6 | 8 | 4 | 5 |
| Setgraph | 8 | 8 | 9 | 6 | 7 | 7 | 7 |
| FitNotes | 7 | 3 | 9 | 2 | 7 | 3 | 6 |
| StrengthLog | 8 | 7 | 8 | 5 | 7 | 6 | 6 |
| MacroFactor W. | 8 | 9 | 8 | 8 | 9 | 7 | 8 |
| **HYBRID** | **6** | **8** | **?** | **8** | **8** | **7** | **?** |

HYBRID's "?" on speed and retention is not diplomacy. **It is unmeasured.** You
have no analytics provider connected, so you literally cannot answer the only two
questions that matter. Meanwhile your logger carries per-set velocity fields,
RPE, warm-up flags, modality-aware inputs and live session math — every one of
which is a keystroke between a user and their next set. The most likely truth is
that your logger is *slower than Hevy's*, and that alone would be fatal.

### Onboarding

| | Usability | Polish | Speed | Innovation | Usefulness | Delight | Retention impact |
|---|---|---|---|---|---|---|---|
| Hevy | 10 | 9 | 10 | 3 | 7 | 6 | 9 |
| Fitbod | 8 | 9 | 6 | 7 | 9 | 7 | 8 |
| Strong | 9 | 8 | 9 | 2 | 6 | 5 | 7 |
| JEFIT | 5 | 4 | 5 | 4 | 6 | 3 | 4 |
| **HYBRID** | 6 | 8 | **4** | 7 | 8 | 7 | 5 |

You ask persona, goal (from 19), experience, days/week, equipment, session length
— before value. Fitbod earns that right because the output is a *complete
generated workout you start immediately*. You must earn it the same way or cut
it. Guest mode (`guest-first-workout`) is the correct instinct and should be the
**default**, not an alternative path.

### Programming & prescription

| | Usability | Polish | Speed | Innovation | Usefulness | Delight | Retention |
|---|---|---|---|---|---|---|---|
| Fitbod | 9 | 9 | 9 | 8 | 8 | 7 | 8 |
| MacroFactor W. | 8 | 9 | 7 | **9** | **9** | 7 | **9** |
| Boostcamp | 8 | 7 | 8 | 6 | 8 | 6 | 7 |
| JEFIT | 6 | 5 | 6 | 6 | 7 | 4 | 5 |
| Hevy | 5 | 8 | 8 | 2 | 5 | 5 | 5 |
| **HYBRID** | 6 | 8 | 5 | **9** | **9** | 6 | **8 (potential)** |

**This is your strongest column and you should have noticed.** The
discipline-shaped plan model — where a PlanProgram declares its discipline and
that selects its structure, loading unit, volume metric and progression, so an
Olympic weightlifting cycle renders as %1RM/NL and a 5K block renders as
distance/pace, in one consistent layout — is a genuinely superior data model to
anything shipping. Fitbod cannot represent an Olympic peaking cycle. Hevy cannot
represent a running block. You can represent both, correctly, in one object.

That is a real insight and it is buried under 270 other things.

### Analytics & progress

| | Usability | Polish | Speed | Innovation | Usefulness | Delight | Retention |
|---|---|---|---|---|---|---|---|
| Hevy | 8 | 8 | 9 | 4 | 6 | 6 | 6 |
| JEFIT | 6 | 5 | 6 | 6 | 8 | 4 | 5 |
| Setgraph | 8 | 8 | 8 | 7 | 8 | 7 | 7 |
| Strong | 7 | 8 | 8 | 3 | 6 | 5 | 5 |
| **HYBRID** | **4** | 8 | 5 | **9** | **8** | 6 | 6 |

You have Statistics, Analytics, Volume, Trends, Exercises, Performance, Endurance,
Velocity, Force plate, Video and History as **eleven separate destinations**.
Hevy has one. Usability 4 is generous. Nobody can hold eleven analysis surfaces
in their head; the practical effect is that users find none of them.

Innovation 9 is earned though: bodyweight-aware tonnage (10 bodyweight pull-ups
at 70 kg = 700 kg of work), dumbbell tonnage counting both bells, exercise-name
canonicalization propagating through every historical summary, one local-day key
app-wide. **These are correctness details that every competitor gets wrong**, and
they are the sort of thing serious lifters notice and evangelize. They are worth
more to you as three marketing claims than as 200 features.

### Social & growth loops

| | Usability | Polish | Speed | Innovation | Usefulness | Delight | Retention |
|---|---|---|---|---|---|---|---|
| Hevy | 9 | 9 | 9 | 6 | 8 | 8 | **9** |
| Strava (ref.) | 9 | 9 | 9 | 7 | 8 | 9 | **10** |
| JEFIT | 5 | 4 | 5 | 4 | 5 | 3 | 4 |
| StrengthLog | 4 | 6 | 7 | 3 | 4 | 4 | 3 |
| **HYBRID** | **3** | 7 | ? | 6 | 5 | 6 | **2** |

**`social-schema` is BLOCKED.** The SQL has not been run. Your feed, follow
graph, kudos, leaderboard, coach marketplace, profiles and reviews are all code
sitting on tables that do not exist in production. The single highest-leverage
retention and acquisition system in the category is *written but not switched
on*. That is the clearest possible illustration of the problem: capability
inflation without a launch.

### Integrations & hardware

| | Apple Watch | HealthKit | Widgets | Live Activities | Wearables | VBT |
|---|---|---|---|---|---|---|
| Hevy | 6 (HR only, complaints) | 7 | 7 | 6 | 4 | 0 |
| Strong | 7 | 7 | 6 | 4 | 3 | 0 |
| JEFIT | 7 | 7 | 5 | 3 | 4 | 0 |
| Fitbod | 7 | 8 | 6 | 5 | 5 | 0 |
| **HYBRID** | **0** | **0 (blocked)** | **0** | **0** | **0 (blocked)** | **3 (manual entry)** |

**This is your worst table and it is table stakes.** No widget. No Live Activity.
No Watch app. HealthKit unverified. Wearable OAuth uncredentialed. Meanwhile you
have a Force Plate CSV ingest screen.

A Live Activity showing the rest timer on the lock screen is worth more to
retention than the Talent Graph, the Org Graph, the Tactical vertical and the
Longevity vertical combined. It is also roughly 1% of the work.

### Business readiness

| | Billing live | Analytics | Push | RLS | App Store |
|---|---|---|---|---|---|
| Every competitor | ✅ | ✅ | ✅ | ✅ | ✅ |
| **HYBRID** | ❌ blocked | ❌ blocked | ❌ blocked | ❌ blocked | ❌ not listed |

You cannot take money, cannot measure behaviour, cannot re-engage a user, are not
tenant-isolated, and are not on the store. Every one of these is blocked on a
credential or a SQL script — hours of work, deferred for weeks while 279
capabilities shipped past them.

---

# PART II — PRODUCT ANALYSIS

## 2.1 Is HYBRID another workout tracker, or an operating system for strength?

**Today: neither.** It is a *simulation* of an operating system for strength —
architecturally complete, behaviourally untested, commercially inert.

Let me be precise, because the distinction matters and there is real value here.

### What genuinely distinguishes this codebase

These are not small things, and I want to say them plainly before I take the rest
apart:

1. **The shared-core architecture is right and rare.** ~49k lines of pure,
   tested, platform-free domain logic in `packages/core`, consumed identically by
   Next.js and Expo, with parity enforced in CI. Most teams at Series B do not
   have this. It means a feature genuinely ships to both clients at once, and it
   means the engines are testable without a UI. 106 test files is real discipline.

2. **The discipline-shaped plan model is a genuine product insight.** The
   recognition that "exercise – sets × reps – rest – RPE" is the *wrong shape* for
   most training, and that a plan should declare a discipline which then selects
   its loading unit, volume metric and progression, is a better abstraction than
   any competitor has. Fitbod cannot express a peaking cycle. Hevy cannot express
   a running block. This model can express both in one consistent render.

3. **The measurement correctness details are evangelism-grade.** Bodyweight-aware
   tonnage, both-bells dumbbell tonnage, name canonicalization propagating
   backwards through history, one local-day key everywhere. Serious lifters argue
   about exactly these things on Reddit. Each is a tweet that acquires users.

4. **The signal ontology and Performance State** are the right *foundation* for a
   digital twin — a typed signal graph rather than ad-hoc columns.

That is four real assets. Four. Not 279.

### Why it is not yet an operating system

An operating system has three properties, and you have none of them:

**(a) Other things run on top of it.** An OS is defined by what it hosts. Nothing
runs on HYBRID. There is no API for third parties, no import from Hevy/Strong,
no export anywhere meaningful, no way for a coach's business, a gym's equipment,
a competition organizer or another app to build on your record. You have built a
very large *application*, which is the opposite of a platform.

**(b) It holds a system of record that costs something to leave.** Right now
leaving HYBRID costs a user exactly what leaving Hevy costs: a CSV they'll never
open. There is no accumulating asset in a user's account that gets more valuable
the longer they stay *and* is worthless anywhere else.

**(c) Its data improves with use, for everyone.** `datanet.ts` describes exactly
this — cohort norms with k-anonymity, priors refitting toward observed data, the
injury model recalibrating on labeled outcomes. It is well-written. It is
currently aggregating **zero observations** and calibrating on **zero labeled
outcomes**. `injury-personalization` fits per-athlete ACWR spike onsets from data
that does not exist. HPI fuses a "recovery" pillar from wearables that are not
connected.

**Every moat in this repository is a moat-shaped hole.** The pipes are laid and
nothing is flowing through them. That is not a criticism of the engineering —
the engineering is good. It is a criticism of sequencing: you built the
compounding layer before the thing that compounds.

### The honest classification

> HYBRID is currently a **JEFIT-shaped risk with a MacroFactor-shaped
> opportunity.** It has JEFIT's disease (capability maximalism, incoherent IA,
> too many audiences) and MacroFactor's latent advantage (a genuinely better
> model of the domain than anyone else has). Which one it becomes is decided
> entirely by what you delete in the next 30 days.

---

# PART III — FEATURE GAPS

## 3.1 Table Stakes — you are behind on these, today

Every one of these exists in Hevy. Several exist in *all eleven* competitors.
Shipping these is not progress; it is catching up. But you cannot skip them.

| Gap | Status | Why it's fatal to lack | Effort |
|---|---|---|---|
| **App Store listing** | Not listed | You do not exist as a product | Days |
| **Working payments** | `full-billing` blocked | Cannot take money | Days |
| **Product analytics** | `funnel-analytics` blocked | Cannot learn anything, ever | Hours |
| **Row-level security enabled** | blocked | You are one bug from a breach; also blocks any B2B sale | Hours (SQL script exists) |
| **Push notifications** | blocked | Category retention leans on reminders | Days |
| **Apple Watch app** | absent | Table stakes since 2018 | Weeks |
| **HealthKit read/write** | unverified | Rings/Fitness integration is expected | Days |
| **Home-screen widget** | absent | Free daily impression | Days |
| **Live Activity (rest timer)** | absent | Highest delight-per-line-of-code in category | Days |
| **Import from Hevy / Strong / CSV** | absent | *Nobody switches trackers without their history* | Days |
| **Exercise demo videos** | blocked | MacroFactor has 638 Nippard videos | Licensing |
| **Working social graph** | `social-schema` blocked | Your only growth loop is switched off | Hours (SQL script exists) |
| **Plate calculator on the set row** | partial | Universal in category | Hours |
| **Logging speed measured & beating Hevy** | unmeasured | The only feature that matters | Weeks |

**The import gap deserves its own paragraph.** The number one reason a lifter does
not switch trackers is two years of history. Hevy exports CSV. Strong exports
CSV. Building a one-tap importer that reconstructs someone's full history,
recomputes their PRs with *your* correct bodyweight/dumbbell tonnage, and shows
them a "here's what your last two years actually looked like" Wrapped — that is
simultaneously your switching mechanic, your differentiation demo, and your best
share asset. It is maybe two weeks of work. It is not on your roadmap.

---

## 3.2 Differentiators — few competitors have these; they would move your numbers

| Feature | Who has it | Why it matters for you |
|---|---|---|
| **Autoregulated load from readiness** | Almost nobody (Fitbod partially) | You have `readiness-load-adjust` shipped. This is a real, felt, daily differentiator — *the app changed my sets because I said I slept badly*. Market it as the headline, not as a setting. |
| **Adaptive per-athlete MRV** | **Nobody** | See §3.4 — this is your MacroFactor moment. |
| **Discipline-shaped programs (lift + run + swim in one plan)** | Nobody credibly | The actual "hybrid athlete" thesis. Hyrox is the fastest-growing mass-participation sport on earth and has no software home. |
| **Verified PRs** | Nobody | Makes every leaderboard in the category obsolete. See §3.5. |
| **Program efficacy data** | Nobody | "This program produced +14 kg squat in 12 weeks for lifters like you, n=8,400." |
| **Exercise-name canonicalization** | Nobody | Small, deeply loved by power users. |
| **Bodyweight/dumbbell tonnage correctness** | Nobody | Same. Free credibility. |
| **Offline-first, never lose a workout** | Few | Gym basements. Real. Market it. |
| **Coach ↔ athlete in one app** | TrainHeroic (clunky) | Your `coach-client-invite` is the seed of a B2B2C loop. |
| **Wrapped / share cards** | Hevy (weak) | Yours are better. Make them *verified* and they become acquisition. |

---

## 3.3 Elite Features — what makes a national coach or a college program switch

Be clear-eyed: **features do not win this market, relationships do.** But these
are the features without which you cannot even get the meeting.

| Feature | Why elite coaches require it |
|---|---|
| **Athlete compliance at a glance, across 60 athletes, in under 10 seconds** | The only screen a college S&C coach opens daily. Yours is `squad-monitor`; it must be ruthlessly better than TeamBuildr's, not equal. |
| **Programming in a spreadsheet-speed grid** | Coaches write programs in Excel. Any builder slower than Excel is dead on arrival. Your `coach-program-builder` must accept a paste from Excel. |
| **Autoregulation with coach-set guardrails** | Coaches will not let an algorithm change loads. They will let it *suggest within a band they define*. This distinction is the entire sale. |
| **Velocity as first-class, from real hardware** | GymAware/Perch/Vitruve/Output integration. Your `vbt-capture` is blocked on exactly this. Perch alone has NFL/NBA/NCAA placements — integrating is a distribution channel, not just a feature. |
| **Force plate + jump testing (already ingested)** | You have CSV ingest. Elite programs live on CMJ/RSI trends. This is real. |
| **Return-to-play protocols with medical hand-off** | You have `rtp`. This is the single feature athletic trainers pay for. |
| **Exportable, auditable athlete records** | For NCAA compliance, insurers, and medical staff. Nobody does this well. |
| **SSO / roster sync / SIS integration** | Procurement blocker. Boring. Mandatory. |
| **Offline weight-room mode on shared iPads** | Weight rooms have terrible wifi. TeamBuildr wins on this. |

**Blunt assessment:** you should not build any of these in the next 12 months
except as a *consequence* of a specific design partner who has signed something.
Building elite features speculatively is how a consumer company dies.

---

## 3.4 10x Features — first principles, no AI gimmicks

Rules I applied: it must (a) not exist anywhere, (b) create a moat that survives
a competitor copying the UI, (c) be buildable by a small team, (d) get stronger
with scale.

---

### **10x-1. The Verified Strength Record — a portable, attested athletic identity**

**The observation:** Strava owns "I ran it." Nobody owns "I lifted it." Every
strength number on the internet — every leaderboard, every recruiting profile,
every coach's client roster, every online meet, every gym's board — is
self-reported and therefore worthless. There is no strength equivalent of a
verified time.

**The product:** every logged set carries an **attestation tier**:

| Tier | Evidence | Trust |
|---|---|---|
| 0 — Claimed | typed | none |
| 1 — Sensed | phone/watch IMU rep signature matches the claimed load profile | low |
| 2 — Witnessed | a second HYBRID user present at the same time/place co-signs | medium |
| 3 — Recorded | on-device video with lift detection + plate count from the frame | high |
| 4 — Instrumented | bar sensor / force plate / gym-mounted camera | very high |
| 5 — Sanctioned | a federation meet, a Hyrox result, a combine | absolute |

The record is cryptographically signed, append-only, exportable, and **readable by
third parties via API**.

**Why this is a $1B primitive and not a feature:**
- **It inverts switching cost.** Leaving Hevy costs a CSV. Leaving HYBRID costs
  your *credential* — the thing recruiters, coaches, competitions and insurers
  read. Nobody rebuilds a verified two-year record elsewhere.
- **It is a two-sided network.** Athletes want verification because institutions
  read it; institutions read it because athletes have it. Classic cold-start,
  and solvable with the tribe strategy in §6.
- **It creates the first real leaderboard in strength.** Every competitor's
  leaderboard is a lie. Yours would be the only true one, and truth is not
  copyable by shipping a UI.
- **It is the enterprise wedge.** College recruiting, tactical selection (military
  and fire/police entrance standards), insurance underwriting, corporate wellness
  verification — all of them currently rely on in-person testing days because
  there is no trustable remote record.
- **Competitors structurally cannot follow.** Hevy's entire value proposition is
  frictionless self-report. Adding attestation would make their core loop slower
  and would retroactively devalue every number their 14M users already entered.
  This is a genuine "why hasn't the incumbent done this" answer.

**Cold start:** Tier 2 (witnessed) is the killer, because it is free and social.
Two lifters at the same gym co-sign each other's PRs. That is *also* a viral loop:
verifying your friend requires your friend to be on HYBRID.

---

### **10x-2. Adaptive Recoverable Volume — the MacroFactor move, applied to training**

**The observation:** MacroFactor beat every nutrition app by refusing to use a
formula for energy expenditure and instead *estimating it per person from
observed weight-and-intake data*, updating weekly. It is the only genuinely
adaptive model in consumer fitness, and it is why people pay $12/mo and stay.

Training has the identical, unexploited opportunity. Every app today prescribes
volume from a table: MEV/MAV/MRV landmarks, 10–20 sets per muscle per week,
population averages. **Your own `volume-landmarks` engine does exactly this — it
uses the textbook numbers.** But recoverable volume is *wildly* individual and
*observable*: performance across a mesocycle, set-to-set fatigue within a
session, session-to-session e1RM drift, soreness reports, sleep.

**The product:** estimate each athlete's *personal* MRV per muscle group, per
training age, updating weekly from their actual response, with a stated
confidence interval — and show the estimate changing. "Your chest MRV is now 17
sets/week, up from 14 six weeks ago (±2)." Then program *to the estimate*.

**Why it is a moat:**
- The estimate requires **longitudinal within-person data**, which cannot be
  bought, scraped, or shipped. It takes 12+ weeks per athlete to produce one
  useful signal.
- It compounds across users through the prior: with 100k athletes you can
  initialize a new user's MRV prior from cohort data, so *your day-1 estimate is
  better than a competitor's day-90 estimate*. That is a textbook data moat and
  it is the one thing in `datanet.ts` that would actually be true.
- It converts your product from "records what you did" to "knows what you can
  handle," which is what justifies $15–30/mo instead of $2.99.
- Every serious lifter already argues about MRV. You would be the first app with
  an *answer*.

You have the entire foundation — fatigue engine, volume landmarks, effort model,
signal ontology, per-lift progression. You have implemented the population
version. **Replace the table with an estimator.** That is the single highest-value
engineering task in the repository.

---

### **10x-3. Equipment Identity — QR-anchored machines and a normalized load graph**

**The observation:** "Leg press 200 kg" is meaningless. It depends on the
machine's lever arm, carriage weight, cable ratio and stack increment. Every
strength dataset on earth — including yours — is polluted by this, and it is the
reason cross-gym comparison, cross-machine progression and true strength
standards do not exist. It is a *measurement* problem masquerading as a data
problem.

**The product:** every machine and rack gets an identity (QR sticker or scanned
photo). Scan it → the app knows the make, model, cable ratio, carriage tare and
stack increment, and normalizes your logged load to **actual force at the hands**.
Your history becomes gym-portable. Travelling to a different gym stops resetting
your progression. Machines get a canonical "hardest/easiest" calibration from
aggregate user data.

**Why it is a moat:**
- It is a **ground game** — a physical asset built gym by gym, exactly like
  Foursquare's venue database or Google's Street View. Not copyable by shipping
  code.
- It creates a **physical acquisition loop**: the sticker is on the machine, in
  front of every member of that gym, forever. That is free distribution inside the
  exact place your user already is.
- It is the **gym B2B wedge that isn't SaaS-sales**: gyms want equipment
  utilization data and get it free by hosting your stickers.
- It makes the strength standards in 10x-1 and the MRV estimates in 10x-2
  *actually correct*, which nobody else's are.

---

### **10x-4. Silent logging — win by removing the loop, not by speeding it up**

**The observation:** Hevy's moat is that logging is fast. You cannot beat a
speed moat by being 15% faster. You beat it by making the activity unnecessary.

**The product:** watch IMU + phone-in-pocket + optional earbud motion detects set
start, rep count, tempo, and rest boundaries. The athlete confirms *by exception*
at the end of the set (weight only, one tap) or at the end of the session
(review a pre-filled log). Target: **a full session logged with fewer than five
total taps.**

**Why it is a moat:**
- Rep-detection accuracy across exercises requires a large **labeled** dataset of
  motion traces paired with confirmed logs. Every user who confirms a
  pre-filled set is labeling training data. That is a self-reinforcing loop that
  gets monotonically better and cannot be bootstrapped by a competitor.
- It is the only credible answer to "why would a Hevy user switch?" *Because you
  stop taking your phone out.*
- It converts the Watch app from table stakes into the primary surface.

---

### **10x-5. The Program Efficacy Index — evidence replaces influencers**

**The observation:** program selection is the highest-stakes decision a lifter
makes and it is made entirely on vibes, YouTube personalities, and forum lore.
Nobody has *ever* published: this program, run by people like you, produced this
much strength.

**The product:** every program in your library carries a live efficacy card —
median 12-week e1RM delta by lift, by training age, by sex, by adherence band,
with n and dropout rate. Programs are *ranked by outcome*. Coaches' programs in
the marketplace carry the same card. So do coaches themselves.

**Why it is a moat:**
- It requires **thousands of athletes × twelve weeks × labeled adherence**. It
  cannot be faked, bought, or shipped. It is the purest form of "impossible to
  copy without the users."
- It is enormous, permanent **content/SEO**: "the 47 most effective strength
  programs, ranked by measured outcome" is a page the entire internet links to,
  and it is generated automatically by your own database. This is StrongLifts'
  content-acquisition strategy, but with a defensible asset instead of one man's
  blog post.
- It makes your coach marketplace *rankable by results*, which turns it from a
  directory (worthless — Instagram already exists) into a trust utility (very
  valuable).
- It inverts the influencer economy in your favour and creates a permanent
  news cycle.

---

### **10x-6. The Spotter Protocol — the two-person primitive**

Small, cheap, and the most viral thing you could build. Lifting is one of the few
activities with a *structurally necessary second person*: the spotter. Nobody has
ever built software for that relationship.

Two phones/watches present → tap to pair → the spotter's device co-signs the set,
counts assisted reps separately from unassisted, and captures the video from the
right angle. The spotter gets credit on the feed ("spotted by @x").

**Why it matters:** every serious PR attempt already requires a second human, and
that human is currently outside your product. This is a growth loop that lives
inside the physical ritual rather than being bolted onto it — and it is the
free bootstrap for the attestation tiers in 10x-1.

---

## 3.5 What I would explicitly NOT build (the Kill List)

Ordered by how much damage each one is currently doing.

| Kill | Why |
|---|---|
| **The Tactical / SOF vertical** | Zero consumer users. Government/military sales cycles are 18–36 months and require FedRAMP-class compliance you cannot carry. This is a *different company*. |
| **The Longevity / performance-medicine vertical** | Different buyer, different regulatory surface, different brand. Function Health and Superpower are funded and ahead. Not your fight. |
| **Talent Graph** | Recruiting is a relationship market with entrenched incumbents. Meaningless without the verified record from 10x-1 — and *with* it, it builds itself later. |
| **Org Graph / Team Operating System** | You are pre-revenue building enterprise multi-tenancy. TeamBuildr wins on relationships. Delete, or spin out after 100k consumers. |
| **Competition intelligence + peaking optimizer** | Serves maybe 0.1% of users. Beautiful engineering, no market. |
| **Video intelligence / markerless motion analysis** | Real ML cost, real accuracy risk, and the credible players (Perch, Output, Uplift, Onform) are hardware-adjacent. Buy or integrate, never build. |
| **Force plate CSV ingest** | ~5,000 institutions worldwide own force plates and all of them already have Hawkin/VALD software. |
| **The full nutrition stack (recipes, barcode, label scan, meal library, food DB)** | You are fighting MyFitnessPal *and* MacroFactor with a side feature. MacroFactor will beat you at nutrition and is now coming for training. Do not fight on their ground. Integrate with MacroFactor instead — genuinely. |
| **The AI agent org, Slack approvals, scheduled agent runs, admin Engine Room** | Internal tooling for a company of one. Pure cost. |
| **Email marketing automation platform (campaigns, sequences, enrollment, suppression)** | You built Customer.io. Buy Customer.io. |
| **Financials & unit-economics console** | Modelling the economics of a business with zero revenue. This is the purest expression of the problem. |
| **CMS: media library, localization manager, feature flags, announcements, moderation queue** | Infrastructure for a company at 10M users. You have 0. |
| **i18n in EN/PL/DE before product-market fit** | Triples every copy change. Ship English. Localize when a market pulls you. |
| **Two light themes + Liquid Glass + three palettes** | Aesthetic churn is not product work. One theme, executed perfectly. |
| **The 34-destination navigation** | See §4. This is actively destroying your usability. |

Rough estimate: **the Kill List is 60–70% of the codebase.** Deleting it would
make the product better, not worse — and would make the remaining 30% ship
faster forever.

---

# PART IV — MOAT ANALYSIS

Scored on what exists **today** versus what is **achievable in 24 months** with
focus.

| Moat | Today | Achievable | Notes |
|---|---|---|---|
| **Network effects** | **0/10** | 8 | `social-schema` is blocked; the graph does not exist. Attestation (10x-1) + Spotter (10x-6) are genuine two-sided loops. |
| **Data moat** | **0/10** | **9** | `datanet.ts` aggregates zero observations. Adaptive MRV (10x-2) + Program Efficacy (10x-5) are the only true data moats in the category, because both require longitudinal within-person data. |
| **AI moat** | **1/10** | 4 | Wrapping Claude is not a moat; every competitor has the same API key. The moat is the *proprietary training data* the model reasons over, not the model. |
| **Community moat** | **0/10** | 7 | No community. Achievable only by picking one tribe (§6). |
| **Coach ecosystem** | 2/10 | 7 | Marketplace code exists, billing blocked, zero coaches. Coaches are a *distribution* channel (each brings 30–200 athletes) before they are a revenue line. |
| **Hardware integrations** | **0/10** | 6 | Integrate (Perch, GymAware, Output, Vitruve); never build. Each integration is a channel into institutions. |
| **Wearables** | **0/10** | 5 | Blocked on OAuth credentials. Commodity — everyone will have it. Not a moat, but a table stake. |
| **Velocity tracking** | 3/10 | 7 | Engine written, capture blocked. Real differentiation *if* paired with hardware partnerships. |
| **Computer vision** | 1/10 | 6 | Only worth it for *attestation* (plate counting, lift verification), not for form coaching. Form-coaching CV is a graveyard. |
| **Exercise recognition** | 0/10 | **8** | The labeled-motion dataset from silent logging (10x-4) is a genuine, compounding, uncopyable asset. |
| **Health integrations** | 0/10 | 4 | Commodity. |
| **Enterprise** | 1/10 | 5 | Real market, wrong time. RLS is not even enabled — you cannot pass a single security review today. |
| **B2B (gyms)** | 0/10 | **7** | Equipment identity (10x-3) is a genuinely novel, physical, ground-game moat. |
| **Sports science** | 4/10 | 8 | Your engines are good. Credibility requires published validation and a named scientific advisor — the MacroFactor playbook. |
| **Recovery** | 2/10 | 5 | Commodity; every wearable owns this. |
| **Nutrition** | 3/10 | 2 | *Negative* moat. Kill it. |
| **Longevity** | 1/10 | 2 | Different company. |
| **Biomechanics** | 1/10 | 5 | Only via equipment identity (10x-3) making loads physically real. |
| **Digital twin** | 3/10 | 7 | The ontology is right. A twin with no data is a schema. |

### The single question: what data could become impossible to copy?

Four things, ranked by defensibility:

1. **Longitudinal individual dose–response** (load → adaptation, per person, per
   lift, over years). Cannot be bought. Cannot be scraped. Requires N × 12 weeks
   minimum. Powers adaptive MRV, honest program ranking, and real injury
   prediction. **This is the crown jewel and it is the only one that gets better
   every single day you operate.**

2. **Attested performance records.** Trust cannot be back-filled. Hevy's 14M users'
   numbers can never become verified retroactively. Once you are the registry,
   you are the registry.

3. **Normalized equipment ground truth.** A physical, gym-by-gym asset. Copying it
   means repeating the ground game.

4. **Labeled motion signatures.** Every confirmed silent-logged set is a labeled
   example. Compounds monotonically, and a competitor starting today starts at
   zero.

**Note what is not on this list:** volume charts, muscle heatmaps, plan libraries,
AI chat, themes, force plate ingest, nutrition, org graphs. All copyable in a
sprint. All of it is where your last 5 days went.

---

# PART V — GROWTH

## 5.0 The uncomfortable premise

You currently have **zero** growth mechanics. No App Store listing, no
referral loop, no content engine, no social graph (blocked), no import path, no
sharing that reaches a non-user, and no analytics to measure any of it.

Also: your name is your greatest untapped asset and you are not using it. **HYBRID**
names the fastest-growing tribe in fitness — hybrid athletes, Hyrox, DEKA,
lift-and-run — and that tribe has *no software home*. Hevy is for lifters. Strava
is for runners. Nobody serves the person doing both, even though the training
conflict between the two (the interference effect, load management across
modalities) is the hardest programming problem in the sport and *the one thing
your discipline-shaped plan engine uniquely solves.*

That is your wedge. It has been sitting in your product name the entire time.

---

## 5.1 0 → 10,000 — *this is not a growth problem, it is a truth problem*

Do not try to grow. Try to learn. 10k is reachable by hand.

1. **Ship to the App Store.** Nothing counts until this happens.
2. **Turn on analytics and billing.** Hours of work, currently blocked.
3. **Pick the tribe: Hyrox / hybrid athletes.** Not "everyone who lifts."
4. **Go where they are, personally.** r/hyrox, r/tacticalbarbell, r/hybridathlete,
   the Hyrox Facebook groups, the race expos. Post the *interference-effect
   programming* insight, not the app. Andrew Chen's rule: do things that don't
   scale, but do them in a place where the people talk to each other.
5. **Import from Hevy/Strong as the hook.** "Bring your history. We'll recompute
   your PRs correctly — including bodyweight pull-ups and both dumbbells — and
   show you two years you've never actually seen." That is a *demo* of your
   differentiation disguised as a migration tool.
6. **Race-result integration.** A Hyrox finisher wants their race in their
   training log, next to the block that produced it. Nobody offers this.
7. **10 gyms, hand-stickered.** Equipment identity (10x-3) starts as a founder
   with a label printer in ten Hyrox-affiliated gyms.

Target: 10,000 users, 25%+ D30 retention, and — non-negotiable — **an answer to
why the other 75% left.**

## 5.2 10,000 → 100,000 — turn on the first real loop

- **Verified PRs (10x-1, tiers 0–2).** A verified PR card is worth sharing because
  it is *true*. An unverified one is worth nothing, which is why nobody shares
  Hevy cards outside their friend group. Verification requires a witness →
  witnessing requires an invite. **The loop is the feature.**
- **The Spotter Protocol (10x-6).** Structurally two-person. Every use is an invite.
- **Program Efficacy Index (10x-5) as content.** "The 47 most popular programs,
  ranked by measured outcome, n=31,000." Auto-generated from your own database,
  permanently updating, unlinkable-around. This is StrongLifts' playbook with a
  moat attached. Expect it to be your single largest acquisition channel.
- **Coach-led import.** One coach onboards 30–200 athletes at once. Coaches are
  not a revenue line at this stage; they are the highest-leverage acquisition
  channel in fitness and you should give them the tooling free.
- **Gym stickers at 100+ gyms.** Physical distribution inside the room.

## 5.3 100,000 → 1,000,000 — become the record

- **Open the API.** Let other apps *read* the verified record. This is the moment
  you stop being an app and become infrastructure.
- **Competition partnerships.** Hyrox, DEKA, local federations, online meets.
  Every official result written into the record makes the record more valuable,
  and every athlete who wants their result must have an account. This is Strava's
  race-partnership playbook and it is unclaimed in strength.
- **Silent logging (10x-4) ships.** The reason to switch stops being features and
  becomes "I don't take my phone out anymore."
- **Adaptive MRV (10x-2) is now statistically powered** and becomes the pricing
  justification for $19.99/mo.
- **Federated gym network.** Gyms display verified leaderboards on their own
  screens, powered by you. Their marketing is your acquisition.

## 5.4 1,000,000 → 10,000,000 — the record becomes an institution

- **Institutional readers:** college recruiting profiles, tactical/first-responder
  entrance standards, insurers, corporate wellness verification. Each one makes
  the athlete-side record mandatory rather than nice.
- **International expansion via federations** (now localization earns its keep).
- **Hardware partnerships at scale:** every rack manufacturer ships with a HYBRID
  identity code, the way every treadmill ships with a Zwift/Strava hook.
- **Platform ecosystem:** third-party programs, third-party analytics, coach
  businesses running on your rails.

**Where virality actually emerges** — and it is exactly two places:
1. **Verification requires another human.** (spotting, witnessing, co-signing)
2. **The record is read by someone who is not you.** (a coach, a recruiter, a race,
   a gym board)

Everything else — share cards, referral codes, leaderboards among friends — is
what every competitor already does, and it produces the same 1.05 k-factor it
produces for them.

---

# PART VI — BUSINESS

## 6.1 Which company can this be?

**Lifestyle business: yes, easily, and this is the gravitational default.** With the
current product, listed on the App Store at $30/yr, you could plausibly reach
$300k–$1.5M ARR in 24 months. That is a genuinely good outcome for one person and
an AI agent. It is also what will happen if you change nothing, and it is *not*
what you said you wanted.

**VC-backed: not today. Plausibly in 6–9 months.** What a seed investor buys at
pre-revenue is a *thesis plus evidence of a loop*. You have a thesis
(hybrid-athlete OS) that is not articulated anywhere in the product, and zero
evidence of any loop. What would make you fundable is embarrassingly small
compared to what you have already built: 10,000 real users, 30%+ D30, one working
growth loop with a measured k-factor, and a written insight nobody else has
(adaptive MRV, or the verified record). That is a 6-month plan, not a 6-year one.

**IPO candidate: only through the record, not through the app.** A $1B+ outcome
requires ~$150–250M of revenue. That cannot come from consumer strength logging
at any realistic penetration. It comes from being the layer that institutions
depend on — recruiting, competition, tactical selection, insurance, gyms — with
consumer subscription as the acquisition engine underneath. Strava is the
structural precedent; Strava is also a warning that owning the graph without
owning a *credential* caps you around $1.5B.

## 6.2 TAM, honestly

| Segment | Size | Realistic capture | Value |
|---|---|---|---|
| Consumer strength tracking (paid) | ~180M regular strength trainers in developed markets; ~4% pay; ~$30/yr avg | **$250M/yr category.** Hevy holds ~3% of it. | Ceiling ~$50M ARR for a winner |
| High-ARPU prescription ($15–30/mo) | ~15M willing to pay coach-substitute prices | 2% = 300k × $200/yr | **$60M ARR** |
| Coach SaaS | ~400k monetizable coaches globally, $30–100/mo | 5% = 20k × $600/yr | **$12M ARR** |
| Gym B2B | ~200k gyms, $50–300/mo | 3% = 6k × $1,800/yr | **$11M ARR** |
| Teams/orgs (college, pro, HS) | ~50k programs, $1–5k/yr | 5% = 2,500 × $2,500 | **$6M ARR** |
| Military / first responders | ~5k units globally, $10–100k/yr | 3% = 150 × $40k | **$6M ARR** |
| Insurance / corporate wellness | speculative, requires verified record | — | **$0–50M**, binary |
| **Verified-record licensing** | recruiting, competition, credentialing | — | **The unbounded one** |

**Sum of the knowable: ~$95–145M ARR at aggressive-but-real capture.** That is a
$1–1.5B company *if and only if* you win multiple segments, which requires the
record to tie them together. Without the record, you win one segment and you are
a $100–300M company.

This is the actual strategic argument for 10x-1. It is not a cool feature. **It is
the only mechanism by which the addressable segments compound instead of being
separate businesses.**

---

# PART VII — UX REVIEW

You did not attach screens, so I reviewed the shipped implementation:
`nav.ts`, `home.tsx` (1,206 lines), `today.tsx` (1,125), `logger.tsx` (998),
`workout.tsx` (2,518), `onboarding.ts`, `access.ts`, and the Aurora kit.

## 7.1 Information architecture — the most serious problem in the product

**34 nav destinations across 7 groups.** Eleven of them are analysis surfaces:
Statistics, Performance, Analytics, Volume, Exercises, Trends, Velocity,
Endurance, Force plate, Video, History.

**A user cannot tell you the difference between Statistics, Analytics, Trends and
Performance. Neither can I, and I read the code.**

The persona system (casual ⊂ athlete ⊂ coach ⊂ admin) is a thoughtful engineering
solution to a problem you created by not saying no. Hiding complexity behind a
role gate is not simplification; it is complexity with a permission check. Julie's
test: *if you cannot draw the IA on a napkin from memory, your users cannot hold
it in their heads.*

**Recommendation — collapse to four destinations, permanently:**

```
Today   →  what do I do right now
Train   →  the logger + plans + builder (one surface, not three)
Progress→  ONE analysis surface, with the eleven current screens
           demoted to sections and drill-downs
You     →  profile, social, settings
```

Everything else becomes a section, a sheet, or is deleted. This is Linear's
discipline: a very deep product with a very shallow navigation.

## 7.2 The Today screen — cognitive load failure

From `home.tsx`, Today can render, on one scroll: masthead + pill rail + week
rail + logbook rail + plan hero + AI coach card + season phase timeline +
reconciled week + accountability + weekly recap + Performance State + injury-risk
panel + feeling/check-in card + Fuel/nutrition card + exercise widget rail +
coach rail + quick-start sheet + "also today" + done-today.

**That is 17+ modules on the primary daily screen.** With three tiers, a
day-scoped rail, a masthead that scale-interpolates on scroll, and a nav that
shrinks on scroll.

The motion engineering is genuinely accomplished — the continuous scroll-collapse
driven by one shared signal across both clients is elegant work. **It is elegant
work in service of a screen that should not exist in this form.**

Apple's actual rule (not "Apple-inspired," the real one): a screen answers *one*
question. Today's question is **"what do I do right now?"** The answer is one
card and one button.

**Recommendation:**
- **Above the fold: exactly one thing.** Today's session, with a Start button. If
  nothing is scheduled, one button: "Train."
- **Second: readiness, as one tappable line** — not a card with a face, a ring, a
  band, a limiter and a why. `readiness-load-adjust` is your best feature; it
  deserves *one sentence* that says "You said you slept badly, so today's top set
  is 5 kg lighter." That sentence, alone, is more valuable than the entire
  Performance State panel.
- **Everything else: below the fold, or gone.** The season timeline, injury panel,
  accountability, and Performance State belong in Progress.
- **Kill the exercise rail and the coach rail on Today.** Horizontal rails on a
  daily-action screen are content-discovery patterns from media apps. This is a
  tool. Users open it with a plate in one hand.

## 7.3 The logger — where you will actually win or lose

`workout.tsx` is 2,518 lines. It carries per-set velocity input, RPE,
warm-up/cool-down flags, modality-aware fields, live session math, an exercise
detail sheet with per-set bar speed, reorder, and a configurable simple↔detailed
mode.

**Every one of those is a keystroke between a sweaty human and their next set.**

Configurability is the tell. "Configurable workout logger (simple ↔ detailed +
automation prefs)" means you could not decide, so you made the user decide.
Superhuman's entire philosophy is the opposite: **make the opinionated choice, and
be so fast that nobody wants the option.** Hevy made the choice. That is why
Hevy wins the loop.

**Recommendations, in priority order:**
1. **Instrument it.** Time-to-first-set-logged, taps-per-set, session abandon rate.
   You cannot improve what you have never measured, and this is the only metric
   that decides the company.
2. **One mode. Ship the simple one.** Velocity/RPE/tempo appear only when the
   *program* prescribes them. The program should decide, never a settings screen.
3. **Ghost values pre-filled from last time, always.** One tap = same as last set.
   This is table stakes and it must be flawless.
4. **The rest timer must be a Live Activity.** Highest delight-per-line-of-code
   available to you. The phone goes in the pocket and the timer stays on the lock
   screen.
5. **Never block on the network.** Offline-first is shipped — make it *visible*
   and market it.
6. **Number entry:** a custom numeric pad with +2.5 / +5 / plate-math shortcuts,
   never the system keyboard.

## 7.4 Typography, spacing, colour, consistency

The design system work is real: a shared type/spacing scale, single-accent
discipline, a semantic colour vocabulary shared across clients, `serifIf` for the
Japandi display face, contrast utilities, reduced-motion support, Dynamic Type.
This is better foundational design engineering than most funded startups have.

The problem is **thematic churn**. Aurora Spectrum, Japandi Clay & Sage, Kyoto
Hour, Liquid Glass, three palette refreshes, an admin-configurable premium accent
colour — in five days. Redesigning the palette is not product work; it is the
most seductive form of procrastination available to a designer-founder. Arc
Browser shipped one identity and iterated the *product* underneath it.

- **Pick one theme. Ship it. Do not touch it for 12 months.**
- **Delete the admin-configurable premium accent.** A brand colour that an admin
  can change is not a brand.
- **Font scaling on web is still px, not rem** (`web-font-rem`, planned) — browser
  text-size settings are ignored. Fix; it is an accessibility bug.
- The middot ban, the no-decorative-dot rule, and the full-bleed rail rule in
  `CLAUDE.md` are **excellent** — real, specific, enforceable taste. This is the
  right kind of design rule. There should be five more of them and zero new
  palettes.

## 7.5 Onboarding

Currently: persona → goal (from 19, grouped into 5 categories) → experience →
days/week → equipment → session length → plan recommendation → enroll.

Six questions before value, from a brand the user has never heard of, to produce
a plan they cannot yet evaluate.

- **Guest-first must be the default path.** You have `guest-first-workout`. Log a
  set within 30 seconds of opening the app, no account. Ask for the account when
  the user has something to lose (their first PR, their first week).
- **19 goals is a paradox-of-choice failure.** Show three: *Get stronger*, *Build
  muscle*, *Hybrid (lift + run)*. Everything else lives behind "Something else."
- **Make the intake earn itself immediately.** Fitbod gets away with questions
  because the very next screen is a complete workout you can start now. If your
  next screen is a plan overview, you have spent the user's patience and returned
  nothing.
- **Delete the persona question entirely.** "Are you casual or an athlete?" asks
  the user to self-classify before they know what the classifications mean, and it
  is really a pricing question wearing a UX costume. Infer it from behaviour.

## 7.6 Empty, loading, error states

Better than average: `initialLoad` gates the plan hero so an enrolled athlete sees
a skeleton rather than a first-run chooser; `mobile-fetch-error-states` stops
empty-state-on-failure; `fetch-error.tsx` exists on both clients. Good.

But: with 34 destinations and near-zero data on day one, **the majority of your
app is empty state for the first month of every user's life.** Force Plate,
Velocity, Talent, Video, Endurance, Competition, Longevity, Tactical, Org — all
empty, all forever, for essentially everyone.

An empty screen is not neutral. It teaches the user that your product is mostly
not for them. Every screen that cannot be populated in a user's first two weeks
should not be reachable in their first two weeks.

## 7.7 Accessibility

Genuinely strong for a pre-launch product: focus management, contrast, labels,
roles, dialog focus-trap, reduced motion, tap-target minimums, live regions,
landmarks, skip links, locale direction, Dynamic Type. Better than Hevy.

Open: `web-font-rem` (real bug), `a11y-rtl-migration`, `a11y-followups`.

## 7.8 Premium feel

The material work — Liquid Glass, blur, gradients, entrance transitions, count-up
animations, the Wrapped stories — is *technically* premium. But premium feel in a
tool is not material; it is **certainty and speed**. Stripe feels premium because
nothing is ever ambiguous. Linear feels premium because it responds in under
16 ms. Superhuman feels premium because it is faster than thought.

Your premium risk is a 2,518-line logger with velocity fields loaded on a phone
in a basement gym. **Measure your p95 time-to-log-a-set. If it exceeds Hevy's, no
amount of glass will save you.**

---

# PART VIII — ROADMAP

## Next 30 days — *stop building, start learning*

Non-negotiable, in order. **Ship no new features.**

| # | Action | Why |
|---|---|---|
| 1 | **Run `reference/sql-all.sql`.** Enable RLS. | You are not tenant-isolated. This is a breach waiting to happen and blocks every B2B conversation. Hours of work. |
| 2 | **Connect PostHog.** Instrument: install → first set logged → D1/D7/D30, time-to-first-set, taps-per-set, session abandon. | You currently cannot learn. Nothing else matters until this exists. |
| 3 | **Stripe + Apple IAP live.** | Cannot take money. |
| 4 | **Ship to the App Store.** | You do not exist. |
| 5 | **Delete the Kill List.** Tactical, Longevity, Talent, Org, Competition, Video, Force plate, the nutrition stack, the email platform, the agent org, the financials console, the CMS. | ~60% of the code, ~0% of the value. This is the single highest-ROI action available. |
| 6 | **Collapse nav to 4 destinations.** | The largest usability win available. |
| 7 | **Rebuild Today as one card + one button.** | The daily loop must be one decision. |
| 8 | **Logger: one mode, ghost values, custom numpad, Live Activity rest timer.** | The only feature that decides the company. |
| 9 | **Import from Hevy / Strong / CSV.** | The switching mechanic *and* the differentiation demo. |
| 10 | **Turn on the social schema.** | Your only growth loop is currently switched off by an unrun SQL file. |
| 11 | **Write the positioning statement in one sentence.** | If you cannot, nothing else can be prioritized. My proposal: *"HYBRID is the training system for athletes who lift and run — the only app that programs both without the two destroying each other."* |

**Success = 1,000 real users and a D30 number you believe.**

## Next 3 months — *one loop, one tribe, one insight*

| # | Action |
|---|---|
| 1 | **Own the hybrid/Hyrox tribe.** Race integration, interference-effect programming, hybrid-specific analytics. Be the obvious answer for one group of people. |
| 2 | **Adaptive MRV v1 (10x-2).** Replace the textbook volume landmarks with a per-athlete estimator. This is your MacroFactor moment and it is mostly already scaffolded. |
| 3 | **Verified PRs, tiers 0–2 (10x-1).** Witness co-signing. Cheap, social, and the seed of everything. |
| 4 | **Apple Watch app + widget + HealthKit.** Table stakes, finally paid. |
| 5 | **Coach tooling, free.** Coaches are the cheapest acquisition channel in fitness. |
| 6 | **Program Efficacy Index v1 (10x-5)** as a public, auto-updating page. Your content engine. |
| 7 | **Price at $14.99/mo, $99/yr.** You are not a $2.99 product. If you cannot justify $15, you have not built a differentiated product — and that is information you need immediately. |

**Success = 10,000 users, 30%+ D30, a measured k-factor above 0.3, first
paying cohort.**

## Next 12 months — *company-defining*

| # | Action |
|---|---|
| 1 | **The Verified Strength Record, tiers 0–4, with a public read API.** Become the registry. |
| 2 | **Silent logging (10x-4).** Remove the loop instead of speeding it up. |
| 3 | **Equipment identity (10x-3)** across 500+ gyms. The physical ground game. |
| 4 | **First institutional reader.** One competition series, one college, or one tactical unit that *reads* the record. This is the moment you stop being an app. |
| 5 | **Hardware integrations** (Perch, GymAware, Output) as distribution, not features. |
| 6 | **Raise on evidence,** not on architecture. |

---

# PART IX — FINAL VERDICT

### 1. Would I invest?

**No — not today. Yes, plausibly, in six months.**

I would not invest in 279 capabilities and zero users. I *would* invest in the
person who shipped 135,000 tested, cross-platform, architecturally coherent lines
in five days — **if** they demonstrate they can delete 60% of it. Velocity is the
rarest asset in a founder and you have it in abundance. Judgment about what not to
build is the second rarest, and right now you have none. The first is teachable to
nobody; the second is teachable by users. Go get users.

### 2. Would a16z invest?

**No, at any stage that matters.** Consumer fitness subscription is a burnt
category for them post-Peloton unless the story is health outcomes, hardware, or a
genuinely novel network. You have no distribution insight, no proprietary data, no
users, and you are competing with a 14M-user incumbent that monetizes at
$0.50/user/year. They would pass in the first meeting and be right to.

**What would change their mind:** the Verified Strength Record with an
institutional reader. That is a network-effects story in a category with no
identity layer, and it is exactly the shape a16z funds. Nothing else in this
document would.

### 3. Would Peter Thiel invest?

**Not on this pitch — but his framework is the most useful lens you have.**

Thiel asks: *what do you believe that almost nobody agrees with?* Nothing in this
repository answers that. "A better, more complete fitness app" is the definition
of undifferentiated competition — which is precisely what he tells founders to
avoid.

But there *is* a Thiel-shaped secret buried in here, and you have not noticed it:

> **Every strength number in the world is unverified, and therefore worthless,
> and therefore an entire layer of institutions (recruiting, competition,
> selection, underwriting) is forced to test people in person. Whoever makes
> strength verifiable owns a monopoly on a category that currently has no
> identity layer at all.**

That is a secret. It is contrarian (the entire category is built on frictionless
self-report). It is true (nobody can verify a lift today). It creates a monopoly
rather than competition. And the incumbent structurally *cannot* follow, because
adding verification would slow their core loop and retroactively devalue every
number their 14M users have already entered.

Build that and the conversation is completely different.

### 4. Would YC fund this?

**Yes — and they would immediately force a 90% scope cut.**

YC funds people who ship absurdly fast, and 135k lines in five days is a legible,
almost comically strong signal of that. Their first partner meeting would be
twenty minutes of "how many users do you have?" followed by an instruction to
delete everything except the logger and talk to twenty lifters a week.

Which, notably, is the same advice this entire document contains. You should
apply, and you should pre-empt the critique by having already made the cut.

### 5. Would elite strength coaches switch?

**No. Not for any feature you could build.**

They switch for: peer recommendation at a conference, budget cycle timing,
migration done for them, and their athletes not complaining. TeamBuildr's moat is
a relationship with an athletic director and a workflow habit measured in seasons.

Also, bluntly: you cannot pass a security review today (RLS is not enabled), you
have no SSO, no roster sync, no references, and no support organization. Elite is
a 2028 conversation. Pursuing it now would kill the consumer product that has to
fund it.

### 6. Would serious lifters abandon Hevy?

**Not for more features. Only for one of three things:**

1. **Their history, brought with them, and made more correct than Hevy had it.**
   (import + tonnage correctness — you can ship this in two weeks)
2. **Something Hevy structurally cannot do** — verified PRs, adaptive MRV,
   silent logging. Not "does not do." *Cannot* do, because of what they are.
3. **Not having to log at all.**

Note that "a better analytics screen," "more plan templates," "a nutrition tab,"
"a nicer theme," and "an AI chat" are on nobody's list. That is where the last
five days went.

### 7. What must happen before that becomes true?

Six things, in strict order. Skipping any one invalidates the ones after it.

1. **Ship. To the store. This week.** Everything is theory until then.
2. **Measure.** Analytics on. Time-to-log, D1/D7/D30. Learn whether the logger is
   fast, because the honest prior is that it is not.
3. **Delete 60%.** Every deleted screen makes the remaining ones faster to improve
   forever. This is a compounding decision.
4. **Pick the tribe.** Hybrid/Hyrox athletes. Your name already says it.
5. **Build one thing nobody else can** — adaptive MRV first (cheapest, highest
   credibility), then verified records (biggest).
6. **Price like you believe it.** $14.99/mo. If the market refuses, you have
   learned something crucial and cheap.

---

# PART X — "If I were CEO tomorrow…"

Twelve months. Every decision explained. Ruthlessly ordered.

---

### **Month 1 — The Great Deletion**

**Week 1: I delete 60% of the product.** Tactical, Longevity, Talent Graph, Org
Graph, Competition Intelligence, Video Intelligence, Force Plate, the entire
nutrition stack, the email marketing platform, the AI agent org, the admin Engine
Room, the financials console, the CMS, the moderation queue, i18n beyond English,
two of the three themes.

*Why first, before anything else:* every one of these has a permanent tax —
regression surface, parity obligations under your own web↔mobile rule, design-system
sweeps, cognitive load on every roadmap decision. Deleting them does not just save
future work; it makes every remaining feature cheaper to improve, forever. And
psychologically, it makes the "no" muscle real. You cannot focus a product you are
still maintaining unfocused.

*Why I am not scared of losing it:* it is in git. Nothing is lost. But nothing in
that list has a user, and features without users are not assets — they are
liabilities with good syntax.

**Week 1, in parallel: RLS on, PostHog on, Stripe + IAP live.** Hours of work,
blocked for weeks. Without RLS I am one query from a breach. Without analytics I
am building blind. Without billing I cannot learn what anyone will pay.

**Week 2: Navigation collapses to four.** Today / Train / Progress / You. The
eleven analysis screens become sections of one Progress surface. *Why:* it is the
largest single usability gain available, it costs almost no engineering, and it
forces the deletion decisions to stick.

**Week 2: Today becomes one card and one button.** One question, one answer.
Readiness becomes one sentence: "You slept badly — today's top set is 5 kg
lighter." *Why:* that sentence is the most differentiated thing in the product and
it is currently buried under sixteen other modules.

**Week 3: The logger becomes the only thing I care about.** One mode. Ghost
values. Custom numpad with plate math. Live Activity rest timer. Instrumented to
the millisecond. *Why:* Hevy's moat is logging speed, and if I cannot match it
nothing downstream matters — a user who does not log has no data, no progress, no
PRs, no reason to return.

**Week 4: App Store. Import from Hevy/Strong/CSV.** *Why import:* it is the single
highest-leverage two weeks in this plan. It removes the #1 switching barrier, and
the import screen doubles as a demo of my differentiation — I recompute their PRs
correctly, count both dumbbells, count bodyweight in pull-up tonnage, and show
them two years of their own training they have never actually seen. The migration
tool *is* the pitch.

---

### **Months 2–3 — One tribe, one loop**

**I bet the company on hybrid athletes.** Hyrox is the fastest-growing
mass-participation sport in the world, and it has no software home. Lifters use
Hevy, runners use Strava, and the person doing both has nothing. The hardest
programming problem in that sport — the interference effect between strength and
endurance — is exactly what my discipline-shaped plan engine uniquely solves.

*Why a tribe and not "everyone who lifts":* Hevy owns the general lifter and I
cannot dislodge them by being 10% better. Tribes have concentrated watering holes
(subreddits, race expos, affiliate gyms), they talk to each other, and being
indispensable to 50,000 people beats being adequate to 5 million. This is
StrengthLog's powerlifting strategy, executed on a market that is growing instead
of static.

**I ship race integration.** A Hyrox result lands in the training log next to the
block that produced it. Nobody offers this. It is the first time an event outside
the app writes into the record — the seed of everything in month 12.

**I ship Adaptive MRV.** I replace the population volume landmarks with a
per-athlete estimator that learns each user's recoverable volume from their actual
response and shows its own uncertainty. *Why this before verified records:* it is
cheaper, the foundation is already built, and it is the credibility feature — it
is what makes an evidence-minded lifter say "this app knows something." It is also
the only honest justification for pricing above $2.99.

**I ship verified PRs, tiers 0–2.** Witness co-signing between two lifters at the
same gym. *Why now:* it is free, it is social, and it makes the share card *true*.
Nobody shares a Hevy PR outside their friend group because everyone knows it is
just a number someone typed. A verified PR is worth posting.

**I ship the Watch app, the widget, and HealthKit.** Table stakes. I do them now
rather than earlier because the logger had to be right first — a Watch app on a
bad logger is a bad logger on your wrist.

**I raise the price to $14.99/mo, $99/yr.** *Why:* the entire strategic thesis is
that $0.50/user/year is a dead end. If I cannot charge $15, I have not built
anything differentiated, and I need to know that in month 3, not month 30.

**I give coaches everything, free.** Not a revenue line — an acquisition channel.
One coach brings 30–200 athletes at a CAC of zero.

---

### **Months 4–6 — The content engine and the first real loop**

**I publish the Program Efficacy Index.** Every program ranked by measured outcome
— median 12-week e1RM delta, by training age, by adherence, with n. Auto-generated
from my own database, permanently updating.

*Why this is the most important marketing decision of the year:* it is the only
content in fitness that competitors cannot write, because it requires my data. It
is permanent SEO. It converts my plan library from a commodity into a research
asset. It makes my coach marketplace rankable by *results* rather than by
follower count, which is the only thing that would make a coach directory worth
more than Instagram. And it is StrongLifts' acquisition playbook — the program is
the channel — with a moat attached instead of one man's blog post.

**I ship the Spotter Protocol.** Two devices, one lift, co-signed. *Why:* it is
the only growth loop in fitness that lives inside the physical ritual instead of
being bolted onto it. Every spot is an invite, and it bootstraps attestation.

**I put stickers on machines in 100 gyms, by hand.** Equipment identity, v1. *Why
by hand:* it does not scale, which is exactly why it is defensible. It is a
physical asset, gym by gym, and the sticker is a permanent free impression in
front of every member of that gym.

**Target: 25,000 users, 35% D30, k > 0.3, $40k MRR.** With those numbers I raise
a seed — on evidence, not architecture.

---

### **Months 7–9 — Remove the loop**

**I ship silent logging.** Watch IMU plus phone, detecting set start, rep count,
tempo and rest, confirmed by exception. Target: a full session in under five taps.

*Why this is the year's biggest engineering bet:* Hevy's moat is that logging is
fast, and I cannot beat a speed moat by being 15% faster. I beat it by making the
activity unnecessary. And every confirmed pre-filled set is a labeled motion
example — a dataset that compounds daily and that a competitor starting in 2028
starts at zero on. It converts my Watch app from table stakes into the primary
surface.

**I ship verified records tiers 3–4** — on-device video with plate counting, and
integrations with Perch, GymAware, Output and Vitruve. *Why integrate rather than
build hardware:* those companies are already installed in NFL, NBA and NCAA weight
rooms. Each integration is a distribution channel into institutions I could not
otherwise reach, and hardware would kill a software company at this stage.

---

### **Months 10–12 — Stop being an app**

**I open the read API for the verified record**, and I sign the first
institutional reader: one competition series, one college program, or one
first-responder department that *reads* HYBRID records instead of testing people
in person.

*Why this is the whole plan:* it is the moment the company stops being a
subscription app in a category that monetizes at $0.50/user/year and becomes the
identity layer for strength. It is what makes the addressable segments compound
instead of being five separate small businesses. It is the switching cost that no
CSV export can neutralize — leaving costs you your credential, not your logs. It
is the two-sided network that makes the whole thing worth $1B instead of $150M.

And it is the one thing Hevy structurally cannot copy, because frictionless
self-report is not a feature of their product — it *is* their product.

---

### The single sentence

> **Stop building an app that does everything, and start building the record that
> everything else has to read.**

You have five days of the fastest product engineering I have seen. Spend the next
five deleting, and the next twelve months building four things instead of 279.

---

## Sources

- [Hevy — Sensor Tower overview (Feb 2026 revenue/downloads)](https://app.sensortower.com/overview/1458862350?country=US)
- [Hevy App Review 2026 — pricing and Pro gating (RepReturn)](https://repreturn.com/hevy-app-review/)
- [Fitness App Pricing 2026 — Fitbod vs Hevy vs Strong (SensAI)](https://www.sensai.fit/blog/fitness-app-pricing-free-tier-comparison)
- [Hevy — official site (14M users claim, feature list)](https://www.hevyapp.com/)
- [Hevy vs Strong vs Fitbod vs Jefit (SensAI, 2026)](https://www.sensai.fit/blog/hevy-vs-strong-vs-fitbod-vs-jefit)
- [Best Strength Training Apps 2026 — JEFIT](https://www.jefit.com/blog/best-strength-training-apps-for-2026-7-options-tested-by-lifters)
- [Strong Workout Tracker — revenue trend (Statista)](https://www.statista.com/statistics/1650812/strong-workout-tracker-gym-log-app-revenue-worldwide)
- [Fitbod Review 2026 — $15.99/mo pricing (SensAI)](https://www.sensai.fit/blog/fitbod-review-2026)
- [MacroFactor Workouts — Jan 2026 launch (Stronger by Science)](https://www.strongerbyscience.com/macrofactor-workouts-survey/)
- [MacroFactor — Workout app launched (Jan 2026 monthly update)](https://macrofactor.com/mm-jan-2026/)
- [MacroFactor Workouts — features and Nippard video library](https://dr-muscle.com/macrofactor-workouts/)
- [TeamBuildr pricing — $90–$280/mo per org](https://www.teambuildr.com/pricing)
- [TeamBuildr vs TrainHeroic — per-athlete pricing comparison](https://www.teambuildr.com/trainheroic-vs-teambuildr)
- [Perch raises $4M for 3D strength tracking (Fitt Insider)](https://insider.fitt.co/perch-raises-4m-for-3d-strength-tracking/)
- [VBT buyer's guide 2026 — camera vs LPT systems (Output Sports)](https://www.outputsports.com/blog/buyers-guide-to-velocity-based-training-vbt-in-2025)
- [Best VBT devices 2026 (Vitruve)](https://vitruve.fit/blog/vbt-devices/)

---

# PART XI — Re-audit (2026-08-09)

*Same repository, thirteen days later, at HEAD `5a1cfde`. Verified by direct code
reading and the capabilities registry — not the founder's account of it.*

## 11.0 Corrections to this document's own facts

Two numbers in §0 were wrong when written, and the record should say so:

- **The "5 days" clock was a shallow-clone artifact.** The repository's real first
  commit is **2026-06-02** ("Initial commit" → "Sprint 0: Turborepo monorepo"), and
  at this document's own cited commit `37c9b14` (2026-07-27) there were already
  **1,178 commits over ~8 weeks**, not 160 over 5 days. The rhetorical point
  survives at reduced voltage — it was 8 weeks of ferocious supply-side shipping
  into a product with no public users, not 5 days — but "56 capabilities per day"
  was wrong by roughly an order of magnitude.
- The line counts quoted for individual screens have all since grown and are
  restated below.

## 11.1 The §0 table, re-measured

| Measure | 27 Jul 2026 (as written) | 9 Aug 2026 (measured) |
|---|---|---|
| First commit | ~~2026-07-22~~ | **2026-06-02** (corrected) |
| Total elapsed | ~~5 days~~ | **~10 weeks** |
| Commits | 160 | **1,569** (Claude 1,263 / founder 302 / dependabot 4) |
| Lines of TS/TSX | ~135,000 | **~229,000** |
| Prisma models | 67 | **73** |
| Nav destinations | 34 | **43** (7 groups; 4 of the 12 analyze entries are `promotedTo` folds, so 8 are menu-reachable) |
| Capabilities `shipped` | 279 | **429** |
| Capabilities `blocked` | 30 | **29** |
| Capabilities `planned` | — | **47** |
| Core tests | — | **3,021 / 3,021 green** (184 files) |
| Real users | 0 | **0 public** (internal TestFlight only) |
| Paying customers | 0 | **0 — billing still cannot charge a card** |
| Analytics provider | none | **still none** (`funnel-analytics` blocked; instrumentation call-sites exist, shim is a no-op) |
| Row-level security | not enabled | **ENABLED in production** (`schema-tenant-isolation-rls` shipped; sql-pending.sql applied Jul 2026, plus five policy-escalation fixes) |

The capability count grew by 150 in 13 days while users stayed at zero — §0's
diagnosis is not only intact, the ratio got worse. What did materially change is
*which* capabilities they were, and that is the story below.

## 11.2 Recommendations taken (genuinely, verifiably)

1. **10x-1, Verified Strength Record — tiers 0–2 shipped.** `attestation.ts`
   declares the full 0–5 ladder (tiers 3–5 present but `live: false`); tier 2
   witness co-signing is real (`RecordAttestation` table applied in production,
   ask-by-@handle API, co-sign inbox on the feed, server-side claim snapshot).
   Honest scope: no cryptographic signing, **no public read API yet** (the registry
   itself names it as NEXT — "the institutional wedge"), no badges on share cards.
   A social co-sign feature today; the registry's language shows the strategic
   intent stuck.
2. **10x-2, Adaptive MRV — shipped, and it is the strongest thing built since
   July.** The population table is now layer 1 of a 4-layer resolver
   (`landmark-resolve.ts`): POPULATION → PROFILE (training age, chronological age,
   body mass, sleep, stress, deficit — each factor returned with multiplier +
   source + confidence) → OBSERVED (`landmark-adapt.ts` — the ceiling corrected by
   what actually happened: e1RM drift, fatigue, soreness; bounded ±35%, <2
   qualifying weeks returns the prior at zero confidence) → MANUAL overrides.
   Plus `landmark-replay`, a no-lookahead auditor whose last point is pinned by
   test to equal the number on screen. This is the MacroFactor move, actually
   made. Gap: the athlete profile it feeds is per-device only
   (`volume-profile-server-sync` planned), so the estimator's inputs don't follow
   the athlete.
3. **10x-5, Program Efficacy Index — v1 shipped, public.** `program-efficacy.ts`:
   median e1RM delta over closed 12-week enrollments, adherence-banded, dropout
   published, k-anonymity floor of 5 with suppression. Served by an
   unauthenticated CDN-cached `GET /api/efficacy` and a public `/programs` page
   with full methodology. **The first thing in the repo built to be crawled** —
   the content engine this document asked for. Caveats: n is currently whatever a
   zero-user product produces; no sitemap/robots/OG yet.
4. **Guest-first is now the default** (`guest-first-workout` shipped): no-account
   first workout, offline persistence, `flushGuestSessions()` on sign-in. §7.5's
   headline ask, done.
5. **Plate calculator exists** (`plates.ts`, tested, per-side hint in the logger —
   default off).
6. **Theme churn was cut**: themes reduced to dark/light, the Classic UI template
   deleted (Aurora is the only one). Partial credit against §7.4.
7. **Social schema is on** — sql ran in production (Jul 2026); feed/follow/kudos/
   leaderboard serve real tables, and the feed was re-founded since (card system,
   server-side ranking, one-post-per-workout, live "now training" presence).
8. **RLS is enabled in production** — with the policy-logic escalations found and
   fixed by the follow-up security audit (self-escalate-to-ADMIN, forged-ACTIVE
   CoachLink, and three more).
9. **Today was restructured** — from one 17-module scroll into a 3-tab hub
   (Dashboard / Performance / Feed) with four named clusters; the Dashboard tab
   is down to ~12 modules. Not the "one card + one button" this document asked
   for, but a real IA consolidation in the asked direction. (The nav itself went
   the other way — see below.)

## 11.3 Recommendations NOT taken

1. **The Kill List was not executed. Zero items deleted.** Tactical, Longevity,
   Talent Graph, Org Graph, Competition Intelligence, Video Intelligence, Force
   plate, the email platform, the agent org, the financials console, and the full
   CMS are all still shipped and maintained; the nutrition stack was not killed
   but **massively expanded** (~30 shipped `nutrition-*` capabilities, its own tab
   on the bottom bar, public product pages). i18n is still EN/PL/DE. The one
   partial: themes (above).
2. **Nav did not collapse to 4 — it grew from 34 to 43 destinations.** The analyze
   group went from 11 to 12 (4 folded via `promotedTo`, so menu-reachable analyze
   is 8 — real consolidation motion, wrong direction on net).
3. **Still cannot take money.** No Stripe account; all four billing capabilities
   blocked. The IAP side advanced materially (StoreKit 2 server verification,
   Apple root certs, native client, compliance hardening, Apple Developer account
   obtained) — but nothing can charge a card today, thirteen days after this
   document called it "days" of work.
4. **Still cannot measure.** No analytics provider connected. The upgrade-funnel
   call-sites exist and fire into a no-op shim.
5. **Still not on the App Store.** Internal TestFlight only (real pipeline —
   GitHub-Actions + codemagic-cli-tools, off EAS entirely; build 1.0.0 live on
   device). No external beta, no review submission, no listing.
6. **Import from Hevy/Strong/CSV — not built** (`history-import` planned). The
   registry itself now calls it "TABLE STAKES + the switching mechanic". Still
   the highest-leverage two weeks on the board, still not scheduled.
7. **Live Activity rest timer — not built** (planned). Push notifications —
   still blocked, and the `expo-notifications` plugin was *removed* from
   `app.json` to unblock IAP-era builds (the ASC-API-key auth can't provision the
   push entitlement).
8. **Watch/HealthKit went from "0" to "built, unverified"** — a real watchOS
   glance app, a WidgetKit extension, HealthKit sync, and the device-truth
   projection (a matched recording overrides typed numbers in every engine — a
   genuine product stance). All four wait on the same ops step: one
   `with_targets=true` workflow run and an on-device check. The gap is now ops,
   not engineering — which makes it more damning, not less.
9. **Pricing unchanged**: web still hardcodes $9.99 (mobile now shows the live
   StoreKit price); the $14.99–19.99 repositioning was not taken; the "7-day free
   trial" copy still promises what billing cannot deliver.
10. **The plan library did not move: still 6 programs against 19 goals** — 1,570
    lines, zero growth in six weeks, while ~880 commits landed elsewhere. For a
    document arguing "the program is the acquisition channel," this is the most
    conspicuous standing-still number in the repo.

## 11.4 What this does to the argument

The panel's verdict framework survives contact with the update almost unchanged,
with one honest amendment.

**The amendment:** §2.1 said the moats were "moat-shaped holes" and everything
differentiated was buried. That is less true now. Adaptive MRV is a real,
shipped, tested estimator that no competitor has; the Efficacy Index is a real
public data asset with correct statistics discipline; the Verified Record's
witness tier is live. The four genuine assets this document counted are now
seven. The engineering judgment inside the product got *better* at exactly the
things this document said mattered.

**What did not change is the thesis of §0:** the feedback loop has still never
closed. Zero public users, zero charged cards, zero measured retention, zero
analytics — after a re-audit window in which 150 more capabilities shipped. The
company keeps choosing, with perfect consistency, the work that can be done
without talking to the market: even the recommendations it took are the
*buildable* ones (10x features, guest mode, RLS), and the ones it skipped are
exactly the ones that require an external counterparty — a Stripe account, an
App Store review, an analytics vendor, a deletion decision. The operating
pattern the a16z memo in `reference/panel-evaluation-2026-07.md` called the red
flag is now measurable across two audit cycles.

**The 30-day list from PART VIII, re-scored:** items 5 (kill list), 6 (nav to
4), 11 (positioning sentence — still absent from the product) not done; items 1
(RLS) and 10 (social schema) **done**; items 2 (analytics), 3 (billing), 4 (App
Store), 9 (import) not done; item 7 (Today as one card) partially; item 8
(logger: one mode / ghost values / numpad / Live Activity) — ghost values yes,
the rest no. **Score: 2.5 of 11**, and the 2.5 are the ones that needed only a
SQL editor.

The sentence at the end of this document stands. The record is being built; the
things everything-else-has-to-read it through — a store listing, a price, a
cohort — still do not exist.
