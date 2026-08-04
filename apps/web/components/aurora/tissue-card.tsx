"use client";

import { useState } from "react";
import {
  fs, tissueAxis, injuryHeadlineKey, computeLoad, computeInjuryRisk,
  ROLE_COLOR, riskRole, RISK_DRIVER_LABEL_KEY, RISK_DRIVER_EXPLAIN_KEY, INJURY_AREA_KEY,
  type AcwrBand, type RiskBand, type RiskDriverKind, type TissueRow,
  type MuscleGroup, type TissueRisk,
} from "@hybrid/core";
import { roleText } from "@/lib/ui";
import { useLang } from "@/lib/i18n";
import { useRtpProtocols, InjurySheet, RiskBody } from "./protocol";

/** The protocol's full span, so the status line can say "day 9 of 21" without
 *  the card needing the whole ladder. Matches engines/rtp.ts. */
const RTP_TOTAL_DAYS = 21;
/** Which day of the protocol today is — 1-based, from the injury date the
 *  athlete gave when they opened it. */
function protocolDay(p: { injuryDate?: string | null; startedAt?: string | null }): number | null {
  const iso = p.injuryDate ?? p.startedAt;
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(1, Math.floor((Date.now() - t) / 86_400_000) + 1);
}

/**
 * TISSUE — one card for injury risk AND return-to-play.
 *
 * They were two sibling cards saying the same thing twice: a risk summary that
 * showed no tissue, and an always-open seven-chip form for an event that
 * happens twice a year. This is one card whose SHAPE is the signal.
 *
 *   calm     — title, one sentence, the axis, a quiet footer rail.
 *   open     — the same seven tissues as rows on the SAME axis, each carrying
 *              its own risk, calibrated probability and ACWR.
 *   flagged  — those rows open themselves, and the whole-body watch tiles and
 *              driver guidance come with them.
 *   injured  — an open protocol takes over the card's body; risk stays beneath.
 *
 * The one graphic is `tissueAxis` (@hybrid/core), so this card and its mobile
 * twin plot every tick and bar at identical positions. Kept on the face in
 * every state: per-tissue risk, P. injury and ACWR, plus the model version.
 */
const C = (v: string) => `var(--color-${v})`;
const riskVar = (b: RiskBand | string) => ROLE_COLOR[riskRole(b)];
const acwrVar = (b: AcwrBand): string =>
  b === "sweet-spot" ? "lime" : b === "caution" ? "amber" : b === "danger" ? "red" : b === "detraining" ? "blue" : "ash";

/** Zone tints for the axis — the band's own colour, weighted so the low end
 *  recedes and the high end reads as a wall. */
const ZONE_ALPHA: Record<RiskBand, number> = { low: 40, moderate: 55, elevated: 52, high: 90 };

