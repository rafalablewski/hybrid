"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { sessionBuckets, weeklyRecap, type StatRange } from "@hybrid/core";
import { useSessions } from "@/lib/use-sessions";
import { AuroraIcon } from "@/components/aurora/icons";

const RANGES: { id: StatRange; label: string }[] = [
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
];

/** Statistics (web) — web parity of the mobile screen, same @hybrid/core stats
 *  engine over the signed-in user's real sessions. Honest empty state. */
export default function StatisticsScreen() {
  const router = useRouter();
  const { sessions } = useSessions();
  const [range, setRange] = useState<StatRange>("week");
  const buckets = useMemo(() => sessionBuckets(sessions, range), [sessions, range]);
  const recap = useMemo(() => weeklyRecap(sessions), [sessions]);
  const hasData = sessions.length > 0;
  const maxVal = Math.max(1, ...buckets.buckets.map((b) => b.value));
  const C = (v: string) => `var(--color-${v})`;

  return (
    <div style={{ minHeight: "100vh", background: C("ink"), color: C("chalk"), fontFamily: "var(--font-display)", display: "flex", justifyContent: "center", padding: "32px 22px" }}>
      <div style={{ width: "100%", maxWidth: 460 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button onClick={() => router.push("/app")} style={{ width: 44, height: 44, borderRadius: 14, border: `1px solid ${C("line")}`, background: "transparent", color: C("chalk"), cursor: "pointer", display: "grid", placeItems: "center" }}>
              <AuroraIcon name="back" size={20} />
            </button>
            <h1 style={{ fontWeight: 900, fontSize: 26, margin: 0, lineHeight: 1.1 }}>Your<br />Statistics</h1>
          </div>
          <div style={{ textAlign: "right", marginTop: 6 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C("ash") }}>Weekly volume</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end", marginTop: 2 }}>
              <AuroraIcon name="arrow-up" size={16} color={C("lime")} />
              <span style={{ fontWeight: 900, fontSize: 18 }}>{Math.round(recap.volume)} kg</span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 4, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 999, padding: 4, marginTop: 18 }}>
          {RANGES.map((r) => {
            const on = range === r.id;
            return (
              <button key={r.id} onClick={() => setRange(r.id)} style={{ flex: 1, padding: "9px 0", borderRadius: 999, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, background: on ? C("lime") : "transparent", color: on ? C("ink") : C("ash") }}>{r.label}</button>
            );
          })}
        </div>

        <div style={{ marginTop: 18, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, padding: "18px 18px 26px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <b style={{ fontSize: 16 }}>Sessions</b>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C("ash") }}>{buckets.total} in {range}</span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", height: 130, marginTop: 16, gap: 7 }}>
            {buckets.buckets.map((b, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{ width: "100%", height: Math.max(4, (b.value / maxVal) * 104), borderRadius: 6, background: i === buckets.peakIndex ? C("lime") : C("line") }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: C("ash") }}>{b.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
          <Mini icon="verified" label="Active days" value={hasData ? String(buckets.activeDays) : "—"} color={C("lime")} />
          <Mini icon="navigation" label="Distance" value={hasData ? `${recap.distanceKm.toFixed(1)} km` : "—"} color={C("violet")} />
          <Mini icon="play" label="Minutes" value={hasData ? String(Math.round(recap.minutes)) : "—"} color={C("amber")} />
        </div>

        {!hasData && (
          <p style={{ fontSize: 13, color: C("ash"), textAlign: "center", marginTop: 18, lineHeight: 1.5 }}>Log a few workouts and your real training stats fill in here.</p>
        )}
      </div>
    </div>
  );
}

function Mini({ icon, label, value, color }: { icon: Parameters<typeof AuroraIcon>[0]["name"]; label: string; value: string; color: string }) {
  const C = (v: string) => `var(--color-${v})`;
  return (
    <div style={{ flex: 1, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 24, padding: 16 }}>
      <AuroraIcon name={icon} size={22} color={color} />
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C("ash"), marginTop: 8 }}>{label}</div>
      <div style={{ fontWeight: 900, fontSize: 20, marginTop: 2 }}>{value}</div>
    </div>
  );
}
