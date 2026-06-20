import { useEffect, useMemo, useState } from "react";
import { View, Text } from "react-native";
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
import { adminGet } from "../../lib/admin-api";
import { Card, Mono, Kicker, Chip, Loading, F } from "../../lib/ui";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { Intro, Stat, Input, PillBtn, Segmented } from "./_kit";

// Mobile Financials — parity with apps/web/components/admin/financials.tsx + the
// @hybrid/core economics engine. Same DATA (revenue, COGS/margin, per-segment
// unit economics, SaaS scorecard, 12-month forecast), seeded from
// GET /api/admin/stats. Web uses recharts; here the forecast/revenue charts are
// rendered as label+bar rows and Stat tiles (no chart dep). Read-only model: key
// assumptions are editable and recompute live; nothing is written back.

// ---- formatters (mirror web) ----
const usd = (n: number) => {
  const sign = n < 0 ? "−" : "";
  const abs = Math.abs(n);
  return abs >= 1000 ? `${sign}$${(abs / 1000).toFixed(1)}k` : `${sign}$${abs.toFixed(0)}`;
};
const usdFull = (n: number) => `${n < 0 ? "−" : ""}$${Math.round(Math.abs(n)).toLocaleString()}`;
const pct = (n: number) => `${n.toFixed(0)}%`;
const x1 = (n: number) => (Number.isFinite(n) ? `${n.toFixed(1)}×` : "∞");
const mo = (n: number) => (Number.isFinite(n) ? `${n.toFixed(1)} mo` : "never");

type Tab = "revenue" | "costs" | "calc" | "segments" | "forecast";
type Seed = { totalUsers: number; coaches: number };
type AgentCost = { spend: number; runs: number };

export default function AdminFinancials() {
  const { palette } = useTheme();
  const [tab, setTab] = useState<Tab>("revenue");
  const [seed, setSeed] = useState<Seed | null>(null);
  const [agentCost, setAgentCost] = useState<AgentCost | null>(null);
  const [seedErr, setSeedErr] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [a, setA] = useState<EconomicAssumptions>(DEFAULT_ASSUMPTIONS);
  const [showGlossary, setShowGlossary] = useState(false);

  // Seed the audience inputs from real platform counts; sanitize each field.
  useEffect(() => {
    adminGet<{
      totalUsers?: number; coaches?: number; agentSpend30d?: number; agentRuns30d?: number;
    }>("/api/admin/stats").then((res) => {
      if (res.ok && res.data) {
        const s = res.data;
        const totalUsers = typeof s.totalUsers === "number" ? s.totalUsers : DEFAULT_ASSUMPTIONS.totalUsers;
        const coaches = typeof s.coaches === "number" ? s.coaches : DEFAULT_ASSUMPTIONS.coaches;
        setSeed({ totalUsers, coaches });
        setA((prev) => ({ ...prev, totalUsers, coaches }));
        setAgentCost({
          spend: typeof s.agentSpend30d === "number" ? s.agentSpend30d : 0,
          runs: typeof s.agentRuns30d === "number" ? s.agentRuns30d : 0,
        });
      } else {
        setSeedErr(true);
      }
      setLoaded(true);
    });
  }, []);

  const r = useMemo(() => computeEconomics(a), [a]);

  const setNum = (patch: Partial<EconomicAssumptions>) => setA((prev) => ({ ...prev, ...patch }));
  const reseed = () => setA({ ...DEFAULT_ASSUMPTIONS, ...(seed ?? {}) });
  const reset = () => setA(DEFAULT_ASSUMPTIONS);

  if (!loaded) return <Loading />;

  const h = r.health;
  const ps = r.projectionSummary;
  const ltvCacOk = Number.isFinite(r.ltvToCac) && r.ltvToCac >= 3;

  const streamColor: Record<RevenueStreamId, string> = {
    b2c: palette.lime, coach: palette.violet, org: palette.blue, data: palette.ash,
  };

  return (
    <View>
      <Intro>
        How HYBRID makes money, what it costs to run, and a live unit-economics model — seeded from
        real platform counts, every key assumption editable. A planning tool; live charging is the
        blocked billing capability.
      </Intro>

      {/* headline always on top */}
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Stat label="MRR (modeled)" value={usdFull(r.revenue.total)} sub={`ARR ${usdFull(r.arr)}`} color={palette.lime} />
        <Stat label="Gross margin" value={`${Math.round(r.grossMargin * 100)}%`}
          sub={r.grossProfit >= 0 ? `+${usdFull(r.grossProfit)}/mo` : `−${usdFull(-r.grossProfit)}/mo`}
          color={r.grossProfit >= 0 ? palette.lime : palette.red} />
      </View>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Stat label="LTV : CAC" value={x1(r.ltvToCac)} sub={ltvCacOk ? "healthy (≥3×)" : "below 3×"} color={ltvCacOk ? palette.lime : palette.amber} />
        <Stat label="Rule of 40" value={Math.round(h.ruleOf40).toString()} sub={h.ruleOf40 >= 40 ? "passes (≥40)" : "below 40"} color={band(palette, h.ruleOf40, 40, 25)} />
      </View>

      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "revenue", label: "Revenue" },
          { value: "costs", label: "Costs" },
          { value: "calc", label: "Calculator" },
          { value: "segments", label: "Segments" },
          { value: "forecast", label: "Forecast" },
        ]}
      />

      {tab === "revenue" && (
        <RevenueTab r={r} streamColor={streamColor} showGlossary={showGlossary} setShowGlossary={setShowGlossary} />
      )}
      {tab === "costs" && <CostsTab r={r} agentCost={agentCost} />}
      {tab === "calc" && (
        <CalcTab a={a} r={r} seed={seed} seedErr={seedErr} setNum={setNum} reseed={reseed} reset={reset} />
      )}
      {tab === "segments" && <SegmentsTab r={r} />}
      {tab === "forecast" && <ForecastTab r={r} a={a} h={h} ps={ps} />}
    </View>
  );
}

