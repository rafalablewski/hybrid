import { useEffect, useRef, useState, type ReactNode } from "react";
import { View, Text, Animated, PanResponder } from "react-native";
import Svg, { Path, Circle, Rect } from "react-native-svg";
import { SvgXml } from "react-native-svg";
import {
  springs, springToRN,
  NUTRITION_GLYPHS, nutritionPanel, per100g, scaleFacts,
  PICKER_SOURCES, pickerSourceLabelKey,
  type GapFigure, type MicroFacts, type NutritionFacts, type NutritionGlyphName, type NutritionGap, type PickerSourceKey, type SourceMark,
  type VerifiedStamp,
} from "@hybrid/core";
import { fs, space, leading, tracking, F, PressScale as Pressable, FIXED_FONT_SCALE, MAX_FONT_SCALE, HIT_SLOP, HIT_TARGET } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { useLang } from "../../lib/i18n";
import { withAlpha } from "./field";
import { AMeter } from "./kit";
import { useReducedMotion } from "../../lib/use-reduced-motion";
import { haptic } from "../../lib/haptics";
import { RollingNumber } from "./rolling-number";
import SwipeRow from "../swipe-row";

/**
 * THE PICKER'S GRID — three numbers, and every object on the screen sits on one
 * of them. Stated here rather than at twenty call sites, because a grid that
 * lives in prose gets re-derived and a grid that lives in constants gets used.
 *
 * ── PICKER_EDGE — the OBJECT edge ──────────────────────────────────────────
 * AuroraScreen gives the screen a 12dp gutter; every object then stands 6dp
 * inside it, at 18 from the glass. The picker had four different answers: the
 * day header indented 4, the source line 2, the rows and doors 6, and the empty
 * lines and section heads 0 — four optical left edges stacked in one column,
 * which is what the eye reads as "unfinished" without being able to name it.
 *
 * The field used to be a fifth: it spanned the full 12dp column, so the one
 * boxed object on a screen of type-on-the-ground was also the only one 6dp
 * wider than everything above and below it. It is on the object edge now, which
 * puts its left and right sides on the same two verticals as the energy meter
 * directly above it.
 *
 * HAIRLINES ARE THE EXCEPTION, and deliberately: a rule spans the whole 12dp
 * column while the content it separates stands at 18. A separator inset to its
 * own content reads as a boxed group; full-bleed, it reads as a fold in the
 * page. The source line's rule and the list's row hairlines both do this, which
 * is why those two keep their own horizontal padding instead of inheriting the
 * head matter's.
 *
 * ── ROW_LEAD — the LEADING COLUMN ──────────────────────────────────────────
 * Every row on this screen — a food, an interpretation, a door — reserves the
 * same 44dp for its leading mark, so all of them put their title on ONE
 * vertical. They did not: a food row's ⊕ is a 44dp target and a door's ring is
 * 32 (the exit rule's size, and it stays), so the doors' titles sat 12dp left of
 * the rows they follow, with a visible step at the seam. The door's ring is now
 * a 32dp mark CENTRED in the 44dp column rather than a 32dp column of its own —
 * the row keeps its own height, only the column is shared. It is HIT_TARGET
 * because that is what set it: the column is as wide as the widest thing that
 * has to be tappable in it.
 *
 * ── BLOCK — the gap between two blocks of head matter ──────────────────────
 * One value, applied ONCE by the parent as a `gap`, never by the blocks as
 * outer margins. The head matter ran on three: the header's own 20dp bottom
 * pad, the source line's 16dp top margin and the confirmation line's 12 — three
 * unrelated decisions summing to a rhythm nobody chose, and each block deciding
 * how much room the NEXT one gets. Same discipline as the sheet rule: the
 * container owns the space around its children.
 */
export const PICKER_EDGE = space.xs;
export const ROW_LEAD = HIT_TARGET;
export const BLOCK = space.xl;

/** The three macros, told apart by COLOUR — the same three the hub's hero uses
 *  (teal / sand / violet). They are FILLS (a meter track), so they take the raw
 *  palette accent; `txt()` is for the same accent set as type. */
