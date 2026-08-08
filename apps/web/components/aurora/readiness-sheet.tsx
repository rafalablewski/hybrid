"use client";

import { useEffect, useRef } from "react";
import {
  fs, READINESS_LIMIT_KEY, READINESS_FACE, READ_GATE_KEY,
  type ReadinessReadExplain, type ReadingInput, type ReadingStep,
} from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import ReadinessFace from "./readiness-face";
import Sheet from "./sheet";

const C = (v: string) => `var(--color-${v})`;

/**
 * THE READINESS EXPLAINER (web) — the door under the reading in Recover.
 *
 * The Recover cluster's card leads with one word at display weight, and that
 * word governs the day: it scales the load on the next session, it decides
 * whether a second read is wanted, and it is one half of the pair that measures
 * this athlete's own clearance rate. Behind it sat a single grey sentence that
 * an ⓘ toggled in and out — while every figure on the Performance tab already
 * opened onto its inputs, its arithmetic and its caveat. Recover now gets the
 * SAME treatment, from the same idiom: `readinessReadExplain` (@hybrid/core)
 * places the read and reads the prescription's own load factor, and this
 * component only lays out what it returns.
 *
 * Mirrors mobile's readiness-sheet.tsx block for block, and freshness-sheet.tsx
 * in shape: figure → what it is → what it's read against → what it moves →
 * what it doesn't say.
 */

/** How a figure prints, per the row's own unit — the clients own the glyphs,
 *  core owns the meaning. The "h" is the card's own suffix (`+5h after
 *  training`), unlocalised on both clients; the minus is a REAL minus (U+2212)
 *  rather than the hyphen a template literal would leave beside a figure. */
const printValue = (v: number, unit: ReadingInput["unit"]): string => {
  if (unit === "hours") return `+${v}h`;
  if (unit === "percent") return `${v}%`;
  if (unit === "factor") return `×${v}`;
  if (unit === "signed") return v < 0 ? `−${Math.abs(v)}` : `+${v}`;
  return String(v);
};

