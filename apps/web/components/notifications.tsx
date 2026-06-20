"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { fs, space, buildActivityFeed, relativeTime, type ActivityAccent, type ActivityAssignment } from "@hybrid/core";
import { useSessions } from "@/lib/use-sessions";
import { AuroraIcon } from "@/components/aurora/icons";
import { useTemplate } from "@/lib/use-template";

type AssignmentRow = { id: string; name: string; date: string; status: string };

/**
 * Notifications / activity (web) — web parity of the mobile feed, running the
 * same @hybrid/core engine off the signed-in user's real sessions AND coach
 * assignments (matching mobile, which already feeds both). Honest empty state
 * when there's nothing (or when signed out).
 *
 * Works in BOTH templates: `embedded` (in the app-shell, reached from the
 * sidebar / ⌘K / the header bell) drops the full-screen chrome + back button;
 * standalone (/notifications, e.g. from the landing bell) keeps them. Radii
 * soften under Aurora.
 */
export default function NotificationsScreen({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const aurora = useTemplate().template === "aurora";
  const r = { card: aurora ? 24 : 12, field: aurora ? 14 : 10 };
  const { sessions } = useSessions();
  const [assignments, setAssignments] = useState<ActivityAssignment[]>([]);

  // Coach/self assignments — same source the Calendar reads. Best-effort: an
  // empty list (signed out / no coach) just means the feed is sessions-only.
  useEffect(() => {
    let alive = true;
    fetch("/api/assignments")
      .then((res) => (res.ok ? res.json() : { assignments: [] }))
      .then((d: { assignments?: AssignmentRow[] }) => {
        if (alive) setAssignments(d.assignments ?? []);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const feed = useMemo(() => buildActivityFeed({ sessions, assignments }), [sessions, assignments]);
  const C = (v: string) => `var(--color-${v})`;
  const accent = (a: ActivityAccent) => C(a);
  const outer: CSSProperties = embedded
    ? { color: C("chalk"), fontFamily: "var(--font-display)", display: "flex", justifyContent: "center" }
    : { minHeight: "100vh", background: C("ink"), color: C("chalk"), fontFamily: "var(--font-display)", display: "flex", justifyContent: "center", padding: "32px 22px" };

  return (
    <div style={outer}>
      <div style={{ width: "100%", maxWidth: 460 }}>
        <div style={{ display: "flex", alignItems: "center", gap: space.ms }}>
          {!embedded && (
            <button onClick={() => router.push("/app")} aria-label="Back" style={{ width: 44, height: 44, borderRadius: r.field, border: `1px solid ${C("line")}`, background: "transparent", color: C("chalk"), cursor: "pointer", display: "grid", placeItems: "center" }}>
              {aurora ? <AuroraIcon name="back" size={20} /> : <span style={{ fontSize: fs.heading }}>←</span>}
            </button>
          )}
          <h1 style={{ fontWeight: 900, fontSize: 24, margin: 0 }}>Notifications</h1>
          {feed.length > 0 && (
            <span style={{ marginLeft: "auto", background: C("lime"), color: C("ink"), borderRadius: 999, padding: "3px 10px", fontFamily: "var(--font-mono)", fontSize: fs.nano }}>{feed.length}</span>
          )}
        </div>

        {feed.length === 0 ? (
          <div style={{ marginTop: 22, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: r.card, padding: 20, color: C("ash"), fontSize: fs.bodyLg, lineHeight: 1.5 }}>
            Nothing yet. Log a workout or get a session from your coach and your activity shows up here.
          </div>
        ) : (
          <div style={{ marginTop: 18 }}>
            {feed.map((it) => (
              <div key={it.id} style={{ display: "flex", gap: space.md, alignItems: "center", marginBottom: 14 }}>
                <div style={{ width: 46, height: 46, borderRadius: r.field, background: `color-mix(in srgb, ${accent(it.accent)} 14%, transparent)`, display: "grid", placeItems: "center" }}>
                  <AuroraIcon name={it.icon} size={22} color={accent(it.accent)} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: fs.bodyLg }}>{it.title}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginTop: 2 }}>{it.detail}</div>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash") }}>{relativeTime(it.at)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