export const MACRO_FILL = { protein: "blue", carbs: "amber", fat: "violet" } as const;

/**
 * THE NUTRITION KIT (mobile) — the vocabulary every Nutrition screen draws in.
 *
 * The twin of apps/web/components/aurora/nutrition-kit.tsx; see that file for
 * why these left nutrition.tsx. In short: each is a pure presentational piece
 * with explicit props that shared a 3 381-line file only because that is where
 * it was first written, and a primitive nobody can import is a primitive that
 * gets re-drawn the next time a screen needs it.
 */

export function Glyph({ name, size = 22, color = "#fff", strokeWidth = 6 }: { name: NutritionGlyphName; size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 72 72" fill="none">
      {NUTRITION_GLYPHS[name].map((d, i) => (
        <Path key={i} d={d} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  );
}
// Meal presets read as times of day — the one place a glyph carries meaning.
export const presetGlyph = (id: string): NutritionGlyphName => id.startsWith("breakfast") ? "sunrise" : id.startsWith("lunch") ? "sun" : id.startsWith("dinner") ? "moon" : "cup";
// kcal implied by protein/carbs/fat (4·4·9) — the live readout in the builders.
export const macroKcal = (protein: string, carbs: string, fat: string) => Math.round((parseFloat(protein) || 0) * 4 + (parseFloat(carbs) || 0) * 4 + (parseFloat(fat) || 0) * 9);

// The Nutrition subpage is a HUB: a focused landing (view "home") + sub-screens
// reached from a menu, plus the redesigned add-to-meal / create-food / recipes
// flows. "add" is the meal-food picker, "create" the Create Food form, and
// recipes → recipe → cook is the read-only recipes library.
export type IconProps = { size?: number; color?: string; strokeWidth?: number; fill?: boolean };
export function SvgIcon({ size = 20, color = "#fff", strokeWidth = 2, d, fill = false }: IconProps & { d: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? color : "none"}><Path d={d} stroke={fill ? "none" : color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}
export const IClose = (p: IconProps) => <SvgIcon {...p} d="M6 6l12 12M18 6L6 18" strokeWidth={p.strokeWidth ?? 2.2} />;
export const IChevDown = (p: IconProps) => <SvgIcon {...p} d="M6 9l6 6 6-6" strokeWidth={p.strokeWidth ?? 2.4} />;
export const IChevRight = (p: IconProps) => <SvgIcon {...p} d="M9 6l6 6-6 6" strokeWidth={p.strokeWidth ?? 2.2} />;
export const IPlus = (p: IconProps) => <SvgIcon {...p} d="M12 6v12M6 12h12" strokeWidth={p.strokeWidth ?? 2.2} />;
export const IBarcode = (p: IconProps) => <SvgIcon {...p} d="M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8M21 16v2.5a2.5 2.5 0 0 1-2.5 2.5H16M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16M6.5 12h11" strokeWidth={p.strokeWidth ?? 1.9} />;
export const ITrash = (p: IconProps) => <SvgIcon {...p} d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6" strokeWidth={p.strokeWidth ?? 1.9} />;
export const IBolt = (p: IconProps) => <SvgIcon {...p} d="M13 2L4 14h7l-1 8 9-12h-7z" strokeWidth={p.strokeWidth ?? 2} />;
export function IStar({ size = 20, color = "#fff", strokeWidth = 1.8, fill = false }: IconProps) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? color : "none"}><Path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17.8 6.8 19.2l1-5.8L3.5 9.2l5.9-.9z" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}
export function IClock({ size = 20, color = "#fff", strokeWidth = 2 }: IconProps) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Circle cx="12" cy="13" r="8" stroke={color} strokeWidth={strokeWidth} /><Path d="M12 9v4l2.5 2.5M9 2h6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}
export function IPlusBox({ size = 20, color = "#fff", strokeWidth = 2 }: IconProps) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Rect x="3" y="3" width="18" height="18" rx="5" stroke={color} strokeWidth={strokeWidth} /><Path d="M12 8v8M8 12h8" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" /></Svg>;
}

// ── THE RECIPES LIBRARY — the Plans tab, on food ────────────────────────────
//
// Three levels, one object at three compressions, exactly as Plans does it:
// the library root (a soft cover + shelves of covers), a collection (its own
// cover + the recipes as cards), and the recipe itself. Web parity:
// apps/web/components/aurora/nutrition.tsx.

/** A collection's display name — the meals borrow the meal-part vocabulary the
 *  rest of nutrition uses, the cross-cut borrows the filter chip's. */
export function VerifiedMark({ C, size = 13 }: { C: ReturnType<typeof useTheme>["palette"]; size?: number }) {
  const { t } = useLang();
  return (
    <Text accessibilityLabel={t("w.recovery.nutrition.verified")} style={{ fontFamily: F.mono, fontSize: size, lineHeight: size + 2, color: txt(C, C.lime) }}>✓</Text>
  );
}

// The operator's mark, or — when we hold no artwork for them — their name set
// in OUR display face inside a hairline chip. The fallback is deliberately
// typographic: visibly ours, so it can never be taken for an approximation of
// somebody's logo. One renderer for the product page and the provenance card.
export function SourceMarkView({ C, src, height }: {
  C: ReturnType<typeof useTheme>["palette"]; src: { name: string; mark?: SourceMark }; height: number;
}) {
  if (!src.mark) {
    return (
      <Text style={{ fontFamily: F.black, fontSize: Math.round(height * 0.48), letterSpacing: tracking.label, color: C.chalk, borderWidth: 1, borderColor: C.line, borderRadius: 6, paddingVertical: 5, paddingHorizontal: 8 }}>
        {src.name}
      </Text>
    );
  }
  return <SvgXml xml={src.mark.svg} height={height} width={Math.min(168, height * src.mark.aspect)} accessibilityLabel={src.mark.alt} />;
}

/**
 * MARK PLATE — the operator's own logo on a card, given a field to sit on.
 *
 * A logo dropped straight onto the app's charcoal is at the mercy of whatever
 * the artwork assumes: MAX's wordmark is one evenodd path whose keylines are
 * true HOLES, so on ink they fill with ink and the letterforms close up. Real
 * brand sheets solve this the same way we do here — give the mark a neutral
 * plate and let it own that rectangle. The plate is a hairlined tile a touch
 * lighter than the card, deliberately NOT white: a white slab in a dark UI
 * reads as a broken image. Parity with web aurora/nutrition.tsx MarkPlate.
 */
export function MarkPlate({ C, src, height = 34, full }: {
  C: ReturnType<typeof useTheme>["palette"]; src: { name: string; mark?: SourceMark }; height?: number; full?: boolean;
}) {
  return (
    <View
      style={{
        alignSelf: full ? "stretch" : "flex-start",
        height: height + 22,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 16,
        borderRadius: 16,
        backgroundColor: withAlpha(C.chalk, 0.07),
        borderWidth: 1,
        borderColor: C.line,
        overflow: "hidden",
      }}
    >
      <SourceMarkView C={C} src={src} height={height} />
    </View>
  );
}

// The nutrition-facts panel — rendered from the SAME core function the web
// screen uses (nutritionPanel), so the two clients can never disagree about
// what a food says. A field the food never stated shows an em dash, NEVER
// "0 g": an unstated sugar content is not a sugar-free food.
export function FactsPanel({ C, facts, per100, scale = 1 }: {
  C: ReturnType<typeof useTheme>["palette"]; facts: NutritionFacts; per100?: NutritionFacts | null; scale?: number;
}) {
  const { t } = useLang();
  // Scale through CORE, never by hand: scaleFacts is the one place that knows a
  // scaled unknown stays unknown, and a second copy of that rule here would be
  // free to drift from the one the log actually writes.
  const rows = nutritionPanel(scale === 1 ? facts : scaleFacts(facts, scale));
  const p100 = per100 ? nutritionPanel(per100) : null;
  return (
    <View style={{ marginTop: 16, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingHorizontal: 16, paddingBottom: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingTop: 12, paddingBottom: 8 }}>
        <Text style={{ fontFamily: F.black, fontSize: fs.body, color: C.chalk }}>{t("w.recovery.nutrition.facts.title")}</Text>
        {p100 ? <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }}>{t("w.recovery.nutrition.facts.per100")}</Text> : null}
      </View>
      {rows.map((r, i) => (
        <View key={r.key} style={{ flexDirection: "row", alignItems: "baseline", gap: 10, paddingVertical: 8, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line }}>
          <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ flex: 1, fontFamily: r.sub ? F.reg : F.bold, fontSize: r.sub ? fs.caption : fs.body, color: r.sub ? C.ash : C.chalk, paddingLeft: r.sub ? 14 : 0 }}>{t(r.labelKey)}</Text>
          {r.note ? <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{r.note}</Text> : null}
          <Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: r.sub ? fs.caption : fs.body, color: r.value ? C.chalk : C.ash, minWidth: 64, textAlign: "right" }}>{r.value ?? "—"}</Text>
          {p100 ? <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, minWidth: 62, textAlign: "right" }}>{p100[i]!.value ?? "—"}</Text> : null}
        </View>
      ))}
      {rows.some((r) => !r.value) ? (
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, paddingTop: 8, lineHeight: leading(fs.nano) }}>{t("w.recovery.nutrition.facts.notStatedNote")}</Text>
      ) : null}
    </View>
  );
}

