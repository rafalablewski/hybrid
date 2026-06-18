"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { buildActivityFeed, relativeTime, type ActivityAccent } from "@hybrid/core";
import { useSessions } from "@/lib/use-sessions";
import { AuroraIcon } from "@/components/aurora/icons";

/**
 * Notifications / activity (web) — web parity of the mobile feed, running the
 * same @hybrid/core engine off the signed-in user's real sessions. Honest empty
 * state when there's nothing (or when signed out).
 */
export default function NotificationsScreen() {
  const router = useRouter();
  const { sessions } = useSessions();
  const feed = useMemo(() => buildActivityFeed({ sessions }), [sessions]);
  const C = (v: string) => `var(--color-${v})`;
  const accent = (a: ActivityAccent) => C(a);

  return (
    <div style={{ minHeight: "100vh", background: C("ink"), color: C("chalk"), fontFamily: "var(--font-display)", display: "flex", justifyContent: "center", padding: "32px 22px" }}>
      <div style={{ width: "100%", maxWidth: 460 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => router.push("/app")} style={{ width: 44, height: 44, borderRadius: 14, border: `1px solid ${C("line")}`, background: "transparent", color: C("chalk"), cursor: "pointer", display: "grid", placeItems: "center" }}>
            <AuroraIcon name="back" size={20} />
          </button>
          <h1 style={{ fontWeight: 900, fontSize: 24, margin: 0 }}>Notifications</h1>
          {feed.length > 0 && (
            <span style={{ marginLeft: "auto", background: C("lime"), color: C("ink"), borderRadius: 999, padding: "3px 10px", fontFamily: "var(--font-mono)", fontSize: 10 }}>{feed.length}</span>
          )}
        </div>

        {feed.length === 0 ? (
          <div style={{ marginTop: 22, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 24, padding: 20, color: C("ash"), fontSize: 14, lineHeight: 1.5 }}>
            Nothing yet. Log a workout or get a session from your coach and your activity shows up here.
          </div>
        ) : (
          <div style={{ marginTop: 18 }}>
            {feed.map((it) => (
              <div key={it.id} style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
                <div style={{ width: 46, height: 46, borderRadius: 14, background: `color-mix(in srgb, ${accent(it.accent)} 14%, transparent)`, display: "grid", placeItems: "center" }}>
                  <AuroraIcon name={it.icon} size={22} color={accent(it.accent)} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{it.title}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C("ash"), marginTop: 2 }}>{it.detail}</div>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C("ash") }}>{relativeTime(it.at)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
