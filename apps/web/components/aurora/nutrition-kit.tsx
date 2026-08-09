"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  NUTRITION_GLYPHS, nutritionPanel, per100g, scaleFacts, sourceMarkDataUri,
  PICKER_SOURCES, pickerSourceLabelKey,
  type MicroFacts, type NutritionFacts, type NutritionGlyphName,
  type NutritionGap, type NutritionNudge as NutritionNudgeShape, type PickerSourceKey, type SourceMark, type VerifiedStamp,
} from "@hybrid/core";
import { fs, CARD_PAD } from "@/lib/ui";
import { useLang } from "@/lib/i18n";
import { CtaLabel } from "./cta-label";
import SwipeRow from "../swipe-row";

/**
 * THE NUTRITION KIT (web) — the vocabulary every Nutrition screen draws in.
 *
 * These lived at the top and bottom of nutrition.tsx, which had grown to 3 685
 * lines holding seventeen views. They were never part of that component: each
 * one is a pure presentational piece with explicit props, sharing a file only
 * because that is where they were first written.
 *
 * Lifting them out is not cosmetic. A primitive nobody can import is a
 * primitive that gets re-written the next time a screen needs it — which is
 * exactly how this repo ended up with five differently-sized rail tails and two
 * copies of the serving-unit list. Everything here is now importable, so the
 * next nutrition surface inherits the row, the facts panel and the mark plate
 * instead of drawing its own.
 *
 * The twin is apps/mobile/components/aurora/nutrition-kit.tsx.
 */

const C = (v: string) => `var(--color-${v})`;

export type QuickFood = { key: string; name: string; subname?: string | null; serving: string; kcal: number; protein: number; carbs: number; fat: number } & MicroFacts & { verified?: VerifiedStamp; verifiedId?: string | null; servingGrams?: number | null }
  /** WHEN this exact (food, serving) was logged — epoch ms, capped. Written
   *  on every log; read by usualAtHour so the picker can open on what this
   *  athlete actually eats at this time of day. Per-device, like the MRU
   *  itself; an entry saved before this shipped simply has no history yet. */
  & { logs?: number[] | null };

export function readQuickFoods(key: string): QuickFood[] {
  try { if (typeof window === "undefined") return []; const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as QuickFood[]) : []; } catch { return []; }
}
export function writeQuickFoods(key: string, xs: QuickFood[]) {
  try { localStorage.setItem(key, JSON.stringify(xs)); } catch { /* private mode */ }
}

