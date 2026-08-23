import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import {
  tissueAxis, injuryHeadlineKey, INJURY_AREA_KEY,
  computeInjuryRisk, computeLoad, riskRole, RISK_DRIVER_LABEL_KEY, RISK_DRIVER_EXPLAIN_KEY,
  loadExplain, loadVerdict, LOAD_METRICS, LOAD_METRIC_LABEL_KEY,
  type LoadExplain, type LoadMetric,
  type RiskBand, type RiskDriverKind, type TissueRow,
  type MuscleGroup, type TissueRisk,

  ALPHA,} from "@hybrid/core";
import { fetchRtpProtocols, type RtpProtocol } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, roleColor } from "../../lib/theme";
import { F, FIXED_FONT_SCALE, MAX_FONT_SCALE, PressScale as Pressable, fs, leading, tracking, ty} from "../../lib/ui";
import { AuroraIcon } from "./icons";
import { ACard, CardFoot, ActionPill , RADIUS} from "./kit";
import LoadSheet from "./load-sheet";
import { InjurySheet, RiskBody } from "./protocol";
import { withAlpha } from "./field";

/** The protocol's full span, so the status line can say "day 9 of 21" without
 *  the card needing the whole ladder. Matches engines/rtp.ts. */
const RTP_TOTAL_DAYS = 21;
/** Which day of the protocol today is — 1-based, from the injury date the
 *  athlete gave when they opened it. */
function protocolDay(p: { injuryDate?: string | null }): number | null {
  if (!p.injuryDate) return null;
  const t = Date.parse(p.injuryDate);
  if (!Number.isFinite(t)) return null;
  return Math.max(1, Math.floor((Date.now() - t) / 86_400_000) + 1);
}

/**
 * TISSUE — one card for injury risk AND return-to-play. It plots from
 * `tissueAxis` (@hybrid/core), so where a tick or a bar sits is computed once
 * and tested, not laid out by eye here.
 *
 *   calm     — title, one sentence, the axis, a quiet footer rail.
 *   open     — the same tissues as rows on the SAME axis, each carrying its
 *              own risk, calibrated probability and ACWR.
 *   flagged  — those rows open themselves, with the whole-body reading and
 *              the driver guidance.
 *   injured  — an open protocol takes over the card's body.
 */
type Palette = ReturnType<typeof useTheme>["palette"];
const riskColor = (b: RiskBand | string, C: Palette) => roleColor(C, riskRole(b));

/** Zone tints for the axis, as hex alpha suffixes — low recedes, high reads
 *  as a wall. Mirrors ZONE_ALPHA on web. */
const ZONE_ALPHA: Record<RiskBand, string> = { low: "66", moderate: "8c", elevated: "85", high: "e6" };