// THE SWIPE IS THE SHARED ONE. This row drew a trash BUTTON where the web twin
// swiped, so "swipe left to delete a saved food" was a web-only gesture in an
// app whose parity rule says otherwise — and web's own swipe was hand-rolled
// with numbers that were not the ones components/swipe-row.tsx swipes every set
// row by. Both now delegate to their client's SwipeRow, which means one set of
// physics from @hybrid/core (velocity projection, rubber-band, full-swipe).
/**
 * THE DAY GAP — what the day still owes, at the top of the picker.
 *
 * Nobody opens this screen to search; they open it because the day is short of
 * something. So the picker says what. It reads through the SAME arithmetic the
 * hub's ring does (core/nutrition-gap.ts) so the two can never disagree about
 * whether you are over, and it renders NOTHING when there is no target yet — a
 * header reading "2 000 left" against a number nobody set would be a confident
 * wrong number.
 *
 * ── IT SPEAKS THE HUB'S VOCABULARY, BECAUSE IT IS THE HUB'S NUMBER ──────────
 * This block and the hub's ring show the SAME day's figures one screen apart,
 * and they were drawn by two people who never met: the hub set its figure in
 * Archivo Black and chalk, this one in mono-bold and CHARTREUSE; the hub gave
 * each macro its own accent (teal / sand / violet), this one painted all three
 * chartreuse; the hub's over-state went red, this one's sand. Agreeing on the
 * arithmetic and disagreeing on every visual is worse than disagreeing on both,
 * because it reads as two different quantities. So:
 *
 *   - the figure takes the hub's display face on the `fs.stat` rung, in CHALK.
 *     Chartreuse is the app's one "go" colour — it is the ⊕ on every row of
 *     this very screen — and the largest thing on the page wearing the action
 *     colour while doing nothing is the loudest wrong signal here.
 *   - it ROLLS (like the hub's), because this is the one screen where the
 *     number visibly moves: log a food and the gap closes under your thumb.
 *   - OVER is SAND, never red, on both screens. `red is kept strictly for risk`
 *     (theme/palette.ts) and 100 kcal past a target is not a risk — it is the
 *     same statement FoodRow already makes in sand on the rows below.
 *   - the day's ENERGY gets a meter of its own. The old block stated "0 of 2325
 *     logged" under a hero that had just said 2325, so the one thing it never
 *     showed was the PROPORTION — which is the whole reason the hub draws a
 *     ring. Flat, this is that ring.
 *   - and that meter is the FIRST COLUMN OF THE LEDGER, not a full-width block
 *     above it. See the ledger's own note below: four figures of one day, one
 *     form, one line.
 *   - every track is the shared `AMeter` (6dp, RADIUS.mark). The hand-rolled
 *     3dp/radius-2 bar here was the sixth spelling of one object.
 *   - a macro past its own target no longer turns SAND. It said nothing on the
 *     one macro it could ever apply to visibly — carbs are drawn in sand — and
 *     the hub, which is the standard for these figures, flags over on the
 *     ENERGY alone. A full track is what "past it" looks like.
 *
 * This is the picker's own header, not the sticky HUD that was removed
 * (nutrition-hud): it sits where the decision is being made and scrolls with it.
 */