// One monoline icon voice for the whole Nutrition surface (no emoji). Renders the
// shared 72×72 stroke paths at the SAME weight as AuroraIcon, so these glyphs sit
// beside the app's kit icons as one family.
export function Glyph({ name, size = 22, color = "currentColor", strokeWidth = 3.5, style }: { name: NutritionGlyphName; size?: number; color?: string; strokeWidth?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" fill="none" style={style} aria-hidden="true">
      {NUTRITION_GLYPHS[name].map((d, i) => (
        <path key={i} d={d} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}
// Meal presets read as times of day — the one place a glyph carries meaning.
export const presetGlyph = (id: string): NutritionGlyphName => id.startsWith("breakfast") ? "sunrise" : id.startsWith("lunch") ? "sun" : id.startsWith("dinner") ? "moon" : "cup";

// Small stroke icons for the redesigned flows (close, chevron, barcode, trash,
// restart, star, bolt, plus-box) — inline so the mockup chrome renders exactly,
// at the same monoline weight as the rest of the surface.
export type IconProps = { size?: number; color?: string; strokeWidth?: number; style?: React.CSSProperties };
export const Svg = ({ size = 20, color = "currentColor", strokeWidth = 2, d, fill, style }: IconProps & { d: string; fill?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? color : "none"} stroke={fill ? "none" : color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><path d={d} /></svg>
);
export const IClose = (p: IconProps) => <Svg {...p} d="M6 6l12 12M18 6L6 18" strokeWidth={p.strokeWidth ?? 2.2} />;
export const IChevDown = (p: IconProps) => <Svg {...p} d="M6 9l6 6 6-6" strokeWidth={p.strokeWidth ?? 2.4} />;
export const IChevRight = (p: IconProps) => <Svg {...p} d="M9 6l6 6-6 6" strokeWidth={p.strokeWidth ?? 2.2} />;
export const IPlus = (p: IconProps) => <Svg {...p} d="M12 6v12M6 12h12" strokeWidth={p.strokeWidth ?? 2.2} />;
export const IBarcode = (p: IconProps) => <Svg {...p} d="M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8M21 16v2.5a2.5 2.5 0 0 1-2.5 2.5H16M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16M6.5 12h11" strokeWidth={p.strokeWidth ?? 1.9} />;
export const ITrash = (p: IconProps) => <Svg {...p} d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6" strokeWidth={p.strokeWidth ?? 1.9} />;
export const IBolt = (p: IconProps) => <Svg {...p} d="M13 2L4 14h7l-1 8 9-12h-7z" strokeWidth={p.strokeWidth ?? 2} />;
export const IClock = (p: IconProps) => (
  <svg width={p.size ?? 20} height={p.size ?? 20} viewBox="0 0 24 24" fill="none" stroke={p.color ?? "currentColor"} strokeWidth={p.strokeWidth ?? 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M9 2h6" /></svg>
);
export const IPlusBox = (p: IconProps) => (
  <svg width={p.size ?? 20} height={p.size ?? 20} viewBox="0 0 24 24" fill="none" stroke={p.color ?? "currentColor"} strokeWidth={p.strokeWidth ?? 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><path d="M12 8v8M8 12h8" /></svg>
);
export const IStar = ({ size = 20, color = "currentColor", strokeWidth = 1.8, fill = false }: IconProps & { fill?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? color : "none"} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17.8 6.8 19.2l1-5.8L3.5 9.2l5.9-.9z" /></svg>
);

// A screen-level left/right rail — the exercise-widget / "Train your way"
// idiom. FULL-BLEED: negative margins the width of the shell gutter
// (--page-pad-x) pull the scroll clip to the true screen edge so cards slide
// under it, and the MATCHING internal padding keeps a resting card aligned with
// the content column.
export const railScroller: React.CSSProperties = {
  display: "flex",
  gap: 12,
  overflowX: "auto",
  scrollSnapType: "x mandatory",
  scrollbarWidth: "none",
  margin: "0 calc(-1 * var(--page-pad-x, 12px))",
  padding: "4px var(--page-pad-x, 12px) 6px",
};

// A library SHELF's rail — the same full-bleed scroller without the paging
// snap: a shelf of covers is browsed by eye, not stepped through card by card.
export const shelfScroller: React.CSSProperties = { ...railScroller, scrollSnapType: "none" };

// The head above a rail — the Explore SectionHead anatomy: a bold display-face
// title, no marker before it (the no-decorative-dot rule).
//
// The right slot is now EMPTY for both callers: a rail's "see all" lives at the
// END OF THE RAIL as a tail card (aurora/rail-tail.tsx), where the thumb already
// is once the cards run out. `action` survives only for a head that needs a
// non-navigational meta or control, and renders nothing when it isn't passed.
export function RailHead({ title, meta, action }: {
  title: string;
  /** Small mono uppercase on the RIGHT of the title's row — the Explore
   *  SectionHead's meta slot, for a head that states something rather than
   *  offering a control. `action` remains the control. */
  meta?: string;
  action?: { label: string; onClick: () => void; premium?: boolean };
}) {
  const C = (v: string) => `var(--color-${v})`;
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, margin: "28px 2px 10px" }}>
      <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18, color: C("chalk") }}>{title}</span>
      {meta && !action && (
        <span style={{ flexShrink: 0, fontFamily: "var(--font-mono)", fontSize: fs.micro, letterSpacing: ".08em", textTransform: "uppercase", color: C("ash") }}>{meta}</span>
      )}
      {action && (
        <button className="pressable" onClick={action.onClick} style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "var(--font-mono)", fontSize: fs.micro, letterSpacing: ".08em", textTransform: "uppercase", color: action.premium ? "var(--premium-accent-text)" : C("ash") }}>
          <CtaLabel size={12}>{action.label}</CtaLabel>
        </button>
      )}
    </div>
  );
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
 * sticker. The mark is contained (never cropped, never stretched) and centred.
 *
 * A source with no artwork keeps the WORDMARK FALLBACK — the business name set
 * in our own display face — which is honest (visibly ours) rather than an
 * approximation of a logo we don't hold.
 */
export function MarkPlate({ C, src, height = 34, full }: {
  C: (v: string) => string; src: { name: string; mark?: SourceMark }; height?: number; full?: boolean;
}) {
  return (
    <div
      style={{
        width: full ? "100%" : undefined,
        height: height + 22,
        display: "grid",
        placeItems: "center",
        padding: "0 16px",
        borderRadius: 16,
        background: `color-mix(in srgb, ${C("chalk")} 7%, ${C("ink")})`,
        border: `1px solid ${C("line")}`,
        overflow: "hidden",
      }}
    >
      <SourceMarkView C={C} src={src} height={height} />
    </div>
  );
}

// The HYBRID Verified mark — the same quiet lime tick the verified-coach badge
// uses, so "checked by us" reads identically wherever it appears in the app.
// Not decoration: it only ever renders when a `VerifiedStamp` is present.
export function VerifiedMark({ size = 13 }: { size?: number }) {
  const { t } = useLang();
  return (
    <span
      title={t("w.recovery.nutrition.verified")}
      aria-label={t("w.recovery.nutrition.verified")}
      style={{ display: "inline-flex", alignItems: "center", color: "var(--lime-text)", fontSize: size, lineHeight: 1, flexShrink: 0 }}
    >
      ✓
    </span>
  );
}

// The operator's mark, or — when we hold no artwork for them — their name set
// in OUR display face inside a hairline chip. The fallback is deliberately
// typographic: visibly ours, so it can never be taken for an approximation of
// somebody's logo. One renderer for the product page and the provenance card,
// so the two can't drift apart.
export function SourceMarkView({ C, src, height }: {
  C: (v: string) => string; src: { name: string; mark?: SourceMark }; height: number;
}) {
  if (!src.mark) {
    return (
      <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: Math.round(height * 0.48), letterSpacing: ".08em", color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 6, padding: "5px 8px", whiteSpace: "nowrap", flexShrink: 0 }}>
        {src.name}
      </span>
    );
  }
  // A data URI on an <img>, never innerHTML — a mark can't become an injection
  // surface even though every mark in the catalog is ours.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={sourceMarkDataUri(src.mark)} alt={src.mark.alt} style={{ height, width: height * src.mark.aspect, maxWidth: 168, objectFit: "contain", flexShrink: 0 }} />;
}