// ---- Revenue tab: streams + markets + entitlement matrix ----
function RevenueTab({
  r, streamColor, showGlossary, setShowGlossary,
}: {
  r: ReturnType<typeof computeEconomics>;
  streamColor: Record<RevenueStreamId, string>;
  showGlossary: boolean;
  setShowGlossary: (v: boolean) => void;
}) {
  const { palette } = useTheme();
  return (
    <View>
      <PillBtn label={showGlossary ? "Hide glossary" : "What do these terms mean?"} color={palette.amber} outline onPress={() => setShowGlossary(!showGlossary)} />
      {showGlossary && <Glossary />}

      <SectionLabel kicker="Revenue streams · who pays" title="How HYBRID makes money" />
      {REVENUE_STREAMS.map((stream) => {
        const color = streamColor[stream.id];
        const monthly = stream.id === "b2c" ? r.revenue.b2c : stream.id === "coach" ? r.revenue.coach : stream.id === "org" ? r.revenue.org : null;
        const share = monthly != null && r.revenue.total > 0 ? (monthly / r.revenue.total) * 100 : null;
        return (
          <Card key={stream.id} accent={color}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Text style={{ fontFamily: F.black, fontSize: 16, color: palette.chalk }}>{stream.label}</Text>
              {stream.future && <Chip color={palette.ash}>Future</Chip>}
            </View>
            {monthly != null ? (
              <Mono color={color} style={{ fontSize: 13, marginTop: 2 }}>
                {usdFull(monthly)}/mo modeled{share != null ? ` · ${share.toFixed(0)}% of MRR` : ""}
              </Mono>
            ) : (
              <Mono color={palette.ash} style={{ fontSize: 12, marginTop: 2 }}>not in live margin</Mono>
            )}
            <Mono color={palette.ash} style={{ fontSize: 12, marginTop: 4 }}>{stream.whoPays}</Mono>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {stream.tiers.map((t) => <Chip key={t.name} color={color}>{t.name} · {t.price}</Chip>)}
            </View>
            <Mono color={palette.chalk} style={{ fontSize: 12, marginTop: 10, lineHeight: 17 }}>{stream.howItWorks}</Mono>
          </Card>
        );
      })}

      <SectionLabel kicker={`Localized price · FX ${PRICING_REF_DATE}`} title="Focus markets & pricing" />
      {MARKET_PRICING.map((m) => {
        const isPLN = m.currency === "PLN";
        const loc = (n: number) => (isPLN ? `${Math.round(n)} zł` : `${m.symbol}${Number.isInteger(n) ? n : n.toFixed(2)}`);
        const eq = (n: number) => `≈ $${toUsd(n, m.fxPerUsd).toFixed(2)}`;
        return (
          <Card key={m.id}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Text style={{ fontFamily: F.black, fontSize: 16, color: palette.chalk }}>{m.flag} {m.market}</Text>
              <Chip color={palette.blue}>{m.currency} · {Math.round(m.priceIndex * 100)}% of US</Chip>
            </View>
            <Mono color={palette.chalk} style={{ fontSize: 12, marginTop: 8 }}>
              Pro {loc(m.proMonthly)}/mo ({eq(m.proMonthly)}) · {loc(m.proAnnual)}/yr
            </Mono>
            <Mono color={palette.ash} style={{ fontSize: 11, marginTop: 4 }}>
              Coach {loc(m.coachStarter)}·{loc(m.coachPro)}·{loc(m.coachBusiness)}/mo · Org {loc(m.orgLow)}–{loc(m.orgHigh)}/athlete/yr
            </Mono>
            <Mono color={palette.ash} style={{ fontSize: 11, marginTop: 4 }}>{m.tax} · Stripe {m.stripeFee}</Mono>
            <Mono color={palette.chalk} style={{ fontSize: 11, marginTop: 6, lineHeight: 16 }}>{m.rationale}</Mono>
          </Card>
        );
      })}

      <SectionLabel kicker="Entitlement matrix · free → org" title="What each plan includes" />
      <PlanMatrix />
    </View>
  );
}