export default function TissueCard({
  risk,
  load,
  hasData,
  onOpenToday,
}: {
  risk: ReturnType<typeof computeInjuryRisk>;
  load: ReturnType<typeof computeLoad>;
  /** Where the running protocol lives now. An injured athlete's protocol is a
   *  DAILY object — steps, dates, checkboxes — so it belongs on Today, where
   *  they meet it on the morning they have to do it, not several screens deep
   *  in an analytics tab. This card keeps the status and the door, so the flag
   *  and the protocol stay one object. Mirrors web. */
  onOpenToday?: () => void;
  /** Whether there is any logged training to read. With none, the card states
   *  NO risk — an axis of zeroes would say "you're clear to train", which is
   *  a claim about data we don't have — but it still offers the way in to a
   *  protocol, since an athlete can be hurt before they've logged anything. */
  hasData: boolean;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const axis = tissueAxis(risk);
  const byTissue = Object.fromEntries(risk.tissues.map((ti) => [ti.tissue, ti])) as Record<string, TissueRisk>;
  const [protocols, setProtocols] = useState<RtpProtocol[]>([]);
  // The rows are a disclosure only while everything is calm — a flagged tissue
  // opens them itself, since a worklist you have to find is not one. An
  // OVERRIDE rather than a plain boolean, so a flag sets the DEFAULT without
  // taking the control away: the previous cut hid the toggle entirely whenever
  // a flag held the rows open, which left the card's one remaining control
  // undrawn exactly when the card mattered most.
  const [rowsOverride, setRowsOverride] = useState<boolean | null>(null);
  // The area the athlete pointed at on the card's own body, if that is how
  // they got to the sheet — the flag and the protocol are one object.
  const [picking, setPicking] = useState<MuscleGroup | null | false>(false);
  /**
   * WHICH DOOR IS OPEN, and it is two doors rather than one.
   *
   *   false        — closed.
   *   "all"        — the ⓘ on the block: the whole reading, the sentence and
   *                  every figure behind it.
   *   a LoadMetric — one receipt was tapped: that figure alone.
   *
   * The block's claim and its evidence are different questions, and a reader
   * who taps "1.79 MONOTONY" has asked the second one. Sending them to a sheet
   * that opens on the sentence and makes them scroll past three other figures
   * answers a question they did not ask.
   */
  const [sheet, setSheet] = useState<LoadMetric | "all" | false>(false);

  const refresh = () => { fetchRtpProtocols().then(setProtocols); };
  useEffect(() => { refresh(); }, []);

  // NULL while the ratio is still building — there is no "what you normally
  // do" to compare against yet, so half the sentence would be invented.
  const verdict = hasData ? loadVerdict(load) : null;
  const active = protocols.filter((p) => p.status !== "abandoned");
  const alert = hasData && axis.flaggedCount > 0;
  const rowsOpen = rowsOverride ?? alert;

  const driverKinds = ((): RiskDriverKind[] => {
    const weight = new Map<RiskDriverKind, number>();
    for (const ti of risk.flagged) for (const d of ti.drivers) weight.set(d.kind, (weight.get(d.kind) ?? 0) + d.contribution);
    return [...weight.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  })();

  return (
    <ACard solid style={{ marginTop: 16, borderColor: alert ? withAlpha(C.red, ALPHA.rim) : C.line, backgroundColor: alert ? withAlpha(C.red, ALPHA.wash) : undefined }}>
      {/* HEAD — the subject, and how many tissues are on the worklist. */}
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <Text style={{ fontFamily: F.black, fontSize: fs.title, letterSpacing: tracking(fs.title), color: alert ? txt(C, C.red) : C.chalk }}>{t("w.injury.tissue")}</Text>
        {hasData && (
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: alert ? txt(C, C.red) : C.ash }}>
            {axis.flaggedCount}/{axis.total} {t("w.injury.flaggedMeta")}
          </Text>
        )}
      </View>

      {/* One sentence, in the display face. With no logged training there is
          no answer to give, so the card says what it is waiting for instead of
          claiming an all-clear. */}
      {hasData ? (
        <>
          <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, letterSpacing: tracking(fs.subtitle), lineHeight: leading(16), marginTop: 8, color: C.chalk }}>
            {t(injuryHeadlineKey(axis))}
          </Text>
          <Axis axis={axis} C={C} t={t} />
        </>
      ) : (
        <>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, lineHeight: leading(fs.caption), marginTop: 8 }}>{t("w.home.cockpit.watchBuilding")}</Text>
          {/* THE BODY, WITH NOTHING MEASURED. The way into the injury sheet
              lives inside the rows panel now — and an unmeasured card has no
              rows, so it would render no way to file an injury at all. That is
              precisely the athlete this card already worries about: hurt before
              they have logged anything. The body is also the one useful thing
              this state has to show, so it fills a card that otherwise says
              only that it is still waiting. */}
          <View style={{ marginTop: 18 }}>
            <RiskBody byTissue={byTissue} onPick={(g) => setPicking(g)} />
          </View>
          <View style={{ marginTop: 14 }}>
            <ActionPill label={t("w.injury.logInjury")} onPress={() => setPicking(null)} />
          </View>
        </>
      )}

      {/* AN OPEN PROTOCOL IS A STATUS LINE HERE, AND A DOOR.
          The protocol itself renders on Today, in the Recover cluster. It used
          to live inside this card, which meant the one surface an injured
          athlete needs every morning could only be reached by opening an
          analytics tab and scrolling. The risk that prompted it and the
          protocol that answers it stay one object because this row points
          straight at it. Mirrors web. */}
      {active.length > 0 && (
        <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.line }}>
          {active.map((p) => {
            const day = protocolDay(p);
            return (
              <Pressable key={p.id} onPress={onOpenToday} disabled={!onOpenToday} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "baseline", gap: 12 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: tracking(fs.nano, "caps"), color: txt(C, C.red) }}>{t("w.injury.protocolRunning")}</Text>
                <Text style={{ marginLeft: "auto", fontFamily: F.bold, fontSize: fs.caption, color: C.chalk }}>
                  {t(INJURY_AREA_KEY[p.tissue as MuscleGroup])}
                  {day != null ? ` – ${t("w.injury.protocolDay").replace("{n}", String(day)).replace("{total}", String(RTP_TOTAL_DAYS))}` : ""}
                  {onOpenToday ? " →" : ""}
                </Text>
              </Pressable>
            );
          })}
          <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, marginTop: 4, lineHeight: leading(fs.caption) }}>{t("w.injury.protocolWhere")}</Text>
        </View>
      )}

      {/* THE QUESTION gets its own surface. It used to unfold inside the card,
          pushing everything under it down — a form appearing mid-card for the
          most consequential thing an athlete files here. */}
      <InjurySheet
        visible={picking !== false}
        initial={picking || null}
        onClose={() => setPicking(false)}
        onOpened={refresh}
      />

      {/* THE BLOCK'S DOOR — one sheet for the sentence and all four figures. */}
      <LoadSheet load={sheet === false ? null : load} focus={sheet === "all" ? null : sheet || null} onClose={() => setSheet(false)} />

      {/* THE PANEL — moved wholesale out of the card body and into the foot's
          drawer, so it opens from under the shape that raised the question
          rather than snapping into place. Web parity. */}
      {hasData && (
        <CardFoot
          status={t("w.injury.riskModel").replace("{v}", axis.modelVersion)}
          expander={{
            // Never "All tissues": the panel is not an inventory, it is the
            // same figure broken out per tissue. And never a second label for
            // the open state — the chevron's rotation reports that.
            label: t("w.injury.byTissue"),
            open: rowsOpen,
            onToggle: () => setRowsOverride(!rowsOpen),
          }}
        >
          <View style={{ paddingBottom: 4 }}>
            <Rows rows={axis.rows} C={C} t={t} />
            {risk.awaitingBaseline.length > 0 && (
              <View style={{ marginTop: 12, padding: 12, borderRadius: RADIUS.inner, borderWidth: 1, borderColor: C.line, backgroundColor: withAlpha(C.ash, ALPHA.wash) }}>
                <Text style={{ ...ty(C, "kicker"), marginBottom: 4  }}>{t("w.injury.acwrPending")}</Text>
                <Text style={{ fontFamily: F.reg, fontSize: fs.caption, lineHeight: leading(fs.caption), color: C.chalk }}>{t("w.injury.acwrPendingBody")}</Text>
              </View>
            )}

            {/* WHOLE-BODY — labelled, because the ratio in the rows above is each
                tissue's own and this is a different measurement.

                A SENTENCE, THEN THE RECEIPTS. This shipped twice. It was four
                bare numerals in a four-up grid under a footnote that explained
                only the first of them; the first fix made each figure bigger,
                put it on a scrolling rail and gave each one its own ⓘ. That
                treated the symptom. Four explainer buttons in a row are four
                admissions that four figures failed to communicate, and the
                grid's real problem was never that it was small — it was
                UNACCOMPANIED. Four numerals were doing the work of a sentence.

                So the block leads with the sentence (`loadVerdict`, two
                clauses: how much, and what shape), and the figures go back to
                being small because they are no longer the ones explaining —
                they are receipts you can check. This is the grammar the card
                already speaks: `injuryHeadlineKey` puts one display-face
                sentence over the risk axis for exactly the same reason.

                NO BOXES. The tissue rows above are type on the card; a row of
                bordered tiles here made one card hold two treatments of the
                same kind of information.

                TWO DOORS, AND THEY ANSWER DIFFERENT QUESTIONS. The ⓘ sits on
                the block and opens the whole reading — the sentence, both
                bands it was composed from, the week behind them, every figure.
                Each RECEIPT is its own door onto that figure alone. This is
                not the four-doors-in-a-row the rail was rightly criticised
                for: there, four explainer buttons were the ONLY way in and
                each one admitted its tile had failed to communicate. Here the
                sentence already communicates, and a receipt is a figure you
                can interrogate if you want to — an affordance, not a
                confession. A reader who taps "1.79 MONOTONY" asked about
                monotony, and should not have to scroll past three other
                figures to be answered. */}
            {verdict ? (
              <View style={{ marginTop: 18 }}>
                {/* THE CLAIM — eyebrow, ⓘ and the sentence are one target. */}
                <Pressable
                  onPress={() => setSheet("all")}
                  accessibilityRole="button"
                  accessibilityLabel={`${t("w.injury.wholeBody")}. ${t(verdict.key)} ${t("w.injury.load.explainCta")}`}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <Text style={{ flex: 1, fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: tracking(fs.nano, "caps"), color: C.ash }}>{t("w.injury.wholeBody")}</Text>
                    {/* ⓘ bare — the glyph is already a ring (house rule). */}
                    <AuroraIcon name="info" size={15} color={C.ash} />
                  </View>
                  <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, letterSpacing: tracking(fs.subtitle), lineHeight: leading(16), color: C.chalk }}>
                    {t(verdict.key)}
                  </Text>
                </Pressable>
                {/* THE EVIDENCE — each figure its own target. The row cancels
                    the receipts' vertical padding (`-RECEIPT_PAD`) so touch
                    height reaches 44dp without the figures moving a pixel —
                    the same device CoachRail uses for its bleed. */}
                <View style={{ flexDirection: "row", marginTop: 18 - RECEIPT_PAD, marginBottom: -RECEIPT_PAD, gap: 6 }}>
                  {LOAD_METRICS.map((m) => (
                    <Receipt key={m} C={C} t={t} explain={loadExplain(m, load)} onOpen={() => setSheet(m)} />
                  ))}
                </View>
              </View>
            ) : (
              <View style={{ marginTop: 18 }}>
                <Text style={{ ...ty(C, "overline"), marginBottom: 8  }}>{t("w.injury.wholeBody")}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, lineHeight: leading(fs.caption) }}>{t("w.home.cockpit.watchBuilding")}</Text>
              </View>
            )}

            {/* THE BODY — the same tissues again, anatomically. The mannequin is
                shared with the injury picker, so risk is read on the body you
                point at when something goes wrong (web parity: it drew its own
                rectangle map here, and mobile drew nothing at all). */}
            <View style={{ marginTop: 18 }}>
              <RiskBody byTissue={byTissue} onPick={(g) => setPicking(g)} />
            </View>

            {driverKinds.length > 0 && (
              <View style={{ marginTop: 16, gap: 10 }}>
                {driverKinds.map((k) => (
                  <View key={k}>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: tracking(fs.nano, "label"), color: txt(C, riskColor(risk.band, C)), marginBottom: 3 }}>{t(RISK_DRIVER_LABEL_KEY[k])}</Text>
                    <Text style={{ fontFamily: F.reg, fontSize: fs.caption, lineHeight: leading(fs.caption), color: C.chalk }}>{t(RISK_DRIVER_EXPLAIN_KEY[k])}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* THE QUESTION, WHERE IT IS ASKED. Filing an injury used to sit in
                the footer rail beside two disclosures, at identical weight: the
                one control in any card footer that was neither a status nor a
                disclosure, and the thing that broke the set across the three
                cards. It belongs here, under the body, where pointing at a
                region opens the SAME sheet with that region already filled. */}
            <View style={{ marginTop: 16 }}>
              <ActionPill label={t("w.injury.logInjury")} onPress={() => setPicking(null)} />
            </View>
          </View>
        </CardFoot>
      )}

    </ACard>
  );
}