// The nutrition-facts panel — the EU label, rendered from ONE core function
// (nutritionPanel) so web and mobile can never disagree about what a food says.
// A field the food never stated shows an em dash, NEVER "0 g": an unstated sugar
// content is not a sugar-free food, and quietly printing a zero would be the
// single most misleading thing this surface could do.
export function FactsPanel({ C, facts, per100, scale = 1 }: {
  C: (v: string) => string; facts: NutritionFacts; per100?: NutritionFacts | null; scale?: number;
}) {
  const { t } = useLang();
  // Scale through CORE, never by hand: scaleFacts is the one place that knows a
  // scaled unknown stays unknown, and a second copy of that rule here would be
  // free to drift from the one the log actually writes.
  const rows = nutritionPanel(scale === 1 ? facts : scaleFacts(facts, scale));
  const p100 = per100 ? nutritionPanel(per100) : null;
  return (
    <div style={{ marginTop: 16, background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "4px 16px 8px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "12px 0 8px" }}>
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.body, color: C("chalk") }}>{t("w.recovery.nutrition.facts.title")}</span>
        {p100 && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash") }}>{t("w.recovery.nutrition.facts.per100")}</span>}
      </div>
      {rows.map((r, i) => (
        <div key={r.key} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "8px 0", borderTop: i === 0 ? "none" : `1px solid ${C("line")}` }}>
          <span style={{ flex: 1, minWidth: 0, fontFamily: "var(--font-display)", fontWeight: r.sub ? 500 : 700, fontSize: r.sub ? fs.caption : fs.body, color: r.sub ? C("ash") : C("chalk"), paddingLeft: r.sub ? 16 : 0 }}>
            {t(r.labelKey)}
          </span>
          {r.note && <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), whiteSpace: "nowrap" }}>{r.note}</span>}
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: r.sub ? fs.caption : fs.body, color: r.value ? C("chalk") : C("ash"), fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", minWidth: 64, textAlign: "right" }}>
            {r.value ?? "—"}
          </span>
          {p100 && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", minWidth: 62, textAlign: "right" }}>
              {p100[i]!.value ?? "—"}
            </span>
          )}
        </div>
      ))}
      {rows.some((r) => !r.value) && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), paddingTop: 8, lineHeight: 1.5 }}>
          {t("w.recovery.nutrition.facts.notStatedNote")}
        </div>
      )}
    </div>
  );
}

