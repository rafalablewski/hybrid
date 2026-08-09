import { useRef, useState, type ReactNode } from "react";
import { View, Text, Pressable, Animated, PanResponder } from "react-native";
import Svg, { Path, Circle, Rect } from "react-native-svg";
import { SvgXml } from "react-native-svg";
import {
  NUTRITION_GLYPHS, nutritionPanel, per100g, scaleFacts,
  type MicroFacts, type NutritionFacts, type NutritionGlyphName, type SourceMark,
  type VerifiedStamp,
} from "@hybrid/core";
import { fs, space, leading, F, PressScale, FIXED_FONT_SCALE, MAX_FONT_SCALE, HIT_SLOP } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { useLang } from "../../lib/i18n";
import { withAlpha } from "./field";
import SwipeRow from "../swipe-row";

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
      <Text style={{ fontFamily: F.black, fontSize: Math.round(height * 0.48), letterSpacing: 0.9, color: C.chalk, borderWidth: 1, borderColor: C.line, borderRadius: 6, paddingVertical: 5, paddingHorizontal: 8 }}>
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
 * reads as a broken image, and on the Kyoto Hour washi it would read as a
 * sticker. Parity with web aurora/nutrition.tsx MarkPlate.
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
        {p100 ? <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>{t("w.recovery.nutrition.facts.per100")}</Text> : null}
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
export function FoodRow({ C, name, subname, meta, onAdd, onOpen, chevron, starred, onStar, onDelete, verified }: {
  C: ReturnType<typeof useTheme>["palette"]; name: string; subname?: string | null; meta: string; onAdd: () => void;
  /** tapping the row BODY, when that means something different from the ⊕ —
   *  a verified item opens its page; everything else just adds. */
  onOpen?: () => void;
  chevron?: boolean; starred?: boolean; onStar?: () => void; onDelete?: () => void; verified?: VerifiedStamp;
}) {
  const { t } = useLang();
  const body = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 12, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: C.ink }}>
      <Pressable onPress={onAdd} accessibilityRole="button" accessibilityLabel={`${t("w.recovery.nutrition.addToMeal")}: ${name}`} style={{ width: 44, height: 44, borderRadius: 999, borderWidth: 1.6, borderColor: C.lime, alignItems: "center", justifyContent: "center" }}><IPlus size={20} color={txt(C, C.lime)} strokeWidth={2.2} /></Pressable>
      <Pressable onPress={onOpen ?? onAdd} style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
          <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk, flexShrink: 1 }}>{name}</Text>
          {verified ? <VerifiedMark C={C} /> : null}
          {subname ? <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, flexShrink: 1 }}>{subname}</Text> : null}
        </View>
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 3 }}>{meta}</Text>
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
