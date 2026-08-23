import { useEffect, useRef, type ReactNode } from "react";
import { View, Text } from "react-native";
import {
  READINESS_LIMIT_KEY, READINESS_FACE, READ_GATE_KEY,
  type ReadinessReadExplain, type ReadingInput, type ReadingStep,
} from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { F, fs, leading, tracking, ty} from "../../lib/ui";
import ReadinessFace from "./readiness-face";
import Sheet from "./sheet";

type Palette = ReturnType<typeof useTheme>["palette"];

/**
 * THE READINESS EXPLAINER (mobile) — the door under the reading in Recover.
 *
 * The Recover cluster's card leads with one word at display weight, and that
 * word governs the day: it scales the load on the next session, it decides
 * whether a second read is wanted, and it is one half of the pair that measures
 * this athlete's own clearance rate. Behind it sat a single grey sentence an ⓘ
 * toggled in and out — while every figure on the Performance tab already opened
 * onto its inputs, its arithmetic and its caveat. Everything here is READ, never
 * derived: `readinessReadExplain` (@hybrid/core) places the read and reads the
 * prescription's own load factor, and this component lays out what it returns.
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
  const { palette: C } = useTheme();
  const { t } = useLang();
  // Hold the last explanation through the EXIT animation, exactly as the
  // freshness sheet does: reading `explain` directly empties the panel the
  // instant it starts sliding down.
  const held = useRef<ReadinessReadExplain | null>(explain);
  useEffect(() => { if (explain) held.current = explain; }, [explain]);
  const e = explain ?? held.current;
  const gateNote = e?.gate && !e.gate.open ? READ_GATE_KEY[e.gate.reason] : null;

  return (
    <Sheet visible={!!explain} onClose={onClose} title={t("w.home.today.readWhy")} sub={t("w.home.read.sub")}>
      {e ? (
        <View style={{ gap: 22 }}>
          {/* THE READING — the same word the card prints, in the same face and
              the same accent, with the clock it was given on. */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <ReadinessFace feeling={e.feeling} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.takeover, fontSize: 28, letterSpacing: tracking(28), color: txt(C, C[READINESS_FACE[e.feeling].accent]) }}>
                {t(`w.recovery.readiness.${e.feeling}`)}
              </Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 4 }}>
                {stamp ?? t(`w.recovery.readiness.${e.feeling}Sub`)}
              </Text>
            </View>
          </View>

          <Block C={C} head={t("w.home.read.whatHead")}>
            <P C={C}>{t("w.home.read.what")}</P>
            {/* Which of the day's answers this one is. A read that has been
                superseded is not wrong — it is what makes the later one
                measurable — and saying so is the whole reason none is ever
                overwritten. */}
            <P C={C} dim>{t(e.reads === 0 ? "w.home.read.noReads" : e.decisive ? "w.home.read.decisive" : "w.home.read.notDecisive")}</P>
            {e.confounded ? <P C={C} dim>{t("w.home.read.confounded")}</P> : null}
          </Block>

          {/* WHAT IT IS READ AGAINST — the clock, and what the residual model
              makes of it. This is the block the old single grey line stood in
              for: the note is still here, as the sentence it always was, but
              now beside the figures it was asserting. */}
          <Block C={C} head={t("w.home.read.inputsHead")} meta={t("w.home.read.inputsMeta")}>
            <View style={{ gap: 9, marginBottom: 12 }}>
              {e.rows.map((r, i) => <Row key={i} C={C} row={r} t={t} />)}
            </View>
            {e.noteKey ? <P C={C}>{t(e.noteKey)}</P> : null}
            <P C={C} dim>
              {t("w.home.read.residualNote")
                .replace("{tau}", String(e.consts.tauH))
                .replace("{immediate}", String(e.consts.immediateH))}
            </P>
            <P C={C} dim>{t("w.home.read.weightNote").replace("{n}", String(e.consts.recallFromH))}</P>
          </Block>

          {/* WHAT IT MOVES — the ledger, ending on the very percentage the
              prescription applies. Same shape as the freshness arithmetic. */}
          <Block C={C} head={t("w.home.read.movesHead")}>
            <P C={C}>{t(e.loadPct === 100 && e.setAdj === 0 ? "w.home.read.movesNeutral" : "w.home.read.moves")}</P>
            <View style={{ gap: 8 }}>
              {e.steps.map((s, i) => <Step key={i} C={C} step={s} t={t} />)}
            </View>
          </Block>

          {/* THE PAIR — the one thing two answers can measure that one cannot.
              Rendered only when the day's reads actually support a verdict. */}
          {e.clearance && e.clearanceKey ? (
            <Block C={C} head={t("w.home.read.pairHead")}>
              <P C={C}>{t("w.home.read.pair").replace("{n}", String(Math.round(e.clearance.gapH)))}</P>
              <Text style={{ fontFamily: F.black, fontSize: fs.bodyLg, color: C.chalk }}>{t(e.clearanceKey)}</Text>
            </Block>
          ) : null}

          <Block C={C} head={t("w.home.read.nextHead")}>
            <P C={C}>
              {t("w.home.read.next")
                .replace("{gap}", String(e.consts.gapH))
                .replace("{lock}", String(e.consts.lockH))
                .replace("{max}", String(e.consts.maxReads))}
            </P>
            {/* Why the faces are held right now, when they are — the same
                sentence the card shows under them, so the two can't disagree. */}
            {gateNote ? <P C={C} dim>{t(gateNote)}</P> : null}
          </Block>

          <Block C={C} head={t("w.home.read.limitHead")}>
            <P C={C}>{t(READINESS_LIMIT_KEY[e.feeling])}</P>
          </Block>
        </View>
      ) : null}
    </Sheet>
  );
}

