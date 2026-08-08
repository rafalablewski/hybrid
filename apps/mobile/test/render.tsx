import { render as rtlRender } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { LanguageProvider } from "../lib/i18n";
import { ThemeProvider } from "../lib/theme";
import { TemplateProvider } from "../lib/template";
import { NavScrollProvider } from "../lib/nav-scroll";

/**
 * A screen, rendered under the app's REAL providers.
 *
 * Deliberately the real ones, not fakes: theme, language, template and
 * nav-scroll are our code, they decide what a screen looks like, and a gate
 * that stubs them would be testing a tree the app never renders. Only the
 * NATIVE edge is stubbed (see test/stubs) — the parts no JS runtime can
 * execute.
 *
 * The provider list mirrors app/_layout.tsx. If a screen needs one that isn't
 * here, add it here rather than wrapping at the call site, so every screen test
 * keeps rendering the same app.
 */
export function renderScreen(ui: ReactElement) {
  return rtlRender(ui, { wrapper: Providers });
}

function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <TemplateProvider>
          <NavScrollProvider>{children}</NavScrollProvider>
        </TemplateProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