// Entitlement matrix as stacked per-feature rows (web uses a wide table).
function PlanMatrix() {
  const { palette } = useTheme();
  const planColor: Record<string, string> = {
    free: palette.ash, pro: palette.lime, coach: palette.violet, org: palette.blue,
  };
  const cellText = (v: EntitlementCell) => (v === false ? "—" : v === true ? "✓" : v);
  const cellColor = (v: EntitlementCell) => (v === false ? palette.ash : v === true ? palette.lime : palette.amber);

  return (
    <View>
      {ENTITLEMENT_MATRIX.map((row, i) => {
        const groupHeader = row.group !== ENTITLEMENT_MATRIX[i - 1]?.group;
        return (
          <View key={`${row.group}-${i}`}>
            {groupHeader && (
              <Mono color={palette.amber} style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginTop: 14, marginBottom: 4 }}>
                {row.group}
              </Mono>
            )}
            <Card style={{ marginBottom: 8 }}>
              <Text style={{ fontFamily: F.semi, fontSize: 13, color: palette.chalk }}>{row.feature}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 6 }}>
                {PLAN_COLUMNS.map((c) => {
                  const v = row[c.id];
                  return (
                    <View key={c.id} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Mono color={planColor[c.id]} style={{ fontSize: 11 }}>{c.label}</Mono>
                      <Mono color={cellColor(v)} style={{ fontSize: 11 }}>{cellText(v)}</Mono>
                    </View>
                  );
                })}
              </View>
            </Card>
          </View>
        );
      })}
    </View>
  );
}

// ---- Costs tab ----
function CostsTab({ r, agentCost }: { r: ReturnType<typeof computeEconomics>; agentCost: AgentCost | null }) {
  const { palette } = useTheme();
  return (
    <View>
      <SectionLabel kicker="COGS drivers + fixed opex" title="What it costs us" />
      {agentCost && agentCost.runs > 0 && (
        <Card accent={palette.blue}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontFamily: F.bold, fontSize: 14, color: palette.chalk }}>Actual AI agent spend</Text>
            <Chip color={palette.blue}>real · 30d</Chip>
          </View>
          <Mono color={palette.chalk} style={{ fontSize: 13, marginTop: 4 }}>
            {usdFull(agentCost.spend)} over {agentCost.runs.toLocaleString()} runs (≈ {usdFull(agentCost.spend / 30)}/day)
          </Mono>
          <Mono color={palette.ash} style={{ fontSize: 11, marginTop: 6, lineHeight: 16 }}>
            Measured from real agent runs (tokens × model list price). Calibrate the modeled AI COGS below against it.
          </Mono>
        </Card>
      )}
      {COST_DRIVERS.map((c) => {
        const live = c.id === "ai" ? r.cogs.ai : c.id === "infra" ? r.cogs.infra : c.id === "stripe" ? r.cogs.stripe : c.id === "support" ? r.cogs.support : c.id === "fixed" ? r.cogs.fixed : null;
        const share = live != null && r.revenue.total > 0 ? (live / r.revenue.total) * 100 : null;
        const accent = c.kind === "fixed" ? palette.amber : palette.red;
        return (
          <Card key={c.id} accent={accent}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontFamily: F.bold, fontSize: 14, color: palette.chalk }}>{c.label}</Text>
              <Chip color={accent}>{c.kind === "fixed" ? "fixed" : "COGS"}</Chip>
            </View>
            <Mono color={palette.chalk} style={{ fontSize: 12, marginTop: 4 }}>{c.rate}</Mono>
            {live != null && (
              <Mono color={palette.ash} style={{ fontSize: 12, marginTop: 2 }}>
                ≈ {usdFull(live)}/mo{share != null ? ` · ${share.toFixed(0)}% of revenue` : ""}
              </Mono>
            )}
            <Mono color={palette.ash} style={{ fontSize: 11, marginTop: 6, lineHeight: 16 }}>{c.note}</Mono>
            {c.id === "fixed" && <FixedOpexBreakdown />}
          </Card>
        );
      })}
    </View>
  );
}

