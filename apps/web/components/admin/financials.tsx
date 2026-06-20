"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
  Cell,
} from "recharts";
import {
  REVENUE_STREAMS,
  COST_DRIVERS,
  METRIC_GUIDE,
  DEFAULT_ASSUMPTIONS,
  FIXED_OPEX_ITEMS,
  MARKET_PRICING,
  PLAN_COLUMNS,
  ENTITLEMENT_MATRIX,
  PRICING_REF_DATE,
  toUsd,
  computeEconomics,
  type EconomicAssumptions,
  type RevenueStreamId,
  type SegmentEconomics,
  type EntitlementCell,
} from "@hybrid/core";
import {
  LINE,
  LIME,
  CHALK,
  ASH,
  BLUE,
  VIOLET,
  AMBER,
  RED,
  INK2,
  disp,
  mono,
  tip,
  Mono,
  Card,
  Chip,
  Stat,
  ChartFrame,
  txt,
} from "@/lib/ui";
import { useIsMobile } from "@/lib/use-media-query";

const STREAM_COLOR: Record<RevenueStreamId, string> = {
  b2c: LIME,
  coach: VIOLET,
  org: BLUE,
  data: ASH,
};

// Currency: keep the minus sign in front of the symbol (−$1.5k, not $-1.5k),
// the standard for financial reporting. Call sites that already prefix their
// own sign always pass a positive magnitude, so there's no double-up.
const usd = (n: number) => {
  const sign = n < 0 ? "−" : "";
  const abs = Math.abs(n);
  return abs >= 1000 ? `${sign}$${(abs / 1000).toFixed(1)}k` : `${sign}$${abs.toFixed(0)}`;
};
const usdFull = (n: number) => `${n < 0 ? "−" : ""}$${Math.round(Math.abs(n)).toLocaleString()}`;
const pct = (n: number) => `${n.toFixed(0)}%`;
const x1 = (n: number) => (Number.isFinite(n) ? `${n.toFixed(1)}×` : "∞");
const mo = (n: number) => (Number.isFinite(n) ? `${n.toFixed(1)} mo` : "never");

// Three-band judgement → brand color. good ≥ great, warn ≥ ok, else bad.
const band = (v: number, great: number, ok: number, higherBetter = true) => {
  if (!Number.isFinite(v)) return higherBetter ? LIME : RED;
  if (higherBetter) return v >= great ? LIME : v >= ok ? AMBER : RED;
  return v <= great ? LIME : v <= ok ? AMBER : RED;
};

