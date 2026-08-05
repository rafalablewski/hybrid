import { useEffect, useRef, type ReactNode } from "react";
import { View, Text } from "react-native";
import {
  FRESHNESS_COPY, FATIGUE_NORM_FLOOR,
  type FreshnessExplain, type FreshnessRow, type FreshnessStep,
} from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, roleColor } from "../../lib/theme";
import { leading, fs, F, serifIf } from "../../lib/ui";
import { withAlpha } from "./kit";
import Sheet from "./sheet";

type Palette = ReturnType<typeof useTheme>["palette"];
type Scheme = ReturnType<typeof useTheme>["scheme"];

/**
 * THE FRESHNESS EXPLAINER (mobile) — the door under "Strength fresh" and
 * "Endurance fresh". Mirrors apps/web/components/aurora/freshness-sheet.tsx
 * block for block.
 *
 * Those two columns printed a bare numeral under a mono label and offered
 * nothing behind it: no derivation, no inputs, no statement of what the figure
 * refuses to claim. Everything here is READ, never derived — `freshnessExplain`
 * (@hybrid/core) calls the same engine the card calls, and this component only
 * lays out what it returns.
 */

/** A row's bar, painted from the ROW's own role — never re-derived here. */
const rowPaint = (C: Palette, r: FreshnessRow) => {
  const paint = txt(C, roleColor(C, r.role));
  return r.dim ? withAlpha(paint, 0.34) : paint;
};

export default function FreshnessSheet({ explain, onClose }: {
  /** The pillar being explained, or null when the sheet is closed. */
  explain: FreshnessExplain | null;
  onClose: () => void;
}) {
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
  // Hold the last explanation through the EXIT animation. Reading `explain`
  // directly would empty the panel the instant it starts sliding down, so the
  // athlete watches a blank sheet leave — the same reason Sheet itself keeps
  // its node mounted past `visible`.
  const held = useRef<FreshnessExplain | null>(explain);
  useEffect(() => { if (explain) held.current = explain; }, [explain]);
  const e = explain ?? held.current;
  const copy = e ? FRESHNESS_COPY[e.pillar] : null;

  return (
    <Sheet visible={!!explain} onClose={onClose} title={copy ? t(copy.title) : ""} sub={t("w.home.fresh.sub")}>
      {e && copy ? (
        <View style={{ gap: 22 }}>
          {/* THE FIGURE — the same value the column prints, banded by the same
              rule as the headline above it, and the one sentence that says what
              it does to that headline. */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
            <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: 44, letterSpacing: -1, color: txt(C, roleColor(C, e.role)) }}>{e.score}</Text>
            <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.caption, color: C.ash, lineHeight: leading(fs.caption) }}>
              {t("w.home.fresh.rollup").replace("{n}", String(e.weightPct))}
            </Text>
          </View>

          <Block C={C} scheme={scheme} head={t("w.home.fresh.whatHead")}>
            <P C={C}>{t(copy.what)}</P>
          </Block>

          {/* THE INPUTS — their own numbers. When there is nothing to itemise,
              the sheet says WHY the figure reads 100 rather than listing seven
              zeros and letting the reader mistake an absence for an all-clear. */}
          <Block
            C={C}
            scheme={scheme}
            head={t(copy.inputs)}
            meta={e.pillar === "strength" ? t("w.home.fresh.colFatigue") : t("w.home.fresh.colLoad")}
          >
            {e.empty || e.noInput ? (
              <P C={C}>{t(e.empty ? "w.home.fresh.baseline" : copy.noInput)}</P>
            ) : (
              <View style={{ gap: 9 }}>
                {e.rows.map((r, i) => (
                  <Row key={i} C={C} row={r} label={r.muscle ? t(`w.home.today.muscle.${r.muscle}`) : t(r.key ?? "")} />
                ))}
              </View>
            )}
          </Block>

          <Block C={C} scheme={scheme} head={t("w.home.fresh.howHead")}>
            <P C={C}>{t(copy.how)}</P>
            <P C={C} dim>{t("w.home.fresh.decay").replace("{n}", String(e.halfLifeDays))}</P>
            <P C={C} dim>
              {e.pillar === "strength"
                ? t("w.home.fresh.normFloor").replace("{n}", String(FATIGUE_NORM_FLOOR))
                : t("w.home.fresh.loadNote")}
            </P>
          </Block>

          {/* THE LEDGER — the same shape the readiness drawer uses, ending on
              the very figure at the top of this sheet. */}
          <Block C={C} scheme={scheme} head={t("w.home.fresh.ledgerHead")}>
            <View style={{ gap: 8 }}>
              {e.steps.map((s, i) => <Step key={i} C={C} step={s} t={t} />)}
            </View>
          </Block>

          <Block C={C} scheme={scheme} head={t("w.home.fresh.limitHead")}>
            <P C={C}>{t(copy.limit)}</P>
          </Block>
        </View>
      ) : null}
    </Sheet>
  );
}

/* ---------- small primitives ---------- */
/** One section: the SectionHead idiom — display-face title left, mono meta on
 *  the RIGHT of the same row, and never a marker before it (house rule). */
function Block({ C, scheme, head, meta, children }: {
  C: Palette; scheme: Scheme; head: string; meta?: string; children: ReactNode;
}) {
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 9 }}>
        <Text style={{ flex: 1, fontFamily: serifIf(scheme, F.black), fontSize: 15, color: C.chalk }}>{head}</Text>
        {meta ? <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.9, color: C.ash }}>{meta}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function P({ C, children, dim }: { C: Palette; children: ReactNode; dim?: boolean }) {
  const size = dim ? fs.caption : fs.body;
  return <Text style={{ fontFamily: F.reg, fontSize: size, color: C.ash, lineHeight: leading(size), marginBottom: 8 }}>{children}</Text>;
}

/** One input: its name, the share it carries as a bar, and its figure. */
function Row({ C, row, label }: { C: Palette; row: FreshnessRow; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Text numberOfLines={1} style={{ flex: 1, fontFamily: row.top ? F.semi : F.reg, fontSize: fs.caption, color: row.top ? C.chalk : C.ash }}>{label}</Text>
      <View style={{ width: 84, height: 6, borderRadius: 3, backgroundColor: C.ink, overflow: "hidden" }}>
        <View style={{ width: `${row.sharePct}%`, height: "100%", backgroundColor: rowPaint(C, row) }} />
      </View>
      <Text style={{ width: 34, textAlign: "right", fontFamily: F.mono, fontSize: fs.caption, color: row.top ? C.chalk : C.ash }}>{row.value}</Text>
    </View>
  );
}

/** One line of the arithmetic. The result line takes the rule and the weight. */
function Step({ C, step, t }: { C: Palette; step: FreshnessStep; t: (k: string) => string }) {
  const label = step.arg === null ? t(step.key) : t(step.key).replace("{n}", String(step.arg));
  const color = step.total ? C.chalk : C.ash;
  const weight = step.total ? ("700" as const) : ("400" as const);
  return (
    <>
      {step.total ? <View style={{ height: 1, backgroundColor: C.line }} /> : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Text style={{ flex: 1, fontFamily: F.mono, fontSize: fs.caption, fontWeight: weight, color }}>{label}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, fontWeight: weight, color }}>{step.value}</Text>
      </View>
    </>
  );
}
