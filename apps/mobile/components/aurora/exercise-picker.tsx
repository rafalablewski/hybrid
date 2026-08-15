import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, FlatList } from "react-native";
import {
  MOVEMENTS,
  exercisesByCategory,
  olympicSportsByCategory,
  inferBlockKind,
  exerciseProfile,
  exerciseGearLine,
  buildExerciseIndex,
  searchExerciseIndex,
  exerciseNameTaken,
  type BlockKind,
} from "@hybrid/core";
import { useExercises } from "../../lib/queries";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, space, F, tracking, PressScale as Pressable, FIXED_FONT_SCALE } from "../../lib/ui";
import { RADIUS, ASearch, AChip } from "./kit";
import Sheet from "./sheet";
import AuroraExerciseMedia from "./exercise-media";

type Palette = ReturnType<typeof useTheme>["palette"];

/** What the picker knows about one pickable movement. */
type Entry = {
  name: string;
  kind: BlockKind;
  /** Sport glyph, for catalog sports. */
  icon?: string;
  /** How many times the athlete has logged it — ranks their own lifts first. */
  count?: number;
};

/** How many search results are worth rendering. Past this the athlete should
 *  type another character, not scroll. */
const RESULT_CAP = 30;
/** Recent lifts offered on the empty state — a SHORTLIST, not a second catalog. */
const RECENT_CAP = 6;

const kindColor = (k: BlockKind, C: Palette) => (k === "strength" ? C.lime : k === "cardio" ? C.blue : C.violet);

/** The lift's SHAPE, read from the exercise DB — the row's right-side mono hint,
 *  so an athlete knows what the set grid will ask for before adding. Plain
 *  weight × reps is the default and says nothing. */
function shapeHint(name: string, kind: BlockKind): string {
  if (kind !== "strength") return "";
  const sp = exerciseProfile(name).strength;
  if (!sp) return "";
  if (sp.measure === "time") return "secs";
  if (sp.measure === "distance") return "m";
  if (sp.loadMode === "bodyweight") return "BW";
  if (sp.loadMode === "bodyweight-plus") return "BW+";
  if (sp.loadMode === "assisted") return "assist";
  return "";
}

/**
 * THE EXERCISE PICKER (Builder + live logger) — a SEARCH surface, not a catalog
 * to browse. Rewritten because adding one movement was the slowest thing in the
 * app, and slow in three independent ways at once:
 *
 *  1. THE SHEET OPENED ON A WALL. The field was not focused, so the first move
 *     was a tap, and behind it sat either a 25-tile muscle grid or — one tap
 *     away — an A–Z index that mounted all ~310 rows, each with its own drawn
 *     mark, in a single non-virtualized ScrollView commit.
 *  2. EVERY KEYSTROKE RE-RAN EVERYTHING. The filter was rebuilt outside a memo,
 *     up to 60 rows were re-created as raw elements (no component identity, so
 *     nothing could bail out), and a spring LayoutAnimation was queued before
 *     each character's setState. Typing "deadlift" queued eight of them.
 *  3. THE ANSWER WAS NOT AT THE TOP. `name.includes(q)` in catalog order gave
 *     eleven deadlifts with the plain barbell Deadlift somewhere in the middle,
 *     and no help at all for "db bench", "rdl", "pullups" or a typo.
 *
 * What replaces it:
 *
 *  - The field is FOCUSED ON OPEN. The keyboard is up before the sheet has
 *    finished arriving, so the first thing the athlete can do is type.
 *  - Ranking lives in @hybrid/core `exercise-search` — scored, token-order-free,
 *    nickname- and alias-aware, typo-tolerant, and weighted by what the athlete
 *    actually logs. ~0.2ms per query over the whole catalog, so results move
 *    with the finger and there is no debounce to feel.
 *  - One virtualized FlatList, memoized rows, no layout animation on input.
 *  - Rows carry the GEAR and the muscle group under the name, which is what
 *    tells eleven deadlifts apart without reading eleven names.
 *  - The return key adds the top result. It used to create a custom exercise
 *    from the raw text, so hitting return on "deadlift" logged a second,
 *    lowercase lift beside the catalog's Deadlift.
 *
 * The A–Z index is gone (retired in capabilities: exercise-picker-az-index). It
 * existed because search could not find things; an alphabetical wall of 310 rows
 * is a worse answer to "where is my lift" than typing three letters, and it was
 * the single heaviest frame in the flow. Browsing by muscle group remains, for
 * the other question — "what should I do for chest today".
 */