export default function AdminFinancials() {
  const isMobile = useIsMobile();
  const [seed, setSeed] = useState<{ totalUsers: number; coaches: number } | null>(null);
  const [agentCost, setAgentCost] = useState<{ spend: number; runs: number } | null>(null);
  const [seedErr, setSeedErr] = useState(false);
  const [useLive, setUseLive] = useState(true);
  const [a, setA] = useState<EconomicAssumptions>(DEFAULT_ASSUMPTIONS);
  const [showGlossary, setShowGlossary] = useState(false);

  // Seed the audience inputs from the real platform aggregate (same shape the
  // Overview screen consumes). Every value stays editable below. Sanitize the
  // response: a missing/non-numeric field falls back to a default rather than
  // poisoning the model with undefined → NaN.
  useEffect(() => {
    let active = true;
    fetch("/api/admin/stats")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((s) => {
        if (!active) return;
        const totalUsers = typeof s?.totalUsers === "number" ? s.totalUsers : DEFAULT_ASSUMPTIONS.totalUsers;
        const coaches = typeof s?.coaches === "number" ? s.coaches : DEFAULT_ASSUMPTIONS.coaches;
        setSeed({ totalUsers, coaches });
        setA((prev) => ({ ...prev, totalUsers, coaches }));
        setAgentCost({
          spend: typeof s?.agentSpend30d === "number" ? s.agentSpend30d : 0,
          runs: typeof s?.agentRuns30d === "number" ? s.agentRuns30d : 0,
        });
      })
      .catch(() => {
        if (active) setSeedErr(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const r = useMemo(() => computeEconomics(a), [a]);

  // Accepts a static patch OR a functional updater so nested updates (e.g. the
  // coachTierMix shares) always merge against the latest state — no stale closures.
  const set = (patch: Partial<EconomicAssumptions> | ((prev: EconomicAssumptions) => Partial<EconomicAssumptions>)) => {
    setUseLive(false);
    setA((prev) => ({ ...prev, ...(typeof patch === "function" ? patch(prev) : patch) }));
  };

  const reseed = () => {
    setUseLive(true);
    setA({ ...DEFAULT_ASSUMPTIONS, ...(seed ?? {}) });
  };
  const reset = () => {
    setUseLive(false);
    setA(DEFAULT_ASSUMPTIONS);
  };

  const revChart = [
    { name: "B2C Pro", v: r.revenue.b2c, c: STREAM_COLOR.b2c },
    { name: "Coach", v: r.revenue.coach, c: STREAM_COLOR.coach },
    { name: "Org", v: r.revenue.org, c: STREAM_COLOR.org },
  ];
  const ltvCacOk = Number.isFinite(r.ltvToCac) && r.ltvToCac >= 3;
  const h = r.health;
  const ps = r.projectionSummary;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <Mono s={{ fontSize: 14, lineHeight: 1.55 }}>
        How HYBRID makes money, what it costs to run, and a live unit-economics
        model — seeded from real platform counts, every assumption editable. Read
        it top to bottom: the <strong style={{ color: CHALK }}>headline</strong> sizes the business,{" "}
        <strong style={{ color: CHALK }}>segments</strong> show which customer actually pays,{" "}
        the <strong style={{ color: CHALK }}>scorecard</strong> grades growth efficiency, and the{" "}
        <strong style={{ color: CHALK }}>forecast</strong> projects 12 months of cash. This is a planning
        tool; live charging is the blocked <strong style={{ color: txt(AMBER) }}>billing</strong> capability.{" "}
        <button onClick={() => setShowGlossary((v) => !v)} style={linkBtn}>
          {showGlossary ? "Hide" : "What do these terms mean?"}
        </button>
      </Mono>

      {showGlossary && <Glossary />}

      {/* ---- headline ---- */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: 16 }}>
        <Stat label="MRR (modeled)" value={usdFull(r.revenue.total)} sub={`ARR ${usdFull(r.arr)}`} c={LIME} />
        <Stat
          label="Gross margin"
          value={`${Math.round(r.grossMargin * 100)}%`}
          sub={r.grossProfit >= 0 ? `+${usdFull(r.grossProfit)}/mo` : `−${usdFull(-r.grossProfit)}/mo`}
          c={r.grossProfit >= 0 ? LIME : RED}
        />
        <Stat
          label="LTV : CAC"
          value={x1(r.ltvToCac)}
          sub={ltvCacOk ? "healthy (≥3×)" : "−below 3×"}
          c={ltvCacOk ? LIME : AMBER}
        />
        <Stat
          label="Rule of 40"
          value={Math.round(h.ruleOf40).toString()}
          sub={h.ruleOf40 >= 40 ? "passes (≥40)" : "−below 40"}
          c={band(h.ruleOf40, 40, 25)}
        />
      </div>

      {/* ---- how we make money ---- */}
      <Section title="How HYBRID makes money" kicker="Revenue streams · who pays · what they pay for">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {REVENUE_STREAMS.map((stream) => {
            const color = STREAM_COLOR[stream.id];
            const monthly =
              stream.id === "b2c" ? r.revenue.b2c : stream.id === "coach" ? r.revenue.coach : stream.id === "org" ? r.revenue.org : null;
            const shareOfMrr = monthly != null && r.revenue.total > 0 ? (monthly / r.revenue.total) * 100 : null;
            return (
              <Card key={stream.id} style={{ borderLeft: `3px solid ${color}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ ...disp, fontWeight: 800, fontSize: 16 }}>
                    {stream.label}
                    {stream.future && <span style={{ marginLeft: 8 }}><Chip c={ASH}>Future</Chip></span>}
                  </div>
                  {monthly != null ? (
                    <Mono s={{ fontSize: 14 }} c={color}>
                      {usdFull(monthly)}/mo modeled{shareOfMrr != null ? ` · ${shareOfMrr.toFixed(0)}% of MRR` : ""}
                    </Mono>
                  ) : (
                    <Mono s={{ fontSize: 13 }} c={ASH}>not in live margin</Mono>
                  )}
                </div>
                <Mono s={{ fontSize: 13, display: "block", marginTop: 4 }} c={ASH}>
                  {stream.whoPays}
                </Mono>
                <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap" }}>
                  {stream.tiers.map((t) => (
                    <Chip key={t.name} c={color}>
                      {t.name} · {t.price}
                    </Chip>
                  ))}
                </div>
                <Mono s={{ fontSize: 13.5, lineHeight: 1.5, display: "block", marginTop: 10 }} c={CHALK}>
                  {stream.howItWorks}
                </Mono>
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
                  {stream.tiers.map((t) => (
                    <Mono key={t.name} s={{ fontSize: 12.5, lineHeight: 1.4 }} c={ASH}>
                      <span style={{ color: CHALK }}>{t.name}</span> — {t.note}
                    </Mono>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      </Section>

      {/* ---- focus markets + pricing ---- */}
      <Section title="Focus markets & pricing" kicker={`Where we sell · localized price · FX ${PRICING_REF_DATE}`}>
        <Mono s={{ fontSize: 13.5, lineHeight: 1.55, display: "block", marginBottom: 12 }} c={ASH}>
          We focus on five markets. The <span style={{ color: CHALK }}>US is the anchor</span> — every
          other price indexes off it on a purchasing-power lens, then rounds to the point that market
          expects. The <span style={{ color: txt(LIME) }}>≈ USD</span> figure is what we keep before that
          market&apos;s tax + Stripe fee, so two markets at the same headline can net very differently.
        </Mono>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 12 }}>
          {MARKET_PRICING.map((m) => (
            <MarketCard key={m.id} m={m} />
          ))}
        </div>
      </Section>

      {/* ---- what each plan gets ---- */}
      <Section title="What each plan includes" kicker="The entitlement matrix · free → org">
        <Mono s={{ fontSize: 13.5, lineHeight: 1.55, display: "block", marginBottom: 12 }} c={ASH}>
          What a user actually gets for what they pay. The tiers nest — <span style={{ color: CHALK }}>Pro ⊂ Coach ⊂ Org</span>:
          a coach seat includes Pro for the coach and their roster; org includes everything plus the
          institutional layer. Free is the logging loop, free forever — the top of the funnel.
        </Mono>
        <PlanMatrix />
      </Section>

      {/* ---- what it costs us ---- */}
      <Section title="What it costs us" kicker="Cost of goods + fixed opex (COGS drivers)">
        {agentCost && agentCost.runs > 0 && (
          <Card style={{ borderLeft: `3px solid ${BLUE}`, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div style={{ ...disp, fontWeight: 700, fontSize: 14 }}>Actual AI agent spend</div>
              <Chip c={BLUE}>real · last 30d</Chip>
            </div>
            <Mono s={{ fontSize: 14, display: "block", marginTop: 4 }} c={CHALK}>
              {usdFull(agentCost.spend)} over {agentCost.runs.toLocaleString()} runs (≈ {usdFull(agentCost.spend / 30)}/day)
            </Mono>
            <Mono s={{ fontSize: 12.5, lineHeight: 1.45, display: "block", marginTop: 8 }} c={ASH}>
              Measured from real agent runs (tokens × model list price). Use it to calibrate the modeled AI (Anthropic) COGS below — that figure is still an assumption.
            </Mono>
          </Card>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 12 }}>
          {COST_DRIVERS.map((c) => {
            const live =
              c.id === "ai" ? r.cogs.ai : c.id === "infra" ? r.cogs.infra : c.id === "stripe" ? r.cogs.stripe : c.id === "support" ? r.cogs.support : c.id === "fixed" ? r.cogs.fixed : null;
            const shareOfRev = live != null && r.revenue.total > 0 ? (live / r.revenue.total) * 100 : null;
            return (
              <Card key={c.id} style={{ borderLeft: `3px solid ${c.kind === "fixed" ? AMBER : RED}`, gridColumn: c.id === "fixed" ? "1 / -1" : undefined }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div style={{ ...disp, fontWeight: 700, fontSize: 14 }}>{c.label}</div>
                  <Chip c={c.kind === "fixed" ? AMBER : RED}>{c.kind === "fixed" ? "fixed" : "COGS"}</Chip>
                </div>
                <Mono s={{ fontSize: 13, display: "block", marginTop: 4 }} c={CHALK}>{c.rate}</Mono>
                {live != null && (
                  <Mono s={{ fontSize: 13, display: "block", marginTop: 2 }} c={ASH}>
                    ≈ {usdFull(live)}/mo{shareOfRev != null ? ` · ${shareOfRev.toFixed(0)}% of revenue` : ""}
                  </Mono>
                )}
                <Mono s={{ fontSize: 12.5, lineHeight: 1.45, display: "block", marginTop: 8 }} c={ASH}>
                  {c.note}
                </Mono>
                {c.id === "fixed" && <FixedOpexBreakdown />}
              </Card>
            );
          })}
        </div>
      </Section>

      {/* ---- calculator ---- */}
      <Section
        title="Unit-economics calculator"
        kicker={
          seedErr
            ? "Live counts unavailable — using model defaults"
            : seed
              ? `Seeded from live: ${seed.totalUsers.toLocaleString()} users · ${seed.coaches} coaches`
              : "Loading live counts…"
        }
      >
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1.1fr) minmax(0,1fr)", gap: 16 }}>
          {/* inputs */}
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <Mono s={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".1em" }} c={ASH}>Assumptions</Mono>
              <div style={{ display: "flex", gap: 6 }}>
                <Btn label="Reseed live" active={useLive} onClick={reseed} disabled={!seed} />
                <Btn label="Defaults" active={false} onClick={reset} />
              </div>
            </div>

            <Group label="Audience">
              <Num label="Total users" value={a.totalUsers} step={50} onChange={(v) => set({ totalUsers: v })} />
              <Num label="Coaches" value={a.coaches} step={1} onChange={(v) => set({ coaches: v })} />
            </Group>

            <Group label="B2C Pro">
              <Range label="Pro conversion" value={a.proConversionPct} min={0} max={30} step={0.5} suffix="%" onChange={(v) => set({ proConversionPct: v })} />
              <Num label="Pro price /mo" value={a.proPriceMonthly} step={1} prefix="$" onChange={(v) => set({ proPriceMonthly: v })} />
              <Num label="Pro price /yr" value={a.proPriceAnnual} step={5} prefix="$" onChange={(v) => set({ proPriceAnnual: v })} />
              <Range label="Annual mix" value={a.annualMixPct} min={0} max={100} step={5} suffix="%" onChange={(v) => set({ annualMixPct: v })} />
            </Group>

            <Group label="Coach seats (mix %)">
              <Range label="Starter share" value={Math.round(a.coachTierMix.starter * 100)} min={0} max={100} step={5} suffix="%" onChange={(v) => set((prev) => ({ coachTierMix: { ...prev.coachTierMix, starter: v / 100 } }))} />
              <Range label="Pro share" value={Math.round(a.coachTierMix.pro * 100)} min={0} max={100} step={5} suffix="%" onChange={(v) => set((prev) => ({ coachTierMix: { ...prev.coachTierMix, pro: v / 100 } }))} />
              <Range label="Business share" value={Math.round(a.coachTierMix.business * 100)} min={0} max={100} step={5} suffix="%" onChange={(v) => set((prev) => ({ coachTierMix: { ...prev.coachTierMix, business: v / 100 } }))} />
            </Group>

            <Group label="Org / Enterprise">
              <Num label="Org athletes" value={a.orgAthletes} step={25} onChange={(v) => set({ orgAthletes: v })} />
              <Num label="Price /athlete/yr" value={a.orgPricePerAthleteYear} step={5} prefix="$" onChange={(v) => set({ orgPricePerAthleteYear: v })} />
            </Group>

            <Group label="Costs">
              <Range label="AI active share" value={a.aiActivePct} min={0} max={100} step={5} suffix="%" onChange={(v) => set({ aiActivePct: v })} />
              <Num label="AI $/active user/mo" value={a.aiCostPerUserMonthly} step={0.5} prefix="$" onChange={(v) => set({ aiCostPerUserMonthly: v })} />
              <Num label="Infra $/user/mo" value={a.infraCostPerUserMonthly} step={0.05} prefix="$" onChange={(v) => set({ infraCostPerUserMonthly: v })} />
              <Num label="Coach support $/seat/mo" value={a.coachServiceCostMonthly} step={0.5} prefix="$" onChange={(v) => set({ coachServiceCostMonthly: v })} />
              <Num label="Fixed opex /mo" value={a.fixedOpexMonthly} step={50} prefix="$" onChange={(v) => set({ fixedOpexMonthly: v })} />
              <Num label="Stripe fee" value={a.stripeFeePct} step={0.1} suffix="%" onChange={(v) => set({ stripeFeePct: v })} />
            </Group>

            <Group label="Retention & CAC (per segment)">
              <Range label="B2C churn /mo" value={a.b2cMonthlyChurnPct} min={0} max={20} step={0.5} suffix="%" onChange={(v) => set({ b2cMonthlyChurnPct: v })} />
              <Range label="Coach churn /mo" value={a.coachMonthlyChurnPct} min={0} max={20} step={0.5} suffix="%" onChange={(v) => set({ coachMonthlyChurnPct: v })} />
              <Num label="B2C CAC ($/sub)" value={a.b2cCac} step={5} prefix="$" onChange={(v) => set({ b2cCac: v })} />
              <Num label="Coach CAC ($/seat)" value={a.coachCac} step={10} prefix="$" onChange={(v) => set({ coachCac: v })} />
            </Group>

            <Group label="Growth & cash">
              <Range label="New-logo growth /mo" value={a.monthlyGrowthPct} min={0} max={30} step={0.5} suffix="%" onChange={(v) => set({ monthlyGrowthPct: v })} />
              <Range label="Net expansion /mo" value={a.monthlyExpansionPct} min={0} max={10} step={0.5} suffix="%" onChange={(v) => set({ monthlyExpansionPct: v })} />
              <Num label="Cash on hand" value={a.cashOnHand} step={5000} prefix="$" onChange={(v) => set({ cashOnHand: v })} />
            </Group>
          </Card>

          {/* outputs */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
              <Stat label="MRR" value={usdFull(r.revenue.total)} c={LIME} />
              <Stat label="ARR" value={usdFull(r.arr)} c={LIME} />
              <Stat label="Blended ARPU" value={`$${r.blendedArpu.toFixed(2)}`} sub={`${r.payingUnits.toLocaleString()} paying`} c={CHALK} />
              <Stat label="Gross margin" value={`${Math.round(r.grossMargin * 100)}%`} c={r.grossProfit >= 0 ? LIME : RED} />
              <Stat label="Blended LTV" value={Number.isFinite(r.ltv) ? usdFull(r.ltv) : "∞"} c={VIOLET} />
              <Stat label="CAC payback" value={mo(r.cacPaybackMonths)} c={Number.isFinite(r.cacPaybackMonths) && r.cacPaybackMonths <= 12 ? LIME : AMBER} />
            </div>

            <ChartFrame title="Revenue by stream" kicker="Modeled MRR" c={LIME}>
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={revChart}>
                  <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
                  <XAxis dataKey="name" stroke={ASH} style={{ ...mono, fontSize: 12 }} />
                  <YAxis stroke={ASH} style={{ ...mono, fontSize: 12 }} tickFormatter={usd} width={44} />
                  <Tooltip contentStyle={tip} formatter={(v) => usdFull(Number(v))} cursor={{ fill: `${LIME}10` }} />
                  <Bar dataKey="v" radius={[4, 4, 0, 0]}>
                    {revChart.map((d) => (
                      <Cell key={d.name} fill={d.c} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>

            <Card>
              <Mono s={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 8 }} c={ASH}>
                Monthly P&L
              </Mono>
              <PnL k="Revenue (MRR)" v={usdFull(r.revenue.total)} c={LIME} />
              <PnL k="AI (Anthropic)" v={`−${usdFull(r.cogs.ai)}`} />
              <PnL k="Infra (Supabase + Vercel)" v={`−${usdFull(r.cogs.infra)}`} />
              <PnL k="Stripe fees" v={`−${usdFull(r.cogs.stripe)}`} />
              <PnL k="Coach success / support" v={`−${usdFull(r.cogs.support)}`} />
              <PnL k="Fixed opex" v={`−${usdFull(r.cogs.fixed)}`} />
              <PnL k={r.grossProfit >= 0 ? "Contribution" : "Burn"} v={`${r.grossProfit >= 0 ? "" : "−"}${usdFull(Math.abs(r.grossProfit))}`} c={r.grossProfit >= 0 ? LIME : RED} bold />
              <Mono s={{ fontSize: 12.5, display: "block", marginTop: 10, lineHeight: 1.5 }} c={ASH}>
                Break-even at{" "}
                <span style={{ color: CHALK }}>
                  {Number.isFinite(r.breakEvenProUsers) ? `${r.breakEvenProUsers.toLocaleString()} Pro subscribers` : "— (Pro contribution ≤ 0)"}
                </span>{" "}
                holding coach/org/cost assumptions fixed.
              </Mono>
            </Card>
          </div>
        </div>
      </Section>

      {/* ---- segment economics ---- */}
      <Section title="Unit economics by segment" kicker="Who actually pays the bills — B2C vs coach, un-blended">
        <Mono s={{ fontSize: 13.5, lineHeight: 1.55, display: "block", marginBottom: 12 }} c={ASH}>
          A blended LTV hides the truth. A coach seat costs more to win but is stickier and
          worth far more than a consumer sub — these cards price each segment on its own
          ARPU, contribution margin, churn and CAC. The bar on each metric is{" "}
          <span style={{ color: txt(LIME) }}>green</span> when it clears the healthy benchmark.
        </Mono>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 12 }}>
          <SegmentCard seg={r.segments.b2c} color={LIME} />
          <SegmentCard seg={r.segments.coach} color={VIOLET} />
        </div>
      </Section>

      {/* ---- SaaS health scorecard ---- */}
      <Section title="SaaS health scorecard" kicker="The efficiency ratios investors read first">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 12 }}>
          <Indicator
            label="Rule of 40"
            value={Math.round(h.ruleOf40).toString()}
            c={band(h.ruleOf40, 40, 25)}
            note={`${Math.round(h.annualGrowthRatePct)}% growth + ${Math.round(r.grossMargin * 100)}% margin`}
            says="Fast growth can excuse thin margins and vice-versa. Pass the bar at 40."
          />
          <Indicator
            label="Net revenue retention"
            value={pct(h.netRetentionAnnualPct)}
            c={band(h.netRetentionAnnualPct, 110, 100)}
            note="annualized, incl. expansion"
            says=">100% means the existing base grows by itself, before any new sales."
          />
          <Indicator
            label="Gross revenue retention"
            value={pct(h.grossRetentionAnnualPct)}
            c={band(h.grossRetentionAnnualPct, 90, 80)}
            note="annualized, no expansion"
            says="Pure stickiness — the revenue you keep with zero upsell credit."
          />
          <Indicator
            label="Quick ratio"
            value={x1(h.quickRatio)}
            c={band(h.quickRatio, 4, 2)}
            note={`+${usdFull(h.netNewMrr)}/mo net-new`}
            says="Revenue added vs. revenue lost. ≥4× is efficient growth."
          />
          <Indicator
            label="Magic number"
            value={x1(h.magicNumber)}
            c={band(h.magicNumber, 0.75, 0.5)}
            note="new ARR per $ of S&M"
            says="Sales efficiency. ≥0.75 means it pays to spend more on growth."
          />
          <Indicator
            label="Burn multiple"
            value={h.runwayMonths === Infinity ? "profitable" : x1(h.burnMultiple)}
            c={r.grossProfit >= 0 ? LIME : band(h.burnMultiple, 1, 2, false)}
            note={r.grossProfit >= 0 ? "no burn" : "$ burned per $ net-new"}
            says="Capital efficiency of growth. <1× great, >2× inefficient."
          />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 12, marginTop: 12 }}>
          <Indicator
            label="Runway"
            value={h.runwayMonths === Infinity ? "∞" : `${Math.floor(h.runwayMonths)} mo`}
            c={h.runwayMonths === Infinity ? LIME : band(h.runwayMonths, 18, 6)}
            note={h.runwayMonths === Infinity ? "cash-flow positive" : `on ${usdFull(a.cashOnHand)} cash`}
            says="Months until the cash runs out at today's burn. Raise before ~6."
          />
          <Indicator
            label="Annual growth"
            value={pct(h.annualGrowthRatePct)}
            c={band(h.annualGrowthRatePct, 100, 40)}
            note={`${a.monthlyGrowthPct}%/mo compounded`}
            says="New-logo growth of the paying base, annualized."
          />
          <Indicator
            label="LTV : CAC (blended)"
            value={x1(r.ltvToCac)}
            c={band(r.ltvToCac, 3, 1)}
            note={`payback ${mo(r.cacPaybackMonths)}`}
            says="Return per acquisition dollar. ≥3× healthy, <1× loses money."
          />
        </div>
      </Section>

      {/* ---- 12-month projection ---- */}
      <Section title="12-month forecast" kicker="MRR trajectory + cumulative cash">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: 12, marginBottom: 14 }}>
          <Stat label="MRR in 12 mo" value={usdFull(ps.endingMrr)} sub={`ARR ${usdFull(ps.endingArr)}`} c={LIME} />
          <Stat
            label="Cash in 12 mo"
            value={usdFull(ps.cumulativeCashEnd)}
            sub={ps.cumulativeCashEnd >= a.cashOnHand ? `+${usdFull(ps.cumulativeCashEnd - a.cashOnHand)}` : `−${usdFull(a.cashOnHand - ps.cumulativeCashEnd)}`}
            c={ps.cumulativeCashEnd >= 0 ? LIME : RED}
          />
          <Stat
            label="P&L break-even"
            value={ps.breakEvenMonth === null ? ">12 mo" : ps.breakEvenMonth === 0 ? "now" : `mo ${ps.breakEvenMonth}`}
            c={ps.breakEvenMonth !== null ? LIME : AMBER}
          />
          <Stat
            label="Cash-out"
            value={ps.cashOutMonth === null ? "—" : `mo ${ps.cashOutMonth}`}
            sub={ps.cashOutMonth === null ? "never within 12mo" : "−runs dry"}
            c={ps.cashOutMonth === null ? LIME : RED}
          />
        </div>
        <ChartFrame title="MRR vs. cumulative cash" kicker="next 12 months" c={LIME}>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={r.projection} margin={{ top: 6, right: 8, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="mrrFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={LIME} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={LIME} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
              <XAxis dataKey="month" stroke={ASH} style={{ ...mono, fontSize: 12 }} tickFormatter={(m) => `M${m}`} />
              <YAxis yAxisId="mrr" stroke={ASH} style={{ ...mono, fontSize: 12 }} tickFormatter={usd} width={48} />
              <YAxis yAxisId="cash" orientation="right" stroke={ASH} style={{ ...mono, fontSize: 12 }} tickFormatter={usd} width={48} />
              <Tooltip
                contentStyle={tip}
                labelFormatter={(m) => `Month ${m}`}
                formatter={(v, name) => [usdFull(Number(v)), name === "mrr" ? "MRR" : "Cumulative cash"]}
                cursor={{ stroke: ASH }}
              />
              <Legend wrapperStyle={{ ...mono, fontSize: 12 }} formatter={(name) => (name === "mrr" ? "MRR" : "Cumulative cash")} />
              <ReferenceLine yAxisId="cash" y={0} stroke={RED} strokeDasharray="4 4" />
              <Area yAxisId="mrr" type="monotone" dataKey="mrr" stroke={LIME} strokeWidth={2} fill="url(#mrrFill)" />
              <Line yAxisId="cash" type="monotone" dataKey="cumulativeCash" stroke={BLUE} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartFrame>
        <Mono s={{ fontSize: 12.5, lineHeight: 1.5, display: "block", marginTop: 10 }} c={ASH}>
          MRR compounds at the net monthly rate (new logos + expansion − churn); variable COGS
          scale with revenue while fixed opex holds. The dashed red line is zero cash — where the
          blue line crosses it is the cash-out month. Assumptions, not booked revenue.
        </Mono>
      </Section>
    </div>
  );
}

// ---- composite blocks ----

function SegmentCard({ seg, color }: { seg: SegmentEconomics; color: string }) {
  const paybackOk = Number.isFinite(seg.cacPaybackMonths) && seg.cacPaybackMonths <= 12;
  const ratioOk = Number.isFinite(seg.ltvToCac) && seg.ltvToCac >= 3;
  return (
    <Card style={{ borderTop: `3px solid ${color}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ ...disp, fontWeight: 800, fontSize: 16 }}>{seg.label}</div>
        <Mono s={{ fontSize: 13 }} c={ASH}>{seg.payingUnits.toLocaleString()} paying</Mono>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginTop: 12 }}>
        <Metric label="ARPU /mo" value={`$${seg.arpu.toFixed(2)}`} c={CHALK} />
        <Metric label="Contribution margin" value={`${Math.round(seg.grossMargin * 100)}%`} c={seg.grossMargin >= 0 ? CHALK : RED} />
        <Metric label="LTV" value={Number.isFinite(seg.ltv) ? usdFull(seg.ltv) : "∞"} c={color} />
        <Metric label="CAC" value={usdFull(seg.cac)} c={CHALK} />
        <Metric label="CAC payback" value={mo(seg.cacPaybackMonths)} c={paybackOk ? LIME : AMBER} />
        <Metric label="LTV : CAC" value={x1(seg.ltvToCac)} c={ratioOk ? LIME : AMBER} />
      </div>
      <Mono s={{ fontSize: 12, display: "block", marginTop: 10 }} c={ASH}>
        {Math.round(seg.monthlyChurn * 100 * 10) / 10}% monthly churn · ~{seg.monthlyChurn > 0 ? Math.round(1 / seg.monthlyChurn) : "∞"} mo average lifetime
      </Mono>
    </Card>
  );
}

function MarketCard({ m }: { m: (typeof MARKET_PRICING)[number] }) {
  const isPLN = m.currency === "PLN";
  const loc = (n: number) => (isPLN ? `${Math.round(n)} zł` : `${m.symbol}${Number.isInteger(n) ? n : n.toFixed(2)}`);
  const eq = (n: number) => `≈ $${toUsd(n, m.fxPerUsd).toFixed(2)}`;
  const indexPct = Math.round(m.priceIndex * 100);
  const indexColor = m.priceIndex >= 0.95 ? LIME : m.priceIndex >= 0.7 ? AMBER : BLUE;
  return (
    <Card style={{ borderLeft: `3px solid ${indexColor}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ ...disp, fontWeight: 800, fontSize: 16 }}>
          <span style={{ marginRight: 8 }}>{m.flag}</span>
          {m.market}
        </div>
        <Chip c={indexColor}>{m.currency} · {indexPct}% of US</Chip>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginTop: 12 }}>
        <PriceBox label="Pro · monthly" value={loc(m.proMonthly)} sub={eq(m.proMonthly)} />
        <PriceBox label="Pro · annual" value={loc(m.proAnnual)} sub={`${eq(m.proAnnual)} · ${loc(m.proAnnual / 12)}/mo`} />
      </div>
      <Mono s={{ fontSize: 12.5, lineHeight: 1.5, display: "block", marginTop: 10 }} c={ASH}>
        Coach seats{" "}
        <span style={{ color: txt(CHALK) }}>{loc(m.coachStarter)} · {loc(m.coachPro)} · {loc(m.coachBusiness)}</span>/mo
        {" · "}Org <span style={{ color: txt(CHALK) }}>{loc(m.orgLow)}–{loc(m.orgHigh)}</span>/athlete/yr
      </Mono>
      <Mono s={{ fontSize: 12, display: "block", marginTop: 6 }} c={ASH}>
        {m.tax} · Stripe {m.stripeFee}
      </Mono>
      <Mono s={{ fontSize: 12.5, lineHeight: 1.5, display: "block", marginTop: 8 }} c={CHALK}>
        {m.rationale}
      </Mono>
    </Card>
  );
}

function PriceBox({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ background: INK2, border: `1px solid ${LINE}`, borderRadius: "var(--r-card)", padding: "10px 10px" }}>
      <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", display: "block" }} c={ASH}>{label}</Mono>
      <div style={{ ...disp, fontWeight: 800, fontSize: 18, marginTop: 2 }}>{value}</div>
      <Mono s={{ fontSize: 11.5, display: "block", marginTop: 1 }} c={ASH}>{sub}</Mono>
    </div>
  );
}

function FixedOpexBreakdown() {
  const recurring = FIXED_OPEX_ITEMS.filter((i) => i.kind === "recurring");
  const extras = FIXED_OPEX_ITEMS.filter((i) => i.kind !== "recurring");
  const total = recurring.reduce((s, i) => s + i.monthlyUsd, 0);
  const row = (label: string, billed: string, monthly: string, c: string = ASH, muted = false) => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1fr) 70px",
        gap: 8,
        alignItems: "center",
        padding: "7px 0",
        borderBottom: `1px solid ${LINE}`,
      }}
    >
      <Mono s={{ fontSize: 13, fontWeight: muted ? 400 : 600 }} c={muted ? ASH : CHALK}>{label}</Mono>
      <Mono s={{ fontSize: 12.5, textAlign: "right" }} c={ASH}>{billed}</Mono>
      <Mono s={{ fontSize: 13, textAlign: "right", fontWeight: 700 }} c={c}>{monthly}</Mono>
    </div>
  );
  return (
    <div style={{ marginTop: 12 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1fr) 70px",
          gap: 8,
          padding: "0 0 6px",
          borderBottom: `1px solid ${LINE}`,
        }}
      >
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em" }} c={ASH}>Item</Mono>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", textAlign: "right" }} c={ASH}>As billed</Mono>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", textAlign: "right" }} c={ASH}>$/mo</Mono>
      </div>
      {recurring.map((i) => row(i.label, i.billed, usdFull(i.monthlyUsd)))}
      {row("Recurring run-rate", "", usdFull(total), AMBER)}
      {extras.length > 0 && (
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginTop: 12, marginBottom: 2 }} c={ASH}>
          Not in the monthly run-rate
        </Mono>
      )}
      {extras.map((i) => row(i.note ? `${i.label} · ${i.note}` : i.label, i.billed, "—", ASH, true))}
    </div>
  );
}

function PlanMatrix() {
  const entCell = (v: EntitlementCell, key: string) => {
    const none = v === false;
    const yes = v === true;
    return (
      <td
        key={key}
        style={{
          ...mono,
          fontSize: 13,
          textAlign: "center",
          padding: "10px 6px",
          borderBottom: `1px solid ${LINE}`,
          color: txt(none ? ASH : yes ? LIME : AMBER),
        }}
      >
        {none ? "—" : yes ? "✓" : v}
      </td>
    );
  };

  // Insert a group sub-header row whenever the group label changes — derived
  // purely from the previous row (no render-phase mutation).
  return (
    <Card>
      <div style={{ overflowX: "auto", maxWidth: "100%" }}>
      <table style={{ width: "100%", minWidth: 560, borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...mono, fontSize: 12, color: txt(ASH), textTransform: "uppercase", textAlign: "left", padding: "10px 6px", borderBottom: `1px solid ${LINE}` }}>
              Feature
            </th>
            {PLAN_COLUMNS.map((c) => (
              <th key={c.id} style={{ padding: "10px 6px", borderBottom: `1px solid ${LINE}`, textAlign: "center", minWidth: 110 }}>
                <div style={{ ...disp, fontWeight: 800, fontSize: 14, color: txt(c.id === "free" ? ASH : c.id === "pro" ? LIME : c.id === "coach" ? VIOLET : BLUE) }}>{c.label}</div>
                <Mono s={{ fontSize: 10.5, display: "block", marginTop: 2 }} c={ASH}>{c.price}</Mono>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ENTITLEMENT_MATRIX.map((row, i) => {
            const groupHeader = row.group !== ENTITLEMENT_MATRIX[i - 1]?.group;
            return (
              <Fragment key={`${row.group}-${row.feature}-${i}`}>
                {groupHeader && (
                  <tr>
                    <td colSpan={1 + PLAN_COLUMNS.length} style={{ padding: "12px 6px 4px" }}>
                      <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={AMBER}>{row.group}</Mono>
                    </td>
                  </tr>
                )}
                <tr>
                  <td style={{ ...disp, fontWeight: 600, fontSize: 14, padding: "10px 6px", borderBottom: `1px solid ${LINE}` }}>{row.feature}</td>
                  {entCell(row.free, `${i}-free`)}
                  {entCell(row.pro, `${i}-pro`)}
                  {entCell(row.coach, `${i}-coach`)}
                  {entCell(row.org, `${i}-org`)}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
      </div>
      <Mono s={{ fontSize: 12, lineHeight: 1.5, display: "block", marginTop: 10 }} c={ASH}>
        {PLAN_COLUMNS.map((c) => `${c.label}: ${c.who}`).join(" · ")}
      </Mono>
    </Card>
  );
}

function Metric({ label, value, c = CHALK }: { label: string; value: string; c?: string }) {
  return (
    <div style={{ background: INK2, border: `1px solid ${LINE}`, borderRadius: "var(--r-card)", padding: "10px 10px" }}>
      <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", display: "block" }} c={ASH}>{label}</Mono>
      <div style={{ ...disp, fontWeight: 800, fontSize: 18, color: txt(c), marginTop: 2 }}>{value}</div>
    </div>
  );
}

function Indicator({ label, value, c, note, says }: { label: string; value: string; c: string; note: string; says: string }) {
  return (
    <Card style={{ borderLeft: `3px solid ${c}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <Mono s={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".08em" }} c={ASH}>{label}</Mono>
      </div>
      <div style={{ ...disp, fontWeight: 800, fontSize: 28, color: txt(c), lineHeight: 1.1, margin: "4px 0 2px" }}>{value}</div>
      <Mono s={{ fontSize: 12 }} c={ASH}>{note}</Mono>
      <Mono s={{ fontSize: 12.5, lineHeight: 1.45, display: "block", marginTop: 8 }} c={CHALK}>{says}</Mono>
    </Card>
  );
}

function Glossary() {
  return (
    <Card>
      <Mono s={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 12 }} c={AMBER}>
        Metric glossary
      </Mono>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 12 }}>
        {METRIC_GUIDE.map((m) => (
          <div key={m.id} style={{ borderLeft: `2px solid ${LINE}`, paddingLeft: 10 }}>
            <div style={{ ...disp, fontWeight: 700, fontSize: 13.5 }}>{m.label}</div>
            <Mono s={{ fontSize: 12.5, lineHeight: 1.45, display: "block", marginTop: 3 }} c={CHALK}>{m.what}</Mono>
            <Mono s={{ fontSize: 12, lineHeight: 1.4, display: "block", marginTop: 4 }} c={ASH}>
              <span style={{ color: txt(VIOLET) }}>= </span>{m.formula}
            </Mono>
            <Mono s={{ fontSize: 12, lineHeight: 1.4, display: "block", marginTop: 2 }} c={LIME}>{m.benchmark}</Mono>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ---- small building blocks ----

function Section({ title, kicker, children }: { title: string; kicker: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Mono s={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".1em" }} c={AMBER}>{kicker}</Mono>
        <div style={{ ...disp, fontWeight: 800, fontSize: 19, marginTop: 2 }}>{title}</div>
      </div>
      {children}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em", display: "block", marginBottom: 8 }} c={ASH}>
        {label}
      </Mono>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>{children}</div>
    </div>
  );
}

function Num({
  label,
  value,
  onChange,
  step = 1,
  prefix,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
      <Mono s={{ fontSize: 13 }} c={ASH}>{label}</Mono>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {prefix && <Mono s={{ fontSize: 13 }} c={ASH}>{prefix}</Mono>}
        <input
          type="number"
          value={value}
          step={step}
          min={0}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          style={{
            ...mono,
            fontSize: 14,
            width: 84,
            textAlign: "right",
            padding: "8px 8px",
            borderRadius: "var(--r-field)",
            background: INK2,
            color: CHALK,
            border: `1px solid ${LINE}`,
            outline: "none",
          }}
        />
        {suffix && <Mono s={{ fontSize: 13 }} c={ASH}>{suffix}</Mono>}
      </div>
    </label>
  );
}

function Range({
  label,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  suffix?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Mono s={{ fontSize: 13 }} c={ASH}>{label}</Mono>
        <Mono s={{ fontSize: 13 }} c={CHALK}>{value}{suffix}</Mono>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: LIME, cursor: "pointer" }}
      />
    </div>
  );
}

function Btn({ label, active, onClick, disabled }: { label: string; active: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...mono,
        fontSize: 12,
        padding: "7px 9px",
        borderRadius: "var(--r-field)",
        cursor: disabled ? "not-allowed" : "pointer",
        border: `1px solid ${active ? LIME : LINE}`,
        background: active ? `${LIME}1c` : "transparent",
        color: txt(disabled ? LINE : active ? LIME : ASH),
      }}
    >
      {label}
    </button>
  );
}

function PnL({ k, v, c = CHALK, bold }: { k: string; v: string; c?: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${LINE}` }}>
      <Mono s={{ fontSize: 13.5, fontWeight: bold ? 700 : 400 }} c={bold ? CHALK : ASH}>{k}</Mono>
      <Mono s={{ fontSize: 13.5, fontWeight: bold ? 800 : 400 }} c={c}>{v}</Mono>
    </div>
  );
}

const linkBtn: React.CSSProperties = {
  ...mono,
  fontSize: 13,
  color: txt(AMBER),
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  textDecoration: "underline",
};
