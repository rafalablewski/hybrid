"use client";

import { useEffect, useRef } from "react";
import { fs, type WearableExplain, type WearableRow } from "@hybrid/core";
import { roleText } from "@/lib/ui";
import { useLang } from "@/lib/i18n";
import Sheet from "./sheet";

const C = (v: string) => `var(--color-${v})`;

/**
 * THE RECOVERY-SIGNALS SHEET (web) — the door under the ±15 line.
 *
 * That line said "Includes −3 from your wearable" and could not be opened. It
 * named a wearable whatever the source actually was, and asserted the present
 * tense over a reading of any age. This shows the three readings, each against
 * the athlete's own baseline, with where it came from, how old it is, and the
 * signed points it contributed — then the arithmetic, including the rounding
 * and the ±15 bound. Mirrors mobile's wearable-sheet.tsx block for block.
 */

/** A signed figure with a REAL minus, and a decimal only when it has one. */
const signed = (n: number) => {
  const r = Math.round(n * 10) / 10;
  const abs = Math.abs(r);
  const s = Number.isInteger(abs) ? String(abs) : abs.toFixed(1);
  return `${r < 0 ? "−" : "+"}${s}`;
};
/** A reading, trimmed — a baseline of 44.333333 helps nobody. */
const fig = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export default function WearableSheet({ explain, onClose }: {
  /** The explanation, or null when the sheet is closed. */
  explain: WearableExplain | null;
  onClose: () => void;
}) {
  const { t } = useLang();
  // Hold the last explanation through the exit animation, so the panel slides
  // down with its content rather than emptying first.
  const held = useRef<WearableExplain | null>(explain);
  useEffect(() => { if (explain) held.current = explain; }, [explain]);
  const e = explain ?? held.current;

  const age = (d: number | null) =>
    d === null ? "" : d <= 0 ? t("w.home.wearable.today") : t("w.home.wearable.daysAgo").replace("{n}", String(d));

  return (
    <Sheet open={!!explain} onClose={onClose} title={t("w.home.wearable.title")} sub={t("w.home.wearable.sub")} maxWidth={560}>
      {e && (
        <div style={{ display: "grid", gap: 22, fontFamily: "var(--font-display)", color: C("chalk") }}>
          {/* THE FIGURE — the same signed number the card prints. */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 46, lineHeight: 1, letterSpacing: "-.03em", color: roleText(e.total === 0 ? "neutral" : e.total > 0 ? "go" : "caution") }}>
              {signed(e.total)}
            </span>
            <p style={{ flex: 1, minWidth: 180, margin: 0, fontSize: fs.caption, lineHeight: 1.6, color: C("ash") }}>
              {t("w.home.wearable.what")}
            </p>
          </div>

          {/* THE READINGS — value against the athlete's own baseline, with the
              source and the age, which is the whole point of this sheet. */}
          <section>
            <Head title={t("w.home.wearable.rowsHead")} />
            <div style={{ display: "grid", gap: 12 }}>
              {e.rows.map((r) => <Row key={r.metric} row={r} t={t} age={age} />)}
            </div>
          </section>

          {/* THE LEDGER — sum, rounding, and the bound when it bites. There is
              always at least one measured row to sum: neither builder returns a
              Biometrics unless a metric had a usable, recent reading. */}
          <section>
            <Head title={t("w.home.wearable.ledgerHead")} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "8px 12px", alignItems: "center", fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>
              <span>{t("w.home.wearable.stepSum")}</span>
              <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{signed(e.raw)}</span>
              {e.clamped && (
                <>
                  <span>{t("w.home.wearable.stepClamp").replace("{n}", "15")}</span>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{signed(e.total)}</span>
                </>
              )}
              <span style={{ gridColumn: "1 / -1", height: 1, background: C("line") }} />
              <span style={{ color: C("chalk"), fontWeight: 700 }}>{t("w.home.wearable.stepRound")}</span>
              <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: C("chalk"), fontWeight: 700 }}>{signed(e.total)}</span>
            </div>
          </section>

          {/* WHY IT CAN VANISH — the recency rule, stated from the constant. */}
          <section>
            <Head title={t("w.home.wearable.freshHead")} />
            <p style={{ margin: 0, fontSize: fs.body, lineHeight: 1.6, color: C("ash") }}>
              {t("w.home.wearable.fresh").replace("{n}", String(e.freshDays))}
            </p>
          </section>
        </div>
      )}
    </Sheet>
  );
}

/** SectionHead idiom — display title left, no marker in front (house rule). */
function Head({ title }: { title: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 15, letterSpacing: "-.01em", color: C("chalk") }}>{title}</span>
    </div>
  );
}

/** One recovery metric: its name, its reading vs baseline, its provenance, and
 *  the signed points it put into the score. An unmeasured metric says so
 *  instead of rendering a zero that looks like a measurement. */
function Row({ row, t, age }: {
  row: WearableRow;
  t: (k: string) => string;
  age: (d: number | null) => string;
}) {
  const provenance = row.sourceLabel
    ? t("w.home.wearable.fromSource").replace("{source}", row.sourceLabel).replace("{age}", age(row.ageDays))
    : null;
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: fs.caption, fontWeight: 600, color: row.measured ? C("chalk") : C("ash") }}>{t(row.key)}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), lineHeight: 1.6, marginTop: 3 }}>
          {row.measured
            ? t("w.home.wearable.vsBaseline")
                .replace("{today}", fig(row.today))
                .replace("{baseline}", fig(row.baseline))
                .replaceAll("{unit}", row.unit)
            : t("w.home.wearable.notMeasured")}
        </div>
        {provenance && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".09em", color: C("ash"), marginTop: 2 }}>
            {provenance}
          </div>
        )}
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: roleText(row.role) }}>
        {row.measured ? signed(row.points) : "—"}
      </span>
    </div>
  );
}