/** THE AXIS — band zones, the flag line, and one tick per tissue. The heaviest
 *  tick is the overall score, because the engine defines it as the highest
 *  tissue: the same number, drawn once. */
function Axis({ axis, C, t }: { axis: ReturnType<typeof tissueAxis>; C: Palette; t: (k: string) => string }) {
  return (
    <View style={{ marginTop: 18 }}>
      <View style={{ height: 9 }}>
        <View style={{ position: "absolute", left: 0, right: 0, top: 0, height: 9, flexDirection: "row", borderRadius: 5, overflow: "hidden" }}>
          {axis.zones.map((z) => (
            <View key={z.band} style={{ width: `${z.widthPct}%`, height: 9, backgroundColor: `${riskColor(z.band, C)}${ZONE_ALPHA[z.band]}` }} />
          ))}
        </View>
        {/* the flag line — where a tissue joins the worklist */}
        <View style={{ position: "absolute", left: `${axis.flagLeftPct}%`, top: -8, height: 25, width: 1, backgroundColor: withAlpha(C.ash, 0.5) }} />
        {axis.rows.map((r) => (
          <View
            key={r.tissue}
            accessibilityLabel={`${t(INJURY_AREA_KEY[r.tissue])} ${r.risk} of 100`}
            style={{
              position: "absolute",
              left: `${r.leftPct}%`,
              marginLeft: r.top ? -2 : -1,
              top: r.top ? -6 : -3,
              // The top tick reads by SIZE and its band colour, not by a ring:
              // an RN border is drawn INSIDE the width, so a 2px border on a
              // 3px tick would leave no content and paint it card-coloured.
              width: r.top ? 4 : 2,
              height: r.top ? 21 : 15,
              borderRadius: 2,
              backgroundColor: r.top ? riskColor(r.band, C) : withAlpha(C.chalk, 0.46),
            }}
          />
        ))}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 12 }}>
        {["0", `30 ${t("w.injury.axisMod")}`, `50 ${t("w.injury.axisFlag")}`, `70 ${t("w.injury.axisHigh")}`, "100"].map((label) => (
          <Text key={label} maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{label}</Text>
        ))}
      </View>
    </View>
  );
}

