"use client";

import { useEffect, useRef } from "react";
import { fs, FRESHNESS_COPY, FATIGUE_NORM_FLOOR, type FreshnessExplain, type FreshnessRow, type FreshnessStep } from "@hybrid/core";
import { roleText, tint } from "@/lib/ui";
import { useLang } from "@/lib/i18n";
import Sheet from "./sheet";

const C = (v: string) => `var(--color-${v})`;

/**
 * THE FRESHNESS EXPLAINER (web) — the door under "Strength fresh" and
 * "Endurance fresh".
 *
 * Those two columns printed a bare numeral under a mono label and offered
 * nothing behind it: no derivation, no inputs, no statement of what the figure
 * refuses to claim. A number an athlete cannot audit is a number they stop
 * trusting the first day it says something inconvenient — the same argument
 * that turned the readiness block from prose into a ledger.
 *
 * Everything here is READ, never derived: `freshnessExplain` (@hybrid/core)
 * calls the same engine the card calls, and this component only lays out what
 * it returns — the figure, the measured inputs with the role each is painted
 * from, the arithmetic ending on that same figure, and the caveat. Mirrors
 * mobile's freshness-sheet.tsx block for block.
 */

/** A row's bar, painted from the ROW's own role — never re-derived here. */
const rowPaint = (r: FreshnessRow) => (r.dim ? tint(roleText(r.role), 34) : roleText(r.role));

export default function FreshnessSheet({ explain, onClose }: {
  /** The pillar being explained, or null when the sheet is closed. */
  explain: FreshnessExplain | null;
  onClose: () => void;
}) {
  const { t } = useLang();
  // Hold the last explanation through the EXIT animation. Reading `explain`
  // directly would empty the panel the instant it starts sliding down, so the
  // athlete watches a blank sheet leave — the same reason Sheet itself keeps
  // its node mounted past `open`.
  const held = useRef<FreshnessExplain | null>(explain);
  useEffect(() => { if (explain) held.current = explain; }, [explain]);
  const e = explain ?? held.current;
  const copy = e ? FRESHNESS_COPY[e.pillar] : null;

  return (
    <Sheet open={!!explain} onClose={onClose} title={copy ? t(copy.title) : ""} sub={t("w.home.fresh.sub")} maxWidth={560}>
      {e && copy && (
        <div style={{ display: "grid", gap: 22, fontFamily: "var(--font-display)", color: C("chalk") }}>
          {/* THE FIGURE — the same value the column prints, banded by the same
              rule as the headline above it, and the one sentence that says what
              it does to that headline. */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 46, lineHeight: 1, letterSpacing: "-.03em", color: roleText(e.role) }}>{e.score}</span>
            <p style={{ flex: 1, minWidth: 180, margin: 0, fontSize: fs.caption, lineHeight: 1.6, color: C("ash") }}>
              {t("w.home.fresh.rollup").replace("{n}", String(e.weightPct))}
            </p>
          </div>

          <Block head={t("w.home.fresh.whatHead")}>
            <P>{t(copy.what)}</P>
          </Block>

          {/* THE INPUTS — their own numbers. When there is nothing to itemise,
              the sheet says WHY the figure reads 100 rather than listing seven
              zeros and letting the reader mistake an absence for an all-clear. */}
          <Block head={t(copy.inputs)} meta={e.pillar === "strength" ? t("w.home.fresh.colFatigue") : t("w.home.fresh.colLoad")}>
            {e.empty || e.noInput ? (
              <P>{t(e.empty ? "w.home.fresh.baseline" : copy.noInput)}</P>
            ) : (
              <div style={{ display: "grid", gap: 9 }}>
                {e.rows.map((r, i) => (
                  <Row key={i} row={r} label={r.muscle ? t(`w.home.today.muscle.${r.muscle}`) : t(r.key ?? "")} />
                ))}
              </div>
            )}
          </Block>

          <Block head={t("w.home.fresh.howHead")}>
            <P>{t(copy.how)}</P>
            <P dim>{t("w.home.fresh.decay").replace("{n}", String(e.halfLifeDays))}</P>
            <P dim>
              {e.pillar === "strength"
                ? t("w.home.fresh.normFloor").replace("{n}", String(FATIGUE_NORM_FLOOR))
                : t("w.home.fresh.loadNote")}
            </P>
          </Block>

          {/* THE LEDGER — the same shape the readiness drawer uses, ending on
              the very figure at the top of this sheet. */}
          <Block head={t("w.home.fresh.ledgerHead")}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "8px 12px", alignItems: "center", fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>
              {e.steps.map((s, i) => <Step key={i} step={s} t={t} />)}
            </div>
          </Block>

          <Block head={t("w.home.fresh.limitHead")}>
            <P>{t(copy.limit)}</P>
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

function P({ children, dim }: { children: React.ReactNode; dim?: boolean }) {
  return <p style={{ margin: "0 0 8px", fontSize: dim ? fs.caption : fs.body, lineHeight: 1.6, color: C("ash") }}>{children}</p>;
}

/** One input: its name, the share it carries as a bar, and its figure. */
function Row({ row, label }: { row: FreshnessRow; label: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 84px 34px", gap: 10, alignItems: "center" }}>
      <span style={{ fontSize: fs.caption, color: row.top ? C("chalk") : C("ash"), fontWeight: row.top ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ height: 6, borderRadius: 3, background: C("ink"), overflow: "hidden" }} aria-hidden>
        <span style={{ display: "block", width: `${row.sharePct}%`, height: "100%", background: rowPaint(row) }} />
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, textAlign: "right", fontVariantNumeric: "tabular-nums", color: row.top ? C("chalk") : C("ash") }}>{row.value}</span>
    </div>
  );
}

/** One line of the arithmetic. The result line takes the rule and the weight. */
function Step({ step, t }: { step: FreshnessStep; t: (k: string) => string }) {
  const label = step.arg === null ? t(step.key) : t(step.key).replace("{n}", String(step.arg));
  return (
    <>
      {step.total && <span style={{ gridColumn: "1 / -1", height: 1, background: C("line") }} />}
      <span style={{ color: step.total ? C("chalk") : C("ash"), fontWeight: step.total ? 700 : 400 }}>{label}</span>
      <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: step.total ? C("chalk") : C("ash"), fontWeight: step.total ? 700 : 400 }}>{step.value}</span>
    </>
  );
}
