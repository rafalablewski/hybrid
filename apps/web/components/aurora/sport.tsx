"use client";

import { useEffect, useState } from "react";
import { SPORTS, SPORT_NAMES, LEVELS, prescribeForSport } from "@hybrid/core";
import { useSessions } from "@/lib/use-sessions";
import { SPORT_STORE_KEY, readSportSelection } from "@/lib/sport-store";

const C = (v: string) => `var(--color-${v})`;
const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 20 } as const;

/** AURORA Sport (web) — sport + level picker driving the shared
 *  prescribeForSport engine; working loads tuned to the athlete's logged lifts. */
export default function AuroraSport() {
  const [sport, setSport] = useState<string>(SPORT_NAMES[0]!);
  const [levelIdx, setLevelIdx] = useState(0);
  const [markers, setMarkers] = useState<Record<string, string>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const s = readSportSelection();
    if (s) {
      if (s.sport && SPORTS[s.sport]) setSport(s.sport);
      if (typeof s.levelIdx === "number" && s.levelIdx >= 0 && s.levelIdx < LEVELS.length) setLevelIdx(s.levelIdx);
      if (s.markers && typeof s.markers === "object") setMarkers(s.markers);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(SPORT_STORE_KEY, JSON.stringify({ sport, levelIdx, markers }));
    } catch {
      /* ignore */
    }
  }, [sport, levelIdx, markers, hydrated]);

  const { sessions } = useSessions();
  const meta = SPORTS[sport]!;
  const rx = prescribeForSport(sport, levelIdx, { sessions });

  return (
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <h1 style={{ fontWeight: 900, fontSize: 26, margin: "0 0 8px" }}>Sport</h1>
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: C("ash"), marginBottom: 16 }}>
        Pick your sport — we prescribe the strength &amp; conditioning that transfers to it.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {SPORT_NAMES.map((s) => {
          const on = s === sport;
          return (
            <button
              key={s}
              onClick={() => setSport(s)}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 14,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "9px 16px",
                borderRadius: 999,
                cursor: "pointer",
                border: `1px solid ${on ? C("lime") : C("line")}`,
                background: on ? `color-mix(in srgb, ${C("lime")} 14%, transparent)` : C("ink2"),
                color: on ? C("chalk") : C("ash"),
              }}
            >
              <span style={{ fontSize: 16 }}>{SPORTS[s]!.icon}</span>
              {s}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {LEVELS.map((l, i) => {
          const on = i === levelIdx;
          return (
            <button
              key={l}
              onClick={() => setLevelIdx(i)}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: ".04em",
                padding: "9px 18px",
                borderRadius: 999,
                cursor: "pointer",
                border: `1px solid ${on ? C("blue") : C("line")}`,
                background: on ? C("blue") : C("ink2"),
                color: on ? C("ink") : C("ash"),
              }}
            >
              {l}
            </button>
          );
        })}
      </div>

      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 28 }}>{meta.icon}</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 20 }}>{sport}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C("ash") }}>{meta.family} · {LEVELS[levelIdx]}</div>
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: C("ash") }}>{meta.marker.label}</div>
          <input
            value={markers[sport] ?? ""}
            onChange={(e) => setMarkers((m) => ({ ...m, [sport]: e.target.value }))}
            placeholder={meta.marker.ph}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 14,
              width: "100%",
              marginTop: 6,
              padding: "12px 14px",
              borderRadius: 16,
              background: C("ink"),
              color: C("chalk"),
              border: `1px solid ${C("line")}`,
              outline: "none",
            }}
          />
        </div>
      </div>

      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: C("lime") }}>
          Today&apos;s prescribed S&amp;C
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, marginTop: 3, color: C("ash") }}>
          {rx.personalized
            ? "Working loads computed from your logged lifts."
            : "Log these lifts and the loads tune to your own numbers."}
        </div>
        <div style={{ marginTop: 12 }}>
          {rx.blocks.map((b, i) => (
            <div
              key={b.name}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderTop: i ? `1px solid ${C("line")}` : "none" }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{b.name}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C("amber") }}>{b.demand}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{ background: `color-mix(in srgb, ${C("lime")} 14%, transparent)`, color: C("lime"), borderRadius: 999, padding: "3px 12px", fontFamily: "var(--font-mono)", fontSize: 11 }}>{b.scheme}</span>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, marginTop: 4, color: C("ash") }}>
                  {b.loadBasis ?? (b.bodyweight ? "bodyweight / tempo" : "")}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={card}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: C("ash") }}>
          Exercise pool · why it transfers
        </div>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          {rx.ranked.map((e) => (
            <div key={e.name}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{e.name}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C("ash") }}>{e.demand}</div>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 1.5, marginTop: 3, color: C("chalk") }}>
                {e.why}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