/* ---------- small primitives ---------- */
/** One section: the SectionHead idiom — display-face title left, mono meta on
 *  the RIGHT of the same row, and never a marker before it (house rule). */
function Block({ C, head, meta, children }: {
  C: Palette; head: string; meta?: string; children: ReactNode;
}) {
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 9 }}>
        <Text style={{ flex: 1, fontFamily: F.black, fontSize: fs.bodyLg, color: C.chalk }}>{head}</Text>
        {meta ? <Text style={ty(C, "kicker")}>{meta}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function P({ C, children, dim }: { C: Palette; children: ReactNode; dim?: boolean }) {
  const size = dim ? fs.caption : fs.body;
  return <Text style={{ fontFamily: F.reg, fontSize: size, color: C.ash, lineHeight: leading(size), marginBottom: 8 }}>{children}</Text>;
}

/** One measured input: its name, and its figure or its worded value. */
function Row({ C, row, t }: { C: Palette; row: ReadingInput; t: (k: string) => string }) {
  const color = row.top ? C.chalk : C.ash;
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 12 }}>
      <Text style={{ flex: 1, fontFamily: row.top ? F.semi : F.reg, fontSize: fs.caption, color }}>{t(row.key)}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color }}>
        {row.value != null ? printValue(row.value, row.unit) : row.valueKey ? t(row.valueKey) : ""}
      </Text>
    </View>
  );
}

/** One line of the arithmetic. The result line takes the rule and the weight. */
function Step({ C, step, t }: { C: Palette; step: ReadingStep; t: (k: string) => string }) {
  const color = step.total ? C.chalk : C.ash;
  // The FACE carries the weight — see freshness-sheet's twin of this Step, and
  // lib/ui.tsx `F`: each mono face is its own family, so a `fontWeight` on top
  // of one asks for a weight that family does not hold.
  const face = step.total ? F.monoBold : F.mono;
  return (
    <>
      {step.total ? <View style={{ height: 1, backgroundColor: C.line }} /> : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Text style={{ flex: 1, fontFamily: face, fontSize: fs.caption, color }}>{t(step.key)}</Text>
        <Text style={{ fontFamily: face, fontSize: fs.caption, color }}>{printValue(step.value, step.unit)}</Text>
      </View>
    </>
  );
}
