"use client";

import { useEffect } from "react";
import { PREMIUM_ACCENT_FLAG, normalizePremiumAccent, isHexColor, resolvePremiumAccent } from "@hybrid/core";
import { useFlags } from "@/lib/use-flags";

/**
 * Restamps the --premium-accent* CSS variables on <html> from the admin-chosen
 * `theme.premiumAccent` flag, so every "buy Full" CTA recolours live without a
 * redeploy. Presets point --premium-accent-text at the theme-aware `--<key>-text`
 * var (so it still flips light/dark); a custom hex is used verbatim. Renders
 * nothing. Falls back to the sand defaults baked into globals.css.
 */
export default function PremiumAccentStyle() {
  const { value } = useFlags();
  const raw = normalizePremiumAccent(value(PREMIUM_ACCENT_FLAG));

  useEffect(() => {
    const root = document.documentElement.style;
    const ink = resolvePremiumAccent(raw).ink;
    if (isHexColor(raw)) {
      root.setProperty("--premium-accent", raw);
      root.setProperty("--premium-accent-text", raw);
    } else {
      root.setProperty("--premium-accent", `var(--color-${raw})`);
      root.setProperty("--premium-accent-text", `var(--${raw}-text)`);
    }
    root.setProperty("--premium-accent-ink", ink);
  }, [raw]);

  return null;
}
