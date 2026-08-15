import { useEffect, useRef, type ReactNode } from "react";
import { View, Text } from "react-native";
import type { WearableExplain, WearableRow } from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, roleColor } from "../../lib/theme";
import { leading, tracking, fs, F } from "../../lib/ui";
import Sheet from "./sheet";

type Palette = ReturnType<typeof useTheme>["palette"];

/**
 * THE RECOVERY-SIGNALS SHEET (mobile) — the door under the ±15 line. Mirrors
 * apps/web/components/aurora/wearable-sheet.tsx block for block.
 *
 * That line said "Includes −3 from your wearable" and could not be opened. It
 * named a wearable whatever the source actually was, and asserted the present
 * tense over a reading of any age. This shows the three readings, each against
 * the athlete's own baseline, with where it came from, how old it is, and the
 * signed points it contributed — then the arithmetic, including the rounding
 * and the ±15 bound.
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
  const { palette: C } = useTheme();
  const { t } = useLang();
  // Hold the last explanation through the exit animation, so the panel slides
  // down with its content rather than emptying first.
  const held = useRef<WearableExplain | null>(explain);
  useEffect(() => { if (explain) held.current = explain; }, [explain]);
  const e = explain ?? held.current;

  const age = (d: number | null) =>
    d === null ? "" : d <= 0 ? t("w.home.wearable.today") : t("w.home.wearable.daysAgo").replace("{n}", String(d));

  const totalRole = !e ? "neutral" : e.total === 0 ? "neutral" : e.total > 0 ? "go" : "caution";

  return (
    <Sheet visible={!!explain} onClose={onClose} title={t("w.home.wearable.title")} sub={t("w.home.wearable.sub")}>
      {e ? (
        <View style={{ gap: 22 }}>
          {/* THE FIGURE — the same signed number the card prints. */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
            <Text style={{ fontFamily: F.black, fontSize: 44, letterSpacing: -1, color: txt(C, roleColor(C, totalRole)) }}>
              {signed(e.total)}
            </Text>
            <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.caption, color: C.ash, lineHeight: leading(fs.caption) }}>
              {t("w.home.wearable.what")}
            </Text>
          </View>

          {/* THE READINGS — value against the athlete's own baseline, with the
              source and the age, which is the whole point of this sheet. */}
          <Block C={C} head={t("w.home.wearable.rowsHead")}>
            <View style={{ gap: 12 }}>
              {e.rows.map((r) => <Row key={r.metric} C={C} row={r} t={t} age={age} />)}
            </View>
          </Block>

          {/* THE LEDGER — sum, rounding, and the bound when it bites. There is
              always at least one measured row to sum: neither builder returns a
              Biometrics unless a metric had a usable, recent reading. */}
          <Block C={C} head={t("w.home.wearable.ledgerHead")}>
            <View style={{ gap: 8 }}>
              <LedgerLine C={C} label={t("w.home.wearable.stepSum")} value={signed(e.raw)} />
              {e.clamped && <LedgerLine C={C} label={t("w.home.wearable.stepClamp").replace("{n}", "15")} value={signed(e.total)} />}
              <View style={{ height: 1, backgroundColor: C.line }} />
              <LedgerLine C={C} label={t("w.home.wearable.stepRound")} value={signed(e.total)} total />
            </View>
          </Block>

          {/* WHY IT CAN VANISH — the recency rule, stated from the constant. */}
          <Block C={C} head={t("w.home.wearable.freshHead")}>
            <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.ash, lineHeight: leading(fs.body) }}>
              {t("w.home.wearable.fresh").replace("{n}", String(e.freshDays))}
            </Text>
          </Block>
        </View>
      ) : null}
    </Sheet>
  );
}

/** SectionHead idiom — display title left, no marker in front (house rule). */
function Block({ C, head, children }: { C: Palette; head: string; children: ReactNode }) {
  return (
    <View>
      <Text style={{ fontFamily: F.black, fontSize: 15, color: C.chalk, marginBottom: 10 }}>{head}</Text>
      {children}
    </View>
  );
}

function LedgerLine({ C, label, value, total }: { C: Palette; label: string; value: string; total?: boolean }) {
  const color = total ? C.chalk : C.ash;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Text style={{ flex: 1, fontFamily: total ? F.monoBold : F.mono, fontSize: fs.caption, color }}>{label}</Text>
      <Text style={{ fontFamily: total ? F.monoBold : F.mono, fontSize: fs.caption, color }}>{value}</Text>
    </View>
  );
}

/** One recovery metric: its name, its reading vs baseline, its provenance, and
 *  the signed points it put into the score. An unmeasured metric says so
 *  instead of rendering a zero that looks like a measurement. */
function Row({ C, row, t, age }: {
  C: Palette;
  row: WearableRow;
  t: (k: string) => string;
  age: (d: number | null) => string;
}) {
  const provenance = row.sourceLabel
    ? t("w.home.wearable.fromSource").replace("{source}", row.sourceLabel).replace("{age}", age(row.ageDays))
    : null;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.semi, fontSize: fs.caption, color: row.measured ? C.chalk : C.ash }}>{t(row.key)}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 3, lineHeight: leading(fs.nano) }}>
          {row.measured
            ? t("w.home.wearable.vsBaseline")
                .replace("{today}", fig(row.today))
                .replace("{baseline}", fig(row.baseline))
                .split("{unit}").join(row.unit)
            : t("w.home.wearable.notMeasured")}
        </Text>
        {provenance ? (
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: tracking.label, color: C.ash, marginTop: 2 }}>
            {provenance}
          </Text>
        ) : null}
      </View>
      <Text style={{ fontFamily: F.monoBold, fontSize: fs.caption, color: txt(C, roleColor(C, row.role)) }}>
        {row.measured ? signed(row.points) : "—"}
      </Text>
    </View>
  );
}