function FixedOpexBreakdown() {
  const { palette } = useTheme();
  const recurring = FIXED_OPEX_ITEMS.filter((i) => i.kind === "recurring");
  const extras = FIXED_OPEX_ITEMS.filter((i) => i.kind !== "recurring");
  const total = recurring.reduce((s, i) => s + i.monthlyUsd, 0);
  return (
    <View style={{ marginTop: 12 }}>
      {recurring.map((i) => (
        <View key={i.label} style={{ flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: palette.line, paddingVertical: 6, gap: 8 }}>
          <Mono color={palette.chalk} style={{ fontSize: 12, flex: 1 }}>{i.label}</Mono>
          <Mono color={palette.ash} style={{ fontSize: 11 }}>{i.billed}</Mono>
          <Mono color={palette.ash} style={{ fontSize: 12, width: 56, textAlign: "right" }}>{usdFull(i.monthlyUsd)}</Mono>
        </View>
      ))}
      <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 }}>
        <Mono color={palette.amber} style={{ fontSize: 12 }}>Recurring run-rate</Mono>
        <Mono color={palette.amber} style={{ fontSize: 12 }}>{usdFull(total)}</Mono>
      </View>
      {extras.length > 0 && (
        <Mono color={palette.ash} style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginTop: 8 }}>
          Not in the monthly run-rate
        </Mono>
      )}
      {extras.map((i) => (
        <View key={i.label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, gap: 8 }}>
          <Mono color={palette.ash} style={{ fontSize: 11, flex: 1 }}>{i.note ? `${i.label} · ${i.note}` : i.label}</Mono>
          <Mono color={palette.ash} style={{ fontSize: 11 }}>{i.billed}</Mono>
        </View>
      ))}
    </View>
  );
}

