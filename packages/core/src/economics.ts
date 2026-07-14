/**
 * Economics — HYBRID's business model + unit-economics engine.
 *
 * The single source of truth for HOW the app makes money (revenue streams +
 * pricing tiers), WHAT it costs to run (cost drivers / COGS + fixed opex), and a
 * pure `computeEconomics()` that turns a set of editable assumptions into a full
 * SaaS picture:
 *   • revenue (MRR/ARR by stream) + blended ARPU + gross margin / COGS breakdown
 *   • PER-SEGMENT unit economics (B2C vs coach: ARPU, contribution margin, LTV,
 *     CAC payback, LTV:CAC) instead of one mushy blended number
 *   • the SaaS health scorecard investors actually look at — Rule of 40, net &
 *     gross revenue retention, the SaaS quick ratio, magic number, burn multiple
 *     and cash runway
 *   • a 12-month forward projection (MRR trajectory, monthly P&L, cumulative
 *     cash) with the modeled break-even month and cash-out month
 *
 * Plus `METRIC_GUIDE`: a plain-language glossary (what each metric means, the
 * formula, and the benchmark to beat) so the screen explains itself.
 *
 * Pure + unit-tested. Surfaced in the admin "Financials" screen, seeded from the
 * real /api/admin/stats counts. This is a MODELING tool — live charging is the
 * separate, blocked `billing` capability (needs Stripe keys). Keep the defaults
 * honest: they're documented planning assumptions, not booked revenue.
 */

// ----------------------------------------------------------------------------
// Revenue model (the narrative — "how we make money / what people pay for")
// ----------------------------------------------------------------------------

export type RevenueStreamId = "b2c" | "coach" | "org" | "data";

export interface PricingTier {
  /** Display name. */
  name: string;
  /** Price label as shown to a human (e.g. "$12.99/mo", "~$40–80/athlete/yr"). */
  price: string;
  /** Who/what it's for. */
  note: string;
}

export interface RevenueStream {
  id: RevenueStreamId;
  label: string;
  /** Who hands over the money. */
  whoPays: string;
  /** The mechanic — how the charge actually works. */
  howItWorks: string;
  tiers: PricingTier[];
  /** Streams flagged future aren't priced into the live margin math. */
  future?: boolean;
}

export const REVENUE_STREAMS: RevenueStream[] = [
  {
    id: "b2c",
    label: "Consumer Pro (B2C)",
    whoPays: "The individual athlete",
    howItWorks:
      "Freemium: guest + basic logging are free forever; the intelligence (Performance State, Future Self, AI coach, velocity-based training, adaptive nutrition, unlimited history) sits behind a personal Pro subscription. The free first workout (guest mode) is the top of the funnel.",
    tiers: [
      { name: "Free", price: "$0", note: "Guest + basic logging, 30-day history." },
      { name: "Pro (monthly)", price: "$12.99/mo", note: "Everything: Performance State, AI coach, VBT, nutrition, unlimited history." },
      { name: "Pro (annual)", price: "$99/yr", note: "Same as Pro, ~36% off for paying yearly up front." },
    ],
  },
  {
    id: "coach",
    label: "Coaching seats (B2B2C)",
    whoPays: "PTs & online coaches (per roster)",
    howItWorks:
      "The coach pays a monthly seat fee scaled to roster size; their rostered athletes get the full adaptive (Pro) experience included ON THE COACH'S SEAT — no per-client subscription. The coach builds a plan and assigns it straight into a client's account (or to a whole client group at once); the weekly check-in (the coaching heartbeat) is the recurring ritual clients stay for, so the seat compounds with retention.",
    tiers: [
      { name: "Starter", price: "$29/mo", note: "Up to 10 athletes." },
      { name: "Pro", price: "$79/mo", note: "Up to 40 athletes + client groups & bulk plan assignment." },
      { name: "Business", price: "$199/mo", note: "Up to 150 athletes + Team OS (org graph, roles, segmentation)." },
    ],
  },
  {
    id: "org",
    label: "Org / Enterprise",
    whoPays: "Clubs, federations, tactical units",
    howItWorks:
      "Annual, per-athlete contracts for the institution: the Org Graph (roles × team subtree), medical-tier injury detail, video intelligence, talent graph and return-to-play rails. Sold top-down; expands by seats and teams.",
    tiers: [
      { name: "Custom", price: "~$40–80 / athlete / yr", note: "Annual contract; price scales with size + modules." },
    ],
  },
  {
    id: "data",
    label: "Data network (future)",
    whoPays: "Federations & brands (later)",
    howItWorks:
      "Anonymized, k-anonymized cohort benchmarking intelligence sold as an aggregate data layer — never raw rows. Compounds as the population grows (the moat). Listed as a future line; NOT counted in the live margin math.",
    future: true,
    tiers: [
      { name: "Planned", price: "TBD", note: "Benchmarking / outcomes data licensing once the network has scale." },
    ],
  },
];

// ----------------------------------------------------------------------------
// Cost drivers (the COGS + fixed opex — "what it costs us to run")
// ----------------------------------------------------------------------------

export type CostKind = "cogs" | "fixed";

export interface CostDriver {
  id: string;
  label: string;
  kind: CostKind;
  /** Human-readable default rate (e.g. "$4.00 / active AI user / mo"). */
  rate: string;
  note: string;
}

