"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { LoggedSession } from "@hybrid/core";
import { useSession } from "@/lib/session";
import { guestSessionsAsLogged } from "@/lib/guest";
import AuroraLogger from "@/components/aurora/logger";
import { fs, space, INK, INK2, LINE, LIME, CHALK, ASH, disp, mono, Mono, txt, GlassField } from "@/lib/ui";
import { useLang } from "@/lib/i18n";

/**
 * Guest training (web) — the pre-signup logger, at parity with mobile's guest
 * flow (welcome → /workout when signed out). A visitor can complete a real
 * workout WITHOUT an account: it's saved on-device and best-effort mirrored to
 * the backend as an AnonSession so an admin sees genuine pre-signup usage. On
 * sign-up the queued workouts flush into real Session history (see lib/guest).
 *
 * Signed-in users don't belong here — bounce them to the full app.
 */
export default function GuestTrainPage() {
  const router = useRouter();
  const { t } = useLang();
  const { session, ready } = useSession();

  // A guest is a signed-OUT visitor. Once auth resolves, a real session means
  // they should be in the full app, not the stripped guest logger.
  useEffect(() => {
    if (ready && session) router.replace("/app");
  }, [ready, session, router]);

  // Prior guest workouts (this device) back the logger's PR / "last time" cues,
  // exactly like a signed-in athlete's history. Snapshot once on mount — the
  // logger appends the new one on finish and we re-read on nav.
  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  useEffect(() => {
    setSessions(guestSessionsAsLogged());
  }, []);

  const heading = useMemo(() => t("welcome.aurora.guest"), [t]);

  if (!ready || session) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: INK }}>
        <Mono c={ASH}>…</Mono>
      </main>
    );
  }

  return (
    <div style={{ ...disp, background: INK, color: CHALK, minHeight: "100vh", position: "relative" }}>
      <GlassField />
      <div style={{ maxWidth: 620, margin: "0 auto", padding: "18px 16px 48px", position: "relative", zIndex: 1 }}>
        {/* lightweight guest chrome — brand + a clear way to make it permanent */}
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: space.md, marginBottom: 18 }}>
          <div style={{ ...disp, fontWeight: 900, fontSize: 22, letterSpacing: "-.04em" }}>
            HYBRID<span style={{ color: txt(LIME) }}>.</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: space.sm }}>
            <span
              style={{ ...mono, fontSize: fs.micro, color: txt(ASH), border: `1px solid ${LINE}`, borderRadius: 999, padding: "6px 12px", background: INK2 }}
            >
              {heading}
            </span>
            <button
              onClick={() => router.push("/login")}
              style={{ ...disp, fontWeight: 800, fontSize: fs.caption, color: txt(LIME), background: `color-mix(in srgb, ${LIME} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${LIME} 45%, transparent)`, borderRadius: 999, padding: "8px 16px", cursor: "pointer" }}
            >
              {t("w.account.login.login")}
            </button>
          </div>
        </header>

        <AuroraLogger
          guest
          sessions={sessions}
          onSaved={() => router.push("/login?mode=signup")}
          onHome={() => router.push("/")}
        />
      </div>
    </div>
  );
}
