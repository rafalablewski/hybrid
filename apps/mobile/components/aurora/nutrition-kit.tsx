import { useEffect, useRef, type ReactNode } from "react";
import { Animated, View, Text, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Path, Circle, Rect } from "react-native-svg";
import { SvgXml } from "react-native-svg";
import {
  NUTRITION_GLYPHS, nutritionPanel, per100g, scaleFacts,
  PICKER_SOURCES, pickerSourceLabelKey, figureText,
  type GapFigure, type MicroFacts, type NutritionFacts, type NutritionGlyphName, type NutritionGap, type PickerSourceKey, type SourceMark,
  type VerifiedStamp,
  ALPHA, durations,
} from "@hybrid/core";
import { fs, space, leading, tracking, F, PressScale as Pressable, FIXED_FONT_SCALE, MAX_FONT_SCALE, HIT_SLOP, HIT_TARGET } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { useLang } from "../../lib/i18n";
import { useReducedMotion } from "../../lib/use-reduced-motion";
import { withAlpha } from "./field";
import { AMeter, ASegment, AChip , RADIUS} from "./kit";
import { RollingNumber } from "./rolling-number";
import SwipeRow from "../swipe-row";
import { HoldMenu, useHoldMenu, type HoldMenuItem } from "../hold-menu";

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
        borderRadius: RADIUS.field,
        backgroundColor: withAlpha(C.chalk, ALPHA.wash),
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
    <View style={{ marginTop: 16, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 16, paddingBottom: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingTop: 12, paddingBottom: 8 }}>
        <Text style={{ fontFamily: F.black, fontSize: fs.body, color: C.chalk }}>{t("w.recovery.nutrition.facts.title")}</Text>
        {p100 ? <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }}>{t("w.recovery.nutrition.facts.per100")}</Text> : null}
      </View>
      {rows.map((r, i) => (
        <View key={r.key} style={{ flexDirection: "row", alignItems: "baseline", gap: 10, paddingVertical: 8, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line }}>
          <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ flex: 1, fontFamily: r.sub ? F.reg : F.bold, fontSize: r.sub ? fs.caption : fs.body, color: r.sub ? C.ash : C.chalk, paddingLeft: r.sub ? 14 : 0 }}>{t(r.labelKey)}</Text>
          {r.note ? <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{r.note}</Text> : null}
          <Text style={{ fontFamily: F.monoBold, fontSize: r.sub ? fs.caption : fs.body, color: r.value ? C.chalk : C.ash, minWidth: 64, textAlign: "right" }}>{r.value ?? "—"}</Text>
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
      {/* The day's four figures. The picker DROPS a macro nobody set a target
          for: this block's subject is the gap, and a figure with nothing to be
          short of has no place in it. (The diary keeps it — see MacroLedger.) */}
      <MacroLedger C={C} figures={gap} onlyTargeted style={{ marginTop: space.ms }} />
    </View>
  );
}

