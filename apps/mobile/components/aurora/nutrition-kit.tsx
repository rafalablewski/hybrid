import { useRef, useState, type ReactNode } from "react";
import { View, Text, Animated, PanResponder } from "react-native";
import Svg, { Path, Circle, Rect } from "react-native-svg";
import { SvgXml } from "react-native-svg";
import {
  NUTRITION_GLYPHS, nutritionPanel, per100g, scaleFacts,
  PICKER_SOURCES, pickerSourceLabelKey,
  type MicroFacts, type NutritionFacts, type NutritionGlyphName, type NutritionGap, type PickerSourceKey, type SourceMark,
  type VerifiedStamp,
} from "@hybrid/core";
import { fs, space, leading, tracking, F, PressScale as Pressable, FIXED_FONT_SCALE, MAX_FONT_SCALE, HIT_SLOP } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { useLang } from "../../lib/i18n";
import { withAlpha } from "./field";
import { AMeter } from "./kit";
import { RollingNumber } from "./rolling-number";
import SwipeRow from "../swipe-row";

/**
 * THE PICKER'S LEFT EDGE — one number, every block that sits on the screen.
 *
 * The picker had three: the gap header indented 4, the rows and doors 6, and
 * the two empty-state lines 0. Stacked vertically that is three optical left
 * edges in one column, which is exactly the misalignment the eye reads as
 * "unfinished" without being able to name it. The field is the ONE exception
 * and legitimately so: it is a container, so its own 16 is interior padding
 * rather than a competing edge.
 */
export const PICKER_EDGE = space.xs;

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
export function DayGap({ C, gap }: {
  C: ReturnType<typeof useTheme>["palette"]; gap: NutritionGap;
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
  return (
    <View style={{ paddingHorizontal: PICKER_EDGE, paddingBottom: space.xl }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm }}>
        <RollingNumber
          value={String(Math.abs(left))}
          style={{ fontFamily: F.black, fontSize: fs.stat, lineHeight: leading(fs.stat, "tight"), letterSpacing: tracking.display, color: tone }}
        />
        <Text
          maxFontSizeMultiplier={FIXED_FONT_SCALE}
          style={{ fontFamily: F.mono, fontSize: fs.caption, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }}
        >
          {t(isOver ? "w.recovery.nutrition.pick.kcalOver" : "w.recovery.nutrition.pick.kcalLeft")}
        </Text>
      </View>
      {/* THE DAY'S ENERGY, as a proportion. The ledger line is the meter's own
          readout rather than a sentence floating above it — one object, not
          two. `AMeter` draws the readout row above the track, which keeps the
          reading order the block always had (figure → ledger → fill). */}
      <AMeter
        pct={gap.kcal.pct}
        color={gap.kcal.over ? C.amber : C.lime}
        value={t("w.recovery.nutrition.pick.ofTarget")
          .replace("{a}", String(Math.round(gap.kcal.have)))
          .replace("{b}", String(Math.round(gap.kcal.want ?? 0)))}
      />
      {macros.length ? (
        // `space.sm` and not `space.lg`: AMeter carries its own `space.ms` top
        // margin, so the gap the eye sees between the energy track and the
        // macro labels is the sum.
        <View style={{ flexDirection: "row", gap: space.lg, marginTop: space.sm }}>
          {macros.map((m) => (
            <View key={m.key} style={{ flex: 1 }}>
              <AMeter
                label={t(`w.recovery.nutrition.${m.key}`)}
                value={`${Math.round(m.figure.have)}/${Math.round(m.figure.want ?? 0)}`}
                pct={m.figure.pct}
                color={C[MACRO_FILL[m.key]]}
              />
            </View>
          ))}
        </View>
      ) : null}
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
 * ── AND IT IS THE ONLY FORM, INCLUDING ON iOS ──────────────────────────────
 * The picker used to swap this for the SYSTEM segmented control (SwiftUI
 * `Picker` + `.pickerStyle(.segmented)`) wherever Liquid Glass renders, on the
 * argument that a native segment is what iOS users know. Three things were
 * wrong with that, and they are visible in one screenshot:
 *
 *   1. It brought back the filled, radiused track this component was written to
 *      delete — a grey slab in SF Pro, the only bordered box on a screen whose
 *      whole design is type on the ground, sitting directly under the app's own
 *      field and above the app's own rows.
 *   2. It DROPPED THE COUNTS. The parent computes `sourceCounts` and iOS threw
 *      them away, so the one platform the product actually ships on could not
 *      see that Favorites held nine and Meals none until it tapped each.
 *   3. A native segment is equal-width, so the four labels were squeezed to fit
 *      the longest — and equal-width is the wrong shape anyway: these are four
 *      different questions, not four states of one.
 *
 * The system control is still right where it IS the object (the hub's
 * three-way view switch, `today-tabs`); it was never right for a source line.
 */
export function SourceLine({ C, value, counts, onChange }: {
  C: ReturnType<typeof useTheme>["palette"];
  value: PickerSourceKey;
  counts: Record<PickerSourceKey, number>;
  onChange: (key: PickerSourceKey) => void;
}) {
  const { t } = useLang();
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
            onPress={() => onChange(key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={{
              flexDirection: "row", alignItems: "baseline", gap: 5,
              paddingBottom: 11, marginBottom: -1,
              borderBottomWidth: 2, borderBottomColor: on ? C.chalk : "transparent",
            }}
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
        flexDirection: "row", alignItems: "center", gap: 16,
        paddingVertical: 14, paddingHorizontal: PICKER_EDGE,
        borderBottomWidth: last ? 0 : 1, borderBottomColor: C.line,
      }}
    >
      <View style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
        {icon}
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
    <View style={{ flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 12, paddingHorizontal: PICKER_EDGE, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: C.ink }}>
      <Pressable onPress={onAdd} accessibilityRole="button" accessibilityLabel={`${t("w.recovery.nutrition.addToMeal")}: ${name}`} style={{ width: 44, height: 44, borderRadius: 999, borderWidth: 1.6, borderColor: C.lime, alignItems: "center", justifyContent: "center" }}><IPlus size={20} color={txt(C, C.lime)} strokeWidth={2.2} /></Pressable>
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