// A food row in the picker — a lime add-circle, name + macro meta, and either a
// chevron (a DB hit), a favourite star, or a swipe-left-to-delete (a personal
// item). The row body opens the portion editor; the ⊕ adds.
//
// THE SWIPE IS THE SHARED ONE. This row used to carry its OWN gesture: a
// pointer-delta translate with a -84px clamp, a 60px reveal threshold and a
// .22s ease — none of which are the numbers apps/web/components/swipe-row.tsx
// swipes every set row in the app by, and none of which existed on the mobile
// twin at all (it drew a trash BUTTON, so "swipe to delete" was a web-only
// gesture in an app whose parity rule says otherwise). It now delegates to
// SwipeRow on both clients, which means one set of physics from @hybrid/core —
// velocity projection, rubber-band, the iOS full-swipe — and one delete.
/**
 * THE DAY GAP — what the day still owes, at the top of the picker.
 *
 * Nobody opens this screen to search; they open it because the day is short of
 * something. So the picker says what, in the Builder's One Number vocabulary: a
 * display-weight mono figure, a quiet sentence under it, and the macros as thin
 * meters. It reads through the SAME arithmetic the hub's ring does
 * (core/nutrition-gap.ts) so the two can never disagree about whether you are
 * over, and it renders NOTHING when there is no target yet — a header reading
 * "2 000 left" against a number nobody set would be a confident wrong number.
 *
 * This is the picker's own header, not the sticky HUD that was removed
 * (nutrition-hud): it sits where the decision is being made and scrolls with it.
 * Mobile twin: aurora/nutrition-kit.tsx DayGap.
 */