/**
 * THE LEDGER — a day's figures in ONE line, in ONE form.
 *
 *     KCAL 1675/2325   PROTEIN 118/150   CARBS 186/250   FAT 52/70
 *
 * ── WHY IT IS ONE COMPONENT ────────────────────────────────────────────────
 * Two screens show these four numbers, and they said them in three dialects.
 * The picker stated energy as a SENTENCE ("1675 of 2325 logged") over a
 * full-width track and the macros as a ratio three-up; the diary's day card
 * said `P 118/150g` under single-letter labels, on a 4dp bar of its own, with
 * energy split off again into a big mono figure with a slashed target. Same
 * day, same question — how much of what I planned have I logged — asked three
 * ways, which is how a reader ends up doing conversions the app should have
 * done. There is one form now, and it lives here.
 *
 * ── THE HEAD STACKS, AND THAT IS A WIDTH FACT ──────────────────────────────
 * `AMeter` draws its own head as one row (label left, value right). That is
 * right at three columns and impossible at four: four columns leave ~80dp each
 * on a 393dp phone and ~76 on an SE, while "Protein 118/150" wants ~102 — so
 * the shared head would have ellipsised the label on every column carrying a
 * three-digit target, and "Kohlenhydrate" on all of them in German. So the
 * readout stacks and the TRACK stays the shared AMeter: only the head above it
 * is laid out for four-up.
 *
 * ── THE FIGURE ROLLS ───────────────────────────────────────────────────────
 * These are the numbers the picker exists to move — log a food and all four
 * change under your thumb. The hero above them rolled, the meal total beside it
 * rolled, the meter fills travelled, and the ledger jump-cut, so one event read
 * as two. The whole `have/want` string goes through `RollingNumber`: only the
 * changed digits travel, the "/" is punctuation and stays put, and a target
 * that changes rolls too.
 *
 * ── A FIGURE WITH NO TARGET STILL HAPPENED ─────────────────────────────────
 * `want: null` means nobody set a target, never that the target is zero. Such a
 * column states the amount and draws NO track — a bar at 0 % reads as "you have
 * eaten none of your carbs" when the truth is "you have no carb target". Which
 * columns survive is the caller's call, and the two callers differ honestly:
 * the picker is about the GAP so it drops them (`onlyTargeted`), the diary is a
 * RECORD of the day so it keeps them.
 */
export function MacroLedger({ C, figures, onlyTargeted = false, style }: {
  C: ReturnType<typeof useTheme>["palette"];
  /** the day's figures — `nutritionGap` (picker) or `nutritionFigures` (diary) */
  figures: NutritionGap;
  /** drop a macro that has no target instead of reporting the amount alone */
  onlyTargeted?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useLang();
  const macros = onlyTargeted ? figures.macros.filter((m) => m.figure.want != null) : figures.macros;
  /**
   * Energy first, then the macros — one list, because they are drawn as one
   * row: energy is not a different KIND of thing from protein here, it is the
   * first of four answers to the same question.
   *
   * `kcal` is the unit itself rather than a translated noun. It is what every
   * food row on the picker already says, and it is the same word in all three
   * locales; the macros keep their translated names.
   *
   * OVER is flagged on the ENERGY alone, in SAND — the hub's rule. A macro past
   * its own target says so with a full track, and carbs are DRAWN in sand, so a
   * sand carb figure would say nothing at all.
   */
  const items: { key: string; label: string; figure: GapFigure; fill: string; tone: string }[] = [
    {
      key: "kcal",
      label: "kcal",
      figure: figures.kcal,
      fill: figures.kcal.over ? C.amber : C.lime,
      tone: figures.kcal.over ? txt(C, C.amber) : C.chalk,
    },
    ...macros.map((m) => ({
      key: m.key,
      label: t(`w.recovery.nutrition.${m.key}`),
      figure: m.figure,
      fill: C[MACRO_FILL[m.key]],
      tone: C.chalk,
    })),
  ];
  return (
    <View style={[{ flexDirection: "row", gap: space.md }, style]}>
      {items.map((item) => (
        <View
          key={item.key}
          style={{ flex: 1 }}
          // A column reads as ONE figure, not as a label plus a number plus a
          // progress bar: the AMeter inside is collapsed into this sentence.
          // The retired "{a} of {b} logged" line lives on here, which is the
          // one place a sentence beats a ratio.
          accessible
          accessibilityLabel={
            item.figure.want == null
              ? `${item.label} ${Math.round(item.figure.have)}`
              : `${item.label} – ${t("w.recovery.nutrition.pick.ofTarget")
                  .replace("{a}", String(Math.round(item.figure.have)))
                  .replace("{b}", String(Math.round(item.figure.want)))}`
          }
        >
          <Text
            maxFontSizeMultiplier={FIXED_FONT_SCALE}
            numberOfLines={1}
            style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }}
          >
            {item.label}
          </Text>
          <View style={{ marginTop: space.xxs }}>
            <RollingNumber
              value={figureText(item.figure.have, item.figure.want)}
              maxFontSizeMultiplier={FIXED_FONT_SCALE}
              style={{ fontFamily: F.monoBold, fontSize: fs.caption, color: item.tone }}
            />
          </View>
          {/* No target, no track. The amount is the whole statement. */}
          {item.figure.want != null ? <AMeter pct={item.figure.pct} color={item.fill} /> : null}
        </View>
      ))}
    </View>
  );
}