export const COST_DRIVERS: CostDriver[] = [
  {
    id: "ai",
    label: "Anthropic (AI coach)",
    kind: "cogs",
    rate: "~$2.00 / active AI user / mo",
    note: "Claude (Opus) server-side calls for the AI coach, with prompt caching. Only billed for the share of users who actually use it (aiActivePct). Switches on with ANTHROPIC_API_KEY — see the `ai-coach` capability.",
  },
  {
    id: "infra",
    label: "Supabase + Vercel (marginal)",
    kind: "cogs",
    rate: "~$0.20 / active user / mo",
    note: "Usage-based DB/auth/storage (Supabase) + edge compute (Vercel) attributable per active user, on top of the base plans below.",
  },
  {
    id: "stripe",
    label: "Stripe (payment fees)",
    kind: "cogs",
    rate: "2.9% + $0.30 / charge",
    note: "Processing on every subscription charge. Applies once `billing` is live — the revenue layer is currently blocked on Stripe keys.",
  },
  {
    id: "support",
    label: "Coach success / support",
    kind: "cogs",
    rate: "~$3.00 / coach seat / mo",
    note: "Human time servicing a coach account (onboarding, success, support) beyond the marginal infra their athletes already cost. Scales with the coach base, not the athlete base.",
  },
  {
    id: "fixed",
    label: "Fixed opex (base)",
    kind: "fixed",
    rate: "~$72 / mo",
    note: "Real recurring run-rate, independent of user count — itemized in the table below (Supabase Pro, the Claude API agent budget, Apple Developer, and the domains/mailbox). One-time domain setup is listed there too but kept out of the monthly figure. FX $1 ≈ zł3.71 (18 Jun 2026).",
  },
];

/** A single fixed-opex line, normalized to a monthly USD run-rate. */
export interface FixedOpexItem {
  label: string;
  /** As actually billed (native cadence + currency). */
  billed: string;
  /** Monthly USD run-rate. 0 for one-time or not-yet-paid items. */
  monthlyUsd: number;
  /** Whether it's part of the recurring monthly figure, a one-time cost, or a future add. */
  kind: "recurring" | "oneTime" | "future";
  /** Optional qualifier (e.g. when a future cost kicks in). */
  note?: string;
}

/**
 * The fixed-opex line items behind the ~$64/mo figure. The recurring rows sum to
 * `fixedOpexMonthly`; one-time + future rows are listed for context but excluded
 * from the monthly run-rate. FX $1 ≈ zł3.71 (18 Jun 2026).
 */
export const FIXED_OPEX_ITEMS: FixedOpexItem[] = [
  { label: "Supabase Pro", billed: "$25 / mo", monthlyUsd: 25, kind: "recurring" },
  { label: "Claude API (internal AI agents)", billed: "$20 / mo", monthlyUsd: 20, kind: "recurring" },
  { label: "Apple Developer account", billed: "$99 / yr", monthlyUsd: 99 / 12, kind: "recurring" },
  { label: "hybrid.app domain renewal", billed: "$100 / yr", monthlyUsd: 100 / 12, kind: "recurring" },
  { label: "@hybriddomain.xyz mailbox", billed: "zł31.50 / mo", monthlyUsd: 31.5 / 3.71, kind: "recurring" },
  { label: "hybriddomain.xyz renewal", billed: "$23.99 / yr", monthlyUsd: 23.99 / 12, kind: "recurring" },
  { label: "hybrid.app premium domain", billed: "$300 one-time", monthlyUsd: 0, kind: "oneTime" },
  { label: "hybriddomain.xyz registration", billed: "zł5.34 one-time", monthlyUsd: 0, kind: "oneTime" },
];

/** Sum of the recurring fixed-opex lines — the monthly run-rate. */
export const fixedOpexMonthlyTotal = (): number =>
  FIXED_OPEX_ITEMS.filter((i) => i.kind === "recurring").reduce((s, i) => s + i.monthlyUsd, 0);

// ----------------------------------------------------------------------------
// Focus markets + localized pricing (where we sell, and for how much)
// ----------------------------------------------------------------------------

/** The five launch markets HYBRID focuses on. */
export type MarketId = "us" | "uk" | "eu" | "pl" | "sg";

/** The day the FX rates + localized prices below were set (for the readout). */
export const PRICING_REF_DATE = "2026-06-18";

export interface MarketPricing {
  id: MarketId;
  /** Market / region name. */
  market: string;
  flag: string;
  /** ISO-4217 currency code. */
  currency: string;
  symbol: string;
  /** Local-currency units per 1 USD on PRICING_REF_DATE (drives the USD-equivalent). */
  fxPerUsd: number;
  /** Consumer tax baked into (or added to) the headline price. */
  tax: string;
  /** Stripe domestic card processing fee in this market. */
  stripeFee: string;
  /** Headline price level vs the US anchor on a purchasing-power lens (US = 1.00). */
  priceIndex: number;
  /** Consumer Pro — monthly + annual, in local currency. */
  proMonthly: number;
  proAnnual: number;
  /** Coaching seats — monthly, local currency. */
  coachStarter: number;
  coachPro: number;
  coachBusiness: number;
  /** Org / enterprise — per athlete / year band, local currency. */
  orgLow: number;
  orgHigh: number;
  /** Why this market is priced where it is. */
  rationale: string;
}