export function DayGap({ C, gap }: { C: (v: string) => string; gap: NutritionGap }) {
  const { t } = useLang();
  const left = gap.kcal.left ?? 0;
  // The WORD follows the sign and the COLOUR follows the band. They are two
  // different questions: 50 past a 2 000 target is "50 over" (it is), drawn
  // calmly (it is inside the 5 % tolerance). Reading the word off the tolerance
  // flag printed "50 kcal left" at 2 050 logged.
  const isOver = left < 0;
  const tone = gap.kcal.over ? "var(--amber-text)" : "var(--lime-text)";
  const macros = gap.macros.filter((m) => m.figure.want != null);
  return (
    <div style={{ padding: "4px 4px 18px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 44, letterSpacing: "-.03em", lineHeight: 1.05, color: tone, fontVariantNumeric: "tabular-nums" }}>
          {Math.abs(left)}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, letterSpacing: ".1em", textTransform: "uppercase", color: C("ash") }}>
          {t(isOver ? "w.recovery.nutrition.pick.kcalOver" : "w.recovery.nutrition.pick.kcalLeft")}
        </span>
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 8 }}>
        {t("w.recovery.nutrition.pick.ofTarget")
          .replace("{a}", String(Math.round(gap.kcal.have)))
          .replace("{b}", String(Math.round(gap.kcal.want ?? 0)))}
      </div>
      {macros.length > 0 && (
        <div style={{ display: "flex", gap: 16, marginTop: 18 }}>
          {macros.map((m) => (
            <div key={m.key} style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 6, marginBottom: 6 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".1em", textTransform: "uppercase", color: C("ash") }}>
                  {t(`w.recovery.nutrition.${m.key}`)}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.nano, color: C("chalk"), fontVariantNumeric: "tabular-nums" }}>
                  {Math.round(m.figure.have)}/{Math.round(m.figure.want ?? 0)}
                </span>
              </div>
              <div style={{ height: 3, borderRadius: 2, background: C("line"), overflow: "hidden" }}>
                <div style={{ width: `${m.figure.pct}%`, height: "100%", borderRadius: 2, background: m.figure.over ? "var(--amber-text)" : "var(--lime-text)" }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
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
 * onto the label they describe. Mobile twin: aurora/nutrition-kit.tsx SourceLine.
 */
export function SourceLine({ C, value, counts, onChange }: {
  C: (v: string) => string;
  value: PickerSourceKey;
  counts: Record<PickerSourceKey, number>;
  onChange: (key: PickerSourceKey) => void;
}) {
  const { t } = useLang();
  return (
    <div role="tablist" style={{ display: "flex", gap: 18, borderBottom: `1px solid ${C("line")}`, padding: "0 2px" }}>
      {PICKER_SOURCES.map((key) => {
        const on = key === value;
        return (
          <button
            key={key}
            role="tab"
            aria-selected={on}
            className="pressable"
            onClick={() => onChange(key)}
            style={{
              display: "flex", alignItems: "baseline", gap: 5,
              background: "none", border: "none", cursor: "pointer",
              padding: "0 0 11px", marginBottom: -1,
              borderBottom: `2px solid ${on ? C("chalk") : "transparent"}`,
              color: on ? C("chalk") : C("ash"),
              fontFamily: "var(--font-display)", fontWeight: on ? 700 : 600, fontSize: fs.body,
              letterSpacing: "-.006em", whiteSpace: "nowrap",
            }}
          >
            {t(pickerSourceLabelKey(key))}
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.nano, color: C("ash") }}>{counts[key]}</span>
          </button>
        );
      })}
    </div>
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
 * above it. Mobile twin: aurora/nutrition-kit.tsx PickerDoor.
 */
export function PickerDoor({ C, title, icon, onPress, last }: {
  C: (v: string) => string; title: string; icon: ReactNode; onPress: () => void; last?: boolean;
}) {
  return (
    <button
      className="pressable"
      onClick={onPress}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 16, textAlign: "left",
        background: "none", border: "none", cursor: "pointer",
        padding: "14px 6px",
        borderBottom: last ? "none" : `1px solid ${C("line")}`,
        color: C("chalk"),
      }}
    >
      <span style={{ width: 32, height: 32, borderRadius: 999, border: `1px solid ${C("line")}`, display: "grid", placeItems: "center", flexShrink: 0, color: C("ash") }}>
        {icon}
      </span>
      <span style={{ flex: 1, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.subtitle }}>{title}</span>
      <IChevRight size={18} color={C("ash")} />
    </button>
  );
}

export function FoodRow({ C, name, subname, meta, over, onAdd, onOpen, chevron, starred, onStar, onDelete, verified }: {
  C: (v: string) => string; name: string; subname?: string | null; meta: string; onAdd: () => void;
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
    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 6px", background: C("ink"), borderBottom: `1px solid ${C("line")}` }}>
      <button className="pressable" onClick={onAdd} aria-label={`${t("w.recovery.nutrition.addToMeal")}: ${name}`} style={{ width: 44, height: 44, borderRadius: 999, border: "1.6px solid var(--color-lime)", background: "transparent", color: "var(--lime-text)", display: "grid", placeItems: "center", flexShrink: 0, cursor: "pointer" }}><IPlus size={20} color="var(--lime-text)" strokeWidth={2.2} /></button>
      <button className="pressable" onClick={onOpen ?? onAdd} style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.subtitle, color: C("chalk"), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "0 1 auto", minWidth: 0 }}>{name}</span>
          {verified && <VerifiedMark />}
          {subname ? <span style={{ fontFamily: "var(--font-display)", fontWeight: 500, fontSize: fs.caption, color: C("ash"), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: "1 1 auto", minWidth: 0 }}>{subname}</span> : null}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: over ? "var(--amber-text)" : C("ash"), marginTop: 3 }}>{meta}</div>
      </button>
      {onStar && <button className="pressable" onClick={onStar} aria-label={t("w.recovery.nutrition.tab.favorites")} style={{ background: "none", border: "none", cursor: "pointer", flexShrink: 0, padding: 4, color: starred ? "var(--color-gold)" : C("ash") }}><IStar size={19} color={starred ? "var(--color-gold)" : C("ash")} fill={starred} /></button>}
      {chevron && <IChevRight size={18} color={C("ash")} />}
    </div>
  );
  if (!onDelete) return body;
  return <SwipeRow onDelete={onDelete} label={t("w.recovery.nutrition.remove")} radius={0} margin="0">{body}</SwipeRow>;
}
