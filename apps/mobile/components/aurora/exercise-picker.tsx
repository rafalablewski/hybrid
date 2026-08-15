import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, ScrollView } from "react-native";
import {
  MOVEMENTS,
  exercisesByCategory,
  olympicSportsByCategory,
  inferBlockKind,
  exerciseProfile,
  roomBodyMark,
  type BlockKind,
} from "@hybrid/core";
import { useExercises } from "../../lib/queries";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, space, F, tracking, PressScale as Pressable, FIXED_FONT_SCALE } from "../../lib/ui";
import { RADIUS, AMarkTile } from "./kit";
import { AuroraIcon } from "./icons";
import Sheet from "./sheet";
import { AuroraExerciseAvatar } from "./exercise-media";
import AuroraBodyMark from "./body-mark";
import { useListMotion } from "../../lib/list-motion";

type Palette = ReturnType<typeof useTheme>["palette"];
type Entry = { name: string; kind: BlockKind; icon?: string };

const kindColor = (k: BlockKind, C: Palette) => (k === "strength" ? C.lime : k === "cardio" ? C.blue : C.violet);
const initials = (name: string) =>
  name.split(/[\s-]+/).filter(Boolean).map((w) => w[0]!).join("").slice(0, 2).toUpperCase();

/** The lift's SHAPE, read from the exercise DB — shown as the row's right-side
 *  mono hint so an athlete knows what the set grid will ask for before adding. */
function shapeHint(e: Entry): string {
  if (e.kind !== "strength") return "";
  const sp = exerciseProfile(e.name).strength;
  if (!sp) return "";
  if (sp.measure === "time") return "secs";
  if (sp.measure === "distance") return "m";
  if (sp.loadMode === "bodyweight") return "BW";
  if (sp.loadMode === "bodyweight-plus") return "BW+";
  if (sp.loadMode === "assisted") return "assist";
  return "";
}

/**
 * The ONE exercise picker sheet (Builder + live logger) — "Rooms, then Things"
 * with an A–Z index, a view the athlete can switch:
 *  - GROUPS (default): a grid of muscle "rooms" (each a tile drawing the BODY
 *    that room trains, with its muscles lit, plus the name and movement count);
 *    tapping a room shows just its movements. Two taps, never a 200-item scroll.
 *  - A–Z: the typeset index — every movement under display-face letter heads,
 *    with a right-edge letter rail for one-thumb jumps.
 * Rows share the More → Exercises anatomy (40px IMPLEMENT-MARK tile tinted by
 * modality — a barbell, a pair of bells, a cable handle; sports keep their
 * glyph; shape hints on the right) — the old 8px-dot list, the mono-uppercase
 * category kickers and the meaningless two-letter initials are all retired. Search cuts
 * across every room; an unknown name is always offered as a custom add.
 * Twin of the web workout-blocks ExercisePicker.
 */
