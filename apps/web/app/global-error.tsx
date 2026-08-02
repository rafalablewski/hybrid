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
          color: "#f3f4ef",
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
        <button className="pressable"
          onClick={reset}
          style={{
            padding: "11px 20px",
            borderRadius: 12,
            border: "none",
            cursor: "pointer",
            fontWeight: 700,
            background: "#c6f84f",
            color: "#0c0d0c",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
