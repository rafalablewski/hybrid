"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { fs, space, relativeTime, type ActivityAccent, type NotifItem } from "@hybrid/core";
import { AuroraIcon } from "@/components/aurora/icons";
import { useTemplate } from "@/lib/use-template";
import { useLang } from "@/lib/i18n";
import { useNotifications } from "@/lib/use-notifications";
import { readAllNotifications, readNotification } from "@/lib/notif-read";

/**
 * Notifications / activity (web) — web parity of the mobile feed, running the
 * same @hybrid/core notifications engine off the signed-in user's real sessions,
 * coach assignments, social events AND the feel reads the app is waiting on.
 * Honest empty state when there's nothing (or when signed out).
 *
 * THREE THINGS THIS SCREEN NOW DOES THAT IT DIDN'T:
 *   • it is LIVE — `useNotifications` polls and revalidates on focus, so a
 *     kudos or an approval that lands while you're looking at it appears with
 *     no reload, and the header bell counts the same list;
 *   • it MARKS THINGS READ — opening it sweeps the visible rows read after a
 *     beat (long enough to see what's new), tapping one reads it immediately,
 *     and "Mark all read" does it on demand. The badge can reach zero;
 *   • it REMINDS YOU TO LOG HOW YOU FEEL — the immediate and recovery reads
 *     from feel-schedule ride at the top of the list, and route to the place
 *     that can answer them.
 *
 * Works in BOTH templates: `embedded` (in the app-shell, reached from the
 * sidebar / ⌘K / the header bell) drops the full-screen chrome + back button;
 * standalone (/notifications, e.g. from the landing bell) keeps them. Radii
 * soften under Aurora.
 */

/** How long the "New" markers stay visible before the list is swept read. */
const SWEEP_MS = 1500;

