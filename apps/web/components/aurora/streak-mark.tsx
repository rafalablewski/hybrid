"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { STREAK_MARK, STREAK_ARIA_KEY, STREAK_SUFFIX_KEY, STREAK_DESTINATION, streak, type StreakRung } from "@hybrid/core";
import { useSessions } from "@/lib/use-sessions";
import { useLang } from "@/lib/i18n";
import { AuroraIcon } from "./icons";

/**
 * THE STREAK MARK — web.
 *
 * The exact twin of apps/mobile/components/aurora/streak-mark.tsx, off the same
 * contract (packages/core/src/streak-mark.ts): the flame and the count,
 * wherever the day-streak is shown — under the wordmark in the app header, in
 * the done-today sheet's sub line, under the profile's heat-map.
 *
 * IT IS A CONTROL. Tapping it opens the training HISTORY, from every surface,
 * and the destination is NOT a prop. Three copies of this mark had drifted into
 * three looks and three behaviours — including a chartreuse "17d" on the
 * profile that did nothing at all — because each site decided everything about
 * it locally.
 *
 * IT SOURCES ITS OWN COUNT from the shared sessions cache, through the same
 * core `streak()` every other reader uses, and renders NOTHING when the streak
 * is zero.
 */
export function StreakMark({
  /** `hairline` (default) standing alone; `inline` inside a line of mono copy.
   *  See STREAK_MARK — two densities of one mark, never two designs. */
  rung = "hairline",
  /** The app-shell's screen switch, when the mark is rendered inside it. */
  onNavigate,
  /** Close whatever the mark is inside before it leaves — a sheet, chiefly.
   *  The only thing a caller may say about the tap. */
  onDismiss,
}: {
  rung?: StreakRung;
  onNavigate?: (screen: string) => void;
  onDismiss?: () => void;
}) {
  const { t } = useLang();
  const router = useRouter();
  const { sessions } = useSessions();
  const days = useMemo(() => streak(sessions, 1).current, [sessions]);
  if (days <= 0) return null;

  const type = STREAK_MARK[rung];
  return (
    <button
      className="pressable"
      onClick={() => {
        onDismiss?.();
        if (onNavigate) onNavigate(STREAK_DESTINATION);
        else router.push(`/${STREAK_DESTINATION}`);
      }}
      aria-label={t(STREAK_ARIA_KEY).replace("{n}", String(days))}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: type.gap,
        padding: "2px 8px",
        margin: "0 -8px",
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "var(--red-text)",
        fontFamily: "var(--font-mono)",
        fontSize: type.size,
        fontWeight: 600,
        letterSpacing: `${type.tracking}px`,
        textTransform: type.caps ? "uppercase" : "none",
        whiteSpace: "nowrap",
      }}
    >
      <AuroraIcon name="flame" size={type.icon} color="var(--red-text)" />
      {days}{t(STREAK_SUFFIX_KEY)}
    </button>
  );
}

export default StreakMark;
