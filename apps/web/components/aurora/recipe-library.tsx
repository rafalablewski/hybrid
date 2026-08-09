"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  DOCK_RAIL, RECIPES, formatIngredient, recipeCardStats, recipeCollectionCoverView,
  recipeCookView, recipeCoverView, recipeLibraryCoverView, recipeShelves, recipeTileView,
  recipesInCollection,
  type Recipe, type RecipeCollection, type RecipeCookView,
} from "@hybrid/core";
import { fs, space } from "@/lib/ui";
import { useLang } from "@/lib/i18n";
import { AuroraIcon } from "./icons";
import { CoverHero, useHeroCollapse, COVER_BAR, COVER_INK } from "./cover-hero";
import { DockRail, DockChip } from "./dock-rail";
import { HeroNav } from "./hero";
import { railScroller, shelfScroller, IClock, IPlus } from "./nutrition-kit";

/**
 * THE RECIPE LIBRARY (web) — the curated, read-only shelves.
 *
 * Seven components that were always independent of the Nutrition screen's
 * state: they take a recipe (or a collection key) and a couple of callbacks,
 * and they render. They sat inside nutrition.tsx purely because that is where
 * the library was first built.
 *
 * They are the READ-ONLY half. The athlete's own recipes live in
 * aurora/user-recipes.tsx and share no model with these — a RECIPES entry is
 * editorial content with a written method, a user recipe is an arithmetic
 * object. Keeping the two in separate modules makes that separation legible
 * rather than something you have to know.
 *
 * The twin is apps/mobile/components/aurora/recipe-library.tsx.
 */

const C = (v: string) => `var(--color-${v})`;

export function collectionTitle(key: RecipeCollection, t: (k: string) => string): string {
  return key === "highProtein" ? t("w.recovery.nutrition.recipeFilter.highProtein") : t(`w.recovery.nutrition.meal.${key}`);
}

/** Height of the docked chip rail — the offset a jump has to clear on top of
 *  the collapsed cover bar. DERIVED from the dock-rail contract, like the twin
 *  in plans.tsx, so the rail can never be a different height than this says. */
export const RECIPE_RAIL_H = DOCK_RAIL.chip.hit + 2 * DOCK_RAIL.padY;
const shelfId = (key: RecipeCollection) => `recipe-shelf-${key}`;

export function RecipesLibrary({ query, setQuery, openCollection, openRecipe, back, mine }: {
  query: string;
  setQuery: (v: string) => void;
  openCollection: (key: RecipeCollection) => void;
  openRecipe: (r: Recipe) => void;
  back: () => void;
  /** The athlete's OWN recipes, rendered above the curated shelves. A slot
   *  rather than props: this component knows about the curated library and
   *  should not also learn how a user recipe is saved. */
  mine?: ReactNode;
}) {
  const { t } = useLang();
  const C = (v: string) => `var(--color-${v})`;
  const rootRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  useHeroCollapse(rootRef, heroRef); // no dock at the root — collapse + snap only

  const shelves = recipeShelves(query);
  // The meta line names what the library HOLDS, so it lists every collection —
  // not just the ones that survived the current search, which would make the
  // cover twitch as you type.
  const lib = recipeLibraryCoverView(RECIPES.length, recipeShelves().map((s) => collectionTitle(s.key, t)), {
    chip: t("w.recovery.nutrition.recipesLibraryChip"),
    title: t("w.recovery.nutrition.recipes"),
    recipe: t("w.recovery.nutrition.recipeCount"),
    recipes: t("w.recovery.nutrition.recipesCount"),
  });

  return (
    <div ref={rootRef} style={{ fontFamily: "var(--font-display)", color: C("chalk") }}>
      <CoverHero
        cover={{ accent: C("lime"), glyph: lib.glyph, chip: lib.chip, duration: lib.count, title: lib.title, metaParts: lib.metaParts, stats: [], blurb: "", variant: "library" }}
        back={back}
        backLabel={t("w.recovery.nutrition.title")}
        heroRef={heroRef}
        // The scaffold's rail slot — the same one Plans uses. A hand-rolled
        // sticky bar here would re-open the drift the dock-rail change closed.
        rail={shelves.length > 0 ? <CollectionRail keys={shelves.map((s) => s.key)} /> : undefined}
      />
      <div style={{ position: "relative", margin: "16px 0 0" }}>
        <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", display: "flex", pointerEvents: "none" }}><AuroraIcon name="search" size={16} color={C("ash")} /></span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("w.recovery.nutrition.searchRecipes")}
          aria-label={t("w.recovery.nutrition.searchRecipes")}
          style={{ width: "100%", boxSizing: "border-box", padding: "12px 16px 12px 40px", background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 16, color: C("chalk"), fontFamily: "var(--font-mono)", fontSize: fs.body, outline: "none" }}
        />
      </div>
      {/* Your own recipes lead — but only at rest: while a search is running
          the screen is answering a question about the curated library, and a
          shelf that ignores the query would read as a result that matched. */}
      {!query.trim() && mine}
      {shelves.length === 0 ? (
        <p style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("ash"), padding: "16px 2px" }}>{t("w.recovery.nutrition.noRecipeMatches")}</p>
      ) : (
        shelves.map((shelf) => <RecipeShelf key={shelf.key} shelf={shelf} openCollection={openCollection} openRecipe={openRecipe} />)
      )}
    </div>
  );
}

