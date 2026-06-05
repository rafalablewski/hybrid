"use client";

import { useEffect, useState } from "react";
import { SPORTS, SPORT_NAMES, LEVELS, prescribeForSport } from "@hybrid/core";
import { useSessions } from "@/lib/use-sessions";
import { INK2, LINE, LIME, CHALK, ASH, BLUE, AMBER, disp, cond, mono, Mono, Card, Chip } from "@/lib/ui";

const STORE_KEY = "hybrid.sport";

// Sport-driven training — pick a sport + level, the shared engine
// (prescribeForSport in @hybrid/core) ranks the S&C work that makes you better
// at that sport. Same engine the mobile app uses. The athlete's sport, level
// and performance markers are remembered, so the tab reflects THEM — not a
// default demo selection.
export default function SportScreen() {
  const [sport, setSport] = useState<string>(SPORT_NAMES[0]!);
  const [levelIdx, setLevelIdx] = useState(0);
  const [markers, setMarkers] = useState<Record<string, string>>({});
  const [hydrated, setHydrated] = useState(false);

  // Restore the athlete's saved choice (client-only — avoids an SSR mismatch).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const s = JSON.parse(raw) as { sport?: string; levelIdx?: number; markers?: Record<string, string> } | null;
        if (s && typeof s === "object") {
          if (s.sport && SPORTS[s.sport]) setSport(s.sport);
          if (typeof s.levelIdx === "number" && s.levelIdx >= 0 && s.levelIdx < LEVELS.length) setLevelIdx(s.levelIdx);
          if (s.markers && typeof s.markers === "object") setMarkers(s.markers);
        }
      }
    } catch {
      /* ignore corrupt/unavailable storage */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ sport, levelIdx, markers }));
    } catch {
      /* ignore */
    }
  }, [sport, levelIdx, markers, hydrated]);

  // The athlete's real logged sessions drive the working loads below.
  const { sessions } = useSessions();
  const meta = SPORTS[sport]!;
  const rx = prescribeForSport(sport, levelIdx, { sessions });

  return (
    <div style={{ maxWidth: 820 }}>
      <Mono s={{ fontSize: 13, display: "block", marginBottom: 14 }}>
        Pick your sport — we prescribe the strength &amp; conditioning that transfers to it.
      </Mono>

      {/* sport picker */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {SPORT_NAMES.map((s) => {
          const on = s === sport;
          return (
            <button
              key={s}
              onClick={() => setSport(s)}
              style={{
                ...cond,
                fontSize: 14,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "9px 14px",
                borderRadius: 10,
                cursor: "pointer",
                border: `1px solid ${on ? LIME : LINE}`,
                background: on ? `${LIME}1a` : "transparent",
                color: on ? CHALK : ASH,
              }}
            >
              <span style={{ fontSize: 16 }}>{SPORTS[s]!.icon}</span>
              {s}
            </button>
          );
        })}
      </div>

      {/* level picker */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {LEVELS.map((l, i) => {
          const on = i === levelIdx;
          return (
            <button
              key={l}
              onClick={() => setLevelIdx(i)}
              style={{
                ...cond,
                fontSize: 13,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: ".04em",
                padding: "8px 14px",
                borderRadius: 10,
                cursor: "pointer",
                border: `1px solid ${on ? BLUE : LINE}`,
                background: on ? BLUE : "transparent",
                color: on ? "#0c0d0c" : ASH,
              }}
            >
              {l}
            </button>
          );
        })}
      </div>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 26 }}>{meta.icon}</span>
          <div>
            <div style={{ ...disp, fontWeight: 800, fontSize: 20 }}>{sport}</div>
            <Mono s={{ fontSize: 12 }}>{meta.family} · {LEVELS[levelIdx]}</Mono>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }}>{meta.marker.label}</Mono>
          <input
            value={markers[sport] ?? ""}
            onChange={(e) => setMarkers((m) => ({ ...m, [sport]: e.target.value }))}
            placeholder={meta.marker.ph}
            style={{
              ...mono,
              fontSize: 14,
              width: "100%",
              marginTop: 6,
              padding: "10px 12px",
              borderRadius: 10,
              background: INK2,
              color: CHALK,
              border: `1px solid ${LINE}`,
              outline: "none",
            }}
          />
        </div>
      </Card>

      {/* prescribed session — loads driven by the athlete's logged lifts */}
      <Card style={{ borderLeft: `3px solid ${LIME}`, marginBottom: 16 }}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>
          Today&apos;s prescribed S&amp;C
        </Mono>
        <Mono s={{ fontSize: 11, display: "block", marginTop: 2 }} c={ASH}>
          {rx.personalized
            ? "Working loads computed from your logged lifts."
            : "Log these lifts and the loads tune to your own numbers."}
        </Mono>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {rx.blocks.map((b) => (
            <div
              key={b.name}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderTop: `1px solid ${LINE}` }}
            >
              <div>
                <div style={{ ...disp, fontWeight: 700, fontSize: 15 }}>{b.name}</div>
                <Mono s={{ fontSize: 11 }} c={AMBER}>{b.demand}</Mono>
              </div>
              <div style={{ textAlign: "right" }}>
                <Chip c={LIME}>{b.scheme}</Chip>
                <Mono s={{ fontSize: 10, display: "block", marginTop: 4 }} c={ASH}>
                  {b.loadBasis ?? (b.bodyweight ? "bodyweight / tempo" : "")}
                </Mono>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* the why */}
      <Card>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }}>
          Exercise pool · why it transfers
        </Mono>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          {rx.ranked.map((e) => (
            <div key={e.name}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div style={{ ...disp, fontWeight: 600, fontSize: 14 }}>{e.name}</div>
                <Mono s={{ fontSize: 11 }} c={ASH}>{e.demand}</Mono>
              </div>
              <Mono s={{ fontSize: 13, lineHeight: 1.5, display: "block", marginTop: 3 }} c={CHALK}>
                {e.why}
              </Mono>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
