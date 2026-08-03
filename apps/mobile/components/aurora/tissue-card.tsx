import { useEffect, useState } from "react";
import { View, Text, TextInput } from "react-native";
import {
  tissueAxis, injuryHeadlineKey, evaluateRtp, STAGE_LABEL, ALL_MUSCLES,
  computeInjuryRisk, computeLoad, riskRole, RISK_DRIVER_LABEL_KEY, RISK_DRIVER_EXPLAIN_KEY,
  type AcwrBand, type RiskBand, type RiskDriverKind, type TissueRow,
} from "@hybrid/core";
import { fetchRtpProtocols, createRtpProtocol, mutateRtpProtocol, type RtpProtocol, type RtpAuditEntry } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, roleColor } from "../../lib/theme";
import { leading, fs, space, F, PressScale as Pressable, FIXED_FONT_SCALE } from "../../lib/ui";
import { ACard, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";
import { ArrowGlyph } from "./cta-label";

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
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/[-_]/g, " ");

/** Zone tints for the axis, as hex alpha suffixes — low recedes, high reads
 *  as a wall. Mirrors ZONE_ALPHA on web. */
const ZONE_ALPHA: Record<RiskBand, string> = { low: "66", moderate: "8c", elevated: "85", high: "e6" };

export default function TissueCard({
  risk,
  load,
  hasData,
}: {
  risk: ReturnType<typeof computeInjuryRisk>;
  load: ReturnType<typeof computeLoad>;
  /** Whether there is any logged training to read. With none, the card states
   *  NO risk — an axis of zeroes would say "you're clear to train", which is
   *  a claim about data we don't have — but it still offers the way in to a
   *  protocol, since an athlete can be hurt before they've logged anything. */
  hasData: boolean;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const axis = tissueAxis(risk);
  const [protocols, setProtocols] = useState<RtpProtocol[]>([]);
  // The rows are a disclosure only while everything is calm — a flagged
  // tissue opens them itself, since a worklist you have to find is not one.
  const [rowsOpen, setRowsOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pick, setPick] = useState<string>(ALL_MUSCLES[0] ?? "quads");

  const refresh = () => { fetchRtpProtocols().then(setProtocols); };
  useEffect(() => { refresh(); }, []);
  const mutate = async (id: string, body: object) => { if (await mutateRtpProtocol(id, body)) refresh(); };
  const create = async (tissue: string) => { if (await createRtpProtocol(tissue)) refresh(); };

  const active = protocols.filter((p) => p.status !== "abandoned");
  const alert = hasData && axis.flaggedCount > 0;
  const showRows = hasData && (rowsOpen || alert);

  const driverKinds = ((): RiskDriverKind[] => {
    const weight = new Map<RiskDriverKind, number>();
    for (const ti of risk.flagged) for (const d of ti.drivers) weight.set(d.kind, (weight.get(d.kind) ?? 0) + d.contribution);
    return [...weight.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  })();

  return (
    <ACard solid style={{ marginTop: 16, borderColor: alert ? `${C.red}73` : C.line, backgroundColor: alert ? `${C.red}12` : undefined }}>
      {/* HEAD — the subject, and how many tissues are on the worklist. */}
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <Text style={{ fontFamily: F.black, fontSize: 18, letterSpacing: -0.2, color: alert ? txt(C, C.red) : C.chalk }}>{t("w.injury.tissue")}</Text>
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
          <Text style={{ fontFamily: F.black, fontSize: 16, letterSpacing: -0.3, lineHeight: leading(16), marginTop: 8, color: C.chalk }}>
            {t(injuryHeadlineKey(axis))}
          </Text>
          <Axis axis={axis} C={C} t={t} />
        </>
      ) : (
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, lineHeight: leading(fs.caption), marginTop: 8 }}>{t("w.home.cockpit.watchBuilding")}</Text>
      )}

      {showRows && (
        <>
          <Rows rows={axis.rows} C={C} t={t} />
          {risk.awaitingBaseline.length > 0 && (
            <View style={{ marginTop: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: `${C.ash}14` }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.9, color: C.ash, marginBottom: 4 }}>{t("w.injury.acwrPending")}</Text>
              <Text style={{ fontFamily: F.reg, fontSize: fs.caption, lineHeight: leading(fs.caption), color: C.chalk }}>{t("w.injury.acwrPendingBody")}</Text>
            </View>
          )}

          {/* WHOLE-BODY — labelled, because the ratio in the rows above is each
              tissue's own and this is a different measurement. */}
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash, marginTop: 16, marginBottom: 8 }}>{t("w.injury.wholeBody")}</Text>
          {load.enoughHistory ? (
            <>
              <View style={{ flexDirection: "row", gap: 1, backgroundColor: C.line, borderWidth: 1, borderColor: C.line, borderRadius: 12, overflow: "hidden" }}>
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

          {driverKinds.length > 0 && (
            <View style={{ marginTop: 16, gap: 10 }}>
              {driverKinds.map((k) => (
                <View key={k}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.9, color: txt(C, riskColor(risk.band, C)), marginBottom: 3 }}>{t(RISK_DRIVER_LABEL_KEY[k])}</Text>
                  <Text style={{ fontFamily: F.reg, fontSize: fs.caption, lineHeight: leading(fs.caption), color: C.chalk }}>{t(RISK_DRIVER_EXPLAIN_KEY[k])}</Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}

      {/* AN OPEN PROTOCOL IS THIS CARD'S DEEP END — not a card of its own. */}
      {active.length > 0 && (
        <View style={{ marginTop: 16, gap: space.md }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.red) }}>{t("w.rtp.protocol")}</Text>
          {active.map((p) => <Protocol key={p.id} p={p} C={C} t={t} mutate={mutate} />)}
        </View>
      )}

      {/* The chips exist only AFTER the athlete says something is hurt. */}
      {picking && (
        <View style={{ marginTop: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash, marginBottom: 9 }}>{t("w.injury.pickArea")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {ALL_MUSCLES.map((tt) => {
              const on = tt === pick;
              return (
                <Pressable key={tt} onPress={() => setPick(tt)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={{ borderRadius: RADIUS.pill, borderWidth: 1, borderColor: on ? C.lime : C.line, backgroundColor: on ? `${C.lime}1f` : "transparent", paddingHorizontal: 12, paddingVertical: 6 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: on ? txt(C, C.lime) : C.ash, textTransform: "capitalize" }}>{tt}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: 12 }}>
            <Pressable onPress={() => { create(pick); setPicking(false); }} accessibilityRole="button" style={{ backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingHorizontal: 16, paddingVertical: 8 }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.onAccent }}>{t("w.injury.openProtocol")}</Text>
            </Pressable>
            <Pressable onPress={() => setPicking(false)} accessibilityRole="button" style={{ borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, paddingHorizontal: 16, paddingVertical: 8 }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.ash }}>{t("w.injury.cancel")}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* FOOTER RAIL — both ways in, at the same weight. Opening a protocol is
          not a "go" action, so it never takes the chartreuse fill. */}
      <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          {/* Hidden, not disabled, while a flag holds the rows open — a
              control that cannot do anything should not be drawn. */}
          {hasData && !alert ? (
            <Pressable
              onPress={() => setRowsOpen((v) => !v)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityState={{ expanded: showRows }}
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.9, color: C.ash }}>
                {showRows ? t("w.injury.hideTissues") : t("w.injury.allTissues")}
              </Text>
              <AuroraIcon name="chevron-down" size={12} color={C.ash} style={showRows ? { transform: [{ rotate: "180deg" }] } : undefined} />
            </Pressable>
          ) : <View />}
          {!picking && (
            <Pressable onPress={() => setPicking(true)} hitSlop={6} accessibilityRole="button">
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.9, color: alert ? txt(C, C.red) : C.ash }}>
                {alert ? t("w.injury.openProtocol") : t("w.injury.logInjury")}
              </Text>
            </Pressable>
          )}
        </View>
        {/* The calibration behind every number above — a qualifier, not a
            heading. It qualifies figures, so it goes when there are none. */}
        {hasData && (
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textAlign: "right", marginTop: 9 }}>
            {t("w.analyze.perf.model")} {axis.modelVersion}
          </Text>
        )}
      </View>
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
        <View style={{ position: "absolute", left: `${axis.flagLeftPct}%`, top: -8, height: 25, width: 1, backgroundColor: `${C.ash}80` }} />
        {axis.rows.map((r) => (
          <View
            key={r.tissue}
            accessibilityLabel={`${cap(r.tissue)} ${r.risk} of 100`}
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
              backgroundColor: r.top ? riskColor(r.band, C) : `${C.chalk}75`,
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
        <View key={r.tissue} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: `${C.line}99` }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text numberOfLines={1} style={{ fontFamily: r.flagged ? F.black : F.reg, fontSize: fs.caption, color: C.chalk, textTransform: "capitalize", width: 62 }}>{r.tissue}</Text>
            {/* the row's own bar, on the axis scale, carrying the same flag line */}
            <View style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: `${C.ash}29` }}>
              <View style={{ position: "absolute", left: 0, top: 0, height: 5, width: `${r.leftPct}%`, borderRadius: 3, backgroundColor: r.risk > 0 ? riskColor(r.band, C) : "transparent" }} />
              <View style={{ position: "absolute", left: "50%", top: -6, height: 17, width: 1, backgroundColor: `${C.ash}80` }} />
            </View>
            <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ ...num(C, r.flagged), width: 26, fontWeight: "700", color: r.flagged ? txt(C, C.red) : C.chalk }}>{r.risk}</Text>
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

