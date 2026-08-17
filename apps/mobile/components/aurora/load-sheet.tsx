import { useEffect, useRef, type ReactNode } from "react";
import { View, Text } from "react-native";
import {
  loadExplain, loadVerdict, LOAD_METRICS, LOAD_METRIC_LABEL_KEY,
  type LoadState, type LoadExplain, type LoadInput, type LoadStep, type LoadBandStop,

  ALPHA,} from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, roleColor } from "../../lib/theme";
import { leading, tracking, fs, F, FIXED_FONT_SCALE } from "../../lib/ui";
import { withAlpha, RADIUS } from "./kit";
import Sheet from "./sheet";

type Palette = ReturnType<typeof useTheme>["palette"];
type T = (k: string) => string;

/**
 * THE WHOLE-BODY LOAD SHEET (mobile) — the ONE door under the block.
 *
 * It opened four ways in the previous cut, one per figure, each onto the same
 * five-part explainer. That was four doors to four versions of one subject, and
 * the seven daily loads — the shared input behind every one of the four figures
 * — were itemised four separate times.
 *
 * So this sheet is organised around THE CLAIM, not around the implementation:
 *
 *   THE SENTENCE   — the verdict the block leads with, repeated at the top so
 *                    the sheet answers the thing you tapped.
 *   READ FROM      — the TWO readings that composed it (how much, what shape),
 *                    each with its scale and your rung marked. These two ARE
 *                    the sentence; the other two figures carry no independent
 *                    claim (strain is literally load × monotony).
 *   THE WEEK       — the seven daily loads, once, because everything below is
 *                    a function of them.
 *   THE FIGURES    — all four in full: what each is, its ledger, its caveat.
 *
 * Everything is READ off `loadExplain` / `loadVerdict` (@hybrid/core), which
 * narrate the very `LoadState` the card was drawn from — never a second
 * computation.
 */
export default function LoadSheet({ load, onClose }: {
  /** The state to explain, or null when the sheet is closed. */
  load: LoadState | null;
  onClose: () => void;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  // Hold the last state through the EXIT animation — reading `load` directly
  // empties the panel on the first frame of the slide-down, so the athlete
  // watches a blank sheet leave. Same device as the freshness sheet's.
  const held = useRef<LoadState | null>(load);
  useEffect(() => { if (load) held.current = load; }, [load]);
  const s = load ?? held.current;

  const verdict = s ? loadVerdict(s) : null;
  const explains = s ? LOAD_METRICS.map((m) => loadExplain(m, s)) : [];
  const byMetric = Object.fromEntries(explains.map((e) => [e.metric, e])) as Record<string, LoadExplain>;
  // The two readings the sentence is made of. The week's seven days are drawn
  // once below, so the ACWR block shows its four WEEKS and monotony shows none
  // of its own — it reads the same seven days.
  const acwr = byMetric.acwr;
  const monotony = byMetric.monotony;

  return (
    <Sheet visible={!!load} onClose={onClose} title={t("w.injury.load.sheetTitle")} sub={t("w.injury.load.sub")}>
      {s && acwr && monotony ? (
        <View style={{ gap: 24 }}>
          {/* THE SENTENCE — what the block said, said again here. In chalk, at
              the card's own headline weight: a coloured paragraph would
              out-shout the figures it is supposed to be introducing. */}
          {verdict && (
            <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, letterSpacing: tracking.display, lineHeight: leading(16), color: C.chalk }}>
              {t(verdict.key)}
            </Text>
          )}

          {/* THE TWO READINGS BEHIND IT. */}
          <Block C={C} head={t("w.injury.load.readFrom")}>
            <Reading C={C} t={t} explain={acwr} />
            <View style={{ height: 18 }} />
            <Reading C={C} t={t} explain={monotony} />
          </Block>

          {/* THE WEEK — once. Every figure in this sheet is a function of these
              seven numbers, so itemising them per metric printed the same seven
              rows four times. */}
          <Block C={C} head={t("w.injury.load.theWeek")} meta={t("w.injury.load.colLoad")}>
            <View style={{ gap: 9 }}>
              {byMetric.acute!.inputs.map((r, i) => (
                <Row key={i} C={C} row={r} label={r.arg === null ? t(r.key) : t(r.key).replace("{n}", String(r.arg))} />
              ))}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10, paddingTop: 9, borderTopWidth: 1, borderTopColor: C.line }}>
              <Text style={{ flex: 1, fontFamily: F.monoBold, fontSize: fs.caption, color: C.chalk }}>{t("w.injury.load.dayTotal")}</Text>
              <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.monoBold, fontSize: fs.caption, color: C.chalk }}>{byMetric.acute!.value}</Text>
            </View>
          </Block>

          {/* ALL FOUR, IN FULL — what each is, how it lands, what it refuses. */}
          <Block C={C} head={t("w.injury.load.allFigures")}>
            <View style={{ gap: 20 }}>
              {explains.map((e) => <Figure key={e.metric} C={C} t={t} explain={e} />)}
            </View>
            <Text style={{ fontFamily: F.reg, fontSize: fs.caption, lineHeight: leading(fs.caption), color: C.ash, marginTop: 16 }}>
              {t("w.injury.load.rounding")}
            </Text>
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
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 11 }}>
        <Text style={{ flex: 1, fontFamily: F.black, fontSize: fs.note, color: C.chalk }}>{head}</Text>
        {meta ? <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: tracking.label, color: C.ash }}>{meta}</Text> : null}
      </View>
      {children}
    </View>
  );
}

