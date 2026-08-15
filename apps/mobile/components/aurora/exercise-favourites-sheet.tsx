import { useMemo, useState } from "react";
import { View, Text } from "react-native";
import {
  MAX_EXERCISE_FAVOURITES,
  exerciseBrowse,
  exerciseFavouritesFull,
  isExerciseFavourite,
  type ExerciseBrowseEntry,
  type LoggedSession,
} from "@hybrid/core";
import Sheet from "./sheet";
import { ASearch } from "./kit";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, tracking, F, PressScale as Pressable, FIXED_FONT_SCALE } from "../../lib/ui";
import { useExerciseFavourites, toggleExerciseFavourite } from "../../lib/exercise-favourites";
import { haptic } from "../../lib/haptics";
import { useListMotion } from "../../lib/list-motion";

/**
 * ADD AN EXERCISE — the Exercises rail's pin sheet (mobile), twin of the web
 * aurora/exercise-favourites-sheet.tsx.
 *
 * The rail's trailing tile used to be a "+" that navigated to the exercises
 * LIST: a plus that adds nothing is a broken promise, and the list it landed on
 * had no way to change what the rail shows either. Now the "+" opens this, and
 * the list keeps its own door (the rail's See-all tail).
 *
 * It offers only movements the athlete has LOGGED — the rail draws an 8-week
 * chart, so pinning something with no history could only produce a blank card.
 * Pins lead the list so the current selection is visible and removable, then
 * the Smart order (exercise-browse's decay score) from the exercises screen, so
 * the movement you trained yesterday is the first one you can pin.
 */
export default function ExerciseFavouritesSheet({
  visible,
  onClose,
  sessions,
}: {
  visible: boolean;
  onClose: () => void;
  sessions: LoggedSession[];
}) {
  // Survivors of a filter MOVE to their new positions; only arrivals fade.
  const refilter = useListMotion();
  const { palette: C } = useTheme();
  const { t } = useLang();
  const favourites = useExerciseFavourites();
  const [query, setQuery] = useState("");

  const entries = useMemo(() => exerciseBrowse(sessions), [sessions]);
  const q = query.trim().toLowerCase();
  const filtered = q ? entries.filter((e) => e.name.toLowerCase().includes(q)) : entries;
  const pinned = filtered.filter((e) => isExerciseFavourite(favourites, e.name));
  const rest = filtered.filter((e) => !isExerciseFavourite(favourites, e.name));
  const full = exerciseFavouritesFull(favourites);

  const days = (e: ExerciseBrowseEntry) =>
    e.daysSince === 0 ? t("w.analyze.ex.today") : t("w.analyze.ex.daysShort").replace("{n}", String(e.daysSince));

  // Plain render helpers, NOT nested components: a component declared in render
  // gets a fresh identity each keystroke and would remount every visible row.
  const row = (e: ExerciseBrowseEntry, last: boolean) => {
    const on = isExerciseFavourite(favourites, e.name);
    // At the cap an unpinned row can't do anything — say so by dimming it
    // rather than accepting the tap and silently ignoring it.
    const locked = !on && full;
    return (
      <Pressable
        key={e.name}
        onPress={() => {
          if (locked) return;
          haptic.light();
          toggleExerciseFavourite(e.name);
        }}
        disabled={locked}
        accessibilityRole="button"
        accessibilityState={{ selected: on, disabled: locked }}
        accessibilityLabel={`${on ? t("w.home.exw.unpin") : t("w.home.exw.pin")} – ${e.name}`}
        style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.line, opacity: locked ? 0.45 : 1 }}
      >
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: F.black, fontSize: fs.body, letterSpacing: tracking.display, color: on ? txt(C, C.lime) : C.ash }}>{e.initials}</Text>
        </View>
        <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ flex: 1, fontFamily: F.semi, fontSize: fs.bodyLg, color: C.chalk }}>{e.name}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }}>{days(e)}</Text>
        {/* The pinned star rides the amber TEXT tone, not the fill (the
            accent-text channel). */}
        <Text style={{ fontSize: fs.note, color: on ? txt(C, C.amber) : C.ash, opacity: on ? 1 : 0.55 }}>{on ? "★" : "☆"}</Text>
      </Pressable>
    );
  };

  const slab = (list: ExerciseBrowseEntry[]) => (
    <View style={{ backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 4 }}>
      {list.map((e, i) => row(e, i === list.length - 1))}
    </View>
  );

  const head = (label: string, count: number) => (
    <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 16, marginBottom: 10, marginHorizontal: 2 }}>
      <Text accessibilityRole="header" style={{ fontFamily: F.black, fontSize: fs.title, letterSpacing: tracking.display, color: C.chalk }}>{label}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: tracking.label, color: C.ash }}>{count}</Text>
    </View>
  );

  return (
    <Sheet visible={visible} onClose={onClose} title={t("w.home.exw.addTitle")} sub={t("w.home.exw.addSub")}>
      {entries.length === 0 ? (
        <Text style={{ fontFamily: F.reg, fontSize: fs.note, color: C.ash, paddingVertical: 12 }}>{t("w.home.exw.addEmpty")}</Text>
      ) : (
        <>
          <ASearch value={query} onChange={(v: string) => refilter(() => setQuery(v))} placeholder={t("w.analyze.ex.search")} />
          {full && (
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: tracking.label, color: C.accentText.amber, marginTop: 10 }}>
              {t("w.home.exw.addFull").replace("{n}", String(MAX_EXERCISE_FAVOURITES))}
            </Text>
          )}
          {pinned.length > 0 && (
            <>
              {head(t("w.home.exw.pinned"), favourites.length)}
              {slab(pinned)}
            </>
          )}
          {rest.length > 0 && (
            <>
              {head(t("w.home.exw.yourMovements"), rest.length)}
              {slab(rest)}
            </>
          )}
          {filtered.length === 0 && (
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, paddingVertical: 16 }}>{t("w.analyze.ex.noMatch")}</Text>
          )}
        </>
      )}
    </Sheet>
  );
}
