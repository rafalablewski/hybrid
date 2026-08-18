import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@hybrid/core";

export const metadata: Metadata = {
  title: `${brand.name} – ${brand.tagline}`,
  description: `${brand.tagline}. ${brand.name} is a mobile app; this site hosts the API and the operator panel.`,
};

// The web client is retired — HYBRID ships on mobile. This page is the whole
// public web surface now: say where the product lives, link the legal pages
// (App Review requires they resolve), and give operators the door to /admin.
// Deliberately a static server component with inline styles, like /privacy and
// /terms — no client kit, nothing to hydrate.

const wrap: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "48px 22px",
  color: "#f7f6f3",
  background: "#0c0d0c",
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  textAlign: "center",
};
const kicker: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 12,
  letterSpacing: ".25em",
  textTransform: "uppercase",
  color: "#c3d363",
};
const quiet: React.CSSProperties = { color: "#8b8f86", fontSize: 14, lineHeight: 1.65 };
const a: React.CSSProperties = { color: "#8b8f86", textDecoration: "underline", textUnderlineOffset: 3 };

export default function LandingPage() {
  return (
    <main style={wrap}>
      <h1 style={{ fontSize: 44, fontWeight: 900, letterSpacing: "-.05em", margin: 0 }}>
        HYBRID<span style={{ color: "#c3d363" }}>.</span>
      </h1>
      <p style={{ ...kicker, marginTop: 10 }}>{brand.tagline}</p>
      <p style={{ ...quiet, maxWidth: 420, marginTop: 28 }}>
        {brand.name} lives on your phone. Training, nutrition, coaching and your
        crew are all in the iPhone app — this site only hosts the machinery
        behind it.
      </p>
      <p style={{ ...quiet, marginTop: 24, display: "flex", gap: 18, flexWrap: "wrap", justifyContent: "center" }}>
        <Link href="/login" style={a}>Operator sign-in</Link>
        <Link href="/privacy" style={a}>Privacy</Link>
        <Link href="/terms" style={a}>Terms</Link>
      </p>
    </main>
  );
}
