import Link from "next/link";

// 404 surface for unknown routes. Server component — no client deps.
export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 24,
        background: "#0c0d0c",
        color: "#f7f6f3",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 13, letterSpacing: ".18em", textTransform: "uppercase", color: "#8b8f86" }}>
        404
      </div>
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: "-.02em" }}>
        Page not found
      </h1>
      <p style={{ color: "#8b8f86", maxWidth: 380, margin: 0, lineHeight: 1.5 }}>
        The page you’re looking for doesn’t exist or has moved.
      </p>
      <Link
        href="/"
        style={{
          padding: "11px 20px",
          borderRadius: 12,
          border: "none",
          fontWeight: 700,
          background: "#c3d363",
          color: "#0c0d0c",
          textDecoration: "none",
          marginTop: 6,
        }}
      >
        Home
      </Link>
    </div>
  );
}
