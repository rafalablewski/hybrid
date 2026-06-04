"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import {
  REVENUE_STREAMS,
  COST_DRIVERS,
  DEFAULT_ASSUMPTIONS,
  computeEconomics,
  type EconomicAssumptions,
  type RevenueStreamId,
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
} from "@/lib/ui";

const STREAM_COLOR: Record<RevenueStreamId, string> = {
  b2c: LIME,
  coach: VIOLET,
  org: BLUE,
  data: ASH,
};

const usd = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;
const usdFull = (n: number) =>
  `$${Math.round(n).toLocaleString()}`;

export default function AdminFinancials() {
  const [seed, setSeed] = useState<{ totalUsers: number; coaches: number } | null>(null);
  const [seedErr, setSeedErr] = useState(false);
  const [useLive, setUseLive] = useState(true);
  const [a, setA] = useState<EconomicAssumptions>(DEFAULT_ASSUMPTIONS);

  // Seed the audience inputs from the real platform aggregate (same shape the
  // Overview screen consumes). Every value stays editable below.
  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((s: { totalUsers: number; coaches: number }) => {
        setSeed({ totalUsers: s.totalUsers, coaches: s.coaches });
        setA((prev) => ({ ...prev, totalUsers: s.totalUsers, coaches: s.coaches }));
      })
      .catch(() => setSeedErr(true));
  }, []);

  const r = useMemo(() => computeEconomics(a), [a]);

  const set = (patch: Partial<EconomicAssumptions>) => {
    setUseLive(false);
    setA((prev) => ({ ...prev, ...patch }));
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <Mono s={{ fontSize: 13, lineHeight: 1.5 }}>
        How HYBRID makes money, what it costs to run, and a live unit-economics
        model — seeded from real platform counts, every assumption editable. This
        is a planning tool; live charging is the blocked <strong style={{ color: AMBER }}>billing</strong> capability.
      </Mono>

      {/* ---- headline ---- */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        <Stat label="MRR (modeled)" value={usdFull(r.revenue.total)} c={LIME} />
        <Stat label="ARR (modeled)" value={usdFull(r.arr)} c={LIME} />
        <Stat
          label="Gross margin"
          value={`${Math.round(r.grossMargin * 100)}%`}
          sub={r.grossProfit >= 0 ? `+${usdFull(r.grossProfit)}/mo` : `−${usdFull(-r.grossProfit)}/mo`}
          c={r.grossProfit >= 0 ? LIME : RED}
        />
        <Stat
          label="LTV : CAC"
          value={Number.isFinite(r.ltvToCac) ? `${r.ltvToCac.toFixed(1)}×` : "∞"}
          sub={ltvCacOk ? "healthy (≥3×)" : "−below 3×"}
          c={ltvCacOk ? LIME : AMBER}
        />
      </div>

      {/* ---- how we make money ---- */}
      <Section title="How HYBRID makes money" kicker="Revenue streams · who pays · what they pay for">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {REVENUE_STREAMS.map((stream) => {
            const color = STREAM_COLOR[stream.id];
            const monthly =
              stream.id === "b2c" ? r.revenue.b2c : stream.id === "coach" ? r.revenue.coach : stream.id === "org" ? r.revenue.org : null;
            return (
              <Card key={stream.id} style={{ borderLeft: `3px solid ${color}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ ...disp, fontWeight: 800, fontSize: 16 }}>
                    {stream.label}
                    {stream.future && <span style={{ marginLeft: 8 }}><Chip c={ASH}>Future</Chip></span>}
                  </div>
                  {monthly != null ? (
                    <Mono s={{ fontSize: 13 }} c={color}>{usdFull(monthly)}/mo modeled</Mono>
                  ) : (
                    <Mono s={{ fontSize: 12 }} c={ASH}>not in live margin</Mono>
                  )}
                </div>
                <Mono s={{ fontSize: 12, display: "block", marginTop: 4 }} c={ASH}>
                  {stream.whoPays}
                </Mono>
                <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap" }}>
                  {stream.tiers.map((t) => (
                    <Chip key={t.name} c={color}>
                      {t.name} · {t.price}
                    </Chip>
                  ))}
                </div>
                <Mono s={{ fontSize: 12.5, lineHeight: 1.5, display: "block", marginTop: 10 }} c={CHALK}>
                  {stream.howItWorks}
                </Mono>
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
                  {stream.tiers.map((t) => (
                    <Mono key={t.name} s={{ fontSize: 11.5, lineHeight: 1.4 }} c={ASH}>
                      <span style={{ color: CHALK }}>{t.name}</span> — {t.note}
                    </Mono>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      </Section>

      {/* ---- what it costs us ---- */}
      <Section title="What it costs us" kicker="Cost of goods + fixed opex (COGS drivers)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {COST_DRIVERS.map((c) => {
            const live =
              c.id === "ai" ? r.cogs.ai : c.id === "infra" ? r.cogs.infra : c.id === "stripe" ? r.cogs.stripe : c.id === "fixed" ? r.cogs.fixed : null;
            return (
              <Card key={c.id} style={{ borderLeft: `3px solid ${c.kind === "fixed" ? AMBER : RED}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div style={{ ...disp, fontWeight: 700, fontSize: 14 }}>{c.label}</div>
                  <Chip c={c.kind === "fixed" ? AMBER : RED}>{c.kind === "fixed" ? "fixed" : "COGS"}</Chip>
                </div>
                <Mono s={{ fontSize: 12, display: "block", marginTop: 4 }} c={CHALK}>{c.rate}</Mono>
                {live != null && (
                  <Mono s={{ fontSize: 12, display: "block", marginTop: 2 }} c={ASH}>
                    ≈ {usdFull(live)}/mo at current model
                  </Mono>
                )}
                <Mono s={{ fontSize: 11.5, lineHeight: 1.45, display: "block", marginTop: 8 }} c={ASH}>
                  {c.note}
                </Mono>
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
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.1fr) minmax(0,1fr)", gap: 16 }}>
          {/* inputs */}
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={ASH}>Assumptions</Mono>
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
              <Range label="Starter share" value={Math.round(a.coachTierMix.starter * 100)} min={0} max={100} step={5} suffix="%" onChange={(v) => set({ coachTierMix: { ...a.coachTierMix, starter: v / 100 } })} />
              <Range label="Pro share" value={Math.round(a.coachTierMix.pro * 100)} min={0} max={100} step={5} suffix="%" onChange={(v) => set({ coachTierMix: { ...a.coachTierMix, pro: v / 100 } })} />
              <Range label="Business share" value={Math.round(a.coachTierMix.business * 100)} min={0} max={100} step={5} suffix="%" onChange={(v) => set({ coachTierMix: { ...a.coachTierMix, business: v / 100 } })} />
            </Group>

            <Group label="Org / Enterprise">
              <Num label="Org athletes" value={a.orgAthletes} step={25} onChange={(v) => set({ orgAthletes: v })} />
              <Num label="Price /athlete/yr" value={a.orgPricePerAthleteYear} step={5} prefix="$" onChange={(v) => set({ orgPricePerAthleteYear: v })} />
            </Group>

            <Group label="Costs">
              <Range label="AI active share" value={a.aiActivePct} min={0} max={100} step={5} suffix="%" onChange={(v) => set({ aiActivePct: v })} />
              <Num label="AI $/active user/mo" value={a.aiCostPerUserMonthly} step={0.5} prefix="$" onChange={(v) => set({ aiCostPerUserMonthly: v })} />
              <Num label="Infra $/user/mo" value={a.infraCostPerUserMonthly} step={0.05} prefix="$" onChange={(v) => set({ infraCostPerUserMonthly: v })} />
              <Num label="Fixed opex /mo" value={a.fixedOpexMonthly} step={50} prefix="$" onChange={(v) => set({ fixedOpexMonthly: v })} />
              <Num label="Stripe fee" value={a.stripeFeePct} step={0.1} suffix="%" onChange={(v) => set({ stripeFeePct: v })} />
            </Group>

            <Group label="Growth & efficiency">
              <Range label="Monthly churn" value={a.monthlyChurnPct} min={0} max={20} step={0.5} suffix="%" onChange={(v) => set({ monthlyChurnPct: v })} />
              <Num label="CAC ($/customer)" value={a.cac} step={5} prefix="$" onChange={(v) => set({ cac: v })} />
            </Group>
          </Card>

          {/* outputs */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
              <Stat label="MRR" value={usdFull(r.revenue.total)} c={LIME} />
              <Stat label="ARR" value={usdFull(r.arr)} c={LIME} />
              <Stat label="Blended ARPU" value={`$${r.blendedArpu.toFixed(2)}`} sub={`${r.payingUnits.toLocaleString()} paying`} c={CHALK} />
              <Stat label="Gross margin" value={`${Math.round(r.grossMargin * 100)}%`} c={r.grossProfit >= 0 ? LIME : RED} />
              <Stat label="LTV" value={Number.isFinite(r.ltv) ? usdFull(r.ltv) : "∞"} c={VIOLET} />
              <Stat label="CAC payback" value={Number.isFinite(r.cacPaybackMonths) ? `${r.cacPaybackMonths.toFixed(1)} mo` : "never"} c={Number.isFinite(r.cacPaybackMonths) && r.cacPaybackMonths <= 12 ? LIME : AMBER} />
            </div>

            <ChartFrame title="Revenue by stream" kicker="Modeled MRR" c={LIME}>
              <ResponsiveContainer width="100%" height={170}>
                <BarChart data={revChart}>
                  <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
                  <XAxis dataKey="name" stroke={ASH} style={{ ...mono, fontSize: 11 }} />
                  <YAxis stroke={ASH} style={{ ...mono, fontSize: 11 }} tickFormatter={usd} width={44} />
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
              <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 8 }} c={ASH}>
                Monthly P&L
              </Mono>
              <PnL k="Revenue (MRR)" v={usdFull(r.revenue.total)} c={LIME} />
              <PnL k="AI (Anthropic)" v={`−${usdFull(r.cogs.ai)}`} />
              <PnL k="Infra (Supabase + Vercel)" v={`−${usdFull(r.cogs.infra)}`} />
              <PnL k="Stripe fees" v={`−${usdFull(r.cogs.stripe)}`} />
              <PnL k="Fixed opex" v={`−${usdFull(r.cogs.fixed)}`} />
              <PnL k={r.grossProfit >= 0 ? "Contribution" : "Burn"} v={`${r.grossProfit >= 0 ? "" : "−"}${usdFull(Math.abs(r.grossProfit))}`} c={r.grossProfit >= 0 ? LIME : RED} bold />
              <Mono s={{ fontSize: 11.5, display: "block", marginTop: 10 }} c={ASH}>
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
    </div>
  );
}

// ---- small building blocks ----

function Section({ title, kicker, children }: { title: string; kicker: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={AMBER}>{kicker}</Mono>
        <div style={{ ...disp, fontWeight: 800, fontSize: 19, marginTop: 2 }}>{title}</div>
      </div>
      {children}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".12em", display: "block", marginBottom: 8 }} c={ASH}>
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
      <Mono s={{ fontSize: 12 }} c={ASH}>{label}</Mono>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {prefix && <Mono s={{ fontSize: 12 }} c={ASH}>{prefix}</Mono>}
        <input
          type="number"
          value={value}
          step={step}
          min={0}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          style={{
            ...mono,
            fontSize: 13,
            width: 84,
            textAlign: "right",
            padding: "6px 8px",
            borderRadius: 8,
            background: INK2,
            color: CHALK,
            border: `1px solid ${LINE}`,
            outline: "none",
          }}
        />
        {suffix && <Mono s={{ fontSize: 12 }} c={ASH}>{suffix}</Mono>}
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
        <Mono s={{ fontSize: 12 }} c={ASH}>{label}</Mono>
        <Mono s={{ fontSize: 12 }} c={CHALK}>{value}{suffix}</Mono>
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
        fontSize: 11,
        padding: "5px 9px",
        borderRadius: 7,
        cursor: disabled ? "not-allowed" : "pointer",
        border: `1px solid ${active ? LIME : LINE}`,
        background: active ? `${LIME}1c` : "transparent",
        color: disabled ? LINE : active ? LIME : ASH,
      }}
    >
      {label}
    </button>
  );
}

function PnL({ k, v, c = CHALK, bold }: { k: string; v: string; c?: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${LINE}` }}>
      <Mono s={{ fontSize: 12.5, fontWeight: bold ? 700 : 400 }} c={bold ? CHALK : ASH}>{k}</Mono>
      <Mono s={{ fontSize: 12.5, fontWeight: bold ? 800 : 400 }} c={c}>{v}</Mono>
    </div>
  );
}
