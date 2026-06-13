import type { Metadata } from "next";
import { brand } from "@hybrid/core";
import { SessionProvider } from "@/lib/session";
import { LanguageProvider } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: `${brand.name} · ${brand.web}`,
  description: brand.tagline,
};

// Render dynamically so the per-request CSP nonce (set in middleware) is applied
// to Next's inline scripts. Static prerendering can't carry a per-request nonce,
// which would make the strict nonce-based script-src block everything. The app
// is auth-gated and data-driven, so it's request-time anyway.
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark">
      <body>
        <LanguageProvider>
          <SessionProvider>{children}</SessionProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