/**
 * THE SOURCE SWITCH — Recent / Favorites / Meals / Foods, on the app's ONE
 * segmented control.
 *
 * The four sources are four different questions (what did I just eat, what do I
 * always eat, what have I built, what have I saved) and all four stay. What
 * changed is the control drawn around them: this was the last hand-drawn
 * selection control in the app, and it is `ASegment` now — the same track, the
 * same lens, the same `springs.lens` travel and the same `haptic.selection`
 * that the Today hub, the This-week filter, Statistics, Nutrition TRENDS and
 * Settings all switch on. Trends is one tap from this screen and was switching
 * on a track while the picker switched on an underline; the athlete has no way
 * to read that as anything but two apps.
 *
 * ── WHY THIS TOOK THREE PASSES, RECORDED SO IT TAKES NO MORE ───────────────
 * The two earlier arguments here were both about the NATIVE control, and both
 * are settled — but neither of them was ever an argument against this one.
 *
 * A design pass replaced the iOS system segmented control with an underline
 * line, on taste: it re-introduced a filled radiused track on a screen of
 * type-on-the-ground, it squeezed four unequal questions into equal widths, and
 * it dropped the counts the parent already computes. The product decision then
 * went the other way and restored the native fork — and #423 deleted THAT for a
 * structural reason no amount of taste survives: a SwiftUI `Host` sizes its RN
 * box from its content once, at mount, and every segmented control in this app
 * mounts before it knows its content (labels arrive from `useLang`), so the
 * control drew outside its own frame. The picker was one of the surfaces it
 * broke on. `design-tokens.test.ts` fails on any code reference to
 * `GlassSegment`, so that third attempt is impossible rather than discouraged.
 *
 * What the underline outlived, then, was a control that no longer exists — and
 * the replacement it was never weighed against is Yoga-laid-out, carries no
 * accent (the lens is a neutral step of the text colour, never chartreuse), and
 * lost only ONE of the three objections: the counts. So the counts moved onto
 * `ASegment` as its `meta` slot rather than the picker keeping a control of its
 * own to hold them, and the label shrinks before it truncates so four unequal
 * German words survive four equal widths. Nothing about this screen is left
 * arguing for a bespoke switch.
 *
 * The rule this control used to carry is gone with it. That hairline was doing
 * two jobs — saying which tab was selected, and giving the list beneath it a top
 * edge — and a track is an OBJECT, not a rule: the list opens on its first row
 * now, with the head matter's own step above it (see the call site).
 */
export function SourceSwitch({ value, counts, onChange }: {
  value: PickerSourceKey;
  counts: Record<PickerSourceKey, number>;
  onChange: (key: PickerSourceKey) => void;
}) {
  const { t } = useLang();
  return (
    // The object edge, like the field and the meter above it — the track is a
    // box on the screen's column, and PICKER_EDGE is where boxes stand.
    <View style={{ paddingHorizontal: PICKER_EDGE }}>
      <ASegment
        options={PICKER_SOURCES.map((key) => ({
          id: key,
          label: t(pickerSourceLabelKey(key)),
          meta: counts[key],
        }))}
        value={value}
        onPick={onChange}
      />
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
        <View style={{ width: 32, height: 32, borderRadius: RADIUS.field, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
          {icon}
        </View>
      </View>
      <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ flex: 1, fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{title}</Text>
      <IChevRight size={18} color={C.ash} />
    </Pressable>
  );
}

/**
 * A FOLD'S CHEVRON, which turns.
 *
 * Two blocks in Nutrition fold behind the words "More detail" — the Create
 * form's label fields and the portion sheet's label panel — and both drew a
 * static ⌄ that pointed down whether the block was open or shut. A state
 * indicator that does not indicate the state is decoration, and one that snaps
 * between two angles is a different thing appearing rather than the same thing
 * turning. It rotates on `durations.fast`, the token for a press state and a
 * dismissal, and it holds still under Reduce Motion — where the ARROW STILL
 * POINTS THE RIGHT WAY, because the direction is meaning, not motion.
 */
export function FoldChevron({ open, color }: { open: boolean; color: string }) {
  const reduced = useReducedMotion();
  const turn = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) { turn.setValue(open ? 1 : 0); return; }
    Animated.timing(turn, { toValue: open ? 1 : 0, duration: durations.fast, useNativeDriver: true }).start();
  }, [open, turn, reduced]);
  return (
    <Animated.View style={{ transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] }) }] }}>
      <IChevDown size={13} color={color} />
    </Animated.View>
  );
}

