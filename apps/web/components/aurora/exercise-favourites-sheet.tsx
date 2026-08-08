"use client";

import { useMemo, useState } from "react";
import {
  MAX_EXERCISE_FAVOURITES,
  exerciseBrowse,
  exerciseFavouritesFull,
  isExerciseFavourite,
  fs,
  type ExerciseBrowseEntry,
  type LoggedSession,
} from "@hybrid/core";
import Sheet from "./sheet";
import { haptic } from "@/lib/haptics";
import { useLang } from "@/lib/i18n";
import { useExerciseFavourites, toggleExerciseFavourite } from "@/lib/exercise-favourites";

const C = (v: string) => `var(--color-${v})`;

/**
 * ADD AN EXERCISE — the Exercises rail's pin sheet (web), twin of the mobile
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
  open,
  onClose,
  sessions,
}: {
  open: boolean;
  onClose: () => void;
  sessions: LoggedSession[];
}) {
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

  const input = {
    fontFamily: "var(--font-mono)", fontSize: fs.body, background: C("ink"), color: C("chalk"),
    border: `1px solid ${C("line")}`, borderRadius: 16, padding: "10px 12px", width: "100%", boxSizing: "border-box" as const,
  };

  // A plain render helper, NOT a nested component: a component declared in
  // render gets a fresh identity each keystroke and would remount every row.
  const row = (e: ExerciseBrowseEntry, last: boolean) => {
    const on = isExerciseFavourite(favourites, e.name);
    // At the cap an unpinned row can't do anything — say so by dimming it
    // rather than accepting the tap and silently ignoring it.
    const locked = !on && full;
    return (
      <button
        key={e.name}
        className="pressable"
        onClick={() => {
          if (locked) return;
          haptic.light();
          toggleExerciseFavourite(e.name);
        }}
        disabled={locked}
        aria-pressed={on}
        aria-label={`${on ? t("w.home.exw.unpin") : t("w.home.exw.pin")} – ${e.name}`}
        style={{
          display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
          background: "none", border: "none", borderBottom: last ? "none" : `1px solid ${C("line")}`,
          padding: "12px 0", cursor: locked ? "default" : "pointer", color: C("chalk"), opacity: locked ? 0.45 : 1,
        }}
      >
        <span style={{ width: 40, height: 40, borderRadius: 12, background: C("ink"), border: `1px solid ${C("line")}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: 900, fontSize: 13, letterSpacing: -0.3, color: on ? "var(--lime-text)" : C("ash") }}>{e.initials}</span>
        <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: fs.bodyLg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 0.7, textTransform: "uppercase", color: C("ash") }}>{days(e)}</span>
        {/* The pinned star rides the amber TEXT tone, not the fill — the fill
            is 1.57:1 sand-on-washi in the light theme (see the accent-channel
            guard). */}
        <span aria-hidden style={{ fontSize: 15, lineHeight: 1, color: on ? "var(--amber-text)" : C("ash"), opacity: on ? 1 : 0.55 }}>{on ? "★" : "☆"}</span>
      </button>
    );
  };

  const slab = (list: ExerciseBrowseEntry[]) => (
    <div style={{ background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "4px 12px" }}>
      {list.map((e, i) => row(e, i === list.length - 1))}
    </div>
  );

  const head = (label: string, count: number) => (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", margin: "16px 2px 10px" }}>
      <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18, letterSpacing: -0.3, margin: 0, color: C("chalk") }}>{label}</h2>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: 1, color: C("ash") }}>{count}</span>
    </div>
  );

  return (
    <Sheet open={open} onClose={onClose} title={t("w.home.exw.addTitle")} sub={t("w.home.exw.addSub")}>
      {entries.length === 0 ? (
        <div style={{ padding: "12px 2px 8px", fontSize: fs.note, color: C("ash"), lineHeight: 1.5 }}>{t("w.home.exw.addEmpty")}</div>
      ) : (
        <>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("w.analyze.ex.search")} style={input} />
          {full && (
            <div style={{ marginTop: 10, fontFamily: "var(--font-mono)", fontSize: fs.micro, letterSpacing: ".06em", color: "var(--amber-text)" }}>
              {t("w.home.exw.addFull").replace("{n}", String(MAX_EXERCISE_FAVOURITES))}
            </div>
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
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), padding: "16px 0" }}>{t("w.analyze.ex.noMatch")}</div>
          )}
        </>
      )}
    </Sheet>
  );
}
