# The memos vs. the running app — July 2026

Both `thiel-investment-memo.md` and `a16z-investment-memo.md` were written by reading
the repo. This document does the thing neither did: **boots the app and checks their
claims against what a user actually sees.**

**Method.** `pnpm dev` (`apps/web`, Next 16.2.7 / Turbopack), driven with headless
Chromium via Playwright. All three demo personas (Client, Coach, Admin) walked end to
end, plus a direct probe of the billing endpoints and a full run of the core test suite.

**One environment caveat, stated up front.** The sandbox blocks the Supabase host and no
`.env` exists, so the app ran in its **demo-session** mode (`lib/supabase/client.ts`:
"the app runs on the demo session … so the deployed site keeps working without any
backend"). Findings below are tagged **[real]** where they hold regardless, or
**[sandbox]** where the missing backend caused them. I have not counted a single
sandbox artifact against the product.

---

## 1. Verdict table

| # | Claim | Source | Adjudication |
|---|---|---|---|
| 1 | No path to revenue; billing returns 503 | both | **Confirmed, worse than written** |
| 2 | Positioned as a consumer fitness app, not a performance OS | Thiel §1 | **Confirmed by the marketing site itself** |
| 3 | The engine is real, pure and tested | a16z §6 | **Confirmed** |
| 4 | Gating the differentiator behind Full is a mistake | review §8 | **Confirmed, and understated** |
| 5 | The coach/gym wedge is the right move | a16z §9 | **Confirmed, and cheaper than assumed** |
| 6 | The engagement substrate justifies the consumer work | a16z §7 | **Partly upheld** |
| 7 | Unit economics rest on $12.99 ARPU | review §8 | **Falsified — the app charges $9.99** |
| 8 | Security posture is weak (RLS off) | both | **Nuanced — better than the memos imply** |

---

## 2. Revenue: confirmed, and it is worse in person

Clicking **Start free trial** on the paywall produces, in red, inside the sheet:

> **Couldn't start checkout (HTTP 500).**

`POST /api/billing/checkout` → **500**. Direct probes (with an `Origin` header, since a
CSRF guard correctly rejects requests without one — a good sign in itself):

| Endpoint | Result |
|---|---|
| `POST /api/billing/checkout` | 500 |
| `POST /api/billing/portal` | 500 |
| `POST /api/billing/iap/verify` | 500 |
| `POST /api/billing/webhook` | 503 `{"error":"billing not configured"}` |

The 500s are the **[sandbox]** auth layer failing before the billing check; the 503 on the
unauthenticated webhook is the **[real]** state and matches the memos exactly.

But the memos said "billing returns 503" as an *infrastructure* fact. Running the app
turns it into a *product* fact: **the paywall is fully built, beautifully designed,
priced, and it dead-ends in a red error string.** A user who decides to pay you cannot.
That is the single most expensive line of text in the codebase, and no amount of reading
`route.ts` conveys it the way the screenshot does.

## 3. Positioning: the landing page settles the argument

The Thiel memo asserted HYBRID is "positioned like a small business." The marketing site
is the evidence, and it is unambiguous:

> **Train like two athletes.**
> The only log built for athletes who lift heavy *and* condition.

Feature cards: "Every format, natively", "Strength + engine, one view", "An AI coach for
both", "Readiness-aware". Footer CTA: "Start your hybrid season. Free to start."

There is no mention of teams, clubs, federations, coaches, injury risk, return-to-play,
or an org graph — **the entire enterprise thesis of `north-star-strategy.md` is absent
from the front door.** The company describes itself to the market as a better training
log. Thiel §1 is confirmed not by inference but by the founder's own copy. **[real]**

## 4. The engine: confirmed

`pnpm --filter @hybrid/core test` → **96 files, 1,101 tests, all passing in 10.0s**
(the review cited 1,074; it has grown). Fast, pure, no fixtures, no network. a16z's
"the hard, unglamorous half is done" is the most durable claim in either memo, and it
survives contact with execution. **[real]**

## 5. The free tier is a lock screen

The review said gating HPI means free users never meet the differentiator. Running it,
that was too gentle. A free (`casual`) user's sidebar shows **15 padlocked items**:

> Cockpit, Periodize, Sport, Competition, Performance, Analytics, Volume, Trends,
> Velocity, Endurance, Force plate, Video, Longevity, Talent, Connections — every one
> of them carrying a 🔒.

The free user is shown a **map of everything they can't have**, permanently, in the
primary navigation. This is the opposite of a trial: it advertises exclusion rather than
demonstrating value. Every one of those locks is a small, repeated reminder that the app
is not really theirs.

Worse, `Connections` — the wearable/HealthKit hookup — is locked. **The one action that
would feed the data moat is behind the paywall that doesn't work.** Both memos identified
the empty flywheel; neither noticed that the funnel into it is bolted shut at the free
tier. **[real]**

Related: onboarding is a **6-step wizard** (persona → goal → …) before a user reaches
Today. And `funnel-analytics` is blocked with no provider chosen — so there is no
measurement of how many people quit at step 3. A six-step gate you cannot measure is a
conversion risk you cannot see. **[real]**

## 6. The coach wedge is already built

a16z proposed Hyrox gyms and coaches as the wedge. Logging in as **Coach** shows it is
not a build project — it is a live screen:

> **INVITE AN ATHLETE** — "Share a link, show the QR, or enter their email. They get the
> free app and see everything you assign (read-only) — connected to you automatically."
> [Generate invite]

Plus full nav for Coach, Squad monitor, Team compare, Organization, Talent, Tactical —
**zero padlocks.** And the athlete goal picker already lists **Hyrox** as a first-class
option alongside 18 others.

The wedge recommendation costs **nothing to execute**. It requires no code, only the
decision to point the product at coaches and the Stripe account to charge them. This
strengthens a16z's §9 materially. **[real]**

## 7. A finding neither memo has: the price is wrong

The paywall sheet reads:

> **$9.99 / month** — 7-day free trial, cancel anytime

`economics.ts` `DEFAULT_ASSUMPTIONS` models `proPriceMonthly: 12.99` (and a $99/yr
annual tier the UI never offers). **The product charges 23% less than the business model
assumes**, and the annual plan — 30% of modeled mix — does not exist in the UI.

Re-running the review's math at the real price:

| | modeled $12.99 | actual $9.99 |
|---|---|---|
| LTV (85% margin, 6% churn) | $184 | **$142** |
| LTV:CAC @ $25 (modeled CAC) | 7.4 | 5.7 |
| LTV:CAC @ $60 (realistic) | 3.1 | **2.4** |
| LTV:CAC @ $150 (realistic) | 1.2 | **0.94** |

At the price actually charged and a realistic paid CAC, **HYBRID loses money on every
acquired consumer subscriber.** The review's conclusion — paid acquisition doesn't work,
distribution must be coach-led or organic — was directionally right and quantitatively
too generous. Fix the model or the price; they cannot both be right. **[real]**

## 8. Security: the memos were too harsh

Both flagged RLS-not-enabled as an enterprise blocker, which it is. But running the app
surfaces mitigations neither memo credited:

- The `/admin` console **refused the demo session entirely** — it is server-gated
  (`admin/layout.tsx` → `getAdmin()` → real Supabase auth), so the client-side demo
  persona grants no server privilege. The Capabilities and Financials screens were
  unreachable for exactly the right reason. **[real]**
- Billing endpoints enforce **CSRF origin checks** before anything else.
- `access.ts` fails closed on unknown personas — verified in the nav: unlisted personas
  get the locked view, not the open one.

RLS still needs enabling. But "no security" is not the right characterization; the
application layer is defended, and the missing piece is defense-in-depth at the database.

## 9. What the memos missed entirely: demo mode is a sales asset

The app boots, renders, onboards and navigates **with no backend, no account, and no
environment variables**, offering one-click Client / Coach / Admin personas.

Neither memo mentions this, and for the coach-led wedge it matters: a founder can open a
laptop in a Hyrox gym with no wifi dependency on Supabase, click **Coach**, and walk the
owner through Squad Monitor and the invite flow in sixty seconds. Most seed-stage
products cannot be demoed without a staging account and a prayer.

It is a distribution asset built by accident, currently unused. **[real]**

---

## 10. What running it changes

**Nothing in either verdict.** Thiel's pass and a16z's milestone-gated invest both stand;
the app is exactly as good, and exactly as uncaptured, as the code suggested.

What changes is the **texture of the diagnosis**. Reading the repo, "billing blocked" is
one row in a 30-item table. Running the app, it is a red error under a $9.99 price tag on
a screen someone designed with real care — and next to it, fifteen padlocks and a
locked `Connections` tab that would have fed the moat.

The gap between this company and an investable one is not features, and it is not even
effort. Someone built a beautiful paywall. Nobody opened a Stripe account.

**Three actions, none of which are code:**

1. Open Stripe, set `STRIPE_SECRET_KEY` + `STRIPE_PRICE_FULL`. The button already exists.
2. Reconcile $9.99 vs $12.99 — and ship the annual tier the model already assumes.
3. Unlock `Connections` for free users. The wearable hookup is the mouth of the flywheel;
   charging for it is charging people to give you the asset you are trying to accumulate.
