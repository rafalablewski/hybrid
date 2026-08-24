import { useEffect, useRef, type ReactNode } from "react";
import { View, Text } from "react-native";
import {
  loadExplain, loadVerdict, LOAD_METRICS, LOAD_METRIC_LABEL_KEY,
  type LoadState, type LoadExplain, type LoadInput, type LoadMetric,
  type LoadStep, type LoadBandStop,

  ALPHA,} from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, roleColor } from "../../lib/theme";
import { F, FIXED_FONT_SCALE, MAX_FONT_SCALE, fs, leading, trackFigure, tracking, ty} from "../../lib/ui";
import { withAlpha, RADIUS } from "./kit";
import Sheet from "./sheet";

type Palette = ReturnType<typeof useTheme>["palette"];
type T = (k: string) => string;

/**
 * THE WHOLE-BODY LOAD SHEET (mobile) — TWO DOORS, one panel.
 *
 * `focus === null` — the ⓘ on the block was tapped, so the subject is the whole
 * reading and the sheet is organised around THE CLAIM:
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
 * `focus === a metric` — a RECEIPT was tapped, so the subject is that figure
 * and nothing else. The reader asked a narrower question and gets a narrower
 * answer: the figure, what it is, its scale, its own inputs, its arithmetic,
 * its caveat. Sending them into the full reading would make them scroll past
 * three figures they did not ask about, which is the failure mode the combined
 * sheet was built to avoid — not a licence to answer only in aggregate.
 *
 * Both modes share every primitive below, so a band ladder or a ledger cannot
 * come out differently depending on which door you used.
 *
 * Everything is READ off `loadExplain` / `loadVerdict` (@hybrid/core), which
 * narrate the very `LoadState` the card was drawn from — never a second
 * computation.
 */
