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
| `tokens.ts`    | `style.css` variables           | Raw brand tokens — colours (lime/ink/chalk/…) and font families. The type & spacing scale lives in `../scale.ts`; radii live with each client kit (web `globals.css` `--r-*`, mobile `kit.tsx` `RADIUS`). |
| `palette.ts`   | colour scheme                   | Light/dark surface + text palettes (`ThemePalette`, `THEMES`, role colours). |
| `icons.ts`     | the theme's icon set            | The Aurora icon set: the `AuroraIconName` union + 72×72 SVG path data. |
| `index.ts`     | `functions.php` (the loader)    | Re-exports all of the above; this is what `@hybrid/core` surfaces.   |

## The per-client renderers

A theme also needs the markup that draws each screen. That part **cannot** be
cross-package code (React Native ≠ Next.js), so it lives with each client, but it
is driven entirely by the tokens/palette above:

- **Mobile (React Native):** `apps/mobile/components/aurora/*` (incl. the native
  SwiftUI / Liquid Glass kit `swiftui.tsx` + `kit.tsx`) and the theme hook
  `apps/mobile/lib/theme.tsx`.
- **Web (Next.js):** `apps/web/components/aurora/*` and the CSS mirror in
  `apps/web/app/globals.css` (`:root`).

## How to…

**Re-tint the brand** → edit `tokens.ts` (e.g. the `lime` accent). Mirror any
palette change into `apps/web/app/globals.css`; `palette.test.ts` guards WCAG
contrast.

**Tweak Aurora's shapes/feel** → the shared primitives in the client kits
(`apps/mobile/components/aurora/kit.tsx`, the web `aurora/*`), which read these
tokens.

**There is no skin switch, and adding one is a real decision.** There used to be
a `templates.ts` here holding a `Classic ⇄ Aurora` registry, a default, a storage
key and a resolver, plus a hook on each client and a per-device preference. The
classic skin was deleted long before this folder was; the registry was kept "so
the clients' template hooks keep a stable shape". What survived was a
`TemplateName` union of **one** value and a `resolveTemplate()` that returned it
whatever you passed — so every `template === "aurora"` in the app was a constant,
and every other arm was code that could not run. Those arms had accumulated: a
second radius vocabulary in the live logger, a second icon set in the admin
console, a `[data-template]` gate on a page of CSS, a `<TemplateSync />` mounted
in the root layout, and two persisted preferences nobody could change.

Aurora is the look. If a second skin is ever genuinely wanted, it arrives with a
second set of renderers and a real switch that a user can move — not with a
registry standing in for one.