/**
 * Where HYBRID sells and what it charges. The US is the anchor (price set first);
 * every other market localizes off it on a purchasing-power lens, then rounds to
 * the price point that market actually expects. The USD-equivalent (local ÷ FX)
 * is what we keep before that market's tax + Stripe fee, so two markets at the
 * same headline can net very differently.
 */
export const MARKET_PRICING: MarketPricing[] = [
  {
    id: "us",
    market: "United States",
    flag: "🇺🇸",
    currency: "USD",
    symbol: "$",
    fxPerUsd: 1,
    tax: "Sales tax added at checkout (varies by state)",
    stripeFee: "2.9% + $0.30",
    priceIndex: 1.0,
    proMonthly: 12.99,
    proAnnual: 99,
    coachStarter: 29,
    coachPro: 79,
    coachBusiness: 199,
    orgLow: 40,
    orgHigh: 80,
    rationale: "Anchor market — highest willingness-to-pay. Price set here first; every other market indexes off it.",
  },
  {
    id: "uk",
    market: "United Kingdom",
    flag: "🇬🇧",
    currency: "GBP",
    symbol: "£",
    fxPerUsd: 0.745,
    tax: "VAT 20% included",
    stripeFee: "1.5% + £0.20",
    priceIndex: 0.92,
    proMonthly: 9.99,
    proAnnual: 79,
    coachStarter: 25,
    coachPro: 65,
    coachBusiness: 175,
    orgLow: 32,
    orgHigh: 64,
    rationale: "£9.99 is the price point a $12.99 US app lands on. VAT-inclusive display, and lower UK/EU Stripe fees offset the slightly lower headline.",
  },
  {
    id: "eu",
    market: "European Union (ex-PL)",
    flag: "🇪🇺",
    currency: "EUR",
    symbol: "€",
    fxPerUsd: 0.856,
    tax: "VAT ~20–23% included (varies by country)",
    stripeFee: "1.5% + €0.25",
    priceIndex: 1.0,
    proMonthly: 11.99,
    proAnnual: 99,
    coachStarter: 29,
    coachPro: 79,
    coachBusiness: 199,
    orgLow: 38,
    orgHigh: 75,
    rationale: "Eurozone, near numeric parity with USD. A strong euro means the effective USD take runs a touch above the US — that headroom covers VAT-inclusive pricing.",
  },
  {
    id: "pl",
    market: "Poland",
    flag: "🇵🇱",
    currency: "PLN",
    symbol: "zł",
    fxPerUsd: 3.71,
    tax: "VAT 23% included",
    stripeFee: "1.5% + zł1.00",
    priceIndex: 0.6,
    proMonthly: 29,
    proAnnual: 249,
    coachStarter: 99,
    coachPro: 269,
    coachBusiness: 699,
    orgLow: 120,
    orgHigh: 240,
    rationale: "A focus home market, but ~40% lower purchasing power than the US (OECD PPP). Consumer Pro localizes to ~zł29/mo (~60% of the US price) to drive adoption; the B2B coach/org seats discount less because the buyer is a business.",
  },
  {
    id: "sg",
    market: "Singapore",
    flag: "🇸🇬",
    currency: "SGD",
    symbol: "S$",
    fxPerUsd: 1.285,
    tax: "GST 9% included",
    stripeFee: "3.4% + S$0.50",
    priceIndex: 1.02,
    proMonthly: 16.99,
    proAnnual: 139,
    coachStarter: 39,
    coachPro: 105,
    coachBusiness: 265,
    orgLow: 52,
    orgHigh: 104,
    rationale: "High-income hub for SE-Asia expansion, near-US willingness-to-pay. GST-inclusive display and Singapore's higher Stripe fee (3.4% + S$0.50) put the headline a touch above the US in USD terms.",
  },
];

/** Local-currency amount → USD at the reference FX (guarded against a 0 rate). */
export const toUsd = (local: number, fxPerUsd: number): number => (fxPerUsd > 0 ? local / fxPerUsd : 0);

// ----------------------------------------------------------------------------
// Entitlement matrix — what each plan actually gets ("what user gets what")
// ----------------------------------------------------------------------------

export type PlanId = "free" | "pro" | "coach" | "org";

export interface PlanColumn {
  id: PlanId;
  label: string;
  /** Headline price (US anchor). */
  price: string;
  /** Who is on this plan. */
  who: string;
}

export const PLAN_COLUMNS: PlanColumn[] = [
  { id: "free", label: "Free", price: "$0", who: "Guest & casual — track and share" },
  { id: "pro", label: "Pro", price: "$12.99/mo – $99/yr", who: "The individual athlete (paid)" },
  { id: "coach", label: "Coach", price: "$29–199/mo seat", who: "Coach + their roster (Pro included)" },
  { id: "org", label: "Org", price: "Custom / athlete / yr", who: "Clubs – federations – units" },
];

/** A cell: false = not included, true = included, string = included with a qualifier. */
export type EntitlementCell = boolean | string;

export interface EntitlementRow {
  group: string;
  feature: string;
  free: EntitlementCell;
  pro: EntitlementCell;
  coach: EntitlementCell;
  org: EntitlementCell;
}

