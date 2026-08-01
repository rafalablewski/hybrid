/** @type {import('@bacons/apple-targets').Config} */
// The HYBRID home-screen + lock-screen widget. Generated as a real Xcode
// target by @bacons/apple-targets during `expo prebuild` — ONLY when
// WITH_APPLE_TARGETS=1 (see app.config.js), so the plain release pipeline is
// untouched until the extra bundle ids + App Group exist in the portal.
module.exports = {
  type: "widget",
  name: "HYBRIDWidget",
  bundleIdentifier: "com.hybriddomain.xyz.widget",
  deploymentTarget: "17.0",
  colors: {
    $accent: "#c6f84f",
    $widgetBackground: "#0c0d0c",
  },
  entitlements: {
    "com.apple.security.application-groups": ["group.com.hybriddomain.xyz"],
  },
};