// ---- Calculator tab: editable assumptions + P&L ----
function CalcTab({
  a, r, seed, seedErr, setNum, reseed, reset,
}: {
  a: EconomicAssumptions;
  r: ReturnType<typeof computeEconomics>;
  seed: Seed | null;
  seedErr: boolean;
  setNum: (patch: Partial<EconomicAssumptions>) => void;
  reseed: () => void;
  reset: () => void;
}) {
  const { palette } = useTheme();
  return (
    <View>
      <SectionLabel
        kicker={seedErr ? "Live counts unavailable — model defaults" : seed ? `Seeded: ${seed.totalUsers.toLocaleString()} users · ${seed.coaches} coaches` : "Loading…"}
        title="Unit-economics calculator"
      />
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        <PillBtn label="Reseed live" color={palette.lime} outline onPress={reseed} disabled={!seed} />
        <PillBtn label="Defaults" color={palette.ash} outline onPress={reset} />
      </View>

      <Card>
        <Kicker>Assumptions</Kicker>
        <View style={{ marginTop: 10 }}>
          <NumIn label="Total users" value={a.totalUsers} onChange={(v) => setNum({ totalUsers: v })} />
          <NumIn label="Coaches" value={a.coaches} onChange={(v) => setNum({ coaches: v })} />
          <NumIn label="Pro conversion %" value={a.proConversionPct} onChange={(v) => setNum({ proConversionPct: v })} />
          <NumIn label="Pro price /mo ($)" value={a.proPriceMonthly} onChange={(v) => setNum({ proPriceMonthly: v })} />
          <NumIn label="Annual mix %" value={a.annualMixPct} onChange={(v) => setNum({ annualMixPct: v })} />
          <NumIn label="Org athletes" value={a.orgAthletes} onChange={(v) => setNum({ orgAthletes: v })} />
          <NumIn label="Price /athlete/yr ($)" value={a.orgPricePerAthleteYear} onChange={(v) => setNum({ orgPricePerAthleteYear: v })} />
          <NumIn label="AI active share %" value={a.aiActivePct} onChange={(v) => setNum({ aiActivePct: v })} />
          <NumIn label="AI $/active user/mo" value={a.aiCostPerUserMonthly} onChange={(v) => setNum({ aiCostPerUserMonthly: v })} />
          <NumIn label="Infra $/user/mo" value={a.infraCostPerUserMonthly} onChange={(v) => setNum({ infraCostPerUserMonthly: v })} />
          <NumIn label="Coach support $/seat/mo" value={a.coachServiceCostMonthly} onChange={(v) => setNum({ coachServiceCostMonthly: v })} />
          <NumIn label="Fixed opex /mo ($)" value={a.fixedOpexMonthly} onChange={(v) => setNum({ fixedOpexMonthly: v })} />
          <NumIn label="Stripe fee %" value={a.stripeFeePct} onChange={(v) => setNum({ stripeFeePct: v })} />
          <NumIn label="B2C churn /mo %" value={a.b2cMonthlyChurnPct} onChange={(v) => setNum({ b2cMonthlyChurnPct: v })} />
          <NumIn label="Coach churn /mo %" value={a.coachMonthlyChurnPct} onChange={(v) => setNum({ coachMonthlyChurnPct: v })} />
          <NumIn label="B2C CAC ($/sub)" value={a.b2cCac} onChange={(v) => setNum({ b2cCac: v })} />
          <NumIn label="Coach CAC ($/seat)" value={a.coachCac} onChange={(v) => setNum({ coachCac: v })} />
          <NumIn label="New-logo growth /mo %" value={a.monthlyGrowthPct} onChange={(v) => setNum({ monthlyGrowthPct: v })} />
          <NumIn label="Net expansion /mo %" value={a.monthlyExpansionPct} onChange={(v) => setNum({ monthlyExpansionPct: v })} />
          <NumIn label="Cash on hand ($)" value={a.cashOnHand} onChange={(v) => setNum({ cashOnHand: v })} />
        </View>
      </Card>

      <View style={{ flexDirection: "row", gap: 12 }}>
        <Stat label="MRR" value={usdFull(r.revenue.total)} color={palette.lime} />
        <Stat label="ARR" value={usdFull(r.arr)} color={palette.lime} />
      </View>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Stat label="Blended ARPU" value={`$${r.blendedArpu.toFixed(2)}`} sub={`${r.payingUnits.toLocaleString()} paying`} />
        <Stat label="Gross margin" value={`${Math.round(r.grossMargin * 100)}%`} color={r.grossProfit >= 0 ? palette.lime : palette.red} />
      </View>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Stat label="Blended LTV" value={Number.isFinite(r.ltv) ? usdFull(r.ltv) : "∞"} color={palette.violet} />
        <Stat label="CAC payback" value={mo(r.cacPaybackMonths)} color={Number.isFinite(r.cacPaybackMonths) && r.cacPaybackMonths <= 12 ? palette.lime : palette.amber} />
      </View>

      <Card>
        <Kicker>Monthly P&amp;L</Kicker>
        <View style={{ marginTop: 8 }}>
          <PnL k="Revenue (MRR)" v={usdFull(r.revenue.total)} c={palette.lime} />
          <PnL k="AI (Anthropic)" v={`−${usdFull(r.cogs.ai)}`} />
          <PnL k="Infra (Supabase + Vercel)" v={`−${usdFull(r.cogs.infra)}`} />
          <PnL k="Stripe fees" v={`−${usdFull(r.cogs.stripe)}`} />
          <PnL k="Coach success / support" v={`−${usdFull(r.cogs.support)}`} />
          <PnL k="Fixed opex" v={`−${usdFull(r.cogs.fixed)}`} />
          <PnL k={r.grossProfit >= 0 ? "Contribution" : "Burn"} v={`${r.grossProfit >= 0 ? "" : "−"}${usdFull(Math.abs(r.grossProfit))}`} c={r.grossProfit >= 0 ? palette.lime : palette.red} bold />
        </View>
        <Mono color={palette.ash} style={{ fontSize: 11, marginTop: 10, lineHeight: 16 }}>
          Break-even at {Number.isFinite(r.breakEvenProUsers) ? `${r.breakEvenProUsers.toLocaleString()} Pro subscribers` : "— (Pro contribution ≤ 0)"} holding other assumptions fixed.
        </Mono>
      </Card>
    </View>
  );
}

