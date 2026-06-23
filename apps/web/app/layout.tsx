import type { Metadata } from "next";
import { cookies } from "next/headers";
import { brand } from "@hybrid/core";
import { SessionProvider } from "@/lib/session";
import { LanguageProvider } from "@/lib/i18n";
import QueryProvider from "@/components/query-provider";
import TemplateSync from "@/components/template-sync";
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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Read the persisted theme server-side so the correct `data-theme` is in the
  // first paint — no dark→light flash for light-mode users. Mirrors the cookie
  // written by lib/use-theme.ts. (Already force-dynamic for the CSP nonce.)
  const theme = (await cookies()).get("hybrid-theme")?.value === "light" ? "light" : "dark";
  return (
    <html lang="en" data-theme={theme}>
      <body>
        <TemplateSync />
        <QueryProvider>
          <LanguageProvider>
            <SessionProvider>{children}</SessionProvider>
          </LanguageProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
