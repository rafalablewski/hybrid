"use client";

import { fs } from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import { HeroScreen } from "./hero";
import { AuroraIcon } from "./icons";

const C = (v: string) => `var(--color-${v})`;

/**
 * MESSAGES (web) — the bottom bar's fourth destination, mirrored on mobile by
 * apps/mobile/app/(tabs)/messages.tsx.
 *
 * IT IS A PLACEHOLDER, AND IT SAYS SO. Direct messages are not built: there is
 * no thread model, no delivery, no unread state. The screen exists because the
 * slot does — the bar spends its fourth tab here instead of on the retired More
 * springboard — and an empty room the athlete can walk into and read is a
 * better answer than a tab that opens nothing.
 *
 * What this screen must NEVER do is fake the feature: no sample threads, no
 * fabricated unread badge, no "3 new messages". The bar carries no badge for
 * this tab for the same reason. Tracked in capabilities.ts as `direct-messages`
 * (planned); when the real thing lands, this file is what it replaces.
 */
export default function AuroraMessages() {
  const { t } = useLang();
  return (
    <HeroScreen hero={{ rank: "title", title: t("messages.title"), eyebrow: t("nav.group.social") }} back={false}>
      <div
        style={{
          marginTop: 24,
          background: C("ink2"),
          border: `1px solid ${C("line")}`,
          borderRadius: 28,
          padding: 24,
          fontFamily: "var(--font-display)",
        }}
      >
        <AuroraIcon name="mail" size={28} strokeWidth={3} color={C("ash")} />
        <h2 style={{ margin: "14px 0 0", fontWeight: 800, fontSize: fs.heading, letterSpacing: "-.02em", color: C("chalk") }}>
          {t("messages.soonTitle")}
        </h2>
        <p style={{ margin: "8px 0 0", fontFamily: "var(--font-mono)", fontSize: fs.body, lineHeight: 1.55, color: C("ash"), maxWidth: 420 }}>
          {t("messages.soonBody")}
        </p>
        <p style={{ margin: "14px 0 0", fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash") }}>
          {t("messages.soonNote")}
        </p>
      </div>
    </HeroScreen>
  );
}
