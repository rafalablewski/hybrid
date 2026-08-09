"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { APP_HEADER, APP_HEADER_HEIGHT, avatarInitials, computeAccountability, unreadLabel, type TodayTabId } from "@hybrid/core";
import { useSession } from "@/lib/session";
import { useSessions } from "@/lib/use-sessions";
import { useNotifications } from "@/lib/use-notifications";
import { useLang } from "@/lib/i18n";
import { fs } from "@/lib/ui";
import { AuroraIcon } from "./icons";
import AuroraSideMenu from "./side-menu";

const C = (v: string) => `var(--color-${v})`;

/**
 * THE APP HEADER — web.
 *
 * The exact twin of apps/mobile/components/aurora/app-header.tsx: avatar, the
 * HYBRID wordmark with the day-streak under it, the bell. Both clients import
 * every number from packages/core/src/app-header.ts, so the row can only be
 * changed for both at once — which is the reason it exists. It shipped inline
 * in Today on each client under a comment saying "mirrors the other", and the
 * tiles were already 44 here against 42 there, with "A" standing in for a
 * nameless athlete on this side and "·" on that one.
 *
 * IT SOURCES ITS OWN DATA (the shared session, the shared sessions query, the
 * shared notifications feed), so a second tab root wears the identical head by
 * rendering the component — nothing to thread through, nothing to recompute a
 * second way.
 *
 * A screen passes DATA and cannot pass style.
 */
export function AppHeader({
  /** The app-shell's screen switch, when the header is rendered inside it. */
  onNavigate,
  /** What the streak caption opens. Today hands it the done-today sheet, which
   *  is Today's own and day-scoped. A tab with nothing to show for it renders
   *  the caption as plain text rather than a button that goes nowhere. */
  onStreak,
  /** Present only on the Today hub: the drawer's three hub rows switch the hub
   *  IN PLACE there. Everywhere else they are ordinary destinations. */
  hub,
}: {
  onNavigate?: (screen: string) => void;
  onStreak?: () => void;
  hub?: { value: TodayTabId; onChange: (tab: TodayTabId) => void };
}) {
  const { t } = useLang();
  const router = useRouter();
  const { session } = useSession();
  const { sessions } = useSessions();
  const [menuOpen, setMenuOpen] = useState(false);
  const streak = useMemo(() => computeAccountability(sessions, { targetPerWeek: 3 }).streak.current, [sessions]);
  // The bell badge is the UNREAD count from the shared notifications feed — the
  // same list the screen renders, so the two cannot disagree, and it reaches
  // zero once the athlete has read it.
  const { unread: notifCount } = useNotifications();
  const initials = avatarInitials(session?.name);
  const go = (screen: string) => (onNavigate ? onNavigate(screen) : router.push(`/${screen}`));

  const tile = { position: "relative", width: APP_HEADER.tile.size, height: APP_HEADER.tile.size, borderRadius: APP_HEADER.tile.radius, display: "grid", placeItems: "center", cursor: "pointer" } as const;
  const streakStyle = { display: "inline-flex", alignItems: "center", gap: APP_HEADER.streak.gap, marginTop: APP_HEADER.streak.top, padding: "2px 8px", background: "none", border: "none", color: "var(--red-text)", fontFamily: "var(--font-mono)", fontSize: APP_HEADER.streak.size, fontWeight: 600, letterSpacing: `${APP_HEADER.streak.tracking}px`, textTransform: "uppercase", whiteSpace: "nowrap" } as const;
  const streakLine = (
    <>
      <AuroraIcon name="flame" size={APP_HEADER.streak.icon} color="var(--red-text)" />
      {streak}{t("w.home.today.dayStreak")}
    </>
  );

  return (
    <>
      {/* THREE COLUMNS, FIXED FLANKS. The row used to be `space-between`, which
          centres its middle child only when both flanks weigh the same — and
          they never did: one tile on the left against a streak pill plus the
          bell on the right. A fixed tile / 1fr / fixed tile grid centres the
          wordmark BY CONSTRUCTION, whatever the flanks carry. */}
      <div style={{ display: "grid", gridTemplateColumns: `${APP_HEADER.tile.size}px 1fr ${APP_HEADER.tile.size}px`, alignItems: "center", height: APP_HEADER_HEIGHT, marginBottom: APP_HEADER.gap.below }}>
        {/* The avatar opens the SIDE MENU (aurora/side-menu.tsx), the drawer
            that carries Profile, History, the three hub views, Nutrition and
            the whole toolbox. */}
        <button
          className="pressable"
          onClick={() => setMenuOpen(true)}
          aria-label={t("nav.openMenu")}
          aria-expanded={menuOpen}
          aria-haspopup="dialog"
          style={{ ...tile, background: `${C("lime")}22`, border: `1px solid ${C("lime")}`, fontFamily: "var(--font-display)", fontWeight: 900, fontSize: fs.bodyLg, color: "var(--lime-text)" }}
        >
          {initials}
        </button>

        {/* the lockup — the wordmark, and the day-streak on the line under it */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifySelf: "center" }}>
          <div style={{ fontWeight: 900, fontSize: APP_HEADER.wordmark.size, letterSpacing: `${APP_HEADER.wordmark.tracking}px`, lineHeight: 1, color: C("chalk") }}>
            HYBRID<span style={{ color: "var(--lime-text)" }}>.</span>
          </div>
          {/* SPECTRUM: the streak wears the warm terracotta accent (Connect),
              pairing with the flame and keeping chartreuse for the primary
              action. */}
          {streak > 0 && (
            onStreak
              ? <button className="pressable" onClick={onStreak} style={{ ...streakStyle, cursor: "pointer" }}>{streakLine}</button>
              : <span style={streakStyle}>{streakLine}</span>
          )}
        </div>

        <button className="pressable" onClick={() => go("notifications")} aria-label={t("w.home.today.notificationsAria")} style={{ ...tile, background: C("ink2"), border: `1px solid ${C("line")}` }}>
          <AuroraIcon name="bell" size={20} color={C("ash")} />
          {notifCount > 0 && (
            <span style={{ position: "absolute", top: APP_HEADER.badge.inset, right: APP_HEADER.badge.inset, minWidth: APP_HEADER.badge.size, height: APP_HEADER.badge.size, padding: "0 4px", borderRadius: 999, background: C("red"), border: `${APP_HEADER.badge.ring}px solid ${C("ink")}`, display: "grid", placeItems: "center", fontFamily: "var(--font-mono)", fontSize: APP_HEADER.badge.text, fontWeight: 700, color: "#fff" }}>
              {unreadLabel(notifCount)}
            </span>
          )}
        </button>
      </div>

      {/* The drawer rides with the header, on every tab root that wears it. It
          portals to <body>, so it is not trapped by the shell's transformed
          surface. */}
      <AuroraSideMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onNavigate={go}
        onHubTab={hub?.onChange}
        activeHub={hub?.value}
      />
    </>
  );
}

export default AppHeader;