export default function NotificationsScreen({
  embedded = false,
  onNavigate,
  onOpenSession,
}: {
  embedded?: boolean;
  onNavigate?: (screen: string) => void;
  onOpenSession?: (id: string) => void;
}) {
  const router = useRouter();
  const { t } = useLang();
  const aurora = useTemplate().template === "aurora";
  const r = { card: aurora ? 24 : 12, field: aurora ? 14 : 10 };
  const { items, unread, refresh } = useNotifications();

  // Which rows were unread AT ANY POINT during this visit. The sweep below
  // clears the badge within a second and a half; without this the highlights
  // would vanish under the reader's eyes at the same moment, which is the
  // opposite of telling them what's new.
  const wasNew = useRef(new Set<string>());
  for (const it of items) if (!it.read) wasNew.current.add(it.id);

  // THE SWEEP. Deliberately not instant: a badge that empties before the eye
  // reaches the list has told the athlete nothing. Re-armed whenever a new
  // unread row arrives while the screen is open.
  useEffect(() => {
    if (!unread) return;
    const snapshot = items.map((i) => ({ id: i.id, at: i.at }));
    const timer = window.setTimeout(() => readAllNotifications(snapshot), SWEEP_MS);
    return () => window.clearTimeout(timer);
  }, [unread, items]);

  const respond = async (n: NotifItem, accept: boolean) => {
    const s = n.social;
    if (!s) return;
    if (s.kind === "follow_request" && s.followerId) {
      await fetch("/api/social/follow/respond", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ followerId: s.followerId, action: accept ? "approve" : "deny" }) });
    } else if (s.kind === "enroll_request" && s.enrollmentId) {
      await fetch("/api/coach/enrollments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enrollmentId: s.enrollmentId, action: accept ? "accept" : "decline" }) });
    }
    readNotification(n.id);
    refresh();
  };

  // Standalone (/notifications) has no shell to switch, so it hands the screen
  // over in the deep link the shell already reads on mount.
  const go = (screen: string) => (onNavigate ? onNavigate(screen) : router.push(`/app?s=${screen}`));

  const open = (n: NotifItem) => {
    readNotification(n.id);
    const a = n.action;
    if (!a) return;
    if (a.kind === "session") {
      if (onOpenSession) onOpenSession(a.sessionId);
      else go("history");
    } else if (a.kind === "checkin") go("checkin");
    else if (a.kind === "calendar") go("calendar");
    else if (a.kind === "social") go("feed");
  };

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
            <button className="pressable" onClick={() => router.push("/app")} aria-label={t("w.account.notifications.back")} style={{ width: 44, height: 44, borderRadius: r.field, border: `1px solid ${C("line")}`, background: "var(--back-surface)", boxShadow: "var(--back-shadow)", color: C("chalk"), cursor: "pointer", display: "grid", placeItems: "center" }}>
              {aurora ? <AuroraIcon name="back" size={20} /> : <span style={{ fontSize: fs.heading }}>←</span>}
            </button>
          )}
          <h1 style={{ fontWeight: 900, fontSize: 24, margin: 0 }}>{t("w.account.notifications.title")}</h1>
          {/* The count is UNREAD, not "how much training happened" — so it can
              reach zero, and disappears when it does. */}
          {unread > 0 && (
            <span aria-label={`${unread} ${t("notif.unread")}`} style={{ marginLeft: "auto", background: C("lime"), color: "var(--on-accent)", borderRadius: 999, padding: "3px 10px", fontFamily: "var(--font-mono)", fontSize: fs.nano }}>{unread}</span>
          )}
        </div>

        {/* Mark-all-read rides the head's right edge in the metadata voice —
            the Explore SectionHead standard, not a button bar. */}
        {unread > 0 && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
            <button
              className="pressable"
              onClick={() => readAllNotifications(items.map((i) => ({ id: i.id, at: i.at })))}
              style={{ background: "transparent", border: "none", padding: 0, color: C("ash"), fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".08em", cursor: "pointer" }}
            >
              {t("notif.markAllRead")}
            </button>
          </div>
        )}

        {items.length === 0 ? (
          <div style={{ marginTop: 22, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: r.card, padding: 20, color: C("ash"), fontSize: fs.bodyLg, lineHeight: 1.5 }}>
            {t("w.account.notifications.empty")}
          </div>
        ) : (
          <div style={{ marginTop: 18 }}>
            {items.map((it) => {
              const isNew = wasNew.current.has(it.id);
              const col = accent(it.accent);
              const initial = (it.social?.actor?.displayName || it.social?.actor?.handle || "·").slice(0, 1).toUpperCase();
              return (
                <div
                  key={it.id}
                  className="pressable"
                  role="button"
                  tabIndex={0}
                  onClick={() => open(it)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(it); } }}
                  style={{ display: "flex", gap: space.md, alignItems: "center", marginBottom: 14, cursor: "pointer", textAlign: "left" }}
                >
                  <div style={{ width: 46, height: 46, borderRadius: r.field, background: `color-mix(in srgb, ${col} ${isNew ? 18 : 10}%, transparent)`, display: "grid", placeItems: "center", flexShrink: 0, fontFamily: "var(--font-display)", fontWeight: 800, color: col }}>
                    {it.source === "social" ? initial : <AuroraIcon name={it.icon} size={22} color={col} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Unread carries WEIGHT and full chalk; read recedes to ash.
                        The state is legible before the dot is even noticed. */}
                    <div style={{ fontWeight: isNew ? 800 : 600, fontSize: fs.bodyLg, lineHeight: 1.3, color: isNew ? C("chalk") : C("ash") }}>
                      {it.titleKey ? t(it.titleKey) : it.title}
                    </div>
                    {it.detail && (
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.detail}</div>
                    )}
                    {it.actionable && (
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button className="pressable" onClick={(e) => { e.stopPropagation(); void respond(it, true); }} style={{ padding: "5px 12px", borderRadius: 999, border: `1px solid ${C("lime")}`, background: C("lime"), color: "var(--on-accent)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{it.social?.kind === "enroll_request" ? "Accept" : "Approve"}</button>
                        <button className="pressable" onClick={(e) => { e.stopPropagation(); void respond(it, false); }} style={{ padding: "5px 12px", borderRadius: 999, border: `1px solid ${C("line")}`, background: "transparent", color: C("chalk"), fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{it.social?.kind === "enroll_request" ? "Decline" : "Deny"}</button>
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash") }}>{relativeTime(it.at)}</span>
                    {/* Semantic, not decoration: this row is unread. It sits on
                        the TRAILING edge so it can't read as a header marker. */}
                    {isNew && <span aria-label={t("notif.new")} style={{ width: 7, height: 7, borderRadius: 999, background: C("lime") }} />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
