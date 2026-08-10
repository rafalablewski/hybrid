"use client";

import { sportForDiscipline, fs, space, type CardioDiscipline, type LoggedSession } from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import { HeroScreen } from "./hero";
import AuroraEnduranceLanes from "./endurance-lanes";

/**
 * AURORA Endurance — the COMPARISON. The web twin of
 * apps/mobile/components/aurora/endurance.tsx.
 *
 * This screen used to be per-discipline analytics behind a chip picker: pick
 * running, read running's volume, pace and zones. Every one of those numbers now
 * lives on the sport's OWN page (sport-page.tsx), which reads them in the
 * sport's own units and carries its transfer work besides — so the hub was
 * answering the same question in a second place, with different chrome, and the
 * two would have drifted.
 *
 * The app now has one destination per depth, and this is the widest:
 *
 *   ALL your endurance (here) → ONE sport (the sport page) → ONE move (the
 *   exercise page, which owns per-move pace analytics).
 *
 * So the hub keeps the thing only it can do — every discipline side by side,
 * sortable — and every lane opens that sport's page.
 */
export default function AuroraEndurance({
  sessions,
  onOpenSport,
}: {
  sessions: LoggedSession[];
  /** Opens one sport's page. A lane whose discipline has no catalog sport
   *  (walking, generic cardio) shows no exit rather than a dead button. */
  onOpenSport?: (sport: string) => void;
}) {
  const { t } = useLang();
  const C = (v: string) => `var(--color-${v})`;

  return (
    <HeroScreen hero={{ rank: "title", title: t("endurance.title") }}>
      <div style={{ maxWidth: 900, margin: "0 auto", color: C("chalk") }}>
        {/* NO INTRO PARAGRAPH. It read "Every endurance discipline you train,
            side by side. Open one for its own page." — one sentence describing
            a layout that is visible the instant the sentence is, and one
            narrating an affordance the rails already carry: each ends in a
            ringed arrow, which is this codebase's own promise that the thing
            leaves. A caption explaining an arrow is a caption saying the arrow
            failed. The screen opens on the lanes, which is what the screen is.
            Mirrors mobile. */}
        <AuroraEnduranceLanes
          sessions={sessions}
          head={false}
          cap={Infinity}
          canOpen={(d: CardioDiscipline) => !!onOpenSport && !!sportForDiscipline(d)}
          onOpen={(d: CardioDiscipline) => {
            const sport = sportForDiscipline(d);
            if (sport) onOpenSport?.(sport);
          }}
        />

        {/* The lanes block renders nothing at all when no endurance is logged —
            a lane exists because something is in it — so the screen states the
            empty case itself. */}
        {sessions.length === 0 && (
          <div style={{ textAlign: "center", padding: `${space.huge}px 0` }}>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.heading }}>{t("endurance.emptyTitle")}</div>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("ash"), lineHeight: 1.6, maxWidth: 460, margin: "10px auto 0" }}>{t("endurance.emptyBody")}</p>
          </div>
        )}
      </div>
    </HeroScreen>
  );
}
