"use client";

import { useMemo } from "react";
import {
  doneReceipt,
  feelSamples,
  loadBaseline,
  sessionIcon,
  type LoggedSession,
} from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import Sheet from "./sheet";
import { FeelPrompt } from "./feel-prompt";

const C = (v: string) => `var(--color-${v})`;

/**
 * RATE THIS SESSION — the question, brought to wherever the session already is.
 *
 * "How hard was that" is the one figure of a session that has to come from the
 * athlete: a watch measures the distance, the pace, the heart rate and the
 * calories, and none of that says what the session COST. Effort × minutes is
 * the internal load every downstream model reads (core/session-feel.ts), so a
 * session with no rating is a session the week's load silently under-counts.
 *
 * Until now the only place to answer was the Wrapped's panel — reachable by
 * opening the session and scrolling past six full-screen panels. That is a fine
 * home for a session you deliberately went back to; it is not a home for the
 * ask itself, and an imported workout (nobody typed it, so nobody was asked)
 * would sit unrated forever. This sheet is the same prompt, one tap from the
 * row it belongs to — the Today floor's rows, the device-import receipt.
 *
 * It owns no state and no question of its own: it is the shared FeelPrompt with
 * the session's name over it, so there is exactly one rating instrument in the
 * app and no chance of the two drifting.
 *
 * Mobile parity: apps/mobile/components/feel-sheet.tsx.
 */
export default function FeelSheet({
  session,
  sessions,
  open,
  onClose,
}: {
  /** The session being rated. Null keeps the sheet mounted but empty while it
   *  animates out, so the copy never blanks mid-dismissal. */
  session: LoggedSession | null;
  /** The athlete's log — the "vs your usual" baseline is computed from it. */
  sessions: LoggedSession[];
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useLang();
  // NO BODYWEIGHT IS PASSED, and that is deliberate rather than an omission:
  // both figures on this sheet are minutes-based. A felt load is effort ×
  // duration, and a duration is a duration whatever the athlete weighs — the
  // bodyweight argument these two helpers accept only ever reaches the receipt's
  // TONNAGE, which nothing here reads. Threading a lookup through every caller
  // to feed a term that cannot move the answer is how props go stale.
  //
  // DEVICE-FIRST MINUTES. doneReceipt reads through the device projection, so a
  // session matched to a watch is rated against the duration the watch measured
  // — the same number the summary and every engine use. Rating a 52-minute run
  // as a 60-minute one because that is what got typed would put a wrong load in
  // the model at the exact moment the athlete is being careful.
  const minutes = useMemo(() => (session ? doneReceipt(session).durationMin : null), [session]);
  // The athlete against THEMSELVES over the last month, this session excluded.
  const baseline = useMemo(
    () => loadBaseline(feelSamples(sessions), { excludeId: session?.id }),
    [sessions, session?.id],
  );

  return (
    <Sheet open={open} onClose={onClose} label={t("session.feel.q")} maxWidth={520}>
      {session && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
            <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: "grid", placeItems: "center", fontSize: 18, background: `color-mix(in srgb, ${C("blue")} 16%, transparent)` }}>
              {sessionIcon(session)}
            </span>
            <span style={{ flex: 1, minWidth: 0, fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18, letterSpacing: "-.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {session.title}
            </span>
          </div>
          <FeelPrompt
            sessionId={session.id}
            minutes={minutes}
            initialFeel={session.feel ?? null}
            initialFatigue={session.fatigue ?? null}
            sessionEnd={session.completedAt ?? session.startedAt ?? null}
            baseline={baseline}
          />
        </>
      )}
    </Sheet>
  );
}