/** THE AXIS, EXPLODED — the same tissues as rows on the same scale, so the
 *  flag line runs straight down the block. Replaces a 4-column readout that
 *  had to shrink every figure to fit. */
function Rows({ rows, C, t }: { rows: TissueRow[]; C: Palette; t: (k: string) => string }) {
  return (
    <View style={{ marginTop: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingBottom: 7, borderBottomWidth: 1, borderBottomColor: C.line }}>
        <Text style={{ ...head(C), width: 62 }}>{t("w.analyze.perf.colTissue")}</Text>
        <View style={{ flex: 1 }} />
        <Text style={{ ...head(C), width: 26, textAlign: "right" }}>{t("w.analyze.perf.colRisk")}</Text>
        <Text style={{ ...head(C), width: 44, textAlign: "right" }}>{t("w.analyze.perf.colProb")}</Text>
        <Text style={{ ...head(C), width: 38, textAlign: "right" }}>{t("w.analyze.perf.colAcwr")}</Text>
      </View>
      {rows.map((r) => (
        <View key={r.tissue} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: withAlpha(C.line, 0.6) }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {/* THE AREA COLUMN IS 88, AND IT WAS 62 — which cut "Hamstrings"
                in ENGLISH, plus four of the seven areas in Polish and German
                ("Dwugłowe uda" is 87dp, "Quadrizeps" 69). A table whose first
                column names the row cannot abbreviate the row's name; that is
                the one thing the column is for. 88 is the widest label across
                all three languages at `fs.caption`, measured with the sans
                advance table rather than estimated — pinned in
                test/tissue-card.render.test.tsx. */}
            <Text numberOfLines={1} style={{ fontFamily: r.flagged ? F.black : F.reg, fontSize: fs.caption, color: C.chalk, width: AREA_W }}>{t(INJURY_AREA_KEY[r.tissue])}</Text>
            {/* the row's own bar, on the axis scale, carrying the same flag line */}
            <View style={{ flex: 1, height: 5, borderRadius: RADIUS.mark, backgroundColor: withAlpha(C.ash, ALPHA.solid) }}>
              <View style={{ position: "absolute", left: 0, top: 0, height: 5, width: `${r.leftPct}%`, borderRadius: RADIUS.mark, backgroundColor: r.risk > 0 ? riskColor(r.band, C) : "transparent" }} />
              <View style={{ position: "absolute", left: "50%", top: -6, height: 17, width: 1, backgroundColor: withAlpha(C.ash, 0.5) }} />
            </View>
            <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ ...num(C, r.flagged), width: 26, fontFamily: F.monoBold, color: r.flagged ? txt(C, C.red) : C.chalk }}>{r.risk}</Text>
            <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ ...num(C, r.flagged), width: 44 }}>{r.probPct.toFixed(1)}%</Text>
            <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ ...num(C, r.flagged), width: 38 }}>{r.acwr == null ? "—" : r.acwr.toFixed(2)}</Text>
          </View>
          {/* the driver prints only where it means something */}
          {r.flagged && r.driver && (
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 3, marginLeft: AREA_W + 8 }}>{t(RISK_DRIVER_LABEL_KEY[r.driver])}</Text>
          )}
        </View>
      ))}
    </View>
  );
}

