/**
 * The HYBRID theme — one self-contained, swappable unit (think WordPress theme).
 *
 * Everything that defines the app's LOOK lives in this folder and is re-exported
 * here, so the rest of the codebase only ever imports from `@hybrid/core`:
 *
 *   tokens.ts     — raw brand tokens: the PANTONE four + font families, the
 *                   ALPHA ladder, SCRIM and STATE_OPACITY (scale: ../scale.ts).
 *   palette.ts    — the dark surface + text palette (ThemePalette, THEMES).
 *   feedback.ts   — success / warning / error / info, the OUTCOME colours.
 *   icons.ts      — the Aurora icon set (AuroraIconName + SVG path data).
 *
 * The per-client RENDERERS (which can't be cross-package code) consume these:
 *   • apps/mobile/components/aurora/* + apps/mobile/lib/theme.tsx   (React Native)
 *   • apps/web/components/aurora/*   + apps/web/app/globals.css      (Next.js)
 *
 * See ./README.md for how to tweak the look or add a new theme/skin.
 */
export * from "./tokens";
export * from "./palette";
export * from "./feedback";
export * from "./icons";
export * from "./sport-marks";
export * from "./mark";
