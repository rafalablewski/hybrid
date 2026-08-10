"use client";

import { useMemo, useRef, useState } from "react";
import {
  MAX_EXERCISE_FAVOURITES,
  exerciseBrowse,
  exerciseBrowseSections,
  exerciseBrowseSummary,
  exerciseFavouritesFull,
  isExerciseFavourite,
  type ExerciseBrowseEntry,
  type LoggedSession,
} from "@hybrid/core";
import { HeroScreen } from "./hero";
import AuroraExerciseMedia from "./exercise-media";
import { fs, space } from "@/lib/ui";
import { haptic } from "@/lib/haptics";
import { animateListChange } from "@/lib/list-motion";
import { useExerciseFavourites, toggleExerciseFavourite } from "@/lib/exercise-favourites";
import { useLang } from "@/lib/i18n";

const C = (v: string) => `var(--color-${v})`;
const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, padding: "4px 16px" } as const;
const mono = (size: number, color: string) => ({ fontFamily: "var(--font-mono)", fontSize: size, letterSpacing: 0.7, textTransform: "uppercase" as const, color });

type SortMode = "smart" | "groups" | "az";

/** AURORA Exercises (web) — the movement PICKER, in the Aurora-pass design:
 *  Smart (decay-scored) / Groups / A–Z pills, the "This block" gradient band,
 *  hybrid-bucket sections with Explore-style heads. Ordering/bucketing lives in
 *  @hybrid/core (exercise-browse) — shared with mobile. Every row opens the one
 *  canonical exercise page (app-shell's "exercise" screen). */
