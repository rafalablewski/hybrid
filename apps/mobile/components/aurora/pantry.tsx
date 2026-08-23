import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, View, Text, TextInput } from "react-native";
import {
  FOOD_ROLES, pantryShelves, pantryStats, roleCounts,
  type FoodRole, type PantryFood,
  ALPHA,
} from "@hybrid/core";
import { F, PressScale as Pressable, fs, leading, trackFigure, tracking, ty} from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { useReducedMotion } from "../../lib/use-reduced-motion";
import { useLang } from "../../lib/i18n";
import { AuroraIcon, Glyph } from "./icons";
import { ACard, APill, DockRail, DockChip, GUTTER , RADIUS} from "./kit";
import GroupMark from "./group-mark";
import { FoodRow, savedFoodMenu, packMenu, type RowPortion } from "./nutrition-kit";
import { withAlpha } from "./field";

/**
 * THE PANTRY (mobile) — the athlete's own saved foods, as a screen.
 *
 * FOUR DECISIONS MADE THIS SCREEN: search moved into the head's right slot (
 * the HERO's `accessory` — the shell's own top-right control, which is why the
 * open/closed state is the host's and not this component's), the shelves are
 * DERIVED from where each food's energy actually is rather than guessed from a
 * keyword lexicon that would need writing three times for three languages, the
 * row's ⊕ logs one serving on the spot while its body opens the portion editor
 * and a swipe left deletes, and the delete is HELD rather than fired-and-
 * compensated so Undo brings back the row that left instead of a new row with
 * a new id that every recipe ingredient has stopped pointing at.
 */

/** Each shelf's colour is the macro colour that shelf is named after — the same
 *  blue/amber/red the rings and tiles already spend on P/C/F. A shelf that is
 *  neither takes the chrome tones: "mixed" and "light" are not nutrients, and
 *  colouring them would invent a fifth macro. */
export function roleColor(C: ReturnType<typeof useTheme>["palette"]): Record<FoodRole, string> {
  // Light is ash, not the hairline token: `line` on `ink2` is invisible, so a
  // pantry with four light foods drew a GAP in its own mix bar and read as a
  // rendering fault. Mixed and light share the hue at two weights because they
  // are the same claim — not a macro — at two volumes.
  return { protein: C.blue, carb: C.amber, fat: C.red, mixed: C.ash, light: C.ash };
}

/** The mix bar's segment weight. Only the two non-nutrient shelves are quieted. */
export const roleOpacity = (r: FoodRole): number => (r === "light" ? 0.45 : r === "mixed" ? 0.8 : 1);

/** How long a deleted row can come back. Long enough to notice the row left and
 *  reach the control, short enough that leaving the screen is rare. */
export const UNDO_MS = 6000;

export function roleLabel(role: FoodRole, t: (k: string) => string): string {
  return t(`w.recovery.nutrition.pn.role.${role}`);
}

/** The hero: how many foods, what they mostly are, and how much of the library
 *  actually states a full label. Not a calorie total — a pantry has no calories,
 *  it is a list of things you might eat — and not a streak. */
function PantryHero({ items }: { items: readonly PantryFood[] }) {
  const { t } = useLang();
  const C = useTheme().palette;
  const RC = roleColor(C);
  const stats = useMemo(() => pantryStats(items), [items]);
  const counts = useMemo(() => roleCounts(items), [items]);
  const pct = Math.round(stats.completeness * 100);
  return (
    /* ACard. Nothing here was ever this card's own — the radius was the
       literal 28 that RADIUS.card holds and the pad was CARD_PAD already, so
       the whole box was the kit spelled out. Only the leading gap is passed. */
    <ACard style={{ marginTop: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 12 }}>
        <Text style={{ fontFamily: F.takeover, fontSize: fs.stat, letterSpacing: trackFigure(fs.stat), lineHeight: leading(fs.stat, "flush"), color: C.chalk }}>{stats.count}</Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={ty(C, "overline")}>{t("w.recovery.nutrition.pn.savedFoods")}</Text>
          {stats.lead ? (
            <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk, marginTop: 3 }}>
              {t("w.recovery.nutrition.pn.mostly").replace("{v}", roleLabel(stats.lead, t).toLowerCase())}
            </Text>
          ) : null}
        </View>
      </View>

      {/* THE MIX — one bar, a segment per shelf, in the shelf's own colour. It
          is the pantry's actual shape, and it is the legend for the chips
          below: the same five colours, in the same order. */}
      <View style={{ flexDirection: "row", gap: 2, height: 8, marginTop: 18, borderRadius: RADIUS.pill, overflow: "hidden" }}>
        {FOOD_ROLES.filter((r) => counts[r] > 0).map((r) => (
          <View key={r} style={{ flex: counts[r], backgroundColor: RC[r], opacity: roleOpacity(r) }} />
        ))}
      </View>

      {/* LABEL DATA — the one figure worth leading a food library with: it is a
          fact about the data, it limits what every other nutrition screen can
          say, and unlike a streak it can be fixed by hand. */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: C.line }}>
        <Text style={ty(C, "overline")}>{t("w.recovery.nutrition.pn.labelData")}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: pct >= 50 ? txt(C, C.lime) : C.chalk }}>{pct}%</Text>
      </View>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 6, lineHeight: leading(fs.nano, "snug") }}>
        {t("w.recovery.nutrition.pn.fullyStated").replace("{n}", String(stats.complete)).replace("{m}", String(stats.count))}
      </Text>
    </ACard>
  );
}

