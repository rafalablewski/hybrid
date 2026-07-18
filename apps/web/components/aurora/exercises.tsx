"use client";

import { useMemo, useState } from "react";
import {
  exerciseBrowse,
  exerciseBrowseSections,
  exerciseBrowseSummary,
  type ExerciseBrowseEntry,
  type LoggedSession,
} from "@hybrid/core";
import { fs, space } from "@/lib/ui";
import { useLang } from "@/lib/i18n";

const C = (v: string) => `var(--color-${v})`;
const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 18, padding: "4px 14px" } as const;
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

  const entries = useMemo(() => exerciseBrowse(sessions), [sessions]);
  const summary = useMemo(() => exerciseBrowseSummary(entries, sessions), [entries, sessions]);
  const q = query.trim().toLowerCase();
  const filtered = q ? entries.filter((e) => e.name.toLowerCase().includes(q)) : entries;
  const sections = useMemo(
    () => (mode === "az" || q ? null : exerciseBrowseSections(filtered, mode)),
    [filtered, mode, q],
  );
  const flat = useMemo(
    () => (mode === "az" && !q ? [...filtered].sort((a, b) => a.name.localeCompare(b.name)) : filtered),
    [filtered, mode, q],
  );

  const days = (e: ExerciseBrowseEntry) =>
    e.daysSince === 0 ? t("w.analyze.ex.today") : t("w.analyze.ex.daysShort").replace("{n}", String(e.daysSince));

  const input = { fontFamily: "var(--font-mono)", fontSize: fs.body, background: C("ink"), color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 14, padding: "10px 12px", width: "100%", boxSizing: "border-box" as const };

  const Row = ({ e, last }: { e: ExerciseBrowseEntry; last: boolean }) => (
    <button
      onClick={() => onOpen(e.name)}
      style={{ display: "flex", alignItems: "center", gap: 13, width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: last ? "none" : `1px solid ${C("line")}`, padding: "11px 0", cursor: "pointer", color: C("chalk") }}
    >
      <span style={{ width: 40, height: 40, borderRadius: 12, background: C("ink"), border: `1px solid ${C("line")}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: 900, fontSize: 13, letterSpacing: -0.3, color: e.staple ? "var(--lime-text)" : C("ash") }}>{e.initials}</span>
      <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: fs.bodyLg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</span>
      <span style={mono(9, e.stale ? "var(--amber-text)" : C("ash"))}>{days(e)}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.subtitle, color: `color-mix(in srgb, ${C("ash")} 55%, transparent)` }}>›</span>
    </button>
  );

  const Card = ({ list }: { list: ExerciseBrowseEntry[] }) => (
    <div style={card}>
      {list.map((e, i) => <Row key={e.name} e={e} last={i === list.length - 1} />)}
    </div>
  );

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <h1 style={{ fontWeight: 900, fontSize: fs.display, margin: 0 }}>{t("w.analyze.ex.title")}</h1>
      <p style={{ fontSize: fs.body, color: C("ash"), margin: "4px 0 0" }}>{t("w.analyze.ex.sub")}</p>
      {entries.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: 40, borderRadius: 28, marginTop: 16 }}><span style={{ fontFamily: "var(--font-mono)", fontSize: fs.bodyLg, color: C("ash") }}>{t("w.analyze.ex.empty")}</span></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: space.ms, marginTop: 14 }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("w.analyze.ex.search")} style={input} />

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
                  onClick={() => setMode(p.id)}
                  aria-pressed={on}
                  style={{ ...mono(10.5, on ? "var(--on-accent)" : C("ash")), letterSpacing: 0.8, fontWeight: on ? 700 : 400, padding: "7px 14px", borderRadius: 999, cursor: "pointer", border: `1px solid ${on ? C("lime") : C("line")}`, background: on ? C("lime") : "transparent" }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* THIS BLOCK — the gradient band (Profile's cover wash + stat row). */}
          {summary.inRotation > 0 && (
            <div style={{ position: "relative", overflow: "hidden", borderRadius: 20, border: `1px solid ${C("line")}`, padding: "14px 16px", background: `linear-gradient(120deg, color-mix(in srgb, ${C("violet")} 32%, transparent), color-mix(in srgb, ${C("lime")} 16%, transparent) 55%, ${C("ink2")})` }}>
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
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", margin: "8px 2px 11px" }}>
                  <h2 style={{ fontWeight: 900, fontSize: 18, letterSpacing: -0.3, margin: 0 }}>{t(sec.labelKey)}</h2>
                  <span style={{ ...mono(10.5, C("ash")), letterSpacing: 1 }}>{sec.entries.length}</span>
                </div>
                <Card list={sec.entries} />
              </div>
            ))
          ) : (
            flat.length > 0 && <Card list={flat} />
          )}
          {filtered.length === 0 && <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), display: "block", padding: "14px 0" }}>{t("w.analyze.ex.noMatch")}</span>}
        </div>
      )}
    </div>
  );
}