// ---- Segments + scorecard tab ----
function SegmentsTab({ r }: { r: ReturnType<typeof computeEconomics> }) {
  const { palette } = useTheme();
  const h = r.health;
  return (
    <View>
      <SectionLabel kicker="B2C vs coach, un-blended" title="Unit economics by segment" />
      <SegmentCard seg={r.segments.b2c} color={palette.lime} />
      <SegmentCard seg={r.segments.coach} color={palette.violet} />

      <SectionLabel kicker="The ratios investors read first" title="SaaS health scorecard" />
      <Indicator label="Rule of 40" value={Math.round(h.ruleOf40).toString()} c={band(palette, h.ruleOf40, 40, 25)}
        note={`${Math.round(h.annualGrowthRatePct)}% growth + ${Math.round(r.grossMargin * 100)}% margin`}
        says="Fast growth can excuse thin margins and vice-versa. Pass at 40." />
      <Indicator label="Net revenue retention" value={pct(h.netRetentionAnnualPct)} c={band(palette, h.netRetentionAnnualPct, 110, 100)}
        note="annualized, incl. expansion" says=">100% means the base grows by itself." />
      <Indicator label="Gross revenue retention" value={pct(h.grossRetentionAnnualPct)} c={band(palette, h.grossRetentionAnnualPct, 90, 80)}
        note="annualized, no expansion" says="Pure stickiness — revenue kept with zero upsell." />
      <Indicator label="Quick ratio" value={x1(h.quickRatio)} c={band(palette, h.quickRatio, 4, 2)}
        note={`+${usdFull(h.netNewMrr)}/mo net-new`} says="Revenue added vs lost. ≥4× is efficient." />
      <Indicator label="Magic number" value={x1(h.magicNumber)} c={band(palette, h.magicNumber, 0.75, 0.5)}
        note="new ARR per $ of S&M" says="Sales efficiency. ≥0.75 means lean in." />
      <Indicator label="Burn multiple" value={h.runwayMonths === Infinity ? "profitable" : x1(h.burnMultiple)}
        c={r.grossProfit >= 0 ? palette.lime : band(palette, h.burnMultiple, 1, 2, false)}
        note={r.grossProfit >= 0 ? "no burn" : "$ burned per $ net-new"} says="<1× great, >2× inefficient." />
      <Indicator label="Runway" value={h.runwayMonths === Infinity ? "∞" : `${Math.floor(h.runwayMonths)} mo`}
        c={h.runwayMonths === Infinity ? palette.lime : band(palette, h.runwayMonths, 18, 6)}
        note={h.runwayMonths === Infinity ? "cash-flow positive" : "until cash runs out"} says="Raise before ~6 months." />
      <Indicator label="Annual growth" value={pct(h.annualGrowthRatePct)} c={band(palette, h.annualGrowthRatePct, 100, 40)}
        note="new-logo growth, annualized" says="Growth of the paying base." />
      <Indicator label="LTV : CAC (blended)" value={x1(r.ltvToCac)} c={band(palette, r.ltvToCac, 3, 1)}
        note={`payback ${mo(r.cacPaybackMonths)}`} says="Return per acquisition $. ≥3× healthy." />
    </View>
  );
}