export default function LoadSheet({ load, focus, onClose }: {
  /** The state to explain, or null when the sheet is closed. */
  load: LoadState | null;
  /** One figure, or null for the whole reading. */
  focus?: LoadMetric | null;
  onClose: () => void;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  // Hold the last state AND the door it was opened by through the EXIT
  // animation. Reading the props directly empties the panel on the first frame
  // of the slide-down — and holding the state without the focus is worse than
  // not holding at all: the sheet would flip from one figure to all four on its
  // way out. Same device as the freshness sheet's, with the pair kept together.
  const held = useRef<{ s: LoadState; focus: LoadMetric | null } | null>(null);
  useEffect(() => { if (load) held.current = { s: load, focus: focus ?? null }; }, [load, focus]);
  const shown = load ? { s: load, focus: focus ?? null } : held.current;
  const s = shown?.s ?? null;
  const only = shown?.focus ?? null;

  const verdict = s ? loadVerdict(s) : null;
  const explains = s ? LOAD_METRICS.map((m) => loadExplain(m, s)) : [];
  const byMetric = Object.fromEntries(explains.map((e) => [e.metric, e])) as Record<string, LoadExplain>;
  // The two readings the sentence is made of. The week's seven days are drawn
  // once below, so the ACWR block shows its four WEEKS and monotony shows none
  // of its own — it reads the same seven days.
  const acwr = byMetric.acwr;
  const monotony = byMetric.monotony;

  const focused = only ? byMetric[only] : null;

  return (
    <Sheet
      visible={!!load}
      onClose={onClose}
      // The title names what you opened: the metric when you tapped its figure,
      // the block when you tapped the ⓘ.
      title={focused ? t(focused.titleKey) : t("w.injury.load.sheetTitle")}
      sub={t("w.injury.load.sub")}
    >
      {focused ? (
        <Only C={C} t={t} explain={focused} />
      ) : s && acwr && monotony ? (
        <View style={{ gap: 24 }}>
          {/* THE SENTENCE — what the block said, said again here. In chalk, at
              the card's own headline weight: a coloured paragraph would
              out-shout the figures it is supposed to be introducing. */}
          {verdict && (
            <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, letterSpacing: tracking(fs.subtitle), lineHeight: leading(16), color: C.chalk }}>
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

/**
 * ONE FIGURE, ON ITS OWN — what a tapped receipt opens.
 *
 * The five-part shape freshness-explain established: the figure with its unit
 * spelled out, what it is, the scale with your rung marked, the inputs it was
 * built from, the arithmetic ending on the figure at the top, and what it
 * refuses to claim. The two unbanded figures simply render no scale block —
 * strain sits on no published ladder, and drawing one would be this sheet
 * making a claim the engine never made.
 *
 * Its inputs are its OWN: the four weeks for a ratio, the seven days for a
 * weekly total. The combined sheet draws the week once because everything in
 * it shares those seven numbers; here there is only one figure, so its inputs
 * belong beside it.
 */
function Only({ C, t, explain }: { C: Palette; t: T; explain: LoadExplain }) {
  return (
    <View style={{ gap: 24 }}>
      {/* THE FIGURE, with the unit said out loud — "4 554" alone invites a
          comparison with somebody else's 4 554, and there is none to make. */}
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 12 }}>
        {/* `fs.stat`, not a raw 44 — the rung exists for exactly this, the one
            big figure at the head of an explainer sheet. freshness-sheet's
            twin still carries a grandfathered 44 and is 2dp shy; aligning it
            is its own change, not this one's to make. */}
        <Text style={{ fontFamily: F.takeover, fontSize: fs.stat, lineHeight: leading(fs.stat, "flush"), letterSpacing: trackFigure(fs.stat), color: paintOf(C, explain) }}>{explain.value}</Text>
        <Text style={{ flex: 1, fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t(explain.unitKey)}</Text>
      </View>

      <Block C={C} head={t("w.injury.load.whatHead")}>
        <Text style={{ fontFamily: F.reg, fontSize: fs.body, lineHeight: leading(fs.body), color: C.ash }}>{t(explain.whatKey)}</Text>
      </Block>

      {explain.bands.length > 0 && (
        <Block C={C} head={t("w.injury.load.bandsHead")}>
          <View style={{ gap: 7 }}>
            {explain.bands.map((b, i) => <Band key={i} C={C} band={b} label={t(b.key)} />)}
          </View>
        </Block>
      )}

      <Block C={C} head={t(explain.inputsHeadKey)} meta={t("w.injury.load.colLoad")}>
        <View style={{ gap: 9 }}>
          {explain.inputs.map((r, i) => (
            <Row key={i} C={C} row={r} label={r.arg === null ? t(r.key) : t(r.key).replace("{n}", String(r.arg))} />
          ))}
        </View>
      </Block>

      <Block C={C} head={t("w.injury.load.howHead")}>
        <Text style={{ fontFamily: F.reg, fontSize: fs.body, lineHeight: leading(fs.body), color: C.ash, marginBottom: 12 }}>{t(explain.howKey)}</Text>
        <View style={{ gap: 7 }}>
          {explain.steps.map((s, i) => <Step key={i} C={C} step={s} t={t} />)}
        </View>
        <Text style={{ fontFamily: F.reg, fontSize: fs.caption, lineHeight: leading(fs.caption), color: C.ash, marginTop: 12 }}>{t("w.injury.load.rounding")}</Text>
      </Block>

      <Block C={C} head={t("w.injury.load.limitHead")}>
        <Text style={{ fontFamily: F.reg, fontSize: fs.body, lineHeight: leading(fs.body), color: C.ash }}>{t(explain.limitKey)}</Text>
      </Block>
    </View>
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
        <Text style={{ flex: 1, fontFamily: F.black, fontSize: fs.bodyLg, color: C.chalk }}>{head}</Text>
        {meta ? <Text style={ty(C, "kicker")}>{meta}</Text> : null}
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
        <Text style={{ fontFamily: F.monoBold, fontSize: fs.headline, color: paint }}>{explain.value}</Text>
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
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={ty(C, "kicker")}>
          {t(LOAD_METRIC_LABEL_KEY[explain.metric])}
        </Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ flex: 1, fontFamily: F.monoBold, fontSize: fs.caption, color: paintOf(C, explain) }}>{explain.value}</Text>
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