export function DayGap({ C, gap, mealLabel, mealKcal = 0 }: {
  C: ReturnType<typeof useTheme>["palette"]; gap: NutritionGap;
  /** THE MEAL BEING LOGGED INTO, and what it already holds.
   *
   *  The header answers "what does the DAY owe"; the screen's title answers
   *  "which meal am I in". Nothing answered the question actually being asked
   *  at 23:08 with Snacks open — HOW MUCH IS ALREADY IN THIS MEAL — even though
   *  the hub has shown that figure per meal all along. It rides the figure row
   *  opposite the number, in the mono meta voice, and it ROLLS: it is the one
   *  readout that moves the instant a ⊕ is tapped, so it doubles as proof the
   *  food landed in the right part of the day.
   *
   *  It renders only above zero. "Snacks 0" is not information, and a header
   *  that states an empty meal as a fact is the same confident-nothing this
   *  block refuses to draw when there is no target. */
  mealLabel?: string; mealKcal?: number;
}) {
  const { t } = useLang();
  const left = gap.kcal.left ?? 0;
  // The WORD follows the sign and the COLOUR follows the band. They are two
  // different questions: 50 past a 2 000 target is "50 over" (it is), drawn
  // calmly (it is inside the 5 % tolerance). Reading the word off the tolerance
  // flag printed "50 kcal left" at 2 050 logged.
  const isOver = left < 0;
  const tone = gap.kcal.over ? txt(C, C.amber) : C.chalk;
  const macros = gap.macros.filter((m) => m.figure.want != null);
  /**
   * THE FOUR FIGURES OF THE DAY, as one list — energy first, then the macros
   * that have a target. One list because they are drawn as one row: energy is
   * not a different KIND of thing from protein here, it is the first of four
   * answers to "how much of what I planned have I logged".
   *
   * `kcal` is the unit itself, not a translated noun: it is what every row of
   * the list below this block already says, and it is the same word in all
   * three locales. The macros keep their translated names.
   *
   * OVER is flagged on the ENERGY alone, in SAND — the hub's rule, and the one
   * a macro's own full track already states without needing a colour. Carbs are
   * DRAWN in sand, so a sand carb figure would say nothing anyway.
   */
  const ledger: { key: string; label: string; figure: GapFigure; fill: string; tone: string }[] = [
    { key: "kcal", label: "kcal", figure: gap.kcal, fill: gap.kcal.over ? C.amber : C.lime, tone },
    ...macros.map((m) => ({
      key: m.key,
      label: t(`w.recovery.nutrition.${m.key}`),
      figure: m.figure,
      fill: C[MACRO_FILL[m.key]],
      tone: C.chalk,
    })),
  ];
  return (
    <View style={{ paddingHorizontal: PICKER_EDGE }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm }}>
        <RollingNumber
          value={String(Math.abs(left))}
          style={{ fontFamily: F.black, fontSize: fs.stat, lineHeight: fs.stat, letterSpacing: tracking.display, color: tone }}
        />
        <Text
          maxFontSizeMultiplier={FIXED_FONT_SCALE}
          style={{ fontFamily: F.mono, fontSize: fs.caption, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }}
        >
          {t(isOver ? "w.recovery.nutrition.pick.kcalOver" : "w.recovery.nutrition.pick.kcalLeft")}
        </Text>
        {mealLabel && mealKcal > 0 ? (
          <View style={{ marginLeft: "auto", flexDirection: "row", alignItems: "baseline", gap: 6 }}>
            <Text
              maxFontSizeMultiplier={FIXED_FONT_SCALE}
              numberOfLines={1}
              style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }}
            >
              {mealLabel}
            </Text>
            <RollingNumber
              value={String(Math.round(mealKcal))}
              align="right"
              style={{ fontFamily: F.monoBold, fontSize: fs.nano, color: C.chalk }}
            />
          </View>
        ) : null}
      </View>
      {/* ── THE LEDGER — every logged figure in ONE line, in ONE form ────────
          `KCAL 0/2325   PROTEIN 0/150   CARBS 0/250   FAT 0/70`.

          The day's energy used to be stated in a different vocabulary from its
          own macros, one line apart: a SENTENCE ("0 of 2325 logged") over a
          full-width track, then the three macros as `0/150` three-up. Same day,
          same question — what is logged against what was planned — asked twice
          in two forms, which reads as two unrelated readouts and makes the eye
          do the conversion. Energy is simply the first column of the macro row
          now, and every figure is `have/want`.

          The head STACKS (label over figure) instead of taking AMeter's own
          label-left/value-right row. That row is right at three columns and
          impossible at four: the widest phone leaves ~75dp a column, and
          "Protein 145/150" wants ~100 — so the shared head would have
          ellipsised the label on every column carrying a three-digit target,
          and "Kohlenhydrate" on all of them in German. The TRACK below each
          figure is still the shared `AMeter`; only the readout above it is laid
          out for four-up.

          The ROW owns its top step, and it has to: the block's `space.ms` used
          to arrive from the energy AMeter's own `marginTop`, and the first
          thing under the hero figure is now a label rather than a track. Same
          number, stated where it is decided. */}
      <View style={{ flexDirection: "row", gap: space.md, marginTop: space.ms }}>
        {ledger.map((item) => (
          <View
            key={item.key}
            style={{ flex: 1 }}
            // The four columns read as four figures, not as eight labels and
            // four progress bars: each states its own sentence and the AMeter
            // inside it is collapsed into that.
            accessible
            accessibilityLabel={`${item.label} – ${t("w.recovery.nutrition.pick.ofTarget")
              .replace("{a}", String(Math.round(item.figure.have)))
              .replace("{b}", String(Math.round(item.figure.want ?? 0)))}`}
          >
            <Text
              maxFontSizeMultiplier={FIXED_FONT_SCALE}
              numberOfLines={1}
              style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }}
            >
              {item.label}
            </Text>
            <Text
              maxFontSizeMultiplier={FIXED_FONT_SCALE}
              numberOfLines={1}
              style={{ fontFamily: F.monoBold, fontSize: fs.caption, color: item.tone, marginTop: space.xxs }}
            >
              {`${Math.round(item.figure.have)}/${Math.round(item.figure.want ?? 0)}`}
            </Text>
            <AMeter pct={item.figure.pct} color={item.fill} />
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * THE SOURCE LINE — Recent / Favorites / Meals / Foods, kept, with the box gone.
 *
 * The four sources are four different questions (what did I just eat, what do I
 * always eat, what have I built, what have I saved) and all four stay. What the
 * redesign drops is the PILL BAR they were wrapped in: a bordered, filled,
 * radiused seventh container whose selected tab wore CHARTREUSE — the app's one
 * "go" colour — on a control that goes nowhere.
 *
 * Selection is carried by weight and a rule instead. No border, no radius, no
 * fill, no accent. The counts are the Explore section head's mono meta, moved
 * onto the label they describe.
 *
 * ── AND IT IS THE ONLY FORM, ON EVERY PLATFORM ─────────────────────────────
 * This was argued twice and settled once, on the device rather than in prose.
 *
 * A design pass replaced the iOS system segmented control here with this line
 * everywhere, on taste: it re-introduced a filled radiused track on a screen of
 * type-on-the-ground, it squeezed four unequal questions into equal widths, and
 * it dropped the counts the parent already computes. Asked to put the native
 * control back, the honest answer turned out to be that there is nothing to put
 * back — #423 had already DELETED it from the app for a structural reason no
 * amount of taste survives: a SwiftUI `Host` sizes its RN box from its content
 * once, at mount, and every segmented control in this app mounts before it
 * knows its content (labels arrive from `useLang`), so the control drew outside
 * its own frame. The picker was one of the surfaces it broke on.
 *
 * So this is not the consolation form, it is the one that lays out — and it
 * keeps the counts. `design-tokens.test.ts` fails on any code reference to
 * `GlassSegment`, which is the guard that makes the third attempt impossible
 * rather than merely discouraged.
 *
 * ── THE RULE TRAVELS ───────────────────────────────────────────────────────
 * Selection is the whole job of this control, and it used to CUT: the 2dp rule
 * was a per-tab border that vanished under one label and appeared under
 * another, so the one thing the control exists to say was the one thing it
 * never showed happening. It is now a single indicator that flies, on
 * `springs.lens` — the app's named SELECTION token, the same spring the Today
 * hub's pill uses — measuring each tab so the rule lands on the label's true
 * width rather than an assumed one. Reduce Motion puts it there outright, and
 * `haptic.selection` marks the commit, which is what this codebase does
 * everywhere else you move through discrete values.
 */
export function SourceLine({ C, value, counts, onChange }: {
  C: ReturnType<typeof useTheme>["palette"];
  value: PickerSourceKey;
  counts: Record<PickerSourceKey, number>;
  onChange: (key: PickerSourceKey) => void;
}) {
  const { t } = useLang();
  const reduced = useReducedMotion();
  // Measured per tab — the rule is as wide as the label it underlines, and the
  // four labels are deliberately unequal.
  const [slots, setSlots] = useState<Record<string, { x: number; w: number }>>({});
  const x = useRef(new Animated.Value(0)).current;
  const w = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);
  const slot = slots[value];
  useEffect(() => {
    if (!slot) return;
    // The FIRST placement is not a move: the rule belongs under the selected
    // tab from the first frame, and flying it in from x=0 on mount would
    // animate the screen's arrival instead of the user's choice.
    if (!placed.current || reduced) {
      placed.current = true;
      x.setValue(slot.x); w.setValue(slot.w);
      return;
    }
    const cfg = { ...springToRN(springs.lens), useNativeDriver: false };
    Animated.parallel([
      Animated.spring(x, { toValue: slot.x, ...cfg }),
      Animated.spring(w, { toValue: slot.w, ...cfg }),
    ]).start();
  }, [slot?.x, slot?.w, reduced, x, w]);

  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: "row", gap: 18, borderBottomWidth: 1, borderBottomColor: C.line, paddingHorizontal: PICKER_EDGE }}
    >
      {PICKER_SOURCES.map((key) => {
        const on = key === value;
        return (
          <Pressable
            key={key}
            onPress={() => { if (!on) haptic.selection(); onChange(key); }}
            onLayout={(e) => {
              const { x: lx, width } = e.nativeEvent.layout;
              setSlots((s) => (s[key] && s[key]!.x === lx && s[key]!.w === width ? s : { ...s, [key]: { x: lx, w: width } }));
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={{ flexDirection: "row", alignItems: "baseline", gap: 5, paddingBottom: 11 }}
          >
            <Text
              maxFontSizeMultiplier={FIXED_FONT_SCALE}
              style={{ fontFamily: on ? F.bold : F.semi, fontSize: fs.body, color: on ? C.chalk : C.ash }}
            >
              {t(pickerSourceLabelKey(key))}
            </Text>
            <Text
              maxFontSizeMultiplier={FIXED_FONT_SCALE}
              style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.nano, color: C.ash }}
            >
              {counts[key]}
            </Text>
          </Pressable>
        );
      })}
      {slot ? (
        <Animated.View
          pointerEvents="none"
          style={{ position: "absolute", bottom: -1, left: PICKER_EDGE, height: 2, backgroundColor: C.chalk, width: w, transform: [{ translateX: x }] }}
        />
      ) : null}
    </View>
  );
}

