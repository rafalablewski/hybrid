"use client";

import { fs, liveElapsedText, tracking, type LiveAthlete } from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import { accentText } from "@/lib/ui";
import { C, Avatar } from "./social-ui";

/**
 * NOW TRAINING (web) — the live-presence strip, and our answer to stories.
 *
 * Stories are authored ephemera and lifters won't film themselves between
 * sets; presence is STATE the app already holds (an unfinished session), so
 * this costs the athlete nothing to produce. It answers the question people
 * actually ask each other: who's at the gym right now.
 *
 * Renders NOTHING when nobody is training — an empty rail advertising that
 * your circle is inactive is worse than no rail. Twin of the mobile strip.
 */

// FULL-BLEED per the house rule: negative margins the width of the screen
// gutter (--page-pad-x — 12px on mobile) pull the scroll clip to the true
// edge, with MATCHING internal padding so resting avatars still line up with
// the content column.
const rail: React.CSSProperties = {
  display: "flex",
  gap: 14,
  overflowX: "auto",
  scrollbarWidth: "none",
  margin: "0 calc(-1 * var(--page-pad-x, 12px)) 4px",
  padding: "2px var(--page-pad-x, 12px) 8px",
};

export default function FeedLiveStrip({ live, onOpen }: { live: LiveAthlete[]; onOpen: (handle: string) => void }) {
  const { t } = useLang();
  if (!live.length) return null;

  return (
    <section style={{ marginBottom: 10 }} aria-label={t("feed.live.title")}>
      {/* SectionHead idiom: display title left, mono meta right — never a
          decorative dot before the label. */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "2px 2px 8px" }}>
        <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.bodyLg, letterSpacing: tracking.display, color: C("chalk"), margin: 0 }}>
          {t("feed.live.title")}
        </h2>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: tracking.caps, textTransform: "uppercase", color: C("ash") }}>
          {t("feed.live.count").replace("{n}", String(live.length))}
        </span>
      </div>

      <div style={rail}>
        {live.map((l) => {
          const ring = accentText(l.accent === "blue" ? "blue" : "lime");
          const elapsed = liveElapsedText(l.elapsedMin);
          return (
            <button
              key={l.sessionId}
              className="pressable"
              onClick={() => onOpen(l.author.handle)}
              title={l.currentExercise ? `${l.title} — ${l.currentExercise}` : l.title}
              aria-label={t("feed.live.aria").replace("{name}", l.author.displayName || l.author.handle).replace("{time}", elapsed)}
              style={{ flex: "0 0 auto", width: 62, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, cursor: "pointer" }}
            >
              <span style={{ position: "relative", padding: 3, borderRadius: 999, border: `2px solid ${ring}`, lineHeight: 0 }}>
                <Avatar url={l.author.avatarUrl} name={l.author.displayName} handle={l.author.handle} size={44} />
                {/* A LIVE dot is semantic state, not decoration — the one place
                    a dot belongs (house rule). */}
                <span
                  className="live-dot"
                  style={{ position: "absolute", right: 0, bottom: 0, width: 12, height: 12, borderRadius: 999, background: accentText("red"), border: `2.5px solid ${C("ink")}` }}
                />
              </span>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: fs.nano, color: C("ash"), maxWidth: 62, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {(l.author.displayName || l.author.handle || "").split(" ")[0]}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: tracking.label, color: accentText("red") }}>{elapsed}</span>
            </button>
          );
        })}
      </div>

      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .live-dot { animation: hybrid-live-pulse 2s ease-in-out infinite; }
          @keyframes hybrid-live-pulse { 50% { transform: scale(0.78); } }
        }
      `}</style>
    </section>
  );
}
