import { useEffect, useRef, type ReactNode } from "react";
import { View, Text } from "react-native";
import {
  type LoadExplain, type LoadInput, type LoadStep, type LoadBandStop,

  ALPHA,} from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, roleColor } from "../../lib/theme";
import { leading, tracking, trackFigure, fs, F, FIXED_FONT_SCALE } from "../../lib/ui";
import { withAlpha, RADIUS } from "./kit";
import Sheet from "./sheet";

type Palette = ReturnType<typeof useTheme>["palette"];

/**
 * THE LOAD EXPLAINER (mobile) — the door under each of the Tissue card's four
 * whole-body figures.
 *
 * They used to be a four-up grid of bare numerals with one sentence beneath it
 * that explained only ACWR, so "1.8 MONOTONY" and "4554 STRAIN" were figures
 * the athlete had no way to read at all. Each tile on the rail now opens this,
 * and everything in it is READ off `loadExplain` (@hybrid/core), which narrates
 * the very `LoadState` the card was drawn from — never a second computation.
 *
 * Structurally the twin of freshness-sheet.tsx: same Block/P/Row/Step
 * primitives, same held-through-the-exit trick, same section vocabulary.
 */
export default function LoadSheet({ explain, onClose }: {
  /** The metric being explained, or null when the sheet is closed. */
  explain: LoadExplain | null;
  onClose: () => void;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  // Hold the last explanation through the EXIT animation — reading `explain`
  // directly empties the panel on the first frame of the slide-down, so the
  // athlete watches a blank sheet leave. Same device as the freshness sheet's.
  const held = useRef<LoadExplain | null>(explain);
  useEffect(() => { if (explain) held.current = explain; }, [explain]);
  const e = explain ?? held.current;
  // Same rule the tile follows: `neutral` resolves to ash, and a 44pt numeral
  // in ash reads as disabled rather than as unbanded. Only a banded figure
  // spends a hue.
  const paint = !e || e.role === "neutral" ? C.chalk : txt(C, roleColor(C, e.role));

  return (
    <Sheet visible={!!explain} onClose={onClose} title={e ? t(e.titleKey) : ""} sub={t("w.injury.load.sub")}>
      {e ? (
        <View style={{ gap: 22 }}>
          {/* THE FIGURE — the same value the tile prints, in the same paint,
              with its unit spelled out. The unit is the first thing the grid
              never said: "4554" alone invites a comparison with somebody
              else's 4554, and there is no such comparison to make. */}
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 12 }}>
            <Text style={{ fontFamily: F.black, fontSize: 44, letterSpacing: trackFigure(44), color: paint }}>{e.value}</Text>
            <Text style={{ flex: 1, fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t(e.unitKey)}</Text>
          </View>

          <Block C={C} head={t("w.injury.load.whatHead")}>
            <P C={C}>{t(e.whatKey)}</P>
          </Block>

          {/* THE SCALE, where the metric has one. The two that don't get no
              invented bands — a strain of 4 554 sits on no published ladder,
              and drawing one would be the sheet making a claim the engine
              never made. */}
          {e.bands.length > 0 && (
            <Block C={C} head={t("w.injury.load.bandsHead")}>
              <View style={{ gap: 7 }}>
                {e.bands.map((b, i) => <Band key={i} C={C} band={b} label={t(b.key)} />)}
              </View>
            </Block>
          )}

          {/* WHAT WENT IN — the seven days, or the four weeks. The figure's own
              items, so "why is it high?" is answerable by looking. */}
          <Block C={C} head={t(e.inputsHeadKey)} meta={t("w.injury.load.colLoad")}>
            <View style={{ gap: 9 }}>
              {e.inputs.map((r, i) => (
                <Row key={i} C={C} row={r} label={r.arg === null ? t(r.key) : t(r.key).replace("{n}", String(r.arg))} />
              ))}
            </View>
          </Block>

          {/* THE LEDGER — the readiness/freshness shape, ending on the very
              figure at the top of this sheet. */}
          <Block C={C} head={t("w.injury.load.howHead")}>
            <P C={C}>{t(e.howKey)}</P>
            <View style={{ gap: 8, marginTop: 4 }}>
              {e.steps.map((s, i) => <Step key={i} C={C} step={s} t={t} />)}
            </View>
            <P C={C} dim style={{ marginTop: 10 }}>{t("w.injury.load.rounding")}</P>
          </Block>

          <Block C={C} head={t("w.injury.load.limitHead")}>
            <P C={C}>{t(e.limitKey)}</P>
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
        <Text style={{ flex: 1, fontFamily: F.black, fontSize: fs.note, color: C.chalk }}>{head}</Text>
        {meta ? <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: tracking.label, color: C.ash }}>{meta}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function P({ C, children, dim, style }: { C: Palette; children: ReactNode; dim?: boolean; style?: object }) {
  const size = dim ? fs.caption : fs.body;
  return <Text style={[{ fontFamily: F.reg, fontSize: size, color: C.ash, lineHeight: leading(size) }, style]}>{children}</Text>;
}

/** One stop on the scale: its name, its range, and the ONE that is live. The
 *  live stop takes the colour and the weight; the rest stay in ash, so the
 *  block reads as a ladder with your rung marked rather than four verdicts. */
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

/** One input: its name, the share it carries of the block's biggest row as a
 *  bar, and its figure. */
function Row({ C, row, label }: { C: Palette; row: LoadInput; label: string }) {
  const paint = txt(C, C.chalk);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Text numberOfLines={1} style={{ flex: 1, fontFamily: row.top ? F.semi : F.reg, fontSize: fs.caption, color: row.top ? C.chalk : C.ash }}>{label}</Text>
      <View style={{ width: 84, height: 6, borderRadius: RADIUS.mark, backgroundColor: C.ink, overflow: "hidden" }}>
        <View style={{ width: `${row.sharePct}%`, height: "100%", backgroundColor: row.dim ? withAlpha(paint, ALPHA.line) : paint }} />
      </View>
      <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ width: 48, textAlign: "right", fontFamily: F.mono, fontSize: fs.caption, color: row.top ? C.chalk : C.ash }}>{row.value.toLocaleString()}</Text>
    </View>
  );
}

/** One line of the arithmetic. The result line takes the rule and the weight. */
function Step({ C, step, t }: { C: Palette; step: LoadStep; t: (k: string) => string }) {
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
