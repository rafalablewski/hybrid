"use client";

import { useState } from "react";
import { fs, HELP_ROWS, SUPPORT_EMAIL, supportMailto, type HelpRow } from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import { HeroScreen } from "./hero";
import { AuroraIcon } from "./icons";

const C = (v: string) => `var(--color-${v})`;

/**
 * HELP CENTER (web) — the third row in the side menu's footer, mirrored on
 * mobile by apps/mobile/app/help.tsx. The rows, their order and their words are
 * shared (@hybrid/core help.ts); only the plumbing behind each action is
 * per-client.
 *
 * Every row does something that exists today: it replays the real first-run
 * tour, opens a mailbox that receives mail, walks into the request-access flow
 * inside Settings, or opens the published legal pages. There is deliberately no
 * article index and no search box — we have no articles, and a search field
 * over nothing is the worst kind of placeholder.
 */
export default function AuroraHelpCenter({
  onNavigate,
  onReplayTour,
}: {
  onNavigate: (id: string) => void;
  /** Re-arm the first-run guided tour and land back on Today. */
  onReplayTour: () => void;
}) {
  const { t } = useLang();
  // The tour is the one row with no destination — it arms something that
  // happens on the NEXT screen, so it confirms in place rather than leaving.
  const [tourArmed, setTourArmed] = useState(false);

  const act = (row: HelpRow) => {
    switch (row.action.kind) {
      case "tour":
        setTourArmed(true);
        onReplayTour();
        return;
      case "mail":
        window.location.href = supportMailto();
        return;
      case "screen":
        onNavigate(row.action.screen);
        return;
      case "web":
        window.open(row.action.path, "_blank", "noopener");
        return;
    }
  };

  return (
    <HeroScreen hero={{ rank: "title", title: t("help.title"), eyebrow: t("nav.group.account") }} back={false}>
      <p style={{ margin: "12px 0 0", fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("ash") }}>{t("help.intro")}</p>

      <div style={{ marginTop: 18, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, overflow: "hidden" }}>
        {HELP_ROWS.map((row, i) => (
          <button
            className="pressable"
            key={row.id}
            onClick={() => act(row)}
            style={{
              display: "flex", alignItems: "center", gap: 14, width: "100%",
              padding: "16px 18px", textAlign: "left", cursor: "pointer",
              background: "none", border: "none",
              borderTop: i === 0 ? "none" : `1px solid ${C("line")}`,
              fontFamily: "var(--font-display)",
            }}
          >
            <span style={{ display: "grid", placeItems: "center", width: 32, height: 32, borderRadius: 999, border: `1px solid ${C("line")}`, flexShrink: 0 }}>
              <AuroraIcon name={row.icon} size={16} strokeWidth={4.5} color={C("chalk")} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 700, fontSize: fs.bodyLg, color: C("chalk") }}>{t(row.titleKey)}</span>
              <span style={{ display: "block", marginTop: 3, fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash") }}>
                {row.id === "tour" && tourArmed ? t("help.tourDone") : row.id === "contact" ? SUPPORT_EMAIL : t(row.bodyKey)}
              </span>
            </span>
            <span aria-hidden style={{ fontSize: fs.note, color: C("ash") }}>›</span>
          </button>
        ))}
      </div>
    </HeroScreen>
  );
}