/**
 * The single source of truth for what each plan unlocks — the "what user gets
 * what" matrix surfaced in the admin Business/Financials console. Tiers nest:
 * Pro ⊂ Coach ⊂ Org (a coach seat includes Pro for the coach + their roster; org
 * includes everything plus the institutional layer). Free is the loss-leader
 * logging loop that's free forever.
 */
export const ENTITLEMENT_MATRIX: EntitlementRow[] = [
  // Logging — free forever (the top of the funnel)
  { group: "Log & basics (free forever)", feature: "Session logging, interval timer, run tracking", free: true, pro: true, coach: true, org: true },
  { group: "Log & basics (free forever)", feature: "Calendar & training history", free: "30-day", pro: "Unlimited", coach: "Unlimited", org: "Unlimited" },
  { group: "Log & basics (free forever)", feature: "Pre-built plan library — browse, enroll & follow as written", free: true, pro: true, coach: true, org: true },
  { group: "Log & basics (free forever)", feature: "Daily check-in & progress photos", free: true, pro: true, coach: true, org: true },
  { group: "Log & basics (free forever)", feature: "Export your own data (GDPR)", free: true, pro: true, coach: true, org: true },

  // Intelligence — the paid Pro layer
  { group: "Intelligence (Pro)", feature: "Performance State – HPI", free: false, pro: true, coach: true, org: true },
  { group: "Intelligence (Pro)", feature: "Future Self projection & goal ETA", free: false, pro: true, coach: true, org: true },
  { group: "Intelligence (Pro)", feature: "AI coach (Claude)", free: false, pro: true, coach: true, org: true },
  { group: "Intelligence (Pro)", feature: "Tissue-level injury risk", free: false, pro: true, coach: true, org: "Medical-tier" },
  { group: "Intelligence (Pro)", feature: "Deep analytics dashboards", free: false, pro: true, coach: true, org: true },

  // Training depth — Pro (the pre-built plan library itself is free; the smart
  // layer on top — periodizing your season — is the paid line)
  { group: "Training depth (Pro)", feature: "Periodization (build your season)", free: false, pro: true, coach: true, org: true },
  { group: "Training depth (Pro)", feature: "Adaptive progression (loads auto-adjust to recovery)", free: false, pro: true, coach: true, org: true },
  { group: "Training depth (Pro)", feature: "Template builder", free: "2 saved templates", pro: "Unlimited", coach: "Unlimited", org: "Unlimited" },
  { group: "Training depth (Pro)", feature: "Competition peaking", free: false, pro: true, coach: true, org: true },
  { group: "Training depth (Pro)", feature: "Sport-specific S&C", free: false, pro: true, coach: true, org: true },
  { group: "Training depth (Pro)", feature: "Velocity (VBT) – force plate – video", free: false, pro: true, coach: true, org: true },
  { group: "Training depth (Pro)", feature: "Adaptive nutrition & longevity", free: false, pro: true, coach: true, org: true },

  // Coaching & teams — the coach seat
  { group: "Coaching & teams (Coach seat)", feature: "Roster, client notes & check-in replies", free: false, pro: false, coach: true, org: true },
  { group: "Coaching & teams (Coach seat)", feature: "Assign plans into a client's account", free: false, pro: false, coach: true, org: true },
  { group: "Coaching & teams (Coach seat)", feature: "Build & assign multi-week programs", free: false, pro: false, coach: true, org: true },
  { group: "Coaching & teams (Coach seat)", feature: "Client groups + bulk plan/program assignment", free: false, pro: false, coach: "Pro seat+", org: true },
  { group: "Coaching & teams (Coach seat)", feature: "Rostered clients get the adaptive experience (no per-client sub)", free: false, pro: false, coach: true, org: true },
  { group: "Coaching & teams (Coach seat)", feature: "Squad monitor & team compare", free: false, pro: false, coach: true, org: true },
  { group: "Coaching & teams (Coach seat)", feature: "Private coaching notes", free: false, pro: false, coach: true, org: true },

  // Organization — the enterprise layer
  { group: "Organization (Enterprise)", feature: "Org graph (roles × team subtree)", free: false, pro: false, coach: "Business tier", org: true },
  { group: "Organization (Enterprise)", feature: "Medical-tier injury detail & return-to-play", free: false, pro: false, coach: false, org: true },
  { group: "Organization (Enterprise)", feature: "Video intelligence & talent graph", free: false, pro: false, coach: false, org: true },
];

// ----------------------------------------------------------------------------
// Assumptions + result
// ----------------------------------------------------------------------------

/** Share of the coach base on each seat tier (should sum to ~1). */
export interface CoachTierMix {
  starter: number;
  pro: number;
  business: number;
}

export interface EconomicAssumptions {
  // --- audience (seeded from /api/admin/stats) ---
  totalUsers: number;
  coaches: number;

  // --- B2C ---
  proConversionPct: number; // % of totalUsers on Pro
  proPriceMonthly: number; // $/mo
  annualMixPct: number; // % of Pro subs paying annually
  proPriceAnnual: number; // $/yr (effective monthly = /12)

