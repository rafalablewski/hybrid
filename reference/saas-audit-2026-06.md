# HYBRID — Full SaaS & Subscription Audit

_Date: 2026-06-16 · Lens: scalable, profitable subscription business · Stance: ruthless, no sugar-coating._

**Profile (founder-confirmed):** Consumer-first hybrid-athlete app · pre-launch private
beta · $0 MRR · Full tier ~$5–8/mo · guest→account→paid funnel · competing with
Strong/Hevy · coach-led + viral + paid-ads channels · solo founder + AI agents.

---

## 1. Executive Summary & Verdict

**Overall potential: PROMISING (with a structural strategy flaw to fix before launch).**

> **One-sentence verdict:** You've engineered a Whoop/TrainingPeaks-grade performance
> engine and pointed it at the cheapest, highest-churn, least-defensible corner of the
> market — at a Hevy price you can't even charge yet — so the risk isn't the product,
> it's that _great engineering has been mistaken for a go-to-market_.

The asset is real and rare for a solo build. The business, today, is unproven in every
dimension that matters: **zero revenue, billing that physically cannot charge a customer,
and a flagship onboarding flow whose plan library is empty.** Fixable — but you are
further from a business than the codebase makes it feel.

---

## 2. Product–Market Fit

**JTBD lens.** The casual athlete's job is _"tell me what to do today and let me log it
in 10 seconds."_ The serious hybrid athlete's job is _"quantify and optimize my training
across strength + endurance."_ **You've built brilliantly for #2 and chosen to sell to
#1.** That's the core tension.

- ✅ **Real strengths:** the persona-shaping system (casual gets a lean loop, athlete gets
  the cockpit) is the right answer to feature-overwhelm, and it's genuinely well done. The
  accountability/churn engine, weekly recap, streaks, and PR celebrations are legitimate,
  above-category retention mechanics.
- 🚩 **The PMF hole:** `capabilities.ts` marks the **Plan library as `blocked` — "every
  goal's plan list is empty until real plans are uploaded."** Onboarding promises a
  personalized first plan and shows _"plans coming soon."_ For a consumer-first wedge,
  **the central "what do I do today" value is hollow for a brand-new user with no logged
  history.** This is a cold-start failure at the exact moment of first value. **You cannot
  launch a paid consumer product in this state.**
- 🚩 **Switcher mismatch:** the user switching _from Strong/Hevy_ values speed and
  simplicity. Your differentiation (HPI, velocity-based training, readiness) is exactly
  what that user _doesn't_ pay $5–8 for. You're strongest where your chosen buyer is
  weakest.

**PMF verdict: unproven, and partially blocked by empty content.**

---

## 3. Subscription Model Strength

| Dimension | Assessment |
|---|---|
| **Pricing level** | 🚩 **Underpriced and mis-anchored.** $4.99–7.99/mo plants you in the budget-logger band (Strong $4.99, Hevy ~$5–8). You've signalled "another logger" while carrying Whoop-tier capability. The anchor _is_ the positioning. |
| **Value capture** | 🚩 Massive leak. After Apple's cut (30%, or 15% small-business), a $5.99/mo sub nets **~$50/yr**. A performance OS at the price of a set-counter. |
| **Funnel** | ✅ Guest→account→paid is the right low-friction shape — train before signup crushes CAC. |
| **Retention mechanics** | ✅ Best part of the model — accountability engine, recap share, streaks, Future Self. Real D30 levers. |
| **Expansion revenue** | 🚩 **None at the consumer tier.** No seats, no usage-based expansion. NRR capped at "don't churn." Expansion lives in tiers you've chosen _not_ to lead with. |

**Benchmark reality:** consumer fitness is a 5–8%/mo churn category → median paid lifetime
~6–12 months. At $50/yr net, **LTV ≈ $30–80.** A monthly-only, sub-$8 plan is a churn
machine. **You need an annual plan to survive the math.**

---

## 4. Competitive Moat & Differentiation

**At the consumer tier: thin.** The engines are impressive but copyable by any funded
incumbent. Strong/Hevy have brand, distribution, and millions of users; if your depth
resonates, they ship a "readiness score" in a quarter.

**The real moat described in your docs — the data flywheel, the longitudinal Athlete Twin
(switching cost), the talent graph network effects — only exists upmarket (coach/org),
which you've deprioritized.** So your wedge choice selects the **least-defensible slice of
your own strategy.** Solo + AI build means no proprietary data, no distribution, and no
brand yet — the three things that would otherwise be a moat.

**Differentiation verdict:** technically differentiated, commercially undefended.

---

## 5. Unit Economics & Scalability

Rough envelope at $5.99/mo:

- **ARPU (net of Apple):** ~$50/yr monthly / ~$60–70/yr if annual.
- **LTV (net):** ~$30–80 depending on churn.
- **Fitness-app paid CAC:** typically **$30–100+ per paying subscriber** on Meta/ASA.

➡️ **Paid ads are break-even at best and underwater at worst with these numbers — and you
listed paid ads as a launch channel.** The roadmap itself names _"consumer churn
(high-churn category)"_ as risk #1. **Do not turn on paid ads until LTV is proven.**