/** The control the HERO's accessory slot renders — the search, top right. It
 *  lives here rather than in the host so the two clients draw the same button
 *  from the same state, even though only one of them draws its own head. */
export function PantrySearchToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { t } = useLang();
  const C = useTheme().palette;
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={open ? t("w.recovery.nutrition.clear") : t("w.recovery.nutrition.pn.searchPh")}
      hitSlop={8}
      style={{ width: 44, height: 44, borderRadius: RADIUS.field, borderWidth: 1, borderColor: open ? C.lime : C.line, alignItems: "center", justifyContent: "center" }}
    >
      {open ? <Glyph name="close" size={18} color={C.chalk} /> : <AuroraIcon name="search" size={18} color={C.chalk} />}
    </Pressable>
  );
}

export function PantryScreen<T extends PantryFood>({
  items, query, onQuery, searchOpen, onSearchOpen, onLogOne, onOpen, onDelete, onEdit,
  onCreate, canCreate, full, limit, msg, dbSlot, searchHint, premium, usualFor,
  portionsFor, onLogPortion, onRemovePortion,
}: {
  items: T[];
  /** Shared with the food-database search, so ONE field asks both questions. */
  query: string;
  onQuery: (v: string) => void;
  /** Open/closed is the HOST's, because the control that opens it is the hero's
   *  accessory — a slot this component does not draw. Web parity: same props. */
  searchOpen: boolean;
  onSearchOpen: (open: boolean) => void;
  /** ⊕ — log this food to the current meal, now, with no sheet: the athlete's
   *  USUAL amount when they have one, otherwise one serving. */
  onLogOne: (f: T) => void;
  /** what this athlete usually logs for a food, learned from their own diary
   *  (core usualAmounts). The row says it, because ⊕ acts on it — a tap that
   *  logged 35 g while the row read "100 g" would be the screen and the button
   *  disagreeing. */
  usualFor?: (f: T) => { amount: number; unit: string } | null;
  /** the row body — the portion editor, for a quantity and the full panel. */
  onOpen: (f: T) => void;
  onDelete: (id: string) => void;
  /** HOLD THE ROW → Edit. The form used to be reachable only from the bottom of
   *  the portion sheet, which meant opening the food to log it in order to say
   *  that its numbers were wrong. */
  onEdit: (f: T) => void;
  /** THE PACKS THIS FOOD COMES IN, as one-tap amounts on the row. Empty for a
   *  food with none, which is most of them — a row grows chips only when the
   *  athlete (or the catalog, or a scan) recorded a container. */
  portionsFor?: (f: T) => RowPortion[];
  onLogPortion?: (f: T, unitId: string) => void;
  /** hold a pack → remove it. The other half of remembering one. */
  onRemovePortion?: (f: T, unitId: string) => void;
  onCreate: () => void;
  canCreate: boolean;
  full: boolean;
  limit: number;
  msg?: string;
  /** the food-database results for the same query — the fallback for a food
   *  this athlete has never saved. Rendered under their own matches. */
  dbSlot?: ReactNode;
  searchHint?: ReactNode;
  premium?: { fill: string; text: string };
}) {
  const { t } = useLang();
  const C = useTheme().palette;
  const [role, setRole] = useState<FoodRole | null>(null);
  const inputRef = useRef<TextInput>(null);

  const counts = useMemo(() => roleCounts(items), [items]);
  const shelves = useMemo(() => pantryShelves(items, { query, role }), [items, query, role]);
  const matches = shelves.reduce((n, s) => n + s.items.length, 0);
  const q = query.trim();
  const menu = savedFoodMenu(t);
  const packRows = packMenu(t);

  const foodMeta = (f: T) => {
    const usual = usualFor?.(f);
    const head = usual
      ? t("w.recovery.nutrition.pt.usually").replace("{v}", `${usual.amount} ${usual.unit}`)
      : f.servingLabel ?? "";
    return `${head}${head ? " – " : ""}${Math.round(f.kcal)} kcal – ${Math.round(f.protein)}P ${Math.round(f.carbs)}C ${Math.round(f.fat)}F`;
  };

  return (
    <View>
      {/* The field opens UNDER the hero rather than inside its rail: the rail's
          accessory is a 44dp control slot, not a text field, and the control
          the athlete reached for is still the top-right one. */}
      {searchOpen ? (
        <View style={{ marginTop: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 16, paddingVertical: 12 }}>
            <AuroraIcon name="search" size={17} color={C.ash} />
            <TextInput
              ref={inputRef}
              autoFocus
              value={query}
              onChangeText={onQuery}
              placeholder={t("w.recovery.nutrition.pn.searchPh")}
              placeholderTextColor={C.ash}
              accessibilityLabel={t("w.recovery.nutrition.pn.searchPh")}
              autoCorrect={false}
              style={{ flex: 1, fontFamily: F.mono, fontSize: fs.body, color: C.chalk, padding: 0 }}
            />
            {query ? (
              <Pressable onPress={() => onQuery("")} accessibilityLabel={t("w.recovery.nutrition.clear")} hitSlop={8}><Text style={{ fontFamily: F.mono, fontSize: fs.subtitle, color: C.ash }}>×</Text></Pressable>
            ) : <Glyph name="scan" size={17} color={C.ash} />}
          </View>
          {searchHint}
        </View>
      ) : null}

      {msg ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 }}>
          <AuroraIcon name="check" size={13} color={txt(C, C.lime)} />
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>{msg}</Text>
        </View>
      ) : null}

      {items.length === 0 ? (
        /* EMPTY — not a hero of zeroes. A pantry with nothing in it has no mix
           to draw and no label completeness to report, so it says what the
           screen is for and offers the one action that matters. */
        <View style={{ marginTop: 28, alignItems: "center", paddingHorizontal: 8 }}>
          <Text style={{ fontFamily: F.black, fontSize: fs.headline, color: C.chalk, textAlign: "center" }}>{t("w.recovery.nutrition.pn.emptyTitle")}</Text>
          <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash, lineHeight: leading(fs.bodyLg, "relaxed"), textAlign: "center", marginTop: 8, maxWidth: 360 }}>{t("w.recovery.nutrition.yourProductsSub")}</Text>
        </View>
      ) : (
        <>
          <PantryHero items={items} />

          {/* THE SHELF FILTER — mode chips, because one is always on and the
              list below changes. A shelf with nothing on it gets no chip: a
              filter that empties the screen is a filter that lied. FULL-BLEED
              like every screen-level rail, so a chip slides under the true
              screen edge instead of clipping at the content column. */}
          <View style={{ marginTop: 18, marginHorizontal: -GUTTER }}>
            <DockRail label={t("w.recovery.nutrition.pn.shelves")}>
              <DockChip role="mode" label={`${t("w.recovery.nutrition.pn.all")} ${items.length}`} selected={role === null} onPress={() => setRole(null)} />
              {FOOD_ROLES.filter((r) => counts[r] > 0).map((r) => (
                <DockChip key={r} role="mode" label={`${roleLabel(r, t)} ${counts[r]}`} selected={role === r} onPress={() => setRole(role === r ? null : r)} />
              ))}
            </DockRail>
          </View>

          {matches === 0 ? (
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 24, marginHorizontal: 2, lineHeight: leading(fs.caption, "relaxed") }}>
              {q ? t("w.recovery.nutrition.pn.noMatch").replace("{v}", q) : t("w.recovery.nutrition.pn.noneOnShelf")}
            </Text>
          ) : (
            shelves.map((shelf) => (
              <View key={shelf.role}>
                {/* One shelf is not a taxonomy — when the athlete has already
                    narrowed to a role, the chip above says which, and a heading
                    repeating it would be the title twice in 60dp. */}
                {/* No count on the head: the chip above already carries this
                    shelf's figure, and a bare number twice on one screen reads
                    as two different claims until you check that they agree. */}
                {role === null ? <GroupMark label={roleLabel(shelf.role, t)} mt={28} /> : null}
                <View style={{ marginTop: role === null ? 6 : 18 }}>
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
                      menu={menu}
                      onMenu={(key) => (key === "edit" ? onEdit(f) : onDelete(f.id))}
                      portions={portionsFor?.(f)}
                      onLogPortion={onLogPortion ? (unitId) => onLogPortion(f, unitId) : undefined}
                      portionMenu={onRemovePortion ? packRows : undefined}
                      onPortionMenu={onRemovePortion ? (unitId) => onRemovePortion(f, unitId) : undefined}
                    />
                  ))}
                </View>
              </View>
            ))
          )}
        </>
      )}

      {/* THE GESTURE, SAID ONCE. A hold is only discoverable because the phone
          trained the reflex, and that reflex is worth one quiet line the first
          time somebody stands in front of their own food library — the swipe
          this screen has always had was never told to anybody at all. Once, at
          the end of the list, in the meta voice; not on every row, and not in
          the picker, which shows the same foods a tab away. */}
      {matches > 0 ? (
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 16, marginHorizontal: 2, lineHeight: leading(fs.nano) }}>
          {t("w.recovery.nutrition.hold.hint")}
        </Text>
      ) : null}

      {/* The database is the FALLBACK, so it sits under the athlete's own
          foods: a food you already saved should never be answered by a
          stranger's version of it further up the screen. */}
      {q.length >= 2 ? dbSlot : null}

      {canCreate ? (
        <APill
          label={t("w.recovery.nutrition.addManually")}
          variant="outline"
          color={C.lime}
          glyph={(c) => <Glyph name="plus" size={15} color={c} />}
          onPress={onCreate}
          style={{ marginTop: 24 }}
        />
      ) : (
        /* The cap gates the ADD, never the library: every food already saved
           stays loggable, searchable and deletable at the cap. */
        <Pressable onPress={onCreate} accessibilityRole="button" style={{ marginTop: 24, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, backgroundColor: withAlpha(premium?.fill ?? C.lime, ALPHA.fill), borderWidth: 1, borderColor: withAlpha(premium?.fill ?? C.lime, ALPHA.rim), borderRadius: RADIUS.pill, paddingVertical: 14 }}>
          <Text style={{ color: premium?.text ?? txt(C, C.lime) }}>✦</Text>
          <Text style={{ fontFamily: F.monoBold, fontSize: fs.body, color: premium?.text ?? txt(C, C.lime) }}>{t("w.recovery.nutrition.unlockMoreProducts")}</Text>
        </Pressable>
      )}
      <Text style={{ ...ty(C, "kicker"), textAlign: "center", marginTop: 10  }}>
        {full ? t("w.recovery.nutrition.unlimited") : `${items.length} / ${limit}`}
      </Text>
    </View>
  );
}