  // --- coaching ---
  coachTierMix: CoachTierMix;
  coachStarterPrice: number; // $/mo
  coachProPrice: number; // $/mo
  coachBusinessPrice: number; // $/mo

  // --- org ---
  orgAthletes: number;
  orgPricePerAthleteYear: number; // $/athlete/yr

  // --- costs ---
  aiActivePct: number; // % of totalUsers using the AI coach
  aiCostPerUserMonthly: number; // $/active AI user/mo
  infraCostPerUserMonthly: number; // $/active user/mo
  coachServiceCostMonthly: number; // $/coach seat/mo (success + support)
  fixedOpexMonthly: number; // $/mo
  stripeFeePct: number; // e.g. 2.9
  stripeFlatPerCharge: number; // e.g. 0.30

  // --- retention & acquisition (per segment — the honest way) ---
  b2cMonthlyChurnPct: number; // % of Pro base lost per month
  coachMonthlyChurnPct: number; // % of coach base lost per month
  b2cCac: number; // $ to acquire one Pro subscriber
  coachCac: number; // $ to acquire one coach seat

  // --- growth dynamics (drive the forward projection + SaaS ratios) ---
  monthlyGrowthPct: number; // new logo growth on the paying base, %/mo
  monthlyExpansionPct: number; // net expansion (upsell/seat growth) on existing MRR, %/mo
  cashOnHand: number; // $ in the bank — sets the runway
}

export const DEFAULT_ASSUMPTIONS: EconomicAssumptions = {
  totalUsers: 1000,
  coaches: 20,

  proConversionPct: 5,
  proPriceMonthly: 12.99,
  annualMixPct: 30,
  proPriceAnnual: 99,

  coachTierMix: { starter: 0.6, pro: 0.3, business: 0.1 },
  coachStarterPrice: 29,
  coachProPrice: 79,
  coachBusinessPrice: 199,

  orgAthletes: 0,
  orgPricePerAthleteYear: 60,

  aiActivePct: 15,
  aiCostPerUserMonthly: 2,
  infraCostPerUserMonthly: 0.2,
  coachServiceCostMonthly: 3,
  fixedOpexMonthly: 72,
  stripeFeePct: 2.9,
  stripeFlatPerCharge: 0.3,

  b2cMonthlyChurnPct: 6,
  coachMonthlyChurnPct: 3,
  b2cCac: 25,
  coachCac: 180,

  monthlyGrowthPct: 8,
  monthlyExpansionPct: 1.5,
  cashOnHand: 50000,
};

/** Number of months the forward projection runs. */
export const PROJECTION_MONTHS = 12;

export interface RevenueBreakdown {
  b2c: number;
  coach: number;
  org: number;
  total: number;
}

export interface CogsBreakdown {
  ai: number;
  infra: number;
  stripe: number;
  support: number;
  fixed: number;
  total: number;
}

/** Unit economics for one customer segment (B2C or coach). */
export interface SegmentEconomics {
  label: string;
  /** Paying units in this segment. */
  payingUnits: number;
  /** Monthly recurring revenue from the segment. */
  mrr: number;
  /** Monthly revenue per paying unit. */
  arpu: number;
  /** Contribution margin for the segment, 0..1 (can be negative). */
  grossMargin: number;
  /** Monthly churn for the segment, as a fraction. */
  monthlyChurn: number;
  /** Cost to acquire one unit. */
  cac: number;
  /** Lifetime value: arpu × margin ÷ churn (Infinity at zero churn). */
  ltv: number;
  /** Months to recoup CAC from gross-margin dollars (Infinity if never). */
  cacPaybackMonths: number;
  /** LTV ÷ CAC (Infinity if CAC is 0). */
  ltvToCac: number;
}

/** The SaaS health scorecard — the ratios that read a business at a glance. */
export interface HealthIndicators {
  /** Annualized growth of the paying base, %. */
  annualGrowthRatePct: number;
  /** Rule of 40: annual growth % + gross margin %. Healthy ≥ 40. */
  ruleOf40: number;
  /** Gross revenue retention, annualized %: (1 − churn)¹². */
  grossRetentionAnnualPct: number;
  /** Net revenue retention, annualized %: (1 − churn + expansion)¹². */
  netRetentionAnnualPct: number;
  /** SaaS quick ratio: (new + expansion MRR) ÷ churned MRR. Healthy ≥ 4. */
  quickRatio: number;
  /** Magic number: net-new ARR ÷ S&M spend (CAC × new units). Healthy ≥ 0.75. */
  magicNumber: number;
  /** Burn multiple: net burn ÷ net-new MRR. Lower is better (< 1 great). */
  burnMultiple: number;
  /** Months of runway at the current burn (Infinity if profitable). */
  runwayMonths: number;
  /** First-month net-new MRR (new + expansion − churned). */
  netNewMrr: number;
}

/** One month of the forward projection. */
export interface ForecastPoint {
  month: number; // 0 = today
  mrr: number;
  customers: number;
  /** Monthly net (revenue − variable COGS − fixed). */
  profit: number;
  /** Running cash including the starting balance. */
  cumulativeCash: number;
}

export interface ForecastSummary {
  months: number;
  endingMrr: number;
  endingArr: number;
  /** First month the monthly P&L turns positive (0 = already, null = not within horizon). */
  breakEvenMonth: number | null;
  /** First month cumulative cash goes negative (null = never within horizon). */
  cashOutMonth: number | null;
  cumulativeCashEnd: number;
}