✅ **Scalability of the product is excellent** — shared core, pure engines, near-zero
marginal cost per user (tier-able Haiku/Opus for the AI coach). The bottleneck is
**distribution economics, not infrastructure.** The only CAC-viable channels chosen —
**viral share loop and coach-led** — are the right ones. Paid is the odd one out.

---

## 6. Growth Potential

- ✅ **Coach-led is the highest-leverage lever** — each coach imports a roster at ~zero
  CAC. But it's a B2B2C motion in tension with "consumer first." **Resolve it: consumer
  PRODUCT, coach-led DISTRIBUTION** (§8).
- ✅ **Viral share loop** (recap images, PR cards) is built and well-suited; instrument
  k-factor.
- 🚩 **Organic App Store discovery for a solo founder is brutal** — don't rely on it.
- 🚩 **TAM ceiling at the consumer tier is the lowest of the four possible businesses.**
  The 10×–100× TAM (orgs, talent marketplace) is real but years out and correctly
  sequenced _after_ the data flywheel.

---

## 7. Top Risks & Red Flags (ranked by severity)

1. **🔴 CRITICAL — You cannot charge anyone today.** Billing is `code-complete but
   blocked`: no Stripe keys, no `SUPABASE_SERVICE_ROLE_KEY`, no Apple Developer account,
   no native IAP. iOS digital goods _must_ use Apple IAP. $0 MRR is structural, not just
   early.
2. **🔴 CRITICAL — Empty plan library hollows the consumer core value.** Flagship
   onboarding dead-ends at "coming soon." Launching paid here burns your one first
   impression.
3. **🟠 HIGH — Wedge ↔ moat mismatch.** Leading with the lowest-ACV, highest-churn,
   least-defensible segment while the moat lives upmarket.
4. **🟠 HIGH — Underpricing / mis-anchoring** against Strong/Hevy throws away value-capture
   and miscategorizes the product.
5. **🟠 HIGH — Focus / sprawl.** 60+ capabilities across 4 businesses, built solo; depth
   everywhere, distribution nowhere. Classic "build it and they'll come."
6. **🟡 MEDIUM — Paid-ads CAC > LTV** at this price/churn.
7. **🟡 MEDIUM — Solo + AI bus factor**: support, trust, and distribution all rest on one
   person.
8. **🟡 MEDIUM — Injury/RTP liability** (flagged in your own docs) as you surface
   readiness/risk guidance to consumers.

---

## 8. Actionable Recommendations

**Short-term (next 60–90 days — do these before any launch):**

1. **Unblock billing.** Buy the Apple Developer account ($99) and add Stripe keys. Ship
   **web Stripe checkout first** (no Apple tax) and route users there where permitted; use
   **RevenueCat** for iOS IAP to cut native work. _Update `capabilities.ts` as items
   unblock — per CLAUDE.md._
2. **Fill the plan library for the top 3 consumer goals.** Nothing else matters until the
   onboarding promise resolves to a real plan. This is the gate to a paid launch.
3. **Re-price.** Stop anchoring to Hevy. Recommended: **annual-forward — $9.99/mo or
   $59–79/yr**, with a 7-day trial _after_ the guest hook. The annual plan is the only way
   LTV clears CAC.
4. **Kill paid ads for now.** Pour energy into the share loop and recruiting **5–10
   micro-coaches as design-partner distributors.**
5. **Instrument one north-star (D30 retention)** and feed real save/churn labels back into
   the accountability engine — that's where the data moat starts.

**Strategic:**

6. **Reframe the wedge: consumer PRODUCT delivered through coach-led DISTRIBUTION.**
   Dissolves the wedge↔moat conflict — coaches give near-zero-CAC access to exactly the
   consumers you want to monetize, and seed the relationship data that becomes the
   switching cost.
7. **Sequence the continuum; do not build org/talent now.** Earn the data first; network
   effects only work _on top of_ a product people already use.
8. **Make the moat the data, not the engines.** Capture longitudinal Twin data from day
   one; "my athletic life lives here" is the only durable defense.

---

## 9. Final Score & Conditions for Success

### **5.5 / 10 — "Promising but unproven."**

A top-decile engineering asset wrapped around an untested, underpriced, currently-
unchargeable consumer business aimed at its least-defensible segment. The ceiling is high;
the current trajectory is not yet a company.

**This becomes a 7.5+ only if ALL of these hold:**

- ✅ Billing live and **first 100 paying users** acquired (proves anyone will pay at all).
- ✅ Plan library filled — onboarding delivers real value on day one.
- ✅ **D30 retention ≥ 25–30%** and **free→paid ≥ 3–5%** demonstrated before scaling spend.
- ✅ Repriced to **annual-forward** so LTV clears the cheapest CAC channel.
- ✅ Distribution proven through **coaches/share loop**, not paid ads.
- ✅ Ruthless focus: consumer wedge only, continuum deferred until the data flywheel turns.

**Bottom line:** not a product problem — a _focus, monetization, and distribution_ problem
sitting on top of an unusually strong product. Fix the four short-term items and the empty
plan library, prove retention with the first 100 paying users, and this is genuinely
fundable. Ship it broad and unpriced and it joins the graveyard of beautifully-engineered
fitness apps nobody paid for.