/** A figure that carries no verdict is drawn in CHALK, not in the neutral
 *  accent: `neutral` resolves to ash, which reads as disabled rather than as
 *  unbanded. Only a banded figure spends a hue. */
const paintOf = (C: Palette, e: LoadExplain) =>
  e.role === "neutral" ? C.chalk : txt(C, roleColor(C, e.role));

/** ONE OF THE TWO READINGS the sentence is made of: its value, its name, the
 *  band it landed in, and the ladder that band sits on. */
function Reading({ C, t, explain }: { C: Palette; t: T; explain: LoadExplain }) {
  const paint = paintOf(C, explain);
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10 }}>
        <Text style={{ fontFamily: F.monoBold, fontSize: fs.heading, color: paint }}>{explain.value}</Text>
        <Text style={{ flex: 1, fontFamily: F.semi, fontSize: fs.caption, color: C.chalk }}>{t(explain.titleKey)}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: paint }}>{t(explain.readKey)}</Text>
      </View>
      <View style={{ marginTop: 10, gap: 7 }}>
        {explain.bands.map((b, i) => <Band key={i} C={C} band={b} label={t(b.key)} />)}
      </View>
    </View>
  );
}

/** One stop on a scale: its name, its range, and the ONE that is live. The live
 *  stop takes the colour and the weight; the rest stay in ash, so the block
 *  reads as a ladder with your rung marked rather than as N verdicts. */
function Band({ C, band, label }: { C: Palette; band: LoadBandStop; label: string }) {
  const paint = txt(C, roleColor(C, band.role));
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View style={{ width: 3, height: 14, borderRadius: RADIUS.mark, backgroundColor: band.active ? paint : withAlpha(C.ash, ALPHA.solid) }} />
      <Text style={{ flex: 1, fontFamily: band.active ? F.semi : F.reg, fontSize: fs.caption, color: band.active ? C.chalk : C.ash }}>{label}</Text>
      <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: band.active ? F.monoBold : F.mono, fontSize: fs.caption, color: band.active ? paint : C.ash }}>{band.range}</Text>
    </View>
  );
}

/** One day of the week: its name, its share of the heaviest day as a bar, and
 *  its figure. */
function Row({ C, row, label }: { C: Palette; row: LoadInput; label: string }) {
  const paint = txt(C, C.chalk);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Text numberOfLines={1} style={{ flex: 1, fontFamily: row.top ? F.semi : F.reg, fontSize: fs.caption, color: row.top ? C.chalk : C.ash }}>{label}</Text>
      <View style={{ width: 84, height: 6, borderRadius: RADIUS.mark, backgroundColor: C.ink, overflow: "hidden" }}>
        <View style={{ width: `${row.sharePct}%`, height: "100%", backgroundColor: row.dim ? withAlpha(paint, ALPHA.line) : paint }} />
      </View>
      {/* `row.text`, never `row.value.toLocaleString()` — the totals around it
          are grouped by core, and a device-locale row would print the same
          number in a different format two lines away. */}
      <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ width: 48, textAlign: "right", fontFamily: F.mono, fontSize: fs.caption, color: row.top ? C.chalk : C.ash }}>{row.text}</Text>
    </View>
  );
}

/** ONE OF THE FOUR, in full: name and value, what it is, the arithmetic, and
 *  the caveat. No scale here — the two that have one showed it above, beside
 *  the clause it drives. */
function Figure({ C, t, explain }: { C: Palette; t: T; explain: LoadExplain }) {
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
        <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: tracking.label, color: C.ash }}>
          {t(LOAD_METRIC_LABEL_KEY[explain.metric])}
        </Text>
        <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ flex: 1, fontFamily: F.monoBold, fontSize: fs.caption, color: paintOf(C, explain) }}>{explain.value}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{t(explain.unitKey)}</Text>
      </View>
      <Text style={{ fontFamily: F.reg, fontSize: fs.caption, lineHeight: leading(fs.caption), color: C.ash }}>{t(explain.whatKey)}</Text>
      <View style={{ gap: 7, marginTop: 10 }}>
        {explain.steps.map((s, i) => <Step key={i} C={C} step={s} t={t} />)}
      </View>
      <Text style={{ fontFamily: F.reg, fontSize: fs.caption, lineHeight: leading(fs.caption), color: C.ash, marginTop: 10 }}>{t(explain.limitKey)}</Text>
    </View>
  );
}

/** One line of the arithmetic. The result line takes the rule and the weight. */
function Step({ C, step, t }: { C: Palette; step: LoadStep; t: T }) {
  const color = step.total ? C.chalk : C.ash;
  // The FACE carries the weight, not `fontWeight`: only two mono faces are
  // loaded (400 and 700), each under its own family name, so a weight asked for
  // on top of a face the family cannot serve is synthesized — or dropped for
  // the system font. See lib/ui.tsx `F`.
  const face = step.total ? F.monoBold : F.mono;
  return (
    <>
      {step.total ? <View style={{ height: 1, backgroundColor: C.line }} /> : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Text style={{ flex: 1, fontFamily: face, fontSize: fs.caption, color }}>{t(step.key)}</Text>
        {step.value ? (
          <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: face, fontSize: fs.caption, color }}>{step.value}</Text>
        ) : null}
      </View>
    </>
  );
}
