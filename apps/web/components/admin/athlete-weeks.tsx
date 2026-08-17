"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  LABEL_LEG_SPEC,
  THE_NUMBER_DEFINITION,
  THE_NUMBER_UNSTARTED,
  VANITY_METRICS,
  judgeEffect,
  type AthleteWeekLedgerRow,
  type BindingLeg,
  type LegCapture,
  type NumberMovement,
} from "@hybrid/core";
import {
  fs,
  space,
  LINE_HEX,
  LIME,
  LIME_HEX,
  CHALK,
  ASH,
  BLUE,
  AMBER,
  RED,
  disp,
  mono,
  tabular,
  tip,
  txt,
  Card,
  ChartFrame,
  Mono,
} from "@/lib/ui";
import RollingNumber from "@/components/aurora/rolling-number";
import { Loading } from "../aurora/skeleton";

// THE NUMBER — labeled athlete-weeks, at the head of the operator console.
//
// This panel is the company's scoreboard and its to-do list at once: the figure
// is what has been banked, the legs say which of the three captures is leaking,
// and the binding leg names the next piece of work. Definition, retention rule
// and the leg descriptions all come from core (athlete-weeks.ts) so this screen
// and its mobile twin cannot describe the metric differently.

type Payload = {
  definition: string;
  window: { weeks: number; from: string; retentionGapWeeks: number };
  number: number;
  athletes: number;
  activeWeeks: number;
  ledger: AthleteWeekLedgerRow[];
  legs: LegCapture[];
  binding: BindingLeg;
  movement: NumberMovement;
};