/* ---------- the body ----------
   The card used to draw its own mannequin out of nine rounded rectangles, on
   web only, while the app already owned a real schematic body. It now shares
   ONE figure with the injury picker (aurora/protocol.tsx, geometry in
   @hybrid/core injury-body.ts) — so the body you read your risk on is the body
   you point at when something goes wrong, on both clients. */

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
   *  and the protocol stay one object. */
  onOpenToday?: () => void;
  /** Whether there is any logged training to read. With none, the card states
   *  NO risk — an axis of zeroes would say "you're clear to train", which is
   *  a claim about data we don't have — but it still offers the way in to a
   *  protocol, since an athlete can be hurt before they've logged anything. */
  hasData: boolean;
}) {
  const { t } = useLang();
  const axis = tissueAxis(risk);
  const byTissue = Object.fromEntries(risk.tissues.map((ti) => [ti.tissue, ti])) as Record<string, TissueRisk>;
  const { active, create, mutate } = useRtpProtocols();
  // The rows are a DISCLOSURE only while everything is calm. The moment a
  // tissue is flagged they open themselves — a worklist you have to go
  // looking for is not a worklist.
  const [rowsOpen, setRowsOpen] = useState(false);
  // The calibration disclosure — closed by default, because it qualifies the
  // figures rather than announcing itself.
  const [howOpen, setHowOpen] = useState(false);
  // The area the athlete pointed at on the card's own body, if that is how
  // they got to the sheet — the flag and the protocol are one object.
  const [picking, setPicking] = useState<MuscleGroup | null | false>(false);
  const alert = hasData && axis.flaggedCount > 0;
  const showRows = hasData && (rowsOpen || alert);

  // The distinct drivers across flagged tissues, heaviest first — explained in
  // plain language under the rows.
  const driverKinds = ((): RiskDriverKind[] => {
    const weight = new Map<RiskDriverKind, number>();
    for (const ti of risk.flagged) for (const d of ti.drivers) weight.set(d.kind, (weight.get(d.kind) ?? 0) + d.contribution);
    return [...weight.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  })();

  return (
    <div style={{
      background: C("ink2"), borderRadius: 28, boxShadow: "var(--shadow-card)", padding: 20,
      border: alert ? `1px solid color-mix(in srgb, ${C("red")} 45%, ${C("line")})` : `1px solid ${C("line")}`,
      backgroundImage: alert ? `linear-gradient(180deg, color-mix(in srgb, ${C("red")} 7%, transparent), transparent)` : undefined,
    }}>
      {/* HEAD — the subject, and how many tissues are on the worklist. The
          score itself is not asserted here; the axis places it. */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: "4px 12px" }}>
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18, letterSpacing: "-.01em", color: alert ? "var(--red-text)" : C("chalk") }}>
          {t("w.injury.tissue")}
        </span>
        {hasData && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: alert ? "var(--red-text)" : C("ash") }}>
            {axis.flaggedCount}/{axis.total} {t("w.injury.flaggedMeta")}
          </span>
        )}
      </div>

      {/* One sentence, in the display face — the only question an athlete has.
          With no logged training there is no answer to give, so the card says
          what it is waiting for instead of claiming an all-clear. */}
      {hasData ? (
        <>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 16, letterSpacing: "-.02em", lineHeight: 1.3, marginTop: 8, color: C("chalk") }}>
            {t(injuryHeadlineKey(axis))}
          </div>
          <Axis axis={axis} t={t} />
        </>
      ) : (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), lineHeight: 1.6, marginTop: 8 }}>{t("w.home.cockpit.watchBuilding")}</div>
      )}

      {showRows && (
        <>
          <Rows rows={axis.rows} t={t} />
          {/* WHY THE DASH — a tissue with no chronic baseline reads "—". The
              engine decides who sees this, so the clients can't disagree. */}
          {risk.awaitingBaseline.length > 0 && (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 12, border: `1px solid ${C("line")}`, background: `color-mix(in srgb, ${C("ash")} 8%, transparent)` }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash"), marginBottom: 4 }}>{t("w.injury.acwrPending")}</div>
              <div style={{ fontSize: fs.caption, lineHeight: 1.6, color: C("chalk") }}>{t("w.injury.acwrPendingBody")}</div>
            </div>
          )}

          {/* WHOLE-BODY — labelled as such, because the ratio in the rows above
              is each tissue's own and these are a different measurement. */}
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash"), margin: "16px 0 8px" }}>{t("w.injury.wholeBody")}</div>
          {load.enoughHistory ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 1, background: C("line"), border: `1px solid ${C("line")}`, borderRadius: 12, overflow: "hidden" }}>
                <Watch label={t("w.home.cockpit.acwr")} value={load.acwr.toFixed(2)} color={C(acwrVar(load.band))} />
                <Watch label={t("w.home.cockpit.srpe")} value={load.acute.toLocaleString()} />
                <Watch label={t("w.home.cockpit.monotony")} value={load.monotony.toFixed(1)} />
                <Watch label={t("w.home.cockpit.strain")} value={load.strain.toLocaleString()} />
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), lineHeight: 1.5, marginTop: 8 }}>{t("w.injury.acwrNote")}</div>
            </>
          ) : (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), lineHeight: 1.6 }}>{t("w.home.cockpit.watchBuilding")}</div>
          )}

          {/* THE BODY — the same tissues again, anatomically. */}
          <div style={{ marginTop: 18 }}>
            <RiskBody byTissue={byTissue} onPick={(g) => setPicking(g)} />
          </div>

          {/* WHAT'S RAISING THIS — plain language for every driver at play. */}
          {driverKinds.length > 0 && (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              {driverKinds.map((k) => (
                <div key={k}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".12em", color: roleText(riskRole(risk.band)), marginBottom: 3 }}>{t(RISK_DRIVER_LABEL_KEY[k])}</div>
                  <div style={{ fontSize: fs.caption, lineHeight: 1.6, color: C("chalk") }}>{t(RISK_DRIVER_EXPLAIN_KEY[k])}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* AN OPEN PROTOCOL IS A STATUS LINE HERE, AND A DOOR.
          The protocol itself — the ladder, the gates, the audit trail — renders
          on Today, in the Recover cluster. It used to live inside this card,
          which meant the one surface an injured athlete needs every morning
          could only be reached by opening an analytics tab and scrolling. The
          risk that prompted it and the protocol that answers it stay one object
          because this row points straight at it. */}
      {active.length > 0 && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C("line")}` }}>
          {active.map((p) => {
            const day = protocolDay(p);
            return (
              <button
                key={p.id}
                type="button"
                className="pressable"
                onClick={onOpenToday}
                disabled={!onOpenToday}
                style={{ display: "flex", alignItems: "baseline", gap: 12, width: "100%", padding: 0, border: 0, background: "none", cursor: onOpenToday ? "pointer" : "default", color: C("chalk"), textAlign: "left" }}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--red-text)" }}>{t("w.injury.protocolRunning")}</span>
                <span style={{ marginLeft: "auto", fontWeight: 700, fontSize: fs.caption }}>
                  {t(INJURY_AREA_KEY[p.tissue as MuscleGroup])}
                  {day != null ? ` – ${t("w.injury.protocolDay").replace("{n}", String(day)).replace("{total}", String(RTP_TOTAL_DAYS))}` : ""}
                  {onOpenToday ? " →" : ""}
                </span>
              </button>
            );
          })}
          <div style={{ fontSize: fs.caption, lineHeight: 1.6, color: C("ash"), marginTop: 4 }}>{t("w.injury.protocolWhere")}</div>
        </div>
      )}

      {/* THE QUESTION gets its own surface. It used to unfold inside the card,
          pushing everything under it down — a form appearing mid-page for the
          most consequential thing an athlete files here. */}
      <InjurySheet
        open={picking !== false}
        initial={picking || null}
        onClose={() => setPicking(false)}
        onOpen={(tissue, injuryDate) => create(tissue, injuryDate)}
      />

      {/* FOOTER RAIL — both ways in, at the same weight. Opening a protocol is
          not a "go" action, so it never takes the chartreuse fill. */}
      <div style={{ marginTop: 16, borderTop: `1px solid ${C("line")}`, paddingTop: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          {/* Hidden, not disabled, while a flag holds the rows open — a
              control that cannot do anything should not be drawn. */}
          {hasData && !alert ? (
            <button type="button" className="pressable" onClick={() => setRowsOpen((v) => !v)} aria-expanded={showRows} style={{ ...railBtn, color: C("ash") }}>
              {showRows ? t("w.injury.hideTissues") : t("w.injury.allTissues")}
              <span aria-hidden style={{ fontSize: 8, marginLeft: 5 }}>{showRows ? "▲" : "▼"}</span>
            </button>
          ) : <span />}
          <button type="button" className="pressable" onClick={() => setPicking(null)} style={{ ...railBtn, color: alert ? "var(--red-text)" : C("ash") }}>
            {alert ? t("w.injury.openProtocol") : t("w.injury.logInjury")}
          </button>
        </div>
        {/* THE CALIBRATION, BEHIND A DISCLOSURE. It used to print on the card
            face, where it read as team-facing metadata nobody outside the
            building can act on — and lent the numbers an air of precision they
            do not have. It now answers the question an athlete is already
            asking when they open it. */}
        {hasData && (
          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              className="pressable"
              aria-expanded={howOpen}
              onClick={() => setHowOpen((v) => !v)}
              style={{ ...railBtn, color: C("ash"), marginLeft: "auto", display: "flex" }}
            >
              {t("w.injury.howCalculated")}
              <span aria-hidden style={{ fontSize: 8, marginLeft: 5 }}>{howOpen ? "▲" : "▼"}</span>
            </button>
            {howOpen && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), lineHeight: 1.6, marginTop: 7 }}>
                {t("w.analyze.perf.model")} {axis.modelVersion}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** THE AXIS — band zones, the flag line, and one tick per tissue. The heaviest
 *  tick is the overall score, because the engine defines it as the highest
 *  tissue: the same number, drawn once. */
function Axis({ axis, t }: { axis: ReturnType<typeof tissueAxis>; t: (k: string) => string }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ position: "relative", height: 9 }}>
        <div style={{ position: "absolute", inset: 0, display: "flex", borderRadius: 5, overflow: "hidden" }}>
          {axis.zones.map((z) => (
            <span key={z.band} style={{ width: `${z.widthPct}%`, background: `color-mix(in srgb, ${C(riskVar(z.band))} ${ZONE_ALPHA[z.band]}%, transparent)` }} />
          ))}
        </div>
        <span aria-hidden style={{ position: "absolute", left: `${axis.flagLeftPct}%`, top: -8, bottom: -8, width: 1, background: `repeating-linear-gradient(${C("ash")} 0 3px, transparent 3px 6px)` }} />
        {axis.rows.map((r) => (
          <span
            key={r.tissue}
            title={`${t(INJURY_AREA_KEY[r.tissue])}: ${r.risk}/100`}
            style={{
              position: "absolute",
              left: `calc(${r.leftPct}% - ${r.top ? 1.5 : 1}px)`,
              top: r.top ? -6 : -3,
              width: r.top ? 3 : 2,
              height: r.top ? 21 : 15,
              borderRadius: 2,
              background: r.top ? C(riskVar(r.band)) : `color-mix(in srgb, ${C("chalk")} 46%, transparent)`,
              boxShadow: r.top ? `0 0 0 2px ${C("ink2")}` : undefined,
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
        {["0", `30 ${t("w.injury.axisMod")}`, `50 ${t("w.injury.axisFlag")}`, `70 ${t("w.injury.axisHigh")}`, "100"].map((label) => (
          <span key={label} style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash") }}>{label}</span>
        ))}
      </div>
    </div>
  );
}

/** THE AXIS, EXPLODED — the same tissues as rows on the same scale, so the
 *  flag line runs straight down the block and you read who crosses it without
 *  comparing a number. Replaces a 5-column table that scrolled sideways. */
function Rows({ rows, t }: { rows: TissueRow[]; t: (k: string) => string }) {
  const cols = "minmax(58px, 1fr) minmax(0, 2.2fr) 26px 44px 38px";
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: cols, gap: 8, alignItems: "center", paddingBottom: 7, borderBottom: `1px solid ${C("line")}` }}>
        {[t("w.analyze.perf.colTissue"), "", t("w.analyze.perf.colRisk"), t("w.analyze.perf.colProb"), t("w.analyze.perf.colAcwr")].map((h, i) => (
          <span key={i} style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".1em", color: C("ash"), textAlign: i >= 2 ? "right" : "left" }}>{h}</span>
        ))}
      </div>
      {rows.map((r) => (
        <div key={r.tissue} style={{ display: "grid", gridTemplateColumns: cols, gap: 8, alignItems: "center", padding: "8px 0", borderBottom: `1px solid color-mix(in srgb, ${C("line")} 60%, transparent)` }}>
          <span style={{ fontSize: fs.caption, fontWeight: r.flagged ? 800 : 400, color: C("chalk"), overflow: "hidden", textOverflow: "ellipsis" }}>{t(INJURY_AREA_KEY[r.tissue])}</span>
          {/* the row's own bar, on the axis scale, carrying the same flag line */}
          <span style={{ position: "relative", height: 5, borderRadius: 3, background: `color-mix(in srgb, ${C("ash")} 16%, transparent)` }}>
            <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${r.leftPct}%`, borderRadius: 3, background: r.risk > 0 ? C(riskVar(r.band)) : "transparent" }} />
            <span aria-hidden style={{ position: "absolute", left: "50%", top: -6, bottom: -6, width: 1, background: `repeating-linear-gradient(${C("ash")} 0 2px, transparent 2px 5px)` }} />
          </span>
          <b style={{ ...num, fontWeight: 700, color: r.flagged ? "var(--red-text)" : C("chalk") }}>{r.risk}</b>
          <span style={{ ...num, color: r.flagged ? "var(--red-text)" : C("ash") }}>{r.probPct.toFixed(1)}%</span>
          <span style={{ ...num, color: r.flagged ? "var(--red-text)" : C("ash") }}>{r.acwr == null ? "—" : r.acwr.toFixed(2)}</span>
          {/* the driver prints only where it means something, so it stops
              being a column of dashes */}
          {r.flagged && r.driver && (
            <span style={{ gridColumn: "2 / -1", fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), paddingTop: 3 }}>{t(RISK_DRIVER_LABEL_KEY[r.driver])}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function Watch({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: C("ink2"), padding: "10px 8px", textAlign: "center" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, fontWeight: 700, color: color ?? C("chalk") }}>{value}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".1em", color: C("ash"), marginTop: 2 }}>{label}</div>
    </div>
  );
}

const num: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: fs.micro, fontVariantNumeric: "tabular-nums", textAlign: "right" };
const railBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", background: "none", border: "none", padding: 0, cursor: "pointer",
  fontFamily: "var(--font-mono)", fontSize: fs.micro, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".08em",
};
