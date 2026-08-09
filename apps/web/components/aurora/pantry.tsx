"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  FOOD_ROLES, pantryShelves, pantryStats, roleCounts,
  type FoodRole, type PantryFood,
} from "@hybrid/core";
import { fs, CARD_PAD } from "@/lib/ui";
import { useLang } from "@/lib/i18n";
import { AuroraIcon } from "./icons";
import GroupMark from "./group-mark";
import { DockRail, DockChip } from "./dock-rail";
import { FoodRow, IClose, IPlus, Glyph } from "./nutrition-kit";

/**
 * THE PANTRY — the athlete's own saved foods, as a screen.
 *
 * What it replaced: a card with a search box, a flat newest-first column of
 * every saved food, a ⊕ and an ×. Every other tab of this app answers "here is
 * a lot of your stuff" with structure — Today's four clusters, Performance's
 * four sections — and this one answered it with a scroll.
 *
 * FOUR THINGS CHANGED, and each is a decision rather than a decoration.
 *
 * 1. SEARCH IS AN AFFORDANCE, NOT A PERMANENT BAR. A field pinned above the
 *    list spends the top of the screen on a control most visits never touch,
 *    and it was the first thing the eye hit on a screen whose subject is the
 *    list below it. It is now the head's RIGHT slot and opens a field — the
 *    same idiom Mail and Notes use — and it searches YOUR foods instantly
 *    (matchesQuery, local, no request) with the food database offered
 *    underneath for anything your library doesn't answer.
 *
 * 2. THE SHELVES ARE DERIVED. See packages/core/src/pantry.ts: a food's shelf
 *    comes from where its energy actually is, not from a keyword lexicon that
 *    would guess wrong, file the unrecognised under Other, and need writing
 *    three times for three languages.
 *
 * 3. THE ROW HAS THREE GESTURES AND THEY MEAN THREE THINGS. ⊕ logs ONE serving
 *    to the current meal immediately (the "add by tap" this screen never had),
 *    the body opens the portion editor for a quantity and the full panel, and a
 *    swipe left deletes — through the shared SwipeRow, so it is the app's one
 *    swipe rather than this screen's imitation of it.
 *
 * 4. DELETE IS UNDOABLE, AND THE UNDO IS REAL. The DELETE request is HELD for
 *    UNDO_MS rather than fired and compensated: undoing a completed delete
 *    would have to re-create the product, which mints a new id and quietly
 *    breaks every recipe ingredient that pointed at the old one. Holding the
 *    request means the row that comes back is the row that left. Anything that
 *    unmounts the screen flushes the pending delete instead of dropping it, so
 *    a delete never silently un-happens on the next load.
 *
 * The mobile twin is apps/mobile/components/aurora/pantry.tsx.
 */

const C = (v: string) => `var(--color-${v})`;

/** Each shelf's colour is the macro colour that shelf is named after — the same
 *  blue/amber/violet the rings, tiles and diary rows already spend on P/C/F. A
 *  shelf that is neither takes the chrome tones, because "mixed" and "light"
 *  are not nutrients and colouring them would invent a fifth macro. */
export const ROLE_COLOR: Record<FoodRole, string> = {
  protein: "var(--color-blue)",
  carb: "var(--color-amber)",
  fat: "var(--color-violet)",
  mixed: "var(--color-ash)",
  // Ash again rather than the hairline token: `line` on `ink2` is invisible, so
  // a pantry with four light foods drew a GAP in its own mix bar and read as a
  // rendering fault. Mixed and light share the hue at two weights because they
  // are the same claim — not a macro — at two volumes.
  light: "var(--color-ash)",
};

/** The mix bar's segment weight. Only the two non-nutrient shelves are quieted. */
export const roleOpacity = (r: FoodRole): number => (r === "light" ? 0.45 : r === "mixed" ? 0.8 : 1);

/** How long a deleted row can come back. Long enough to notice the row left
 *  and reach the control, short enough that leaving the screen is rare. */
