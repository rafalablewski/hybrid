// Dynamic Expo config. Keeps app.json as the static source of truth for
// everything and ONLY computes the native build number automatically, so every
// TestFlight / Play upload gets a fresh, strictly-increasing version without
// anyone hand-editing app.json. (App Store Connect rejects an upload whose
// CFBundleVersion isn't higher than the last one — that's the 409 this fixes.)
//
// Build-number resolution, in order:
//   1. APP_BUILD_NUMBER — an explicit integer from CI, when you want full
//      control (e.g. set it to ${{ github.run_number }} or $BUILD_NUMBER).
//   2. Automatic: SECONDS since a fixed epoch (2024-01-01 UTC). This always
//      increases as the clock moves, is always far above any number already
//      uploaded, and needs no CI state or git history — so a re-run, a retry,
//      or a brand-new pipeline can never collide with the previous build. The
//      one-second granularity keeps even back-to-back retries distinct.
//
// Note: when EAS Build is used with eas.json `appVersionSource: "remote"`, EAS
// manages versions on its own server and ignores these local fields — that's
// fine; this covers the local-prebuild → app-store-connect path that doesn't.

// 2024-01-01T00:00:00Z, in whole seconds. Frozen — never move this backward, or
// build numbers would regress below ones already uploaded.
const EPOCH_SECONDS = Date.UTC(2024, 0, 1) / 1000;

function resolveBuildNumber() {
  const explicit = process.env.APP_BUILD_NUMBER;
  if (explicit && /^\d+$/.test(explicit)) return Number(explicit);
  // Seconds since the epoch: monotonic, ~78M today, well under the uint32 /
  // Google Play (2.1e9) ceilings for the next century.
  return Math.floor(Date.now() / 1000 - EPOCH_SECONDS);
}

// ── Apple targets (widget + Watch app), strictly opt-in ─────────────────────
// WITH_APPLE_TARGETS=1 at prebuild time adds @bacons/apple-targets (which
// generates the WidgetKit extension and the watchOS app from targets/*) and
// the App Group entitlement the widget's data path needs. Opt-in, not default,
// because each target is its own bundle id + provisioning profile: the plain
// release pipeline must keep working until the portal knows about
// com.hybriddomain.xyz.widget / .watchkitapp and the shared App Group (the
// release workflow's with_targets input does that registration). Without the
// flag, prebuild output is byte-identical to before this existed.
const WITH_APPLE_TARGETS = process.env.WITH_APPLE_TARGETS === "1";
const APP_GROUP = "group.com.hybriddomain.xyz";

export default ({ config }) => {
  const build = resolveBuildNumber();
  return {
    ...config,
    // No appleTeamId on purpose: in CI, codemagic's `xcode-project use-profiles`
    // stamps the team + profile onto every generated target after prebuild.
    plugins: WITH_APPLE_TARGETS
      ? [...(config.plugins ?? []), "@bacons/apple-targets"]
      : config.plugins,
    ios: {
      ...config.ios,
      buildNumber: String(build),
      ...(WITH_APPLE_TARGETS
        ? {
            entitlements: {
              ...(config.ios?.entitlements ?? {}),
              "com.apple.security.application-groups": [APP_GROUP],
            },
          }
        : {}),
    },
    android: { ...config.android, versionCode: build },
  };
};