/**
 * WHAT A HOLD OFFERS — written once, because the pantry and the picker show the
 * same food and a menu that differed by door would read as two different foods.
 * The destructive row is last and tinted; the card itself never confirms, since
 * the surfaces behind it hold their deletes for Undo.
 */
export const savedFoodMenu = (t: (k: string) => string): HoldMenuItem[] => [
  { key: "edit", label: t("w.recovery.nutrition.pt.editThisFood") },
  { key: "delete", label: t("w.recovery.nutrition.hold.deleteFood"), destructive: true },
];
/** A remembered pack: the size the catalog published or the athlete typed. */
export const packMenu = (t: (k: string) => string): HoldMenuItem[] => [
  { key: "removePack", label: t("w.recovery.nutrition.hold.removePack"), destructive: true },
];

/**
 * A PACK THIS FOOD COMES IN, offered on the row itself — one tap logs the whole
 * bottle.
 *
 * It used to take five: open the picker, find the source, open the row's portion
 * sheet, press the bottle on the unit switch, press Log. Four of those exist to
 * answer a question the food already answered when the pack was recorded, and
 * the whole point of recording it was that the athlete drinks the bottle. So the
 * pack is on the row, where the ⊕ is.
 *
 * It wears the accent's RIM and the accent's type because it GOES — this is the
 * ⊕'s own grammar at chip size, not the bare "usual" chips inside the portion
 * sheet, which only set a number in a field. And it is HELD to be removed: a
 * pack the catalog got wrong is corrected where it is wrong, not three screens
 * away in a form.
 */
export interface RowPortion {
  /** the portion unit's id (core `portionUnitId`) — stable across a re-sort */
  id: string;
  /** the container, in the athlete's own word — "bottle" */
  label: string;
  /** how big it is, in the food's own measure — "400 g" */
  size: string;
  /** what the chip MEANS, said in full for the screen reader — "Whole bottle".
   *  The chip's own label is the short form because a row has nothing to tell it
   *  apart from; a reader hearing it in a list does. */
  a11y: string;
}

function WholePack({ portion, onLog, menu, onMenu }: {
  portion: RowPortion; onLog: () => void;
  menu?: HoldMenuItem[]; onMenu?: (key: string) => void;
}) {
  // The hold is offered only where the pack can actually be written back — a
  // saved food. On a recent, which is a per-device copy, "Remove pack" would
  // change nothing that survives the next log, so no hold is armed there and the
  // chip is a plain AChip.
  const { t } = useLang();
  const hold = useHoldMenu({ items: menu ?? [], onSelect: (k) => onMenu?.(k), disabled: !onMenu });
  return (
    <>
      {/* collapsable={false} keeps the box measurable — RN prunes layout-only
          Views on Android, and a pruned view has no rect to anchor to. */}
      <Animated.View ref={hold.anchorRef} collapsable={false} style={hold.liftStyle}>
        <AChip
          tone="action"
          label={portion.label}
          meta={portion.size}
          // The chip PRINTS the container and its size; it is READ as the whole
          // sentence, because a screen reader moving down a list has no adjacent
          // chips to read the short form against.
          a11yLabel={`${t("w.recovery.nutrition.addToMeal")}: ${portion.a11y}, ${portion.size}`}
          onPress={onLog}
          onLongPress={hold.holdProps.onLongPress}
          delayLongPress={hold.holdProps.delayLongPress}
        />
      </Animated.View>
      {hold.menu}
    </>
  );
}