export const UNDO_MS = 6000;

export function roleLabel(role: FoodRole, t: (k: string) => string): string {
  return t(`w.recovery.nutrition.pn.role.${role}`);
}

/** The hero: how many foods, what they mostly are, and how much of the library
 *  actually states a full label. Not a calorie total — a pantry has no
 *  calories, it is a list of things you might eat — and not a streak. */
function PantryHero({ items }: { items: readonly PantryFood[] }) {
  const { t } = useLang();
  const stats = useMemo(() => pantryStats(items), [items]);
  const counts = useMemo(() => roleCounts(items), [items]);
  const pct = Math.round(stats.completeness * 100);
  return (
    <div style={{ background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "var(--shadow-card)", padding: CARD_PAD, marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.stat, letterSpacing: "-.03em", lineHeight: 1, color: C("chalk"), fontVariantNumeric: "tabular-nums" }}>{stats.count}</span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash") }}>{t("w.recovery.nutrition.pn.savedFoods")}</span>
          {stats.lead && (
            <span style={{ display: "block", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.bodyLg, color: C("chalk"), marginTop: 3 }}>
              {t("w.recovery.nutrition.pn.mostly").replace("{v}", roleLabel(stats.lead, t).toLowerCase())}
            </span>
          )}
        </span>
      </div>

      {/* THE MIX — one bar, a segment per shelf, in the shelf's own colour. It
          is the pantry's actual shape, and it is the legend for the chips
          below: the same five colours, in the same order. */}
      <div style={{ display: "flex", gap: 2, height: 8, marginTop: 18, borderRadius: 999, overflow: "hidden" }} aria-hidden>
        {FOOD_ROLES.filter((r) => counts[r] > 0).map((r) => (
          <div key={r} style={{ flex: counts[r], background: ROLE_COLOR[r], opacity: roleOpacity(r) }} />
        ))}
      </div>

      {/* LABEL DATA — the one figure worth leading a food library with: it is a
          fact about the data, it limits what every other nutrition screen can
          say, and unlike a streak it can be fixed by hand. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C("line")}` }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash") }}>{t("w.recovery.nutrition.pn.labelData")}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: pct >= 50 ? "var(--lime-text)" : C("chalk"), fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 6, lineHeight: 1.5 }}>
        {t("w.recovery.nutrition.pn.fullyStated").replace("{n}", String(stats.complete)).replace("{m}", String(stats.count))}
      </div>
    </div>
  );
}

// Generic over the item, so the host passes its OWN row type straight in and
// the handlers still receive it whole — a FoodProduct carries a servingGrams
// and a verifiedId that the portion editor needs and that a narrowed PantryFood
// would have quietly dropped on the way through.
export function PantryScreen<T extends PantryFood>({
  items, query, onQuery, searchOpen, onSearchOpen, onLogOne, onOpen, onDelete, onCreate,
  canCreate, full, limit, msg, back, dbSlot, searchHint,
}: {
  items: T[];
  /** Shared with the food-database search, so ONE field asks both questions. */
  query: string;
  onQuery: (v: string) => void;
  /** Whether the field is open. HOISTED to the host because on mobile the
   *  control that opens it is the HERO's accessory — the shell's own top-right
   *  slot, which this component does not draw — and a screen whose search is
   *  open on one client and closed on the other is not the same screen. */
  searchOpen: boolean;
  onSearchOpen: (open: boolean) => void;
  /** ⊕ — log one serving to the current meal, now, with no sheet. */
  onLogOne: (f: T) => void;
  /** the row body — the portion editor, for a quantity and the full panel. */
  onOpen: (f: T) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
  canCreate: boolean;
  full: boolean;
  limit: number;
  /** the confirmation line (logged / saved), owned by the host. */
  msg?: string;
  back: () => void;
  /** the food-database results for the same query — the fallback for a food
   *  this athlete has never saved. Rendered under their own matches. */
  dbSlot?: ReactNode;
  searchHint?: ReactNode;
}) {
  const { t } = useLang();
  const [role, setRole] = useState<FoodRole | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => roleCounts(items), [items]);
  const shelves = useMemo(() => pantryShelves(items, { query, role }), [items, query, role]);
  const matches = shelves.reduce((n, s) => n + s.items.length, 0);
  const q = query.trim();

  const openSearch = () => { onSearchOpen(true); requestAnimationFrame(() => inputRef.current?.focus()); };
  const closeSearch = () => { onSearchOpen(false); onQuery(""); };

  const foodMeta = (f: T) =>
    `${f.servingLabel ?? ""}${f.servingLabel ? " – " : ""}${Math.round(f.kcal)} kcal – ${Math.round(f.protein)}P ${Math.round(f.carbs)}C ${Math.round(f.fat)}F`;

  return (
    <div style={{ fontFamily: "var(--font-display)", color: C("chalk") }}>
      {/* HEAD — back, title, and the search in the RIGHT slot. */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button className="pressable" onClick={back} aria-label={t("w.recovery.nutrition.back")} style={{ width: 44, height: 44, borderRadius: 16, border: `1px solid ${C("line")}`, background: "var(--back-surface)", color: C("chalk"), cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 }}><AuroraIcon name="back" size={18} color={C("chalk")} /></button>
        <h1 style={{ flex: 1, minWidth: 0, fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 26, letterSpacing: "-.03em", margin: 0 }}>{t("w.recovery.nutrition.yourProducts")}</h1>
        <button
          className="pressable"
          onClick={searchOpen ? closeSearch : openSearch}
          aria-label={searchOpen ? t("w.recovery.nutrition.clear") : t("w.recovery.nutrition.pn.searchPh")}
          aria-expanded={searchOpen}
          style={{ width: 44, height: 44, borderRadius: 16, border: `1px solid ${searchOpen ? C("lime") : C("line")}`, background: "transparent", color: C("chalk"), cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 }}
        >
          {searchOpen ? <IClose size={18} color={C("chalk")} /> : <AuroraIcon name="search" size={18} color={C("chalk")} />}
        </button>
      </div>

      {/* The field opens UNDER the head rather than inside it: a 26px title and
          an input cannot share a 44px row without one of them being cramped,
          and the control the athlete reached for is still the top-right one. */}
      {searchOpen && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "12px 16px" }}>
            <AuroraIcon name="search" size={17} color={C("ash")} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder={t("w.recovery.nutrition.pn.searchPh")}
              aria-label={t("w.recovery.nutrition.pn.searchPh")}
              style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: C("chalk"), fontFamily: "var(--font-mono)", fontSize: fs.body }}
            />
            {query ? <button className="pressable" onClick={() => onQuery("")} aria-label={t("w.recovery.nutrition.clear")} style={{ background: "none", border: "none", color: C("ash"), cursor: "pointer", fontSize: 17, lineHeight: 1 }}>×</button> : <Glyph name="scan" size={17} color={C("ash")} strokeWidth={4} />}
          </div>
          {searchHint}
        </div>
      )}

      {msg && <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: fs.caption, color: "var(--lime-text)", marginTop: 12 }}><AuroraIcon name="check" size={13} color="var(--lime-text)" />{msg}</div>}

      {items.length === 0 ? (
        /* EMPTY — not a hero of zeroes. A pantry with nothing in it has no mix
           to draw and no label completeness to report, so it says what the
           screen is for and offers the one action that matters. */
        <div style={{ marginTop: 28, textAlign: "center", padding: "0 8px" }}>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 20, color: C("chalk") }}>{t("w.recovery.nutrition.pn.emptyTitle")}</div>
          <p style={{ fontFamily: "var(--font-display)", fontSize: fs.note, color: C("ash"), lineHeight: 1.55, margin: "8px auto 0", maxWidth: 360 }}>{t("w.recovery.nutrition.yourProductsSub")}</p>
        </div>
      ) : (
        <>
          <PantryHero items={items} />

          {/* THE SHELF FILTER — mode chips, because one is always on and the
              list below changes. A shelf with nothing on it gets no chip: a
              filter that empties the screen is a filter that lied. */}
          <div style={{ marginTop: 18 }}>
            <DockRail label={t("w.recovery.nutrition.pn.shelves")}>
              <DockChip role="mode" label={`${t("w.recovery.nutrition.pn.all")} ${items.length}`} selected={role === null} onClick={() => setRole(null)} />
              {FOOD_ROLES.filter((r) => counts[r] > 0).map((r) => (
                <DockChip key={r} role="mode" label={`${roleLabel(r, t)} ${counts[r]}`} selected={role === r} onClick={() => setRole(role === r ? null : r)} />
              ))}
            </DockRail>
          </div>

          {matches === 0 ? (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 24, lineHeight: 1.6, padding: "0 2px" }}>
              {q ? t("w.recovery.nutrition.pn.noMatch").replace("{v}", q) : t("w.recovery.nutrition.pn.noneOnShelf")}
            </div>
          ) : (
            shelves.map((shelf) => (
              <div key={shelf.role}>
                {/* One shelf is not a taxonomy — when the athlete has already
                    narrowed to a role, the chip above says which, and a heading
                    repeating it would be the title twice in 60px. */}
                {/* No count on the head: the chip above already carries this
                    shelf's figure, and a bare number twice on one screen reads
                    as two different claims until you check that they agree. */}
                {role === null && <GroupMark label={roleLabel(shelf.role, t)} mt={28} />}
                <div style={{ marginTop: role === null ? 6 : 18 }}>
                  {shelf.items.map((f) => (
                    <FoodRow
                      key={f.id}
                      C={C}
                      name={f.name}
                      subname={f.subname}
                      meta={foodMeta(f)}
                      onAdd={() => onLogOne(f)}
                      onOpen={() => onOpen(f)}
                      onDelete={() => onDelete(f.id)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </>
      )}

      {/* The database is the FALLBACK, so it sits under the athlete's own
          foods: a food you already saved should never be answered by a
          stranger's version of it further up the screen. */}
      {q.length >= 2 && dbSlot}

      {canCreate ? (
        <button className="pressable" onClick={onCreate} style={{ width: "100%", marginTop: 24, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.body, background: "transparent", color: "var(--lime-text)", border: `1px solid ${C("lime")}`, borderRadius: 999, padding: 14, cursor: "pointer" }}>
          <IPlus size={15} color="var(--lime-text)" strokeWidth={2.2} />{t("w.recovery.nutrition.addManually")}
        </button>
      ) : (
        /* The cap gates the ADD, never the library: every food already saved
           stays loggable, searchable and deletable at the cap. */
        <button className="pressable" onClick={onCreate} style={{ width: "100%", marginTop: 24, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.body, background: "color-mix(in srgb, var(--premium-accent) 12%, transparent)", color: "var(--premium-accent-text)", border: "1px solid color-mix(in srgb, var(--premium-accent) 40%, transparent)", borderRadius: 999, padding: 14, cursor: "pointer" }}>
          <span aria-hidden>✦</span>{t("w.recovery.nutrition.unlockMoreProducts")}
        </button>
      )}
      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".08em", textTransform: "uppercase", color: C("ash"), textAlign: "center", marginTop: 10 }}>
        {full ? t("w.recovery.nutrition.unlimited") : `${items.length} / ${limit}`}
      </div>
    </div>
  );
}

/** The undo bar a held delete puts on screen. Chromeless and centred — it is a
 *  message with one control in it, not a card carrying a thing. */
export function UndoBar({ label, onUndo }: { label: string; onUndo: () => void }) {
  const { t } = useLang();
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 14, fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <button className="pressable" onClick={onUndo} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: fs.caption, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--lime-text)", flexShrink: 0 }}>
        {t("w.recovery.nutrition.pn.undo")}
      </button>
    </div>
  );
}