export default function ReadinessSheet({ explain, stamp, onClose }: {
  /** The reading being explained, or null when the sheet is closed. */
  explain: ReadinessReadExplain | null;
  /** The card's own stamp for this read (clock + lag) — formatted where the
   *  locale's clock already lives, rather than a second time in here. */
  stamp?: string | null;
  onClose: () => void;
}) {
  const { t } = useLang();
  // Hold the last explanation through the EXIT animation, exactly as the
  // freshness sheet does: reading `explain` directly empties the panel the
  // instant it starts sliding down.
  const held = useRef<ReadinessReadExplain | null>(explain);
  useEffect(() => { if (explain) held.current = explain; }, [explain]);
  const e = explain ?? held.current;
  const accent = e ? `var(--${READINESS_FACE[e.feeling].accent}-text)` : C("chalk");
  const gateNote = e?.gate && !e.gate.open ? READ_GATE_KEY[e.gate.reason] : null;

  return (
    <Sheet open={!!explain} onClose={onClose} title={t("w.home.today.readWhy")} sub={t("w.home.read.sub")} maxWidth={560}>
      {e && (
        <div style={{ display: "grid", gap: 22, fontFamily: "var(--font-display)", color: C("chalk") }}>
          {/* THE READING — the same word the card prints, in the same face and
              the same accent, with the clock it was given on. */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <ReadinessFace feeling={e.feeling} size={40} />
            <div style={{ minWidth: 140, flex: 1 }}>
              <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 30, lineHeight: 1.1, letterSpacing: "-.03em", color: accent }}>
                {t(`w.recovery.readiness.${e.feeling}`)}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginTop: 4 }}>
                {stamp ?? t(`w.recovery.readiness.${e.feeling}Sub`)}
              </div>
            </div>
          </div>

          <Block head={t("w.home.read.whatHead")}>
            <P>{t("w.home.read.what")}</P>
            {/* Which of the day's answers this one is. A read that has been
                superseded is not wrong — it is what makes the later one
                measurable — and saying so is the whole reason none is ever
                overwritten. */}
            <P dim>{t(e.reads === 0 ? "w.home.read.noReads" : e.decisive ? "w.home.read.decisive" : "w.home.read.notDecisive")}</P>
            {e.confounded && <P dim>{t("w.home.read.confounded")}</P>}
          </Block>

          {/* WHAT IT IS READ AGAINST — the clock, and what the residual model
              makes of it. This is the block the old single grey line stood in
              for: the note is still here, as the sentence it always was, but
              now beside the figures it was asserting. */}
          <Block head={t("w.home.read.inputsHead")} meta={t("w.home.read.inputsMeta")}>
            <div style={{ display: "grid", gap: 9 }}>
              {e.rows.map((r, i) => <Row key={i} row={r} t={t} />)}
            </div>
            {e.noteKey && <P style={{ marginTop: 12 }}>{t(e.noteKey)}</P>}
            <P dim>
              {t("w.home.read.residualNote")
                .replace("{tau}", String(e.consts.tauH))
                .replace("{immediate}", String(e.consts.immediateH))}
            </P>
            <P dim>{t("w.home.read.weightNote").replace("{n}", String(e.consts.recallFromH))}</P>
          </Block>

          {/* WHAT IT MOVES — the ledger, ending on the very percentage the
              prescription applies. Same shape as the freshness arithmetic. */}
          <Block head={t("w.home.read.movesHead")}>
            <P>{t(e.loadPct === 100 && e.setAdj === 0 ? "w.home.read.movesNeutral" : "w.home.read.moves")}</P>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "8px 12px", alignItems: "center", fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 4 }}>
              {e.steps.map((s, i) => <Step key={i} step={s} t={t} />)}
            </div>
          </Block>

          {/* THE PAIR — the one thing two answers can measure that one cannot.
              Rendered only when the day's reads actually support a verdict. */}
          {e.clearance && e.clearanceKey && (
            <Block head={t("w.home.read.pairHead")}>
              <P>{t("w.home.read.pair").replace("{n}", String(Math.round(e.clearance.gapH)))}</P>
              <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 15, letterSpacing: "-.01em", color: C("chalk") }}>
                {t(e.clearanceKey)}
              </div>
            </Block>
          )}

          <Block head={t("w.home.read.nextHead")}>
            <P>
              {t("w.home.read.next")
                .replace("{gap}", String(e.consts.gapH))
                .replace("{lock}", String(e.consts.lockH))
                .replace("{max}", String(e.consts.maxReads))}
            </P>
            {/* Why the faces are held right now, when they are — the same
                sentence the card shows under them, so the two can't disagree. */}
            {gateNote && <P dim>{t(gateNote)}</P>}
          </Block>

          <Block head={t("w.home.read.limitHead")}>
            <P>{t(READINESS_LIMIT_KEY[e.feeling])}</P>
          </Block>
        </div>
      )}
    </Sheet>
  );
}

/* ---------- small primitives ---------- */
/** One section: the SectionHead idiom — display-face title left, mono meta on
 *  the RIGHT of the same row, and never a marker before it (house rule). */
function Block({ head, meta, children }: { head: string; meta?: string; children: React.ReactNode }) {
  return (
    <section>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 9 }}>
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 15, letterSpacing: "-.01em", color: C("chalk") }}>{head}</span>
        {meta && <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>{meta}</span>}
      </div>
      {children}
    </section>
  );
}

function P({ children, dim, style }: { children: React.ReactNode; dim?: boolean; style?: React.CSSProperties }) {
  return <p style={{ margin: "0 0 8px", fontSize: dim ? fs.caption : fs.body, lineHeight: 1.6, color: C("ash"), ...style }}>{children}</p>;
}

/** One measured input: its name, and its figure or its worded value. */
function Row({ row, t }: { row: ReadingInput; t: (k: string) => string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
      <span style={{ fontSize: fs.caption, color: row.top ? C("chalk") : C("ash"), fontWeight: row.top ? 600 : 400 }}>{t(row.key)}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: row.top ? C("chalk") : C("ash") }}>
        {row.value != null ? printValue(row.value, row.unit) : row.valueKey ? t(row.valueKey) : ""}
      </span>
    </div>
  );
}

/** One line of the arithmetic. The result line takes the rule and the weight. */
function Step({ step, t }: { step: ReadingStep; t: (k: string) => string }) {
  return (
    <>
      {step.total && <span style={{ gridColumn: "1 / -1", height: 1, background: C("line") }} />}
      <span style={{ color: step.total ? C("chalk") : C("ash"), fontWeight: step.total ? 700 : 400 }}>{t(step.key)}</span>
      <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: step.total ? C("chalk") : C("ash"), fontWeight: step.total ? 700 : 400 }}>
        {printValue(step.value, step.unit)}
      </span>
    </>
  );
}