export default function TheNumber() {
  const [d, setD] = useState<Payload | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    fetch("/api/admin/athlete-weeks")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setD)
      .catch(() => setErr(true));
  }, []);

  if (err)
    return (
      <Card span={4} style={{ textAlign: "center" }}>
        <Mono>Failed to compute labeled athlete-weeks.</Mono>
      </Card>
    );
  if (!d)
    return (
      <Card span={4}>
        <Loading />
      </Card>
    );

  const { movement: m } = d;
  const started = d.number > 0 || d.activeWeeks > 0;
  // The delta carries a tone because it is the only figure on this screen that
  // is a JUDGEMENT — the same rule the stat tiles apply to a sign-led sub.
  const effect = judgeEffect(m.previous, m.latest);
  const deltaTone = { moved: LIME, lost: RED, flat: ASH, unstarted: ASH }[effect.verdict];
  const deltaLabel = effect.delta > 0 ? `+${effect.delta}` : String(effect.delta);

  return (
    <>
      {/* ---- the figure itself ---- */}
      <Card span={4}>
        <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>
          The number – labeled athlete-weeks
        </Mono>
        <div
          style={{
            ...disp,
            ...tabular,
            fontWeight: 800,
            fontSize: fs.stat,
            lineHeight: 1.1,
            color: txt(LIME),
            margin: "8px 0 4px",
            display: "flex",
          }}
        >
          <RollingNumber value={d.number.toLocaleString()} />
        </div>
        <Mono s={{ fontSize: fs.bodyLg, lineHeight: 1.5, maxWidth: "62ch" }} c={CHALK}>
          {d.definition || THE_NUMBER_DEFINITION}
        </Mono>
        {started ? (
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: space.ms, alignItems: "baseline" }}>
            <Mono s={{ fontSize: fs.caption }}>
              {`Banked by ${d.athletes.toLocaleString()} ${d.athletes === 1 ? "athlete" : "athletes"} over ${d.window.weeks} weeks.`}
            </Mono>
            <Mono s={{ fontSize: fs.caption }} c={deltaTone}>
              {`Last complete week ${m.latest} (${deltaLabel} on the week before).`}
            </Mono>
            <Mono s={{ fontSize: fs.caption }}>
              {`Four-week run rate ${m.run4 === null ? "—" : m.run4.toFixed(1)} a week.`}
            </Mono>
          </div>
        ) : (
          <Mono s={{ fontSize: fs.caption, marginTop: 8, display: "block" }}>{THE_NUMBER_UNSTARTED}</Mono>
        )}
      </Card>

      {/* ---- the three legs ---- */}
      {d.legs.map((leg) => {
        const spec = LABEL_LEG_SPEC[leg.leg];
        return (
          <Card key={leg.leg} span={1}>
            <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }}>
              {spec.label}
            </Mono>
            <div
              style={{
                ...disp,
                ...tabular,
                fontWeight: 800,
                fontSize: fs.hero,
                lineHeight: 1.1,
                color: txt(leg.rate === null ? ASH : leg.rate >= 0.8 ? LIME : AMBER),
                margin: "6px 0 2px",
                display: "flex",
              }}
            >
              {leg.rate === null ? "—" : `${Math.round(leg.rate * 100)}%`}
            </div>
            <Mono s={{ fontSize: fs.caption, display: "block" }}>
              {leg.rate === null
                ? "No active weeks to measure."
                : `Captured in ${leg.captured} of ${leg.captured + leg.missing} active weeks.`}
            </Mono>
            <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 6, lineHeight: 1.5 }}>
              {spec.question}
            </Mono>
          </Card>
        );
      })}

      {/* ---- the next piece of work, named by the metric ---- */}
      <Card span={1}>
        <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={AMBER}>
          Binding leg
        </Mono>
        <div
          style={{
            ...disp,
            fontWeight: 800,
            fontSize: fs.headline,
            lineHeight: 1.15,
            color: txt(d.binding.leg ? AMBER : ASH),
            margin: "6px 0 4px",
          }}
        >
          {d.binding.leg ? LABEL_LEG_SPEC[d.binding.leg].label : "None"}
        </div>
        <Mono s={{ fontSize: fs.caption, display: "block", lineHeight: 1.5 }}>
          {d.binding.leg
            ? `Missing from ${d.binding.weeksBlocked} active ${d.binding.weeksBlocked === 1 ? "week" : "weeks"}. Fixing it alone banks ${d.binding.weeksRecoverable}.`
            : d.activeWeeks === 0
              ? "Nothing is active, so nothing is binding."
              : "Every active week is fully labeled."}
        </Mono>
      </Card>

      {/* ---- the ledger ---- */}
      <ChartFrame
        span={4}
        title="The ledger"
        kicker="Per week – banked, first weeks, and weeks we half-learned from"
        c={LIME}
      >
        {d.activeWeeks === 0 ? (
          <Mono s={{ fontSize: fs.bodyLg }}>No athlete has logged a week in this window.</Mono>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={d.ledger}>
              <CartesianGrid stroke={LINE_HEX} strokeDasharray="3 3" />
              <XAxis
                dataKey="week"
                tickFormatter={(w: string) => w.slice(5)}
                stroke={ASH}
                style={{ ...mono, fontSize: fs.caption }}
              />
              <YAxis stroke={ASH} style={{ ...mono, fontSize: fs.caption }} allowDecimals={false} />
              <Tooltip contentStyle={tip} />
              <Legend wrapperStyle={{ ...mono, fontSize: fs.caption }} />
              <Bar stackId="w" dataKey="labeled" name="banked" fill={LIME_HEX} radius={[0, 0, 0, 0]} />
              <Bar stackId="w" dataKey="firstWeeks" name="first weeks" fill={BLUE} />
              <Bar stackId="w" dataKey="partial" name="partial" fill={LINE_HEX} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartFrame>

      {/* ---- what the counters are, and why they are not the metric ---- */}
      <ChartFrame span={4} title="Counters" kicker="Context, not targets" c={ASH}>
        <div style={{ display: "flex", flexDirection: "column", gap: space.ms }}>
          <Mono s={{ fontSize: fs.caption, lineHeight: 1.6, maxWidth: "74ch" }}>
            These move when we work. The number above moves when an athlete does. Read them for
            context and never steer by them.
          </Mono>
          {VANITY_METRICS.map((v) => (
            <div key={v.label} style={{ display: "flex", gap: space.md, alignItems: "baseline" }}>
              <Mono s={{ fontSize: fs.caption, minWidth: 150 }} c={CHALK}>
                {v.label}
              </Mono>
              <Mono s={{ fontSize: fs.caption, lineHeight: 1.6, flex: 1 }}>{v.why}</Mono>
            </div>
          ))}
        </div>
      </ChartFrame>
    </>
  );
}
