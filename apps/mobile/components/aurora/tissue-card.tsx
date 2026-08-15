import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import {
  tissueAxis, injuryHeadlineKey, INJURY_AREA_KEY,
  computeInjuryRisk, computeLoad, riskRole, RISK_DRIVER_LABEL_KEY, RISK_DRIVER_EXPLAIN_KEY,
  type AcwrBand, type RiskBand, type RiskDriverKind, type TissueRow,
  type MuscleGroup, type TissueRisk,
} from "@hybrid/core";
import { fetchRtpProtocols, type RtpProtocol } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, roleColor } from "../../lib/theme";
import { leading, tracking, fs, F, PressScale as Pressable, FIXED_FONT_SCALE } from "../../lib/ui";
import { ACard, CardFoot, ActionPill , RADIUS} from "./kit";
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
 * TISSUE — one card for injury risk AND return-to-play. The mobile twin of
 * apps/web/components/aurora/tissue-card.tsx; both plot from `tissueAxis`
 * (@hybrid/core), so every tick and bar sits at an identical position.
 *
 *   calm     — title, one sentence, the axis, a quiet footer rail.
 *   open     — the same tissues as rows on the SAME axis, each carrying its
 *              own risk, calibrated probability and ACWR.
 *   flagged  — those rows open themselves, with the whole-body watch tiles and
 *              the driver guidance.
 *   injured  — an open protocol takes over the card's body.
 */
type Palette = ReturnType<typeof useTheme>["palette"];
const riskColor = (b: RiskBand | string, C: Palette) => roleColor(C, riskRole(b));
const acwrColor = (b: AcwrBand, C: Palette): string =>
  b === "sweet-spot" ? C.lime : b === "caution" ? C.amber : b === "danger" ? C.red : b === "detraining" ? C.blue : C.ash;

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

  const refresh = () => { fetchRtpProtocols().then(setProtocols); };
  useEffect(() => { refresh(); }, []);

  const active = protocols.filter((p) => p.status !== "abandoned");
  const alert = hasData && axis.flaggedCount > 0;
  const rowsOpen = rowsOverride ?? alert;

  const driverKinds = ((): RiskDriverKind[] => {
    const weight = new Map<RiskDriverKind, number>();
    for (const ti of risk.flagged) for (const d of ti.drivers) weight.set(d.kind, (weight.get(d.kind) ?? 0) + d.contribution);
    return [...weight.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  })();

  return (
    <ACard solid style={{ marginTop: 16, borderColor: alert ? withAlpha(C.red, 0.45) : C.line, backgroundColor: alert ? withAlpha(C.red, 0.07) : undefined }}>
      {/* HEAD — the subject, and how many tissues are on the worklist. */}
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <Text style={{ fontFamily: F.black, fontSize: fs.title, letterSpacing: tracking.display, color: alert ? txt(C, C.red) : C.chalk }}>{t("w.injury.tissue")}</Text>
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
          <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, letterSpacing: tracking.display, lineHeight: leading(16), marginTop: 8, color: C.chalk }}>
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
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: tracking.caps, color: txt(C, C.red) }}>{t("w.injury.protocolRunning")}</Text>
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
              <View style={{ marginTop: 12, padding: 12, borderRadius: RADIUS.inner, borderWidth: 1, borderColor: C.line, backgroundColor: withAlpha(C.ash, 0.08) }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: tracking.label, color: C.ash, marginBottom: 4 }}>{t("w.injury.acwrPending")}</Text>
                <Text style={{ fontFamily: F.reg, fontSize: fs.caption, lineHeight: leading(fs.caption), color: C.chalk }}>{t("w.injury.acwrPendingBody")}</Text>
              </View>
            )}

            {/* WHOLE-BODY — labelled, because the ratio in the rows above is each
                tissue's own and this is a different measurement. */}
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: tracking.caps, color: C.ash, marginTop: 16, marginBottom: 8 }}>{t("w.injury.wholeBody")}</Text>
            {load.enoughHistory ? (
              <>
                <View style={{ flexDirection: "row", gap: 1, backgroundColor: C.line, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.inner, overflow: "hidden" }}>
                  <Watch C={C} label={t("w.home.cockpit.acwr")} value={load.acwr.toFixed(2)} color={txt(C, acwrColor(load.band, C))} />
                  <Watch C={C} label={t("w.home.cockpit.srpe")} value={load.acute.toLocaleString()} />
                  <Watch C={C} label={t("w.home.cockpit.monotony")} value={load.monotony.toFixed(1)} />
                  <Watch C={C} label={t("w.home.cockpit.strain")} value={load.strain.toLocaleString()} />
                </View>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, lineHeight: leading(fs.nano), marginTop: 8 }}>{t("w.injury.acwrNote")}</Text>
              </>
            ) : (
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, lineHeight: leading(fs.caption) }}>{t("w.home.cockpit.watchBuilding")}</Text>
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
                    <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: tracking.label, color: txt(C, riskColor(risk.band, C)), marginBottom: 3 }}>{t(RISK_DRIVER_LABEL_KEY[k])}</Text>
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
            <Text numberOfLines={1} style={{ fontFamily: r.flagged ? F.black : F.reg, fontSize: fs.caption, color: C.chalk, width: 62 }}>{t(INJURY_AREA_KEY[r.tissue])}</Text>
            {/* the row's own bar, on the axis scale, carrying the same flag line */}
            <View style={{ flex: 1, height: 5, borderRadius: RADIUS.mark, backgroundColor: withAlpha(C.ash, 0.16) }}>
              <View style={{ position: "absolute", left: 0, top: 0, height: 5, width: `${r.leftPct}%`, borderRadius: RADIUS.mark, backgroundColor: r.risk > 0 ? riskColor(r.band, C) : "transparent" }} />
              <View style={{ position: "absolute", left: "50%", top: -6, height: 17, width: 1, backgroundColor: withAlpha(C.ash, 0.5) }} />
            </View>
            <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ ...num(C, r.flagged), width: 26, fontFamily: F.monoBold, color: r.flagged ? txt(C, C.red) : C.chalk }}>{r.risk}</Text>
            <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ ...num(C, r.flagged), width: 44 }}>{r.probPct.toFixed(1)}%</Text>
            <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ ...num(C, r.flagged), width: 38 }}>{r.acwr == null ? "—" : r.acwr.toFixed(2)}</Text>
          </View>
          {/* the driver prints only where it means something */}
          {r.flagged && r.driver && (
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 3, marginLeft: 70 }}>{t(RISK_DRIVER_LABEL_KEY[r.driver])}</Text>
          )}
        </View>
      ))}
    </View>
  );
}

function Watch({ C, label, value, color }: { C: Palette; label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.ink2, paddingVertical: 10, paddingHorizontal: 8, alignItems: "center" }}>
      <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.monoBold, fontSize: fs.body, color: color ?? C.chalk }}>{value}</Text>
      <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: tracking.label, color: C.ash, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

const head = (C: Palette) => ({ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase" as const, letterSpacing: tracking.label, color: C.ash });
const num = (C: Palette, flagged: boolean) => ({ fontFamily: F.mono, fontSize: fs.micro, textAlign: "right" as const, color: flagged ? txt(C, C.red) : C.ash });
