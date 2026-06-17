/**
 * Provider-agnostic analytics shim (mobile). Mirror of apps/web/lib/track.ts so
 * both clients instrument the same funnel through the same call shape. No
 * provider is wired yet (see the `funnel-analytics` capability — BLOCKED on a
 * provider + key); safe no-op until then, dev-logging for local inspection.
 */
type Props = Record<string, string | number | boolean | undefined>;

declare const __DEV__: boolean;

export function track(name: string, props: Props = {}): void {
  try {
    const g = globalThis as unknown as { hybridAnalytics?: (n: string, p: Props) => void };
    if (typeof g.hybridAnalytics === "function") {
      g.hybridAnalytics(name, props);
      return;
    }
    if (typeof __DEV__ !== "undefined" && __DEV__) console.debug("[track]", name, props);
  } catch {
    /* analytics must never break the app */
  }
}