export interface EconomicResult {
  /** Monthly recurring revenue by stream + total. */
  revenue: RevenueBreakdown;
  /** Annual recurring revenue (mrr × 12). */
  arr: number;
  /** Distinct paying customers (Pro subs + coaches + org as one account). */
  payingUnits: number;
  /** Blended monthly revenue per paying unit. */
  blendedArpu: number;
  /** Monthly cost of goods + fixed opex. */
  cogs: CogsBreakdown;
  /** revenue.total − cogs.total. */
  grossProfit: number;
  /** grossProfit / revenue.total, 0..1 (0 when no revenue). */
  grossMargin: number;
  /** Per-segment unit economics — the honest, un-blended view. */
  segments: { b2c: SegmentEconomics; coach: SegmentEconomics };
  /** Blended lifetime value (revenue-weighted across paying segments). */
  ltv: number;
  /** Blended months to recoup CAC from gross-margin dollars (Infinity if never). */
  cacPaybackMonths: number;
  /** Blended LTV ÷ CAC (Infinity if CAC is 0). */
  ltvToCac: number;
  /** Same as grossProfit — the monthly contribution (negative = burn). */
  monthlyContribution: number;
  /** Pro subscribers needed for the whole model to break even (covers fixed). */
  breakEvenProUsers: number;
  /** The SaaS health scorecard. */
  health: HealthIndicators;
  /** 12-month forward trajectory. */
  projection: ForecastPoint[];
  projectionSummary: ForecastSummary;
}

// ----------------------------------------------------------------------------
// Plain-language glossary (so the screen explains itself)
// ----------------------------------------------------------------------------

export interface MetricGuide {
  id: string;
  label: string;
  /** What it tells you, in one human sentence. */
  what: string;
  /** How it's computed. */
  formula: string;
  /** The number to beat. */
  benchmark: string;
}

export const METRIC_GUIDE: MetricGuide[] = [
  { id: "mrr", label: "MRR / ARR", what: "Predictable subscription revenue per month (MRR) and per year (ARR) — the headline size of the business.", formula: "MRR = Σ revenue per stream – ARR = MRR × 12", benchmark: "Grow it; everything else is a ratio on top." },
  { id: "arpu", label: "Blended ARPU", what: "Average monthly revenue per paying customer across all streams.", formula: "total MRR ÷ paying units", benchmark: "Higher ARPU makes CAC easier to pay back." },
  { id: "margin", label: "Gross margin", what: "Share of revenue left after the cost to serve (AI, infra, payments, support).", formula: "(revenue − COGS) ÷ revenue", benchmark: "Software SaaS: 75–85%+." },
  { id: "ltv", label: "LTV", what: "Lifetime gross-profit a customer throws off before they churn.", formula: "ARPU × gross margin ÷ monthly churn", benchmark: "Compare to CAC, not in isolation." },
  { id: "cac", label: "CAC", what: "Fully-loaded cost to acquire one paying customer.", formula: "sales & marketing ÷ new customers", benchmark: "Lower is better; judge via payback + LTV:CAC." },
  { id: "payback", label: "CAC payback", what: "Months of gross profit needed to earn back one customer's CAC.", formula: "CAC ÷ (ARPU × gross margin)", benchmark: "< 12 months is healthy." },
  { id: "ltvcac", label: "LTV : CAC", what: "Return on each acquisition dollar over a customer's life.", formula: "LTV ÷ CAC", benchmark: "≥ 3× healthy; < 1× you lose money per customer." },
  { id: "ruleof40", label: "Rule of 40", what: "The growth-vs-profit trade-off — fast growth can excuse thin margins, and vice-versa.", formula: "annual growth % + gross margin %", benchmark: "≥ 40 is the bar." },
  { id: "nrr", label: "Net revenue retention", what: "What last year's customers are worth a year later, including upsell, before any new logos.", formula: "(1 − churn + expansion)¹²", benchmark: "> 100% means you grow even with zero new sales; 110%+ is great." },
  { id: "grr", label: "Gross revenue retention", what: "Revenue you keep from existing customers — no expansion credit. The pure stickiness number.", formula: "(1 − churn)¹²", benchmark: "> 90% (SMB) to > 95% (enterprise)." },
  { id: "quickratio", label: "Quick ratio", what: "How fast you add revenue versus how fast you bleed it.", formula: "(new + expansion MRR) ÷ churned MRR", benchmark: "≥ 4 is efficient growth." },
  { id: "magic", label: "Magic number", what: "Sales efficiency — new ARR generated per dollar of acquisition spend.", formula: "net-new ARR ÷ S&M spend", benchmark: "≥ 0.75 means lean in on spend." },
  { id: "burnmultiple", label: "Burn multiple", what: "Dollars burned for every dollar of net-new recurring revenue added.", formula: "net burn ÷ net-new MRR", benchmark: "< 1 great – 1–2 ok – > 2 inefficient." },
  { id: "runway", label: "Runway", what: "Months until the cash runs out at the current burn.", formula: "cash on hand ÷ monthly burn", benchmark: "Raise/cut before it drops under ~6 months." },
  { id: "breakeven", label: "Break-even", what: "The point the business stops losing money — both as a subscriber count today and as a month in the forecast.", formula: "fixed cost ÷ per-unit contribution", benchmark: "Sooner = less capital needed." },
];

