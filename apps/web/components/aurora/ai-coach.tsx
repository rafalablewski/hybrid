"use client";

import { useState } from "react";

const C = (v: string) => `var(--color-${v})`;

/** AURORA Ask-the-AI-coach (web) — same /api/ai-coach call + source badge as the
 *  classic, in the rounded Aurora style. */
export default function AuroraAskCoach() {
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
        setText("Sign in to get a personalized coaching note.");
        setSource("");
      }
    } catch {
      setText("Couldn't reach the coach — try again.");
      setSource("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 12 }}>
      <button
        onClick={ask}
        disabled={busy}
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 13,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: ".04em",
          color: C("violet"),
          background: `color-mix(in srgb, ${C("violet")} 14%, transparent)`,
          border: `1px solid color-mix(in srgb, ${C("violet")} 40%, transparent)`,
          borderRadius: 999,
          padding: "10px 18px",
          cursor: busy ? "default" : "pointer",
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? "Thinking…" : "Ask the AI coach →"}
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
                fontSize: 11,
              }}
            >
              {source === "ai" ? "Claude" : "Engine"}
            </span>
          )}
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 1.5, marginTop: 8, color: C("chalk") }}>
            {text}
          </div>
        </div>
      )}
    </div>
  );
}