/**
 * The undo bar a held delete puts on screen. Chromeless and centred — it is a
 * message with one control in it, not a card carrying a thing.
 *
 * AND IT SHOWS ITS OWN WINDOW. The delete is HELD for `UNDO_MS` and then it is
 * final, which is a real deadline the athlete was never told about: the bar sat
 * there looking permanent and then vanished, and whether Undo was still there
 * was a guess. A hairline drains under it in exactly that time — the only
 * honest way to draw a countdown is to have it actually be the countdown.
 *
 * It is the ONE animation here. The bar itself arrives on the list's own commit
 * (lib/list-motion, called by the screen that mounts it), so this component
 * animates the thing only it knows: how much time is left.
 *
 * Under Reduce Motion the hairline does not travel — it is simply absent. A
 * draining bar IS motion, with nothing to substitute: a static half-full bar
 * would state a fraction that stops being true a moment later, which is worse
 * than not drawing it. The label and the control are unchanged, so nothing that
 * carries meaning is lost.
 */
export function UndoToast({ label, onUndo }: { label: string; onUndo: () => void }) {
  const { t } = useLang();
  const C = useTheme().palette;
  const reduced = useReducedMotion();
  const drain = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduced) return;
    drain.setValue(1);
    // Linear, deliberately: this is a clock, and a clock that eases is lying
    // about how much time is left in the middle of its own run.
    const run = Animated.timing(drain, { toValue: 0, duration: UNDO_MS, easing: Easing.linear, useNativeDriver: false });
    run.start();
    return () => run.stop();
  }, [drain, reduced, label]);

  return (
    <View style={{ marginTop: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14 }}>
        <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, flexShrink: 1 }}>{label}</Text>
        <Pressable onPress={onUndo} hitSlop={8}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, letterSpacing: tracking(fs.caption, "label"), textTransform: "uppercase", color: txt(C, C.lime) }}>{t("w.recovery.nutrition.pn.undo")}</Text>
        </Pressable>
      </View>
      {reduced ? null : (
        <View style={{ height: 1, backgroundColor: C.line, marginTop: 8, borderRadius: RADIUS.mark, overflow: "hidden" }}>
          <Animated.View
            style={{
              height: 1,
              backgroundColor: withAlpha(C.lime, ALPHA.rim),
              width: drain.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
            }}
          />
        </View>
      )}
    </View>
  );
}