/**
 * A DOOR at the end of the picker's list — Quick Log, New food.
 *
 * Both are RARE work that used to be priced like the constant kind: two filled
 * cards taking a third of the screen's top, at the same weight as logging. They
 * belong at the end of the thing, and per the exit rule they wear a RING,
 * because both of them genuinely leave — Quick Log opens a sheet, New food opens
 * a screen. (The concept sketch drew them as bare pluses; a bare plus promises
 * something that grows in place, which neither of these does.) The row takes the
 * LIST's own hairline and chevron, since there the separator belongs to the rows
 * above it. Web twin: aurora/nutrition-kit.tsx PickerDoor.
 */
export function PickerDoor({ C, title, icon, onPress, last }: {
  C: ReturnType<typeof useTheme>["palette"]; title: string; icon: ReactNode; onPress: () => void; last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={{
        flexDirection: "row", alignItems: "center", gap: space.lg,
        paddingVertical: 14, paddingHorizontal: PICKER_EDGE,
        borderBottomWidth: last ? 0 : 1, borderBottomColor: C.line,
      }}
    >
      {/* The column is ROW_LEAD wide; the ring is 32 and stays 32 (the exit
          rule's size). Width only — the box takes the ring's height, so a door
          stays the lighter row it is meant to be. */}
      <View style={{ width: ROW_LEAD, alignItems: "center" }}>
        <View style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
          {icon}
        </View>
      </View>
      <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ flex: 1, fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{title}</Text>
      <IChevRight size={18} color={C.ash} />
    </Pressable>
  );
}