export default function ExercisePickerSheet({ visible, onClose, onPick, title, recent }: {
  visible: boolean;
  onClose: () => void;
  onPick: (name: string, kind: BlockKind) => void;
  title: string;
  /** Optional "Your lifts" shortcuts (the live logger's recent movements). */
  recent?: Entry[];
}) {
  // Survivors of a filter MOVE to their new positions; only arrivals fade.
  const refilter = useListMotion();
  const { palette: C } = useTheme();
  const { t } = useLang();
  const { catalog, aliases, categoryByName } = useExercises();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"groups" | "az">("groups");
  const [room, setRoom] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const letterY = useRef<Record<string, number>>({});

  // A fresh open always lands on the rooms grid with a clean query.
  useEffect(() => {
    if (visible) { setQuery(""); setRoom(null); }
  }, [visible]);

  const rooms = useMemo(() => {
    const ex = exercisesByCategory(MOVEMENTS, catalog, categoryByName)
      .map((g) => ({ ...g, names: g.names.filter((n) => !aliases.has(n)) }))
      .filter((g) => g.names.length > 0)
      .map((g) => ({
        key: g.category,
        label: g.labelKey ? t(g.labelKey) : g.label ?? g.category,
        entries: g.names.map((n): Entry => ({ name: n, kind: inferBlockKind(n) })),
        icon: undefined as string | undefined,
      }));
    const sports = olympicSportsByCategory().map((g) => ({
      key: `sport:${g.category}`,
      label: g.category,
      entries: g.sports.map((s): Entry => ({ name: s.name, kind: "cardio", icon: s.icon })),
      icon: g.sports[0]?.icon,
    }));
    return [...ex, ...sports];
  }, [catalog, categoryByName, aliases, t]);

  const all = useMemo(() => {
    const seen = new Set<string>();
    const out: Entry[] = [];
    for (const r of rooms) for (const e of r.entries) if (!seen.has(e.name)) { seen.add(e.name); out.push(e); }
    return out;
  }, [rooms]);

  const q = query.trim().toLowerCase();
  // Search covers the catalog PLUS the athlete's recent lifts — a previously
  // logged CUSTOM movement lives only in `recent`, and it must both surface in
  // results and count as `exact` (else typing its name is a dead end: no row,
  // and the custom-add suppressed). Alias names also count as exact so an
  // aliased built-in ("Bench Press" behind "Barbell Bench Press") is never
  // re-offered as a new custom spelling.
  const searchPool = (() => {
    const seen = new Set(all.map((e) => e.name));
    return [...(recent ?? []).filter((e) => !seen.has(e.name)), ...all];
  })();
  const exact = searchPool.some((e) => e.name.toLowerCase() === q) || [...aliases].some((a) => a.toLowerCase() === q);
  // Capped so a one-letter query doesn't mount the whole catalog in one frame;
  // every further character narrows it well under the cap.
  const results = q ? searchPool.filter((e) => e.name.toLowerCase().includes(q)).slice(0, 60) : [];
  const az = useMemo(() => {
    const sorted = [...all].sort((a, b) => a.name.localeCompare(b.name));
    const letters: { letter: string; entries: Entry[] }[] = [];
    for (const e of sorted) {
      const L = e.name[0]!.toUpperCase();
      if (letters[letters.length - 1]?.letter !== L) letters.push({ letter: L, entries: [] });
      letters[letters.length - 1]!.entries.push(e);
    }
    return letters;
  }, [all]);

  const pick = (e: Entry) => onPick(e.name, e.kind);
  const close = () => { setQuery(""); setRoom(null); onClose(); };

  // Plain render helpers (NOT nested components) — a component defined inside
  // render gets a new identity every render, which would unmount + remount
  // every visible row on each search keystroke. Matches the web picker.
  const row = (e: Entry, last: boolean) => {
    const c = kindColor(e.kind, C);
    const hint = shapeHint(e);
    return (
      <Pressable key={e.name} onPress={() => pick(e)} accessibilityRole="button" accessibilityLabel={e.name} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.line }}>
        {/* The SQUARE exercise avatar (shared — exercise-media): it carries the
            lift's DRAWN demo once it exists, and until then its IMPLEMENT
            (core: exercise-marks) — a barbell, a pair of bells, a cable handle.
            Sports keep their catalog glyph. */}
        <AuroraExerciseAvatar name={e.name} icon={e.icon} tint={txt(C, c)} glyph={24} />
        <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ flex: 1, fontFamily: F.semi, fontSize: fs.bodyLg, color: C.chalk }}>{e.name}</Text>
        {!!hint && <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }}>{hint}</Text>}
      </Pressable>
    );
  };
  const slab = (entries: Entry[]) => (
    <View style={{ backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 3 }}>
      {entries.map((e, i) => row(e, i === entries.length - 1))}
    </View>
  );
  const head = (label: string, count: number) => (
    <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 16, marginBottom: 10, marginHorizontal: 2 }}>
      <Text accessibilityRole="header" style={{ fontFamily: F.black, fontSize: 18, letterSpacing: -0.3, color: C.chalk }}>{label}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: tracking.label, color: C.ash }}>{count}</Text>
    </View>
  );
  const customAdd = q.length > 0 && !exact && (
    <Pressable onPress={() => onPick(query.trim(), inferBlockKind(query.trim()))} style={{ marginTop: 16, borderRadius: RADIUS.pill, backgroundColor: C.lime, paddingVertical: 12, alignItems: "center" }}>
      <Text style={{ fontFamily: F.black, fontSize: fs.bodyLg, color: C.onAccent }}>+ “{query.trim()}”</Text>
    </Pressable>
  );
  const roomData = room ? rooms.find((r) => r.key === room) : null;
  const letters = az.map((s) => s.letter);

  // `fill` is NOT decoration: the body below is a flexing ScrollView, and in a
  // content-sized panel it would collapse to zero height — an empty sheet with
  // no movement to tap, which is exactly no way to add an exercise.
  return (
    <Sheet visible={visible} onClose={close} title={title} scroll={false} fill>
          <View style={{ flexDirection: "row", justifyContent: "flex-end", alignItems: "center", marginBottom: 16 }}>
            <Pressable onPress={close} hitSlop={10}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{t("w.train.builder.close")}</Text>
            </Pressable>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 16 }}>
            <AuroraIcon name="search" size={18} color={C.ash} />
            <TextInput
              value={query}
              onChangeText={(v) => refilter(() => setQuery(v))}
              placeholder={t("w.train.builder.searchCustomPh")}
              placeholderTextColor={C.ash}
              onSubmitEditing={() => query.trim() && onPick(query.trim(), inferBlockKind(query.trim()))}
              style={{ flex: 1, fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, paddingVertical: 12 }}
            />
          </View>

          {/* VIEW TOGGLE — Groups (rooms drill-down) ⇄ A–Z (the typeset index).
              Hidden while searching: results are one flat list either way. */}
          {!q && (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              {([
                { id: "groups" as const, label: t("w.analyze.ex.sortGroups") },
                { id: "az" as const, label: t("w.analyze.ex.sortAz") },
              ]).map((p) => {
                const on = view === p.id;
                return (
                  <Pressable key={p.id} onPress={() => { setView(p.id); setRoom(null); }} accessibilityRole="button" accessibilityState={{ selected: on }}
                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: on ? C.lime : C.line, backgroundColor: on ? C.lime : "transparent" }}>
                    <Text style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: tracking.label, textTransform: "uppercase", fontWeight: on ? "700" : "400", color: on ? C.onAccent : C.ash }}>{p.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <View style={{ flex: 1, marginTop: 4 }}>
            <ScrollView ref={scrollRef} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 4, paddingBottom: 28, paddingRight: view === "az" && !q ? 18 : 0 }}>
              {q ? (
                /* SEARCH — one flat list across every room, then custom add. */
                <>
                  {results.length > 0 && <View style={{ marginTop: 10 }}>{slab(results)}</View>}
                  {customAdd}
                </>
              ) : view === "az" ? (
                /* A–Z — display-face letter heads; offsets feed the rail. */
                az.map((sec) => (
                  <View key={sec.letter} onLayout={(ev) => { letterY.current[sec.letter] = ev.nativeEvent.layout.y; }}>
                    <Text style={{ fontFamily: F.black, fontSize: 24, letterSpacing: -0.5, color: C.ash, marginTop: 16, marginBottom: 6, marginHorizontal: 2 }}>{sec.letter}</Text>
                    {slab(sec.entries)}
                  </View>
                ))
              ) : roomData ? (
                /* ONE ROOM — crumb back + the room's movements only. */
                <>
                  <Pressable onPress={() => setRoom(null)} hitSlop={8} style={{ marginTop: 10, marginBottom: 2 }}>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>← {t("w.train.picker.all")}</Text>
                  </Pressable>
                  {head(roomData.label, roomData.entries.length)}
                  {slab(roomData.entries)}
                </>
              ) : (
                /* ROOMS — your lifts first (logger), then the pattern grid. */
                <>
                  {(recent?.length ?? 0) > 0 && (
                    <>
                      {head(t("workout.yourLifts"), Math.min(recent!.length, 8))}
                      {slab(recent!.slice(0, 8))}
                    </>
                  )}
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
                    {rooms.map((r) => {
                      const c = kindColor(r.entries[0]!.kind, C);
                      return (
                        <Pressable key={r.key} onPress={() => setRoom(r.key)} accessibilityRole="button" accessibilityLabel={r.label}
                          style={{ flexBasis: "47%", flexGrow: 1, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 16 }}>
                          {/* A room is a muscle group, not a lift — its mark is
                              the BODY it trains, lit from the room's own
                              exercise list (core: roomBodyMark). Sports rooms
                              keep their catalog glyph; a room the DB can't read
                              falls back to its initials.

                              It takes the kit's square tile even so. A room is
                              still a THING, and this grid scrolls directly under
                              the result rows above it — a sheet that draws two
                              radii at once is worse than one committing to
                              either. Only a PERSON is round. */}
                          <AMarkTile>
                            {r.icon
                              ? <Text style={{ fontSize: 17 }}>{r.icon}</Text>
                              : roomBodyMark(r.entries.map((e) => e.name))
                                ? <AuroraBodyMark names={r.entries.map((e) => e.name)} size={32} color={txt(C, c)} silhouette={C.line} />
                                : <Text style={{ fontFamily: F.black, fontSize: 13, letterSpacing: -0.3, color: txt(C, c) }}>{initials(r.label)}</Text>}
                          </AMarkTile>
                          <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk, marginTop: 10 }}>{r.label}</Text>
                          <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: tracking.label, color: C.ash, marginTop: 3 }}>{r.entries.length}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}
            </ScrollView>

            {/* A–Z letter rail — one-thumb jumps via the captured offsets. */}
            {view === "az" && !q && (
              <View pointerEvents="box-none" style={{ position: "absolute", right: -6, top: 0, bottom: 0, justifyContent: "center" }}>
                <View style={{ gap: 1 }}>
                  {letters.map((L) => (
                    // Instant jump (animated: false) — the index can be
                    // thousands of px away; a rail should snap, not glide.
                    <Pressable key={L} onPress={() => scrollRef.current?.scrollTo({ y: letterY.current[L] ?? 0, animated: false })} hitSlop={{ left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={L}>
                      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textAlign: "center", paddingHorizontal: 4 }}>{L}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </View>
    </Sheet>
  );
}
