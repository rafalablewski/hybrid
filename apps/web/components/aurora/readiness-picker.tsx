"use client";

import { useState } from "react";
import { fs } from "@hybrid/core";
import { useRevalidate } from "@/lib/use-invalidate";
import { useLang } from "@/lib/i18n";

const C = (v: string) => `var(--color-${v})`;

// Four readiness levels → a representative 1–5 rating written to the SAME daily
// check-in the full form logs, so a quick tap still lands in check-in history +
// weekly compliance and reaches a linked coach. Each level shows a minimal face
// (eyes + mouth, no ring) whose expression reads the feeling — grin → smile →
// flat → frown — in the semantic accent colour (green→blue→amber→terracotta).
const LEVELS: { key: string; dot: string; rating: number; mouth: string }[] = [
  { key: "primed", dot: "lime", rating: 5, mouth: "M12 23 Q20 31 28 23" },
  { key: "good", dot: "blue", rating: 4, mouth: "M13 23 Q20 30 27 23" },
  { key: "flat", dot: "amber", rating: 3, mouth: "M13 25 L27 25" },
  { key: "wrecked", dot: "red", rating: 2, mouth: "M13 28 Q20 21 27 28" },
];

/** Minimal readiness face — two eyes + a mood-shaped mouth, drawn in the level's
 *  accent colour. No enclosing ring (mirrors the mobile plain-View face). */
function Face({ color, mouth }: { color: string; mouth: string }) {
  return (
    <svg width={30} height={30} viewBox="0 0 40 40" fill="none" aria-hidden style={{ flexShrink: 0 }}>
      <circle cx={13} cy={16} r={2.3} fill={color} />
      <circle cx={27} cy={16} r={2.3} fill={color} />
      <path d={mouth} stroke={color} strokeWidth={2.8} strokeLinecap="round" fill="none" />
    </svg>
  );
}

/**
 * AURORA Readiness picker (web) — the compact "How ready do you feel?" quick
 * action (the Today Readiness sheet). One tap logs today's readiness; the full
 * weekly check-in (weight, note, share-with-coach, history) still lives on its
 * own screen. Mirrors the mobile ReadinessPicker.
 */
export default function ReadinessPicker({ onDone }: { onDone?: () => void }) {
  const { t } = useLang();
  const revalidate = useRevalidate();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const pick = async (key: string, rating: number) => {
    if (busy) return;
    setBusy(key); setErr("");
    try {
      const res = await fetch("/api/checkins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekOf: new Date().toISOString(), energy: rating, sleep: rating, soreness: rating, mood: rating }),
      });
      if (res.status === 401) { setErr(t("w.recovery.checkins.errSignIn")); setBusy(null); return; }
      if (!res.ok) { setErr(`${t("w.recovery.checkins.errSubmit")} (HTTP ${res.status}).`); setBusy(null); return; }
      revalidate.recovery();
      onDone?.();
    } catch { setErr(t("w.recovery.checkins.errNetwork")); setBusy(null); }
  };

  return (
    <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
      {LEVELS.map((l) => (
        <button
          key={l.key}
          onClick={() => pick(l.key, l.rating)}
          disabled={!!busy}
          aria-label={`${t(`w.recovery.readiness.${l.key}`)} — ${t(`w.recovery.readiness.${l.key}Sub`)}`}
          style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", textAlign: "left", background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: 16, cursor: busy ? "default" : "pointer", color: C("chalk"), opacity: busy && busy !== l.key ? 0.5 : 1 }}
        >
          <Face color={C(l.dot)} mouth={l.mouth} />
          <span style={{ flex: 1 }}>
            <span style={{ display: "block", fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.subtitle }}>{t(`w.recovery.readiness.${l.key}`)}</span>
            <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".08em", color: C("ash"), marginTop: 3 }}>{t(`w.recovery.readiness.${l.key}Sub`)}</span>
          </span>
        </button>
      ))}
      {err && <div role="alert" style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("red") }}>{err}</div>}
    </div>
  );
}
