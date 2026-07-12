import { PREMIUM_ACCENT_FLAG, resolvePremiumAccent, type ResolvedPremiumAccent } from "@hybrid/core";
import { useTheme } from "./theme";
import { useFlagValue } from "./flags";

/**
 * The admin-chosen premium accent (fill / accent-text / on-fill ink), resolved
 * for the current theme. Every mobile "buy Full" CTA reads this instead of a
 * hardcoded C.amber, so the admin Flags colour picker recolours them all. Falls
 * back to sand until the flags land.
 */
export function usePremiumAccent(): ResolvedPremiumAccent {
  const { scheme } = useTheme();
  const value = useFlagValue(PREMIUM_ACCENT_FLAG);
  return resolvePremiumAccent(value, scheme);
}
