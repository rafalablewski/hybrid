"use client";

import { useState } from "react";
import { LINE, LIME, VIOLET, ASH, CHALK, cond, Mono, Chip, txt } from "@/lib/ui";

// Calls the server-side AI coach (/api/ai-coach). Shows the generated note and
// whether it came from the LLM or the engine fallback.
export default function AskCoach() {
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
          ...cond,
          fontSize: 12,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: ".04em",
          color: txt(VIOLET),
          background: `${VIOLET}1f`,
          border: `1px solid ${VIOLET}55`,
          borderRadius: 8,
          padding: "8px 14px",
          cursor: busy ? "default" : "pointer",
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? "Thinking…" : "Ask the AI coach →"}
      </button>

      {text && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${LINE}` }}>
          {source && (
            <Chip c={source === "ai" ? LIME : ASH}>{source === "ai" ? "Claude" : "Engine"}</Chip>
          )}
          <Mono s={{ fontSize: 13, lineHeight: 1.5, display: "block", marginTop: 6 }} c={CHALK}>
            {text}
          </Mono>
        </div>
      )}
    </div>
  );
}