export function FoodRow({ C, name, subname, meta, over, onAdd, onOpen, chevron, starred, onStar, onDelete, verified, menu, onMenu, portions, onLogPortion, portionMenu, onPortionMenu }: {
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
  /** HOLD THE ROW — the app's one long-press menu (components/hold-menu.tsx).
   *  Where a row's Edit and its Delete live now: the edit door used to be at the
   *  bottom of the portion sheet, three taps inside the thing being edited, and
   *  the delete was a swipe with nothing on screen saying it was there. */
  menu?: HoldMenuItem[];
  onMenu?: (key: string) => void;
  /** the packs this food comes in — one tap each */
  portions?: RowPortion[];
  onLogPortion?: (unitId: string) => void;
  /** the hold menu a PACK carries, when the food is one this app can write back
   *  to. `onPortionMenu` gets the pack's unit id with the chosen action. */
  portionMenu?: HoldMenuItem[];
  onPortionMenu?: (unitId: string, key: string) => void;
}) {
  const { t } = useLang();
  const hold = useHoldMenu({ items: menu ?? [], onSelect: (k) => onMenu?.(k) });
  // The hold has to be armed on the row's OWN pressables: an inner Pressable
  // keeps the touch, so a long press on the ⊕ or the title never reaches a
  // wrapper. The a11y actions ride the body, which is the row's one focusable
  // region — VoiceOver cannot hold anything, so the same rows are reachable
  // through the rotor.
  const held = { onLongPress: hold.holdProps.onLongPress, delayLongPress: hold.holdProps.delayLongPress };
  const body = (
    // Animated, because the hold LIFTS it: the row rises while its card is up,
    // so the menu reads as belonging to the food rather than to the screen.
    <Animated.View ref={hold.anchorRef} collapsable={false} style={[{ borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: C.ink }, hold.liftStyle]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.lg, paddingVertical: 12, paddingHorizontal: PICKER_EDGE }}>
        <Pressable onPress={onAdd} {...held} accessibilityRole="button" accessibilityLabel={`${t("w.recovery.nutrition.addToMeal")}: ${name}`} style={{ width: ROW_LEAD, height: ROW_LEAD, borderRadius: RADIUS.pill, borderWidth: 1.6, borderColor: C.lime, alignItems: "center", justifyContent: "center" }}><IPlus size={20} color={txt(C, C.lime)} strokeWidth={2.2} /></Pressable>
        <Pressable
          onPress={onOpen ?? onAdd}
          {...held}
          accessibilityActions={hold.a11yActions}
          onAccessibilityAction={hold.onA11yAction}
          style={{ flex: 1, minWidth: 0 }}
        >
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
      {/* The packs, on the title's own vertical — they belong to the food named
          above them, not to the row's leading column. */}
      {portions?.length && onLogPortion ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingLeft: PICKER_EDGE + ROW_LEAD + space.lg, paddingRight: PICKER_EDGE, paddingBottom: 12 }}>
          {portions.map((p) => (
            <WholePack
              key={p.id} portion={p}
              onLog={() => onLogPortion(p.id)}
              menu={portionMenu}
              onMenu={onPortionMenu ? (key) => onPortionMenu(p.id, key) : undefined}
            />
          ))}
        </View>
      ) : null}
    </Animated.View>
  );
  // The swipe STAYS where it was. It is the same delete the hold's menu fires,
  // and a gesture people already have in their fingers is not worth taking away
  // to prove a point about the new one.
  return (
    <>
      {onDelete
        ? <SwipeRow onDelete={onDelete} label={t("w.recovery.nutrition.remove")} background={C.ink}>{body}</SwipeRow>
        : body}
      {hold.menu}
    </>
  );
}

/** AURORA Nutrition (mobile) — the adaptive macro tracker on one restrained
 *  system, in parity with the web screen: the calorie tick-ring is the hero,
 *  macros read as hairline lines, iconography is one monoline voice, and colour
 *  appears only where it means something. Same engine + Signal logging + personal
 *  library. `compact` renders the focused Today "Add a meal" sheet. */