export default function ExercisePickerSheet({ visible, onClose, onPick, title, recent }: {
  visible: boolean;
  onClose: () => void;
  onPick: (name: string, kind: BlockKind) => void;
  title: string;
  /** The athlete's own movements (the live logger's history), most recent first. */
  recent?: Entry[];
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const { catalog, aliases, aliasMap, categoryByName } = useExercises();
  const [query, setQuery] = useState("");
  const [room, setRoom] = useState<string | null>(null);

  // A fresh open always lands clean: empty field, no room, keyboard up.
  useEffect(() => {
    if (visible) { setQuery(""); setRoom(null); }
  }, [visible]);

  /** The muscle-group / pattern rooms, and the sport rooms after them. */
  const rooms = useMemo(() => {
    const ex = exercisesByCategory(MOVEMENTS, catalog, categoryByName)
      .map((g) => ({ ...g, names: g.names.filter((n) => !aliases.has(n)) }))
      .filter((g) => g.names.length > 0)
      .map((g) => ({
        key: g.category,
        label: g.labelKey ? t(g.labelKey) : g.label ?? g.category,
        entries: g.names.map((n): Entry => ({ name: n, kind: inferBlockKind(n) })),
      }));
    const sports = olympicSportsByCategory().map((g) => ({
      key: `sport:${g.category}`,
      label: g.category,
      entries: g.sports.map((s): Entry => ({ name: s.name, kind: "cardio" as BlockKind, icon: s.icon })),
    }));
    return [...ex, ...sports];
  }, [catalog, categoryByName, aliases, t]);

  // `recent` is a fresh array on every parent render, so its IDENTITY is
  // useless as a dependency — one keystroke in the logger would otherwise
  // rebuild the search index. Its CONTENT is what matters.
  const recentKey = (recent ?? []).map((r) => `${r.name}:${r.count ?? 0}`).join("|");

  /** Every pickable movement, deduped — the search pool and the room source. */
  const byName = useMemo(() => {
    const out = new Map<string, Entry>();
    for (const r of rooms) for (const e of r.entries) if (!out.has(e.name)) out.set(e.name, e);
    // A previously logged CUSTOM movement lives only in `recent`. It must be
    // findable, or typing its own name is a dead end that offers to create it a
    // second time.
    for (const e of recent ?? []) {
      const known = out.get(e.name);
      // Copied, never mutated in place — `rooms` is memoized and its entries
      // outlive this pass.
      out.set(e.name, known ? { ...known, count: e.count } : e);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms, recentKey]);

  const names = useMemo(() => [...byName.keys()], [byName]);

  // Normalizing ~310 names is the expensive half of searching, so it happens
  // ONCE per catalog rather than once per keystroke.
  const index = useMemo(() => buildExerciseIndex(names, aliasMap), [names, aliasMap]);
  const uses = useMemo(() => {
    const out: Record<string, number> = {};
    for (const e of byName.values()) if (e.count) out[e.name] = e.count;
    return out;
  }, [byName]);

  const q = query.trim();
  const results = useMemo(
    () =>
      q
        ? searchExerciseIndex(index, q, { limit: RESULT_CAP, uses })
            .map((h) => byName.get(h.name))
            .filter((e): e is Entry => !!e)
        : [],
    [q, index, uses, byName],
  );

  const roomData = room ? rooms.find((r) => r.key === room) : null;
  const recentTop = useMemo(
    () => (recent ?? []).slice(0, RECENT_CAP),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recentKey],
  );
  // Offer a custom add only for a name the catalog genuinely lacks — otherwise
  // one athlete's log ends up holding "deadlift" AND "Deadlift".
  const canAddCustom = useMemo(() => !!q && !exerciseNameTaken(names, q, aliases), [q, names, aliases]);

  // A stable handler so every memoized row keeps its identity across keystrokes.
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const pick = useCallback((name: string, kind: BlockKind) => pickRef.current(name, kind), []);
  const close = () => { setQuery(""); setRoom(null); onClose(); };

  /** Return adds the best match — never a stray custom spelling of a real lift. */
  const submit = () => {
    const best = results[0];
    if (best) pick(best.name, best.kind);
    else if (canAddCustom) pick(q, inferBlockKind(q));
  };

  const rows = q ? results : roomData ? roomData.entries : recentTop;
  const listKey = q ? "q" : room ?? "home";

  const renderItem = useCallback(
    ({ item }: { item: Entry }) => <Row entry={item} onPick={pick} />,
    [pick],
  );

  return (
    <Sheet visible={visible} onClose={close} title={title} scroll={false} fill>
      <ASearch
        value={query}
        onChange={setQuery}
        placeholder={t("w.train.picker.searchPh")}
        // The whole point: the keyboard is up before the sheet has landed, so
        // the first action is typing rather than a tap on the field.
        autoFocus
        onSubmit={submit}
      />

      <View style={{ flex: 1 }}>
        <FlatList
          // Re-keyed per view so a room switch starts at the top rather than
          // holding the previous list's scroll offset.
          key={listKey}
          data={rows}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          windowSize={7}
          removeClippedSubviews
          // No trailing pad here: the Sheet's panel owns the one pad under the
          // last row (core: sheetPadBottom), and a second one is a dead band.
          ListHeaderComponent={
            q ? null : roomData ? (
              <>
                <Pressable onPress={() => setRoom(null)} hitSlop={8} style={{ paddingVertical: 8 }} accessibilityRole="button">
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>← {t("w.train.picker.all")}</Text>
                </Pressable>
                <Head label={roomData.label} count={roomData.entries.length} />
              </>
            ) : recentTop.length > 0 ? (
              <Head label={t("workout.yourLifts")} count={recentTop.length} />
            ) : null
          }
          ListEmptyComponent={
            q && !canAddCustom ? (
              <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.ash, paddingVertical: 20 }}>
                {t("w.train.picker.noMatch")}
              </Text>
            ) : null
          }
          ListFooterComponent={
            <>
              {canAddCustom && (
                <Pressable
                  onPress={() => pick(q, inferBlockKind(q))}
                  accessibilityRole="button"
                  style={{ marginTop: 16, borderRadius: RADIUS.pill, backgroundColor: C.lime, paddingVertical: 12, alignItems: "center" }}
                >
                  <Text style={{ fontFamily: F.black, fontSize: fs.bodyLg, color: C.onAccent }}>＋ “{q}”</Text>
                </Pressable>
              )}
              {/* BROWSE — only on the empty state, and only as a wrapped row of
                  the shared AChip. This used to be a 2-col grid of 25 tiles,
                  each drawing a lit body from its own exercise list: a lot of
                  work for a grid that sits behind the keyboard, and five of
                  those chips were under the 44dp target besides. */}
              {!q && !roomData && (
                <View style={{ marginTop: recentTop.length ? 24 : 4 }}>
                  <Head label={t("w.train.picker.browse")} count={rooms.length} />
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                    {rooms.map((r) => (
                      <AChip key={r.key} label={r.label} count={r.entries.length} onPress={() => setRoom(r.key)} />
                    ))}
                  </View>
                </View>
              )}
            </>
          }
        />
      </View>
    </Sheet>
  );
}

