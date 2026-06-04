/**
 * Economics — HYBRID's business model + unit-economics engine.
 *
 * The single source of truth for HOW the app makes money (revenue streams +
 * pricing tiers), WHAT it costs to run (cost drivers / COGS + fixed opex), and a
 * pure `computeEconomics()` that projects MRR/ARR, blended ARPU, gross margin,
 * LTV, CAC payback, LTV:CAC and break-even from a set of editable assumptions.
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
      "Freemium: guest + basic logging are free forever; the intelligence (Athlete Twin, Future Self, AI coach, velocity-based training, adaptive nutrition, unlimited history) sits behind a personal Pro subscription. The free first workout (guest mode) is the top of the funnel.",
    tiers: [
      { name: "Free", price: "$0", note: "Guest + basic logging, 30-day history." },
      { name: "Pro (monthly)", price: "$12.99/mo", note: "Everything: Twin, AI coach, VBT, nutrition, unlimited history." },
      { name: "Pro (annual)", price: "$99/yr", note: "Same as Pro, ~36% off for paying yearly up front." },
    ],
  },
  {
    id: "coach",
    label: "Coaching seats (B2B2C)",
    whoPays: "PTs & online coaches (per roster)",
    howItWorks:
      "The coach pays a monthly seat fee scaled to roster size; their rostered athletes get Pro features included. The weekly check-in (the coaching heartbeat) is the recurring ritual clients stay for, so the seat compounds with retention.",
    tiers: [
      { name: "Starter", price: "$29/mo", note: "Up to 10 athletes." },
      { name: "Pro", price: "$79/mo", note: "Up to 40 athletes." },
      { name: "Business", price: "$199/mo", note: "Up to 150 athletes + Team OS (org graph, segmentation)." },
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
    id: "fixed",
    label: "Fixed opex (base)",
    kind: "fixed",
    rate: "~$600 / mo",
    note: "Base Supabase/Vercel plans + Apple Developer ($99/yr), Expo/EAS, domains, tooling — independent of user count.",
  },
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
  fixedOpexMonthly: number; // $/mo
  stripeFeePct: number; // e.g. 2.9
  stripeFlatPerCharge: number; // e.g. 0.30

  // --- growth / efficiency ---
  monthlyChurnPct: number; // % of paying base lost per month
  cac: number; // $ to acquire one paying customer
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
  fixedOpexMonthly: 600,
  stripeFeePct: 2.9,
  stripeFlatPerCharge: 0.3,

  monthlyChurnPct: 5,
  cac: 25,
};

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
  fixed: number;
  total: number;
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
  /** Lifetime value: arpu × grossMargin ÷ monthlyChurn. */
  ltv: number;
  /** Months to recoup CAC from gross-margin dollars (Infinity if never). */
  cacPaybackMonths: number;
  /** LTV ÷ CAC (Infinity if CAC is 0). */
  ltvToCac: number;
  /** Same as grossProfit — the monthly contribution (negative = burn). */
  monthlyContribution: number;
  /** Pro subscribers needed for the whole model to break even (covers fixed). */
  breakEvenProUsers: number;
}

// ----------------------------------------------------------------------------
// The calculator
// ----------------------------------------------------------------------------

const clampPct = (n: number) => Math.max(0, n) / 100;

/**
 * Project the unit economics from a set of assumptions. Pure: same input →
 * same output, never throws, guards every divide.
 */
export function computeEconomics(a: EconomicAssumptions): EconomicResult {
  // --- B2C: Pro subscribers, blended monthly across monthly + annual plans ---
  const proUsers = Math.round(Math.max(0, a.totalUsers) * clampPct(a.proConversionPct));
  const annualShare = clampPct(a.annualMixPct);
  const proMonthlyRevPerUser =
    (1 - annualShare) * Math.max(0, a.proPriceMonthly) + annualShare * (Math.max(0, a.proPriceAnnual) / 12);
  const b2c = proUsers * proMonthlyRevPerUser;

  // --- Coaching: split the coach base across the three seat tiers ---
  const coaches = Math.max(0, a.coaches);
  const mix = a.coachTierMix;
  const coachRev =
    coaches *
    (Math.max(0, mix.starter) * a.coachStarterPrice +
      Math.max(0, mix.pro) * a.coachProPrice +
      Math.max(0, mix.business) * a.coachBusinessPrice);

  // --- Org: per-athlete annual contracts, expressed monthly ---
  const org = (Math.max(0, a.orgAthletes) * Math.max(0, a.orgPricePerAthleteYear)) / 12;

  const totalRev = b2c + coachRev + org;

  // --- COGS ---
  const aiUsers = Math.max(0, a.totalUsers) * clampPct(a.aiActivePct);
  const aiCost = aiUsers * Math.max(0, a.aiCostPerUserMonthly);
  const infraCost = Math.max(0, a.totalUsers) * Math.max(0, a.infraCostPerUserMonthly);
  // Stripe: % of revenue + a flat fee per paying account's monthly charge.
  const payingUnits = proUsers + coaches + (a.orgAthletes > 0 ? 1 : 0);
  const stripeCost = totalRev * clampPct(a.stripeFeePct) + payingUnits * Math.max(0, a.stripeFlatPerCharge);
  const fixed = Math.max(0, a.fixedOpexMonthly);
  const totalCogs = aiCost + infraCost + stripeCost + fixed;

  const grossProfit = totalRev - totalCogs;
  const grossMargin = totalRev > 0 ? grossProfit / totalRev : 0;

  const blendedArpu = payingUnits > 0 ? totalRev / payingUnits : 0;

  // --- LTV / CAC ---
  const churn = clampPct(a.monthlyChurnPct);
  const ltv = churn > 0 ? (blendedArpu * Math.max(0, grossMargin)) / churn : Infinity;
  const marginPerUnit = blendedArpu * grossMargin;
  const cacPaybackMonths = marginPerUnit > 0 ? Math.max(0, a.cac) / marginPerUnit : Infinity;
  const ltvToCac = a.cac > 0 ? ltv / a.cac : Infinity;

  // --- Break-even: how many Pro users (holding everything else) clear the loss ---
  // Per-Pro-user monthly gross contribution, net of stripe % and infra/ai marginal.
  const perProGross =
    proMonthlyRevPerUser * (1 - clampPct(a.stripeFeePct)) -
    Math.max(0, a.infraCostPerUserMonthly) -
    clampPct(a.aiActivePct) * Math.max(0, a.aiCostPerUserMonthly);
  // Fixed + the slice of fixed not yet covered by coach/org contribution.
  const nonProContribution = coachRev * (1 - clampPct(a.stripeFeePct)) + org * (1 - clampPct(a.stripeFeePct));
  const uncovered = fixed - nonProContribution;
  const breakEvenProUsers = perProGross > 0 ? Math.max(0, Math.ceil(uncovered / perProGross)) : Infinity;

  return {
    revenue: { b2c, coach: coachRev, org, total: totalRev },
    arr: totalRev * 12,
    payingUnits,
    blendedArpu,
    cogs: { ai: aiCost, infra: infraCost, stripe: stripeCost, fixed, total: totalCogs },
    grossProfit,
    grossMargin,
    ltv,
    cacPaybackMonths,
    ltvToCac,
    monthlyContribution: grossProfit,
    breakEvenProUsers,
  };
}