/** The collection chips, sticking directly beneath the collapsed cover bar so
 *  they stay reachable at any scroll position. They JUMP, they don't filter —
 *  the shelves already ARE the collections, so narrowing to one would just
 *  empty the screen, which is why they are `role="anchor"` chips that can never
 *  light up (packages/core/src/dock-rail.ts). Mobile twin: the same name. */
export function CollectionRail({ keys }: { keys: RecipeCollection[] }) {
  const { t } = useLang();
  const jump = (key: RecipeCollection) => {
    const el = document.getElementById(shelfId(key));
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - COVER_BAR - RECIPE_RAIL_H, behavior: reduced ? "auto" : "smooth" });
  };
  return (
    <DockRail label={t("w.recovery.nutrition.jumpToCollection")}>
      {keys.map((k) => (
        <DockChip key={k} role="anchor" label={collectionTitle(k, t)} onClick={() => jump(k)} />
      ))}
    </DockRail>
  );
}

/** One collection = one full-bleed shelf. The head is the way IN to the
 *  collection's own screen, and it states the COUNT so a two-card peek is never
 *  mistaken for the whole shelf. */
export function RecipeShelf({ shelf, openCollection, openRecipe }: { shelf: { key: RecipeCollection; recipes: Recipe[] }; openCollection: (key: RecipeCollection) => void; openRecipe: (r: Recipe) => void }) {
  const { t } = useLang();
  const C = (v: string) => `var(--color-${v})`;
  const n = shelf.recipes.length;
  return (
    <section id={shelfId(shelf.key)} style={{ marginTop: 24, scrollMarginTop: COVER_BAR + RECIPE_RAIL_H }}>
      <button
        className="pressable"
        onClick={() => openCollection(shelf.key)}
        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, margin: "0 0 10px", padding: 0, background: "none", border: "none", cursor: "pointer", color: C("chalk"), textAlign: "left" }}
      >
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18, letterSpacing: "-.01em" }}>{collectionTitle(shelf.key, t)}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash"), whiteSpace: "nowrap" }}>
          {n} {n === 1 ? t("w.recovery.nutrition.recipeCount") : t("w.recovery.nutrition.recipesCount")} →
        </span>
      </button>
      <div style={shelfScroller}>
        {shelf.recipes.map((r) => <RecipeTile key={r.id} recipe={r} onOpen={() => openRecipe(r)} />)}
      </div>
    </section>
  );
}

/** A recipe as a COVER, not a card — the same tile the Plans shelves carry, so
 *  tapping one expands it into the same poster at screen scale. The dish emoji
 *  stays FULL COLOUR (a ghosted emoji is a grey smudge, not a dish), which is
 *  the one thing that separates a recipe tile from a goal tile. */