export function FoodRow({ C, name, subname, meta, over, onAdd, onOpen, chevron, starred, onStar, onDelete, verified }: {
  C: ReturnType<typeof useTheme>["palette"]; name: string; subname?: string | null; meta: string; onAdd: () => void;
  /** This food would take the day past its energy target. Said in SAND on the
   *  figure line — the sport/caution accent, never the alert red, because going
   *  over is a fact about the day and not an injury. It changes nothing about
   *  what the row does. */
  over?: boolean;
  /** tapping the row BODY, when that means something different from the ⊕ —
   *  a verified item opens its page; everything else just adds. */
  onOpen?: () => void;
  chevron?: boolean; starred?: boolean; onStar?: () => void; onDelete?: () => void; verified?: VerifiedStamp;
}) {
  const { t } = useLang();
  const body = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.lg, paddingVertical: 12, paddingHorizontal: PICKER_EDGE, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: C.ink }}>
      <Pressable onPress={onAdd} accessibilityRole="button" accessibilityLabel={`${t("w.recovery.nutrition.addToMeal")}: ${name}`} style={{ width: ROW_LEAD, height: ROW_LEAD, borderRadius: 999, borderWidth: 1.6, borderColor: C.lime, alignItems: "center", justifyContent: "center" }}><IPlus size={20} color={txt(C, C.lime)} strokeWidth={2.2} /></Pressable>
      <Pressable onPress={onOpen ?? onAdd} style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
          <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk, flexShrink: 1 }}>{name}</Text>
          {verified ? <VerifiedMark C={C} /> : null}
          {subname ? <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, flexShrink: 1 }}>{subname}</Text> : null}
        </View>
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: over ? txt(C, C.amber) : C.ash, marginTop: 3 }}>{meta}</Text>
      </Pressable>
      {onStar ? <Pressable onPress={onStar} accessibilityLabel={t("w.recovery.nutrition.tab.favorites")} hitSlop={8} style={{ padding: 4 }}><IStar size={19} color={starred ? C.gold : C.ash} fill={!!starred} /></Pressable> : null}
      {chevron ? <IChevRight size={18} color={C.ash} /> : null}
    </View>
  );
  if (!onDelete) return body;
  return <SwipeRow onDelete={onDelete} label={t("w.recovery.nutrition.remove")} background={C.ink}>{body}</SwipeRow>;
}

/** AURORA Nutrition (mobile) — the adaptive macro tracker on one restrained
 *  system, in parity with the web screen: the calorie tick-ring is the hero,
 *  macros read as hairline lines, iconography is one monoline voice, and colour
 *  appears only where it means something. Same engine + Signal logging + personal
 *  library. `compact` renders the focused Today "Add a meal" sheet. */
