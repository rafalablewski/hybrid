"use client";

import { useState } from "react";
import { fs } from "@hybrid/core";
import { useLang } from "@/lib/i18n";


const C = (v: string) => `var(--color-${v})`;

/** AURORA Ask-the-AI-coach (web) — same /api/ai-coach call + source badge as the
 *  classic, in the rounded Aurora style. */
export default function AuroraAskCoach() {
  const { t } = useLang();
  const [text, setText] = useState("");
  const [source, setSource] = useState<"ai" | "engine" | "">("");
  const [busy, setBusy] = useState(false);

  const ask = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/ai-coach", { method: "POST" });
      if (res.ok) {
        const j = (await res.json()) as { text?: string; source?: "ai" | "engine" };
        setText(j.text ?? "");
        setSource(j.source ?? "");
      } else {
        setText(t("w.home.aicoach.signIn"));
        setSource("");
      }
    } catch {
      setText(t("w.home.aicoach.couldntReach"));
      setSource("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 12 }}>
      <button className="pressable"
        onClick={ask}
        disabled={busy}
        style={{
          fontFamily: "var(--font-display)",
          fontSize: fs.body,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: ".08em",
          color: "var(--lime-text)",
          background: `color-mix(in srgb, ${C("lime")} 14%, transparent)`,
          border: `1px solid color-mix(in srgb, ${C("lime")} 40%, transparent)`,
          borderRadius: 999,
          padding: "10px 16px",
          cursor: busy ? "default" : "pointer",
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? t("w.home.aicoach.thinking") : t("w.home.aicoach.ask")}
      </button>

      {text && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C("line")}` }}>
          {source && (
            <span
              style={{
                background: `color-mix(in srgb, ${source === "ai" ? C("lime") : C("ash")} 14%, transparent)`,
                color: source === "ai" ? C("lime") : C("ash"),
                borderRadius: 999,
                padding: "3px 12px",
                fontFamily: "var(--font-mono)",
                fontSize: fs.micro,
              }}
            >
              {source === "ai" ? "Claude" : t("w.home.aicoach.engine")}
            </span>
          )}
          {/* Coaching PROSE in the display sans (reads like a coach talking),
              not mono (which reads like a terminal log); chips stay mono. */}
          <div style={{ fontFamily: "var(--font-display)", fontSize: 15, lineHeight: 1.55, marginTop: 8, color: C("chalk") }}>
            {text}
          </div>
        </div>
      )}
    </div>
  );
}