function SegmentCard({ seg, color }: { seg: SegmentEconomics; color: string }) {
  const { palette } = useTheme();
  const paybackOk = Number.isFinite(seg.cacPaybackMonths) && seg.cacPaybackMonths <= 12;
  const ratioOk = Number.isFinite(seg.ltvToCac) && seg.ltvToCac >= 3;
  return (
    <Card accent={color}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <Text style={{ fontFamily: F.black, fontSize: 16, color: palette.chalk }}>{seg.label}</Text>
        <Mono color={palette.ash} style={{ fontSize: 12 }}>{seg.payingUnits.toLocaleString()} paying</Mono>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
        <SegMetric label="ARPU /mo" value={`$${seg.arpu.toFixed(2)}`} />
        <SegMetric label="Contribution margin" value={`${Math.round(seg.grossMargin * 100)}%`} c={seg.grossMargin >= 0 ? palette.chalk : palette.red} />
        <SegMetric label="LTV" value={Number.isFinite(seg.ltv) ? usdFull(seg.ltv) : "∞"} c={color} />
        <SegMetric label="CAC" value={usdFull(seg.cac)} />
        <SegMetric label="CAC payback" value={mo(seg.cacPaybackMonths)} c={paybackOk ? palette.lime : palette.amber} />
        <SegMetric label="LTV : CAC" value={x1(seg.ltvToCac)} c={ratioOk ? palette.lime : palette.amber} />
      </View>
      <Mono color={palette.ash} style={{ fontSize: 11, marginTop: 10 }}>
        {Math.round(seg.monthlyChurn * 1000) / 10}% monthly churn · ~{seg.monthlyChurn > 0 ? Math.round(1 / seg.monthlyChurn) : "∞"} mo avg lifetime
      </Mono>
    </Card>
  );
}

function SegMetric({ label, value, c }: { label: string; value: string; c?: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ width: "47%", backgroundColor: palette.ink2, borderWidth: 1, borderColor: palette.line, borderRadius: 10, padding: 8 }}>
      <Mono color={palette.ash} style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</Mono>
      <Text style={{ fontFamily: F.black, fontSize: 17, color: c ? txt(palette, c) : palette.chalk, marginTop: 2 }}>{value}</Text>
    </View>
  );
}

function Indicator({ label, value, c, note, says }: { label: string; value: string; c: string; note: string; says: string }) {
  const { palette } = useTheme();
  return (
    <Card accent={c}>
      <Mono color={palette.ash} style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</Mono>
      <Text style={{ fontFamily: F.black, fontSize: 26, color: txt(palette, c), marginTop: 2 }}>{value}</Text>
      <Mono color={palette.ash} style={{ fontSize: 11, marginTop: 2 }}>{note}</Mono>
      <Mono color={palette.chalk} style={{ fontSize: 11, marginTop: 6, lineHeight: 16 }}>{says}</Mono>
    </Card>
  );
}

// ---- Forecast tab: 12-month trajectory as bar rows ----
function ForecastTab({
  r, a, h, ps,
}: {
  r: ReturnType<typeof computeEconomics>;
  a: EconomicAssumptions;
  h: ReturnType<typeof computeEconomics>["health"];
  ps: ReturnType<typeof computeEconomics>["projectionSummary"];
}) {
  const { palette } = useTheme();
  const maxMrr = Math.max(1, ...r.projection.map((p) => p.mrr));
  const cashVals = r.projection.map((p) => p.cumulativeCash);
  const maxCashAbs = Math.max(1, ...cashVals.map((v) => Math.abs(v)));
  return (
    <View>
      <SectionLabel kicker="MRR trajectory + cumulative cash" title="12-month forecast" />
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Stat label="MRR in 12 mo" value={usdFull(ps.endingMrr)} sub={`ARR ${usdFull(ps.endingArr)}`} color={palette.lime} />
        <Stat label="Cash in 12 mo" value={usdFull(ps.cumulativeCashEnd)}
          sub={ps.cumulativeCashEnd >= a.cashOnHand ? `+${usdFull(ps.cumulativeCashEnd - a.cashOnHand)}` : `−${usdFull(a.cashOnHand - ps.cumulativeCashEnd)}`}
          color={ps.cumulativeCashEnd >= 0 ? palette.lime : palette.red} />
      </View>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Stat label="P&L break-even" value={ps.breakEvenMonth === null ? ">12 mo" : ps.breakEvenMonth === 0 ? "now" : `mo ${ps.breakEvenMonth}`} color={ps.breakEvenMonth !== null ? palette.lime : palette.amber} />
        <Stat label="Cash-out" value={ps.cashOutMonth === null ? "—" : `mo ${ps.cashOutMonth}`} sub={ps.cashOutMonth === null ? "never within 12mo" : "runs dry"} color={ps.cashOutMonth === null ? palette.lime : palette.red} />
      </View>

      <Card>
        <Kicker color={palette.lime}>MRR vs cumulative cash · next 12 months</Kicker>
        <View style={{ flexDirection: "row", gap: 12, marginTop: 8, marginBottom: 8 }}>
          <Legend color={palette.lime} label="MRR" />
          <Legend color={palette.blue} label="cum. cash" />
        </View>
        {r.projection.map((p) => {
          const mrrPct = Math.max(p.mrr > 0 ? 3 : 0, Math.round((p.mrr / maxMrr) * 100));
          const cashPct = Math.max(Math.abs(p.cumulativeCash) > 0 ? 3 : 0, Math.round((Math.abs(p.cumulativeCash) / maxCashAbs) * 100));
          return (
            <View key={p.month} style={{ marginBottom: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Mono color={palette.ash} style={{ fontSize: 11 }}>M{p.month}</Mono>
                <Mono color={palette.ash} style={{ fontSize: 11 }}>{usd(p.mrr)} · {usd(p.cumulativeCash)}</Mono>
              </View>
              <BarRow value={mrrPct} color={palette.lime} />
              <BarRow value={cashPct} color={p.cumulativeCash < 0 ? palette.red : palette.blue} />
            </View>
          );
        })}
        <Mono color={palette.ash} style={{ fontSize: 11, marginTop: 6, lineHeight: 16 }}>
          MRR compounds at the net monthly rate (new + expansion − churn); variable COGS scale with
          revenue while fixed opex holds. Cash bars turn red when cumulative cash is negative.
          Assumptions, not booked revenue.
        </Mono>
      </Card>
    </View>
  );
}

// ---- shared small blocks ----
function SectionLabel({ kicker, title }: { kicker: string; title: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ marginTop: 18, marginBottom: 10 }}>
      <Kicker color={palette.amber}>{kicker}</Kicker>
      <Text style={{ fontFamily: F.black, fontSize: 18, color: palette.chalk, marginTop: 2 }}>{title}</Text>
    </View>
  );
}

