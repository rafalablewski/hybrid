import { render as rtlRender } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { LanguageProvider } from "../lib/i18n";
import { ThemeProvider } from "../lib/theme";
import { SessionProvider } from "../lib/session";
import { NavScrollProvider } from "../lib/nav-scroll";
import { ConfirmProvider } from "../components/aurora/confirm";
import QueryProvider from "../lib/query";

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
    // Outermost, exactly as app/_layout.tsx has it: anything that reads a
    // query (the exercise catalog behind the drawer's search index) needs a
    // client, and a screen that fetches is a screen this gate should still be
    // able to mount.
    <QueryProvider>
    <ThemeProvider>
      {/* Nested exactly as app/_layout.tsx nests them — Language inside
          Session — because a screen that reads two of these reads them in that
          order. Anything a signed-out visitor sees is what it reports here:
          there is no session in the gate, which is the state the funnel screens
          are written for. */}
      <SessionProvider>
        <LanguageProvider>
          {/* Inside Language exactly as app/_layout.tsx has it, so the sheet's
              buttons localize — and OUTSIDE the screen, because any row that
              destroys something calls `useConfirm` unconditionally and the
              hook throws without this. */}
          <ConfirmProvider>
            <NavScrollProvider>{children}</NavScrollProvider>
          </ConfirmProvider>
        </LanguageProvider>
      </SessionProvider>
    </ThemeProvider>
    </QueryProvider>
  );
}