export function RecipeTile({ recipe, onOpen, width = "172px", snap = false }: { recipe: Recipe; onOpen: () => void; width?: string; snap?: boolean }) {
  const { t } = useLang();
  const tile = recipeTileView(recipe, {
    mins: (n) => `${n} ${t("w.recovery.nutrition.min")}`,
    kcal: (n) => `${n} kcal`,
  });
  const [pressed, setPressed] = useState(false);
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return (
    <button className="pressable"
      onClick={onOpen}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      aria-label={`${tile.title} – ${tile.meta}`}
      style={{ flex: `0 0 ${width}`, scrollSnapAlign: snap ? "center" : undefined, height: 140, position: "relative", overflow: "hidden", borderRadius: 28, border: "1px solid rgba(255,255,255,.07)", background: COVER_INK, color: "#fff", padding: 12, display: "flex", flexDirection: "column", justifyContent: "space-between", textAlign: "left", cursor: "pointer", transform: reduced ? undefined : `scale(${pressed ? 0.97 : 1})`, transition: reduced ? undefined : "transform .16s ease" }}
    >
      <span aria-hidden style={{ position: "absolute", inset: 0, background: `linear-gradient(202deg, color-mix(in srgb, ${tile.accent} 52%, ${COVER_INK}) 0%, color-mix(in srgb, ${tile.accent} 15%, ${COVER_INK}) 46%, ${COVER_INK} 100%)` }} />
      <span aria-hidden style={{ position: "absolute", top: -6, right: -8, fontSize: 88, lineHeight: 1, filter: "drop-shadow(0 12px 26px rgba(0,0,0,.5))", pointerEvents: "none" }}>{tile.glyph}</span>
      <span aria-hidden style={{ position: "absolute", inset: 0, background: `linear-gradient(0deg, ${COVER_INK} 0%, color-mix(in srgb, ${COVER_INK} 62%, transparent) 22%, transparent 66%)` }} />
      <span style={{ position: "relative", alignSelf: "flex-end", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600, letterSpacing: ".08em", color: "rgba(255,255,255,.85)" }}>{tile.count}</span>
      <span style={{ position: "relative" }}>
        <span style={{ display: "block", fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 16, lineHeight: 1.1, letterSpacing: "-.02em", color: "#fff" }}>{tile.title}</span>
        <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, color: "rgba(255,255,255,.7)", marginTop: 5 }}>{tile.meta}</span>
      </span>
    </button>
  );
}

/** The cook screen's PLATE — the recipe cover compressed into a card: the same
 *  duotone wash and full-colour dish, the meal as the chip, the dish as the
 *  title, the step counter where the cover puts its time, and one tick per step
 *  along the bottom edge. The back button is the cover's own HeroNav, so the
 *  screen no longer carries a centred title that repeats the plate's. */
