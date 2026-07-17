"use client";

import { useMemo, useState } from "react";
import { exerciseHistory, type LoggedSession } from "@hybrid/core";
import { fs, space } from "@/lib/ui";
import { useLang } from "@/lib/i18n";

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
const C = (v: string) => `var(--color-${v})`;
const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 18 } as const;

/** AURORA Exercises (web) — the movement PICKER. Every individual exercise
 *  opens the one canonical exercise page (app-shell's "exercise" screen,
 *  aurora/exercise-page.tsx); the inline dashboard this screen used to render
 *  was folded into that page. */
export default function AuroraExercises({ sessions, onOpen }: { sessions: LoggedSession[]; onOpen: (name: string) => void }) {
  const { t } = useLang();
  const history = useMemo(() => exerciseHistory(sessions), [sessions]);
  const [query, setQuery] = useState("");
  const filtered = history.filter((e) => e.name.toLowerCase().includes(query.toLowerCase()));
  const input = { fontFamily: "var(--font-mono)", fontSize: fs.body, background: C("ink"), color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 14, padding: "10px 12px", width: "100%", boxSizing: "border-box" as const };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <h1 style={{ fontWeight: 900, fontSize: fs.display, margin: "0 0 16px" }}>{t("w.analyze.ex.title")}</h1>
      {history.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: 40 }}><span style={{ fontFamily: "var(--font-mono)", fontSize: fs.bodyLg, color: C("ash") }}>{t("w.analyze.ex.empty")}</span></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: space.ms }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("w.analyze.ex.search")} style={input} />
          <div>
            {filtered.map((e, i) => (
              <button
                key={e.name}
                onClick={() => onOpen(e.name)}
                style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", background: "none", border: "none", borderTop: i === 0 ? "none" : `1px solid ${C("line")}`, padding: "12px 2px", cursor: "pointer", color: C("chalk") }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 600, fontSize: fs.bodyLg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</span>
                  <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 3 }}>{e.kind} – {e.count}× – {fmtDate(e.lastUsed)}</span>
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.subtitle, color: "var(--lime-text)" }}>›</span>
              </button>
            ))}
            {filtered.length === 0 && <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), display: "block", padding: "14px 0" }}>{t("w.analyze.ex.noMatch")}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
