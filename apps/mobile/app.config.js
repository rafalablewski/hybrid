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

export default ({ config }) => {
  const build = resolveBuildNumber();
  return {
    ...config,
    ios: { ...config.ios, buildNumber: String(build) },
    android: { ...config.android, versionCode: build },
  };
};