export function CookPlate({ cook, onBack }: { cook: RecipeCookView; onBack: () => void }) {
  return (
    <div style={{ position: "relative", height: 150, borderRadius: 28, overflow: "hidden", background: COVER_INK, color: "#fff", margin: "2px 0 0" }}>
      <span aria-hidden style={{ position: "absolute", inset: 0, background: `linear-gradient(202deg, color-mix(in srgb, ${cook.accent} 52%, ${COVER_INK}) 0%, color-mix(in srgb, ${cook.accent} 15%, ${COVER_INK}) 46%, ${COVER_INK} 100%)` }} />
      <span aria-hidden style={{ position: "absolute", top: -14, right: -12, fontSize: 128, lineHeight: 1, filter: "drop-shadow(0 16px 34px rgba(0,0,0,.5))", pointerEvents: "none" }}>{cook.glyph}</span>
      <span aria-hidden style={{ position: "absolute", inset: 0, background: `linear-gradient(0deg, ${COVER_INK} 0%, color-mix(in srgb, ${COVER_INK} 55%, transparent) 14%, transparent 62%)` }} />
      <div style={{ position: "absolute", top: 10, left: 10, right: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <HeroNav onClick={onBack} fromLabel={cook.title} material="glass" onDark />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(255,255,255,.85)" }}>{cook.count}</span>
      </div>
      <div style={{ position: "absolute", left: 14, right: 14, bottom: 14 }}>
        <span style={{ display: "inline-block", background: "var(--color-lime)", color: "var(--on-accent)", borderRadius: 999, padding: "3px 10px", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase" }}>{cook.chip}</span>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 26, letterSpacing: "-.03em", lineHeight: 1.05, marginTop: 6, textShadow: "0 2px 18px rgba(0,0,0,.35)" }}>{cook.title}</div>
      </div>
      {/* one tick per step — the method's length, stated by the plate itself */}
      <div aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: 0, display: "flex", gap: 2 }}>
        {Array.from({ length: cook.steps }, (_, i) => (
          <span key={i} style={{ flex: 1, height: 3, background: i <= cook.index ? "var(--color-lime)" : "rgba(255,255,255,.18)" }} />
        ))}
      </div>
    </div>
  );
}

/** The COLLECTION screen — "Breakfast" with a hero of its own, the way a goal
 *  gets one in Plans. NO aggregate hem on the cover: macros averaged over a
 *  shelf say nothing, so each recipe card carries its own three numbers
 *  (recipeCardStats) where they actually differentiate one dish from the next. */
export function RecipeCollectionScreen({ collection, openRecipe, back }: { collection: RecipeCollection; openRecipe: (r: Recipe) => void; back: () => void }) {
  const { t } = useLang();
  const C = (v: string) => `var(--color-${v})`;
  const rootRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  useHeroCollapse(rootRef, heroRef);
  const list = recipesInCollection(collection);
  const cover = recipeCollectionCoverView(collection, list, {
    chip: t("w.recovery.nutrition.recipes"),
    title: collectionTitle(collection, t),
    recipe: t("w.recovery.nutrition.recipeCount"),
    recipes: t("w.recovery.nutrition.recipesCount"),
    fastest: (n) => t("w.recovery.nutrition.fromMins").replace("{n}", String(n)),
    upToProtein: (g) => t("w.recovery.nutrition.upToProtein").replace("{n}", String(g)),
  });
  const rule = `color-mix(in srgb, ${C("chalk")} 14%, transparent)`;
  return (
    <div ref={rootRef} style={{ fontFamily: "var(--font-display)", color: C("chalk") }}>
      <CoverHero cover={{ ...cover, duration: cover.count, stats: [] }} back={back} backLabel={t("w.recovery.nutrition.recipes")} heroRef={heroRef} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: space.lg, marginTop: 16 }}>
        {list.map((r) => {
          const stats = recipeCardStats(r, {
            energy: t("w.recovery.nutrition.energy"),
            protein: t("w.recovery.nutrition.protein"),
            time: t("w.recovery.nutrition.time"),
            min: t("w.recovery.nutrition.min"),
          });
          return (
            <button
              className="pressable"
              key={r.id}
              onClick={() => openRecipe(r)}
              style={{ textAlign: "left", background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "var(--shadow-card)", padding: 16, cursor: "pointer", color: C("chalk"), font: "inherit" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>{t(`w.recovery.nutrition.meal.${r.meal}`)}</span>
                {r.highProtein && <span style={{ background: `color-mix(in srgb, ${C("lime")} 14%, transparent)`, color: "var(--lime-text)", borderRadius: 999, padding: "3px 12px", fontFamily: "var(--font-mono)", fontSize: fs.micro }}>{t("w.recovery.nutrition.recipeFilter.highProtein")}</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                <span aria-hidden style={{ fontSize: 26, lineHeight: 1 }}>{r.emoji}</span>
                <span style={{ fontWeight: 800, fontSize: fs.title }}>{r.name}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, margin: "12px 0 10px" }}>
                {stats.map((s) => (
                  <div key={s.label} style={{ borderTop: `2px solid ${rule}`, paddingTop: 8 }}>
                    <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: "-.02em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                      {s.value}{s.unit && <span style={{ fontSize: 12, color: C("ash"), fontWeight: 700 }}>{s.unit}</span>}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash"), marginTop: 4 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: fs.body, lineHeight: 1.5, margin: 0 }}>{r.note}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * RECIPE DETAIL — the plan detail's cover, on a recipe.
 *
 * WHY THE SAME COVER. A plan and a recipe are the same kind of object from the
 * athlete's side: something with a shape, a cost in time, and a set of numbers,
 * that you decide to commit to and then follow step by step. They were arriving
 * through two unrelated headers — a plan through the full-bleed collapsing
 * cover, a recipe through a 240px gradient with a floating back button and a
 * centred title — for no reason other than that they were built in different
 * months. This is the plan's scaffold (cover-hero.tsx) with core's
 * recipeCoverView driving it, so the two can no longer drift.
 *
 * WHAT MOVED. The old boxed four-tile macro strip is now the cover's HEM: the
 * same rule-topped editorial columns a plan uses, straight on the ink. And the
 * METHOD now lives here, under the ingredients, instead of only inside the cook
 * flow — you could previously read a recipe end to end without ever seeing how
 * it is made, which made "Start cooking" a decision taken blind. It also gives
 * the page the length the collapsing cover needs to be worth having.
 */
export function RecipeDetail({ recipe, serves, setServes, msg, onBack, backLabel, onSaveMeal, onLog, onCook }: {
  recipe: Recipe;
  serves: number;
  setServes: React.Dispatch<React.SetStateAction<number>>;
  msg: string;
  onBack: () => void;
  /** where back goes — the collection you came through, or the library root. */
  backLabel: string;
  onSaveMeal: () => void;
  /** log ONE serving to the current meal — see logLibraryRecipe. */
  onLog: () => void;
  onCook: () => void;
}) {
  const { t } = useLang();
  const C = (v: string) => `var(--color-${v})`;
  const rootRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  useHeroCollapse(rootRef, heroRef);

  // The cover's chrome is CALLER-localized (core holds the recipe's own plain
  // text, the client holds the language) — see recipeCoverView.
  const cover = recipeCoverView(recipe, {
    meal: (m) => t(`w.recovery.nutrition.meal.${m}`),
    mins: (n) => `${n} ${t("w.recovery.nutrition.min")}`,
    serves: (n) => `${n} ${t("w.recovery.nutrition.serves")}`,
    ingredients: (n) => t("w.recovery.nutrition.ingredientsN").replace("{n}", String(n)),
    highProtein: t("w.recovery.nutrition.recipeFilter.highProtein"),
    energy: t("w.recovery.nutrition.energy"),
    protein: t("w.recovery.nutrition.protein"),
    carbs: t("w.recovery.nutrition.carbs"),
    fat: t("w.recovery.nutrition.fat"),
  });

  return (
    <div ref={rootRef} style={{ fontFamily: "var(--font-display)", color: C("chalk") }}>
      <CoverHero cover={cover} back={onBack} backLabel={backLabel} heroRef={heroRef} />

      {/* Ingredients — the stepper scales every quantity live. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "24px 0 6px" }}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18 }}>{t("w.recovery.nutrition.ingredients")}</div>
        <div style={{ display: "flex", alignItems: "center", border: `1px solid ${C("line")}`, borderRadius: 12, overflow: "hidden" }}>
          <button className="pressable" onClick={() => setServes((x) => Math.max(1, x - 1))} aria-label={t("w.recovery.nutrition.decrease")} style={{ width: 44, height: 38, background: C("ink2"), border: "none", color: "var(--lime-text)", fontSize: 20, cursor: "pointer", display: "grid", placeItems: "center" }}>–</button>
          <div style={{ width: 52, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: fs.bodyLg, fontWeight: 600, borderLeft: `1px solid ${C("line")}`, borderRight: `1px solid ${C("line")}`, lineHeight: "38px" }}>{serves}</div>
          <button className="pressable" onClick={() => setServes((x) => Math.min(12, x + 1))} aria-label={t("w.recovery.nutrition.increase")} style={{ width: 44, height: 38, background: C("ink2"), border: "none", color: "var(--lime-text)", fontSize: 20, cursor: "pointer", display: "grid", placeItems: "center" }}>+</button>
        </div>
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".08em", textTransform: "uppercase", color: C("ash"), marginBottom: 4 }}>
        {serves} {t("w.recovery.nutrition.serves")}
      </div>
      {recipe.ingredients.map((ing, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "16px 2px", borderBottom: `1px solid ${C("line")}` }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: fs.note, color: ing.optional ? C("ash") : C("chalk") }}>{ing.name}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.bodyLg, color: C("ash"), whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{formatIngredient(ing, recipe.baseServes, serves)}</span>
        </div>
      ))}

      {/* METHOD — readable before you commit, not only once you're cooking. The
          cook view is still the hands-free step-through; this is the read. */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, margin: "24px 0 2px" }}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18 }}>{t("w.recovery.nutrition.method")}</div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".08em", textTransform: "uppercase", color: C("ash") }}>
          {t("w.recovery.nutrition.stepsN").replace("{n}", String(recipe.steps.length))}
        </span>
      </div>
      <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {recipe.steps.map((s, i) => (
          <li key={i} style={{ display: "grid", gridTemplateColumns: "26px 1fr", gap: 12, padding: "16px 2px", borderTop: `1px solid ${C("line")}` }}>
            {/* The number is the STEP ORDER — method is genuinely a sequence, so
                this encodes something true rather than decorating the list. */}
            <span aria-hidden style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), lineHeight: 1.5, fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: fs.note, lineHeight: 1.55, color: C("chalk") }}>{s.text}</p>
              {s.timerSec != null && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, fontFamily: "var(--font-mono)", fontSize: fs.nano, color: "var(--amber-text)" }}>
                  <IClock size={12} color="var(--amber-text)" />
                  {Math.floor(s.timerSec / 60)}:{String(s.timerSec % 60).padStart(2, "0")}
                </span>
              )}
            </div>
          </li>
        ))}
      </ol>

      {/* The action bar is ALREADY sticky, which is why this screen needs no
          docked CTA the way the plan detail does — Start cooking never leaves. */}
      <div style={{ position: "sticky", bottom: 0, background: C("ink"), padding: "16px 0 20px", marginTop: 8 }}>
        {msg && <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: fs.caption, color: "var(--lime-text)", marginBottom: 12 }}><AuroraIcon name="check" size={13} color="var(--lime-text)" />{msg}</div>}
        {/* Two secondaries, then the primary. Saving a meal FILES the recipe in
            your library; logging a serving records that you ATE one — different
            jobs, so they read as a pair rather than one hiding behind the
            other, and neither competes with Start cooking. */}
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <button className="pressable" onClick={onSaveMeal} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, background: "transparent", color: "var(--lime-text)", border: `1px solid ${C("lime")}`, borderRadius: 999, padding: "14px 12px", cursor: "pointer", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: fs.note }}><IPlus size={14} color="var(--lime-text)" strokeWidth={2.2} />{t("w.recovery.nutrition.createMeal")}</button>
            <button className="pressable" onClick={onLog} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, background: "transparent", color: "var(--lime-text)", border: `1px solid ${C("lime")}`, borderRadius: 999, padding: "14px 12px", cursor: "pointer", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: fs.note }}><AuroraIcon name="check" size={14} color="var(--lime-text)" />{t("w.recovery.nutrition.logServing")}</button>
          </div>
          <button className="pressable" onClick={onCook} style={{ width: "100%", background: C("lime"), color: "var(--on-accent)", border: "none", borderRadius: 999, padding: 16, cursor: "pointer", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: fs.subtitle }}>{t("w.recovery.nutrition.startCooking")}</button>
        </div>
      </div>
    </div>
  );
}

// A labelled hairline divider for the compact Add-a-meal sheet.