const keyExtractor = (e: Entry) => e.name;

/** A section label — display face left, its figure right (the Explore
 *  SectionHead grammar; never a marker on the left). */
function Head({ label, count }: { label: string; count: number }) {
  const { palette: C } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 8, marginBottom: 8 }}>
      <Text accessibilityRole="header" style={{ fontFamily: F.black, fontSize: 18, letterSpacing: -0.3, color: C.chalk }}>{label}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: tracking.label, color: C.ash }}>{count}</Text>
    </View>
  );
}

/**
 * ONE result row. A real memoized component, not a render helper: the previous
 * file used a plain function *because* a component declared inside render gets a
 * fresh identity every pass and remounts every visible row per keystroke. The
 * fix for that is a component declared OUTSIDE render, which additionally lets
 * React skip the rows whose props did not change — a raw helper can never do
 * that, so every keystroke rebuilt all sixty.
 *
 * The GEAR line under the name is what makes a long result list scannable: the
 * eleven deadlifts differ by implement and muscle group, not by their names.
 */
const Row = memo(function Row({ entry, onPick }: { entry: Entry; onPick: (name: string, kind: BlockKind) => void }) {
  const { palette: C } = useTheme();
  const tint = txt(C, kindColor(entry.kind, C));
  const hint = shapeHint(entry.name, entry.kind);
  const gear = exerciseGearLine(entry.name);
  return (
    <Pressable
      onPress={() => onPick(entry.name, entry.kind)}
      accessibilityRole="button"
      accessibilityLabel={gear ? `${entry.name}, ${gear}` : entry.name}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}
    >
      {/* The tile carries the lift's DRAWN demo once it exists, and until then
          its IMPLEMENT (core: exercise-marks). Sports keep their glyph. */}
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {entry.icon
          ? <Text style={{ fontSize: 17 }}>{entry.icon}</Text>
          : <AuroraExerciseMedia name={entry.name} variant="thumb" size={24} tint={tint} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.semi, fontSize: fs.bodyLg, color: C.chalk }}>{entry.name}</Text>
        {!!gear && (
          <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, color: C.ash, marginTop: 2 }}>{gear}</Text>
        )}
      </View>
      {!!hint && <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }}>{hint}</Text>}
    </Pressable>
  );
});
