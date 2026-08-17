import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import {
  LABEL_LEG_SPEC,
  THE_NUMBER_DEFINITION,
  THE_NUMBER_UNSTARTED,
  VANITY_METRICS,
  judgeEffect,
  leading,
  type AthleteWeekLedgerRow,
  type BindingLeg,
  type LegCapture,
  type NumberMovement,
} from "@hybrid/core";
import { adminGet } from "../../lib/admin-api";
import { fs, space, F, Mono, Kicker, LoadSwap, TABULAR, MAX_FONT_SCALE } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { ErrorNote, Legend } from "./_kit";
import { ACard, cardStack, AMeter } from "../aurora/kit";
import { RollingNumber } from "../aurora/rolling-number";

// THE NUMBER on mobile — parity with apps/web/components/admin/athlete-weeks.tsx,
// fed by GET /api/admin/athlete-weeks. Web draws the ledger as a stacked recharts
// bar; here it is the same DATA as label+meter rows (no chart dep), which is the
// convention the admin Overview already follows.

/** How many ledger weeks the phone draws. The figure covers the whole window. */
const LEDGER_ROWS_ON_PHONE = 12;

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
  const { palette } = useTheme();
  const [d, setD] = useState<Payload | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    adminGet<Payload>("/api/admin/athlete-weeks").then((r) => {
      if (r.ok && r.data) setD(r.data);
      else setErr(true);
    });
  }, []);

  if (err) return <ErrorNote error="Failed to compute labeled athlete-weeks." />;

  return (
    <LoadSwap loading={!d}>
      {() => {
        if (!d) return null;
        const m = d.movement;
        const started = d.number > 0 || d.activeWeeks > 0;
        // The delta carries a tone because it is the only figure on this screen
        // that is a JUDGEMENT — the same rule AStat applies to a sign-led sub.
        const effect = judgeEffect(m.previous, m.latest);
        const deltaTone = { moved: palette.lime, lost: palette.red, flat: palette.ash, unstarted: palette.ash }[effect.verdict];
        const deltaLabel = effect.delta > 0 ? `+${effect.delta}` : String(effect.delta);
        // The phone shows the tail of the ledger rather than all 26 weeks of it
        // as 78 meter rows; the FIGURE above still covers the whole window, and
        // the kicker says which slice is drawn.
        const shown = d.ledger.slice(-LEDGER_ROWS_ON_PHONE);
        const maxWeek = Math.max(1, ...shown.map((r) => r.athletes));

        return (
          <View>
            {/* ---- the figure itself ---- */}
            <ACard style={cardStack}>
              <Kicker color={palette.lime}>The number – labeled athlete-weeks</Kicker>
              <View style={{ marginTop: 8, marginBottom: 4, flexDirection: "row" }}>
                <RollingNumber
                  value={d.number.toLocaleString()}
                  style={{
                    ...TABULAR,
                    fontFamily: F.black,
                    fontSize: fs.stat,
                    color: txt(palette, palette.lime),
                    lineHeight: leading(fs.stat, "tight"),
                  }}
                />
              </View>
              <Mono color={palette.chalk} style={{ fontSize: fs.bodyLg, lineHeight: leading(fs.bodyLg) }}>
                {d.definition || THE_NUMBER_DEFINITION}
              </Mono>
              {started ? (
                <>
                  <Mono color={palette.ash} style={{ marginTop: 8 }}>
                    {`Banked by ${d.athletes.toLocaleString()} ${d.athletes === 1 ? "athlete" : "athletes"} over ${d.window.weeks} weeks.`}
                  </Mono>
                  <Mono color={deltaTone}>
                    {`Last complete week ${m.latest} (${deltaLabel} on the week before).`}
                  </Mono>
                  <Mono color={palette.ash}>
                    {`Four-week run rate ${m.run4 === null ? "—" : m.run4.toFixed(1)} a week.`}
                  </Mono>
                </>
              ) : (
                <Mono color={palette.ash} style={{ marginTop: 8 }}>{THE_NUMBER_UNSTARTED}</Mono>
              )}
            </ACard>

            {/* ---- the three legs ---- */}
            <ACard style={cardStack}>
              <Kicker>Legs – captured in the active weeks</Kicker>
              <View style={{ marginTop: 10 }}>
                {d.legs.map((leg) => {
                  const spec = LABEL_LEG_SPEC[leg.leg];
                  const pct = leg.rate === null ? 0 : leg.rate * 100;
                  return (
                    <View key={leg.leg} style={{ marginBottom: 12 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Mono color={palette.chalk} style={{ fontSize: fs.body }}>{spec.label}</Mono>
                        <Mono color={palette.ash} style={{ fontSize: fs.caption }}>
                          {leg.rate === null ? "—" : `${leg.captured} / ${leg.captured + leg.missing}`}
                        </Mono>
                      </View>
                      <AMeter
                        value={leg.rate === null ? "—" : `${Math.round(pct)}%`}
                        pct={pct}
                        color={leg.rate !== null && leg.rate >= 0.8 ? palette.lime : palette.amber}
                      />
                      <Mono color={palette.ash} style={{ fontSize: fs.micro, marginTop: 3 }}>{spec.question}</Mono>
                    </View>
                  );
                })}
              </View>
            </ACard>

            {/* ---- the next piece of work, named by the metric ---- */}
            <ACard accent={d.binding.leg ? palette.amber : undefined} style={cardStack}>
              <Kicker color={palette.amber}>Binding leg</Kicker>
              <Text
                maxFontSizeMultiplier={MAX_FONT_SCALE}
                style={{
                  fontFamily: F.black,
                  fontSize: fs.headline,
                  lineHeight: leading(fs.headline, "tight"),
                  color: txt(palette, d.binding.leg ? palette.amber : palette.ash),
                  marginTop: 6,
                  marginBottom: 4,
                }}
              >
                {d.binding.leg ? LABEL_LEG_SPEC[d.binding.leg].label : "None"}
              </Text>
              <Mono color={palette.ash}>
                {d.binding.leg
                  ? `Missing from ${d.binding.weeksBlocked} active ${d.binding.weeksBlocked === 1 ? "week" : "weeks"}. Fixing it alone banks ${d.binding.weeksRecoverable}.`
                  : d.activeWeeks === 0
                    ? "Nothing is active, so nothing is binding."
                    : "Every active week is fully labeled."}
              </Mono>
            </ACard>

            {/* ---- the ledger ---- */}
            <ACard style={cardStack}>
              <Kicker color={palette.lime}>The ledger</Kicker>
              <Mono color={palette.ash} style={{ marginTop: 2, marginBottom: 10 }}>
                {d.ledger.length > shown.length
                  ? `Last ${shown.length} of ${d.ledger.length} weeks – banked, first weeks, and weeks we half-learned from`
                  : "Per week – banked, first weeks, and weeks we half-learned from"}
              </Mono>
              {d.activeWeeks === 0 ? (
                <Mono color={palette.ash} style={{ fontSize: fs.body }}>
                  No athlete has logged a week in this window.
                </Mono>
              ) : (
                <>
                  <View style={{ flexDirection: "row", gap: space.md, marginBottom: 8 }}>
                    <Legend color={palette.lime} label="banked" />
                    <Legend color={palette.blue} label="first weeks" />
                    <Legend color={palette.ash} label="partial" />
                  </View>
                  {shown.map((r) => (
                    <View key={r.week} style={{ marginBottom: 8 }}>
                      <Mono color={palette.ash} style={{ fontSize: fs.micro, marginBottom: 3 }}>{r.week.slice(5)}</Mono>
                      <AMeter value={String(r.labeled)} pct={(r.labeled / maxWeek) * 100} color={palette.lime} />
                      <AMeter value={String(r.firstWeeks)} pct={(r.firstWeeks / maxWeek) * 100} color={palette.blue} />
                      <AMeter value={String(r.partial)} pct={(r.partial / maxWeek) * 100} color={palette.ash} />
                    </View>
                  ))}
                </>
              )}
            </ACard>

            {/* ---- what the counters are, and why they are not the metric ---- */}
            <ACard style={cardStack}>
              <Kicker>Counters – context, not targets</Kicker>
              <Mono color={palette.ash} style={{ marginTop: 6, marginBottom: 10 }}>
                These move when we work. The number above moves when an athlete does. Read them for
                context and never steer by them.
              </Mono>
              {VANITY_METRICS.map((v) => (
                <View key={v.label} style={{ marginBottom: 8 }}>
                  <Mono color={palette.chalk} style={{ fontSize: fs.body }}>{v.label}</Mono>
                  <Mono color={palette.ash} style={{ fontSize: fs.micro, lineHeight: leading(fs.micro) }}>{v.why}</Mono>
                </View>
              ))}
            </ACard>
          </View>
        );
      }}
    </LoadSwap>
  );
}

