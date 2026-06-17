"use client";

/**
 * Provider-agnostic analytics shim. Call `track(FUNNEL.x, props)` at the
 * funnel call-sites; this layer forwards to whatever provider is wired up.
 *
 * No provider is configured yet (see the `funnel-analytics` capability — it's
 * BLOCKED on choosing PostHog/Segment/etc. + a key), so this is a safe no-op
 * that never throws and, in dev, logs to the console. When a provider lands,
 * wire it in ONE place here and every call-site is instrumented for free.
 */
type Props = Record<string, string | number | boolean | undefined>;

export function track(name: string, props: Props = {}): void {
  try {
    const w = globalThis as unknown as { hybridAnalytics?: (n: string, p: Props) => void };
    if (typeof w.hybridAnalytics === "function") {
      w.hybridAnalytics(name, props);
      return;
    }
    if (process.env.NODE_ENV !== "production") console.debug("[track]", name, props);
  } catch {
    /* analytics must never break the app */
  }
}
