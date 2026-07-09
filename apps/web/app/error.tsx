"use client";

import { useEffect } from "react";

// Route-level error boundary. Catches render/runtime errors in the App Router
// subtree so a thrown exception shows a recoverable surface instead of a blank
// white screen. Self-contained inline styles — never depend on app providers
// (theme/i18n/session) here, since those may be the thing that failed.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the console (and any attached error-reporting) for diagnosis.
    console.error("App error boundary:", error);
  }, [error]);

  return (
    <div
      style={{
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
      <div style={{ fontSize: 13, letterSpacing: ".18em", textTransform: "uppercase", color: "#8b8f86" }}>
        Something went wrong
      </div>
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: "-.02em" }}>
        We hit an unexpected error
      </h1>
      <p style={{ color: "#8b8f86", maxWidth: 420, margin: 0, lineHeight: 1.5 }}>
        The page failed to load. You can retry — if it keeps happening, please let us know.
        {error.digest ? ` (ref: ${error.digest})` : ""}
      </p>
      <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
        <button
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
        <a
          href="/app"
          style={{
            padding: "11px 20px",
            borderRadius: 12,
            border: "1px solid #2a2d2a",
            cursor: "pointer",
            fontWeight: 600,
            color: "#f3f4ef",
            textDecoration: "none",
          }}
        >
          Back to app
        </a>
      </div>
    </div>
  );
}