export default function AuroraExercises({ sessions, onOpen }: { sessions: LoggedSession[]; onOpen: (name: string) => void }) {
  const { t } = useLang();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SortMode>("smart");
  const favourites = useExerciseFavourites();
  const full = exerciseFavouritesFull(favourites);

  const entries = useMemo(() => exerciseBrowse(sessions), [sessions]);
  const summary = useMemo(() => exerciseBrowseSummary(entries, sessions), [entries, sessions]);
  const q = query.trim().toLowerCase();
  const filtered = q ? entries.filter((e) => e.name.toLowerCase().includes(q)) : entries;
  const sections = useMemo(
    () => (mode === "az" || q ? null : exerciseBrowseSections(filtered, mode)),
    [filtered, mode, q],
  );
  const flat = useMemo(
    () => (mode === "az" ? [...filtered].sort((a, b) => a.name.localeCompare(b.name)) : filtered),
    [filtered, mode],
  );

  const days = (e: ExerciseBrowseEntry) =>
    e.daysSince === 0 ? t("w.analyze.ex.today") : t("w.analyze.ex.daysShort").replace("{n}", String(e.daysSince));

  const input = { fontFamily: "var(--font-mono)", fontSize: fs.body, background: C("ink"), color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "10px 12px", width: "100%", boxSizing: "border-box" as const };

  /* A row is TWO controls, not one: the body opens the movement's page, and the
     ★ pins it to the Today rail. The star is a sibling button (not nested —
     invalid HTML, and the click would open the page as well), so the whole rail
     is editable from the one place that lists every movement. */
  const Row = ({ e, last }: { e: ExerciseBrowseEntry; last: boolean }) => {
    const on = isExerciseFavourite(favourites, e.name);
    const locked = !on && full;
    return (
      <div data-list-row style={{ display: "flex", alignItems: "center", borderBottom: last ? "none" : `1px solid ${C("line")}` }}>
        <button
          onClick={() => onOpen(e.name)}
          className="pressable"
          style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", padding: "12px 0", cursor: "pointer", color: C("chalk") }}
        >
          {/* the lift's DRAWN demo once it exists (core: exercise-media), and
              until then its IMPLEMENT mark (core: exercise-marks) */}
          <span style={{ width: 40, height: 40, borderRadius: 12, background: C("ink"), border: `1px solid ${C("line")}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
            <AuroraExerciseMedia name={e.name} variant="thumb" size={24} tint={e.staple ? "var(--lime-text)" : C("ash")} />
          </span>
          <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: fs.bodyLg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</span>
          <span style={mono(9, e.stale ? "var(--amber-text)" : C("ash"))}>{days(e)}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.subtitle, color: `color-mix(in srgb, ${C("ash")} 55%, transparent)` }}>›</span>
        </button>
        <button
          onClick={() => {
            if (locked) return;
            haptic.light();
            toggleExerciseFavourite(e.name);
          }}
          disabled={locked}
          className="pressable"
          aria-pressed={on}
          aria-label={`${on ? t("w.home.exw.unpin") : t("w.home.exw.pin")} – ${e.name}`}
          title={locked ? t("w.home.exw.addFull").replace("{n}", String(MAX_EXERCISE_FAVOURITES)) : undefined}
          /* Amber TEXT tone, not the fill — the fill is 1.57:1 on washi. */
          style={{ background: "none", border: "none", cursor: locked ? "default" : "pointer", padding: "12px 2px 12px 12px", lineHeight: 1, fontSize: 15, color: on ? "var(--amber-text)" : C("ash"), opacity: locked ? 0.25 : on ? 1 : 0.55 }}
        >
          {on ? "★" : "☆"}
        </button>
      </div>
    );
  };

  const Card = ({ list }: { list: ExerciseBrowseEntry[] }) => (
    <div style={card}>
      {list.map((e, i) => <Row key={e.name} e={e} last={i === list.length - 1} />)}
    </div>
  );

  // POSITION IS THE INFORMATION, so position is animated. Searching and
  // re-sorting used to replace the list wholesale: the movements that survived
  // a filter — the ones the athlete is actually looking at — were re-rendered
  // somewhere new with no thread back to where they had been, which is the same
  // teleport a delete used to cause, one screen up. Now the survivors MOVE and
  // only genuine arrivals fade in. Keyed by name, so React hands the FLIP the
  // same nodes to measure before and after.
  const listRef = useRef<HTMLDivElement>(null);
  const flip = (apply: () => void) => animateListChange(listRef.current, apply);

  return (
    <HeroScreen hero={{ rank: "title", title: t("w.analyze.ex.title") }}>
    <div style={{ maxWidth: 560, margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <p style={{ fontSize: fs.body, color: C("ash"), margin: "4px 0 0" }}>{t("w.analyze.ex.sub")}</p>
      {entries.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: 40, borderRadius: 28, marginTop: 16 }}><span style={{ fontFamily: "var(--font-mono)", fontSize: fs.bodyLg, color: C("ash") }}>{t("w.analyze.ex.empty")}</span></div>
      ) : (
        <div ref={listRef} style={{ display: "flex", flexDirection: "column", gap: space.ms, marginTop: 16 }}>
          <input value={query} onChange={(e) => flip(() => setQuery(e.target.value))} placeholder={t("w.analyze.ex.search")} style={input} />

          {/* SORT PILLS — Smart (decay order) / Groups (fixed buckets) / A–Z */}
          <div style={{ display: "flex", gap: 8 }}>
            {([
              { id: "smart" as const, label: t("w.analyze.ex.sortSmart") },
              { id: "groups" as const, label: t("w.analyze.ex.sortGroups") },
              { id: "az" as const, label: t("w.analyze.ex.sortAz") },
            ]).map((p) => {
              const on = mode === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => flip(() => setMode(p.id))}
                  className="pressable"
                  aria-pressed={on}
                  style={{ ...mono(10.5, on ? "var(--on-accent)" : C("ash")), letterSpacing: 0.8, fontWeight: on ? 700 : 400, padding: "8px 16px", borderRadius: 999, cursor: "pointer", border: `1px solid ${on ? C("lime") : C("line")}`, background: on ? C("lime") : "transparent" }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* THIS BLOCK — the gradient band (Profile's cover wash + stat row). */}
          {summary.inRotation > 0 && (
            <div style={{ position: "relative", overflow: "hidden", borderRadius: 28, border: `1px solid ${C("line")}`, padding: "16px 16px", background: `linear-gradient(120deg, color-mix(in srgb, ${C("violet")} 32%, transparent), color-mix(in srgb, ${C("lime")} 16%, transparent) 55%, ${C("ink2")})` }}>
              <div aria-hidden style={{ position: "absolute", top: -40, right: -28, width: 150, height: 150, borderRadius: "50%", background: C("lime"), opacity: 0.16 }} />
              <div style={{ ...mono(8.5, C("ash")), letterSpacing: 1.4 }}>{t("w.analyze.ex.block")}</div>
              <div style={{ display: "flex", gap: 24, marginTop: 8 }}>
                {[
                  { v: `${summary.inRotation}`, k: t("w.analyze.ex.inRotation") },
                  { v: `${summary.weekSessions}`, k: t("w.analyze.ex.weekSessions") },
                ].map((s) => (
                  <div key={s.k} style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontWeight: 900, fontSize: 18, letterSpacing: -0.4, color: C("chalk") }}>{s.v}</span>
                    <span style={mono(9, C("ash"))}>{s.k}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sections ? (
            sections.map((sec) => (
              <div key={sec.bucket}>
                {/* Explore's SectionHead — 18px black title, mono count at the baseline. */}
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", margin: "8px 2px 12px" }}>
                  <h2 style={{ fontWeight: 900, fontSize: 18, letterSpacing: -0.3, margin: 0 }}>{t(sec.labelKey)}</h2>
                  <span style={{ ...mono(10.5, C("ash")), letterSpacing: 1 }}>{sec.entries.length}</span>
                </div>
                <Card list={sec.entries} />
              </div>
            ))
          ) : (
            flat.length > 0 && <Card list={flat} />
          )}
          {filtered.length === 0 && <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), display: "block", padding: "16px 0" }}>{t("w.analyze.ex.noMatch")}</span>}
        </div>
      )}
    </div>
    </HeroScreen>
  );
}