function NumIn({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  // Local string state so editing (incl. "0", "1.", "") isn't fought by the model.
  const [text, setText] = useState(String(value));
  // Resync when the model value changes from outside (reseed/reset).
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setText(String(value));
  }
  return (
    <Input
      label={label}
      value={text}
      keyboardType="numeric"
      onChangeText={(t) => {
        setText(t);
        const n = Number(t);
        if (t.trim() !== "" && Number.isFinite(n)) onChange(Math.max(0, n));
      }}
    />
  );
}

function PnL({ k, v, c, bold }: { k: string; v: string; c?: string; bold?: boolean }) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: palette.line }}>
      <Mono color={bold ? palette.chalk : palette.ash} style={{ fontSize: 12, fontFamily: bold ? F.bold : F.mono }}>{k}</Mono>
      <Text style={{ fontFamily: bold ? F.black : F.mono, fontSize: 12, color: c ? txt(palette, c) : palette.chalk }}>{v}</Text>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }} />
      <Mono color={palette.ash} style={{ fontSize: 11 }}>{label}</Mono>
    </View>
  );
}

function BarRow({ value, color }: { value: number; color: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: palette.line, overflow: "hidden", marginTop: 3 }}>
      <View style={{ width: `${value}%`, height: "100%", backgroundColor: color, borderRadius: 4 }} />
    </View>
  );
}

function Glossary() {
  const { palette } = useTheme();
  return (
    <Card>
      <Kicker color={palette.amber}>Metric glossary</Kicker>
      <View style={{ marginTop: 10 }}>
        {METRIC_GUIDE.map((m) => (
          <View key={m.id} style={{ borderLeftWidth: 2, borderLeftColor: palette.line, paddingLeft: 10, marginBottom: 12 }}>
            <Text style={{ fontFamily: F.bold, fontSize: 13, color: palette.chalk }}>{m.label}</Text>
            <Mono color={palette.chalk} style={{ fontSize: 11, marginTop: 3, lineHeight: 16 }}>{m.what}</Mono>
            <Mono color={palette.violet} style={{ fontSize: 11, marginTop: 3 }}>= {m.formula}</Mono>
            <Mono color={palette.lime} style={{ fontSize: 11, marginTop: 2 }}>{m.benchmark}</Mono>
          </View>
        ))}
      </View>
    </Card>
  );
}

// Three-band judgement → palette colour. good ≥ great, warn ≥ ok, else bad.
function band(palette: Palette, v: number, great: number, ok: number, higherBetter = true): string {
  if (!Number.isFinite(v)) return higherBetter ? palette.lime : palette.red;
  if (higherBetter) return v >= great ? palette.lime : v >= ok ? palette.amber : palette.red;
  return v <= great ? palette.lime : v <= ok ? palette.amber : palette.red;
}
