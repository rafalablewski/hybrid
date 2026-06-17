"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  prescribeSession,
  computePerformanceState,
  toTrainingLog,
  velocityProfiles,
  type LoggedSession,
  type Biometrics,
  type Macrocycle,
  type SessionBlock,
} from "@hybrid/core";
import { useSession } from "@/lib/session";
import { AuroraIcon } from "./icons";

/**
 * AURORA Today (web) — the bespoke web parity of the mobile Aurora Home:
 * greeting + search/bell, a readiness hero (→ Statistics), a Start button and a
 * schedule-first list of today's prescribed work. Runs the SAME engines as the
 * classic Today; conditioning rows open the interval timer.
 */
export default function AuroraToday({
  sessions,
  bio,
  onStart,
}: {
  sessions: LoggedSession[];
  bio?: Biometrics;
  macro?: Macrocycle | null;
  currentWeek?: number;
  planId?: string | null;
  onStart: (planBlocks?: SessionBlock[]) => void;
}) {
  const router = useRouter();
  const { session } = useSession();
  const name = session?.name ?? "Athlete";

  const log = useMemo(() => toTrainingLog(sessions), [sessions]);
  const rx = useMemo(() => prescribeSession(log, bio, { profiles: velocityProfiles(sessions) }), [log, sessions, bio]);
  const state = useMemo(() => computePerformanceState(log, bio), [log, bio]);
  const hasData = sessions.length > 0;
  const C = (v: string) => `var(--color-${v})`;

  const items = rx.blocks.slice(0, 4).map((b) => ({
    name: b.name,
    kind: b.kind,
    sub: b.kind === "strength" ? "Primary lift" : b.kind === "conditioning" ? b.format : b.distance ? `${b.distance} km` : "Steady cardio",
  }));

  const iconBtn = { width: 44, height: 44, borderRadius: "50%", background: C("ink2"), border: `1px solid ${C("line")}`, display: "grid", placeItems: "center", cursor: "pointer" } as const;

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", fontFamily: "var(--font-display)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ color: C("ash"), fontSize: 16 }}>Hi,</div>
          <div style={{ fontWeight: 900, fontSize: 30, letterSpacing: "-.02em" }}>{name}</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={iconBtn}><AuroraIcon name="search" size={22} color={C("ash")} /></div>
          <button onClick={() => router.push("/notifications")} style={iconBtn}><AuroraIcon name="bell" size={22} color={C("ash")} /></button>
        </div>
      </div>

      <button
        onClick={() => router.push("/statistics")}
        style={{ width: "100%", textAlign: "left", marginTop: 20, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, padding: 24, cursor: "pointer", color: C("chalk") }}
      >
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>Today · readiness</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 8 }}>
          <span style={{ fontWeight: 900, fontSize: 56 }}>{hasData ? rx.readiness : "—"}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: C("ash") }}>/100</span>
        </div>
        {hasData ? (
          <div style={{ display: "flex", gap: 18, marginTop: 6 }}>
            <HeroStat label="HPI" value={state.hpi.score} color={C("lime")} />
            <HeroStat label="STR" value={state.hpi.components.strength} color={C("lime")} />
            <HeroStat label="END" value={state.hpi.components.endurance} color={C("blue")} />
          </div>
        ) : (
          <div style={{ fontSize: 13, color: C("ash"), marginTop: 6, lineHeight: 1.5 }}>Log your first workout and your readiness, HPI and schedule build from real training.</div>
        )}
      </button>

      <button
        onClick={() => onStart()}
        style={{ width: "100%", marginTop: 16, background: C("lime"), color: C("ink"), border: "none", borderRadius: 999, padding: 17, fontWeight: 700, fontSize: 16, cursor: "pointer" }}
      >
        {hasData ? "Start today's session" : "Start your first workout"}
      </button>

      <div style={{ fontWeight: 900, fontSize: 22, marginTop: 28 }}>Your Schedule</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash"), marginTop: 6, marginBottom: 12 }}>Today&apos;s activity</div>

      {hasData ? (
        items.map((it, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 24, padding: 15, marginBottom: 11 }}>
            <div style={{ display: "flex", alignItems: "center", flex: 1 }}>
              <span style={{ width: 10, height: 10, borderRadius: 5, marginRight: 12, background: it.kind === "strength" ? C("lime") : it.kind === "conditioning" ? C("blue") : C("violet") }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{it.name}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C("ash") }}>{it.sub}</div>
              </div>
            </div>
            <button
              onClick={() => (it.kind === "conditioning" ? router.push("/timer") : onStart())}
              style={{ display: "flex", alignItems: "center", gap: 5, background: C("lime"), color: C("ink"), border: "none", borderRadius: 999, padding: "9px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
            >
              <AuroraIcon name="play" size={15} color={C("ink")} />Start
            </button>
          </div>
        ))
      ) : (
        <div style={{ background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 24, padding: 20, color: C("ash"), fontSize: 14, lineHeight: 1.5 }}>
          Nothing scheduled yet. Start a session and your week fills in from your real training.
        </div>
      )}
    </div>
  );
}

function HeroStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-ash)" }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 16, color }}>{value}</div>
    </div>
  );
}