/** One open protocol — the gates, the audit trail and the override-reason
 *  field, unchanged; they simply live inside the Tissue card now. */
function Protocol({ p, C, t, mutate }: { p: RtpProtocol; C: Palette; t: (k: string) => string; mutate: (id: string, body: object) => void }) {
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [reason, setReason] = useState("");
  const ev = evaluateRtp({ stage: p.stage, completed: p.completed });
  const cleared = p.stage === "cleared";
  const accent = cleared ? C.lime : C.blue;

  const doOverride = () => {
    if (!reason.trim()) return;
    mutate(p.id, { action: "override", reason });
    setOverrideOpen(false);
    setReason("");
  };

  return (
    <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, padding: 16 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontFamily: F.black, fontSize: fs.bodyLg, color: C.chalk, textTransform: "capitalize" }}>{p.tissue}</Text>
        <View style={{ backgroundColor: `${accent}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 3 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, accent) }}>{STAGE_LABEL[p.stage]}</Text>
        </View>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: C.ink, marginVertical: 10, overflow: "hidden" }}>
        <View style={{ width: `${Math.round(ev.progress * 100)}%`, height: "100%", backgroundColor: accent }} />
      </View>
      {!cleared && (
        <>
          {ev.gates.map((g) => (
            <Pressable key={g.key} onPress={() => mutate(p.id, { action: "toggleGate", gate: g.key })} accessibilityRole="checkbox" accessibilityState={{ checked: g.done }} style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 5 }}>
              {g.done
                ? <AuroraIcon name="check-circle" size={18} color={C.lime} />
                : <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: C.ash }} />}
              <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: g.done ? txt(C, C.lime) : C.ash }}>{g.label}</Text>
            </Pressable>
          ))}
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.sm, marginTop: 10 }}>
            <Pressable onPress={() => mutate(p.id, { action: "advance" })} disabled={!ev.canAdvance} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 8, opacity: ev.canAdvance ? 1 : 0.4 }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.onAccent }}>{t("w.rtp.advance")}</Text>
              <ArrowGlyph size={13} color={C.onAccent} />
              {ev.nextStage ? <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.onAccent }}>{STAGE_LABEL[ev.nextStage]}</Text> : null}
            </Pressable>
            {!ev.canAdvance && (
              <>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.amber) }}>{ev.blockedBy.length} {t("w.rtp.gatesLeft")}</Text>
                <Pressable onPress={() => setOverrideOpen((v) => !v)} accessibilityRole="button" style={{ borderWidth: 1, borderColor: C.red, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 8 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: txt(C, C.red) }}>{t("w.rtp.override")}</Text>
                </Pressable>
              </>
            )}
          </View>
          {overrideOpen && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: 10 }}>
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder={t("w.rtp.reason")}
                placeholderTextColor={C.ash}
                accessibilityLabel={t("w.rtp.reason")}
                style={{ flex: 1, fontFamily: F.mono, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 12, paddingVertical: 8 }}
              />
              <Pressable onPress={doOverride} accessibilityRole="button" style={{ backgroundColor: C.red, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 8 }}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.onAccent }}>{t("w.rtp.force")}</Text>
              </Pressable>
            </View>
          )}
        </>
      )}
      {p.audit && p.audit.length > 0 && (
        <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.9, color: C.ash }}>{t("w.rtp.audit")}</Text>
          {p.audit.slice(-5).reverse().map((a, i) => (
            <Text key={i} style={{ fontFamily: F.mono, fontSize: fs.micro, color: a.action === "override" ? txt(C, C.red) : C.ash, marginTop: 4 }}>
              {new Date(a.ts).toLocaleDateString()} – {a.by} ({a.role.toLowerCase()}) – {auditText(a)}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

function auditText(a: RtpAuditEntry): string {
  switch (a.action) {
    case "attest": return `attested "${a.gate}"`;
    case "retract": return `retracted "${a.gate}"`;
    case "advance": return `advanced ${a.from} → ${a.to}`;
    case "override": return `OVERRODE ${a.from} → ${a.to}: ${a.reason}`;
    case "abandon": return "abandoned protocol";
    default: return a.action;
  }
}

function Watch({ C, label, value, color }: { C: Palette; label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.ink2, paddingVertical: 10, paddingHorizontal: 8, alignItems: "center" }}>
      <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.body, fontWeight: "700", color: color ?? C.chalk }}>{value}</Text>
      <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.9, color: C.ash, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

const head = (C: Palette) => ({ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase" as const, letterSpacing: 0.9, color: C.ash });
const num = (C: Palette, flagged: boolean) => ({ fontFamily: F.mono, fontSize: fs.micro, textAlign: "right" as const, color: flagged ? txt(C, C.red) : C.ash });
