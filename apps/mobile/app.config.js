// Dynamic Expo config. app.json is the static source of truth for everything;
// this file adds only what has to be computed.
//
// THE BUILD NUMBER IS NO LONGER ONE OF THOSE THINGS, and the reason is the whole
// point of this comment.
//
// It used to be derived from the clock: seconds since 2024-01-01, so every upload
// got a strictly-higher CFBundleVersion with no CI state and no hand-editing
// (App Store Connect 409s an upload whose build number isn't higher than the
// last, which was a real and repeated failure). Correct about the 409, and it
// made over-the-air updates undeliverable by construction.
//
// `app.json` sets `runtimeVersion: { policy: "fingerprint" }`. The fingerprint
// hashes the evaluated Expo config, INCLUDING these version fields — so a value
// derived from Date.now() gave the project a different runtime version every
// second:
//
//   run 1: 328037069ea246638f53d612d1b504dfebe22a0d
//   run 2: be4d94800a1076b3ed075032281dc3c2f9259835   (same commit, 2s later)
//
// A binary is stamped with the fingerprint computed when it was built, and it
// accepts only updates published under that same runtime version. So an
// `eas update` published from this config was tagged with a fingerprint no
// installed build had ever had: it would publish successfully, report success,
// and reach no phone at all.
//
// Whether that has already cost a shipped fix is unknown — publishing needs Expo
// auth, which the `eas-update` capability records as never set up, so it is
// likely nobody had reached the failure yet. That does not make it less of a bug:
// it is a trap armed to spring the first time somebody relies on OTA, and it
// fails by reporting success, which is the worst way for a release path to fail.
//
// So the clock is out of the config, and the increasing number comes from the
// place that actually needs it, AFTER the fingerprint has been computed:
//
//   • iOS release (.github/workflows/mobile-release.yml) — `agvtool new-version`
//     stamps CFBundleVersion with seconds-since-2024 in its own step, which runs
//     after `expo prebuild`. That step was ALREADY doing this; the config's copy
//     was redundant on this path and only ever poisoned the fingerprint. The 409
//     protection is untouched.
//   • EAS Build — eas.json sets `appVersionSource: "remote"` with `autoIncrement`
//     on the production profile, so EAS assigns versions server-side and ignores
//     local fields entirely.
//   • Android has no release pipeline yet. versionCode comes from app.json (or
//     Expo's default). WHEN ONE IS ADDED it must stamp the number in the
//     pipeline, the same way the iOS one does — putting it back here would put
//     the clock back in the fingerprint and break OTA again.
//
// APP_BUILD_NUMBER still overrides both, for a pipeline that wants explicit
// control (e.g. ${{ github.run_number }}). It is deterministic within a run, so
// it is safe for the fingerprint — a fixed integer hashes the same every time it
// is evaluated. Anything derived from the current time is not, and must not go
// here. lib/build-number.test.ts fails if the config stops being stable.

/** An explicit build number from CI, or null to leave app.json's alone.
 *  MUST NOT depend on the clock — see the note above. */
function explicitBuildNumber() {
  const explicit = process.env.APP_BUILD_NUMBER;
  return explicit && /^\d+$/.test(explicit) ? Number(explicit) : null;
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
  const build = explicitBuildNumber();
  return {
    ...config,
    // No appleTeamId on purpose: in CI, codemagic's `xcode-project use-profiles`
    // stamps the team + profile onto every generated target after prebuild.
    plugins: WITH_APPLE_TARGETS
      ? [...(config.plugins ?? []), "@bacons/apple-targets"]
      : config.plugins,
    ios: {
      ...config.ios,
      ...(build != null ? { buildNumber: String(build) } : {}),
      ...(WITH_APPLE_TARGETS
        ? {
            entitlements: {
              ...(config.ios?.entitlements ?? {}),
              "com.apple.security.application-groups": [APP_GROUP],
            },
          }
        : {}),
    },
    android: {
      ...config.android,
      ...(build != null ? { versionCode: build } : {}),
    },
  };
};
