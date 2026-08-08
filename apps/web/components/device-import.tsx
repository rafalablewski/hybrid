"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DEVICE_IMPORT_PROVIDERS,
  deviceImportMeta,
  deviceSourceLabel,
  isRated,
  type LoggedSession,
} from "@hybrid/core";
import { fs, INK, INK2, LINE, LIME, CHALK, ASH, disp, mono, Mono } from "@/lib/ui";
import { useLang } from "@/lib/i18n";
import { setLoggerPref, useLoggerPrefs } from "@/lib/logger-prefs";
import { DeviceMark } from "./aurora/device-mark";
import FeelSheet from "./aurora/feel-sheet";

/**
 * DEVICE IMPORT (web) — the parity half of "I trained on my watch".
 *
 * A health store is native, so the READ only ever happens on the phone (same
 * split as the summary's device match — see core/session-device.ts). What the
 * web owns is everything around it: the same entry point beside the quick-log,
 * the same auto-import switch, and the receipt — every session in the log that
 * carries a device's read, with the figures it measured.
 *
 * So an athlete who logs from the laptop still sees the wrist half of their
 * training here, and can turn the automatic pull on or off from either client.
 * The mobile sheet (apps/mobile/components/device-import.tsx) is where the
 * recordings are actually chosen and imported.
 *
 * The receipt is also where the web CAN do the half the phone does at import
 * time: a watch measures everything about a session except how hard it felt,
 * and an imported row therefore lands unrated — worth nothing to the load model
 * until someone answers. The phone asks the moment the import lands; here the
 * same question hangs off the row it belongs to, because the alternative (open
 * the session, scroll its summary to the last panel) is a thing nobody does.
 */
export default function DeviceImportPanel({
  sessions,
  onClose,
}: {
  sessions: LoggedSession[];
  onClose: () => void;
}) {
  const { t } = useLang();
  const prefs = useLoggerPrefs();
  // The imported session whose rating sheet is up. Null when it's closed.
  const [rating, setRating] = useState<LoggedSession | null>(null);

  useEffect(() => {
    // Escape belongs to the TOP surface: with the rating sheet up it dismisses
    // that, not the panel underneath it.
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !rating) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, rating]);

  // Every session the log holds that carries a device's read, newest first —
  // imported outright or matched by hand, they are the same thing here: what
  // the watch has put into the log.
  const measured = useMemo(
    () => sessions.filter((s) => s.device).slice(0, 12),
    [sessions],
  );

  const when = (isoTs: string) =>
    new Date(isoTs).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <>
    <div role="presentation" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("device.import.title")}
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 460, maxHeight: "82vh", display: "flex", flexDirection: "column", background: INK2, border: `1px solid ${LINE}`, borderRadius: 20, boxShadow: "0 24px 60px -20px rgba(0,0,0,.8)", overflow: "hidden" }}
      >
        <div style={{ padding: 20, borderBottom: `1px solid ${LINE}` }}>
          {/* A manufacturer's mark reproduces solid only — never the accent. */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <DeviceMark provider="apple" form="mark" height={14} on="dark" label="" />
            <span style={{ ...disp, fontWeight: 800, fontSize: fs.subtitle }}>{t("device.import.title")}</span>
          </div>
          <Mono s={{ fontSize: fs.caption, lineHeight: 1.55, display: "block", marginTop: 8 }} c={ASH}>
            {t("device.import.onPhone")}
          </Mono>
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: 20 }}>
          <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".12em", display: "block", marginBottom: 10 }} c={ASH}>
            {t("device.import.recent")}
          </Mono>
          {measured.length === 0 && (
            <Mono s={{ fontSize: fs.caption, display: "block" }} c={ASH}>{t("device.import.recentEmpty")}</Mono>
          )}
          {measured.map((s) => (
            <div key={s.id} style={{ border: `1px solid ${LINE}`, borderRadius: 14, padding: 13, marginBottom: 9, background: INK }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <DeviceMark provider={s.device!.provider} form="mark" height={11} on="dark" label={deviceSourceLabel(s.device) ?? undefined} />
                <span style={{ ...disp, fontWeight: 700, fontSize: fs.body, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
                {/* THE ONE FIGURE THE WATCH DIDN'T MEASURE. Bare lime type, no
                    chip: a bordered box here would read as one more measured
                    value in a card full of them. */}
                {!isRated(s) && (
                  <button
                    className="pressable"
                    onClick={() => setRating(s)}
                    title={t("session.feel.rateUnrated")}
                    aria-label={t("session.feel.rateA11y").replace("{title}", s.title)}
                    style={{ ...mono, flexShrink: 0, background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: fs.nano, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--lime-text)" }}
                  >
                    {t("session.feel.rate")}
                  </button>
                )}
              </div>
              <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 5 }} c={ASH}>
                {when(s.device!.start)} – {deviceImportMeta(s.device!).join(" – ")}
              </Mono>
            </div>
          ))}
        </div>

        {/* WHERE IT READS FROM — every provider the import shape supports, each
            saying where it stands. Garmin is wired end to end but has no reader
            yet, and says so rather than being hidden. */}
        <div style={{ padding: "16px 20px", borderTop: `1px solid ${LINE}` }}>
          <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".12em", display: "block", marginBottom: 10 }} c={ASH}>
            {t("device.import.sources")}
          </Mono>
          {DEVICE_IMPORT_PROVIDERS.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
              <DeviceMark provider={p.id} form="lockup" height={16} on="dark" label={deviceSourceLabel({ provider: p.id }) ?? undefined} />
              <span style={{ flex: 1 }} />
              <Mono s={{ fontSize: fs.caption }} c={p.status === "live" ? "var(--lime-text)" : ASH}>
                {t(p.status === "live" ? "device.import.live" : "device.import.placeholder")}
              </Mono>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: 18, borderTop: `1px solid ${LINE}` }}>
          <div style={{ flex: 1 }}>
            <span style={{ ...disp, fontWeight: 700, fontSize: fs.note, display: "block", color: CHALK }}>{t("device.import.autoTitle")}</span>
            <Mono s={{ fontSize: fs.micro, lineHeight: 1.45, display: "block", marginTop: 2 }} c={ASH}>{t("device.import.autoDesc")}</Mono>
          </div>
          <button className="pressable"
            role="switch"
            aria-checked={prefs.deviceAutoImport}
            aria-label={t("device.import.autoTitle")}
            onClick={() => setLoggerPref("deviceAutoImport", !prefs.deviceAutoImport)}
            style={{ ...mono, fontSize: fs.caption, whiteSpace: "nowrap", padding: "7px 13px", borderRadius: 999, cursor: "pointer", color: prefs.deviceAutoImport ? "var(--lime-text)" : ASH, background: prefs.deviceAutoImport ? `${LIME}1f` : "transparent", border: `1px solid ${prefs.deviceAutoImport ? LIME : LINE}` }}
          >
            {prefs.deviceAutoImport ? t("common.on") : t("common.off")}
          </button>
        </div>
      </div>
    </div>

    {/* The rating, over the receipt — a SIBLING of the scrim, not a child of
        it. The sheet portals to <body>, but React events still travel the
        component tree, so nested inside the scrim every tap on a face would
        also register as a click on "dismiss the panel". */}
    <FeelSheet session={rating} sessions={sessions} open={rating != null} onClose={() => setRating(null)} />
    </>
  );
}