// ----------------------------------------------------------------------------
// The calculator
// ----------------------------------------------------------------------------

const clampPct = (n: number) => Math.max(0, n) / 100;
const pos = (n: number) => Math.max(0, n);

/** Unit-economics for a single segment from its ARPU, margin, churn and CAC. */
function segment(
  label: string,
  payingUnits: number,
  mrr: number,
  arpu: number,
  grossMargin: number,
  monthlyChurn: number,
  cac: number,
): SegmentEconomics {
  const marginPerUnit = arpu * grossMargin;
  const ltv = monthlyChurn > 0 ? (arpu * pos(grossMargin)) / monthlyChurn : Infinity;
  const cacPaybackMonths = marginPerUnit > 0 ? pos(cac) / marginPerUnit : Infinity;
  const ltvToCac = cac > 0 ? ltv / cac : Infinity;
  return { label, payingUnits, mrr, arpu, grossMargin, monthlyChurn, cac, ltv, cacPaybackMonths, ltvToCac };
}

/**
 * Project the unit economics from a set of assumptions. Pure: same input →
 * same output, never throws, guards every divide.
 */
export function computeEconomics(a: EconomicAssumptions): EconomicResult {
  const stripe = clampPct(a.stripeFeePct);

  // --- B2C: Pro subscribers, blended monthly across monthly + annual plans ---
  const proUsers = Math.round(pos(a.totalUsers) * clampPct(a.proConversionPct));
  const annualShare = clampPct(a.annualMixPct);
  const proMonthlyRevPerUser =
    (1 - annualShare) * pos(a.proPriceMonthly) + annualShare * (pos(a.proPriceAnnual) / 12);
  const b2c = proUsers * proMonthlyRevPerUser;

  // --- Coaching: split the coach base across the three seat tiers ---
  const coaches = pos(a.coaches);
  const mix = a.coachTierMix;
  const coachArpu =
    pos(mix.starter) * pos(a.coachStarterPrice) +
    pos(mix.pro) * pos(a.coachProPrice) +
    pos(mix.business) * pos(a.coachBusinessPrice);
  const coachRev = coaches * coachArpu;

  // --- Org: per-athlete annual contracts, expressed monthly ---
  const org = (pos(a.orgAthletes) * pos(a.orgPricePerAthleteYear)) / 12;

  const totalRev = b2c + coachRev + org;

  // --- COGS ---
  const aiActiveShare = clampPct(a.aiActivePct);
  const aiUsers = pos(a.totalUsers) * aiActiveShare;
  const aiCost = aiUsers * pos(a.aiCostPerUserMonthly);
  const infraCost = pos(a.totalUsers) * pos(a.infraCostPerUserMonthly);
  const supportCost = coaches * pos(a.coachServiceCostMonthly);
  // Stripe: % of revenue + a flat fee per paying account's monthly charge.
  const payingUnits = proUsers + coaches + (a.orgAthletes > 0 ? 1 : 0);
  const stripeCost = totalRev * stripe + payingUnits * pos(a.stripeFlatPerCharge);
  const fixed = pos(a.fixedOpexMonthly);
  const totalCogs = aiCost + infraCost + stripeCost + supportCost + fixed;

  const grossProfit = totalRev - totalCogs;
  const grossMargin = totalRev > 0 ? grossProfit / totalRev : 0;
  const blendedArpu = payingUnits > 0 ? totalRev / payingUnits : 0;

  // --- Per-segment unit economics (un-blended) ---
  // B2C contribution: a Pro user's revenue minus the costs that scale with them.
  const b2cMarginPerUser =
    proMonthlyRevPerUser * (1 - stripe) -
    pos(a.infraCostPerUserMonthly) -
    aiActiveShare * pos(a.aiCostPerUserMonthly);
  const b2cMargin = proMonthlyRevPerUser > 0 ? b2cMarginPerUser / proMonthlyRevPerUser : 0;
  const b2cChurn = clampPct(a.b2cMonthlyChurnPct);
  const b2cSeg = segment("B2C Pro", proUsers, b2c, proMonthlyRevPerUser, b2cMargin, b2cChurn, pos(a.b2cCac));

  // Coach contribution: seat revenue minus payment fees + the human cost to serve
  // the account (their athletes' infra/AI is already in the platform COGS above).
  const coachMarginPerSeat = coachArpu * (1 - stripe) - pos(a.coachServiceCostMonthly);
  const coachMargin = coachArpu > 0 ? coachMarginPerSeat / coachArpu : 0;
  const coachChurn = clampPct(a.coachMonthlyChurnPct);
  const coachSeg = segment("Coach seats", coaches, coachRev, coachArpu, coachMargin, coachChurn, pos(a.coachCac));

  // --- Blended LTV / CAC (revenue-weighted churn, unit-weighted CAC) ---
  const segRev = b2c + coachRev;
  const blendedChurn = segRev > 0 ? (b2c * b2cChurn + coachRev * coachChurn) / segRev : 0;
  const segUnits = proUsers + coaches;
  const blendedCac = segUnits > 0 ? (proUsers * pos(a.b2cCac) + coaches * pos(a.coachCac)) / segUnits : 0;
  const ltv = blendedChurn > 0 ? (blendedArpu * pos(grossMargin)) / blendedChurn : Infinity;
  const blendedMarginPerUnit = blendedArpu * grossMargin;
  const cacPaybackMonths = blendedMarginPerUnit > 0 ? blendedCac / blendedMarginPerUnit : Infinity;
  const ltvToCac = blendedCac > 0 ? ltv / blendedCac : Infinity;

  // --- Break-even: how many Pro users (holding everything else) clear the loss ---
  const perProGross = b2cMarginPerUser;
  const nonProContribution = coachRev * (1 - stripe) - supportCost + org * (1 - stripe);
  const uncovered = fixed - nonProContribution;
  const breakEvenProUsers = perProGross > 0 ? Math.max(0, Math.ceil(uncovered / perProGross)) : Infinity;

  // --- SaaS health scorecard ---
  const g = clampPct(a.monthlyGrowthPct);
  const expansion = clampPct(a.monthlyExpansionPct);
  const annualGrowthRatePct = (Math.pow(1 + g, 12) - 1) * 100;
  const ruleOf40 = annualGrowthRatePct + grossMargin * 100;
  const grossRetentionAnnualPct = Math.pow(Math.max(0, 1 - blendedChurn), 12) * 100;
  const netRetentionAnnualPct = Math.pow(Math.max(0, 1 - blendedChurn + expansion), 12) * 100;

  const newUnits = segUnits * g;
  const newMrr = newUnits * blendedArpu;
  const expansionMrr = totalRev * expansion;
  const churnedMrr = segRev * blendedChurn;
  const netNewMrr = newMrr + expansionMrr - churnedMrr;
  const quickRatio = churnedMrr > 0 ? (newMrr + expansionMrr) / churnedMrr : Infinity;

  const sAndM = newUnits * blendedCac;
  // No spend → "infinite efficiency" only makes sense if revenue still grew;
  // a business shrinking on zero spend isn't infinitely efficient, it's at 0.
  const magicNumber = sAndM > 0 ? (netNewMrr * 12) / sAndM : netNewMrr > 0 ? Infinity : 0;

  const monthlyBurn = grossProfit < 0 ? -grossProfit : 0;
  const runwayMonths = monthlyBurn > 0 ? pos(a.cashOnHand) / monthlyBurn : Infinity;
  const burnMultiple = netNewMrr > 0 ? monthlyBurn / netNewMrr : monthlyBurn > 0 ? Infinity : 0;

  const health: HealthIndicators = {
    annualGrowthRatePct,
    ruleOf40,
    grossRetentionAnnualPct,
    netRetentionAnnualPct,
    quickRatio,
    magicNumber,
    burnMultiple,
    runwayMonths,
    netNewMrr,
  };

  // --- 12-month forward projection ---
  // MRR compounds at a net monthly multiplier (new logos + expansion − churn);
  // variable COGS scale with revenue, fixed opex stays put.
  const variableRatio = totalRev > 0 ? (totalCogs - fixed) / totalRev : 0;
  const netMult = Math.max(0, 1 + g - blendedChurn + expansion);
  const customerMult = Math.max(0, 1 + g - blendedChurn);

  const projection: ForecastPoint[] = [];
  let mrr = totalRev;
  let customers = payingUnits;
  let cash = pos(a.cashOnHand);
  let breakEvenMonth: number | null = grossProfit >= 0 ? 0 : null;
  let cashOutMonth: number | null = cash < 0 ? 0 : null;
  projection.push({ month: 0, mrr, customers, profit: grossProfit, cumulativeCash: cash });

  for (let m = 1; m <= PROJECTION_MONTHS; m++) {
    mrr *= netMult;
    customers = Math.round(customers * customerMult);
    // Can't have revenue with no customers — once the base rounds to zero the
    // line collapses (and stays collapsed, since 0 × netMult is still 0).
    if (customers === 0) mrr = 0;
    const profit = mrr - mrr * variableRatio - fixed;
    cash += profit;
    if (breakEvenMonth === null && profit >= 0) breakEvenMonth = m;
    if (cashOutMonth === null && cash < 0) cashOutMonth = m;
    projection.push({ month: m, mrr, customers, profit, cumulativeCash: cash });
  }

  const last = projection[projection.length - 1]!;
  const projectionSummary: ForecastSummary = {
    months: PROJECTION_MONTHS,
    endingMrr: last.mrr,
    endingArr: last.mrr * 12,
    breakEvenMonth,
    cashOutMonth,
    cumulativeCashEnd: last.cumulativeCash,
  };

  return {
    revenue: { b2c, coach: coachRev, org, total: totalRev },
    arr: totalRev * 12,
    payingUnits,
    blendedArpu,
    cogs: { ai: aiCost, infra: infraCost, stripe: stripeCost, support: supportCost, fixed, total: totalCogs },
    grossProfit,
    grossMargin,
    segments: { b2c: b2cSeg, coach: coachSeg },
    ltv,
    cacPaybackMonths,
    ltvToCac,
    monthlyContribution: grossProfit,
    breakEvenProUsers,
    health,
    projection,
    projectionSummary,
  };
}
