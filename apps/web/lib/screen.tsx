"use client";

import { createContext, useContext } from "react";
import { isDetour } from "@hybrid/core";

/**
 * WHICH SCREEN THE SHELL IS SHOWING, published to everything under it.
 *
 * The web app-shell holds its whole location in one piece of state and swaps a
 * screen component into a single wrapper, so a component deep inside a screen
 * has no way to ask which screen it is in. Almost nothing needs to — except the
 * hero's nav button, which has to know whether the screen was PUSHED (it pops)
 * or PRESENTED as a detour (it dismisses).
 *
 * A context rather than reading the URL: the shell writes `?s=` AFTER the
 * transition commits, so the first render of the arriving screen would still
 * read the departing one's id — a nav button that shows the wrong glyph for one
 * frame on every navigation into a detour.
 *
 * The mobile twin is `usePresented()` in components/aurora/hero.tsx, reading
 * expo-router's pathname against the same shared list.
 */
const ScreenCtx = createContext<string>("");

export const ScreenProvider = ScreenCtx.Provider;

/** The shell's current screen id, or "" outside the shell. */
export function useScreen(): string {
  return useContext(ScreenCtx);
}

/** Did the current screen arrive as a presented DETOUR (@hybrid/core
 *  `MODAL_SCREENS`) rather than as a drill-down? */
export function usePresented(): boolean {
  return isDetour(useContext(ScreenCtx));
}