/**
 * ONE WHOLE-BODY FIGURE, as a receipt under the sentence.
 *
 * Chromeless on purpose. It wore a filled, bordered, 12dp-rounded tile in the
 * previous cut, which put a row of boxes directly under a list of tissue rows
 * that are bare type on the card — one card, two treatments of the same kind
 * of information. A figure is not a THING you can open; it is evidence for the
 * sentence above it, and evidence does not need a container.
 *
 * It is also small again, and that is the point rather than a regression: the
 * numerals stopped being the ones doing the explaining, so they no longer have
 * to be big enough to carry a meaning they never could.
 */
/**
 * The vertical padding each receipt carries purely to be tappable.
 *
 * A 13pt figure over a 10pt label with 3dp between them is ~31dp of type at
 * the faces' own line heights — measured at 41dp in the browser twin, which is
 * UNDER the 44dp a thumb needs. 7dp top and bottom clears it with a dp to
 * spare. The row cancels it with a matching negative margin, so this buys
 * touch height and costs no layout — CoachRail's bleed device.
 */
const RECEIPT_PAD = 7;

/** ONE FIGURE, and its own door. Chromeless — a receipt is type on the card,
 *  like the tissue rows above it, and a pressable is not a reason to draw a
 *  box around something. */
function Receipt({ C, t, explain, onOpen }: {
  C: Palette;
  t: (k: string) => string;
  explain: LoadExplain;
  onOpen: () => void;
}) {
  // Same rule the sheet follows: `neutral` resolves to ash, which on a figure
  // reads as disabled rather than as unbanded. Only the two banded figures
  // spend a hue — the other two are chalk.
  const paint = explain.role === "neutral" ? C.chalk : txt(C, roleColor(C, explain.role));
  const label = t(LOAD_METRIC_LABEL_KEY[explain.metric]);
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      // The figure, what it reads as, and the way in — a screen reader gets no
      // "these four are a row of buttons" cue from the layout.
      accessibilityLabel={`${label} ${explain.value}, ${t(explain.readKey)}. ${t("w.injury.load.explainCta")}`}
      style={{ flex: 1, minWidth: 0, paddingVertical: RECEIPT_PAD }}
    >
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.monoBold, fontSize: fs.body, color: paint }}>{explain.value}</Text>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={{ ...ty(C, "kicker"), marginTop: 3  }}>
        {label}
      </Text>
    </Pressable>
  );
}

const head = (C: Palette) => (ty(C, "kicker"));
/** The area column. The widest area name in any of the three languages at
 *  `fs.caption` is Polish "Dwugłowe uda" at 87dp; 92 leaves the slack a
 *  proportional column needs, since unlike the mono ones its content has no
 *  unit width to round up by. The driver line underneath indents to match, so
 *  it starts where the bar does. */
const AREA_W = 92;

const num = (C: Palette, flagged: boolean) => ({ fontFamily: F.mono, fontSize: fs.micro, textAlign: "right" as const, color: flagged ? txt(C, C.red) : C.ash });
