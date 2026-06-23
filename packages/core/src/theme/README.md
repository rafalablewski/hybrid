# HYBRID theme

This folder is the **single, self-contained home for the app's look** — think of
it like a WordPress theme: one place to change the design, and a defined way to
swap or add a whole new look. Everything here is plain, framework-free TypeScript
in `@hybrid/core`, so **both clients (web + mobile) consume the exact same source
of truth** and can never drift.

> Import rule: the rest of the codebase imports theme values from `@hybrid/core`
> (the package barrel). It should **not** reach into these files by path.

## What's in here

| File           | Role (WordPress analogy)        | Holds                                                                 |
| -------------- | ------------------------------- | -------------------------------------------------------------------- |
| `tokens.ts`    | `style.css` variables           | Raw brand tokens — colours (lime/ink/chalk/…), fonts, radii, the type & spacing scale. |
| `palette.ts`   | colour scheme                   | Light/dark surface + text palettes (`ThemePalette`, `THEMES`, role colours). |
| `templates.ts` | the active theme switch         | The **skin registry** — `Classic ⇄ Aurora`, the default skin, and the storage key both clients persist the choice under. |
| `icons.ts`     | the theme's icon set            | The Aurora icon set: the `AuroraIconName` union + 72×72 SVG path data. |
| `index.ts`     | `functions.php` (the loader)    | Re-exports all of the above; this is what `@hybrid/core` surfaces.   |

## The per-client renderers

A theme also needs the markup that draws each screen. That part **cannot** be
cross-package code (React Native ≠ Next.js), so it lives with each client, but it
is driven entirely by the tokens/palette/templates above:

- **Mobile (React Native):** `apps/mobile/components/aurora/*` (incl. the native
  SwiftUI / Liquid Glass kit `swiftui.tsx` + `kit.tsx`) and the theme hook
  `apps/mobile/lib/theme.tsx`.
- **Web (Next.js):** `apps/web/components/aurora/*` and the CSS mirror in
  `apps/web/app/globals.css` (`:root` defaults + `[data-template="aurora"]`).

## How to…

**Re-tint the brand** → edit `tokens.ts` (e.g. the `lime` accent). Mirror any
palette change into `apps/web/app/globals.css`; `palette.test.ts` guards WCAG
contrast.

**Tweak Aurora's shapes/feel** → the shared primitives in the client kits
(`apps/mobile/components/aurora/kit.tsx`, the web `aurora/*`), which read these
tokens.

**Add a brand-new skin** (e.g. a third theme alongside Classic/Aurora) →
1. add the name to `TemplateName` + an entry in `TEMPLATES` in `templates.ts`;
2. point `DEFAULT_TEMPLATE` if it should be the default;
3. add the client renderers under each app's `components/<skin>/` and branch on
   the active template the same way the Aurora screens do.

Skin selection is a per-device preference (mobile `AsyncStorage`, web
`localStorage`) keyed off the shared `TEMPLATE_STORAGE_KEY`, switchable from
Settings on both clients — so swapping the look is one tap, no rebuild.
