"use client";

import { useEffect } from "react";

// Last-resort boundary for errors thrown in the root layout itself (where the
// normal error.tsx can't render because it lives *inside* the layout). Must
// render its own <html>/<body>.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error boundary:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
          padding: 24,
          background: "#0c0d0c",
          color: "#f7f6f3",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: "-.02em" }}>
          Something went wrong
        </h1>
        <p style={{ color: "#8b8f86", maxWidth: 420, margin: 0, lineHeight: 1.5 }}>
          The app failed to start. Please retry.
          {error.digest ? ` (ref: ${error.digest})` : ""}
        </p>
        {/* Same detail block as error.tsx and the mobile boundary: a crash you
            cannot read is a crash you cannot report. */}
        <pre
          style={{
            maxWidth: 520,
            maxHeight: 190,
            overflow: "auto",
            margin: 0,
            padding: 14,
            textAlign: "left",
            borderRadius: 16,
            border: "1px solid #2f2f36",
            background: "#212126",
            color: "#8b8f86",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 11,
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {[error.name, error.message].filter(Boolean).join(": ")}
          {error.stack ? `\n\n${error.stack.split("\n").slice(1, 5).join("\n")}` : ""}
        </pre>
        <button className="pressable"
          onClick={reset}
          style={{
            padding: "11px 20px",
            borderRadius: 12,
            border: "none",
            cursor: "pointer",
            fontWeight: 700,
            background: "#c3d363",
            color: "#0c0d0c",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
